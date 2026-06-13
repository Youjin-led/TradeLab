const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');

const VALIDATOR_RULES = {
  minTestTrades: 6,
  minProfitFactor: 1.4,
  maxDrawdownPct: 6,
  maxLossStreak: 3,
  minHealthScore: 75,
  maxRiskPct: 1.5,
  maxStopPct: 5,
  minTakePct: 2
};

const KILL_SWITCH_RULES = {
  minForwardTrades: 8,
  maxPortfolioLossUsd: -750,
  maxAverageLossPerTradeUsd: -120,
  maxRejectedRatio: 0.65,
  minActivePositiveForwardRatio: 0.25
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
  const reasons = [];

  if (forwardTrades >= KILL_SWITCH_RULES.minForwardTrades && forwardPnl <= KILL_SWITCH_RULES.maxPortfolioLossUsd) {
    reasons.push(`portfolio forward PnL ${forwardPnl.toFixed(2)} <= ${KILL_SWITCH_RULES.maxPortfolioLossUsd}`);
  }
  if (forwardTrades >= KILL_SWITCH_RULES.minForwardTrades && avgPerTrade <= KILL_SWITCH_RULES.maxAverageLossPerTradeUsd) {
    reasons.push(`avg forward trade ${avgPerTrade.toFixed(2)} <= ${KILL_SWITCH_RULES.maxAverageLossPerTradeUsd}`);
  }
  if (candidates.length >= 10 && rejectedRatio >= KILL_SWITCH_RULES.maxRejectedRatio) {
    reasons.push(`rejected ratio ${(rejectedRatio * 100).toFixed(1)}% >= ${(KILL_SWITCH_RULES.maxRejectedRatio * 100).toFixed(0)}%`);
  }
  if (activeRows.length >= 4 && forwardTrades >= KILL_SWITCH_RULES.minForwardTrades && activePositiveRatio < KILL_SWITCH_RULES.minActivePositiveForwardRatio) {
    reasons.push(`active positive forward ratio ${(activePositiveRatio * 100).toFixed(1)}% < ${(KILL_SWITCH_RULES.minActivePositiveForwardRatio * 100).toFixed(0)}%`);
  }

  return {
    active: reasons.length > 0,
    reasons,
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
