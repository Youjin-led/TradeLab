const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const BASE_CHECKS = [
  { name: 'syntax:run-once', type: 'syntax', file: 'tools/tradelab_run_once.js' },
  { name: 'syntax:research-grid', type: 'syntax', file: 'tools/tradelab_research_grid.js' },
  { name: 'syntax:incubate', type: 'syntax', file: 'tools/tradelab_incubate_once.js' },
  { name: 'syntax:gate', type: 'syntax', file: 'tools/tradelab_real_money_gate.js' },
  { name: 'syntax:report', type: 'syntax', file: 'tools/tradelab_incubation_report.js' },
  { name: 'syntax:cycle', type: 'syntax', file: 'tools/tradelab_review_cycle.js' },
  { name: 'syntax:watch', type: 'syntax', file: 'tools/tradelab_watch.js' },
  { name: 'syntax:safety', type: 'syntax', file: 'tools/tradelab_safety_audit.js' },
  { name: 'syntax:drawdown', type: 'syntax', file: 'tools/tradelab_drawdown_diagnostics.js' },
  { name: 'syntax:quarantine', type: 'syntax', file: 'tools/tradelab_quarantine.js' },
  { name: 'syntax:replacement-scout', type: 'syntax', file: 'tools/tradelab_replacement_scout.js' },
  { name: 'syntax:scoreboard', type: 'syntax', file: 'tools/tradelab_scoreboard.js' },
  { name: 'syntax:network-health', type: 'syntax', file: 'tools/tradelab_network_health.js' },
  { name: 'syntax:lifecycle', type: 'syntax', file: 'tools/tradelab_lifecycle.js' },
  { name: 'syntax:recovery-promote', type: 'syntax', file: 'tools/tradelab_promote_recovery.js' },
  { name: 'safety', type: 'module', file: 'tools/tradelab_safety_audit.js', exportName: 'audit' },
  { name: 'gate', type: 'module', file: 'tools/tradelab_real_money_gate.js', exportName: 'evaluateGate' },
  { name: 'report', type: 'module', file: 'tools/tradelab_incubation_report.js', exportName: 'makeReport' },
  { name: 'drawdown', type: 'module', file: 'tools/tradelab_drawdown_diagnostics.js', exportName: 'analyzeDrawdown' },
  { name: 'quarantine', type: 'module', file: 'tools/tradelab_quarantine.js', exportName: 'refreshQuarantine' },
  { name: 'scoreboard', type: 'module', file: 'tools/tradelab_scoreboard.js', exportName: 'makeScoreboard' },
  { name: 'network-health', type: 'module', file: 'tools/tradelab_network_health.js', exportName: 'analyzeNetworkHealth' }
];

const BROWSER_CHECKS = [
  { name: 'qa', command: 'npm.cmd', args: ['run', 'qa'], shell: true }
];

function runCheck(check) {
  const started = Date.now();
  if (check.type === 'syntax') {
    try {
      const absolute = path.join(ROOT, check.file);
      new vm.Script(fs.readFileSync(absolute, 'utf8'), { filename: absolute });
      return {
        name: check.name,
        command: `node --check ${check.file}`,
        status: 'PASS',
        exitCode: 0,
        durationMs: Date.now() - started,
        stdout: '',
        stderr: ''
      };
    } catch (error) {
      return {
        name: check.name,
        command: `node --check ${check.file}`,
        status: 'FAIL',
        exitCode: 1,
        durationMs: Date.now() - started,
        stdout: '',
        stderr: (error.stack || error.message || String(error)).slice(-1200)
      };
    }
  }

  if (check.type === 'module') {
    try {
      const mod = require(path.join(ROOT, check.file));
      const result = mod[check.exportName]();
      const stdout = JSON.stringify(result, null, 2);
      return {
        name: check.name,
        command: `node ${check.file}`,
        status: result.status === 'FAIL' ? 'FAIL' : 'PASS',
        exitCode: result.status === 'FAIL' ? 1 : 0,
        durationMs: Date.now() - started,
        stdout: stdout.trim().slice(-1200),
        stderr: ''
      };
    } catch (error) {
      return {
        name: check.name,
        command: `node ${check.file}`,
        status: 'FAIL',
        exitCode: 1,
        durationMs: Date.now() - started,
        stdout: '',
        stderr: (error.stack || error.message || String(error)).slice(-1200)
      };
    }
  }

  const result = spawnSync(check.command, check.args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: check.shell || false
  });
  return {
    name: check.name,
    command: [check.command, ...check.args].join(' '),
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status,
    durationMs: Date.now() - started,
    stdout: (result.stdout || '').trim().slice(-1200),
    stderr: (result.stderr || result.error?.message || '').trim().slice(-1200)
  };
}

function doctor() {
  const includeBrowser = process.argv.includes('--browser');
  const checkList = includeBrowser ? [...BASE_CHECKS, ...BROWSER_CHECKS] : BASE_CHECKS;
  const checks = checkList.map(runCheck);
  const failed = checks.filter((check) => check.status !== 'PASS');
  return {
    generatedAt: new Date().toISOString(),
    status: failed.length ? 'FAIL' : 'PASS',
    failed: failed.map((check) => check.name),
    checks,
    rule: includeBrowser
      ? 'Doctor browser mode includes npm.cmd run qa. Use default doctor for fast non-browser checks.'
      : 'Doctor is non-network and non-browser by default. Run npm.cmd run qa separately or use tradelab:doctor -- --browser when browser QA is needed.'
  };
}

function main() {
  const result = doctor();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { doctor };
