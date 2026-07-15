const fs = require('fs');
const path = require('path');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');

const REQUIREMENTS = {
  minLiveObservations: 30,
  minClosedPaperTrades: 15,
  minProfitFactor: 1.6,
  maxDrawdownPct: 8,
  maxLossStreak: 2,
  requiredHealth: 'Healthy',
  requiredStatus: 'ready-for-review'
};

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function criticalAlerts(candidate) {
  return (candidate.alerts || []).filter((alert) => !String(alert).startsWith('low test sample'));
}

function evaluateCandidate(candidate) {
  const blockers = [];
  if (candidate.status !== REQUIREMENTS.requiredStatus) {
    blockers.push(`status is ${candidate.status}, expected ${REQUIREMENTS.requiredStatus}`);
  }
  if ((candidate.health || {}).status !== REQUIREMENTS.requiredHealth) {
    blockers.push(`health is ${(candidate.health || {}).status || 'unknown'}, expected ${REQUIREMENTS.requiredHealth}`);
  }
  if ((candidate.liveObservations || 0) < REQUIREMENTS.minLiveObservations) {
    blockers.push(`live observations ${candidate.liveObservations || 0} < ${REQUIREMENTS.minLiveObservations}`);
  }
  if ((candidate.forwardPaperTrades || 0) < REQUIREMENTS.minClosedPaperTrades) {
    blockers.push(`forward paper trades ${candidate.forwardPaperTrades || 0} < ${REQUIREMENTS.minClosedPaperTrades}`);
  }
  if ((candidate.profitFactor || 0) < REQUIREMENTS.minProfitFactor) {
    blockers.push(`profit factor ${candidate.profitFactor || 0} < ${REQUIREMENTS.minProfitFactor}`);
  }
  if ((candidate.maxDrawdownPct || 0) > REQUIREMENTS.maxDrawdownPct) {
    blockers.push(`drawdown ${candidate.maxDrawdownPct || 0}% > ${REQUIREMENTS.maxDrawdownPct}%`);
  }
  if ((candidate.maxLossStreak || 0) > REQUIREMENTS.maxLossStreak) {
    blockers.push(`loss streak ${candidate.maxLossStreak || 0} > ${REQUIREMENTS.maxLossStreak}`);
  }
  const alerts = criticalAlerts(candidate);
  if (alerts.length) {
    blockers.push(`critical alerts: ${alerts.join('; ')}`);
  }
  return {
    key: candidate.key,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    decision: blockers.length ? 'blocked' : 'manual-review-allowed',
    blockers,
    metrics: {
      liveObservations: candidate.liveObservations || 0,
      closedPaperTrades: candidate.closedPaperTrades || 0,
      forwardPaperTrades: candidate.forwardPaperTrades || 0,
      forwardPaperPnl: candidate.forwardPaperPnl || 0,
      profitFactor: candidate.profitFactor || 0,
      maxDrawdownPct: candidate.maxDrawdownPct || 0,
      maxLossStreak: candidate.maxLossStreak || 0,
      health: (candidate.health || {}).status || 'unknown',
      status: candidate.status || 'unknown'
    }
  };
}

function evaluateGate() {
  const state = readState();
  if (!state) {
    return {
      gate: 'BLOCKED',
      reason: 'No incubation state found. Run npm.cmd run tradelab:incubate first.',
      requirements: REQUIREMENTS,
      candidates: []
    };
  }

  const candidates = Object.values(state.candidates || {}).map(evaluateCandidate);
  const allowed = candidates.filter((candidate) => candidate.decision === 'manual-review-allowed');
  const killSwitch = portfolioKillSwitch(state);
  return {
    gate: allowed.length && !killSwitch.blocksRealMoney ? 'MANUAL_REVIEW_ALLOWED' : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    incubationUpdatedAt: state.updatedAt || null,
    requirements: REQUIREMENTS,
    allowed,
    candidates,
    portfolioKillSwitch: killSwitch,
    nextAction: killSwitch.active
      ? `Portfolio kill-switch active: ${(killSwitch.soft?.reasons || killSwitch.hard?.reasons || []).join('; ')}`
      : allowed.length
      ? 'Manual risk review only. Real orders still require explicit separate implementation and approval.'
      : 'Continue paper incubation or research new candidates. Do not connect real money.'
  };
}

function main() {
  console.log(JSON.stringify(evaluateGate(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { evaluateGate, REQUIREMENTS };
