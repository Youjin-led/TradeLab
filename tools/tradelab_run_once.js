const {
  detectPhase,
  dynamicStopPct,
  dynamicTakePct,
  dynamicRiskPct,
  atrPct
} = require('./tradelab_market_phase');

const DEFAULT_PARAMS = {
  strategy: 'sma-rsi',
  direction: 'long-only',
  fast: 12,
  slow: 34,
  rsiBuy: 42,
  rsiSell: 68,
  lookback: 42,
  deviationPct: 3.2,
  riskPct: 1.2,
  stopPct: 2.4,
  takePct: 4.2,
  maxDrawdownPct: 9,
  feePct: 0.06,
  slippagePct: 0.04,
  // Dynamic mode: if true, stopPct/takePct/riskPct are computed from ATR
  dynamicRisk: false,
  // Market phase detection
  marketPhase: null
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const FETCH_RETRY = {
  attempts: 3,
  delayMs: 900
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sma(values, period, index) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) sum += values[i];
  return sum / period;
}

function rsi(values, period = 14, index = values.length - 1) {
  if (index < period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = index - period + 1; i <= index; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

function highest(values, period, index) {
  if (index < period) return null;
  let max = -Infinity;
  for (let i = index - period; i < index; i += 1) max = Math.max(max, values[i]);
  return max;
}

function lowest(values, period, index) {
  if (index < period) return null;
  let min = Infinity;
  for (let i = index - period; i < index; i += 1) min = Math.min(min, values[i]);
  return min;
}

/**
 * Apply dynamic risk parameters based on ATR and market phase.
 * This modifies params in-place and returns the updated params.
 */
function applyDynamicParams(candles, params) {
  if (!params.dynamicRisk) return params;
  
  const phase = detectPhase(candles);
  params.marketPhase = phase.phase;
  
  // Dynamic stop/take based on ATR
  params.stopPct = dynamicStopPct(candles, phase.stopMultiplier);
  params.takePct = dynamicTakePct(candles, params.stopPct);
  params.riskPct = dynamicRiskPct(candles);
  
  // Strategy override based on market phase
  // If the strategy doesn't match the phase, we still use it but log the mismatch
  // The discovery process will naturally select the right strategy
  
  return params;
}

/**
 * Check if the current market phase is suitable for the given strategy.
 * Returns true if the strategy is appropriate for the current market conditions.
 */
function isStrategySuitable(candles, params) {
  if (!params.dynamicRisk) return true;
  
  const phase = detectPhase(candles);
  const strategy = params.strategy;
  
  // Mean reversion only in ranging markets
  if (strategy === 'mean-reversion') {
    return phase.phase.startsWith('ranging') || phase.phase === 'volatile-ranging';
  }
  
  // Breakout only in trending markets
  if (strategy === 'breakout') {
    return phase.phase.startsWith('trending');
  }
  
  // SMA+RSI works in most conditions, but not in extreme volatility
  if (strategy === 'sma-rsi') {
    return phase.volatility !== 'extreme';
  }
  
  return true;
}

function getSignal(candles, cursor, params) {
  const closes = candles.slice(0, cursor).map((candle) => candle.close);
  const i = closes.length - 1;
  const fastNow = sma(closes, params.fast, i);
  const slowNow = sma(closes, params.slow, i);
  const fastPrev = sma(closes, params.fast, i - 1);
  const slowPrev = sma(closes, params.slow, i - 1);
  const currentRsi = rsi(closes, 14, i);
  const price = closes[i];
  const crossUp = fastPrev !== null && slowPrev !== null && fastPrev <= slowPrev && fastNow > slowNow;
  const crossDown = fastPrev !== null && slowPrev !== null && fastPrev >= slowPrev && fastNow < slowNow;
  let action = 'WAIT';

  if (params.strategy === 'breakout') {
    const rangeHigh = highest(closes, params.lookback, i);
    const rangeLow = lowest(closes, params.lookback, i);
    const previous = closes[i - 1];
    if (rangeHigh !== null && previous <= rangeHigh && price > rangeHigh) action = 'BUY';
    else if ((rangeLow !== null && price < rangeLow) || currentRsi >= params.rsiSell + 5) action = 'SELL';
  } else if (params.strategy === 'mean-reversion') {
    const basis = sma(closes, params.lookback, i);
    const prevBasis = sma(closes, params.lookback, i - 1);
    const deviation = basis ? ((price - basis) / basis) * 100 : 0;
    if (basis && deviation <= -params.deviationPct && currentRsi <= params.rsiBuy) action = 'BUY';
    else if ((basis && price >= basis) || (prevBasis && price < prevBasis * (1 - params.deviationPct / 100) && currentRsi > params.rsiBuy + 12)) action = 'SELL';
  } else {
    if (crossUp && currentRsi <= params.rsiSell) action = 'BUY';
    else if (crossDown || currentRsi >= params.rsiSell) action = 'SELL';
    else if (fastNow > slowNow && currentRsi <= params.rsiBuy) action = 'BUY';
  }

  return { action, price };
}

function canOpenSide(params, side) {
  return params.direction === 'long-short' || (params.direction === 'long-only' && side === 'LONG') || (params.direction === 'short-only' && side === 'SHORT');
}

function signalToEntrySide(signal, params) {
  if (signal.action === 'BUY' && canOpenSide(params, 'LONG')) return 'LONG';
  if (signal.action === 'SELL' && canOpenSide(params, 'SHORT')) return 'SHORT';
  return null;
}

function executionPrice(rawPrice, action, params) {
  const slip = params.slippagePct / 100;
  return action === 'BUY' ? rawPrice * (1 + slip) : rawPrice * (1 - slip);
}

const entryAction = (side) => side === 'LONG' ? 'BUY' : 'SELL';
const exitAction = (side) => side === 'LONG' ? 'SELL' : 'BUY';

function positionLevels(entry, side, params) {
  if (side === 'LONG') {
    return { stop: entry * (1 - params.stopPct / 100), take: entry * (1 + params.takePct / 100) };
  }
  return { stop: entry * (1 + params.stopPct / 100), take: entry * (1 - params.takePct / 100) };
}

function makePosition(side, rawPrice, balance, params, cursor, time) {
  const entry = executionPrice(rawPrice, entryAction(side), params);
  const riskUsd = balance * (params.riskPct / 100);
  const qty = riskUsd / (entry * (params.stopPct / 100));
  const entryFee = entry * qty * (params.feePct / 100);
  return { side, entry, qty, entryFee, openedAt: cursor, entryTime: time, ...positionLevels(entry, side, params) };
}

function tradePnl(position, exit, params) {
  const gross = position.side === 'LONG' ? (exit - position.entry) * position.qty : (position.entry - exit) * position.qty;
  const exitFee = exit * position.qty * (params.feePct / 100);
  return {
    gross,
    exitFee,
    net: gross - position.entryFee - exitFee,
    pct: position.side === 'LONG' ? ((exit - position.entry) / position.entry) * 100 : ((position.entry - exit) / position.entry) * 100
  };
}

function floatingPnl(position, rawPrice, params) {
  return tradePnl(position, executionPrice(rawPrice, exitAction(position.side), params), params).net;
}

function exitReason(position, signal, rawPrice) {
  if (position.side === 'LONG') {
    if (rawPrice <= position.stop) return 'stop';
    if (rawPrice >= position.take) return 'take';
    if (signal.action === 'SELL') return 'signal';
  } else {
    if (rawPrice >= position.stop) return 'stop';
    if (rawPrice <= position.take) return 'take';
    if (signal.action === 'BUY') return 'signal';
  }
  return '';
}

function summarize(account) {
  const grossProfit = account.trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(account.trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  const wins = account.trades.filter((trade) => trade.pnl > 0).length;
  const avg = account.trades.length ? account.trades.reduce((sum, trade) => sum + trade.pnl, 0) / account.trades.length : 0;
  let streak = 0;
  let maxLossStreak = 0;
  for (const trade of account.trades) {
    if (trade.pnl < 0) {
      streak += 1;
      maxLossStreak = Math.max(maxLossStreak, streak);
    } else {
      streak = 0;
    }
  }
  return {
    balance: account.balance,
    pnl: account.balance - 10000,
    profitFactor: grossLoss ? grossProfit / grossLoss : (grossProfit ? Infinity : 0),
    winrate: account.trades.length ? (wins / account.trades.length) * 100 : 0,
    avg,
    maxDd: account.maxDd,
    tradeCount: account.trades.length,
    maxLossStreak
  };
}

function simulate(candles, params) {
  const account = { balance: 10000, peak: 10000, maxDd: 0, position: null, trades: [], equity: [] };
  const warmup = Math.max(params.slow + 2, params.lookback + 2, 20);
  
  // Apply dynamic params once at the start if enabled
  const effectiveParams = applyDynamicParams(candles, { ...params });
  
  for (let cursor = warmup; cursor < candles.length; cursor += 1) {
    const candle = candles[cursor - 1];
    const price = candle.close;
    const signal = getSignal(candles, cursor, effectiveParams);
    const equity = account.position ? account.balance + floatingPnl(account.position, price, effectiveParams) : account.balance;
    account.peak = Math.max(account.peak, equity);
    account.maxDd = Math.max(account.maxDd, ((account.peak - equity) / account.peak) * 100);
    account.equity.push({ value: equity });

    if (account.position) {
      const reason = exitReason(account.position, signal, price);
      if (reason) {
        const exit = executionPrice(price, exitAction(account.position.side), effectiveParams);
        const result = tradePnl(account.position, exit, effectiveParams);
        account.balance += result.net;
        account.trades.push({
          side: account.position.side,
          entry: account.position.entry,
          exit,
          pnl: result.net,
          gross: result.gross,
          fees: account.position.entryFee + result.exitFee,
          pnlPct: result.pct,
          bars: cursor - account.position.openedAt,
          reason
        });
        account.position = null;
      }
    } else if (account.maxDd < effectiveParams.maxDrawdownPct) {
      // Check if strategy is suitable for current market phase
      if (isStrategySuitable(candles, effectiveParams)) {
        const side = signalToEntrySide(signal, effectiveParams);
        if (side) account.position = makePosition(side, price, account.balance, effectiveParams, cursor, candle.time);
      }
    }
  }
  return { account, summary: summarize(account) };
}

function parameterGrid(params) {
  const stops = [{ stopPct: 1.6, takePct: 3 }, { stopPct: 2.4, takePct: 4.2 }, { stopPct: 3.2, takePct: 5.8 }];
  if (params.strategy === 'breakout') {
    return [20, 42, 80, 120].flatMap((lookback) => stops.map((risk) => ({ ...params, lookback, ...risk })));
  }
  if (params.strategy === 'mean-reversion') {
    return [20, 42, 80].flatMap((lookback) => [2, 3.2, 5].flatMap((deviationPct) => stops.map((risk) => ({ ...params, lookback, deviationPct, ...risk }))));
  }
  return [8, 12, 16].flatMap((fast) => [24, 34, 55].flatMap((slow) => [35, 42, 48].flatMap((rsiBuy) => stops.map((risk) => ({ ...params, fast, slow: Math.max(slow, fast + 5), rsiBuy, ...risk })))));
}

function describe(params) {
  if (params.strategy === 'breakout') return `Breakout LB ${params.lookback}, SL ${params.stopPct}%, TP ${params.takePct}%`;
  if (params.strategy === 'mean-reversion') return `Mean Reversion LB ${params.lookback}, dev ${params.deviationPct}%, SL ${params.stopPct}%, TP ${params.takePct}%`;
  return `SMA ${params.fast}/${params.slow}, RSI ${params.rsiBuy}, SL ${params.stopPct}%, TP ${params.takePct}%`;
}

function health(summary, wfStatus, blocked, params) {
  let score = 100;
  const reasons = [];
  if (summary.pnl <= 0) { score -= 24; reasons.push('negative/flat backtest'); } else reasons.push('positive backtest');
  if (!Number.isFinite(summary.profitFactor) || summary.profitFactor >= 1.4) reasons.push('strong profit factor');
  else if (summary.profitFactor >= 1.05) { score -= 10; reasons.push('moderate profit factor'); }
  else { score -= 24; reasons.push('weak profit factor'); }
  if (summary.maxDd > params.maxDrawdownPct) { score -= 22; reasons.push('drawdown exceeds limit'); } else reasons.push('drawdown inside limit');
  if (wfStatus === 'stable') reasons.push('walk-forward stable');
  else if (wfStatus === 'overfit risk') { score -= 25; reasons.push('walk-forward overfit risk'); }
  else { score -= 10; reasons.push('walk-forward weak'); }
  if (blocked) { score -= 18; reasons.push('guardrails would block live entry'); }
  score = clamp(Math.round(score), 0, 100);
  return { score, status: score >= 75 && !blocked ? 'Healthy' : score >= 50 ? 'Caution' : 'Blocked', reasons };
}

async function fetchCandles(symbol, interval, limit, options = {}) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const attempts = options.attempts || FETCH_RETRY.attempts;
  const delayMs = options.delayMs || FETCH_RETRY.delayMs;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows = await response.json();
      return rows.map((row, index) => ({
        index,
        time: new Date(row[0]).toISOString().replace('T', ' ').slice(0, 16),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      }));
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }

  const message = lastError && lastError.message ? lastError.message : String(lastError);
  throw new Error(`fetchCandles failed for ${symbol} ${interval} after ${attempts} attempts: ${message}`);
}

async function fetchCandlesNoRetry(symbol, interval, limit) {
  const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const rows = await response.json();
  return rows.map((row, index) => ({
    index,
    time: new Date(row[0]).toISOString().replace('T', ' ').slice(0, 16),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
}

async function runOnce(symbol = 'BTCUSDT', interval = '1h', limit = 500, params = DEFAULT_PARAMS) {
  const candles = await fetchCandles(symbol, interval, limit);
  const base = simulate(candles, params);
  const compare = ['sma-rsi', 'breakout', 'mean-reversion']
    .map((strategy) => ({ strategy, ...simulate(candles, { ...params, strategy }).summary }))
    .sort((a, b) => b.pnl - a.pnl);
  const optimized = parameterGrid(params)
    .map((params) => {
      const summary = simulate(candles, params).summary;
      return { params, summary, score: summary.pnl - summary.maxDd * 18 + Math.min(summary.profitFactor, 6) * 28 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const split = Math.floor(candles.length * 0.7);
  const train = candles.slice(0, split);
  const test = candles.slice(split);
  const bestTrain = parameterGrid(params)
    .map((params) => {
      const summary = simulate(train, params).summary;
      return { params, summary, score: summary.pnl - summary.maxDd * 18 + Math.min(summary.profitFactor, 6) * 28 };
    })
    .sort((a, b) => b.score - a.score)[0];
  const testSummary = simulate(test, bestTrain.params).summary;
  const ratio = bestTrain.summary.pnl > 0 ? testSummary.pnl / bestTrain.summary.pnl : 0;
  const wfStatus = testSummary.pnl > 0 && testSummary.maxDd <= params.maxDrawdownPct && ratio > 0.18
    ? 'stable'
    : bestTrain.summary.pnl > 0 && testSummary.pnl < 0
      ? 'overfit risk'
      : 'weak';
  const blocked = base.summary.maxDd >= params.maxDrawdownPct
    || base.summary.maxLossStreak >= 4
    || (base.summary.tradeCount >= 3 && base.summary.profitFactor < 1.05)
    || wfStatus === 'overfit risk';

  // Market phase detection
  const phase = detectPhase(candles);

  // News sentiment (optional — requires tradelab-news-impact.json)
  let news = null;
  try {
    const { shouldAllowEntry, getNewsRiskAdjustment } = require('./tradelab_news_filter');
    const newsCheck = shouldAllowEntry(symbol);
    const newsRisk = getNewsRiskAdjustment(symbol);
    news = {
      allowed: newsCheck.allowed,
      reason: newsCheck.reason,
      sentiment: newsCheck.sentiment ? { label: newsCheck.sentiment.label, score: newsCheck.sentiment.score } : null,
      riskMultiplier: newsRisk.riskMultiplier,
      stopMultiplier: newsRisk.stopMultiplier
    };
  } catch {
    // News filter not available — skip
  }

  return {
    source: {
      symbol,
      interval,
      candles: candles.length,
      first: candles[0].time,
      last: candles[candles.length - 1].time,
      lastClose: candles[candles.length - 1].close
    },
    params,
    marketPhase: {
      phase: phase.phase,
      adx: phase.adx,
      atrPct: phase.atrPct,
      volatility: phase.volatility,
      stopMultiplier: phase.stopMultiplier
    },
    news,
    backtest: base.summary,
    compare,
    optimized: optimized.map((item) => ({ params: describe(item.params), score: item.score, summary: item.summary })),
    walkForward: {
      train: bestTrain.summary,
      test: testSummary,
      stability: wfStatus,
      params: describe(bestTrain.params)
    },
    health: health(base.summary, wfStatus, blocked, params),
    lastTrades: base.account.trades.slice(-5)
  };
}

async function main() {
  const symbol = process.argv[2] || 'BTCUSDT';
  const interval = process.argv[3] || '1h';
  const limit = Number(process.argv[4] || 500);
  console.log(JSON.stringify(await runOnce(symbol, interval, limit), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PARAMS,
  fetchCandles,
  fetchCandlesNoRetry,
  simulate,
  parameterGrid,
  describe,
  health,
  getSignal,
  signalToEntrySide,
  executionPrice,
  exitAction,
  makePosition,
  tradePnl,
  floatingPnl,
  exitReason,
  runOnce
};
