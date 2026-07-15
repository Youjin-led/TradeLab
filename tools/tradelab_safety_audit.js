const fs = require('fs');
const path = require('path');

const { evaluateGate } = require('./tradelab_real_money_gate');

const ROOT = path.join(__dirname, '..');
const FILES_TO_SCAN = [
  'tools/tradelab_run_once.js',
  'tools/tradelab_research_grid.js',
  'tools/tradelab_incubate_once.js',
  'tools/tradelab_real_money_gate.js',
  'tools/tradelab_incubation_report.js',
  'tools/tradelab_review_cycle.js',
  'tools/tradelab_watch.js',
  'tools/tradelab_quarantine.js',
  'tools/tradelab_unquarantine.js',
  'tools/tradelab_risk_controls.js',
  'tools/tradelab_daily_discovery.js',
  'tools/tradelab_scoreboard.js',
  'tools/tradelab_paper_trader.js',
  'tools/tradelab_replacement_scout.js',
  'tools/tradelab_doctor.js',
  'tools/tradelab_drawdown_diagnostics.js',
  'tools/tradelab_promote_recovery.js',
  'tools/tradelab_lifecycle.js',
  'tools/tradelab_network_health.js',
  'tools/tradelab_market_phase.js',
  'tools/tradelab_news_impact.js',
  'tools/tradelab_risk_manager.js'
];

const FORBIDDEN_PATTERNS = [
  { name: 'Binance signed order endpoint', pattern: /\/api\/v3\/order\b/i },
  { name: 'Binance futures order endpoint', pattern: /\/fapi\/v1\/order\b/i },
  { name: 'Exchange API key environment access', pattern: /process\.env\.(BINANCE|BYBIT|OKX|KUCOIN|COINBASE|KRAKEN).*KEY/i },
  { name: 'Exchange secret environment access', pattern: /process\.env\.(BINANCE|BYBIT|OKX|KUCOIN|COINBASE|KRAKEN).*SECRET/i },
  { name: 'Hardcoded private key label', pattern: /(apiKey|api_key|secretKey|secret_key)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}/i },
  { name: 'Order placement verb', pattern: /\b(placeOrder|createOrder|submitOrder|sendOrder)\b/i }
];

const ALLOWED_MARKET_DATA_PATTERNS = [
  'data-api.binance.vision',
  '/api/v3/klines'
];

function readText(relativePath) {
  const fullPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf8');
}

function scanFile(relativePath) {
  const text = readText(relativePath);
  if (text === null) return [{ severity: 'error', message: `Missing file: ${relativePath}` }];
  const findings = [];
  for (const forbidden of FORBIDDEN_PATTERNS) {
    if (forbidden.pattern.test(text)) {
      findings.push({ severity: 'error', message: `${relativePath}: ${forbidden.name}` });
    }
  }
  return findings;
}

function checkMarketDataOnly() {
  const runOnce = readText('tools/tradelab_run_once.js') || '';
  return ALLOWED_MARKET_DATA_PATTERNS.every((pattern) => runOnce.includes(pattern))
    ? []
    : [{ severity: 'error', message: 'Public market-data source is missing or changed.' }];
}

function checkGate() {
  const gate = evaluateGate();
  const findings = [];
  if (!['BLOCKED', 'MANUAL_REVIEW_ALLOWED'].includes(gate.gate)) {
    findings.push({ severity: 'error', message: `Unexpected gate status: ${gate.gate}` });
  }
  if (gate.gate === 'MANUAL_REVIEW_ALLOWED') {
    findings.push({ severity: 'warn', message: 'Gate allows manual review. Confirm risk plan before any live-trading implementation.' });
  }
  return { gate, findings };
}

function checkReports() {
  const findings = [];
  for (const file of ['TRADELAB_INCUBATION_REPORT.md', 'TRADELAB.md']) {
    if (!fs.existsSync(path.join(ROOT, file))) findings.push({ severity: 'warn', message: `Missing operator document: ${file}` });
  }
  return findings;
}

function audit() {
  const scanFindings = FILES_TO_SCAN.flatMap(scanFile);
  const gateCheck = checkGate();
  const findings = [
    ...scanFindings,
    ...checkMarketDataOnly(),
    ...checkReports(),
    ...gateCheck.findings
  ];
  const errors = findings.filter((finding) => finding.severity === 'error');
  return {
    generatedAt: new Date().toISOString(),
    status: errors.length ? 'FAIL' : 'PASS',
    scope: FILES_TO_SCAN,
    gate: gateCheck.gate.gate,
    findings,
    rule: 'No API keys, no exchange account access, no order endpoints, no real orders.'
  };
}

function main() {
  const result = audit();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS') process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { audit };
