// ============================================================
// TradeLab — Telegram sender (для локальных отчётов)
// ============================================================
// Читает TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID из .env
// и отправляет сообщение в чат. Если токен не настроен —
// молча пропускает (ничего не ломает).
// ============================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

let lastSendAt = 0;

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[Telegram] not configured (set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in .env)');
    return false;
  }
  try {
    // Троттлинг: не чаще одного сообщения в секунду
    const wait = Math.max(0, 1100 - (Date.now() - lastSendAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSendAt = Date.now();

    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text: text })
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      console.error(`[Telegram] send failed (${resp.status}): ${err.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[Telegram] send error: ${e.message}`);
    return false;
  }
}

function telegramConfigured() {
  return Boolean(BOT_TOKEN && CHAT_ID);
}

module.exports = { sendTelegram, telegramConfigured };
