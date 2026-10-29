/**
 * TradeLab Walk-Forward Daily
 *
 * One-shot daily job: runs walk-forward anti-overfit validation for every
 * incubating candidate and writes a report. Paper-only research - it never
 * touches live state or places orders.
 *
 * Usage:
 *   node tools/tradelab_walk_forward_daily.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  fetchCandles,
  simulate,
  parameterGrid,
  DEFAULT_PARAMS
} = require('./tradelab_run_once');
const {
  walkForwardAnalysis,
  WF_CONFIG
} = require('./tradelab_walk_forward');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const JSON_PATH = path.join(ROOT, 'tradelab-walkforward-daily.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_WALKFORWARD_DAILY.md');

const SYMBOLS = ['INJUSDT', 'DOTUSDT', 'NEARUSDT', 'SEIUSDT', 'BCHUSDT', 'LTCUSDT'];
const INTERVALS = ['1h', '4h'];
const STRATEGIES = ['sma-rsi', 'breakout'];
const LIMIT = 1000;
const MAX_CANDIDATES = 12;

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function candleTimeStr(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function fetchCandlesDeep(symbol, interval, targetBars) {
  return require('./tradelab_okx_candles').fetchOkxSwapCandles(symbol, interval, targetBars);
}

function parseParamsDescription(description) {
  const params = { ...DEFAULT_PARAMS };

  if (description.startsWith('SMA')) {
    const m = description.match(/SMA (\d+)\/(\d+), RSI (\d+)/);
    if (m) {
      params.fast = Number(m[1]);
      params.slow = Number(m[2]);
      params.rsiBuy = Number(m[3]);
      params.strategy = 'sma-rsi';
    }
  } else if (description.startsWith('Breakout')) {
    const m = description.match(/Breakout LB (\d+)/);
    if (m) {
      params.lookback = Number(m[1]);
      params.strategy = 'breakout';
    }
  } else if (description.startsWith('Mean Reversion')) {
    const m = description.match(/Mean Reversion LB (\d+), dev ([\d.]+)%/);
    if (m) {
      params.lookback = Number(m[1]);
      params.deviationPct = Number(m[2]);
      params.strategy = 'mean-reversion';
    }
  } else if (description.startsWith('BB')) {
    const m = description.match(/BB (\d+)\/([\d.]+), RSI O(\d+)/);
    if (m) {
      params.bbPeriod = Number(m[1]);
      params.bbStd = Number(m[2]);
      params.rsiOversold = Number(m[3]);
      params.rsiOverbought = 100 - Number(m[3]);
      params.strategy = 'bb-reversion';
    }
  } else if (description.startsWith('EMA')) {
    const m = description.match(/EMA (\d+)\/(\d+), RSI (\d+)/);
    if (m) {
      params.emaFast = Number(m[1]);
      params.emaSlow = Number(m[2]);
      params.rsiBuy = Number(m[3]);
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

function strategyMetricsFn(candles, params) {
  const summary = simulate(candles, params).summary;
  return {
    trades: summary.tradeCount,
    pnl: summary.pnl,
    profitFactor: summary.profitFactor,
    maxDd: summary.maxDd,
    winRate: summary.winrate
  };
}

function toParamGrid(params) {
  const grid = {};
  for (const key of Object.keys(params)) {
    if (key === 'strategy' || key === 'symbol' || key === 'interval') continue;
    if (typeof params[key] !== 'number') continue;
    grid[key] = [params[key]];
  }
  return grid;
}

function candidateList() {
  const state = readJson(STATE_PATH, { candidates: {} });
  const rows = [];
  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      for (const strategy of STRATEGIES) {
        const key = `${symbol}:${interval}:${strategy}`;
        rows.push({ key, symbol, interval, strategy, candidate: (state.candidates || {})[key] || null });
      }
    }
  }
  return rows;
}

async function run() {
  const rows = candidateList().filter((r) => r.candidate);
  const results = [];
  const errors = [];
  let tested = 0;
  let passed = 0;

  for (const row of rows.slice(0, MAX_CANDIDATES)) {
    try {
      const target = row.interval === '4h' ? 4000 : 3000;
      const candles = await fetchCandlesDeep(row.symbol, row.interval, target);
      const params = candidateBaseParams(row.candidate);
      const grid = toParamGrid(params);
      const result = walkForwardAnalysis(strategyMetricsFn, candles, grid);
      const clean = result.antiOverfit && result.antiOverfit.status === 'CLEAN'
        && result.verdict && result.verdict.indexOf('PASSED') === 0;
      if (clean) passed += 1;
      tested += 1;
      results.push({
        key: row.key,
        symbol: row.symbol,
        interval: row.interval,
        strategy: row.strategy,
        status: row.candidate.status,
        forwardTrades: row.candidate.forwardPaperTrades || 0,
        forwardPnl: row.candidate.forwardPaperPnl,
        forwardPF: row.candidate.forwardProfitFactor,
        verdict: result.verdict,
        antiOverfit: result.antiOverfit,
        bestCandidate: result.bestCandidate,
        outOfSample: result.outOfSample
      });
    } catch (error) {
      errors.push({ key: row.key, error: error.message || String(error) });
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    config: WF_CONFIG,
    tested,
    passed,
    results,
    errors
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  fs.writeFileSync(REPORT_PATH, writeReport(output));

  return {
    generatedAt: output.generatedAt,
    tested: output.tested,
    passed: output.passed,
    errors: output.errors.length,
    reportPath: REPORT_PATH,
    jsonPath: JSON_PATH
  };
}

function writeReport(output) {
  const lines = [];
  lines.push('# TradeLab Walk-Forward Daily');
  lines.push('');
  lines.push(`Generated: ${output.generatedAt}`);
  lines.push(`Candidates tested: ${output.tested}, anti-overfit PASSED: ${output.passed}`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('Key | Interval | Strategy | Status | fTrades | fPF | Verdict | Overfit | Test PF | Test Trades | OOS PF | OOS Trades');
  lines.push('---|---|---|---|---|---|---|---|---|---|---|---');
  for (const r of output.results) {
    const overfit = r.antiOverfit ? r.antiOverfit.status === 'CLEAN' ? 'CLEAN' : `FLAGS=${r.antiOverfit.overfitFlags}` : 'N/A';
    const testPF = r.bestCandidate && r.bestCandidate.testPF != null ? Number(r.bestCandidate.testPF).toFixed(2) : 'N/A';
    const testTrades = r.bestCandidate ? r.bestCandidate.testTrades : 'N/A';
    const oosPF = r.outOfSample ? Number(r.outOfSample.pf).toFixed(2) : 'N/A';
    const oosTrades = r.outOfSample ? r.outOfSample.trades : 'N/A';
    const fPF = r.forwardPF != null ? Number(r.forwardPF).toFixed(2) : 'N/A';
    lines.push(`${r.key} | ${r.interval} | ${r.strategy} | ${r.status} | ${r.forwardTrades} | ${fPF} | ${r.verdict} | ${overfit} | ${testPF} | ${testTrades} | ${oosPF} | ${oosTrades}`);
  }
  lines.push('');
  lines.push('## Errors');
  lines.push('');
  for (const e of output.errors) {
    lines.push(`- ${e.key}: ${e.error}`);
  }
  lines.push('');
  lines.push('*Paper-only research. Not investment advice.*');
  return lines.join('\n');
}

async function main() {
  const result = await run();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };

