// Independent OKX-contract research ledger. Never writes the production incubation state.
const fs = require('fs');
const path = require('path');
const { fetchOkxSwapCandles } = require('./tradelab_okx_candles');
const { DEFAULT_PARAMS, simulate } = require('./tradelab_run_once');
const { liveParamsForCandles } = require('./tradelab_live_params');
const { updatePaperLedger, closedPaperPositionCount, CONFIRM_INTERVAL } = require('./tradelab_incubate_once');
const { evaluateGate } = require('./tradelab_real_money_gate');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-okx-shadow-state.json');
const INCUBATION_PATH = path.join(ROOT, 'tradelab-incubation-state.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function freshLedger(candles) {
  return {
    balance: 10000, peak: 10000, maxDd: 0, position: null, trades: [],
    processedCloses: candles.slice(0, -1).map((c) => c.time),
    initializedAt: new Date().toISOString()
  };
}

function skipBacklog(ledger, candles) {
  const processed = new Set((ledger.processedCloses || []).map(String));
  const pending = candles.slice(0, -1).filter((c) => !processed.has(c.time));
  if (pending.length <= 1) return 0;
  for (const candle of pending.slice(0, -1)) processed.add(candle.time);
  ledger.processedCloses = [...processed].slice(-2000);
  ledger.skippedBacklogBars = (ledger.skippedBacklogBars || 0) + pending.length - 1;
  return pending.length - 1;
}

function compactSummary(summary) {
  return {
    pnl: Number(summary.pnl.toFixed(2)), trades: summary.tradeCount,
    profitFactor: Number.isFinite(summary.profitFactor) ? Number(summary.profitFactor.toFixed(2)) : null,
    maxDrawdownPct: Number(summary.maxDd.toFixed(2)),
    maxLossStreak: summary.maxLossStreak
  };
}

async function observe(candidate, previous) {
  if (!candidate.rawParams || !candidate.interval || !candidate.symbol) {
    throw new Error('Candidate has no source parameters');
  }
  const candles = await fetchOkxSwapCandles(candidate.symbol, candidate.interval, 1000);
  const params = liveParamsForCandles(candles, { ...DEFAULT_PARAMS, ...candidate.rawParams });
  const paramsFingerprint = JSON.stringify({ version: 'full-take-live-params-v1', rawParams: candidate.rawParams });
  const continued = previous?.paramsFingerprint === paramsFingerprint;
  const confirmInterval = CONFIRM_INTERVAL[candidate.interval];
  const requireHtf = !!confirmInterval && confirmInterval !== candidate.interval;
  const confirmCandles = requireHtf
    ? await fetchOkxSwapCandles(candidate.symbol, confirmInterval, 200)
    : null;
  const ledger = continued ? previous.ledger : freshLedger(candles);
  const skippedBacklogBars = skipBacklog(ledger, candles);
  const forward = updatePaperLedger(ledger, candles, params, { requireHtf, confirmCandles });
  const grossProfit = forward.ledger.trades.reduce((sum, trade) => sum + Math.max(0, Number(trade.pnl) || 0), 0);
  const grossLoss = forward.ledger.trades.reduce((sum, trade) => sum + Math.max(0, -(Number(trade.pnl) || 0)), 0);
  const backtest = continued && previous.backtest
    ? previous.backtest
    : compactSummary(simulate(candles.slice(0, -1), { ...params, skipDynamicReapply: true }).summary);
  let holdout = continued ? previous.holdout : null;
  let holdoutStress = continued ? previous.holdoutStress : null;
  if (!holdout || !holdoutStress) {
    const completed = candles.slice(0, -1);
    const split = Math.floor(completed.length * 0.7);
    const trainParams = liveParamsForCandles(completed.slice(0, split),
      { ...DEFAULT_PARAMS, ...candidate.rawParams });
    const testBars = completed.slice(split);
    holdout = compactSummary(simulate(testBars, { ...trainParams, skipDynamicReapply: true }).summary);
    holdoutStress = compactSummary(simulate(testBars, {
      ...trainParams, feePct: trainParams.feePct * 2,
      slippagePct: trainParams.slippagePct * 2, skipDynamicReapply: true
    }).summary);
  }
  return {
    key: candidate.key, symbol: candidate.symbol, interval: candidate.interval,
    strategy: candidate.strategy, source: 'OKX swap candles',
    startedAt: continued ? previous.startedAt : new Date().toISOString(),
    paramsFingerprint,
    updatedAt: new Date().toISOString(),
    lastCompletedBar: candles.at(-2).time,
    newForwardBars: forward.newBars,
    skippedBacklogBars,
    backtest,
    holdout,
    holdoutStress,
    forward: {
      closedTrades: closedPaperPositionCount(forward.ledger),
      realizedPnl: Number((forward.ledger.balance - 10000).toFixed(2)),
      profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : grossProfit > 0 ? 99 : 0,
      maxDrawdownPct: Number(forward.ledger.maxDd.toFixed(2)),
      openSide: forward.ledger.position?.side || null,
      blockedEntries: forward.ledger.blockedEntries || 0,
      lastBlockReason: forward.ledger.lastBlockReason || null
    },
    ledger: forward.ledger
  };
}

async function run() {
  require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
  const incubation = readJson(INCUBATION_PATH, null);
  if (!incubation?.candidates) throw new Error('Incubation state unavailable');
  const state = readJson(STATE_PATH, { version: 1, candidates: {} });
  if (state.version !== 1 || !state.candidates) throw new Error('Unexpected OKX shadow state');
  const selected = new Set([
    ...evaluateGate({ skipOkxEvidence: true }).allowed.map((c) => c.key),
    ...Object.values(incubation.candidates).filter((c) =>
      ['incubating', 'probation', 'ready-for-review'].includes(c.status)
      && c.marketDataSource === 'okx-swap'
      && c.health?.status === 'Healthy'
      && Number(c.forwardPaperTrades) >= 3
    ).map((c) => c.key),
    ...Object.keys(state.candidates)
  ]);
  const results = [];
  for (const key of selected) {
    const candidate = incubation.candidates[key];
    if (!candidate) continue;
    try {
      const row = await observe(candidate, state.candidates[key]);
      state.candidates[key] = row;
      results.push({ key, newForwardBars: row.newForwardBars, skippedBacklogBars: row.skippedBacklogBars,
        backtest: row.backtest, holdout: row.holdout,
        holdoutStress: row.holdoutStress, forward: row.forward });
    } catch (error) {
      results.push({ key, error: error.message });
    }
  }
  state.updatedAt = new Date().toISOString();
  const temp = `${STATE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, STATE_PATH);
  return { updatedAt: state.updatedAt, results };
}

if (require.main === module) run().then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { freshLedger, skipBacklog, observe, run };

