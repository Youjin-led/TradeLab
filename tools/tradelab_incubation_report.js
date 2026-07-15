const fs = require('fs');
const path = require('path');

const { evaluateGate } = require('./tradelab_real_money_gate');
const { detectPhase } = require('./tradelab_market_phase');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const REPORT_PATH = path.join(__dirname, '..', 'TRADELAB_INCUBATION_REPORT.md');

function readState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function money(value) {
  return `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function rowFor(candidate, gateCandidate) {
  const blockers = gateCandidate && gateCandidate.blockers.length
    ? gateCandidate.blockers.join('; ')
    : 'none';
  return [
    candidate.symbol,
    candidate.interval,
    candidate.strategy,
    candidate.status,
    candidate.decision,
    candidate.health ? candidate.health.status : 'unknown',
    candidate.liveObservations || 0,
    candidate.forwardPaperTrades || 0,
    money(candidate.forwardPaperPnl || 0),
    money(candidate.totalPnl),
    Number(candidate.profitFactor || 0).toFixed(2),
    pct(candidate.maxDrawdownPct),
    blockers
  ].join(' | ');
}

function makeReport() {
  const state = readState();
  const gate = evaluateGate();
  const candidates = state ? Object.values(state.candidates || {}) : [];
  const gateByKey = new Map((gate.candidates || []).map((candidate) => [candidate.key, candidate]));
  const generatedAt = new Date().toISOString();

  // Определяем текущую фазу рынка
  let marketPhase = 'unknown';
  try {
    const phase = detectPhase([]);
    marketPhase = phase.phase || 'unknown';
  } catch (_) { /* ignore */ }

  const lines = [
    '# TradeLab Incubation Report',
    '',
    `Generated: ${generatedAt}`,
    `Incubation updated: ${state ? state.updatedAt || 'unknown' : 'missing'}`,
    `Real-money gate: **${gate.gate}**`,
    `Portfolio kill-switch: **${gate.portfolioKillSwitch && gate.portfolioKillSwitch.active ? 'ACTIVE' : 'clear'}**`,
    `Market phase: **${marketPhase}**`,
    '',
    'This report is paper-only. It does not approve automatic trading or exchange connectivity.',
    '',
    '## Summary',
    '',
    state
      ? `Candidates: ${candidates.length}; incubating: ${state.summary ? state.summary.incubating : 'unknown'}; probation: ${state.summary ? state.summary.probation || 0 : 'unknown'}; ready for review: ${state.summary ? state.summary.readyForReview : 'unknown'}; rejected: ${state.summary ? state.summary.rejected : 'unknown'}; quarantined: ${state.summary ? state.summary.quarantined || 0 : 'unknown'}.`
      : 'No incubation state found. Run `npm.cmd run tradelab:incubate` first.',
    state && state.summary && state.summary.networkErrors
      ? `Network errors in last incubation: ${state.summary.networkErrors} (${(state.summary.networkErrorKeys || []).join(', ')}).`
      : 'Network errors in last incubation: 0.',
    '',
    `Next action: ${gate.nextAction || 'Run incubation first.'}`,
    '',
    '## Portfolio Kill-Switch',
    '',
    gate.portfolioKillSwitch
      ? `Forward PnL: ${gate.portfolioKillSwitch.metrics.forwardPnl}; forward trades: ${gate.portfolioKillSwitch.metrics.forwardTrades}; rejected ratio: ${(gate.portfolioKillSwitch.metrics.rejectedRatio * 100).toFixed(1)}%.`
      : 'No kill-switch data available.',
    ...(gate.portfolioKillSwitch && (gate.portfolioKillSwitch.soft?.reasons || gate.portfolioKillSwitch.hard?.reasons || []).length ? (gate.portfolioKillSwitch.soft?.reasons || gate.portfolioKillSwitch.hard?.reasons || []).map((reason) => `- ${reason}`) : ['- clear']),
    '',
    '## Quarantine',
    '',
    state
      ? `Quarantined candidates: ${candidates.filter((candidate) => candidate.status === 'quarantined').length}.`
      : 'No incubation state found.',
    ...candidates
      .filter((candidate) => candidate.status === 'quarantined')
      .slice(0, 12)
      .map((candidate) => `- ${candidate.key}: ${candidate.quarantine ? candidate.quarantine.reason : 'quarantined'}`),
    '',
    '## Candidates',
    '',
    'Symbol | TF | Strategy | Status | Decision | Health | Live Obs | Forward Trades | Forward PnL | Backtest PnL | PF | Max DD | Gate Blockers',
    '--- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---'
  ];

  for (const candidate of candidates.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'incubating' ? -1 : 1;
    return (b.profitFactor || 0) - (a.profitFactor || 0);
  })) {
    lines.push(rowFor(candidate, gateByKey.get(candidate.key)));
  }

  if (!candidates.length) lines.push('No candidates | - | - | - | - | - | 0 | 0 | 0.00 | 0.00 | 0.00 | 0.00% | Run incubation');

  lines.push(
    '',
    '## Real-Money Requirements',
    '',
    `- minimum live observations: ${gate.requirements.minLiveObservations}`,
    `- minimum closed paper trades: ${gate.requirements.minClosedPaperTrades}`,
    `- minimum profit factor: ${gate.requirements.minProfitFactor}`,
    `- maximum drawdown: ${gate.requirements.maxDrawdownPct}%`,
    `- maximum loss streak: ${gate.requirements.maxLossStreak}`,
    `- required health: ${gate.requirements.requiredHealth}`,
    `- required status: ${gate.requirements.requiredStatus}`,
    '',
    '## Operator Rule',
    '',
    'If the gate is `BLOCKED`, do not connect API keys, do not place orders, and do not treat the strategy as real-money ready.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
  return { reportPath: REPORT_PATH, gate: gate.gate, candidates: candidates.length, nextAction: gate.nextAction };
}

function main() {
  console.log(JSON.stringify(makeReport(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { makeReport };
