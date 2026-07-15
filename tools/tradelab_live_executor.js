// ============================================================
// TradeLab — Live Executor (OKX)
// ============================================================
// Этот модуль выполняет реальные сделки на OKX.
// Он НЕ запускается автоматически — только через ручной вызов
// после проверки real-money gate.
// ============================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const ccxt = require('ccxt');

// Загружаем .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { evaluateGate } = require('./tradelab_real_money_gate');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');
const { fetchCandles, getSignal, simulate, describe } = require('./tradelab_run_once');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const TRADES_PATH = path.join(ROOT, 'tradelab-live-trades.json');
const DAILY_PNL_PATH = path.join(ROOT, 'tradelab-daily-pnl.json');

// ============================================================
// Конфигурация
// ============================================================

const CONFIG = {
  // Максимальный размер позиции в USD
  maxPositionSizeUsd: Number(process.env.MAX_POSITION_SIZE_USD) || 100,
  // Максимальный дневной убыток в USD
  maxDailyLossUsd: Number(process.env.MAX_DAILY_LOSS_USD) || 50,
  // Режим торговли: 'spot' или 'futures'
  tradingMode: process.env.OKX_TRADING_MODE || 'futures',
  // Минимальный объём сделки в USD (OKX комиссии)
  minTradeUsd: 10,
  // Таймаут для OKX API (мс)
  apiTimeout: 15000,
  // Количество попыток при ошибке API
  apiRetries: 3
};

// ============================================================
// Инициализация OKX клиента
// ============================================================

let okxClient = null;

function getOkxClient() {
  if (okxClient) return okxClient;

  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;

  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error(
      'OKX API keys not configured!\n' +
      '1. Edit .env file with your OKX API credentials\n' +
      '2. Create API key at https://www.okx.com/account/my-api\n' +
      '3. Enable "Trade" permission'
    );
  }

  okxClient = new ccxt.okx({
    apiKey,
    secret: secretKey,
    password: passphrase,
    // Используем демо-режим, если ключи не настроены
    // В продакшене убрать demo: true
    // demo: true
  });

  return okxClient;
}

// ============================================================
// Логирование сделок
// ============================================================

function loadTrades() {
  if (!fs.existsSync(TRADES_PATH)) return [];
  return JSON.parse(fs.readFileSync(TRADES_PATH, 'utf8'));
}

function saveTrades(trades) {
  fs.writeFileSync(TRADES_PATH, JSON.stringify(trades, null, 2) + '\n');
}

function loadDailyPnl() {
  if (!fs.existsSync(DAILY_PNL_PATH)) return { date: new Date().toISOString().slice(0, 10), pnl: 0, trades: 0 };
  return JSON.parse(fs.readFileSync(DAILY_PNL_PATH, 'utf8'));
}

function saveDailyPnl(data) {
  fs.writeFileSync(DAILY_PNL_PATH, JSON.stringify(data, null, 2) + '\n');
}

function logTrade(trade) {
  const trades = loadTrades();
  trades.push({
    ...trade,
    timestamp: new Date().toISOString()
  });
  saveTrades(trades);

  // Обновляем дневной PnL
  const today = new Date().toISOString().slice(0, 10);
  const daily = loadDailyPnl();
  if (daily.date !== today) {
    daily.date = today;
    daily.pnl = 0;
    daily.trades = 0;
  }
  daily.pnl += trade.pnl || 0;
  daily.trades += 1;
  saveDailyPnl(daily);
}

// ============================================================
// Проверка дневного лимита убытков
// ============================================================

function checkDailyLossLimit() {
  const today = new Date().toISOString().slice(0, 10);
  const daily = loadDailyPnl();
  
  if (daily.date === today && daily.pnl <= -CONFIG.maxDailyLossUsd) {
    return {
      allowed: false,
      reason: `Daily loss limit reached: ${daily.pnl.toFixed(2)}$ (limit: -${CONFIG.maxDailyLossUsd}$)`
    };
  }
  
  return { allowed: true };
}

// ============================================================
// Проверка gate перед реальной сделкой
// ============================================================

function checkGate(candidateKey) {
  // 1. Kill-switch
  const killSwitch = portfolioKillSwitch();
  if (killSwitch.blocksRealMoney) {
    return {
      allowed: false,
      reason: `Kill-switch active: ${killSwitch.soft.reasons.join('; ')}`
    };
  }

  // 2. Gate evaluation
  const gate = evaluateGate();
  if (gate.gate !== 'MANUAL_REVIEW_ALLOWED') {
    return {
      allowed: false,
      reason: `Gate BLOCKED: ${gate.nextAction}`
    };
  }

  // 3. Проверяем, что конкретный кандидат разрешён
  const candidate = gate.candidates.find(c => c.key === candidateKey);
  if (!candidate) {
    return {
      allowed: false,
      reason: `Candidate ${candidateKey} not found in gate evaluation`
    };
  }

  if (candidate.decision !== 'manual-review-allowed') {
    return {
      allowed: false,
      reason: `Candidate ${candidateKey} blocked: ${candidate.blockers.join('; ')}`
    };
  }

  // 4. Дневной лимит убытков
  const dailyCheck = checkDailyLossLimit();
  if (!dailyCheck.allowed) {
    return dailyCheck;
  }

  return { allowed: true };
}

// ============================================================
// Получение сигнала для кандидата
// ============================================================

async function getLiveSignal(candidate) {
  const candles = await fetchCandles(candidate.symbol, candidate.interval, candidate.limit || 1000);
  const params = { ...candidate.params };
  const signal = getSignal(candles, candles.length, params);
  
  return {
    signal,
    candles,
    params,
    lastCandle: candles[candles.length - 1],
    price: candles[candles.length - 1].close
  };
}

// ============================================================
// Исполнение сделки на OKX
// ============================================================

async function placeOkxOrder(symbol, side, size, price = null) {
  const client = getOkxClient();
  
  // Конвертируем символ в формат OKX (BTCUSDT -> BTC-USDT)
  const okxSymbol = symbol.replace('USDT', '-USDT');
  
  // Определяем сторону
  const orderSide = side === 'LONG' ? 'buy' : 'sell';
  
  // Определяем тип ордера
  const orderType = price ? 'limit' : 'market';
  
  // Параметры ордера
  const orderParams = {
    instId: okxSymbol,
    tdMode: CONFIG.tradingMode === 'futures' ? 'cross' : 'cash',
    side: orderSide,
    ordType: orderType,
    sz: String(size)
  };
  
  if (price) {
    orderParams.px = String(price);
  }

  console.log(`[OKX] Placing order: ${JSON.stringify(orderParams)}`);
  
  try {
    const result = await client.placeOrder(orderParams);
    console.log(`[OKX] Order result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error(`[OKX] Order failed: ${error.message}`);
    throw error;
  }
}

// ============================================================
// Расчёт размера позиции
// ============================================================

function calculatePositionSize(price, balance, params) {
  const riskUsd = Math.min(
    balance * (params.riskPct / 100),
    CONFIG.maxPositionSizeUsd
  );
  
  // Для фьючерсов: количество контрактов
  const size = riskUsd / price;
  
  // Округляем до разумного минимума
  const roundedSize = Math.max(0.001, Math.round(size * 1000) / 1000);
  
  return roundedSize;
}

// ============================================================
// Основная функция: выполнить сделку для кандидата
// ============================================================

async function executeTrade(candidateKey) {
  console.log(`\n========================================`);
  console.log(`[LiveExecutor] Executing trade for: ${candidateKey}`);
  console.log(`========================================\n`);

  // 1. Проверяем gate
  const gateCheck = checkGate(candidateKey);
  if (!gateCheck.allowed) {
    console.log(`[LiveExecutor] ❌ Gate blocked: ${gateCheck.reason}`);
    return { success: false, reason: gateCheck.reason };
  }

  // 2. Загружаем состояние кандидата
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const candidate = state.candidates[candidateKey];
  if (!candidate) {
    console.log(`[LiveExecutor] ❌ Candidate not found: ${candidateKey}`);
    return { success: false, reason: 'Candidate not found' };
  }

  // 3. Получаем текущий сигнал
  let liveData;
  try {
    liveData = await getLiveSignal(candidate);
  } catch (error) {
    console.log(`[LiveExecutor] ❌ Failed to get signal: ${error.message}`);
    return { success: false, reason: `Signal error: ${error.message}` };
  }

  const { signal, price, params } = liveData;
  
  if (signal.action === 'WAIT') {
    console.log(`[LiveExecutor] ⏸️ No signal (WAIT). Price: ${price}`);
    return { success: false, reason: 'No signal (WAIT)' };
  }

  // 4. Определяем сторону сделки
  const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
  console.log(`[LiveExecutor] 📊 Signal: ${signal.action} -> ${side} at ${price}`);

  // 5. Расчёт размера позиции
  const balance = CONFIG.maxPositionSizeUsd * 10; // Условный баланс
  const size = calculatePositionSize(price, balance, params);
  
  if (size * price < CONFIG.minTradeUsd) {
    console.log(`[LiveExecutor] ❌ Trade too small: ${(size * price).toFixed(2)}$ < ${CONFIG.minTradeUsd}$`);
    return { success: false, reason: 'Trade too small' };
  }

  // 6. Исполняем ордер на OKX
  let orderResult;
  try {
    orderResult = await placeOkxOrder(candidate.symbol, side, size);
  } catch (error) {
    console.log(`[LiveExecutor] ❌ Order failed: ${error.message}`);
    return { success: false, reason: `Order failed: ${error.message}` };
  }

  // 7. Логируем сделку
  const trade = {
    key: candidateKey,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    side,
    entryPrice: price,
    size,
    valueUsd: price * size,
    params: describe(params),
    signal: signal.action,
    orderId: orderResult?.data?.[0]?.ordId || 'unknown',
    pnl: 0, // Будет обновлено при закрытии
    status: 'open',
    openedAt: new Date().toISOString()
  };
  
  logTrade(trade);
  
  console.log(`\n[LiveExecutor] ✅ Trade executed successfully!`);
  console.log(`   Symbol: ${candidate.symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Size: ${size}`);
  console.log(`   Entry: ${price}`);
  console.log(`   Value: ${(price * size).toFixed(2)}$`);
  console.log(`   Order ID: ${trade.orderId}\n`);

  return {
    success: true,
    trade,
    orderResult
  };
}

// ============================================================
// Закрытие позиции
// ============================================================

async function closePosition(symbol, side, size) {
  const client = getOkxClient();
  const okxSymbol = symbol.replace('USDT', '-USDT');
  const closeSide = side === 'LONG' ? 'sell' : 'buy';
  
  const orderParams = {
    instId: okxSymbol,
    tdMode: CONFIG.tradingMode === 'futures' ? 'cross' : 'cash',
    side: closeSide,
    ordType: 'market',
    sz: String(size),
    reduceOnly: true
  };

  console.log(`[OKX] Closing position: ${JSON.stringify(orderParams)}`);
  
  try {
    const result = await client.placeOrder(orderParams);
    console.log(`[OKX] Close result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error(`[OKX] Close failed: ${error.message}`);
    throw error;
  }
}

// ============================================================
// CLI entry point
// ============================================================

async function main() {
  const candidateKey = process.argv[2];
  
  if (!candidateKey) {
    console.log('Usage: node tools/tradelab_live_executor.js <candidate-key>');
    console.log('');
    console.log('Examples:');
    console.log('  node tools/tradelab_live_executor.js "BTCUSDT:4h:breakout"');
    console.log('  node tools/tradelab_live_executor.js "ETHUSDT:4h:breakout"');
    console.log('');
    console.log('Available candidates from gate:');
    
    try {
      const gate = evaluateGate();
      if (gate.gate === 'MANUAL_REVIEW_ALLOWED') {
        console.log('  Gate: MANUAL_REVIEW_ALLOWED ✅');
        for (const c of gate.allowed) {
          console.log(`  - ${c.key} (PnL: ${c.metrics.forwardPaperPnl}$, PF: ${c.metrics.profitFactor})`);
        }
      } else {
        console.log(`  Gate: ${gate.gate} ❌`);
        console.log(`  Reason: ${gate.nextAction}`);
      }
    } catch (e) {
      console.log(`  Error reading gate: ${e.message}`);
    }
    
    return;
  }

  const result = await executeTrade(candidateKey);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  executeTrade,
  checkGate,
  getLiveSignal,
  loadTrades,
  loadDailyPnl
};
