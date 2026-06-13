const fs = require('fs');
const path = require('path');

const { CANDIDATES } = require('./tradelab_incubate_once');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');

const ROOT = path.join(__dirname, '..');
const SANDBOX_PATH = path.join(ROOT, 'tradelab-recovery-sandbox.json');
const AUTO_CANDIDATES_PATH = path.join(ROOT, 'tradelab-auto-candidates.json');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_RECOVERY_PROMOTION.md');

const RULES = {
  maxPromotions: 1,
  minTrades: 6,
  minProfitFactor: 1.6,
  maxDrawdownPct: 5.5,
  requiredStability: 'stable',
  requiredHealth: 'Healthy'
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function keyFor(candidate) {
  const strategy = candidate.strategy || (candidate.params || {}).strategy;
  return `${candidate.symbol}:${candidate.interval}:${strategy}`;
}

function existingKeys() {
  const auto = readJson(AUTO_CANDIDATES_PATH, { candidates: [] });
  const state = readJson(STATE_PATH, { candidates: {} });
  return new Set([
    ...CANDIDATES.map(keyFor),
    ...(auto.candidates || []).map(keyFor),
    ...Object.keys(state.candidates || {})
  ]);
}

function validateSandboxRow(row) {
  const reasons = [];
  if (!row || !row.symbol || !row.interval || !row.strategy || !row.params) reasons.push('missing candidate fields');
  if ((row.failReasons || []).length) reasons.push(`sandbox fail reasons: ${row.failReasons.join('; ')}`);
  if (row.stability !== RULES.requiredStability) reasons.push(`stability ${row.stability} != ${RULES.requiredStability}`);
  if (row.health !== RULES.requiredHealth) reasons.push(`health ${row.health} != ${RULES.requiredHealth}`);
  if ((row.trades || 0) < RULES.minTrades) reasons.push(`trades ${row.trades || 0} < ${RULES.minTrades}`);
  if ((row.profitFactor || 0) < RULES.minProfitFactor) reasons.push(`PF ${row.profitFactor || 0} < ${RULES.minProfitFactor}`);
  if ((row.maxDrawdownPct || 0) > RULES.maxDrawdownPct) reasons.push(`DD ${row.maxDrawdownPct || 0}% > ${RULES.maxDrawdownPct}%`);
  return { ok: reasons.length === 0, reasons };
}

function candidateFromRow(row, generatedAt) {
  return {
    symbol: row.symbol,
    interval: row.interval,
    limit: 1000,
    active: true,
    source: 'recovery-sandbox',
    addedAt: generatedAt,
    recovery: {
      promotedAt: generatedAt,
      sandboxUpdatedAt: null,
      score: row.score,
      testPnl: row.testPnl,
      profitFactor: row.profitFactor,
      maxDrawdownPct: row.maxDrawdownPct,
      trades: row.trades
    },
    reason: `recovery sandbox: ${row.strategy} ${row.interval}, PF ${row.profitFactor}, DD ${row.maxDrawdownPct}%, trades ${row.trades}`,
    params: row.params
  };
}

function writeReport(output) {
  const lines = [
    '# TradeLab Recovery Promotion',
    '',
    `Generated: ${output.generatedAt}`,
    `Portfolio kill-switch: ${output.killSwitch.active ? 'ACTIVE' : 'clear'}`,
    '',
    'This command promotes strict recovery sandbox rows into paper auto-incubation only. It does not approve real-money trading.',
    '',
    '## Summary',
    '',
    `Promoted: ${output.promoted.length}; skipped: ${output.skipped.length}.`,
    ''
  ];

  if (output.promoted.length) {
    lines.push('## Promoted', '');
    lines.push('Candidate | Reason');
    lines.push('--- | ---');
    for (const row of output.promoted) lines.push(`${row.key} | ${row.reason}`);
    lines.push('');
  }

  lines.push('## Skipped', '');
  if (output.skipped.length) {
    lines.push('Candidate | Reasons');
    lines.push('--- | ---');
    for (const row of output.skipped) lines.push(`${row.key || 'unknown'} | ${row.reasons.join('; ')}`);
  } else {
    lines.push('No rows skipped.');
  }

  lines.push(
    '',
    '## Operator Rule',
    '',
    'Promoted recovery candidates must still survive incubation, lifecycle, quarantine, kill-switch, manual review, and the real-money gate.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function promoteRecovery() {
  const generatedAt = new Date().toISOString();
  const sandbox = readJson(SANDBOX_PATH, { rows: [] });
  const auto = readJson(AUTO_CANDIDATES_PATH, { updatedAt: null, candidates: [] });
  const keys = existingKeys();
  const promoted = [];
  const skipped = [];

  for (const row of sandbox.rows || []) {
    const key = keyFor(row);
    const validation = validateSandboxRow(row);
    if (keys.has(key)) validation.reasons.push('already known in base, auto, or incubation state');
    if (!validation.ok || validation.reasons.length) {
      skipped.push({ key, reasons: validation.reasons });
      continue;
    }
    if (promoted.length >= RULES.maxPromotions) {
      skipped.push({ key, reasons: [`promotion limit ${RULES.maxPromotions} reached`] });
      continue;
    }

    const candidate = candidateFromRow(row, generatedAt);
    candidate.recovery.sandboxUpdatedAt = sandbox.updatedAt || null;
    auto.candidates = [...(auto.candidates || []), candidate];
    keys.add(key);
    promoted.push({ key, reason: candidate.reason });
  }

  auto.updatedAt = generatedAt;
  writeJson(AUTO_CANDIDATES_PATH, auto);

  const output = {
    generatedAt,
    rules: RULES,
    sandboxUpdatedAt: sandbox.updatedAt || null,
    killSwitch: portfolioKillSwitch(),
    promoted,
    skipped,
    reportPath: REPORT_PATH,
    autoCandidatesPath: AUTO_CANDIDATES_PATH
  };
  writeReport(output);
  return output;
}

function main() {
  console.log(JSON.stringify(promoteRecovery(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { promoteRecovery, RULES };
