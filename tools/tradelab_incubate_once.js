const fs = require('fs');
const path = require('path');

const {
  DEFAULT_PARAMS,
  fetchCandles,
  simulate,
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
  maybePartialTake,
  partialTradePnl,
  timeFilter,
  confirmHigherTimeframe,
  applyDynamicParams,
  isStrategySuitable
} = require('./tradelab_run_once');
const { detectPhase } = require('./tradelab_market_phase');
const { shouldAllowEntry, getNewsRiskAdjustment, getMarketSentiment } = require('./tradelab_news_filter');
const { applyQuarantineToState, isQuarantined, loadQuarantine, quarantineReason } = require('./tradelab_quarantine');
const { REQUIREMENTS } = require('./tradelab_real_money_gate');
const { VALIDATOR_RULES } = require('./tradelab_risk_controls');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const AUTO_CANDIDATES_PATH = path.join(__dirname, '..', 'tradelab-auto-candidates.json');
const RISK_MANAGER_PATH = path.join(__dirname, '..', 'tradelab-risk-manager.json');

// Loss-streak guardrail: a candidate that closes N losing trades in a row is quarantined.
const MAX_CONSECUTIVE_LOSSES = 3;
// Higher-timeframe confirmation interval per entry interval (multi-TF entry filter).
const CONFIRM_INTERVAL = { '5m': '1h', '15m': '1h', '1h': '4h', '4h': '1d', '1d': '1d' };

// MEAN-REVERSION is BLOCKED globally — it caused -11k+ PnL across 8 candidates.
// Only SMA+RSI and Breakout are active. Mean-reversion candidates are removed.
// dynamicRisk: true enables market-phase-aware strategy filtering via isStrategySuitable().
const CANDIDATES = [
  // === SMA+RSI стратегии ===
  {
    symbol: 'SEIUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 42, stopPct: 1.6, takePct: 3, dynamicRisk: true }
  },
  {
    symbol: 'ATOMUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 42, stopPct: 1.6, takePct: 3, dynamicRisk: true }
  },
  {
    symbol: 'INJUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 16, slow: 55, rsiBuy: 42, stopPct: 2.4, takePct: 4.2, dynamicRisk: true }
  },
  {
    symbol: 'JUPUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 42, stopPct: 1.6, takePct: 3, dynamicRisk: true }
  },
  {
    symbol: 'OPUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 42, stopPct: 1.6, takePct: 3, dynamicRisk: true }
  },
  {
    symbol: 'RENDERUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 42, stopPct: 1.6, takePct: 3, dynamicRisk: true }
  },
  // === Breakout стратегии (приоритет на трендовом рынке) ===
  // 4h — основные
  {
    symbol: 'BTCUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.0, takePct: 4.0, dynamicRisk: true }
  },
  {
    symbol: 'ETHUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.0, takePct: 4.0, dynamicRisk: true }
  },
  {
    symbol: 'SOLUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.4, takePct: 4.5, dynamicRisk: true }
  },
  {
    symbol: 'NEARUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 3.2, takePct: 5.8, dynamicRisk: true }
  },
  {
    symbol: 'BNBUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.0, takePct: 4.0, dynamicRisk: true }
  },
  {
    symbol: 'LINKUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.4, takePct: 4.5, dynamicRisk: true }
  },
  {
    symbol: 'DOTUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.4, takePct: 4.5, dynamicRisk: true }
  },
  {
    symbol: 'AVAXUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 2.4, takePct: 4.5, dynamicRisk: true }
  },
  // 1h — быстрые breakout для частых сделок
  {
    symbol: 'SOLUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 1.6, takePct: 3.2, dynamicRisk: true }
  },
  {
    symbol: 'AVAXUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 1.6, takePct: 3.2, dynamicRisk: true }
  },
  {
    symbol: 'DOTUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 1.6, takePct: 3.2, dynamicRisk: true }
  },
  {
    symbol: 'LINKUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 1.6, takePct: 3.2, dynamicRisk: true }
  }
];



// Mean-reversion стратегии глобально заблокированы — показали -11k+ PnL
const BLOCKED_STRATEGIES = ['mean-reversion'];

function isBlockedStrategy(candidate) {
  return BLOCKED_STRATEGIES.includes(candidate.params?.strategy);
}

function loadAutoCandidates() {
  if (!fs.existsSync(AUTO_CANDIDATES_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(AUTO_CANDIDATES_PATH, 'utf8'));
  const rows = Array.isArray(data.candidates) ? data.candidates : [];
  const baseKeys = new Set(CANDIDATES.map(keyFor));
  return rows
    .filter((candidate) => candidate && candidate.active !== false && candidate.symbol && candidate.interval && candidate.params)
    .filter((candidate) => !baseKeys.has(keyFor(candidate)))
    .filter((candidate) => !isBlockedStrategy(candidate))
    .map((candidate) => ({
      symbol: String(candidate.symbol).toUpperCase(),
      interval: String(candidate.interval),
      limit: Number(candidate.limit || 1000),
      params: candidate.params,
      source: candidate.source || 'auto-discovery',
      recovery: candidate.recovery
    }));
}

/**
 * Read the portfolio-level entry gate produced by tradelab_risk_manager.js.
 * When the risk manager has locked trading (portfolio stop-loss / daily loss limit),
 * the incubator stops opening new paper positions.
 */
function readRiskGate() {
  try {
    if (!fs.existsSync(RISK_MANAGER_PATH)) return { allowNewEntries: true, reason: 'no risk manager state yet' };
    const data = JSON.parse(fs.readFileSync(RISK_MANAGER_PATH, 'utf8'));
    if (data.entryGate && typeof data.entryGate.allowNewEntries === 'boolean') {
      return data.entryGate;
    }
    const locks = data.locks || {};
    if (locks.portfolioStopLossLock || locks.dailyLossLock) {
      return { allowNewEntries: false, reason: 'risk manager lock active' };
    }
    return { allowNewEntries: true, reason: 'risk limits OK' };
  } catch {
    return { allowNewEntries: true, reason: 'risk gate unreadable, allowing entries' };
  }
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { createdAt: new Date().toISOString(), candidates: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function keyFor(candidate) {
  return `${candidate.symbol}:${candidate.interval}:${candidate.params.strategy}`;
}

function baseParams(candidate) {
  return { ...DEFAULT_PARAMS, ...candidate.params };
}

function splitWalkForward(candles, params) {
  const split = Math.floor(candles.length * 0.7);
  const train = simulate(candles.slice(0, split), params).summary;
  const test = simulate(candles.slice(split), params).summary;
  const ratio = train.pnl > 0 ? test.pnl / train.pnl : 0;
  const stability = test.pnl > 0 && test.maxDd <= params.maxDrawdownPct && ratio > 0.18
    ? 'stable'
    : train.pnl > 0 && test.pnl < 0
      ? 'overfit risk'
      : 'weak';
  return { train, test, stability };
}

function evaluateGuardrails(summary, walk, params) {
  const alerts = [];
  if (summary.maxDd >= params.maxDrawdownPct) alerts.push(`drawdown ${summary.maxDd.toFixed(2)}% >= limit ${params.maxDrawdownPct}%`);
  if (summary.maxLossStreak >= 4) alerts.push(`loss streak ${summary.maxLossStreak}`);
  if (summary.tradeCount >= 3 && summary.profitFactor < 1.05) alerts.push(`profit factor ${summary.profitFactor.toFixed(2)} < 1.05`);
  if (walk.stability === 'overfit risk') alerts.push('walk-forward overfit risk');
  if (walk.test.tradeCount < 3) alerts.push(`low test sample: ${walk.test.tradeCount} trades`);
  return alerts;
}

function nextDecision(record) {
  const criticalAlerts = record.alerts.filter((alert) => !alert.startsWith('low test sample'));
  if (criticalAlerts.length > 0 || record.health.status === 'Blocked') return 'reject';
  if (record.testTrades < VALIDATOR_RULES.minTestTrades || record.liveObservations < REQUIREMENTS.minLiveObservations || record.forwardPaperTrades < REQUIREMENTS.minClosedPaperTrades) return 'incubate';
  if (record.health.status === 'Healthy' && record.profitFactor >= VALIDATOR_RULES.minProfitFactor && record.maxDrawdownPct <= VALIDATOR_RULES.maxDrawdownPct && record.maxLossStreak <= VALIDATOR_RULES.maxLossStreak && record.forwardPaperPnl > 0) return 'promote-to-manual-review';
  return 'watch';
}

function makePaperLedger(prior, candles) {
  if (prior && prior.paperLedger) return prior.paperLedger;
  return {
    balance: 10000,
    peak: 10000,
    maxDd: 0,
    position: null,
    trades: [],
    processedCloses: candles.map((candle) => `${candle.time}:${candle.close}`).slice(-2000),
    initializedAt: new Date().toISOString()
  };
}

function updatePaperLedger(ledger, candles, params, opts = {}) {
  const { allowNewEntries = true, blockReason = '', confirmCandles = null } = opts;
  const processed = new Set((ledger.processedCloses || []).map((key) => String(key).slice(0, 16)));
  const warmup = Math.max(params.slow + 2, params.lookback + 2, 20);
  let newBars = 0;
  let lossStreakBlocked = false;
  ledger.consecutiveLosses = ledger.consecutiveLosses || 0;

  for (let cursor = warmup; cursor < candles.length; cursor += 1) {
    const candle = candles[cursor - 1];
    const closeKey = candle.time;
    if (processed.has(closeKey)) continue;
    processed.add(closeKey);
    newBars += 1;

    const price = candle.close;
    const signal = getSignal(candles, cursor, params);
    const equity = ledger.position ? ledger.balance + floatingPnl(ledger.position, price, params) : ledger.balance;
    ledger.peak = Math.max(ledger.peak, equity);
    ledger.maxDd = Math.max(ledger.maxDd, ((ledger.peak - equity) / ledger.peak) * 100);

    if (ledger.position) {
      // Partial take profit: bank part of the position at the take target,
      // move the stop to breakeven and trail the remainder.
      if (!ledger.position.partialTaken) {
        const partial = maybePartialTake(ledger.position, price, params);
        if (partial) {
          const exit = executionPrice(price, exitAction(ledger.position.side), params);
          const result = partialTradePnl(ledger.position, exit, partial.partialQty, params);
          ledger.balance += result.net;
          ledger.trades.push({
            side: ledger.position.side,
            entry: ledger.position.entry,
            exit,
            pnl: result.net,
            pnlPct: result.pct,
            reason: 'partial-take',
            entryTime: ledger.position.entryTime,
            exitTime: candle.time
          });
          ledger.position.qty -= partial.partialQty;
          ledger.position.entryFee -= result.entryFee;
          ledger.position.partialTaken = true;
          ledger.position.stop = ledger.position.entry;
        }
      }
      const reason = exitReason(ledger.position, signal, price);
      if (reason) {
        const exit = executionPrice(price, exitAction(ledger.position.side), params);
        const result = tradePnl(ledger.position, exit, params);
        ledger.balance += result.net;
        ledger.trades.push({
          side: ledger.position.side,
          entry: ledger.position.entry,
          exit,
          pnl: result.net,
          pnlPct: result.pct,
          reason,
          entryTime: ledger.position.entryTime,
          exitTime: candle.time
        });
        if (result.net < 0) {
          ledger.consecutiveLosses += 1;
        } else {
          ledger.consecutiveLosses = 0;
        }
        if (ledger.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) lossStreakBlocked = true;
        ledger.position = null;
      }
    } else {
      const side = signalToEntrySide(signal, params);
      if (!side) continue;
      if (ledger.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
        lossStreakBlocked = true;
        ledger.blockedEntries = (ledger.blockedEntries || 0) + 1;
        ledger.lastBlockReason = 'loss streak';
        continue;
      }
      if (!allowNewEntries) {
        ledger.blockedEntries = (ledger.blockedEntries || 0) + 1;
        ledger.lastBlockReason = blockReason || 'entry gate closed';
        continue;
      }
      const tf = timeFilter(candle.time, params);
      if (tf.blocked) {
        ledger.blockedEntries = (ledger.blockedEntries || 0) + 1;
        ledger.lastBlockReason = tf.reason;
        continue;
      }
      if (params.dynamicRisk && !isStrategySuitable(candles, params)) {
        ledger.blockedEntries = (ledger.blockedEntries || 0) + 1;
        ledger.lastBlockReason = `phase mismatch (${params.marketPhase || 'unknown'})`;
        continue;
      }
      const phase = detectPhase(candles);
      const atrValue = phase.atrPct || 0;
      if (!(atrValue >= (params.minAtrPct || 0.3) && atrValue <= (params.maxAtrPct || 5.0))) {
        ledger.blockedEntries = (ledger.blockedEntries || 0) + 1;
        ledger.lastBlockReason = `atr filter ${atrValue.toFixed(2)}%`;
        continue;
      }
      const htf = confirmHigherTimeframe(confirmCandles, side, params);
      if (htf === false) {
        ledger.blockedEntries = (ledger.blockedEntries || 0) + 1;
        ledger.lastBlockReason = 'htf confirmation failed';
        continue;
      }
      ledger.position = makePosition(side, price, ledger.balance, params, cursor, candle.time, tf.qtyScale || 1);
      ledger.entries = (ledger.entries || 0) + 1;
    }
  }

  ledger.processedCloses = Array.from(processed).slice(-2000);
  return { ledger, newBars, lossStreakBlocked };
}

function mergeRecord(previous, candidate, candles, params, result, walk, alerts, opts = {}) {
  const lastCandle = candles[candles.length - 1];
  const prior = previous || {};
  const effectiveParams = applyDynamicParams(candles, { ...params });
  const currentSignal = getSignal(candles, candles.length, effectiveParams);
  const paper = updatePaperLedger(makePaperLedger(prior, candles), candles, effectiveParams, opts);
  const observedCloses = new Set((prior.observedCloses || []).map((key) => String(key).slice(0, 16)));
  const closeKey = lastCandle.time;
  const isNewObservation = !observedCloses.has(closeKey);
  observedCloses.add(closeKey);

  // Check market phase
  const phase = detectPhase(candles);
  
  // Check news sentiment
  const newsCheck = shouldAllowEntry(candidate.symbol);
  const newsRisk = getNewsRiskAdjustment(candidate.symbol);
  
  // Add news alerts if entry is blocked by news
  if (!newsCheck.allowed) {
    alerts.push(`news block: ${newsCheck.reason}`);
  }

  const record = {
    key: keyFor(candidate),
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.params.strategy,
    source: candidate.source || prior.source || 'base',
    params: describe(params),
    rawParams: params,
    status: prior.status || 'incubating',
    startedAt: prior.startedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastCandle: lastCandle.time,
    lastClose: lastCandle.close,
    lastSignal: currentSignal.action,
    liveObservations: (prior.liveObservations || 0) + (isNewObservation ? 1 : 0),
    closedPaperTrades: result.account.trades.length,
    forwardPaperTrades: paper.ledger.trades.length,
    forwardPaperPnl: Number((paper.ledger.balance - 10000).toFixed(2)),
    forwardPaperMaxDd: Number(paper.ledger.maxDd.toFixed(2)),
    forwardOpenPosition: paper.ledger.position ? paper.ledger.position.side : 'none',
    forwardOpenNotional: paper.ledger.position ? Number(paper.ledger.position.notional || 0) : 0,
    consecutiveLosses: paper.ledger.consecutiveLosses || 0,
    blockedEntries: paper.ledger.blockedEntries || 0,
    lastBlockReason: paper.ledger.lastBlockReason || '',
    newForwardBars: paper.newBars,
    totalPnl: Number(result.summary.pnl.toFixed(2)),
    profitFactor: Number((Number.isFinite(result.summary.profitFactor) ? result.summary.profitFactor : 99).toFixed(2)),
    winratePct: Number(result.summary.winrate.toFixed(1)),
    maxDrawdownPct: Number(result.summary.maxDd.toFixed(2)),
    maxLossStreak: result.summary.maxLossStreak,
    testPnl: Number(walk.test.pnl.toFixed(2)),
    testTrades: walk.test.tradeCount,
    walkForward: walk.stability,
    alerts,
    health: health(result.summary, walk.stability, alerts.some((alert) => !alert.startsWith('low test sample')), params),
    probation: prior.probation,
    previousStatus: prior.previousStatus,
    quarantine: prior.quarantine,
    recovery: prior.recovery || candidate.recovery,
    paperLedger: paper.ledger,
    observedCloses: Array.from(observedCloses).slice(-200),
    // New fields
    marketPhase: phase.phase,
    marketAdx: phase.adx,
    marketAtrPct: phase.atrPct,
    newsSentiment: newsCheck.sentiment ? newsCheck.sentiment.label : 'no-data',
    newsScore: newsCheck.sentiment ? newsCheck.sentiment.score : 0,
    newsRiskMultiplier: newsRisk.riskMultiplier,
    newsStopMultiplier: newsRisk.stopMultiplier
  };
  record.decision = nextDecision(record);
  record.status = record.decision === 'reject'
    ? 'rejected'
    : record.decision === 'promote-to-manual-review'
      ? 'ready-for-review'
      : 'incubating';
  if (prior.status === 'quarantined') {
    record.status = 'quarantined';
    record.decision = prior.decision || 'quarantine';
    record.quarantine = prior.quarantine || {
      active: true,
      reason: 'preserved previous quarantine status',
      updatedAt: new Date().toISOString()
    };
    record.alerts = Array.from(new Set([...(record.alerts || []), `quarantine: ${record.quarantine.reason}`]));
  }
  // Loss-streak guardrail: N consecutive losing trades quarantines the candidate.
  if (paper.lossStreakBlocked && record.status !== 'quarantined') {
    const reason = `loss streak: ${MAX_CONSECUTIVE_LOSSES} consecutive losing paper trades`;
    record.status = 'quarantined';
    record.decision = 'quarantine';
    record.quarantine = { active: true, reason, updatedAt: new Date().toISOString() };
    record.alerts = Array.from(new Set([...(record.alerts || []), `quarantine: ${reason}`]));
  }
  return record;
}

async function incubateOnce() {
  const state = readState();
  state.updatedAt = new Date().toISOString();
  state.candidates = state.candidates || {};
  const quarantine = loadQuarantine();
  applyQuarantineToState(state, quarantine);
  const riskGate = readRiskGate();

  const rows = [];
  const errors = [];
  const candidateList = [...CANDIDATES, ...loadAutoCandidates()];
  for (const candidate of candidateList) {
    if (isQuarantined(candidate, quarantine)) {
      const key = keyFor(candidate);
      const prior = state.candidates[key];
      if (prior) rows.push(prior);
      if (!prior) {
        const quarantinedRecord = {
          key,
          symbol: candidate.symbol,
          interval: candidate.interval,
          strategy: candidate.params.strategy,
          params: describe(baseParams(candidate)),
          status: 'quarantined',
          decision: 'quarantine',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          alerts: [`quarantine: ${quarantineReason(candidate, quarantine)}`],
          health: { status: 'Blocked', score: 0, reasons: ['quarantined by drawdown diagnostics'] },
          quarantine: {
            active: true,
            reason: quarantineReason(candidate, quarantine),
            updatedAt: quarantine.generatedAt || new Date().toISOString()
          }
        };
        state.candidates[key] = quarantinedRecord;
        rows.push(quarantinedRecord);
      }
      continue;
    }
    const key = keyFor(candidate);
    try {
      const params = baseParams(candidate);
      const candles = await fetchCandles(candidate.symbol, candidate.interval, candidate.limit);
      const priorStatus = state.candidates[key] && state.candidates[key].status;
      const allowNewEntries = riskGate.allowNewEntries && !['quarantined', 'rejected'].includes(priorStatus);
      const blockReason = allowNewEntries
        ? ''
        : priorStatus === 'rejected'
          ? 'candidate rejected — new entries paused'
          : priorStatus === 'quarantined'
            ? 'candidate quarantined — new entries paused'
            : riskGate.reason || 'risk gate closed';
      let confirmCandles = null;
      const confirmInterval = CONFIRM_INTERVAL[candidate.interval];
      if (confirmInterval && confirmInterval !== candidate.interval) {
        try {
          confirmCandles = await fetchCandles(candidate.symbol, confirmInterval, 200);
        } catch (_) { /* HTF confirmation is optional — don't block on network */ }
      }
      const result = simulate(candles, params);
      const walk = splitWalkForward(candles, params);
      const alerts = evaluateGuardrails(result.summary, walk, params);
      const record = mergeRecord(state.candidates[key], candidate, candles, params, result, walk, alerts, { allowNewEntries, blockReason, confirmCandles });
      state.candidates[key] = record;
      rows.push(record);
    } catch (error) {
      const prior = state.candidates[key];
      const message = error && error.message ? error.message : String(error);
      errors.push({ key, symbol: candidate.symbol, interval: candidate.interval, strategy: candidate.params.strategy, error: message });
      if (prior) {
        prior.updatedAt = prior.updatedAt || new Date().toISOString();
        prior.lastNetworkError = { at: new Date().toISOString(), message };
        state.candidates[key] = prior;
        rows.push(prior);
      } else {
        const failedRecord = {
          key,
          symbol: candidate.symbol,
          interval: candidate.interval,
          strategy: candidate.params.strategy,
          params: describe(baseParams(candidate)),
          status: 'incubating',
          decision: 'network-wait',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          alerts: [`network error: ${message}`],
          health: { status: 'Caution', score: 50, reasons: ['waiting for candle fetch'] },
          lastNetworkError: { at: new Date().toISOString(), message }
        };
        state.candidates[key] = failedRecord;
        rows.push(failedRecord);
      }
    }
  }

  const allRows = Object.values(state.candidates || {});
  // Определяем доминирующую фазу рынка среди кандидатов
  const phaseCounts = {};
  for (const row of allRows) {
    const p = row.marketPhase || 'unknown';
    phaseCounts[p] = (phaseCounts[p] || 0) + 1;
  }
  const dominantPhase = Object.entries(phaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

  state.summary = {
    updatedAt: state.updatedAt,
    total: allRows.length,
    incubating: allRows.filter((row) => row.status === 'incubating').length,
    readyForReview: allRows.filter((row) => row.status === 'ready-for-review').length,
    rejected: allRows.filter((row) => row.status === 'rejected').length,
    quarantined: allRows.filter((row) => row.status === 'quarantined').length,
    marketPhase: dominantPhase,
    networkErrors: errors.length,
    networkErrorKeys: errors.map((error) => error.key),
    nextAction: allRows.some((row) => row.status === 'quarantined')
      ? 'review quarantined strategies before adding similar candidates'
      : allRows.some((row) => row.status === 'incubating')
      ? 'continue paper incubation'
      : allRows.some((row) => row.status === 'ready-for-review')
        ? 'manual risk review'
        : 'research new candidates'
  };

  writeState(state);
  return { summary: state.summary, errors, candidates: rows.map(({ observedCloses, paperLedger, ...row }) => row) };
}

async function main() {
  const output = await incubateOnce();
  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { incubateOnce, CANDIDATES, updatePaperLedger, readRiskGate, MAX_CONSECUTIVE_LOSSES, CONFIRM_INTERVAL };
