const fs = require('fs');
const path = require('path');

const {
  DEFAULT_PARAMS,
  fetchCandles,
  simulate,
  parameterGrid,
  describe,
  health,
  applyDynamicParams,
  isStrategySuitable
} = require('./tradelab_run_once');
const { detectPhase } = require('./tradelab_market_phase');
const { CANDIDATES } = require('./tradelab_incubate_once');
const { validateStrategy, portfolioKillSwitch } = require('./tradelab_risk_controls');
const { isQuarantined, loadQuarantine, quarantineReason } = require('./tradelab_quarantine');

const ROOT = path.join(__dirname, '..');
const AUTO_CANDIDATES_PATH = path.join(ROOT, 'tradelab-auto-candidates.json');
const RECOVERY_SANDBOX_PATH = path.join(ROOT, 'tradelab-recovery-sandbox.json');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_DAILY_DISCOVERY.md');

const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT', 'DOTUSDT',
  'TRXUSDT', 'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'NEARUSDT',
  'APTUSDT', 'ARBUSDT', 'OPUSDT', 'FILUSDT', 'INJUSDT',
  'SUIUSDT', 'TIAUSDT', 'SEIUSDT', 'RENDERUSDT', 'JUPUSDT'
];
const INTERVALS = ['1h', '4h', '1d'];
const STRATEGIES = ['sma-rsi', 'breakout', 'mean-reversion'];
const LIMIT = 1000;

const RULES = {
  maxAdds: 3,
  minTestTrades: 6,
  minProfitFactor: 1.6,
  maxDrawdownPct: 5.5,
  minScore: 75
};

function keyFor(candidate) {
  return `${candidate.symbol}:${candidate.interval}:${candidate.params.strategy}`;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function scoreSummary(summary) {
  return summary.pnl - summary.maxDd * 22 + Math.min(summary.profitFactor, 6) * 35 + summary.tradeCount * 4;
}

function walkForwardFor(candles, params) {
  const split = Math.floor(candles.length * 0.7);
  const train = candles.slice(0, split);
  const test = candles.slice(split);
  const best = parameterGrid(params)
    .map((candidate) => {
      const summary = simulate(train, candidate).summary;
      return { params: candidate, summary, score: scoreSummary(summary) };
    })
    .sort((a, b) => b.score - a.score)[0];
  const testSummary = simulate(test, best.params).summary;
  const ratio = best.summary.pnl > 0 ? testSummary.pnl / best.summary.pnl : 0;
  const stability = testSummary.pnl > 0 && testSummary.maxDd <= params.maxDrawdownPct && ratio > 0.18
    ? 'stable'
    : best.summary.pnl > 0 && testSummary.pnl < 0
      ? 'overfit risk'
      : 'weak';
  const blocked = testSummary.maxDd >= params.maxDrawdownPct
    || testSummary.maxLossStreak >= 4
    || (testSummary.tradeCount >= 3 && testSummary.profitFactor < 1.05)
    || stability === 'overfit risk';
  return {
    params: best.params,
    train: best.summary,
    test: testSummary,
    stability,
    health: health(testSummary, stability, blocked, params),
    score: scoreSummary(testSummary)
  };
}

function qualifies(row) {
  const validation = validateStrategy(row);
  row.validation = validation;
  row.failReasons = failReasons(row, validation);
  return row.failReasons.length === 0;
}

function failReasons(row, validation = row.validation || validateStrategy(row)) {
  const reasons = [];
  if (row.stability !== 'stable') reasons.push(`walk-forward ${row.stability}`);
  if (row.health.status !== 'Healthy') reasons.push(`health ${row.health.status}`);
  if (row.health.score < RULES.minScore) reasons.push(`health score ${row.health.score} < ${RULES.minScore}`);
  if (row.test.tradeCount < RULES.minTestTrades) reasons.push(`test trades ${row.test.tradeCount} < ${RULES.minTestTrades}`);
  if (row.test.profitFactor < RULES.minProfitFactor) reasons.push(`test PF ${row.test.profitFactor.toFixed(2)} < ${RULES.minProfitFactor}`);
  if (row.test.maxDd > RULES.maxDrawdownPct) reasons.push(`test DD ${row.test.maxDd.toFixed(2)}% > ${RULES.maxDrawdownPct}%`);
  if (!validation.ok) reasons.push(...validation.reasons);
  return Array.from(new Set(reasons));
}

function existingKeys() {
  const auto = readJson(AUTO_CANDIDATES_PATH, { candidates: [] });
  const state = readJson(STATE_PATH, { candidates: {} });
  return new Set([
    ...CANDIDATES.map(keyFor),
    ...(auto.candidates || []).map(keyFor),
    ...Object.keys(state.candidates || {}).filter((key) => (state.candidates[key] || {}).status === 'rejected')
  ]);
}

function candidateFromRow(row) {
  return {
    symbol: row.symbol,
    interval: row.interval,
    limit: LIMIT,
    active: true,
    source: 'daily-discovery',
    addedAt: new Date().toISOString(),
    reason: `${row.strategy} ${row.interval}: PF ${row.test.profitFactor.toFixed(2)}, DD ${row.test.maxDd.toFixed(2)}%, trades ${row.test.tradeCount}`,
    params: row.params
  };
}

function sandboxRow(row) {
  return {
    symbol: row.symbol,
    interval: row.interval,
    strategy: row.strategy,
    score: Number(row.score.toFixed(1)),
    testPnl: Number(row.test.pnl.toFixed(2)),
    profitFactor: Number((Number.isFinite(row.test.profitFactor) ? row.test.profitFactor : 99).toFixed(2)),
    maxDrawdownPct: Number(row.test.maxDd.toFixed(2)),
    trades: row.test.tradeCount,
    winratePct: Number(row.test.winrate.toFixed(1)),
    stability: row.stability,
    health: row.health.status,
    failReasons: row.failReasons || [],
    reason: `${row.strategy} ${row.interval}: PF ${row.test.profitFactor.toFixed(2)}, DD ${row.test.maxDd.toFixed(2)}%, trades ${row.test.tradeCount}`,
    params: row.params
  };
}

function writeReport(rows, nearMisses, added, recoverySandbox, errors, killSwitch, skipped, marketPhases) {
  const lines = [
    '# TradeLab Daily Discovery',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Universe: ${SYMBOLS.length} symbols x ${INTERVALS.length} intervals x ${STRATEGIES.length} strategies`,
    `Rules: trades >= ${RULES.minTestTrades}, PF >= ${RULES.minProfitFactor}, DD <= ${RULES.maxDrawdownPct}%, health score >= ${RULES.minScore}`,
    `Portfolio kill-switch: ${killSwitch.active ? 'ACTIVE' : 'clear'}`,
    `Quarantine skips: ${skipped.length}`,
    '',
    '## Added To Auto-Incubation',
    ''
  ];

  if (added.length) {
    lines.push('Symbol | TF | Strategy | Params | Reason');
    lines.push('--- | --- | --- | --- | ---');
    for (const item of added) {
      lines.push(`${item.symbol} | ${item.interval} | ${item.params.strategy} | ${describe(item.params)} | ${item.reason}`);
    }
  } else {
    lines.push(killSwitch.active ? `No new candidates added because portfolio kill-switch is active: ${killSwitch.reasons.join('; ')}` : 'No new candidates added today.');
  }

  lines.push('', '## Recovery Sandbox', '');
  lines.push('Recovery sandbox rows are paper-only ideas found while the portfolio is blocked. They do not enter auto-incubation until the operator reviews them or the kill-switch clears.');
  lines.push('');
  if (recoverySandbox.rows.length) {
    lines.push('Symbol | TF | Strategy | Score | Test PnL | PF | DD | Trades | Health | Params');
    lines.push('--- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---');
    for (const row of recoverySandbox.rows) {
      lines.push(`${row.symbol} | ${row.interval} | ${row.strategy} | ${row.score} | ${row.testPnl} | ${row.profitFactor} | ${row.maxDrawdownPct}% | ${row.trades} | ${row.health} | ${describe(row.params)}`);
    }
  } else {
    lines.push('No strict recovery ideas passed today.');
  }

  lines.push('', '## Recovery Near Misses', '');
  if (nearMisses.length) {
    lines.push('Symbol | TF | Strategy | Score | Test PnL | PF | DD | Trades | Reasons');
    lines.push('--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---');
    for (const row of nearMisses.slice(0, 12)) {
      lines.push(`${row.symbol} | ${row.interval} | ${row.strategy} | ${row.score.toFixed(1)} | ${row.test.pnl.toFixed(2)} | ${row.test.profitFactor.toFixed(2)} | ${row.test.maxDd.toFixed(2)}% | ${row.test.tradeCount} | ${row.failReasons.join('; ')}`);
    }
  } else {
    lines.push('No profitable near misses recorded today.');
  }

  lines.push('', '## Portfolio Kill-Switch', '');
  lines.push(`- Active: ${killSwitch.active ? 'yes' : 'no'}`);
  lines.push(`- Forward PnL: ${killSwitch.metrics.forwardPnl}`);
  lines.push(`- Forward trades: ${killSwitch.metrics.forwardTrades}`);
  lines.push(`- Rejected ratio: ${(killSwitch.metrics.rejectedRatio * 100).toFixed(1)}%`);
  if (killSwitch.reasons.length) for (const reason of killSwitch.reasons) lines.push(`- Blocker: ${reason}`);

  lines.push('', '## Quarantine Skips', '');
  if (skipped.length) {
    lines.push('Symbol | TF | Strategy | Reason');
    lines.push('--- | --- | --- | ---');
    for (const item of skipped.slice(0, 30)) {
      lines.push(`${item.symbol} | ${item.interval || 'all'} | ${item.strategy || 'all'} | ${item.reason}`);
    }
  } else {
    lines.push('No rows skipped by quarantine.');
  }

  lines.push('', '## Market Phase Overview', '');
  lines.push('Symbol | TF | Phase | ADX | ATR% | BB Width | Volatility | Recommended Strategy');
  lines.push('--- | --- | --- | ---: | ---: | ---: | --- | ---');
  if (marketPhases && marketPhases.length) {
    for (const mp of marketPhases.slice(0, 25)) {
      lines.push(`${mp.symbol} | ${mp.interval} | ${mp.phase} | ${mp.adx} | ${mp.atrPct}% | ${mp.bbWidth}% | ${mp.volatility} | ${mp.recommendedStrategy}`);
    }
  } else {
    lines.push('No market phase data collected.');
  }

  lines.push('', '## Best Qualified Rows', '');
  if (rows.length) {
    lines.push('Symbol | TF | Strategy | Test PnL | PF | DD | Trades | Winrate | Params');
    lines.push('--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---');
    for (const row of rows.slice(0, 12)) {
      lines.push(`${row.symbol} | ${row.interval} | ${row.strategy} | ${row.test.pnl.toFixed(2)} | ${row.test.profitFactor.toFixed(2)} | ${row.test.maxDd.toFixed(2)}% | ${row.test.tradeCount} | ${row.test.winrate.toFixed(1)}% | ${describe(row.params)}`);
    }
  } else {
    lines.push('No rows passed the strict discovery rules.');
  }

  if (errors.length) {
    lines.push('', '## Fetch Errors', '');
    for (const error of errors) lines.push(`- ${error.symbol} ${error.interval}: ${error.error}`);
  }

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function discover() {
  const rows = [];
  const nearMisses = [];
  const errors = [];
  const skipped = [];
  const marketPhases = [];
  const skip = existingKeys();
  const quarantine = loadQuarantine();

  for (const symbol of SYMBOLS) {
    const symbolCandidate = { symbol, interval: '*', params: { strategy: '*' } };
    if (isQuarantined(symbolCandidate, quarantine)) {
      skipped.push({ symbol, reason: quarantineReason(symbolCandidate, quarantine) });
      continue;
    }
    for (const interval of INTERVALS) {
      try {
        const candles = await fetchCandles(symbol, interval, LIMIT);
        
        // Collect market phase data for this symbol/interval
        const phase = detectPhase(candles);
        marketPhases.push({
          symbol,
          interval,
          phase: phase.phase,
          adx: phase.adx,
          atrPct: phase.atrPct,
          bbWidth: phase.bbWidth,
          volatility: phase.volatility,
          recommendedStrategy: phase.recommendedStrategy
        });
        
        for (const strategy of STRATEGIES) {
          const quarantineProbe = { symbol, interval, params: { strategy } };
          if (isQuarantined(quarantineProbe, quarantine)) {
            skipped.push({ symbol, interval, strategy, reason: quarantineReason(quarantineProbe, quarantine) });
            continue;
          }
          const baseParams = { ...DEFAULT_PARAMS, strategy };
          const walk = walkForwardFor(candles, baseParams);
          const row = {
            symbol,
            interval,
            strategy,
            params: walk.params,
            train: walk.train,
            test: walk.test,
            stability: walk.stability,
            health: walk.health,
            score: walk.score
          };
          const known = skip.has(keyFor(row));
          if (qualifies(row) && !known) rows.push(row);
          else if (!known && row.test.pnl > 0 && row.score > 0) nearMisses.push(row);
        }
      } catch (error) {
        errors.push({ symbol, interval, error: error.message });
      }
    }
  }

  rows.sort((a, b) => b.score - a.score || b.test.pnl - a.test.pnl);
  nearMisses.sort((a, b) => b.score - a.score || b.test.pnl - a.test.pnl);
  const auto = readJson(AUTO_CANDIDATES_PATH, { updatedAt: null, candidates: [] });
  const killSwitch = portfolioKillSwitch();
  const added = killSwitch.active ? [] : rows.slice(0, RULES.maxAdds).map(candidateFromRow);
  const recoverySandbox = {
    updatedAt: new Date().toISOString(),
    mode: killSwitch.active ? 'kill-switch-active' : 'standby',
    rule: 'Paper-only recovery ideas. Not auto-incubated, not real-money approval.',
    killSwitch: {
      active: killSwitch.active,
      reasons: killSwitch.reasons,
      metrics: killSwitch.metrics
    },
    rows: rows.slice(0, Math.max(RULES.maxAdds, 8)).map(sandboxRow),
    nearMisses: nearMisses.slice(0, 12).map(sandboxRow)
  };
  auto.updatedAt = new Date().toISOString();
  auto.candidates = [...(auto.candidates || []), ...added];
  fs.writeFileSync(AUTO_CANDIDATES_PATH, `${JSON.stringify(auto, null, 2)}\n`);
  fs.writeFileSync(RECOVERY_SANDBOX_PATH, `${JSON.stringify(recoverySandbox, null, 2)}\n`);
  writeReport(rows, nearMisses, added, recoverySandbox, errors, killSwitch, skipped, marketPhases);

  return {
    generatedAt: auto.updatedAt,
    tested: SYMBOLS.length * INTERVALS.length * STRATEGIES.length,
    qualified: rows.length,
    quarantineSkipped: skipped.length,
    killSwitch,
    added: added.map((candidate) => ({
      symbol: candidate.symbol,
      interval: candidate.interval,
      strategy: candidate.params.strategy,
      reason: candidate.reason
    })),
    recoverySandbox: {
      path: RECOVERY_SANDBOX_PATH,
      rows: recoverySandbox.rows.length,
      nearMisses: recoverySandbox.nearMisses.length
    },
    errors,
    reportPath: REPORT_PATH
  };
}

async function main() {
  const result = await discover();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { discover, RULES };
