const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');

const VALIDATOR_RULES = {
  minTestTrades: 6,
  minProfitFactor: 1.5,
  maxDrawdownPct: 8.0,
  maxLossStreak: 3,
  minHealthScore: 75,
  maxRiskPct: 1.5,
  maxStopPct: 5,
  minTakePct: 2
};

const KILL_SWITCH_RULES = {
  minForwardTrades: 8,
  // SOFT kill-switch: warns but doesn't block discovery
  softMaxPortfolioLossUsd: -500,
  softMaxAverageLossPerTradeUsd: -80,
  softMaxRejectedRatio: 0.50,
  softMinActivePositiveForwardRatio: 0.30,
  // HARD kill-switch: blocks everything including new discovery
  hardMaxPortfolioLossUsd: -2000,
  hardMaxAverageLossPerTradeUsd: -150,
  hardMaxRejectedRatio: 0.65,
  hardMinActivePositiveForwardRatio: 0.15
};


function readIncubationState() {
  if (!fs.existsSync(STATE_PATH)) return { candidates: {}, summary: null };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function validateStrategy(rowOrCandidate) {
  const params = rowOrCandidate.params || {};
  const test = rowOrCandidate.test || rowOrCandidate.summary || {};
  const health = rowOrCandidate.health || {};
  const reasons = [];

  if (!params.strategy) reasons.push('missing strategy');
  if ((params.riskPct || 0) > VALIDATOR_RULES.maxRiskPct) reasons.push(`risk ${params.riskPct}% > ${VALIDATOR_RULES.maxRiskPct}%`);
  if ((params.stopPct || 0) <= 0 || params.stopPct > VALIDATOR_RULES.maxStopPct) reasons.push(`invalid stop ${params.stopPct}%`);
  if ((params.takePct || 0) < VALIDATOR_RULES.minTakePct) reasons.push(`take ${params.takePct}% < ${VALIDATOR_RULES.minTakePct}%`);
  if ((test.tradeCount || 0) < VALIDATOR_RULES.minTestTrades) reasons.push(`test trades ${test.tradeCount || 0} < ${VALIDATOR_RULES.minTestTrades}`);
  if ((test.profitFactor || 0) < VALIDATOR_RULES.minProfitFactor) reasons.push(`test PF ${Number(test.profitFactor || 0).toFixed(2)} < ${VALIDATOR_RULES.minProfitFactor}`);
  if ((test.maxDd || 0) > VALIDATOR_RULES.maxDrawdownPct) reasons.push(`test DD ${Number(test.maxDd || 0).toFixed(2)}% > ${VALIDATOR_RULES.maxDrawdownPct}%`);
  if ((test.maxLossStreak || 0) > VALIDATOR_RULES.maxLossStreak) reasons.push(`test loss streak ${test.maxLossStreak || 0} > ${VALIDATOR_RULES.maxLossStreak}`);
  if (health.status && health.status !== 'Healthy') reasons.push(`health ${health.status} != Healthy`);
  if (Number.isFinite(health.score) && health.score < VALIDATOR_RULES.minHealthScore) reasons.push(`health score ${health.score} < ${VALIDATOR_RULES.minHealthScore}`);

  return {
    ok: reasons.length === 0,
    reasons
  };
}

function portfolioKillSwitch(state = readIncubationState()) {
  const candidates = Object.values(state.candidates || {});
  const forwardRows = candidates.filter((candidate) => (candidate.forwardPaperTrades || 0) > 0);
  const activeRows = candidates.filter((candidate) => candidate.status === 'incubating');
  const rejectedRows = candidates.filter((candidate) => candidate.status === 'rejected');
  const forwardTrades = forwardRows.reduce((sum, candidate) => sum + (candidate.forwardPaperTrades || 0), 0);
  const forwardPnl = forwardRows.reduce((sum, candidate) => sum + (candidate.forwardPaperPnl || 0), 0);
  const avgPerTrade = forwardTrades ? forwardPnl / forwardTrades : 0;
  const rejectedRatio = candidates.length ? rejectedRows.length / candidates.length : 0;
  const activePositive = activeRows.filter((candidate) => (candidate.forwardPaperPnl || 0) > 0).length;
  const activePositiveRatio = activeRows.length ? activePositive / activeRows.length : 0;
  const rules = KILL_SWITCH_RULES;

  // SOFT kill-switch: warns, blocks only real-money gate, allows paper discovery
  const softReasons = [];
  if (forwardTrades >= rules.minForwardTrades && forwardPnl <= rules.softMaxPortfolioLossUsd) {
    softReasons.push(`portfolio forward PnL ${forwardPnl.toFixed(2)} <= ${rules.softMaxPortfolioLossUsd}`);
  }
  if (forwardTrades >= rules.minForwardTrades && avgPerTrade <= rules.softMaxAverageLossPerTradeUsd) {
    softReasons.push(`avg forward trade ${avgPerTrade.toFixed(2)} <= ${rules.softMaxAverageLossPerTradeUsd}`);
  }
  if (candidates.length >= 10 && rejectedRatio >= rules.softMaxRejectedRatio) {
    softReasons.push(`rejected ratio ${(rejectedRatio * 100).toFixed(1)}% >= ${(rules.softMaxRejectedRatio * 100).toFixed(0)}%`);
  }
  if (activeRows.length >= 4 && forwardTrades >= rules.minForwardTrades && activePositiveRatio < rules.softMinActivePositiveForwardRatio) {
    softReasons.push(`active positive forward ratio ${(activePositiveRatio * 100).toFixed(1)}% < ${(rules.softMinActivePositiveForwardRatio * 100).toFixed(0)}%`);
  }

  // HARD kill-switch: blocks everything including paper discovery
  const hardReasons = [];
  if (forwardTrades >= rules.minForwardTrades && forwardPnl <= rules.hardMaxPortfolioLossUsd) {
    hardReasons.push(`portfolio forward PnL ${forwardPnl.toFixed(2)} <= ${rules.hardMaxPortfolioLossUsd}`);
  }
  if (forwardTrades >= rules.minForwardTrades && avgPerTrade <= rules.hardMaxAverageLossPerTradeUsd) {
    hardReasons.push(`avg forward trade ${avgPerTrade.toFixed(2)} <= ${rules.hardMaxAverageLossPerTradeUsd}`);
  }
  if (candidates.length >= 10 && rejectedRatio >= rules.hardMaxRejectedRatio) {
    hardReasons.push(`rejected ratio ${(rejectedRatio * 100).toFixed(1)}% >= ${(rules.hardMaxRejectedRatio * 100).toFixed(0)}%`);
  }
  if (activeRows.length >= 4 && forwardTrades >= rules.minForwardTrades && activePositiveRatio < rules.hardMinActivePositiveForwardRatio) {
    hardReasons.push(`active positive forward ratio ${(activePositiveRatio * 100).toFixed(1)}% < ${(rules.hardMinActivePositiveForwardRatio * 100).toFixed(0)}%`);
  }

  const softActive = softReasons.length > 0;
  const hardActive = hardReasons.length > 0;

  return {
    active: softActive,
    soft: {
      active: softActive,
      reasons: softReasons
    },
    hard: {
      active: hardActive,
      reasons: hardReasons
    },
    // Overall status: 'ok' | 'soft' | 'hard'
    status: hardActive ? 'hard' : softActive ? 'soft' : 'ok',
    // Discovery is NEVER blocked by kill-switch — paper trading should always find new ideas
    blocksDiscovery: false,
    // Real-money gate is blocked by soft or hard kill-switch
    blocksRealMoney: softActive || hardActive,
    metrics: {
      candidates: candidates.length,
      incubating: activeRows.length,
      rejected: rejectedRows.length,
      forwardTrades,
      forwardPnl: Number(forwardPnl.toFixed(2)),
      avgPerTrade: Number(avgPerTrade.toFixed(2)),
      rejectedRatio: Number(rejectedRatio.toFixed(3)),
      activePositiveRatio: Number(activePositiveRatio.toFixed(3))
    },
    rules: KILL_SWITCH_RULES
  };
}


module.exports = {
  VALIDATOR_RULES,
  KILL_SWITCH_RULES,
  validateStrategy,
  portfolioKillSwitch,
  readIncubationState
};
