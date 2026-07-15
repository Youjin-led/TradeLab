const fs = require('fs');
const path = require('path');

const { detectPhase } = require('./tradelab_market_phase');

const ROOT = path.join(__dirname, '..');
const SCHEDULE_LOG_PATH = path.join(ROOT, 'TRADELAB_SCHEDULE_LOG.md');
const JSON_PATH = path.join(ROOT, 'tradelab-network-health.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_NETWORK_HEALTH.md');

function readLog() {
  if (!fs.existsSync(SCHEDULE_LOG_PATH)) return '';
  return fs.readFileSync(SCHEDULE_LOG_PATH, 'utf8');
}

function parseRuns(logText) {
  const chunks = logText.split(/^### /m).filter(Boolean);
  return chunks.map((chunk) => {
    const lines = chunk.trim().split(/\r?\n/);
    const startedAt = lines[0] || 'unknown';
    const statusLine = lines.find((line) => line.includes('Status:')) || '';
    const errorLine = lines.find((line) => line.includes('Error:')) || '';
    const finishedLine = lines.find((line) => line.includes('Finished:')) || '';
    const phaseLine = lines.find((line) => line.includes('Market phase:')) || '';
    const status = statusLine.includes('PASS') ? 'PASS' : statusLine.includes('FAIL') ? 'FAIL' : statusLine.includes('ERROR') ? 'ERROR' : 'UNKNOWN';
    return {
      startedAt,
      status,
      error: errorLine.replace(/^- Error:\s*/, ''),
      finishedAt: finishedLine.replace(/^- Finished:\s*/, ''),
      marketPhase: phaseLine.replace(/^- Market phase:\s*/, '').trim()
    };
  });
}

function analyzeNetworkHealth() {
  const runs = parseRuns(readLog());
  const recent = runs.slice(-24);
  const failures = recent.filter((run) => run.status === 'FAIL' || run.status === 'ERROR');
  const fetchFailures = failures.filter((run) => /fetch|network|HTTP/i.test(run.error));

  // Определяем текущую фазу рынка
  let currentPhase = 'unknown';
  try {
    const phase = detectPhase([]);
    currentPhase = phase.phase || 'unknown';
  } catch (_) { /* ignore */ }

  // Считаем смены фазы за последние 24 запуска
  const phases = recent.map((r) => r.marketPhase).filter(Boolean);
  const phaseChanges = phases.reduce((count, phase, index) => {
    return index > 0 && phase !== phases[index - 1] ? count + 1 : count;
  }, 0);

  const output = {
    generatedAt: new Date().toISOString(),
    totalRuns: runs.length,
    recentRuns: recent.length,
    recentPass: recent.filter((run) => run.status === 'PASS').length,
    recentFailures: failures.length,
    recentFetchFailures: fetchFailures.length,
    lastRun: runs[runs.length - 1] || null,
    recentFailureRows: failures,
    currentMarketPhase: currentPhase,
    recentPhaseChanges: phaseChanges,
    status: failures.length ? 'WARN' : 'PASS'
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeReport(output);
  return {
    generatedAt: output.generatedAt,
    status: output.status,
    recentRuns: output.recentRuns,
    recentFailures: output.recentFailures,
    recentFetchFailures: output.recentFetchFailures,
    lastRun: output.lastRun,
    currentMarketPhase: currentPhase,
    recentPhaseChanges: phaseChanges,
    reportPath: REPORT_PATH
  };
}

function writeReport(output) {
  const lines = [
    '# TradeLab Network Health',
    '',
    `Generated: ${output.generatedAt}`,
    `Status: **${output.status}**`,
    '',
    'This report tracks scheduled-cycle reliability. It does not evaluate trading performance or approve real-money use.',
    '',
    '## Summary',
    '',
    `Recent runs checked: ${output.recentRuns}`,
    `Recent failures: ${output.recentFailures}`,
    `Recent fetch/network failures: ${output.recentFetchFailures}`,
    `Last run: ${output.lastRun ? `${output.lastRun.startedAt} ${output.lastRun.status}` : 'unknown'}`,
    '',
    '## Recent Failures',
    ''
  ];

  if (output.recentFailureRows.length) {
    lines.push('Started | Status | Error');
    lines.push('--- | --- | ---');
    for (const run of output.recentFailureRows) lines.push(`${run.startedAt} | ${run.status} | ${run.error || '-'}`);
  } else {
    lines.push('No failures in the recent window.');
  }

  lines.push(
    '',
    '## Operator Rule',
    '',
    'A transient fetch failure should not stop paper monitoring. Repeated failures should be investigated before trusting fresh paper metrics.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function main() {
  console.log(JSON.stringify(analyzeNetworkHealth(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { analyzeNetworkHealth };
