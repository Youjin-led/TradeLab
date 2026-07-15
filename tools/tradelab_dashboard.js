/**
 * TradeLab Dashboard
 * 
 * Веб-панель для мониторинга TradeLab в реальном времени.
 * Запускается как HTTP-сервер на localhost.
 * 
 * Использование:
 *   npm.cmd run tradelab:dashboard
 *   # Открыть http://localhost:3456
 * 
 * Все данные paper-only. Реальные ордера не размещаются.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { detectPhase } = require('./tradelab_market_phase');

const ROOT = path.join(__dirname, '..');
const PORT = 3456;

// ===== ЧТЕНИЕ ДАННЫХ =====

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getDashboardData() {
  const state = readJSON(path.join(ROOT, 'tradelab-incubation-state.json'));
  const gate = readJSON(path.join(ROOT, 'tradelab-real-money-gate.json'));
  const riskManager = readJSON(path.join(ROOT, 'tradelab-risk-manager.json'));
  const scoreboard = readJSON(path.join(ROOT, 'tradelab-scoreboard.json'));
  const network = readJSON(path.join(ROOT, 'tradelab-network-health.json'));
  const quarantine = readJSON(path.join(ROOT, 'tradelab-quarantine.json'));
  const drawdown = readJSON(path.join(ROOT, 'tradelab-drawdown-diagnostics.json'));
  const news = readJSON(path.join(ROOT, 'tradelab-news-impact.json'));
  const lifecycle = readJSON(path.join(ROOT, 'tradelab-promotion-queue.json'));

  // Определяем текущую фазу рынка
  let marketPhase = 'unknown';
  try {
    const phase = detectPhase([]);
    marketPhase = phase.phase || 'unknown';
  } catch (_) { /* ignore */ }

  const candidates = Object.values(state?.candidates || {});
  const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
  const incubating = candidates.filter(c => c.status === 'incubating');
  const rejected = candidates.filter(c => c.status === 'rejected');
  const ready = candidates.filter(c => c.status === 'ready-for-review');

  return {
    generatedAt: new Date().toISOString(),
    marketPhase,
    summary: {
      totalCandidates: candidates.length,
      incubating: incubating.length,
      rejected: rejected.length,
      readyForReview: ready.length,
      totalPnl: Number(totalPnl.toFixed(2)),
      gateStatus: gate?.gate || 'UNKNOWN',
      riskStatus: riskManager?.locks?.portfolioStopLossLock ? 'EMERGENCY' : riskManager?.locks?.dailyLossLock ? 'LIMIT_HIT' : 'NORMAL',
      networkOk: network?.ok ?? true,
      quarantined: quarantine?.quarantined?.length || 0,
    },
    candidates: candidates.map(c => ({
      key: c.key,
      symbol: c.symbol,
      interval: c.interval,
      strategy: c.strategy,
      status: c.status,
      health: c.health?.status || 'unknown',
      healthScore: c.health?.score || 0,
      liveObservations: c.liveObservations || 0,
      forwardPaperTrades: c.forwardPaperTrades || 0,
      forwardPaperPnl: Number((c.forwardPaperPnl || 0).toFixed(2)),
      profitFactor: Number((c.profitFactor || 0).toFixed(2)),
      maxDrawdown: Number((c.maxDrawdownPct || 0).toFixed(2)),
      maxLossStreak: c.maxLossStreak || 0,
      alerts: (c.alerts || []).length,
    })),
    riskManager: riskManager ? {
      status: riskManager.locks?.portfolioStopLossLock ? 'EMERGENCY' : 'NORMAL',
      locks: riskManager.locks || {},
      trailingStops: Object.keys(riskManager.trailingStops || {}).length,
      stats: riskManager.stats || {},
    } : null,
    network: network ? {
      ok: network.ok,
      recentFailures: network.recentFailures || 0,
      lastSuccess: network.lastSuccess || null,
    } : null,
  };
}

// ===== HTML ГЕНЕРАЦИЯ =====

function generateHTML(data) {
  const s = data.summary;
  const candidates = data.candidates || [];
  
  // Цвета для статусов
  const statusColor = (status) => {
    switch(status) {
      case 'incubating': return '#22c55e';
      case 'rejected': return '#ef4444';
      case 'ready-for-review': return '#f59e0b';
      case 'watching': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const riskColor = (status) => {
    switch(status) {
      case 'EMERGENCY': return '#ef4444';
      case 'LIMIT_HIT': return '#f59e0b';
      default: return '#22c55e';
    }
  };

  const candidatesRows = candidates.map(c => `
    <tr>
      <td><strong>${c.symbol}</strong></td>
      <td>${c.interval}</td>
      <td>${c.strategy}</td>
      <td><span style="color:${statusColor(c.status)};font-weight:bold">${c.status}</span></td>
      <td style="color:${c.health === 'Healthy' ? '#22c55e' : '#ef4444'}">${c.health} (${c.healthScore})</td>
      <td>${c.liveObservations}</td>
      <td>${c.forwardPaperTrades}</td>
      <td style="color:${c.forwardPaperPnl >= 0 ? '#22c55e' : '#ef4444'};font-weight:bold">${c.forwardPaperPnl >= 0 ? '+' : ''}${c.forwardPaperPnl}</td>
      <td>${c.profitFactor}</td>
      <td>${c.maxDrawdown}%</td>
      <td>${c.maxLossStreak}</td>
      <td>${c.alerts > 0 ? `🔴 ${c.alerts}` : '✅'}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TradeLab Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 20px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
    
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: #1e293b; border-radius: 12px; padding: 16px;
      border: 1px solid #334155;
    }
    .card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .value { font-size: 28px; font-weight: bold; margin-top: 4px; }
    
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }
    th { background: #334155; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; }
    td { padding: 10px 16px; border-bottom: 1px solid #334155; font-size: 14px; }
    tr:hover { background: #1e3a5f; }
    
    .status-bar { display: flex; gap: 8px; margin-bottom: 16px; }
    .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    
    .refresh-btn {
      background: #3b82f6; color: white; border: none; padding: 8px 16px;
      border-radius: 8px; cursor: pointer; font-size: 14px; margin-bottom: 16px;
    }
    .refresh-btn:hover { background: #2563eb; }
    
    .footer { margin-top: 24px; color: #64748b; font-size: 12px; text-align: center; }
    
    .pnl-positive { color: #22c55e; }
    .pnl-negative { color: #ef4444; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:start">
    <div>
      <h1>📊 TradeLab Dashboard</h1>
      <div class="subtitle">Paper Trading Monitor — Last updated: ${data.generatedAt} | Market phase: <strong>${data.marketPhase}</strong></div>
    </div>
    <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
  </div>
  
  <div class="status-bar">
    <span class="status-badge" style="background:${riskColor(s.riskStatus)}20;color:${riskColor(s.riskStatus)};border:1px solid ${riskColor(s.riskStatus)}">
      Risk: ${s.riskStatus}
    </span>
    <span class="status-badge" style="background:${s.gateStatus === 'MANUAL_REVIEW_ALLOWED' ? '#22c55e20' : '#f59e0b20'};color:${s.gateStatus === 'MANUAL_REVIEW_ALLOWED' ? '#22c55e' : '#f59e0b'};border:1px solid ${s.gateStatus === 'MANUAL_REVIEW_ALLOWED' ? '#22c55e' : '#f59e0b'}">
      Gate: ${s.gateStatus}
    </span>
    <span class="status-badge" style="background:${s.networkOk ? '#22c55e20' : '#ef444420'};color:${s.networkOk ? '#22c55e' : '#ef4444'};border:1px solid ${s.networkOk ? '#22c55e' : '#ef4444'}">
      Network: ${s.networkOk ? '✅ OK' : '❌ Issues'}
    </span>
  </div>
  
  <div class="cards">
    <div class="card">
      <div class="label">Total Candidates</div>
      <div class="value">${s.totalCandidates}</div>
    </div>
    <div class="card">
      <div class="label">Incubating</div>
      <div class="value" style="color:#22c55e">${s.incubating}</div>
    </div>
    <div class="card">
      <div class="label">Rejected</div>
      <div class="value" style="color:#ef4444">${s.rejected}</div>
    </div>
    <div class="card">
      <div class="label">Ready for Review</div>
      <div class="value" style="color:#f59e0b">${s.readyForReview}</div>
    </div>
    <div class="card">
      <div class="label">Portfolio PnL</div>
      <div class="value ${s.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}">${s.totalPnl >= 0 ? '+' : ''}${s.totalPnl} USDT</div>
    </div>
    <div class="card">
      <div class="label">Quarantined</div>
      <div class="value">${s.quarantined}</div>
    </div>
  </div>
  
  <h2 style="margin-bottom:12px">📋 Candidates</h2>
  <div style="overflow-x:auto">
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Interval</th>
          <th>Strategy</th>
          <th>Status</th>
          <th>Health</th>
          <th>Obs</th>
          <th>Paper Trades</th>
          <th>PnL</th>
          <th>PF</th>
          <th>DD%</th>
          <th>Loss Streak</th>
          <th>Alerts</th>
        </tr>
      </thead>
      <tbody>
        ${candidatesRows || '<tr><td colspan="12" style="text-align:center;color:#64748b">No candidates found</td></tr>'}
      </tbody>
    </table>
  </div>
  
  ${data.riskManager ? `
  <h2 style="margin:24px 0 12px">🛡️ Risk Manager</h2>
  <div class="cards">
    <div class="card">
      <div class="label">Status</div>
      <div class="value" style="color:${riskColor(data.riskManager.status)}">${data.riskManager.status}</div>
    </div>
    <div class="card">
      <div class="label">Active Trailing Stops</div>
      <div class="value">${data.riskManager.trailingStops}</div>
    </div>
    <div class="card">
      <div class="label">Stop-Losses Triggered</div>
      <div class="value">${data.riskManager.stats?.totalStopLossesTriggered || 0}</div>
    </div>
    <div class="card">
      <div class="label">Margin Warnings</div>
      <div class="value">${data.riskManager.stats?.totalMarginWarnings || 0}</div>
    </div>
  </div>
  ` : ''}
  
  ${data.network ? `
  <h2 style="margin:24px 0 12px">🌐 Network Health</h2>
  <div class="cards">
    <div class="card">
      <div class="label">Status</div>
      <div class="value" style="color:${data.network.ok ? '#22c55e' : '#ef4444'}">${data.network.ok ? '✅ OK' : '❌ Issues'}</div>
    </div>
    <div class="card">
      <div class="label">Recent Failures</div>
      <div class="value">${data.network.recentFailures}</div>
    </div>
  </div>
  ` : ''}
  
  <div class="footer">
    <p>TradeLab Paper Trading Dashboard — No real orders are placed</p>
    <p style="margin-top:4px">Auto-refresh every 60 seconds | <a href="javascript:location.reload()" style="color:#3b82f6">Refresh now</a></p>
  </div>
  
  <script>
    // Auto-refresh every 60 seconds
    setTimeout(() => location.reload(), 60000);
  </script>
</body>
</html>`;
}

// ===== HTTP СЕРВЕР =====

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/data') {
      // JSON API endpoint
      const data = getDashboardData();
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(data, null, 2));
      return;
    }

    // HTML dashboard
    const data = getDashboardData();
    const html = generateHTML(data);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  server.listen(PORT, () => {
    console.log(`\n📊 TradeLab Dashboard`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   API:     http://localhost:${PORT}/api/data`);
    console.log(`\n   Press Ctrl+C to stop\n`);
  });

  return server;
}

// ===== MAIN =====

function main() {
  const server = startServer();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down dashboard...');
    server.close(() => process.exit(0));
  });
}

if (require.main === module) {
  main();
}

module.exports = { startServer, getDashboardData };
