const fs = require('fs');
const path = require('path');

const { evaluateGate } = require('./tradelab_real_money_gate');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const REPORT_PATH = path.join(__dirname, '..', 'TRADELAB_INCUBATION_REPORT.md');
const LIVE_TRADES_PATH = path.join(__dirname, '..', 'tradelab-live-trades.json');

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

function count(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 'invalid';
}

function liveSummary() {
  if (!fs.existsSync(LIVE_TRADES_PATH)) return null;
  try {
    const trades = JSON.parse(fs.readFileSync(LIVE_TRADES_PATH, 'utf8'));
    if (!Array.isArray(trades)) return null;
    const closed = trades.filter((trade) => trade.status === 'closed');
    return {
      closed: closed.length,
      open: trades.filter((trade) => trade.status === 'open').length,
      pnl: closed.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0)
    };
  } catch (_) { return null; }
}

function quarantineReason(candidate) {
  const reason = candidate.quarantine?.reason || 'quarantined';
  return /\btrades\s+\d{9,}\b/i.test(reason)
    ? 'legacy quarantine record contains an invalid trade count; inspect source state before using this statistic'
    : reason;
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
    count(candidate.liveObservations),
    count(candidate.forwardPaperTrades),
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
  const live = liveSummary();

  const lines = [
    '# TradeLab Incubation Report',
    '',
    `Generated: ${generatedAt}`,
    `Incubation updated: ${state ? state.updatedAt || 'unknown' : 'missing'}`,
    `Real-money gate: **${gate.gate}**`,
    `Portfolio kill-switch: **${gate.portfolioKillSwitch && gate.portfolioKillSwitch.active ? 'ACTIVE' : 'clear'}**`,
    '',
    'Candidate PnL and trade counts below are simulated paper results, not real-account returns. Live trading is enabled separately and requires manual approval plus entry and risk checks.',
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
    '## Live Trading',
    '',
    live ? `Local trade ledger: ${live.closed} closed; ${live.open} open; recorded realized PnL: ${money(live.pnl)} USDT.` : 'Local live trade ledger unavailable.',
    'This ledger summary does not replace exchange reconciliation and may exclude funding or historical fee corrections.',
    '',
    '## Portfolio Kill-Switch',
    '',
    gate.portfolioKillSwitch
      ? `Simulated forward PnL: ${gate.portfolioKillSwitch.metrics.forwardPnl}; simulated forward trades: ${gate.portfolioKillSwitch.metrics.forwardTrades}; rejected ratio: ${(gate.portfolioKillSwitch.metrics.rejectedRatio * 100).toFixed(1)}%.`
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
      .map((candidate) => `- ${candidate.key}: ${quarantineReason(candidate)}`),
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
    'If the gate is `BLOCKED`, do not open new live positions. An allowed candidate still requires manual approval and all live entry and risk checks.'
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

