const fs = require('fs');
const path = require('path');

const {
  DEFAULT_PARAMS,
  fetchCandles,
  simulate,
  parameterGrid,
  describe,
  health
} = require('./tradelab_run_once');
const { CANDIDATES } = require('./tradelab_incubate_once');
const { validateStrategy, portfolioKillSwitch } = require('./tradelab_risk_controls');
const { isQuarantined, loadQuarantine, quarantineReason } = require('./tradelab_quarantine');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const AUTO_CANDIDATES_PATH = path.join(ROOT, 'tradelab-auto-candidates.json');
const JSON_PATH = path.join(ROOT, 'tradelab-replacement-scout.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_REPLACEMENT_SCOUT.md');

const SYMBOLS = [
  'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT',
  'LTCUSDT', 'BCHUSDT', 'ATOMUSDT', 'ARBUSDT', 'OPUSDT',
  'FILUSDT', 'SUIUSDT', 'TIAUSDT', 'SEIUSDT', 'JUPUSDT',
  'BNBUSDT', 'TRXUSDT', 'LINKUSDT'
];
const INTERVALS = ['4h', '1d'];
const STRATEGIES = ['sma-rsi', 'breakout'];
const LIMIT = 1000;

const RULES = {
  shortlistSize: 8,
  minTestTrades: 6,
  minProfitFactor: 1.65,
  maxDrawdownPct: 5.25,
  minScore: 78,
  minWalkForwardRatio: 0.22
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function keyFor(candidate) {
  const strategy = candidate.strategy || (candidate.params || {}).strategy;
  return `${candidate.symbol}:${candidate.interval}:${strategy}`;
}

function scoreSummary(summary) {
  return summary.pnl - summary.maxDd * 25 + Math.min(summary.profitFactor, 7) * 42 + summary.tradeCount * 4;
}

function existingKeys() {
  const auto = readJson(AUTO_CANDIDATES_PATH, { candidates: [] });
  const state = readJson(STATE_PATH, { candidates: {} });
  return new Set([
    ...CANDIDATES.map(keyFor),
    ...(auto.candidates || []).map(keyFor),
    ...Object.keys(state.candidates || {})
  ]);
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
  const stability = testSummary.pnl > 0 && testSummary.maxDd <= params.maxDrawdownPct && ratio >= RULES.minWalkForwardRatio
    ? 'stable'
    : best.summary.pnl > 0 && testSummary.pnl < 0
      ? 'overfit risk'
      : 'weak';
  const blocked = testSummary.maxDd >= params.maxDrawdownPct
    || testSummary.maxLossStreak >= 4
    || (testSummary.tradeCount >= 3 && testSummary.profitFactor < 1.1)
    || stability === 'overfit risk';
  return {
    params: best.params,
    train: best.summary,
    test: testSummary,
    ratio,
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

function candidateFromRow(row) {
  return {
    symbol: row.symbol,
    interval: row.interval,
    limit: LIMIT,
    active: false,
    source: 'replacement-scout',
    scoutedAt: new Date().toISOString(),
    reason: `${row.strategy} ${row.interval}: test PF ${row.test.profitFactor.toFixed(2)}, DD ${row.test.maxDd.toFixed(2)}%, trades ${row.test.tradeCount}, WF ratio ${row.ratio.toFixed(2)}`,
    params: row.params
  };
}

function writeReport(output) {
  const lines = [
    '# TradeLab Replacement Scout',
    '',
    `Generated: ${output.generatedAt}`,
    `Universe: ${SYMBOLS.length} symbols x ${INTERVALS.length} intervals x ${STRATEGIES.length} strategies`,
    `Rules: trades >= ${RULES.minTestTrades}, PF >= ${RULES.minProfitFactor}, DD <= ${RULES.maxDrawdownPct}%, health score >= ${RULES.minScore}, WF ratio >= ${RULES.minWalkForwardRatio}`,
    `Portfolio kill-switch: ${output.killSwitch.active ? 'ACTIVE' : 'clear'}`,
    '',
    'This report is paper-only. It finds replacement candidates but does not activate them or approve real-money trading.',
    '',
    '## Shortlist',
    ''
  ];

  if (output.shortlist.length) {
    lines.push('Symbol | TF | Strategy | Score | Test PnL | PF | DD | Trades | Winrate | Params');
    lines.push('--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---');
    for (const row of output.shortlist) {
      lines.push(`${row.symbol} | ${row.interval} | ${row.strategy} | ${row.score.toFixed(1)} | ${row.test.pnl.toFixed(2)} | ${row.test.profitFactor.toFixed(2)} | ${row.test.maxDd.toFixed(2)}% | ${row.test.tradeCount} | ${row.test.winrate.toFixed(1)}% | ${describe(row.params)}`);
    }
  } else {
    lines.push('No replacement candidates passed the strict rules today.');
  }

  lines.push('', '## Near Misses', '');
  if (output.nearMisses.length) {
    lines.push('Symbol | TF | Strategy | Score | Test PnL | PF | DD | Trades | Reasons');
    lines.push('--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---');
    for (const row of output.nearMisses) {
      lines.push(`${row.symbol} | ${row.interval} | ${row.strategy} | ${row.score.toFixed(1)} | ${row.test.pnl.toFixed(2)} | ${row.test.profitFactor.toFixed(2)} | ${row.test.maxDd.toFixed(2)}% | ${row.test.tradeCount} | ${row.failReasons.join('; ')}`);
    }
  } else {
    lines.push('No near misses recorded.');
  }

  lines.push('', '## Skips', '');
  if (output.skipped.length) {
    lines.push('Symbol | TF | Strategy | Reason');
    lines.push('--- | --- | --- | ---');
    for (const item of output.skipped.slice(0, 40)) {
      lines.push(`${item.symbol} | ${item.interval || 'all'} | ${item.strategy || 'all'} | ${item.reason}`);
    }
  } else {
    lines.push('No skips.');
  }

  if (output.errors.length) {
    lines.push('', '## Fetch Errors', '');
    for (const error of output.errors) lines.push(`- ${error.symbol} ${error.interval}: ${error.error}`);
  }

  lines.push(
    '',
    '## Operator Rule',
    '',
    'A scout candidate can enter auto-incubation only after manual review or a future explicit promotion command. It must still pass paper incubation, quarantine, kill-switch, and the real-money gate.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function scoutReplacements() {
  const quarantine = loadQuarantine();
  const skipKeys = existingKeys();
  const rows = [];
  const nearMisses = [];
  const skipped = [];
  const errors = [];

  for (const symbol of SYMBOLS) {
    const symbolProbe = { symbol, interval: '*', params: { strategy: '*' } };
    if (isQuarantined(symbolProbe, quarantine)) {
      skipped.push({ symbol, reason: quarantineReason(symbolProbe, quarantine) });
      continue;
    }

    for (const interval of INTERVALS) {
      let candles;
      try {
        candles = await fetchCandles(symbol, interval, LIMIT);
      } catch (error) {
        errors.push({ symbol, interval, error: error.message });
        continue;
      }

      for (const strategy of STRATEGIES) {
        const probe = { symbol, interval, params: { strategy } };
        const key = keyFor(probe);
        if (skipKeys.has(key)) {
          skipped.push({ symbol, interval, strategy, reason: 'already known in base, auto, or incubation state' });
          continue;
        }
        if (isQuarantined(probe, quarantine)) {
          skipped.push({ symbol, interval, strategy, reason: quarantineReason(probe, quarantine) });
          continue;
        }

        const walk = walkForwardFor(candles, { ...DEFAULT_PARAMS, strategy });
        const row = {
          symbol,
          interval,
          strategy,
          params: walk.params,
          train: walk.train,
          test: walk.test,
          ratio: walk.ratio,
          stability: walk.stability,
          health: walk.health,
          score: walk.score
        };
        if (qualifies(row)) rows.push(row);
        else if (row.score > 0 && row.test.pnl > 0) nearMisses.push(row);
      }
    }
  }

  rows.sort((a, b) => b.score - a.score || b.test.pnl - a.test.pnl);
  nearMisses.sort((a, b) => b.score - a.score || b.test.pnl - a.test.pnl);
  const shortlist = rows.slice(0, RULES.shortlistSize);
  const output = {
    generatedAt: new Date().toISOString(),
    tested: SYMBOLS.length * INTERVALS.length * STRATEGIES.length,
    qualified: rows.length,
    shortlist,
    nearMisses: nearMisses.slice(0, 12),
    reserveCandidates: shortlist.map(candidateFromRow),
    skipped,
    errors,
    killSwitch: portfolioKillSwitch(),
    reportPath: REPORT_PATH
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeReport(output);
  return {
    generatedAt: output.generatedAt,
    tested: output.tested,
    qualified: output.qualified,
    shortlist: output.shortlist.map((row) => ({
      symbol: row.symbol,
      interval: row.interval,
      strategy: row.strategy,
      score: Number(row.score.toFixed(1)),
      testPnl: Number(row.test.pnl.toFixed(2)),
      profitFactor: Number(row.test.profitFactor.toFixed(2)),
      drawdown: Number(row.test.maxDd.toFixed(2)),
      trades: row.test.tradeCount
    })),
    nearMisses: output.nearMisses.map((row) => ({
      symbol: row.symbol,
      interval: row.interval,
      strategy: row.strategy,
      score: Number(row.score.toFixed(1)),
      testPnl: Number(row.test.pnl.toFixed(2)),
      profitFactor: Number(row.test.profitFactor.toFixed(2)),
      drawdown: Number(row.test.maxDd.toFixed(2)),
      trades: row.test.tradeCount,
      reasons: row.failReasons
    })),
    skipped: skipped.length,
    errors,
    reportPath: REPORT_PATH,
    jsonPath: JSON_PATH
  };
}

async function main() {
  const result = await scoutReplacements();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { scoutReplacements, RULES };
