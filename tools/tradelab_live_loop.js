// ============================================================
// TradeLab — Live Trading Loop (автоматический цикл)
// ============================================================
// Запускается каждые N минут, проверяет gate и сигналы,
// выполняет сделки если все условия соблюдены.
// ============================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const { executeTrade, checkGate, loadTrades, loadDailyPnl, monitorOpenPositions, paperAccountStatus, verifyExchangePositions } = require('./tradelab_live_executor');
const { evaluateGate } = require('./tradelab_real_money_gate');
const { evaluateSoftGate } = require('./tradelab_soft_gate');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');
const { sendTelegram } = require('./tradelab_telegram_sender');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const REPORT_STATE_PATH = path.join(__dirname, '..', 'tradelab-paper-telegram-state.json');
let activeSafetyAlert = null;

async function notifySafetyState(code, message) {
  if (activeSafetyAlert === code) return;
  activeSafetyAlert = code;
  try {
    await sendTelegram(`⛔ *TradeLab: новые реальные входы остановлены*\n${message}`);
  } catch (error) {
    log(`⚠️ Safety alert send failed: ${error.message}`);
  }
}

async function clearSafetyState() {
  if (!activeSafetyAlert) return;
  activeSafetyAlert = null;
  try {
    await sendTelegram('✅ *TradeLab: проверка безопасности восстановилась*\nНовые входы снова проходят обычные фильтры.');
  } catch (error) {
    log(`⚠️ Safety recovery alert send failed: ${error.message}`);
  }
}

const CONFIG = {
  // Интервал проверки в минутах
  checkIntervalMinutes: Number(process.env.LIVE_LOOP_INTERVAL_MINUTES) || 15,
  // Режим: 'paper' (только логирует) или 'live' (реальные сделки)
  mode: process.env.LIVE_LOOP_MODE || 'paper',
  // Максимум сделок за цикл
  maxTradesPerCycle: 4,
  // Только кандидаты с PnL выше порога
  minPnlThreshold: 0,
  // Охрана live: кандидат в реальные деньги — только с доказанной бумажной историей
  liveMinForwardTrades: Number(process.env.LIVE_MIN_FORWARD_TRADES) || 10,
  liveMinForwardPF: Number(process.env.LIVE_MIN_FORWARD_PF) || 1.2
};

function loadReportState() {
  if (!fs.existsSync(REPORT_STATE_PATH)) return { lastDailyDate: null, lastLiveDailyDate: null };
  try {
    return JSON.parse(fs.readFileSync(REPORT_STATE_PATH, 'utf8'));
  } catch {
    return { lastDailyDate: null, lastLiveDailyDate: null };
  }
}

function saveReportState(state) {
  fs.writeFileSync(REPORT_STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

async function sendDailySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const state = loadReportState();
  if (state.lastDailyDate === today) return;
  state.lastDailyDate = today;
  saveReportState(state);

  const account = paperAccountStatus();
  if (!account) return;
  const daily = loadDailyPnl();
  const lines = [
    `📊 *TradeLab — дневная сводка (виртуальная торговля)*`,
    ``,
    `Дата: ${today}`,
    `Счёт: ${account.equity}$ (старт ${account.startingBalance}$)`,
    `Реализованный PnL: ${account.realizedPnl >= 0 ? '+' : ''}${account.realizedPnl}$`,
    `В позициях: ${account.locked}$`,
    `Открытых позиций: ${account.openPositions}`,
    `Всего закрыто: ${account.closedTradesTotal} (PnL закрытых: ${account.closedPnl >= 0 ? '+' : ''}${account.closedPnl}$)`,
    `Сегодня: ${daily.pnl >= 0 ? '+' : ''}${daily.pnl}$ за ${daily.trades} сдел.`,
    ``,
    `Проверка статуса: npm run tradelab:paper:status`
  ];
  await sendTelegram(lines.join('\n'));
}

// Ежедневная сводка по РЕАЛЬНОМУ счёту + статистика по причинам выхода
async function sendLiveDailySummary() {
  const today = new Date().toISOString().slice(0, 10);
  const state = loadReportState();
  if (state.lastLiveDailyDate === today) return;
  state.lastLiveDailyDate = today;
  saveReportState(state);

  const trades = loadTrades().filter((t) => t.status === 'closed');
  const daily = loadDailyPnl();
  const closedPnl = trades.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const wins = trades.filter((t) => (Number(t.pnl) || 0) > 0);
  const losses = trades.filter((t) => (Number(t.pnl) || 0) < 0);
  const winrate = trades.length > 0 ? ((wins.length / trades.length) * 100).toFixed(0) : '0';

  const byReason = {};
  for (const t of trades) {
    const r = t.exitReason || 'unknown';
    if (!byReason[r]) byReason[r] = { n: 0, pnl: 0, wins: 0 };
    byReason[r].n += 1;
    byReason[r].pnl += Number(t.pnl) || 0;
    if ((Number(t.pnl) || 0) > 0) byReason[r].wins += 1;
  }
  const reasons = Object.entries(byReason)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([r, v]) => `  ${r}: ${v.n} сделок, ${v.pnl >= 0 ? '+' : ''}${v.pnl.toFixed(2)}$, win ${v.wins}/${v.n}`)
    .join('\n');

  let balanceLine = 'Баланс: n/a';
  try {
    const acc = await require('./tradelab_live_executor').getAccountBalance();
    if (acc && !acc.paper) balanceLine = `Баланс: ${acc.total} USDT`;
  } catch { /* ignore */ }

  const open = loadTrades().filter((t) => t.status === 'open');
  const lines = [
    `💵 *TradeLab — дневная сводка (РЕАЛЬНЫЕ деньги)*`,
    ``,
    `Дата: ${today}`,
    balanceLine,
    `Открытых позиций: ${open.length}`,
    `Закрыто всего: ${trades.length} (${wins.length}W/${losses.length}L, WR ${winrate}%)`,
    `PnL всех закрытых: ${closedPnl >= 0 ? '+' : ''}${closedPnl.toFixed(2)}$`,
    `Сегодня: ${daily.pnl >= 0 ? '+' : ''}${daily.pnl}$ за ${daily.trades} сдел.`,
    ``,
    `По причинам выхода:`,
    reasons || '  — ещё нет закрытых'
  ];
  await sendTelegram(lines.join('\n'));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(path.join(__dirname, '..', 'logs', 'live-loop.log'), line + '\n');
  } catch { /* ignore */ }
}

// ============================================================
// Поиск лучших кандидатов для торговли
// ============================================================

function findBestCandidates() {
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const candidates = Object.values(state.candidates || {});
  
  // Фильтруем: только с положительным PnL и PF > 1.5
  const profitable = candidates.filter(c => 
    (c.forwardPaperPnl || 0) > CONFIG.minPnlThreshold &&
    (c.profitFactor || 0) > 1.5 &&
    (c.forwardPaperTrades || 0) >= 3
  );
  
  // Сортируем по PnL (лучшие сверху)
  profitable.sort((a, b) => (b.forwardPaperPnl || 0) - (a.forwardPaperPnl || 0));
  
  return profitable.slice(0, CONFIG.maxTradesPerCycle);
}

// ============================================================
// Один цикл: выходы из позиций + вход по gate
// ============================================================

async function runCycle(label) {
  log(`--- ${label} ---`);

  // 0. Управляем открытыми позициями (всегда, даже при активном kill-switch)
  try {
    const exits = await monitorOpenPositions();
    if (exits.results?.some((result) => result.action === 'error')) {
      log('⛔ Exit monitoring failed — new entries paused for this cycle');
      await notifySafetyState('exit-monitor-error', 'Не удалось проверить выходы из открытых позиций.');
      return { status: 'exit-monitor-error', exits };
    }
    if (exits.checked > 0) {
      log(`Exits: checked ${exits.checked}, closed ${exits.closed}`);
      for (const r of exits.results) {
        if (r.action === 'close') {
          log(`   Closed ${r.key} ${r.side} ${r.reason} @ ${r.exitPrice}, PnL ${r.pnl}`);
          const arrow = r.pnl >= 0 ? '📈' : '📉';
          // Метка обязана совпадать с режимом: иначе реал-закрытие выглядит бумагой.
          const modeTag = CONFIG.mode === 'paper' ? 'Paper' : 'LIVE (реал)';
          await sendTelegram(
            `${arrow} *${modeTag} закрыта позиция*\n` +
            `${r.key}\n` +
            `Сторона: ${r.side} | Выход: ${r.reason}\n` +
            `Цена: ${r.exitPrice}\n` +
            `PnL: ${r.pnl >= 0 ? '+' : ''}${r.pnl}$`
          );
        }
      }
    }
  } catch (error) {
    log(`❌ Exit check error: ${error.message}`);
    await notifySafetyState('exit-monitor-error', 'Ошибка мониторинга открытых позиций.');
    return { status: 'exit-monitor-error', error: error.message };
  }

  if (CONFIG.mode === 'live') {
    try {
      const positions = await verifyExchangePositions();
      if (!positions.ok) {
        log(`⛔ Exchange/local position mismatch: ${JSON.stringify(positions)}`);
        await notifySafetyState('position-mismatch', 'Позиции OKX не совпадают с журналом бота; требуется проверка.');
        return { status: 'position-mismatch', positions };
      }
    } catch (error) {
      log(`⛔ Position verification failed: ${error.message}`);
      await notifySafetyState('position-check-error', 'Не удалось получить позиции OKX.');
      return { status: 'position-check-error', error: error.message };
    }
    await clearSafetyState();
  }

  // Paper mode: торгуем виртуальными деньгами без gate.
  // Открываем позиции по сигналам всех кандидатов, ведём виртуальный баланс,
  // чтобы понять, работает ли система в плюс.
  if (CONFIG.mode === 'paper') {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const candidates = Object.values(state.candidates || {});
    const openTrades = loadTrades().filter((t) => t.status === 'open');
    const openSymbols = new Set(openTrades.map((t) => t.symbol));

    const queue = candidates
      .filter((c) => c && c.key && !openSymbols.has(c.symbol))
      .sort((a, b) => (b.forwardPaperPnl || 0) - (a.forwardPaperPnl || 0))
      .slice(0, CONFIG.maxTradesPerCycle);

    log(`Paper: checking ${queue.length} candidate(s) for signals`);
    const executed = [];
    for (const candidate of queue) {
      try {
        const result = await executeTrade(candidate.key);
        if (result.success) {
          log(`   ✅ PAPER OPEN ${candidate.key} ${result.trade.side} @ ${result.trade.entryPrice}, size ${result.trade.size}`);
          executed.push({ key: candidate.key, status: 'opened', side: result.trade.side, entry: result.trade.entryPrice });
          const emoji = result.trade.side === 'LONG' ? '🟢' : '🔴';
          await sendTelegram(
            `${emoji} *Paper открыта позиция*\n` +
            `${result.trade.key}\n` +
            `Сторона: ${result.trade.side}\n` +
            `Цена: ${result.trade.entryPrice}\n` +
            `Стоп: ${result.trade.stopPrice} | Тейк: ${result.trade.takePrice}\n` +
            `Размер: ${result.trade.size}`
          );
        } else if (result.reason && result.reason !== 'No signal (WAIT)') {
          log(`   ⏭ ${candidate.key}: ${result.reason}`);
        }
      } catch (error) {
        log(`   ❌ ${candidate.key}: ${error.message}`);
      }
      await sleep(2000);
    }

    const account = paperAccountStatus();
    if (account) {
      log(`Paper account: equity ${account.equity}$ (start ${account.startingBalance}$), realized PnL ${account.realizedPnl}$, open ${account.openPositions}, closed ${account.closedTradesTotal}`);
    }
    await sendDailySummary();
    return { status: 'paper', executed, account };
  }

  // 1. Проверяем kill-switch
  try {
    const killSwitch = portfolioKillSwitch();
    if (killSwitch.blocksRealMoney) {
      log(`⛔ Kill-switch active: ${killSwitch.soft.reasons.join('; ')}`);
      return { status: 'kill-switch' };
    }
  } catch (error) {
    log(`❌ Kill-switch check error: ${error.message}`);
    return { status: 'error', error: error.message };
  }

  // 2. Проверяем gate
  let gate;
  try {
    gate = evaluateGate();
  } catch (error) {
    log(`❌ Gate check error: ${error.message}`);
    return { status: 'error', error: error.message };
  }
  log(`Gate: ${gate.gate} (${gate.allowed?.length || 0} allowed)`);
  if (gate.gate !== 'MANUAL_REVIEW_ALLOWED') {
    log(`   Gate BLOCKED: ${gate.nextAction} — входов нет, только мониторинг выходов`);
  }

  // 3. Кандидаты — из gate.allowed (живая оценка evaluateGate, а не decision в state-файле:
  //    gate не сохраняет decision в state, поэтому фильтр по state.decision мёртв).
  // 🔒 ВАЖНО (ара доп.): реальные деньги входят только после MANUAL manual-review-allowed.
  //    Больше никаких авто-входов реальными деньгами по одним forward-метрикам.
  const liveCandidates = (() => {
    const allowedKeys = new Set((gate.allowed || []).map((a) => a && a.key).filter(Boolean));
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const candidates = Object.values(state.candidates || {});
    const openTrades = loadTrades().filter((t) => t.status === 'open');
    const openSymbols = new Set(openTrades.map((t) => t.symbol));
    return candidates
      .filter((c) => c && c.key && !openSymbols.has(c.symbol) && allowedKeys.has(c.key))
      .sort((a, b) => (b.forwardPaperPnl || 0) - (a.forwardPaperPnl || 0))
      .slice(0, CONFIG.maxTradesPerCycle);
  })();

  if (liveCandidates.length === 0) {
    log(`   No live candidates (нет прибыльных и ПРОВЕРЕННЫХ в paper)`);
    return { status: 'no-candidates' };
  }

  log(`   ✅ Live candidates (проверенные в paper, реал):`);
  liveCandidates.forEach(c => {
    const fp = Number.isFinite(c.forwardProfitFactor) ? c.forwardProfitFactor.toFixed(2) : 'n/a';
    log(`      ${c.key}: PnL +${(c.forwardPaperPnl || 0).toFixed(2)}$, f-PF ${fp}, f-trades ${c.forwardPaperTrades || 0}`);
  });

  // 4. Ручной мост: кандидат manual-review-allowed шлётся в Telegram с кнопками,
  //    реальный вход выполняется ТОЛЬКО после одобрения (approved в approvals.json).
  const { createApprovalRequest, getApprovedCandidates, markExecuted } = require('./tradelab_manual_bridge');

  // 4a. Отправляем кнопки тем, кого ещё не одобрили/не отклонили
  for (const candidate of liveCandidates) {
    try {
      const req = await createApprovalRequest(candidate);
      if (req.action === 'send-failed' || (req.action === 'sent' && !req.sent)) {
        log(`      ⚠️ Telegram-отправка кнопки не удалась (${candidate.key}) — повтор в следующем цикле`);
      } else if (req.action === 'sent') {
        log(`      🔘 Отправлен на подтверждение: ${candidate.key}`);
      } else if (req.action === 'already-approved') {
        log(`      ✅ Уже одобрен: ${candidate.key}`);
      } else if (req.action === 'already-declined') {
        log(`      ⛔ Уже отклонён: ${candidate.key}`);
      } else if (req.action === 'cooldown') {
        log(`      🧊 Кулдаун после убыточного реала: ${candidate.key} (новая кнопка позже)`);
      } else if (req.action === 'executed-wait') {
        log(`      ⏳ Уже отработал реал: ${candidate.key} (новая кнопка после перевооружения)`);
      }
    } catch (error) {
      log(`      ❌ Approval request error for ${candidate.key}: ${error.message}`);
    }
    await sleep(1500);
  }

  // 4b. Исполняем только одобренные кандидаты.
  // Сначала самочистка: фантомы и rejected удаляются, слоты не тратятся зря.
  const { pruneStaleApprovals } = require('./tradelab_manual_bridge');
  try {
    const dropped = await pruneStaleApprovals();
    if (dropped > 0) log(`   🧹 Убрано протухших approve: ${dropped}`);
  } catch (error) {
    log(`   ⚠️ Prune error: ${error.message}`);
  }
  const liveKeys = new Set(liveCandidates.map((c) => c.key));
  const approved = (await getApprovedCandidates()).filter((record) => liveKeys.has(record.key));
  if (approved.length === 0) {
    log(`   No approved candidates yet (ожидаем ваше решение в Telegram)`);
    return { status: 'awaiting-approval' };
  }

  const executed = [];
  // Лимит на цикл: не больше maxTradesPerCycle, чтобы пачка накопленных
  // approve не выстрелила залпом при открытии гейта. Остаток — в следующих циклах.
  // Приоритет — живым кандидатам из гейта: иначе протухшие approve (по мёртвым
  // ключам, их отбивает gate внутри executeTrade) съедают все слоты и актуальный
  // кандидат не вызывается никогда.
  const ordered = [...approved].sort((a, b) => {
    const al = liveKeys.has(a.key) ? 0 : 1;
    const bl = liveKeys.has(b.key) ? 0 : 1;
    return al - bl;
  });
  const toExecute = ordered.slice(0, CONFIG.maxTradesPerCycle);
  if (approved.length > toExecute.length) {
    log(`   ⏳ Approved ${approved.length}, беру в этот цикл ${toExecute.length} (остальные — дальше)`);
  }
  for (const record of toExecute) {
    const candidateKey = record.key;
    log(`   🚀 LIVE Executing approved candidate: ${candidateKey}`);
    try {
      const result = await executeTrade(candidateKey);
      if (result.success) {
        log(`      ✅ LIVE Trade executed! ${candidateKey} ${result.trade.side} @ ${result.trade.entryPrice}, size ${result.trade.size}, value ${(result.trade.valueUsd||0).toFixed(2)}$`);
        executed.push({ key: candidateKey, status: 'executed', entry: result.trade.entryPrice, side: result.trade.side });
        const emoji = result.trade.side === 'LONG' ? '🟢' : '🔴';
        await sendTelegram(
          `💰 *LIVE открыта позиция (реал)*\n` +
          `${result.trade.key}\n` +
          `Сторона: ${result.trade.side} | Цена: ${result.trade.entryPrice}\n` +
          `Стоп: ${result.trade.stopPrice} | Тейк: ${result.trade.takePrice}\n` +
          `Размер: ${result.trade.size} | ~${(result.trade.valueUsd||0).toFixed(2)}$\n` +
          `Комиссия/сеть: учтены (fee ${result.trade.params?.feePct || 0.06}% + slippage)`
        );
        await markExecuted(candidateKey);
      } else {
        log(`      ❌ LIVE Trade failed: ${result.reason}`);
        executed.push({ key: candidateKey, status: 'failed', reason: result.reason });
      }
    } catch (error) {
      log(`      ❌ LIVE Error: ${error.message}`);
      executed.push({ key: candidateKey, status: 'error', reason: error.message });
    }
    await sleep(5000);
  }

  // Мониторинг закрытий уже сделал exits выше — отчёт о реале
  const liveAccount = await (async () => {
    try { const acc = await require('./tradelab_live_executor').getAccountBalance(); return acc; } catch { return null; }
  })();
  if (liveAccount && !liveAccount.paper) {
    log(`Live account: total ${liveAccount.total} USDT, free ${liveAccount.free} USDT`);
  }

  // Ежедневная сводка по реальному счёту (раз в сутки) + статистика по exitReason
  await sendLiveDailySummary();

  return { status: 'ok', executed, mode: 'live' };
}

// ============================================================
// Основной цикл
// ============================================================

async function liveLoop() {
  log('========================================');
  log(`TradeLab Live Loop STARTED`);
  log(`Mode: ${CONFIG.mode}`);
  log(`Check interval: ${CONFIG.checkIntervalMinutes} min`);
  log('========================================\n');

  if (CONFIG.mode === 'paper') {
    const account = paperAccountStatus();
    if (account) {
      const openTrades = loadTrades().filter((t) => t.status === 'open');
      let lines = [
        `🤖 *TradeLab paper-торговля запущена*`,
        `Счёт: ${account.startingBalance}$ | Баланс: ${account.equity}$`,
        `Проверка каждые ${CONFIG.checkIntervalMinutes} мин`,
        `Отчёты: при открытии/закрытии позиций и раз в день`
      ];
      if (openTrades.length > 0) {
        lines.push('', `Открытых позиций: ${openTrades.length}`);
        for (const t of openTrades) {
          const arrow = t.side === 'LONG' ? '🟢' : '🔴';
          lines.push(`${arrow} ${t.symbol} ${t.side} @ ${t.entryPrice}`);
        }
      }
      await sendTelegram(lines.join('\n'));
    }
  }

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    try {
      await runCycle(`Cycle #${cycleCount}`);
    } catch (error) {
      log(`❌ Cycle error: ${error.message}`);
    }
    log(`   Waiting ${CONFIG.checkIntervalMinutes} min...\n`);
    await sleep(CONFIG.checkIntervalMinutes * 60 * 1000);
  }
}

// ============================================================
// CLI entry point
// ============================================================

async function main() {
  const mode = process.argv[2] || CONFIG.mode;

  if (mode === '--status') {
    const account = paperAccountStatus();
    const trades = loadTrades();
    const open = trades.filter((t) => t.status === 'open');
    const recentClosed = trades.filter((t) => t.status === 'closed').slice(-15);
    console.log(JSON.stringify({ account, openPositions: open, recentClosed }, null, 2));
    return;
  }

  if (mode === '--cycle') {
    const result = await runCycle('Live cycle (one shot)');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  if (mode === 'live' || mode === 'paper') {
    CONFIG.mode = mode;
  }
  
  if (mode === '--once') {
    // Один цикл для проверки
    CONFIG.mode = 'paper';
    const best = findBestCandidates();
    console.log(JSON.stringify({ best, gate: evaluateGate().gate, killSwitch: portfolioKillSwitch() }, null, 2));
    return;
  }

  await liveLoop();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { liveLoop, findBestCandidates };

