const fs = require('fs');
const path = require('path');

const { evaluateGate, REQUIREMENTS } = require('./tradelab_real_money_gate');
const { readIncubationState } = require('./tradelab_risk_controls');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const QUEUE_PATH = path.join(ROOT, 'tradelab-promotion-queue.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_LIFECYCLE.md');

const RULES = {
  probationCyclesBeforeQuarantine: 3,
  probationMinForwardTrades: 3,
  probationMaxForwardPnl: -80,
  probationMaxDrawdownPct: 5.0,
  probationMaxLossStreak: 2,
  quarantineMaxForwardPnl: -300,
  promotionMinProgress: 75,
  promotionMinForwardTrades: 8
};

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function blockerCount(gateCandidate) {
  return gateCandidate && Array.isArray(gateCandidate.blockers) ? gateCandidate.blockers.length : 0;
}

function isLive(candidate) {
  return candidate.status === 'incubating' || candidate.status === 'ready-for-review' || candidate.status === 'probation';
}

function shouldProbation(candidate, gateCandidate) {
  if (!isLive(candidate)) return false;
  if ((candidate.forwardPaperTrades || 0) < RULES.probationMinForwardTrades) return false;
  return (candidate.forwardPaperPnl || 0) <= RULES.probationMaxForwardPnl
    || (candidate.maxDrawdownPct || 0) > RULES.probationMaxDrawdownPct
    || (candidate.maxLossStreak || 0) > RULES.probationMaxLossStreak
    || blockerCount(gateCandidate) >= 4;
}

function shouldQuarantineFromProbation(candidate) {
  const cycles = (candidate.probation || {}).cycles || 0;
  return cycles >= RULES.probationCyclesBeforeQuarantine
    || (candidate.forwardPaperPnl || 0) <= RULES.quarantineMaxForwardPnl
    || (candidate.maxDrawdownPct || 0) > REQUIREMENTS.maxDrawdownPct + 1
    || (candidate.maxLossStreak || 0) > REQUIREMENTS.maxLossStreak + 1;
}

function promotionReady(candidate) {
  if (!isLive(candidate)) return false;
  return (candidate.forwardPaperTrades || 0) >= RULES.promotionMinForwardTrades
    && (candidate.profitFactor || 0) >= REQUIREMENTS.minProfitFactor
    && (candidate.maxDrawdownPct || 0) <= REQUIREMENTS.maxDrawdownPct
    && (candidate.maxLossStreak || 0) <= REQUIREMENTS.maxLossStreak
    && ((candidate.health || {}).status === REQUIREMENTS.requiredHealth)
    && (candidate.forwardPaperPnl || 0) > 0;
}

function promotionWatch(candidate) {
  if (!isLive(candidate)) return false;
  return (candidate.forwardPaperPnl || 0) > 0
    && ((candidate.health || {}).status === REQUIREMENTS.requiredHealth)
    && (candidate.forwardPaperTrades || 0) >= 3
    && (candidate.profitFactor || 0) >= REQUIREMENTS.minProfitFactor
    && (candidate.maxDrawdownPct || 0) <= REQUIREMENTS.maxDrawdownPct;
}

function queueRow(candidate, status) {
  return {
    key: candidate.key,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    status,
    forwardPaperTrades: candidate.forwardPaperTrades || 0,
    forwardPaperPnl: Number((candidate.forwardPaperPnl || 0).toFixed(2)),
    profitFactor: Number((candidate.profitFactor || 0).toFixed(2)),
    maxDrawdownPct: Number((candidate.maxDrawdownPct || 0).toFixed(2)),
    maxLossStreak: candidate.maxLossStreak || 0,
    health: (candidate.health || {}).status || 'unknown'
  };
}

function updateSummary(state) {
  const rows = Object.values(state.candidates || {});
  state.summary = {
    ...(state.summary || {}),
    total: rows.length,
    incubating: rows.filter((row) => row.status === 'incubating').length,
    probation: rows.filter((row) => row.status === 'probation').length,
    readyForReview: rows.filter((row) => row.status === 'ready-for-review').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
    quarantined: rows.filter((row) => row.status === 'quarantined').length
  };
}

function applyLifecycle() {
  const state = readIncubationState();
  const gate = evaluateGate();
  const gateByKey = new Map((gate.candidates || []).map((candidate) => [candidate.key, candidate]));
  const generatedAt = new Date().toISOString();
  const inputUpdatedAt = state.updatedAt || generatedAt;
  const actions = [];
  const queue = [];

  for (const candidate of Object.values(state.candidates || {})) {
    const gateCandidate = gateByKey.get(candidate.key);

    if (shouldProbation(candidate, gateCandidate)) {
      const existing = candidate.probation || {};
      const alreadyEvaluated = existing.lastEvaluatedStateAt === inputUpdatedAt;
      const cycles = alreadyEvaluated ? existing.cycles || 0 : (existing.cycles || 0) + 1;
      candidate.previousStatus = candidate.status === 'probation' ? candidate.previousStatus || 'incubating' : candidate.status;
      candidate.status = 'probation';
      candidate.decision = 'probation';
      candidate.probation = {
        active: true,
        cycles,
        startedAt: existing.startedAt || generatedAt,
        updatedAt: generatedAt,
        lastEvaluatedStateAt: inputUpdatedAt,
        reason: `weak live row: PnL ${candidate.forwardPaperPnl || 0}, DD ${candidate.maxDrawdownPct || 0}%, loss streak ${candidate.maxLossStreak || 0}, blockers ${blockerCount(gateCandidate)}`
      };
      actions.push({
        key: candidate.key,
        action: alreadyEvaluated ? 'probation-unchanged' : 'probation',
        reason: alreadyEvaluated
          ? `already evaluated state ${inputUpdatedAt}; probation cycle not incremented`
          : candidate.probation.reason,
        cycles: candidate.probation.cycles
      });

      if (!alreadyEvaluated && shouldQuarantineFromProbation(candidate)) {
        candidate.status = 'quarantined';
        candidate.decision = 'quarantine';
        candidate.quarantine = {
          active: true,
          reason: `probation failed: ${candidate.probation.reason}`,
          updatedAt: generatedAt,
          lastEvaluatedStateAt: inputUpdatedAt
        };
        candidate.alerts = Array.from(new Set([...(candidate.alerts || []), `quarantine: ${candidate.quarantine.reason}`]));
        actions.push({ key: candidate.key, action: 'quarantine', reason: candidate.quarantine.reason });
      }
    } else if (candidate.status === 'probation') {
      candidate.status = 'incubating';
      candidate.decision = 'incubate';
      candidate.probation = {
        ...(candidate.probation || {}),
        active: false,
        clearedAt: generatedAt,
        lastEvaluatedStateAt: inputUpdatedAt,
        reason: 'probation cleared by latest paper metrics'
      };
      actions.push({ key: candidate.key, action: 'clear-probation', reason: 'latest paper metrics no longer trigger probation' });
    }

    if (promotionReady(candidate)) queue.push(queueRow(candidate, 'ready-for-manual-review'));
    else if (promotionWatch(candidate)) queue.push(queueRow(candidate, 'watch'));
  }

  updateSummary(state);
  state.lifecycle = {
    updatedAt: generatedAt,
    inputUpdatedAt
  };
  writeJson(STATE_PATH, state);

  const queueOutput = {
    generatedAt,
    inputUpdatedAt,
    rules: RULES,
    rows: queue
  };
  writeJson(QUEUE_PATH, queueOutput);

  const output = {
    generatedAt,
    inputUpdatedAt,
    gate: gate.gate,
    actions,
    promotionQueue: queue,
    summary: {
      candidates: Object.keys(state.candidates || {}).length,
      probation: state.summary.probation || 0,
      queued: queue.length,
      readyQueued: queue.filter((row) => row.status === 'ready-for-manual-review').length
    },
    reportPath: REPORT_PATH,
    queuePath: QUEUE_PATH
  };
  writeReport(output);
  return output;
}

function writeReport(output) {
  const lines = [
    '# TradeLab Lifecycle',
    '',
    `Generated: ${output.generatedAt}`,
    `Input state: ${output.inputUpdatedAt}`,
    `Real-money gate: **${output.gate}**`,
    '',
    'This report manages paper-only candidate lifecycle: incubation, probation, quarantine, and promotion queue. It does not approve real-money trading.',
    '',
    '## Summary',
    '',
    `Probation: ${output.summary.probation}; queued: ${output.summary.queued}; ready queued: ${output.summary.readyQueued}.`,
    '',
    '## Actions',
    ''
  ];

  if (output.actions.length) {
    lines.push('Candidate | Action | Reason');
    lines.push('--- | --- | ---');
    for (const row of output.actions) lines.push(`${row.key} | ${row.action} | ${row.reason}`);
  } else {
    lines.push('No lifecycle status changes.');
  }

  lines.push('', '## Promotion Queue', '');
  if (output.promotionQueue.length) {
    lines.push('Candidate | Queue Status | Trades | PnL | PF | DD | Loss Streak | Health');
    lines.push('--- | --- | ---: | ---: | ---: | ---: | ---: | ---');
    for (const row of output.promotionQueue) {
      lines.push(`${row.key} | ${row.status} | ${row.forwardPaperTrades} | ${row.forwardPaperPnl} | ${row.profitFactor} | ${row.maxDrawdownPct}% | ${row.maxLossStreak} | ${row.health}`);
    }
  } else {
    lines.push('No candidates in promotion queue yet.');
  }

  lines.push(
    '',
    '## Operator Rule',
    '',
    'Promotion queue means manual review only. It is not permission to connect API keys or place real orders.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function main() {
  console.log(JSON.stringify(applyLifecycle(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { applyLifecycle, RULES };
