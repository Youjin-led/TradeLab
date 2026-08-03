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
const { fetchCandles, getSignal, simulate, describe, applyDynamicParams, DEFAULT_PARAMS } = require('./tradelab_run_once');

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
    // Демо-режим OKX: включить через OKX_DEMO=true в .env
    demo: String(process.env.OKX_DEMO || 'false').toLowerCase() === 'true'
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

function parseParamsDescription(description) {
  const params = { ...DEFAULT_PARAMS };

  if (description.startsWith('SMA')) {
    const match = description.match(/SMA (\d+)\/(\d+), RSI (\d+)/);
    if (match) {
      params.fast = Number(match[1]);
      params.slow = Number(match[2]);
      params.rsiBuy = Number(match[3]);
      params.strategy = 'sma-rsi';
    }
  } else if (description.startsWith('Breakout')) {
    const match = description.match(/Breakout LB (\d+)/);
    if (match) {
      params.lookback = Number(match[1]);
      params.strategy = 'breakout';
    }
  } else if (description.startsWith('Mean Reversion')) {
    const match = description.match(/Mean Reversion LB (\d+), dev ([\d.]+)%/);
    if (match) {
      params.lookback = Number(match[1]);
      params.deviationPct = Number(match[2]);
      params.strategy = 'mean-reversion';
    }
  }

  const slMatch = description.match(/SL ([\d.]+)%/);
  const tpMatch = description.match(/TP ([\d.]+)%/);
  if (slMatch) params.stopPct = Number(slMatch[1]);
  if (tpMatch) params.takePct = Number(tpMatch[1]);

  return params;
}

function candidateBaseParams(candidate) {
  const raw = candidate && candidate.rawParams;
  if (raw && typeof raw === 'object' && raw.strategy) {
    return { ...DEFAULT_PARAMS, ...raw };
  }
  if (candidate && typeof candidate.params === 'string') {
    return parseParamsDescription(candidate.params);
  }
  return { ...DEFAULT_PARAMS, strategy: candidate ? candidate.strategy : 'sma-rsi' };
}

async function getLiveSignal(candidate) {
  const candles = await fetchCandles(candidate.symbol, candidate.interval, candidate.limit || 1000);
  const baseParams = candidateBaseParams(candidate);
  const effectiveParams = applyDynamicParams(candles, baseParams);
  const closedBar = candles[candles.length - 2] || candles[candles.length - 1];
  const signal = getSignal(candles, candles.length - 1, effectiveParams);

  return {
    signal,
    candles,
    params: effectiveParams,
    barTime: closedBar ? closedBar.time : null,
    price: closedBar ? closedBar.close : null,
    lastCandle: candles[candles.length - 1]
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

  // 3. Получаем текущий сигнал (по закрытым свечам, как в бумаге)
  let liveData;
  try {
    liveData = await getLiveSignal(candidate);
  } catch (error) {
    console.log(`[LiveExecutor] ❌ Failed to get signal: ${error.message}`);
    return { success: false, reason: `Signal error: ${error.message}` };
  }

  const { signal, price, params, barTime } = liveData;
  
  if (signal.action === 'WAIT') {
    console.log(`[LiveExecutor] ⏸️ No signal (WAIT). Price: ${price}`);
    return { success: false, reason: 'No signal (WAIT)' };
  }

  // 4. Определяем сторону сделки
  const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
  console.log(`[LiveExecutor] 📊 Signal: ${signal.action} -> ${side} at ${price}`);

  if (CONFIG.tradingMode === 'spot' && side === 'SHORT') {
    console.log(`[LiveExecutor] ❌ SHORT is not allowed in spot mode`);
    return { success: false, reason: 'SHORT not allowed in spot mode' };
  }

  // 5. Не открываем вторую позицию по тому же кандидату и той же свече
  const existingTrades = loadTrades();
  const openPosition = existingTrades.some((t) => t.key === candidateKey && t.status === 'open');
  if (openPosition) {
    console.log(`[LiveExecutor] ⏸️ Position already open for ${candidateKey}`);
    return { success: false, reason: 'Position already open' };
  }
  const actedOnBar = existingTrades.some((t) => t.key === candidateKey && t.entryBar === barTime);
  if (actedOnBar) {
    console.log(`[LiveExecutor] ⏸️ Already acted on candle ${barTime} for ${candidateKey}`);
    return { success: false, reason: `Already acted on candle ${barTime}` };
  }

  // 6. Расчёт размера позиции по реальному балансу счёта
  const account = await getAccountBalance();
  const balance = account ? account.free : CONFIG.maxPositionSizeUsd * 10;
  if (!account) {
    console.log(`[LiveExecutor] ⚠️ Balance unavailable, using fallback size cap`);
  }
  const size = calculatePositionSize(price, balance, params);
  
  if (size * price < CONFIG.minTradeUsd) {
    console.log(`[LiveExecutor] ❌ Trade too small: ${(size * price).toFixed(2)}$ < ${CONFIG.minTradeUsd}$`);
    return { success: false, reason: 'Trade too small' };
  }

  // 7. Исполняем ордер на OKX
  let orderResult;
  try {
    orderResult = await placeOkxOrder(candidate.symbol, side, size);
  } catch (error) {
    console.log(`[LiveExecutor] ❌ Order failed: ${error.message}`);
    return { success: false, reason: `Order failed: ${error.message}` };
  }

  // 8. Логируем сделку с уровнями стоп/тейк для автозакрытия
  const levels = positionLevels(side, price, params);
  const trade = {
    key: candidateKey,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    side,
    entryPrice: price,
    entryBar: barTime,
    stopPrice: Number(levels.stop.toFixed(6)),
    takePrice: Number(levels.take.toFixed(6)),
    size,
    valueUsd: price * size,
    params: { ...params },
    candlesLimit: candidate.limit || 100,
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
// Реальный баланс счёта
// ============================================================

async function getAccountBalance() {
  const client = getOkxClient();
  try {
    let balance;
    if (CONFIG.tradingMode === 'futures') {
      try {
        balance = await client.fetchBalance({ type: 'swap' });
      } catch (err) {
        balance = await client.fetchBalance();
      }
    } else {
      balance = await client.fetchBalance();
    }
    const total = balance && balance.total ? Number(balance.total['USDT'] || 0) : 0;
    const free = balance && balance.free ? Number(balance.free['USDT'] || 0) : 0;
    if (total > 0) return { total, free };
    return null;
  } catch (error) {
    console.error(`[OKX] Balance fetch failed: ${error.message}`);
    return null;
  }
}

// ============================================================
// Уровни стоп/тейк и расчёт PnL закрытой сделки
// ============================================================

function positionLevels(side, entry, params) {
  if (side === 'LONG') {
    return { stop: entry * (1 - params.stopPct / 100), take: entry * (1 + params.takePct / 100) };
  }
  return { stop: entry * (1 + params.stopPct / 100), take: entry * (1 - params.takePct / 100) };
}

function computeTradePnl(trade, exitPrice) {
  const entry = trade.entryPrice;
  const qty = trade.size;
  const feePct = (trade.params && trade.params.feePct) || 0.06;
  const gross = trade.side === 'LONG' ? (exitPrice - entry) * qty : (entry - exitPrice) * qty;
  const fees = (entry * qty + exitPrice * qty) * (feePct / 100);
  return gross - fees;
}

function exitReasonForLive(trade, signalAction, marketPrice) {
  if (!marketPrice) return '';
  if (trade.side === 'LONG') {
    if (marketPrice <= trade.stopPrice) return { reason: 'stop', price: marketPrice };
    if (marketPrice >= trade.takePrice) return { reason: 'take', price: marketPrice };
    if (signalAction === 'SELL') return { reason: 'signal', price: marketPrice };
  } else {
    if (marketPrice >= trade.stopPrice) return { reason: 'stop', price: marketPrice };
    if (marketPrice <= trade.takePrice) return { reason: 'take', price: marketPrice };
    if (signalAction === 'BUY') return { reason: 'signal', price: marketPrice };
  }
  return '';
}

async function fetchMarketPrice(symbol) {
  const client = getOkxClient();
  try {
    const ticker = await client.fetchTicker(symbol.replace('USDT', '/USDT'));
    if (ticker && ticker.last) return Number(ticker.last);
  } catch (error) {
    console.error(`[OKX] Ticker fetch failed for ${symbol}: ${error.message}`);
  }
  return null;
}

// ============================================================
// Мониторинг открытых позиций: автозакрытие по стоп/тейк/сигналу
// ============================================================

async function monitorOpenPositions() {
  const trades = loadTrades();
  const open = trades.filter((t) => t.status === 'open');
  const results = [];
  const closedNow = [];

  for (const trade of open) {
    try {
      const candles = await fetchCandles(trade.symbol, trade.interval, trade.candlesLimit || 100);
      const effectiveParams = applyDynamicParams(candles, { ...(trade.params || {}) });
      const signal = getSignal(candles, candles.length - 1, effectiveParams);
      const lastClosed = candles[candles.length - 2] || candles[candles.length - 1];
      const marketPrice = await fetchMarketPrice(trade.symbol) || lastClosed.close;
      const exit = exitReasonForLive(trade, signal.action, marketPrice);

      if (exit) {
        await closePosition(trade.symbol, trade.side, trade.size);
        const pnl = computeTradePnl(trade, exit.price);
        trade.status = 'closed';
        trade.exitPrice = Number(exit.price.toFixed(6));
        trade.exitReason = exit.reason;
        trade.pnl = Number(pnl.toFixed(2));
        trade.closedAt = new Date().toISOString();

        const today = new Date().toISOString().slice(0, 10);
        const daily = loadDailyPnl();
        if (daily.date !== today) {
          daily.date = today;
          daily.pnl = 0;
          daily.trades = 0;
        }
        daily.pnl += trade.pnl;
        saveDailyPnl(daily);

        closedNow.push(trade);
        results.push({
          key: trade.key,
          symbol: trade.symbol,
          action: 'close',
          side: trade.side,
          exitPrice: trade.exitPrice,
          reason: exit.reason,
          pnl: trade.pnl
        });
        console.log(`[LiveExecutor] Closed ${trade.key} ${trade.side}: ${exit.reason} @ ${trade.exitPrice}, PnL ${trade.pnl}`);
      } else {
        results.push({ key: trade.key, symbol: trade.symbol, action: 'hold', price: marketPrice });
      }
    } catch (error) {
      console.error(`[LiveExecutor] Exit check failed for ${trade.key}: ${error.message}`);
      results.push({ key: trade.key, symbol: trade.symbol, action: 'error', error: error.message });
    }
  }

  if (closedNow.length) saveTrades(trades);
  return { checked: open.length, closed: closedNow.length, results };
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
  getAccountBalance,
  monitorOpenPositions,
  loadTrades,
  loadDailyPnl
};
