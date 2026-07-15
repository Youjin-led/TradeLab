const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const DIAGNOSTICS_PATH = path.join(ROOT, 'tradelab-drawdown-diagnostics.json');
const QUARANTINE_PATH = path.join(ROOT, 'tradelab-quarantine.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_QUARANTINE.md');

const RULES = {
  maxSymbolForwardPnl: -750,
  maxCandidateForwardPnl: -300,
  maxStrategyForwardPnl: -2000,
  minStrategyRejectedRatio: 0.60,
  maxTimeframeForwardPnlForDownrank: -3000
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function keyFor(candidate) {
  const strategy = candidate.strategy || (candidate.params || {}).strategy;
  return `${String(candidate.symbol || '').toUpperCase()}:${candidate.interval}:${strategy}`;
}

function strategyFor(candidate) {
  return candidate.strategy || (candidate.params || {}).strategy || 'unknown';
}

function makeReason(prefix, row) {
  return `${prefix}: PnL ${row.pnl}, trades ${row.trades}, winrate ${Math.round((row.winrate || 0) * 100)}%, max DD ${row.maxDrawdownPct}%`;
}

function buildQuarantineFromDiagnostics(diagnostics = readJson(DIAGNOSTICS_PATH, null)) {
  if (!diagnostics) {
    return {
      generatedAt: new Date().toISOString(),
      rules: RULES,
      blockedSymbols: [],
      blockedStrategies: [],
      blockedCandidates: [],
      downrankIntervals: [],
      source: 'missing-diagnostics'
    };
  }

  const blockedSymbols = (diagnostics.bySymbol || [])
    .filter((row) => row.pnl <= RULES.maxSymbolForwardPnl)
    .map((row) => ({
      symbol: row.key,
      reason: makeReason('weak symbol', row)
    }));

  const blockedStrategies = (diagnostics.byStrategy || [])
    .filter((row) => {
      const blocked = (row.rejected || 0) + (row.quarantined || 0);
      const rejectedRatio = row.candidates ? blocked / row.candidates : 0;
      return row.pnl <= RULES.maxStrategyForwardPnl && rejectedRatio >= RULES.minStrategyRejectedRatio;
    })
    .map((row) => ({
      strategy: row.key,
      reason: `${makeReason('weak strategy', row)}, blocked ${(row.rejected || 0) + (row.quarantined || 0)}/${row.candidates}`
    }));

  const blockedCandidates = (diagnostics.worstCandidates || [])
    .filter((row) => row.forwardPaperPnl <= RULES.maxCandidateForwardPnl || (row.health || {}).status === 'Blocked')
    .map((row) => ({
      key: row.key,
      reason: `weak candidate: forward PnL ${row.forwardPaperPnl}, PF ${row.profitFactor}, max DD ${row.maxDrawdownPct}%, health ${(row.health || {}).status || 'unknown'}`
    }));

  const downrankIntervals = (diagnostics.byInterval || [])
    .filter((row) => row.pnl <= RULES.maxTimeframeForwardPnlForDownrank)
    .map((row) => ({
      interval: row.key,
      reason: makeReason('weak timeframe', row)
    }));

  return {
    generatedAt: new Date().toISOString(),
    diagnosticsGeneratedAt: diagnostics.generatedAt || null,
    rules: RULES,
    blockedSymbols,
    blockedStrategies,
    blockedCandidates,
    downrankIntervals,
    source: DIAGNOSTICS_PATH
  };
}

function loadQuarantine() {
  return readJson(QUARANTINE_PATH, {
    generatedAt: null,
    rules: RULES,
    blockedSymbols: [],
    blockedStrategies: [],
    blockedCandidates: [],
    downrankIntervals: []
  });
}

function quarantineReason(candidate, quarantine = loadQuarantine()) {
  const key = keyFor(candidate);
  const symbol = String(candidate.symbol || '').toUpperCase();
  const strategy = strategyFor(candidate);
  const exact = (quarantine.blockedCandidates || []).find((row) => row.key === key);
  if (exact) return exact.reason;
  const bySymbol = (quarantine.blockedSymbols || []).find((row) => row.symbol === symbol);
  if (bySymbol) return bySymbol.reason;
  const byStrategy = (quarantine.blockedStrategies || []).find((row) => row.strategy === strategy);
  if (byStrategy) return byStrategy.reason;
  return '';
}

function isQuarantined(candidate, quarantine = loadQuarantine()) {
  return Boolean(quarantineReason(candidate, quarantine));
}

function applyQuarantineToState(state, quarantine = loadQuarantine()) {
  const candidates = state.candidates || {};
  let changed = 0;
  for (const candidate of Object.values(candidates)) {
    const reason = quarantineReason(candidate, quarantine);
    if (!reason) continue;
    
    // Защита от циклического анкарантина: не трогаем недавно разблокированных
    const unquarantineCycleCount = candidate.quarantine?.unquarantineCycleCount;
    if (unquarantineCycleCount !== undefined && unquarantineCycleCount < 3) {
      // Пропускаем — кандидат недавно был разблокирован, даём ему время
      continue;
    }
    
    if (candidate.status !== 'quarantined') {
      candidate.previousStatus = candidate.status;
      changed += 1;
    }
    candidate.status = 'quarantined';
    candidate.decision = 'quarantine';
    candidate.quarantine = {
      active: true,
      reason,
      updatedAt: quarantine.generatedAt || new Date().toISOString()
    };
    candidate.alerts = Array.from(new Set([...(candidate.alerts || []), `quarantine: ${reason}`]));
  }
  const rows = Object.values(candidates);
  state.summary = {
    ...(state.summary || {}),
    total: rows.length,
    incubating: rows.filter((row) => row.status === 'incubating').length,
    readyForReview: rows.filter((row) => row.status === 'ready-for-review').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
    quarantined: rows.filter((row) => row.status === 'quarantined').length
  };
  return { state, changed };
}

function quarantineStateFile(quarantine = loadQuarantine()) {
  const state = readJson(STATE_PATH, null);
  if (!state) return { changed: 0, statePath: STATE_PATH, reason: 'missing incubation state' };
  const result = applyQuarantineToState(state, quarantine);
  if (result.changed) {
    result.state.updatedAt = new Date().toISOString();
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(result.state, null, 2)}\n`);
  }
  return {
    changed: result.changed,
    statePath: STATE_PATH,
    quarantined: Object.values(result.state.candidates || {}).filter((candidate) => candidate.status === 'quarantined').length
  };
}

function writeReport(quarantine) {
  const lines = [
    '# TradeLab Quarantine',
    '',
    `Generated: ${quarantine.generatedAt}`,
    `Diagnostics generated: ${quarantine.diagnosticsGeneratedAt || 'unknown'}`,
    '',
    'This is a paper-only safety layer. Quarantine blocks weak candidates from further paper updates and prevents similar new candidates from auto-discovery.',
    '',
    '## Blocked Symbols',
    ''
  ];

  if ((quarantine.blockedSymbols || []).length) {
    for (const row of quarantine.blockedSymbols) lines.push(`- ${row.symbol}: ${row.reason}`);
  } else {
    lines.push('- none');
  }

  lines.push('', '## Blocked Strategies', '');
  if ((quarantine.blockedStrategies || []).length) {
    for (const row of quarantine.blockedStrategies) lines.push(`- ${row.strategy}: ${row.reason}`);
  } else {
    lines.push('- none');
  }

  lines.push('', '## Blocked Candidates', '');
  if ((quarantine.blockedCandidates || []).length) {
    for (const row of quarantine.blockedCandidates) lines.push(`- ${row.key}: ${row.reason}`);
  } else {
    lines.push('- none');
  }

  lines.push('', '## Downranked Timeframes', '');
  if ((quarantine.downrankIntervals || []).length) {
    for (const row of quarantine.downrankIntervals) lines.push(`- ${row.interval}: ${row.reason}`);
  } else {
    lines.push('- none');
  }

  lines.push(
    '',
    '## Operator Rule',
    '',
    'A quarantined symbol, strategy, or candidate can return only after a later paper diagnostic no longer triggers these rules and the real-money gate remains blocked until manual review.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function refreshQuarantine() {
  const quarantine = buildQuarantineFromDiagnostics();
  fs.writeFileSync(QUARANTINE_PATH, `${JSON.stringify(quarantine, null, 2)}\n`);
  writeReport(quarantine);
  const stateUpdate = quarantineStateFile(quarantine);
  return {
    generatedAt: quarantine.generatedAt,
    reportPath: REPORT_PATH,
    jsonPath: QUARANTINE_PATH,
    stateUpdate,
    blockedSymbols: quarantine.blockedSymbols.length,
    blockedStrategies: quarantine.blockedStrategies.length,
    blockedCandidates: quarantine.blockedCandidates.length,
    downrankIntervals: quarantine.downrankIntervals.length
  };
}

function main() {
  console.log(JSON.stringify(refreshQuarantine(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  RULES,
  QUARANTINE_PATH,
  buildQuarantineFromDiagnostics,
  refreshQuarantine,
  loadQuarantine,
  quarantineReason,
  isQuarantined,
  applyQuarantineToState,
  quarantineStateFile
};
