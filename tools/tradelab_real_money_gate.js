const fs = require('fs');
const path = require('path');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');
const {
  REQUIREMENTS,
  VALIDATOR_RULES,
  FORWARD_PROVEN,
  FORWARD_PROVEN_MIN_TRADES
} = require('./tradelab_thresholds');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const { readShadow, assessOkxEvidence } = require('./tradelab_okx_evidence_gate');

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function criticalAlerts(candidate) {
  return (candidate.alerts || []).filter((alert) => !String(alert).startsWith('low test sample'));
}

// Forward-доказательство сильнее бэктеста: при большой выборке paper-сделок
// судим кандидата по forward-метрикам, а не по бэктестовым.
// Пороги — строгие FORWARD_PROVEN из реестра (те же, что для промоута из инкубации).

function isForwardProven(candidate) {
  const c = candidate || {};
  if ((Number(c.forwardPaperTrades) || 0) < FORWARD_PROVEN_MIN_TRADES) return false;
  if ((Number(c.liveObservations) || 0) < REQUIREMENTS.minLiveObservations) return false;
  if (!((Number(c.forwardPaperPnl) || 0) > 0)) return false;
  if (!((Number(c.forwardProfitFactor) || 0) >= VALIDATOR_RULES.minProfitFactor)) return false;
  if (!((Number(c.forwardPaperMaxDd) || 0) <= VALIDATOR_RULES.maxDrawdownPct)) return false;
  const fwdStreak = Number(c.forwardCurrentLossStreak ?? c.forwardMaxLossStreak ?? 99);
  if (!(fwdStreak <= VALIDATOR_RULES.maxLossStreak)) return false;
  return true;
}

function evaluateCandidate(candidate, options = {}) {
  const blockers = [];
  if (candidate.marketDataSource !== 'okx-swap') blockers.push('candidate evidence was not collected from OKX swaps');
  if (candidate.status !== REQUIREMENTS.requiredStatus) {
    blockers.push(`status is ${candidate.status}, expected ${REQUIREMENTS.requiredStatus}`);
  }
  // Forward-доказанный кандидат судится по forward-метрикам (бэктест мог не торговаться в тестовом окне).
  const proven = isForwardProven(candidate);
  const effPF = proven ? Number(candidate.forwardProfitFactor) : Number(candidate.profitFactor);
  const effDD = proven ? Number(candidate.forwardPaperMaxDd) : Number(candidate.maxDrawdownPct);
  const effStreak = proven
    ? Number(candidate.forwardCurrentLossStreak ?? candidate.forwardMaxLossStreak ?? 99)
    : Number(candidate.maxLossStreak);
  const effHealth = proven ? 'Healthy' : ((candidate.health || {}).status || 'unknown');
  if (effHealth !== REQUIREMENTS.requiredHealth) {
    blockers.push(`health is ${effHealth}, expected ${REQUIREMENTS.requiredHealth}`);
  }
  if ((candidate.liveObservations || 0) < REQUIREMENTS.minLiveObservations) {
    blockers.push(`live observations ${candidate.liveObservations || 0} < ${REQUIREMENTS.minLiveObservations}`);
  }
  if ((candidate.forwardPaperTrades || 0) < REQUIREMENTS.minClosedPaperTrades) {
    blockers.push(`forward paper trades ${candidate.forwardPaperTrades || 0} < ${REQUIREMENTS.minClosedPaperTrades}`);
  }
  if (!(effPF >= REQUIREMENTS.minProfitFactor)) {
    blockers.push(`profit factor ${effPF} < ${REQUIREMENTS.minProfitFactor}`);
  }
  if (effDD > REQUIREMENTS.maxDrawdownPct) {
    blockers.push(`drawdown ${effDD}% > ${REQUIREMENTS.maxDrawdownPct}%`);
  }
  if (effStreak > REQUIREMENTS.maxLossStreak) {
    blockers.push(`loss streak ${effStreak} > ${REQUIREMENTS.maxLossStreak}`);
  }
  const alerts = criticalAlerts(candidate);
  if (alerts.length) {
    blockers.push(`critical alerts: ${alerts.join('; ')}`);
  }
  if (options.enforceOkxEvidence) {
    const evidence = assessOkxEvidence(options.shadow?.candidates?.[candidate.key], options.shadow?.updatedAt);
    if (!evidence.allowed) blockers.push(evidence.reason);
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

function evaluateGate(options = {}) {
  const state = readState();
  if (!state) {
    return {
      gate: 'BLOCKED',
      reason: 'No incubation state found. Run npm.cmd run tradelab:incubate first.',
      requirements: REQUIREMENTS,
      candidates: []
    };
  }

  const shadow = options.skipOkxEvidence ? null : readShadow();
  const candidates = Object.values(state.candidates || {}).map((candidate) =>
    evaluateCandidate(candidate, { ...options, enforceOkxEvidence: !options.skipOkxEvidence, shadow }));
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
      ? 'Review eligible candidates and Telegram approvals. Live orders require manual approval and must pass all entry and risk checks.'
      : 'Continue paper incubation or research new candidates. No candidate is currently eligible for a new live entry.'
  };
}

function main() {
  console.log(JSON.stringify(evaluateGate(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { evaluateGate, evaluateCandidate, isForwardProven, FORWARD_PROVEN_MIN_TRADES, REQUIREMENTS };

