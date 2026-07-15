const fs = require('fs');
const path = require('path');

const { evaluateGate, REQUIREMENTS } = require('./tradelab_real_money_gate');
const { portfolioKillSwitch, readIncubationState } = require('./tradelab_risk_controls');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'tradelab-scoreboard.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_SCOREBOARD.md');

function money(value) {
  return `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function progress(candidate, gateCandidate) {
  const observation = clamp((candidate.liveObservations || 0) / REQUIREMENTS.minLiveObservations, 0, 1);
  const trades = clamp((candidate.forwardPaperTrades || 0) / REQUIREMENTS.minClosedPaperTrades, 0, 1);
  const pf = clamp((candidate.profitFactor || 0) / REQUIREMENTS.minProfitFactor, 0, 1);
  const dd = clamp((REQUIREMENTS.maxDrawdownPct - (candidate.maxDrawdownPct || 0)) / REQUIREMENTS.maxDrawdownPct, 0, 1);
  const streak = clamp((REQUIREMENTS.maxLossStreak + 1 - (candidate.maxLossStreak || 0)) / (REQUIREMENTS.maxLossStreak + 1), 0, 1);
  const health = (candidate.health || {}).status === REQUIREMENTS.requiredHealth ? 1 : 0;
  const status = candidate.status === REQUIREMENTS.requiredStatus ? 1 : candidate.status === 'incubating' ? 0.5 : 0;
  const blockerPenalty = clamp(((gateCandidate || {}).blockers || []).length / 8, 0, 1);
  const raw = ((observation * 15) + (trades * 20) + (pf * 15) + (dd * 15) + (streak * 10) + (health * 15) + (status * 10)) * (1 - blockerPenalty * 0.25);
  return Math.round(raw);
}

function trend(candidate) {
  if (candidate.status === 'quarantined') return 'quarantined';
  if (candidate.status === 'rejected') return 'rejected';
  if (candidate.status === 'probation') return 'deteriorating';
  if ((candidate.forwardPaperTrades || 0) < 3) return 'collecting';
  
  // Проверка phase-mismatch: если стратегия не подходит под фазу рынка
  const strategy = candidate.strategy || '';
  const marketPhase = candidate.marketPhase || '';
  const PHASE_MAP = {
    'breakout': ['trending', 'volatile'],
    'sma-rsi': ['trending', 'ranging'],
    'mean-reversion': ['ranging']
  };
  const suitablePhases = PHASE_MAP[strategy] || ['trending', 'ranging', 'volatile'];
  if (marketPhase && !suitablePhases.includes(marketPhase)) {
    return 'phase-mismatch';
  }
  
  if ((candidate.forwardPaperPnl || 0) > 0 && (candidate.maxDrawdownPct || 0) <= REQUIREMENTS.maxDrawdownPct && (candidate.profitFactor || 0) >= REQUIREMENTS.minProfitFactor) return 'improving';
  if ((candidate.forwardPaperPnl || 0) < -250 || (candidate.maxDrawdownPct || 0) > REQUIREMENTS.maxDrawdownPct || (candidate.maxLossStreak || 0) > REQUIREMENTS.maxLossStreak) return 'deteriorating';
  return 'watch';
}

function nextStep(row) {
  if (row.status === 'quarantined') return 'stay quarantined until drawdown diagnostics clear it';
  if (row.status === 'rejected') return 'do not revive without a new research pass';
  if (row.gateBlockers.length) return row.gateBlockers[0];
  if (row.progress >= 90) return 'manual review candidate, but only if portfolio kill-switch clears';
  return 'continue paper incubation';
}

function compactCandidate(candidate, gateCandidate) {
  const row = {
    key: candidate.key,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    status: candidate.status || 'unknown',
    decision: candidate.decision || 'unknown',
    health: (candidate.health || {}).status || 'unknown',
    healthScore: (candidate.health || {}).score || 0,
    liveObservations: candidate.liveObservations || 0,
    forwardPaperTrades: candidate.forwardPaperTrades || 0,
    forwardPaperPnl: Number((candidate.forwardPaperPnl || 0).toFixed(2)),
    profitFactor: Number((candidate.profitFactor || 0).toFixed(2)),
    maxDrawdownPct: Number((candidate.maxDrawdownPct || 0).toFixed(2)),
    maxLossStreak: candidate.maxLossStreak || 0,
    lastSignal: candidate.lastSignal || 'unknown',
    forwardOpenPosition: candidate.forwardOpenPosition || 'unknown',
    gateDecision: (gateCandidate || {}).decision || 'blocked',
    gateBlockers: (gateCandidate || {}).blockers || []
  };
  row.progress = progress(candidate, gateCandidate);
  row.trend = trend(candidate);
  row.nextStep = nextStep(row);
  return row;
}

function makeScoreboard() {
  const state = readIncubationState();
  const gate = evaluateGate();
  const killSwitch = portfolioKillSwitch(state);
  const gateByKey = new Map((gate.candidates || []).map((candidate) => [candidate.key, candidate]));
  const candidates = Object.values(state.candidates || {}).map((candidate) => compactCandidate(candidate, gateByKey.get(candidate.key)));
  const live = candidates.filter((candidate) => candidate.status === 'incubating' || candidate.status === 'ready-for-review' || candidate.status === 'probation');
  const quarantined = candidates.filter((candidate) => candidate.status === 'quarantined');
  const rejected = candidates.filter((candidate) => candidate.status === 'rejected');
  const leaders = [...live].sort((a, b) => b.progress - a.progress || b.forwardPaperPnl - a.forwardPaperPnl);
  const risks = [...live].sort((a, b) => a.progress - b.progress || a.forwardPaperPnl - b.forwardPaperPnl);

  const output = {
    generatedAt: new Date().toISOString(),
    incubationUpdatedAt: state.updatedAt || null,
    gate: gate.gate,
    killSwitch: {
      active: killSwitch.active,
      reasons: killSwitch.reasons,
      metrics: killSwitch.metrics
    },
    summary: {
      candidates: candidates.length,
      live: live.length,
      probation: candidates.filter((candidate) => candidate.status === 'probation').length,
      quarantined: quarantined.length,
      rejected: rejected.length,
      readyForReview: candidates.filter((candidate) => candidate.status === 'ready-for-review').length,
      improving: live.filter((candidate) => candidate.trend === 'improving').length,
      deteriorating: live.filter((candidate) => candidate.trend === 'deteriorating').length,
      collecting: live.filter((candidate) => candidate.trend === 'collecting').length
    },
    leaders,
    risks,
    candidates
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeReport(output);
  return {
    generatedAt: output.generatedAt,
    reportPath: REPORT_PATH,
    jsonPath: JSON_PATH,
    gate: output.gate,
    killSwitch: output.killSwitch,
    summary: output.summary,
    leaders: leaders.slice(0, 5).map((candidate) => ({
      key: candidate.key,
      progress: candidate.progress,
      trend: candidate.trend,
      forwardPaperPnl: candidate.forwardPaperPnl,
      blockers: candidate.gateBlockers.length
    }))
  };
}

function writeReport(output) {
  const lines = [
    '# TradeLab Scoreboard',
    '',
    `Generated: ${output.generatedAt}`,
    `Incubation updated: ${output.incubationUpdatedAt || 'unknown'}`,
    `Real-money gate: **${output.gate}**`,
    `Portfolio kill-switch: **${output.killSwitch.active ? 'ACTIVE' : 'clear'}**`,
    '',
    'This report is paper-only. It tracks progress toward manual review; it does not approve real-money trading.',
    '',
    '## Summary',
    '',
    `Live: ${output.summary.live}; probation: ${output.summary.probation}; quarantined: ${output.summary.quarantined}; rejected: ${output.summary.rejected}; ready for review: ${output.summary.readyForReview}.`,
    `Improving: ${output.summary.improving}; deteriorating: ${output.summary.deteriorating}; collecting: ${output.summary.collecting}.`,
    `Portfolio forward PnL: ${money(output.killSwitch.metrics.forwardPnl)}; forward trades: ${output.killSwitch.metrics.forwardTrades}; avg/trade: ${money(output.killSwitch.metrics.avgPerTrade)}.`,
    '',
    '## Live Candidates',
    '',
    'Candidate | Progress | Trend | Health | Obs | Fwd Trades | Fwd PnL | PF | DD | Loss Streak | Next Step',
    '--- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---'
  ];

  for (const candidate of output.leaders) {
    lines.push(`${candidate.key} | ${candidate.progress}% | ${candidate.trend} | ${candidate.health} | ${candidate.liveObservations} | ${candidate.forwardPaperTrades} | ${money(candidate.forwardPaperPnl)} | ${candidate.profitFactor.toFixed(2)} | ${candidate.maxDrawdownPct.toFixed(2)}% | ${candidate.maxLossStreak} | ${candidate.nextStep}`);
  }
  if (!output.leaders.length) lines.push('No live candidates | 0% | - | - | 0 | 0 | +0.00 | 0.00 | 0.00% | 0 | Run incubation');

  lines.push(
    '',
    '## Highest Risk Live Rows',
    '',
    'Candidate | Progress | Trend | Fwd PnL | Blockers',
    '--- | ---: | --- | ---: | ---'
  );
  for (const candidate of output.risks.slice(0, 8)) {
    lines.push(`${candidate.key} | ${candidate.progress}% | ${candidate.trend} | ${money(candidate.forwardPaperPnl)} | ${candidate.gateBlockers.join('; ') || 'none'}`);
  }

  lines.push(
    '',
    '## Quarantine Count',
    '',
    `Quarantined candidates: ${output.summary.quarantined}. They are excluded from live-progress scoring until quarantine clears.`,
    '',
    '## Operator Rule',
    '',
    'Only candidates with high progress, no gate blockers, and a clear portfolio kill-switch can move to manual review. Real orders still require separate explicit approval and implementation.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function main() {
  console.log(JSON.stringify(makeScoreboard(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { makeScoreboard };
