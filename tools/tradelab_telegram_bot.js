/**
 * TradeLab Telegram Bot
 *
 * Мониторинг paper-trading: алерты, дневной PnL, управление.
 * Подключается к Binance публичным данным для обновлений.
 *
 * Paper-only. Не размещает реальные ордера.
 *
 * Использование:
 *   1. Добавь TELEGRAM_BOT_TOKEN в .env
 *   2. Добавь TELEGRAM_CHAT_ID в .env (твой chat ID)
 *   3. node tools/tradelab_telegram_bot.js
 *
 * Команды:
 *   /status   — текущий статус портфеля
 *   /trades   — последние 10 сделок
 *   /pause    — пауза (без новых входов)
 *   /resume   — возобновление торговли
 *   /pnl      — дневной/недельный PnL
 *   /heat     — portfolio heat
 *   /risk     — текущие блокировки
 *   /help     — справка
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const RISK_PATH = path.join(ROOT, 'tradelab-risk-manager.json');
const PAUSE_PATH = path.join(ROOT, 'tradelab-paused.json');
const CONFIG_PATH = path.join(ROOT, '.env');

// ===== Config =====

// Load .env with dotenv (primary) + custom parser (fallback)
dotenv.config({ path: CONFIG_PATH });

function loadEnv() {
  const env = {};
  if (fs.existsSync(CONFIG_PATH)) {
    const lines = fs.readFileSync(CONFIG_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) {
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
      }
    }
  }
  return env;
}

const env = loadEnv();
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
  process.exit(1);
}

// ===== Telegram API =====

function telegramAPI(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({ ok: false }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sendMessage(text, parseMode) {
  if (!CHAT_ID) return;
  // Telegram limit: 4096 chars. Split if needed.
  const chunks = [];
  let remaining = text;
  while (remaining.length > 4000) {
    const splitAt = remaining.lastIndexOf('\n', 4000);
    chunks.push(remaining.slice(0, splitAt > 0 ? splitAt : 4000));
    remaining = remaining.slice(splitAt > 0 ? splitAt + 1 : 4000);
  }
  chunks.push(remaining);

  for (const chunk of chunks) {
    await telegramAPI('sendMessage', {
      chat_id: CHAT_ID,
      text: chunk,
      parse_mode: parseMode || 'Markdown'
    });
  }
}

// ===== State Readers =====

function readJSON(filepath, fallback) {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch { return fallback; }
}

function readState() { return readJSON(STATE_PATH, { candidates: {} }); }
function readRisk() { return readJSON(RISK_PATH, { locks: {}, stats: {} }); }

function isPaused() {
  const p = readJSON(PAUSE_PATH, { paused: false });
  return p.paused;
}

function setPaused(paused) {
  fs.writeFileSync(PAUSE_PATH, JSON.stringify({ paused, at: new Date().toISOString() }, null, 2));
}

// ===== Command Handlers =====

async function handleStatus() {
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

  if (isPaused()) lines.push('*TRADING:* PAUSED');

  if (live.length > 0) {
    lines.push('*Live Candidates:*');
    for (const c of live) {
      const pnl = (c.forwardPaperPnl || 0);
      const emoji = pnl >= 0 ? '+' : '';
      const health = c.health?.status || '?';
      lines.push(`  ${c.symbol} ${c.interval} ${c.strategy}`);
      lines.push(`    PnL: ${emoji}${pnl.toFixed(2)} | Health: ${health} | Trades: ${c.forwardPaperTrades || 0}`);
    }
  } else {
    lines.push('_No live candidates._');
  }

  await sendMessage(lines.join('\n'));
}

async function handleTrades() {
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
      const emoji = t.pnl >= 0 ? '+' : '';
      lines.push(`  ${t.side} ${t.entryTime || '?'} → ${t.exitTime || 'open'} | PnL: ${pnl} (${t.reason})`);
    }
    lines.push('');
  }

  if (lines.length === 2) lines.push('_No trades yet._');
  await sendMessage(lines.join('\n'));
}

async function handlePnl() {
  const state = readState();
  const candidates = Object.values(state.candidates || {});
  const risk = readRisk();

  const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
  const dailyLoss = risk.dailyLoss || 0;
  const weeklyLoss = risk.weeklyLoss || 0;
  const monthlyLoss = risk.monthlyLoss || 0;

  const lines = [
    '*PnL Report*',
    '',
    `*Portfolio Forward PnL:* ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`,
    `*Daily Loss:* ${dailyLoss.toFixed(2)} USDT`,
    `*Weekly Loss:* ${weeklyLoss.toFixed(2)} USDT`,
    `*Monthly Loss:* ${monthlyLoss.toFixed(2)} USDT`,
    '',
    '*By Candidate:*',
  ];

  for (const c of candidates) {
    const pnl = (c.forwardPaperPnl || 0);
    lines.push(`  ${c.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`);
  }

  await sendMessage(lines.join('\n'));
}

async function handleHeat() {
  // Dynamic import to avoid circular deps
  const { calculatePortfolioHeat, RISK_CONFIG } = require('./tradelab_risk_manager');
  const state = readState();
  const candidates = Object.values(state.candidates || {});
  const heat = calculatePortfolioHeat(candidates, 10000);
  const maxHeat = 5.0;

  const bar = '█'.repeat(Math.min(20, Math.round(heat / maxHeat * 20)));
  const empty = '░'.repeat(20 - bar.length);

  const lines = [
    '*Portfolio Heat*',
    '',
    `\`${bar}${empty}\` ${heat.toFixed(1)}% / ${maxHeat}%`,
    '',
    heat > 5.0 ? '*OVERHEATED* — reduce positions!' :
    heat > 3.0 ? '*ELEVATED* — consider reducing.' :
    '*NORMAL*',
  ];

  await sendMessage(lines.join('\n'));
}

async function handleRisk() {
  const risk = readRisk();
  const locks = risk.locks || {};

  const lines = [
    '*Risk Status*',
    '',
    `Portfolio Stop-Loss: ${locks.portfolioStopLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    `Daily Loss Lock: ${locks.dailyLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    `Weekly Loss Lock: ${locks.weeklyLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    `Monthly Loss Lock: ${locks.monthlyLossLock ? '🔴 ACTIVE' : '✅ OK'}`,
    '',
    `*Total Stop-Losses:* ${risk.stats?.totalStopLossesTriggered || 0}`,
    `*Trailing Stops:* ${risk.stats?.totalTrailingStopsTriggered || 0}`,
  ];

  await sendMessage(lines.join('\n'));
}

async function handlePause() {
  setPaused(true);
  await sendMessage('*Trading PAUSED.* No new paper entries will be opened.\n/send /resume to restart.');
}

async function handleResume() {
  setPaused(false);
  await sendMessage('*Trading RESUMED.* Paper entries active again.');
}

async function handleHelp() {
  await sendMessage([
    '*TradeLab Bot Commands*',
    '',
    '/status — Portfolio status',
    '/trades — Recent paper trades',
    '/pnl — PnL report',
    '/heat — Portfolio heat',
    '/risk — Risk locks',
    '/pause — Pause trading',
    '/resume — Resume trading',
    '/help — This message',
  ].join('\n'));
}

// ===== Polling =====

async function handleUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const text = (msg.text || '').trim().toLowerCase();

  // Only respond to chat_id matches
  if (String(msg.chat.id) !== String(CHAT_ID)) return;

  const commands = {
    '/status': handleStatus,
    '/trades': handleTrades,
    '/pnl': handlePnl,
    '/heat': handleHeat,
    '/risk': handleRisk,
    '/pause': handlePause,
    '/resume': handleResume,
    '/start': handleHelp,
    '/help': handleHelp,
  };

  const handler = commands[text];
  if (handler) {
    try {
      await handler();
    } catch (err) {
      console.error('Command error:', err.message);
      await sendMessage(`Error: ${err.message}`);
    }
  }
}

let offset = 0;

async function poll() {
  try {
    const result = await telegramAPI('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message']
    });

    if (result.ok && result.result) {
      for (const update of result.result) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    }
  } catch (err) {
    console.error('Poll error:', err.message);
  }
  // Continue polling
  setTimeout(poll, 100);
}

// ===== Alert System (called externally) =====

async function alertTrade(symbol, side, entry, exit, pnl, reason) {
  const emoji = pnl >= 0 ? '🟢' : '🔴';
  const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : pnl.toFixed(2);
  await sendMessage(
    `${emoji} *Trade Closed*\n` +
    `${symbol} ${side}\n` +
    `Entry: ${entry} → Exit: ${exit}\n` +
    `PnL: ${pnlStr} USDT (${reason})`
  );
}

async function alertRisk(event) {
  await sendMessage(`⚠️ *Risk Alert*\n${event}`);
}

async function alertDailyPnl(totalPnl, tradesCount) {
  const emoji = totalPnl >= 0 ? '📈' : '📉';
  await sendMessage(
    `${emoji} *Daily PnL Report*\n` +
    `PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT\n` +
    `Trades: ${tradesCount}`
  );
}

// ===== Main =====

if (require.main === module) {
  console.log('TradeLab Telegram Bot starting...');
  console.log(`Chat ID: ${CHAT_ID}`);
  poll();
}

module.exports = {
  sendMessage,
  alertTrade,
  alertRisk,
  alertDailyPnl,
  isPaused
};
