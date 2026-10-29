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
const { sizeSwapPosition } = require('./tradelab_contract_sizing');
const { confirmedFill, entryAccounting } = require('./tradelab_order_fill');
const { liveParamsForCandles } = require('./tradelab_live_params');
const { matchClosedFills } = require('./tradelab_fill_match');

// Загружаем .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { evaluateGate } = require('./tradelab_real_money_gate');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');
const { fetchCandles, getSignal, simulate, describe, applyDynamicParams, DEFAULT_PARAMS, timeFilter, confirmHigherTimeframe, shortEntryVolumeConfirmed, isStrategySuitable } = require('./tradelab_run_once');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');

// Режим paper: торговля виртуальными деньгами (без API-ключей OKX).
// В этом режиме весь live-путь исполняется как настоящий, но ордера фиктивны,
// баланс виртуальный, а сделки пишутся в отдельные файлы paper-трейдов.
const PAPER_MODE = String(process.env.LIVE_LOOP_MODE || 'paper').toLowerCase() === 'paper';
const PAPER_STARTING_BALANCE_USD = Number(process.env.PAPER_STARTING_BALANCE_USD) || 1000;
const PAPER_ACCOUNT_PATH = path.join(ROOT, 'tradelab-paper-account.json');
const TRADES_PATH = path.join(ROOT, PAPER_MODE ? 'tradelab-paper-trades.json' : 'tradelab-live-trades.json');
const DAILY_PNL_PATH = path.join(ROOT, PAPER_MODE ? 'tradelab-paper-daily-pnl.json' : 'tradelab-daily-pnl.json');

// ============================================================
// Конфигурация
// ============================================================

const CONFIG = {
  // Максимальный размер позиции в USD
  maxPositionSizeUsd: Number(process.env.MAX_POSITION_SIZE_USD) || 100,
  // Максимальный дневной убыток в USD
  maxDailyLossUsd: Math.min(Number(process.env.MAX_DAILY_LOSS_USD) || 50,
    Number(process.env.LIVE_DAILY_LOSS_CAP_USD) || 3),
  // Режим торговли: 'spot' или 'futures'
  tradingMode: process.env.OKX_TRADING_MODE || 'futures',
  // Минимальный объём сделки в USD (OKX комиссии) — снижен для малого баланса 45$
  minTradeUsd: Number(process.env.MIN_TRADE_USD) || 1,
  // Таймаут для OKX API (мс)
  apiTimeout: 15000,
  // Количество попыток при ошибке API
  apiRetries: 3,
  // Короткие сделки: лимит удержания позиции в часах (прибыльные не режем — см. monitorOpenPositions)
  maxHoldHours: Number(process.env.LIVE_MAX_HOLD_HOURS) || 96,
  // Клэмп динамических уровней (новые входы): коротко, а не «свинг на недели»
  shortTermStopMin: Number(process.env.LIVE_STOP_MIN) || 1.2,
  shortTermStopMax: Number(process.env.LIVE_STOP_MAX) || 2.5,
  shortTermTakeMax: Number(process.env.LIVE_TAKE_MAX) || 4.5,
  shortTermRiskMax: Number(process.env.LIVE_RISK_MAX) || 1.0,
  liveTargetNotionalPct: Number(process.env.LIVE_TARGET_NOTIONAL_PCT) || 10,
  liveMaxStopRiskPct: Number(process.env.LIVE_MAX_STOP_RISK_PCT) || 0.4,
  // Облегчённые фильтры входа (объём/ADX).
  // ADX 18 (было 15): только сигналы с импульсом выше среднего, чихи не торгуем.
  volumeMultiplier: Number(process.env.LIVE_VOLUME_MULTIPLIER) || 1.2,
  adxThreshold: Number(process.env.LIVE_ADX_THRESHOLD) || 18,
  // Охрана реальных денег: кандидат пускается в live только после
  // доказанной forward-бумажной истории (минимум сделок и profit factor)
  liveMinForwardTrades: Number(process.env.LIVE_MIN_FORWARD_TRADES) || 10,
  liveMinForwardPF: Number(process.env.LIVE_MIN_FORWARD_PF) || 1.2,
  // Корреляция: максимум открытых позиций в одну сторону.
  // Альты ходят вместе — один шок не должен бить по всем сразу.
  maxSameSideOpen: Number(process.env.MAX_SAME_SIDE_OPEN) || 2
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

// Compare the bot ledger with the exchange before any new real-money entry.
// A disagreement needs investigation; opening another position could compound it.
async function verifyExchangePositions() {
  if (PAPER_MODE) return { ok: true, paper: true };
  const client = getOkxClient();
  const positions = await client.fetchPositions();
  const exchangeOpen = positions.filter((position) => Math.abs(Number(position.contracts) || 0) > 0);
  const localOpen = loadTrades().filter((trade) => trade.status === 'open');
  const expected = new Map(localOpen.map((trade) => [
    `${trade.symbol.replace('USDT', '/USDT:USDT')}:${trade.side.toLowerCase()}`,
    trade
  ]));
  const actual = new Map(exchangeOpen.map((position) => [
    `${position.symbol}:${String(position.side).toLowerCase()}`,
    position
  ]));
  const missingOnExchange = [...expected.keys()].filter((key) => !actual.has(key));
  const missingLocally = [...actual.keys()].filter((key) => !expected.has(key));
  const sizeMismatch = [...expected.entries()].filter(([key, trade]) => {
    const position = actual.get(key);
    const actualContracts = Number(position?.contracts);
    const expectedContracts = Number(trade.size);
    return position && (!Number.isFinite(actualContracts) || !Number.isFinite(expectedContracts) ||
      Math.abs(actualContracts - expectedContracts) > 1e-8);
  }).map(([key]) => key);
  const unconfirmedEntry = localOpen.filter((trade) => trade.entryConfirmed === false).map((trade) => trade.key);
  return {
    ok: missingOnExchange.length === 0 && missingLocally.length === 0 && sizeMismatch.length === 0 && unconfirmedEntry.length === 0,
    missingOnExchange,
    missingLocally,
    sizeMismatch,
    unconfirmedEntry
  };
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

// ============================================================
// Виртуальный баланс paper-режима
// ============================================================

function loadPaperAccount() {
  if (!fs.existsSync(PAPER_ACCOUNT_PATH)) {
    return {
      startingBalance: PAPER_STARTING_BALANCE_USD,
      free: PAPER_STARTING_BALANCE_USD,
      locked: 0,
      realizedPnl: 0,
      openTrades: 0,
      closedTrades: 0,
      updatedAt: null
    };
  }
  return JSON.parse(fs.readFileSync(PAPER_ACCOUNT_PATH, 'utf8'));
}

function savePaperAccount(account) {
  account.updatedAt = new Date().toISOString();
  fs.writeFileSync(PAPER_ACCOUNT_PATH, JSON.stringify(account, null, 2) + '\n');
}

function paperLockFunds(trade) {
  if (!PAPER_MODE) return;
  const acc = loadPaperAccount();
  acc.free -= trade.valueUsd;
  acc.locked += trade.valueUsd;
  acc.openTrades += 1;
  savePaperAccount(acc);
}

function paperReleaseFunds(trade) {
  if (!PAPER_MODE) return;
  const acc = loadPaperAccount();
  acc.free += trade.exitPrice * trade.size;
  acc.locked -= trade.entryPrice * trade.size;
  acc.locked = Math.max(0, acc.locked);
  acc.realizedPnl += trade.pnl;
  acc.closedTrades += 1;
  acc.openTrades = Math.max(0, acc.openTrades - 1);
  savePaperAccount(acc);
}

function paperAccountStatus() {
  if (!PAPER_MODE) return null;
  const acc = loadPaperAccount();
  const trades = loadTrades();
  const open = trades.filter((t) => t.status === 'open');
  const closed = trades.filter((t) => t.status === 'closed');
  const closedPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  return {
    ...acc,
    equity: Number((acc.free + acc.locked).toFixed(2)),
    openPositions: open.length,
    closedTradesTotal: closed.length,
    closedPnl: Number(closedPnl.toFixed(2))
  };
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
// Бумажная история кандидата (forward-сделки инкубатора)
// ============================================================

function loadCandidateForwardRecord(candidateKey) {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const candidate = state && state.candidates ? state.candidates[candidateKey] : null;
    if (!candidate) return null;
    const pf = Number.isFinite(candidate.forwardProfitFactor) || candidate.forwardProfitFactor === null
      ? candidate.forwardProfitFactor : null;
    return {
      forwardPaperTrades: Number(candidate.forwardPaperTrades) || 0,
      forwardProfitFactor: pf
    };
  } catch (error) {
    console.log(`[LiveExecutor] ⚠️ Cannot read forward record: ${error.message}`);
    return null;
  }
}

// ============================================================
// Проверка gate перед реальной сделкой
// ============================================================

function checkGate(candidateKey) {
  // ВАЖНО (дыра закрыта): НИ В ОДНОМ режиме, включая live-mirror-paper, реальный
  // вход не выполняется автоматически. Реальные деньги открываются ТОЛЬКО после
  // ручного подтверждения: gate === MANUAL_REVIEW_ALLOWED + кандидат с
  // decision === 'manual-review-allowed'. Авто-входы по forward-метрикам запрещены.
  // Mirror-режим больше НЕ торгует реальными деньгами автоматически — he приравнен
  // к обычной live-ветке (требует ручного gate). Дырка автовходов закрыта навсегда.
  // В paper-режиме gate не применяется — тестируем прибыльность виртуально
  if (PAPER_MODE) {
    return { allowed: true, paper: true, reason: 'Paper mode — gate not enforced' };
  }

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
// Входные гейты живого входа — те же, что в бумаге (иначе реал слабее статистики).
// ============================================================

async function checkLiveEntryGates(candidate, liveData, side) {
  const { candles, params, barTime } = liveData || {};
  if (!shortEntryVolumeConfirmed(candles, candles.length - 1, params || {}, side)) {
    return { ok: false, reason: 'short entry volume below threshold' };
  }
  // Время суток / понедельник
  try {
    const tf = timeFilter(barTime, params || {});
    if (tf && tf.blocked) return { ok: false, reason: tf.reason || 'blocked hour' };
  } catch (error) {
    return { ok: false, reason: `timeFilter error: ${error.message}` };
  }
  // Фаза рынка под стратегию
  try {
    if (params && params.dynamicRisk && !isStrategySuitable(candles || [], params)) {
      return { ok: false, reason: `phase mismatch (${(params && params.marketPhase) || 'unknown'})` };
    }
  } catch (error) {
    return { ok: false, reason: `phase check error: ${error.message}` };
  }
  // ATR-диапазон по недавним свечам
  try {
    const { detectPhase } = require('./tradelab_market_phase');
    const win = Array.isArray(candles) && candles.length > 100 ? candles.slice(-100) : (candles || []);
    const ph = detectPhase(win);
    const atr = (ph && ph.atrPct) || 0;
    if (!(atr >= (params.minAtrPct || 0.3) && atr <= (params.maxAtrPct || 5.0))) {
      return { ok: false, reason: `atr filter ${atr.toFixed(2)}%` };
    }
  } catch (error) {
    return { ok: false, reason: `atr check error: ${error.message}` };
  }
  // HTF-подтверждение по закрытым свечам; отсутствие данных блокирует новый вход.
  try {
    const { CONFIRM_INTERVAL } = require('./tradelab_incubate_once');
    const ci = CONFIRM_INTERVAL[(candidate && candidate.interval) || ''];
    if (ci && candidate && ci !== candidate.interval) {
      const htfCandles = await fetchCandles(candidate.symbol, ci, 200);
      const htf = confirmHigherTimeframe(htfCandles, side, params || {});
      if (htf !== true) return { ok: false, reason: htf === null ? 'htf data insufficient' : 'htf confirmation failed' };
    }
  } catch (error) {
    return { ok: false, reason: `htf check error: ${error.message}` };
  }
  return { ok: true };
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
  } else if (description.startsWith('BB')) {
    const match = description.match(/BB (\d+)\/([\d.]+)σ, RSI O(\d+)/);
    if (match) {
      params.bbPeriod = Number(match[1]);
      params.bbStd = Number(match[2]);
      params.rsiOversold = Number(match[3]);
      params.rsiOverbought = 100 - Number(match[3]);
      params.strategy = 'bb-reversion';
    }
  } else if (description.startsWith('EMA')) {
    const match = description.match(/EMA (\d+)\/(\d+), RSI (\d+)/);
    if (match) {
      params.emaFast = Number(match[1]);
      params.emaSlow = Number(match[2]);
      params.rsiBuy = Number(match[3]);
      params.strategy = 'ema-momentum';
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
  const effectiveParams = liveParamsForCandles(candles, baseParams, CONFIG);

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

async function placeOkxOrder(symbol, side, size, price = null, stopPrice = null, expectedContractSize = null) {
  // Paper-режим: фиктивный ордер, без API-ключей
  if (PAPER_MODE) {
    console.log(`[PAPER] Order (virtual): ${side} ${size} ${symbol} @ ${price || 'market'}`);
    return { data: [{ ordId: 'PAPER-' + Date.now() + '-' + Math.floor(Math.random() * 1000) }] };
  }

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
    tdMode: CONFIG.tradingMode === 'futures' ? 'isolated' : 'cash',
    side: orderSide,
    ordType: orderType,
    sz: String(size)
  };
  
  if (price) {
    orderParams.px = String(price);
  }

  // ccxt OKX: symbol "INJ/USDT:USDT", side buy/sell, posSide long/short for hedge
  const ccxtSymbol = symbol.replace('USDT', '/USDT:USDT');
  const ccxtSide = side === 'LONG' ? 'buy' : 'sell';
  const posSide = side === 'LONG' ? 'long' : 'short';
  await client.loadMarkets();
  const market = client.market(ccxtSymbol);
  if (!market?.swap || !Number.isFinite(Number(market.contractSize)) ||
      Number(market.contractSize) !== expectedContractSize) {
    throw new Error(`Contract size changed for ${ccxtSymbol}: ${market?.contractSize}`);
  }
  if (!(Number.isFinite(stopPrice) && stopPrice > 0)) {
    throw new Error(`Invalid protective stop for ${ccxtSymbol}: ${stopPrice}`);
  }
  const slTriggerPx = client.priceToPrecision(ccxtSymbol, stopPrice);
  if (!(Number(slTriggerPx) > 0)) {
    throw new Error(`Protective stop rounds to zero for ${ccxtSymbol}`);
  }
  console.log(`[OKX] Placing order: ${ccxtSymbol} ${ccxtSide} ${size} market tdMode isolated posSide ${posSide}`);
  try {
    const result = await client.createOrder(ccxtSymbol, 'market', ccxtSide, size, undefined, {
      tdMode: 'isolated',
      posSide,
      attachAlgoOrds: [{ slTriggerPx, slOrdPx: '-1', slTriggerPxType: 'mark' }]
    });
    console.log(`[OKX] Order result: ${JSON.stringify(result)}`);
    const orderId = result.id || result.info?.ordId || null;
    let fill = confirmedFill(result);
    if (orderId && (!fill || fill.filled < size - 1e-8)) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
        try {
          const detail = await client.fetchOrder(orderId, ccxtSymbol);
          fill = confirmedFill(detail) || fill;
          if (fill && fill.filled >= size - 1e-8) break;
        } catch (error) {
          console.warn(`[OKX] Fill lookup ${attempt}/3 for ${orderId}: ${error.message}`);
        }
      }
    }
    return { data: [{ ordId: orderId || 'unknown', fill }] };
  } catch (error) {
    console.error(`[OKX] Order failed: ${error.message}`);
    throw error;
  }
}

// ============================================================
// Расчёт размера позиции
// ============================================================

// Минимальные лоты OKX (USDT-margin futures) для дорогих монет — защита от
// «amount must be greater than minimum amount precision» при малом балансе.
const OKX_MIN_QTY = {
  'BCHUSDT': 0.1,
  'BTCUSDT': 0.001,
  'ETHUSDT': 0.01,
  'LTCUSDT': 0.01,
  'XRPUSDT': 10,
  'TRXUSDT': 100,
  'DOGEUSDT': 100
};

function calculatePositionSize(price, balance, params, symbol, conviction = 1) {
  // conviction 1.0-2.5: сильным кандидатам — больше размер.
  // Жёсткие капы ниже (15% баланса, $100) не трогаем — безопасность сохранена.
  const riskUsd = Math.min(
    balance * (params.riskPct / 100) * conviction,
    CONFIG.maxPositionSizeUsd
  );
  // Малый баланс (45$): 15% на сделку максимум — иначе не влезает в мин.лот
  const maxRiskUsd = Math.min(balance * 0.15, CONFIG.maxPositionSizeUsd);
  let size = Math.min(riskUsd, maxRiskUsd) / price;
  // OKX минимум для большинства альтов — 1 контракт, для BTC 0.001
  let minSize = price > 100 ? 0.001 : 1;
  // Точный минимум, если монета дорогая/дорогой шаг лота
  if (symbol && OKX_MIN_QTY[symbol]) minSize = OKX_MIN_QTY[symbol];
  size = Math.max(minSize, Math.round(size * 1000) / 1000);
  // Если мин.лот уже больше риск-бюджета — оставляем мин.лот (проверка ниже отклонит)
  if (size * price > maxRiskUsd && size * price > CONFIG.minTradeUsd) {
    size = Math.max(minSize, Math.floor((maxRiskUsd / price) * 1000) / 1000);
  }
  return Math.max(minSize, size);
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

  // 1b. Ручное подтверждение — инвариант исполнителя, а не только цикла:
  // без approved в approvals.json реальный вход запрещён из любого места (цикл, CLI).
  // В paper-режиме не применяется (там всё виртуально).
  if (!PAPER_MODE) {
    try {
      const { getApprovedCandidates } = require('./tradelab_manual_bridge');
      const approved = await getApprovedCandidates();
      const hasApproval = approved.some((a) => a && a.key === candidateKey);
      if (!hasApproval) {
        console.log(`[LiveExecutor] ❌ No manual approval for ${candidateKey} — real entry blocked`);
        return { success: false, reason: 'No manual approval (нажмите Подтвердить в Telegram)' };
      }
    } catch (error) {
      console.log(`[LiveExecutor] ❌ Approval check failed: ${error.message}`);
      return { success: false, reason: `Approval check failed: ${error.message}` };
    }
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

  let { signal, price, params, barTime } = liveData;
  const okxSignalPrice = price;
  
  if (signal.action === 'WAIT') {
    console.log(`[LiveExecutor] ⏸️ No signal (WAIT). Price: ${price}`);
    return { success: false, reason: 'No signal (WAIT)' };
  }

  if (!(Number.isFinite(price) && price > 0)) return { success: false, reason: 'OKX reference close invalid' };

  // 4. Определяем сторону сделки
  const side = signal.action === 'BUY' ? 'LONG' : 'SHORT';
  console.log(`[LiveExecutor] 📊 Signal: ${signal.action} -> ${side} at ${price}`);

  // 4b. Те же фильтры входа, что в бумаге: время, фаза, ATR, HTF.
  // Раньше живой вход их пропускал — реал открывался по более слабым
  // критериям, чем статистика, которая кандидата допустила.
  const gate4b = await checkLiveEntryGates(candidate, liveData, side);
  if (!gate4b.ok) {
    console.log(`[LiveExecutor] ⏸️ Entry gates: ${gate4b.reason}`);
    return { success: false, reason: `Entry gates: ${gate4b.reason}` };
  }

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

  // 5b. Корреляция: не копим однонаправленность — уже есть maxSameSideOpen позиций
  // в ту же сторону (альты коррелируют, шок бьёт по всем сразу).
  const openSameSide = existingTrades.filter((t) => t.status === 'open' && t.side === side).length;
  if (openSameSide >= CONFIG.maxSameSideOpen) {
    console.log(`[LiveExecutor] ⏸️ Direction cap: ${openSameSide} ${side} already open (max ${CONFIG.maxSameSideOpen})`);
    return { success: false, reason: `Direction cap: too many ${side} positions` };
  }

  // 6. Расчёт размера позиции по реальному балансу счёта.
  // Баланс недоступен — НЕ торгуем: сайзинг от воображаемых денег запрещён.
  const account = await getAccountBalance();
  if (!account) {
    console.log(`[LiveExecutor] ❌ Balance unavailable — trade blocked (no blind sizing)`);
    return { success: false, reason: 'Balance unavailable — trading halted' };
  }
  const balance = account.free;
  if (!(Number.isFinite(balance) && balance > 0)) {
    console.log(`[LiveExecutor] ❌ Balance unusable (free=${balance}) — trade blocked`);
    return { success: false, reason: 'Balance unusable (no free funds)' };
  }
  // Цена обязана быть конечным положительным числом — иначе size улетит в Infinity.
  if (!(Number.isFinite(price) && price > 0)) {
    console.log(`[LiveExecutor] ❌ Bad price (${price}) — trade blocked`);
    return { success: false, reason: `Bad price: ${price}` };
  }
  // Уверенность по forward-доказательствам: PF выше 1.8 и больше сделок — больше размер.
  // Новичок (PF 1.8, мало сделок): 1.0. Монстр (PF 10, 30+ сделок): 2.5.
  const fwdPF = Number(candidate.forwardProfitFactor) || 0;
  const fwdTr = Number(candidate.forwardPaperTrades) || 0;
  const conviction = Math.min(1 + Math.max(0, fwdPF - 1.8) * 0.5 + Math.min(fwdTr / 30, 1) * 0.5, 2.5);
  console.log(`[LiveExecutor] Conviction x${conviction.toFixed(2)} (fwdPF ${fwdPF.toFixed(2)}, fwdTr ${fwdTr})`);
  let position;
  if (PAPER_MODE) {
    const paperSize = calculatePositionSize(price, balance, params, candidate.symbol, conviction);
    position = { ok: true, contracts: paperSize, contractSize: 1, notionalUsd: paperSize * price };
  } else {
    try {
      const client = getOkxClient();
      await client.loadMarkets();
      const ccxtSymbol = candidate.symbol.replace('USDT', '/USDT:USDT');
      const market = client.market(ccxtSymbol);
      position = sizeSwapPosition({
        market, price, balance, riskPct: Number(params.riskPct), conviction,
        maxPositionSizeUsd: CONFIG.maxPositionSizeUsd, minTradeUsd: CONFIG.minTradeUsd,
        targetNotionalPct: CONFIG.liveTargetNotionalPct,
        maxStopRiskPct: CONFIG.liveMaxStopRiskPct,
        stopPct: Number(params.stopPct), feePct: Number(params.feePct),
        slippagePct: Number(params.slippagePct),
        amountToPrecision: (amount) => client.amountToPrecision(ccxtSymbol, amount)
      });
    } catch (error) {
      return { success: false, reason: `Market sizing unavailable: ${error.message}` };
    }
  }
  if (!position.ok) return { success: false, reason: `Market sizing blocked: ${position.reason}` };
  const size = position.contracts;
  const valueUsd = position.notionalUsd;
  
  if (valueUsd < CONFIG.minTradeUsd) {
    console.log(`[LiveExecutor] ❌ Trade too small: ${valueUsd.toFixed(2)}$ < ${CONFIG.minTradeUsd}$`);
    return { success: false, reason: 'Trade too small' };
  }

  // Если итоговая стоимость больше риск-бюджета — не суёмся.
  // Универсально (не только для таблицы OKX_MIN_QTY): минлот вне таблицы тоже ловится.
  const maxRiskUsd = Math.min(balance * 0.15, CONFIG.maxPositionSizeUsd);
  if (valueUsd > maxRiskUsd && valueUsd > CONFIG.minTradeUsd) {
    console.log(`[LiveExecutor] ❌ Size ${valueUsd.toFixed(2)}$ over risk budget ${maxRiskUsd.toFixed(2)}$ — blocked`);
    return { success: false, reason: `Size over risk budget (${valueUsd.toFixed(2)}$ > ${maxRiskUsd.toFixed(2)}$)` };
  }

  // Если мин.лот монеты (OKX) требует больше риск-бюджета — не суёмся (защита от «min amount precision»)
  const minQty = PAPER_MODE ? OKX_MIN_QTY[candidate.symbol] : null;
  if (minQty && Math.abs(size - minQty) < 1e-9 && minQty * price > balance * 0.15) {
    console.log(`[LiveExecutor] ❌ Min lot ${minQty} ${candidate.symbol} (≈$${(minQty * price).toFixed(1)}) не вмещается в риск-бюджет (≥15% баланса)`);
    return { success: false, reason: `Min lot ${minQty} too big for balance` };
  }

  // 7. Последняя проверка перед ордером (гонка двух циклов/CLI+цикл):
  // перечитываем файл — нет ли уже открытой позиции по ключу или символу.
  const freshTrades = loadTrades();
  if (freshTrades.some((t) => t.key === candidateKey && t.status === 'open')) {
    console.log(`[LiveExecutor] ⏸️ Position already open for ${candidateKey} (recheck)`);
    return { success: false, reason: 'Position already open (recheck)' };
  }
  if (freshTrades.some((t) => t.symbol === candidate.symbol && t.status === 'open')) {
    console.log(`[LiveExecutor] ⏸️ Symbol ${candidate.symbol} already has open position (recheck)`);
    return { success: false, reason: `Symbol ${candidate.symbol} already open` };
  }

  // 7b. Исполняем ордер на OKX
  const levels = positionLevels(side, price, params);
  let orderResult;
  try {
    orderResult = await placeOkxOrder(candidate.symbol, side, size, null, levels.stop, position.contractSize);
  } catch (error) {
    console.log(`[LiveExecutor] ❌ Order failed: ${error.message}`);
    return { success: false, reason: `Order failed: ${error.message}` };
  }

  // 8. Биржевой стоп был прикреплён до исполнения по сигнальной цене.
  // Локальный учёт входа и тейк считаем по фактическому fill, если он подтверждён.
  const accounting = entryAccounting({
    side, signalPrice: price, requestedSize: size, contractSize: position.contractSize,
    stopPrice: levels.stop, takePct: params.takePct,
    fill: PAPER_MODE ? { average: price, filled: size, status: 'closed' } : orderResult?.data?.[0]?.fill
  });
  if (!accounting.entryConfirmed) {
    console.error(`[LiveExecutor] ⛔ Entry fill unconfirmed for ${candidateKey}; future entries blocked until reconciled`);
  }
  const trade = {
    key: candidateKey,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    side,
    entryPrice: accounting.entryPrice,
    signalPrice: accounting.signalPrice,
    okxSignalPrice,
    entryConfirmed: accounting.entryConfirmed,
    fillStatus: accounting.fillStatus,
    entryBar: barTime,
    stopPrice: Number(levels.stop.toFixed(6)),
    takePrice: Number(accounting.takePrice.toFixed(6)),
    size: accounting.size,
    contractSize: position.contractSize,
    valueUsd: accounting.valueUsd,
    params: { ...params },
    candlesLimit: candidate.limit || 100,
    signal: signal.action,
    orderId: orderResult?.data?.[0]?.ordId || 'unknown',
    trailingActivated: false,
    trailStop: null,
    pnl: 0, // Будет обновлено при закрытии
    status: 'open',
    openedAt: new Date().toISOString()
  };
  
  logTrade(trade);
  paperLockFunds(trade);
  
  console.log(`\n[LiveExecutor] ✅ Trade executed successfully!`);
  console.log(`   Symbol: ${candidate.symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Size: ${trade.size}`);
  console.log(`   Entry: ${trade.entryPrice} (${trade.entryConfirmed ? 'OKX fill' : 'unconfirmed signal price'})`);
  console.log(`   Value: ${trade.valueUsd.toFixed(2)}$`);
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
  // Paper-режим: фиктивное закрытие, без API-ключей
  if (PAPER_MODE) {
    console.log(`[PAPER] Close (virtual): ${side} ${size} ${symbol}`);
    return { data: [{ ordId: 'PAPER-' + Date.now() + '-' + Math.floor(Math.random() * 1000) }] };
  }

  const client = getOkxClient();
  const ccxtSymbol = symbol.replace('USDT', '/USDT:USDT');
  const ccxtSide = side === 'LONG' ? 'sell' : 'buy';
  const posSide = side === 'LONG' ? 'long' : 'short';
  console.log(`[OKX] Closing position: ${ccxtSymbol} ${ccxtSide} ${size} market posSide ${posSide}`);
  try {
    const result = await client.createOrder(ccxtSymbol, 'market', ccxtSide, size, undefined, { tdMode: 'isolated', posSide, reduceOnly: true });
    console.log(`[OKX] Close result: ${JSON.stringify(result)}`);
    const orderId = result.id || result.info?.ordId || null;
    let fill = confirmedFill(result);
    if (orderId && (!fill || fill.filled < size - 1e-8)) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
        try {
          fill = confirmedFill(await client.fetchOrder(orderId, ccxtSymbol)) || fill;
          if (fill && fill.filled >= size - 1e-8) break;
        } catch (error) {
          console.warn(`[OKX] Close fill lookup ${attempt}/3 for ${orderId}: ${error.message}`);
        }
      }
    }
    return { data: [{ ordId: orderId || 'unknown', fill }] };
  } catch (error) {
    console.error(`[OKX] Close failed: ${error.message}`);
    throw error;
  }
}

// ============================================================
// Реальный баланс счёта
// ============================================================

async function getAccountBalance() {
  // Paper-режим: виртуальный баланс
  if (PAPER_MODE) {
    const acc = loadPaperAccount();
    return { total: acc.free + acc.locked, free: acc.free, paper: true };
  }

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
  const contractSize = Number(trade.contractSize) || 1;
  const gross = (trade.side === 'LONG' ? (exitPrice - entry) : (entry - exitPrice)) * qty * contractSize;
  const fees = (entry * qty + exitPrice * qty) * contractSize * (feePct / 100);
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
  // Paper-режим: цена последней закрытой свечи (без сети)
  if (PAPER_MODE) return null;

  const client = getOkxClient();
  try {
    const ticker = await client.fetchTicker(symbol.replace('USDT', '/USDT:USDT'));
    if (ticker && ticker.last) return Number(ticker.last);
  } catch (error) {
    console.error(`[OKX] Ticker fetch failed for ${symbol}: ${error.message}`);
  }
  return null;
}

async function exchangeCloseMatch(trade, exitOrderId = null) {
  const client = getOkxClient();
  const instId = trade.symbol.replace('USDT', '-USDT-SWAP');
  const response = await client.privateGetTradeFillsHistory({ instType: 'SWAP', instId, limit: '100' });
  if (response.code !== '0' || !Array.isArray(response.data)) {
    throw new Error(`OKX fills unavailable: ${response.code || 'invalid response'}`);
  }
  return matchClosedFills(trade, response.data, exitOrderId);
}

// ============================================================
// Мониторинг открытых позиций: автозакрытие по стоп/тейк/сигналу
// ============================================================

async function monitorOpenPositions() {
  const trades = loadTrades();
  const open = trades.filter((t) => t.status === 'open');
  const results = [];
  const closedNow = [];
  let exchangeOpenKeys = null;
  if (!PAPER_MODE && open.length) {
    const positions = await getOkxClient().fetchPositions();
    exchangeOpenKeys = new Set(positions
      .filter((position) => Math.abs(Number(position.contracts) || 0) > 0)
      .map((position) => `${position.symbol}:${String(position.side).toLowerCase()}`));
  }

  for (const trade of open) {
    try {
      const exchangeKey = `${trade.symbol.replace('USDT', '/USDT:USDT')}:${trade.side.toLowerCase()}`;
      const exchangeMissing = exchangeOpenKeys !== null && !exchangeOpenKeys.has(exchangeKey);
      if (!PAPER_MODE && trade.entryConfirmed === false) {
        try {
          const client = getOkxClient();
          const ccxtSymbol = trade.symbol.replace('USDT', '/USDT:USDT');
          const order = await client.fetchOrder(trade.orderId, ccxtSymbol);
          const fill = confirmedFill(order);
          if (fill) {
            const accounting = entryAccounting({
              side: trade.side, signalPrice: trade.signalPrice || trade.entryPrice,
              requestedSize: trade.size, contractSize: trade.contractSize,
              stopPrice: trade.stopPrice, takePct: trade.params.takePct, fill
            });
            trade.entryPrice = accounting.entryPrice;
            trade.size = accounting.size;
            trade.valueUsd = accounting.valueUsd;
            trade.takePrice = Number(accounting.takePrice.toFixed(6));
            trade.entryConfirmed = true;
            trade.fillStatus = accounting.fillStatus;
            saveTrades(trades);
          }
        } catch (error) {
          console.warn(`[LiveExecutor] Entry fill recovery for ${trade.key}: ${error.message}`);
        }
        if (trade.entryConfirmed === false && !exchangeMissing) {
          results.push({ key: trade.key, symbol: trade.symbol, action: 'entry-unconfirmed' });
          continue;
        }
      }
      const candles = await fetchCandles(trade.symbol, trade.interval, trade.candlesLimit || 100);
      const effectiveParams = applyDynamicParams(candles, { ...(trade.params || {}) });
      const signal = getSignal(candles, candles.length - 1, effectiveParams);
      const lastClosed = candles[candles.length - 2] || candles[candles.length - 1];
      const marketPrice = await fetchMarketPrice(trade.symbol) || lastClosed.close;

      // Трейлинг-стоп: подтягиваем стоп за прибылью — фиксирует больше выигрышей
      let exit = exchangeMissing ? { reason: 'external', price: marketPrice } : null;
      if (!exit && marketPrice && trade.stopPrice > 0 && trade.entryPrice > 0) {
        const effParams = { ...(trade.params || {}) };
        const trailPct = Number(effParams.trailPct) || 0.8;
        const activatePct = Number(effParams.trailActivatePct) || 1.5;
        const entry = trade.entryPrice;
        const pnlPct = trade.side === 'LONG'
          ? ((marketPrice - entry) / entry) * 100
          : ((entry - marketPrice) / entry) * 100;
        if (pnlPct >= activatePct) {
          trade.trailingActivated = true;
          const newTrail = trade.side === 'LONG'
            ? marketPrice - entry * (trailPct / 100)
            : marketPrice + entry * (trailPct / 100);
          const better = trade.side === 'LONG'
            ? !trade.trailStop || newTrail > trade.trailStop
            : !trade.trailStop || newTrail < trade.trailStop;
          if (better) {
            trade.trailStop = Number(newTrail.toFixed(6));
            saveTrades(trades);
          }
        }
        if (trade.trailingActivated && trade.trailStop) {
          const hitTrail = trade.side === 'LONG'
            ? marketPrice <= trade.trailStop
            : marketPrice >= trade.trailStop;
          if (hitTrail) exit = { reason: 'trail', price: marketPrice };
        }
      }
      if (!exit) exit = exitReasonForLive(trade, signal.action, marketPrice);

      // Короткие сделки: автозакрытие «зависших» позиций по времени удержания.
      // Прибыльные позиции таймаутом НЕ трогаем — их выводит трейлинг-стоп,
      // чтобы не срезать выигрышные ходы (как было с INJ на +7%).
      if (!exit && CONFIG.maxHoldHours > 0 && trade.openedAt) {
        const heldHours = (Date.now() - new Date(trade.openedAt).getTime()) / 3600000;
        const inProfit = marketPrice && trade.entryPrice > 0
          ? ((trade.side === 'LONG'
              ? (marketPrice - trade.entryPrice) / trade.entryPrice
              : (trade.entryPrice - marketPrice) / trade.entryPrice) * 100) >= 0.5
          : false;
        if (heldHours >= CONFIG.maxHoldHours && !inProfit) {
          exit = { reason: 'timeout', price: marketPrice || lastClosed.close };
        }
      }

      if (exit) {
        let closeOrderId = null;
        let closeFill = null;
        if (exit.reason !== 'external') {
          try {
            const closeResult = await closePosition(trade.symbol, trade.side, trade.size);
            closeOrderId = closeResult.data?.[0]?.ordId || null;
            closeFill = closeResult.data?.[0]?.fill || null;
          } catch (error) {
            const msg = String(error && error.message ? error.message : error);
            if (!/51169|don't have any positions|reduce or close/i.test(msg)) throw error;
            console.log(`[LiveExecutor] No position on exchange for ${trade.key} — checking external fills`);
            exit.reason = 'external';
          }
        }
        let matched = null;
        if (!PAPER_MODE) {
          try { matched = await exchangeCloseMatch(trade, closeOrderId); }
          catch (error) { console.warn(`[LiveExecutor] Fill reconciliation for ${trade.key}: ${error.message}`); }
        }
        if (exit.reason === 'external' && !matched) {
          results.push({ key: trade.key, symbol: trade.symbol, action: 'error', error: 'Exchange position absent; close fills ambiguous or unavailable' });
          continue;
        }
        const actualExitPrice = matched?.exitPrice || closeFill?.average || exit.price;
        const pnl = matched?.pnl ?? computeTradePnl(trade, actualExitPrice);
        trade.status = 'closed';
        trade.exitPrice = Number(actualExitPrice.toFixed(6));
        trade.exitConfirmed = !!matched || !!closeFill;
        trade.pnlEstimated = !matched; // funding still requires separate account-bill reconciliation
        trade.exitReason = exit.reason;
        if (matched?.exitOrderId || closeOrderId) trade.exitOrderId = matched?.exitOrderId || closeOrderId;
        trade.pnl = Number(pnl.toFixed(matched ? 8 : 2));
        trade.closedAt = matched?.closeFillAt ? new Date(matched.closeFillAt).toISOString() : new Date().toISOString();
        saveTrades(trades);

        const today = new Date().toISOString().slice(0, 10);
        const daily = loadDailyPnl();
        if (daily.date !== today) {
          daily.date = today;
          daily.pnl = 0;
          daily.trades = 0;
        }
        daily.pnl += trade.pnl;
        saveDailyPnl(daily);
        paperReleaseFunds(trade);

        // Перевооружение approve: плюс — остаётся одобренным под новые сигналы,
        // минус — сгорает, новая кнопка только после кулдауна. Только реал.
        if (!PAPER_MODE) {
          try {
            const { settleApprovalAfterClose } = require('./tradelab_manual_bridge');
            const settle = await settleApprovalAfterClose(trade.key, trade.pnl);
            console.log(`[LiveExecutor] Approval settle for ${trade.key}: ${settle.action} (pnl ${trade.pnl})`);
          } catch (error) {
            console.log(`[LiveExecutor] ⚠️ Approval settle failed: ${error.message}`);
          }
        }

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
  if (result.success) {
    try {
      const { markExecuted } = require('./tradelab_manual_bridge');
      await markExecuted(candidateKey);
    } catch (error) {
      console.log(`⚠️ markExecuted failed: ${error.message}`);
    }
  }
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
  loadDailyPnl,
  paperAccountStatus,
  verifyExchangePositions
};

