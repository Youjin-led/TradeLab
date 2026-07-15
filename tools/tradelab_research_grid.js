const {
  DEFAULT_PARAMS,
  fetchCandles,
  simulate,
  parameterGrid,
  describe,
  health
} = require('./tradelab_run_once');
const { detectPhase } = require('./tradelab_market_phase');

const symbols = (process.argv[2] || 'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
const intervals = (process.argv[3] || '15m,1h,4h,1d').split(',').map((item) => item.trim()).filter(Boolean);
const limit = Number(process.argv[4] || 1000);
const strategies = ['sma-rsi', 'breakout', 'mean-reversion'];

function scoreSummary(summary) {
  return summary.pnl - summary.maxDd * 18 + Math.min(summary.profitFactor, 6) * 28;
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
    health: health(testSummary, stability, blocked, params)
  };
}

function compact(result) {
  return {
    symbol: result.symbol,
    interval: result.interval,
    strategy: result.strategy,
    stability: result.walk.stability,
    health: result.walk.health.status,
    score: result.walk.health.score,
    testPnl: Number(result.walk.test.pnl.toFixed(2)),
    testPf: Number((Number.isFinite(result.walk.test.profitFactor) ? result.walk.test.profitFactor : 99).toFixed(2)),
    testDd: Number(result.walk.test.maxDd.toFixed(2)),
    trades: result.walk.test.tradeCount,
    winrate: Number(result.walk.test.winrate.toFixed(1)),
    params: describe(result.walk.params)
  };
}

async function main() {
  const results = [];
  const errors = [];
  for (const symbol of symbols) {
    for (const interval of intervals) {
      try {
        const candles = await fetchCandles(symbol, interval, limit);
        for (const strategy of strategies) {
          const params = { ...DEFAULT_PARAMS, strategy };
          const walk = walkForwardFor(candles, params);
          results.push({ symbol, interval, strategy, candles: candles.length, walk });
        }
        process.stderr.write(`done ${symbol} ${interval} (${candles.length} candles)\n`);
      } catch (error) {
        errors.push({ symbol, interval, error: error.message });
        process.stderr.write(`skip ${symbol} ${interval}: ${error.message}\n`);
      }
    }
  }

  const rows = results.map(compact).sort((a, b) => {
    if (a.stability !== b.stability) return a.stability === 'stable' ? -1 : b.stability === 'stable' ? 1 : 0;
    return b.score - a.score || b.testPnl - a.testPnl;
  });

  const stable = rows.filter((row) => row.stability === 'stable' && row.health !== 'Blocked');
  // Определяем фазу рынка
  let marketPhase = 'unknown';
  try {
    const phase = detectPhase([]);
    marketPhase = phase.phase || 'unknown';
  } catch (_) { /* ignore */ }
  const output = {
    generatedAt: new Date().toISOString(),
    marketPhase,
    symbols,
    intervals,
    limit,
    top: rows.slice(0, 12),
    stable,
    blockedCount: rows.filter((row) => row.health === 'Blocked').length,
    errors,
    total: rows.length
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
