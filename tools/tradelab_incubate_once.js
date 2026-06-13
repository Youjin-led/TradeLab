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
  applyDynamicParams,
  isStrategySuitable
} = require('./tradelab_run_once');
const { detectPhase } = require('./tradelab_market_phase');
const { shouldAllowEntry, getNewsRiskAdjustment, getMarketSentiment } = require('./tradelab_news_filter');
const { applyQuarantineToState, isQuarantined, loadQuarantine, quarantineReason } = require('./tradelab_quarantine');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const AUTO_CANDIDATES_PATH = path.join(__dirname, '..', 'tradelab-auto-candidates.json');

const CANDIDATES = [
  {
    symbol: 'LINKUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'mean-reversion', lookback: 20, deviationPct: 3.2, stopPct: 2.4, takePct: 4.2 }
  },
  {
    symbol: 'BNBUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 42, stopPct: 1.6, takePct: 3 }
  },
  {
    symbol: 'AVAXUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'mean-reversion', lookback: 20, deviationPct: 3.2, stopPct: 1.6, takePct: 3 }
  },
  {
    symbol: 'ETHUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'mean-reversion', lookback: 80, deviationPct: 2, stopPct: 2.4, takePct: 4.2 }
  },
  {
    symbol: 'BTCUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'mean-reversion', lookback: 42, deviationPct: 2, stopPct: 1.6, takePct: 3 }
  },
  {
    symbol: 'INJUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 16, slow: 55, rsiBuy: 42, stopPct: 2.4, takePct: 4.2 }
  },
  {
    symbol: 'NEARUSDT',
    interval: '4h',
    limit: 1000,
    params: { strategy: 'breakout', lookback: 20, stopPct: 3.2, takePct: 5.8 }
  },
  {
    symbol: 'APTUSDT',
    interval: '1h',
    limit: 1000,
    params: { strategy: 'mean-reversion', lookback: 42, deviationPct: 2, stopPct: 2.4, takePct: 4.2 }
  },
  {
    symbol: 'TRXUSDT',
    interval: '1d',
    limit: 1000,
    params: { strategy: 'sma-rsi', fast: 12, slow: 24, rsiBuy: 48, stopPct: 1.6, takePct: 3 }
  }
];

function loadAutoCandidates() {
  if (!fs.existsSync(AUTO_CANDIDATES_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(AUTO_CANDIDATES_PATH, 'utf8'));
  const rows = Array.isArray(data.candidates) ? data.candidates : [];
  const baseKeys = new Set(CANDIDATES.map(keyFor));
  return rows
    .filter((candidate) => candidate && candidate.active !== false && candidate.symbol && candidate.interval && candidate.params)
    .filter((candidate) => !baseKeys.has(keyFor(candidate)))
    .map((candidate) => ({
      symbol: String(candidate.symbol).toUpperCase(),
      interval: String(candidate.interval),
      limit: Number(candidate.limit || 1000),
      params: candidate.params,
      source: candidate.source || 'auto-discovery',
      recovery: candidate.recovery
    }));
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
  const stability = test.pnl > 0 && test.maxDd <= params.maxDrawdownPct && ratio > 0.12
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
  if (record.testTrades < 8 || record.liveObservations < 20 || record.forwardPaperTrades < 10) return 'incubate';
  if (record.health.status === 'Healthy' && record.profitFactor >= 1.4 && record.maxDrawdownPct <= 6) return 'promote-to-manual-review';
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

function updatePaperLedger(ledger, candles, params) {
  const processed = new Set(ledger.processedCloses || []);
  const warmup = Math.max(params.slow + 2, params.lookback + 2, 20);
  let newBars = 0;

  for (let cursor = warmup; cursor <= candles.length; cursor += 1) {
    const candle = candles[cursor - 1];
    const closeKey = `${candle.time}:${candle.close}`;
    if (processed.has(closeKey)) continue;
    processed.add(closeKey);
    newBars += 1;

    const price = candle.close;
    const signal = getSignal(candles, cursor, params);
    const equity = ledger.position ? ledger.balance + floatingPnl(ledger.position, price, params) : ledger.balance;
    ledger.peak = Math.max(ledger.peak, equity);
    ledger.maxDd = Math.max(ledger.maxDd, ((ledger.peak - equity) / ledger.peak) * 100);

    if (ledger.position) {
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
        ledger.position = null;
      }
    } else {
      const side = signalToEntrySide(signal, params);
      if (side) ledger.position = makePosition(side, price, ledger.balance, params, cursor, candle.time);
    }
  }

  ledger.processedCloses = Array.from(processed).slice(-2000);
  return { ledger, newBars };
}

function mergeRecord(previous, candidate, candles, params, result, walk, currentSignal, alerts) {
  const lastCandle = candles[candles.length - 1];
  const prior = previous || {};
  const paper = updatePaperLedger(makePaperLedger(prior, candles), candles, params);
  const observedCloses = new Set(prior.observedCloses || []);
  const closeKey = `${lastCandle.time}:${lastCandle.close}`;
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
  return record;
}

async function incubateOnce() {
  const state = readState();
  state.updatedAt = new Date().toISOString();
  state.candidates = state.candidates || {};
  const quarantine = loadQuarantine();
  applyQuarantineToState(state, quarantine);

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
      const result = simulate(candles, params);
      const walk = splitWalkForward(candles, params);
      const currentSignal = getSignal(candles, candles.length, params);
      const alerts = evaluateGuardrails(result.summary, walk, params);
      const record = mergeRecord(state.candidates[key], candidate, candles, params, result, walk, currentSignal, alerts);
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
  state.summary = {
    updatedAt: state.updatedAt,
    total: allRows.length,
    incubating: allRows.filter((row) => row.status === 'incubating').length,
    readyForReview: allRows.filter((row) => row.status === 'ready-for-review').length,
    rejected: allRows.filter((row) => row.status === 'rejected').length,
    quarantined: allRows.filter((row) => row.status === 'quarantined').length,
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

module.exports = { incubateOnce, CANDIDATES };
