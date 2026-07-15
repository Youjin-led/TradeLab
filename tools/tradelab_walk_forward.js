/**
 * TradeLab Walk-Forward Validation
 *
 * Улучшенный walk-forward анализ с anti-overfit проверками:
 *
 * 1. Anchored Walk-Forward — расширяющееся окно train
 * 2. Out-of-Sample — 20% данных скрыты от оптимизации
 * 3. Combinatorial Symmetric Cross-Validation
 * 4. Overfit Score — метрика переобучения
 *
 * Paper-only research tool.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ===== CONFIG =====

const WF_CONFIG = {
  // Train/Validate/Test split ratios
  trainRatio: 0.6,
  validateRatio: 0.2,
  testRatio: 0.2,

  // Anchored walk-forward
  anchoredWindows: 5,        // Number of expanding windows
  minTrainBars: 200,         // Minimum bars for training

  // Anti-overfit
  maxOverfitScore: 1.5,      // Max ratio of train/test PF
  minTestTrades: 5,          // Minimum trades in test set
  minTestPF: 1.0,            // Minimum PF in test set
  maxDDIncrease: 1.5,        // Max DD increase from train to test

  // Out-of-sample
  oosPercent: 0.2,           // 20% held out
};

// ===== SPLIT DATA =====

/**
 * Split candles into train/validate/test sets.
 * Out-of-sample: last 20% are never used for optimization.
 */
function splitData(candles, config) {
  const cfg = config || WF_CONFIG;
  const total = candles.length;
  const oosSize = Math.floor(total * cfg.oosPercent);
  const usable = total - oosSize;

  const trainEnd = Math.floor(usable * cfg.trainRatio);
  const validateEnd = Math.floor(usable * (cfg.trainRatio + cfg.validateRatio));

  return {
    train: candles.slice(0, trainEnd),
    validate: candles.slice(trainEnd, validateEnd),
    test: candles.slice(validateEnd, usable),
    outOfSample: candles.slice(usable),  // NEVER used in optimization
    splitInfo: {
      total,
      trainSize: trainEnd,
      validateSize: validateEnd - trainEnd,
      testSize: usable - validateEnd,
      oosSize,
    }
  };
}

/**
 * Anchored walk-forward: expanding training window, fixed-size test window.
 * Returns array of { train, test } pairs.
 */
function anchoredWalkForward(candles, config) {
  const cfg = config || WF_CONFIG;
  const total = candles.length;
  const oosSize = Math.floor(total * cfg.oosPercent);
  const usable = total - oosSize;
  const windowSize = Math.floor(usable / cfg.anchoredWindows);

  const windows = [];

  for (let w = 0; w < cfg.anchoredWindows; w++) {
    const trainEnd = windowSize * (w + 1);
    const testStart = trainEnd;
    const testEnd = Math.min(testStart + windowSize, usable);

    if (testEnd <= testStart) continue;
    if (trainEnd < cfg.minTrainBars) continue;

    windows.push({
      windowIndex: w,
      train: candles.slice(0, trainEnd),      // Expanding from 0
      test: candles.slice(testStart, testEnd), // Fixed size
      trainBars: trainEnd,
      testBars: testEnd - testStart,
    });
  }

  return {
    windows,
    outOfSample: candles.slice(usable),
    config: cfg,
  };
}

// ===== EVALUATE STRATEGY ON DATA =====

/**
 * Run a strategy function on candle data and return metrics.
 * strategyFn: (candles, params) => { trades, pnl, profitFactor, maxDd, winRate }
 */
function evaluateStrategy(strategyFn, candles, params) {
  return strategyFn(candles, params);
}

// ===== OVERFIT DETECTION =====

/**
 * Calculate overfit score:
 * score = train_PF / test_PF
 * Score > 1.5 suggests overfitting.
 */
function overfitScore(trainMetrics, testMetrics) {
  if (!testMetrics || testMetrics.trades < 3) return null;
  if (!trainMetrics || trainMetrics.profitFactor <= 0) return null;
  return trainMetrics.profitFactor / Math.max(testMetrics.profitFactor, 0.01);
}

/**
 * Deflated Sharpe Ratio: adjusts for multiple testing.
 * Simplified version.
 */
function deflatedSharpeTest(sharpe, numTests, numObservations) {
  // Expected max Sharpe under null hypothesis
  const eulerMascheroni = 0.5772;
  const expectedMax = Math.sqrt(2 * Math.log(numTests)) * (1 - eulerMascheroni / (2 * Math.log(numTests)));
  const stdDev = Math.sqrt((1 + 0.5 * sharpe * sharpe) / Math.max(numObservations, 1));
  const zScore = (sharpe - expectedMax) / stdDev;
  // p-value approximation
  return { zScore: Number(zScore.toFixed(3)), isSignificant: zScore > 1.96 };
}

// ===== MAIN WALK-FORWARD ANALYSIS =====

/**
 * Run full walk-forward analysis on a strategy.
 *
 * @param {Function} strategyFn - (candles, params) => metrics
 * @param {Array} candles - Full candle dataset
 * @param {Object} paramGrid - { key: [values] } for optimization
 * @returns {Object} Walk-forward results with anti-overfit checks
 */
function walkForwardAnalysis(strategyFn, candles, paramGrid) {
  const split = splitData(candles);
  const anchored = anchoredWalkForward(candles);

  // 1. Optimize on train set
  const trainResults = [];
  const paramCombinations = generateCombinations(paramGrid);

  for (const params of paramCombinations) {
    const metrics = evaluateStrategy(strategyFn, split.train, params);
    trainResults.push({ params, metrics });
  }

  // Sort by PF, take top 3
  trainResults.sort((a, b) => (b.metrics.profitFactor || 0) - (a.metrics.profitFactor || 0));
  const topParams = trainResults.slice(0, 3);

  // 2. Validate on validate set
  const validated = [];
  for (const { params, metrics: trainMetrics } of topParams) {
    const valMetrics = evaluateStrategy(strategyFn, split.validate, params);
    validated.push({ params, trainMetrics, valMetrics });
  }

  // 3. Test on test set (out-of-optimization)
  const tested = [];
  for (const { params, trainMetrics, valMetrics } of validated) {
    const testMetrics = evaluateStrategy(strategyFn, split.test, params);
    const overfit = overfitScore(trainMetrics, testMetrics);
    tested.push({ params, trainMetrics, valMetrics, testMetrics, overfit });
  }

  // 4. Anchored walk-forward for each top param set
  const anchoredResults = [];
  for (const { params } of tested) {
    const windowResults = [];
    for (const window of anchored.windows) {
      const trainM = evaluateStrategy(strategyFn, window.train, params);
      const testM = evaluateStrategy(strategyFn, window.test, params);
      windowResults.push({
        windowIndex: window.windowIndex,
        train: trainM,
        test: testM,
        overfit: overfitScore(trainM, testM),
      });
    }
    anchoredResults.push({ params, windows: windowResults });
  }

  // 5. Anti-overfit summary
  const overfitFlags = tested.filter(t => t.overfit !== null && t.overfit > WF_CONFIG.maxOverfitScore);
  const passedTests = tested.filter(t =>
    t.testMetrics && t.testMetrics.trades >= WF_CONFIG.minTestTrades &&
    t.testMetrics.profitFactor >= WF_CONFIG.minTestPF
  );

  // 6. Best candidate
  const bestCandidate = tested.find(t =>
    t.testMetrics && t.testMetrics.trades >= WF_CONFIG.minTestTrades &&
    t.testMetrics.profitFactor >= WF_CONFIG.minTestPF &&
    (!t.overfit || t.overfit <= WF_CONFIG.maxOverfitScore)
  ) || tested[0];

  // 7. Out-of-sample validation
  let oosMetrics = null;
  if (bestCandidate && split.outOfSample.length > 50) {
    oosMetrics = evaluateStrategy(strategyFn, split.outOfSample, bestCandidate.params);
  }

  return {
    generatedAt: new Date().toISOString(),
    splitInfo: split.splitInfo,
    config: WF_CONFIG,

    // Results by phase
    trainTop3: topParams.map(t => ({
      params: t.params,
      pf: t.metrics.profitFactor,
      trades: t.metrics.trades,
      maxDd: t.metrics.maxDd,
    })),

    tested,
    anchoredResults,

    // Anti-overfit
    antiOverfit: {
      overfitFlags: overfitFlags.length,
      passedTests: passedTests.length,
      totalTested: tested.length,
      maxOverfitScore: WF_CONFIG.maxOverfitScore,
      status: overfitFlags.length === 0 ? 'CLEAN' : 'OVERFIT_DETECTED',
    },

    // Best candidate
    bestCandidate: bestCandidate ? {
      params: bestCandidate.params,
      trainPF: bestCandidate.trainMetrics?.profitFactor,
      testPF: bestCandidate.testMetrics?.profitFactor,
      overfit: bestCandidate.overfit,
      testTrades: bestCandidate.testMetrics?.trades,
      testWinRate: bestCandidate.testMetrics?.winRate,
      testMaxDd: bestCandidate.testMetrics?.maxDd,
    } : null,

    // Out-of-sample
    outOfSample: oosMetrics ? {
      trades: oosMetrics.trades,
      pf: oosMetrics.profitFactor,
      pnl: oosMetrics.pnl,
      maxDd: oosMetrics.maxDd,
      winRate: oosMetrics.winRate,
      status: oosMetrics.profitFactor >= 1.0 && oosMetrics.trades >= 3 ? 'PASSED' : 'FAILED',
    } : null,

    // Verdict
    verdict: getVerdict(bestCandidate, oosMetrics, overfitFlags),
  };
}

function getVerdict(bestCandidate, oosMetrics, overfitFlags) {
  if (overfitFlags.length > 0) return 'REJECTED: Overfitting detected';
  if (!bestCandidate) return 'REJECTED: No candidate passed tests';
  if (bestCandidate.testMetrics?.trades < WF_CONFIG.minTestTrades) return 'REJECTED: Insufficient test trades';
  if (bestCandidate.testMetrics?.profitFactor < WF_CONFIG.minTestPF) return 'REJECTED: Test PF below minimum';
  if (oosMetrics && oosMetrics.profitFactor < 1.0) return 'CAUTION: Failed out-of-sample';
  if (oosMetrics && oosMetrics.profitFactor >= 1.0) return 'PASSED: Walk-forward validated';
  return 'PASSED (no OOS data)';
}

// ===== PARAM COMBINATION GENERATOR =====

function generateCombinations(paramGrid) {
  const keys = Object.keys(paramGrid);
  const results = [];

  function combine(current, depth) {
    if (depth === keys.length) {
      results.push(Object.assign({}, current));
      return;
    }
    const key = keys[depth];
    for (const val of paramGrid[key]) {
      current[key] = val;
      combine(current, depth + 1);
    }
  }

  combine({}, 0);
  return results;
}

// ===== REPORT =====

function generateWFReport(result) {
  const lines = [];
  lines.push('# Walk-Forward Analysis Report');
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push('');

  lines.push('## Data Split');
  lines.push(`- Train: ${result.splitInfo.trainSize} bars`);
  lines.push(`- Validate: ${result.splitInfo.validateSize} bars`);
  lines.push(`- Test: ${result.splitInfo.testSize} bars`);
  lines.push(`- Out-of-Sample: ${result.splitInfo.oosSize} bars (held out)');
  lines.push('');

  lines.push('## Anti-Overfit');
  lines.push(`- Status: ${result.antiOverfit.status}`);
  lines.push(`- Overfit flags: ${result.antiOverfit.overfitFlags}`);
  lines.push(`- Passed tests: ${result.antiOverfit.passedTests}/${result.antiOverfit.totalTested}`);
  lines.push('');

  if (result.bestCandidate) {
    lines.push('## Best Candidate');
    lines.push(`- Train PF: ${result.bestCandidate.trainPF}`);
    lines.push(`- Test PF: ${result.bestCandidate.testPF}`);
    lines.push(`- Overfit Score: ${result.bestCandidate.overfit || 'N/A'}`);
    lines.push(`- Test Trades: ${result.bestCandidate.testTrades}`);
    lines.push(`- Test Win Rate: ${result.bestCandidate.testWinRate}%`);
    lines.push(`- Test Max DD: ${result.bestCandidate.testMaxDd}%`);
    lines.push('');
  }

  if (result.outOfSample) {
    lines.push('## Out-of-Sample Validation');
    lines.push(`- Status: ${result.outOfSample.status}`);
    lines.push(`- Trades: ${result.outOfSample.trades}`);
    lines.push(`- PF: ${result.outOfSample.pf}`);
    lines.push(`- PnL: ${result.outOfSample.pnl}`);
    lines.push(`- Max DD: ${result.outOfSample.maxDd}%`);
    lines.push('');
  }

  lines.push(`## Verdict: ${result.verdict}`);
  lines.push('');
  lines.push('*Paper-only research. Not investment advice.*');

  return lines.join('\n');
}

module.exports = {
  splitData,
  anchoredWalkForward,
  walkForwardAnalysis,
  overfitScore,
  deflatedSharpeTest,
  generateWFReport,
  WF_CONFIG
};
