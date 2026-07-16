/**
 * TradeLab Telegram Bot — Webhook Version
 * Работает на Cloudflare Workers / Vercel / Netlify (бесплатно)
 *
 * Вместо polling использует webhook: Telegram шлёт обновления на URL.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const RISK_PATH = path.join(ROOT, 'tradelab-risk-manager.json');

// ===== Config =====

function getEnv(key) {
  // Cloudflare Workers: globalThis.env
  if (typeof globalThis !== 'undefined' && globalThis.env && globalThis.env[key]) return globalThis.env[key];
  // Node.js: process.env
  if (process.env && process.env[key]) return process.env[key];
  // .env file
  try {
    const envPath = path.join(ROOT, '.env');
    if (fs.existsSync(envPath)) {
      const line = fs.readFileSync(envPath, 'utf8').split('\n').find(l => l.trim().startsWith(key + '='));
      if (line) return line.trim().slice(key.length + 1);
    }
  } catch {}
  return null;
}

const BOT_TOKEN = getEnv('TELEGRAM_BOT_TOKEN');
const CHAT_ID = getEnv('TELEGRAM_CHAT_ID');

// ===== Telegram API =====

async function sendMessage(token, chatId, text, parseMode) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({
    chat_id: chatId,
    text: text,
    parse_mode: parseMode || 'Markdown'
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body
  });
  return resp.json();
}

// ===== State Readers =====

function readJSON(filepath, fallback) {
  try {
    if (typeof require !== 'undefined') {
      if (!fs.existsSync(filepath)) return fallback;
      return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    }
    return fallback;
  } catch { return fallback; }
}

function readState() { return readJSON(STATE_PATH, { candidates: {} }); }
function readRisk() { return readJSON(RISK_PATH, { locks: {}, stats: {} }); }

// ===== Command Handlers =====

function handleStatus() {
  const state = readState();
  const candidates = Object.values(state.candidates || {});
  const live = candidates.filter(c => c.status === 'incubating');
  const quarantined = candidates.filter(c => c.status === 'quarantined');
  const rejected = candidates.filter(c => c.status === 'rejected');
  const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
  const totalTrades = candidates.reduce((s, c) => s + (c.forwardPaperTrades || 0), 0);

  const lines = [
    '*TradeLab Status*',
    `_${new Date().toLocaleString('ru-RU')}_`,
    '',
    `*Portfolio:* ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`,
    `*Forward trades:* ${totalTrades}`,
    `*Live:* ${live.length} | *Quarantined:* ${quarantined.length} | *Rejected:* ${rejected.length}`,
    '',
  ];

  if (live.length > 0) {
    lines.push('*Live Candidates:*');
    for (const c of live) {
      const pnl = (c.forwardPaperPnl || 0);
      const health = c.health?.status || '?';
      lines.push(`  ${c.symbol} ${c.interval} ${c.strategy}`);
      lines.push(`    PnL: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} | Health: ${health} | Trades: ${c.forwardPaperTrades || 0}`);
    }
  } else {
    lines.push('_No live candidates._');
  }

  return lines.join('\n');
}

function handleTrades() {
  const state = readState();
  const candidates = Object.values(state.candidates || {});
  const lines = ['*Recent Paper Trades*', ''];

  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    if (trades.length === 0) continue;
    const recent = trades.slice(-5);
    lines.push(`*${c.symbol} ${c.interval} ${c.strategy}:*`);
    for (const t of recent) {
      const pnl = t.pnl >= 0 ? `+${t.pnl.toFixed(2)}` : t.pnl.toFixed(2);
      lines.push(`  ${t.side} ${t.entryTime || '?'} → ${t.exitTime || 'open'} | PnL: ${pnl} (${t.reason})`);
    }
    lines.push('');
  }

  if (lines.length === 2) lines.push('_No trades yet._');
  return lines.join('\n');
}

function handlePnl() {
  const state = readState();
  const candidates = Object.values(state.candidates || {});
  const risk = readRisk();
  const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);

  const lines = [
    '*PnL Report*',
    '',
    `*Portfolio Forward PnL:* ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`,
    `*Daily Loss:* ${(risk.dailyLoss || 0).toFixed(2)} USDT`,
    `*Weekly Loss:* ${(risk.weeklyLoss || 0).toFixed(2)} USDT`,
    `*Monthly Loss:* ${(risk.monthlyLoss || 0).toFixed(2)} USDT`,
    '',
    '*By Candidate:*',
  ];

  for (const c of candidates) {
    const pnl = (c.forwardPaperPnl || 0);
    lines.push(`  ${c.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`);
  }

  return lines.join('\n');
}

function handleRisk() {
  const risk = readRisk();
  const locks = risk.locks || {};
  return [
    '*Risk Status*',
    '',
    `Portfolio Stop-Loss: ${locks.portfolioStopLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    `Daily Loss Lock: ${locks.dailyLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    `Weekly Loss Lock: ${locks.weeklyLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    `Monthly Loss Lock: ${locks.monthlyLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    '',
    `*Total Stop-Losses:* ${risk.stats?.totalStopLossesTriggered || 0}`,
    `*Trailing Stops:* ${risk.stats?.totalTrailingStopsTriggered || 0}`,
  ].join('\n');
}

function handleHelp() {
  return [
    '*TradeLab Bot Commands*',
    '',
    '/status — Portfolio status',
    '/trades — Recent paper trades',
    '/pnl — PnL report',
    '/risk — Risk locks',
    '/help — This message',
  ].join('\n');
}

// ===== Webhook Handler =====

async function handleWebhook(request) {
  try {
    const update = await request.json();

    if (!update.message) return new Response('ok');
    const msg = update.message;
    const text = (msg.text || '').trim().toLowerCase();
    const chatId = String(msg.chat.id);

    // Only respond to configured chat
    if (chatId !== String(CHAT_ID)) return new Response('ok');

    let response;
    switch (text) {
      case '/status': response = handleStatus(); break;
      case '/trades': response = handleTrades(); break;
      case '/pnl': response = handlePnl(); break;
      case '/risk': response = handleRisk(); break;
      case '/start':
      case '/help': response = handleHelp(); break;
      default: return new Response('ok');
    }

    await sendMessage(BOT_TOKEN, chatId, response);
    return new Response('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('ok'); // Always return 200 to Telegram
  }
}

// ===== Setup Webhook =====

async function setupWebhook(webhookUrl) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl })
  });
  return resp.json();
}

// ===== Export for Cloudflare Workers =====

if (typeof globalThis !== 'undefined' && globalThis.fetch) {
  // Cloudflare Workers environment
  globalThis.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    if (url.pathname === '/webhook' && event.request.method === 'POST') {
      event.respondWith(handleWebhook(event.request));
    } else if (url.pathname === '/setup') {
      const webhookUrl = url.searchParams.get('url');
      if (webhookUrl) {
        event.respondWith(setupWebhook(webhookUrl).then(r => new Response(JSON.stringify(r))));
      } else {
        event.respondWith(new Response('Provide ?url=YOUR_WEBHOOK_URL'));
      }
    } else {
      event.respondWith(new Response('TradeLab Bot is running. POST to /webhook'));
    }
  });
}

// ===== Node.js fallback =====

if (typeof module !== 'undefined' && typeof globalThis === 'undefined') {
  module.exports = { handleWebhook, setupWebhook, handleStatus, handleTrades, handlePnl, handleRisk, handleHelp };
}
