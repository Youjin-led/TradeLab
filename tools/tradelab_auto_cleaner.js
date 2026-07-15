// ============================================================
// TradeLab — Auto Cleaner
// ============================================================
// Запускается каждый цикл. Делает две вещи:
// 1. Удаляет безнадёжных кандидатов (плохие навсегда)
// 2. Разблокирует сильных кандидатов (хорошие несмотря на карантин)
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');

// Пороги для авто-удаления безнадёжных
const REMOVE_THRESHOLDS = {
  // Плохой PF И много сделок (не случайность) И PnL в минусе
  minProfitFactor: 1.1,     // PF < 1.1 → подозрительно
  minTradesForPF: 5,        // + минимум 5 сделок чтобы судить по PF
  maxLossStreak: 7,         // loss streak > 7 → удалить
  minForwardPnl: -400,      // PnL < -400$ → удалить (только при достаточном числе сделок)
  minTradesForPnl: 5,       // Минимум сделок для удаления по PnL
};

// Пороги для авто-разблокировки сильных
const UNQUARANTINE_THRESHOLDS = {
  minForwardPnl: 50,        // PnL > +50$ → разблокировать
  minProfitFactor: 1.3,     // PF >= 1.3
  maxDrawdownPct: 12,       // DD <= 12% (крипта волатильна)
  maxLossStreak: 5,         // loss streak <= 5
  minTrades: 2,             // Хотя бы 2 сделки
};

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { candidates: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

async function autoClean() {
  const state = readState();
  const candidates = state.candidates || {};
  const keys = Object.keys(candidates);
  
  const removed = [];
  const unquarantined = [];
  const kept = [];

  for (const key of keys) {
    const c = candidates[key];
    if (!c) continue;

    const pnl = c.forwardPaperPnl || 0;
    const pf = c.profitFactor || 0;
    const dd = c.maxDrawdownPct || 0;
    const lossStreak = c.maxLossStreak || 0;
    const trades = c.forwardPaperTrades || 0;
    const status = c.status || 'unknown';
    const strategy = c.strategy || 'unknown';
    const health = c.health?.status || 'unknown';

    // === 1. УДАЛЕНИЕ безнадёжных ===
    // Удаляем только если кандидат явно мёртв:
    // - Mean-reversion (забанены навсегда)
    // - PF < 1.1 при 5+ сделках И PnL в минусе
    // - Loss streak >= 7
    // - PnL < -400$ при 5+ сделках
    const shouldRemove = (
      strategy === 'mean-reversion' ||
      (trades >= REMOVE_THRESHOLDS.minTradesForPF && pf < REMOVE_THRESHOLDS.minProfitFactor && pnl < 0) ||
      lossStreak >= REMOVE_THRESHOLDS.maxLossStreak ||
      (trades >= REMOVE_THRESHOLDS.minTradesForPnl && pnl <= REMOVE_THRESHOLDS.minForwardPnl)
    );

    if (shouldRemove) {
      removed.push({ key, pnl, pf, dd, trades, lossStreak, status, reason: 'auto-removed: poor performance' });
      delete candidates[key];
      continue;
    }

    // === 2. РАЗБЛОКИРОВКА сильных ===
    // Если кандидат в карантине, но показывает хорошие результаты — разблокируем
    if (status === 'quarantined') {
      const shouldUnquarantine = (
        pnl >= UNQUARANTINE_THRESHOLDS.minForwardPnl &&
        pf >= UNQUARANTINE_THRESHOLDS.minProfitFactor &&
        dd <= UNQUARANTINE_THRESHOLDS.maxDrawdownPct &&
        lossStreak <= UNQUARANTINE_THRESHOLDS.maxLossStreak &&
        trades >= UNQUARANTINE_THRESHOLDS.minTrades
      );

      if (shouldUnquarantine) {
        c.status = 'incubating';
        c.decision = 'incubate';
        c.previousStatus = 'quarantined';
        c.quarantine = {
          active: false,
          reason: 'auto-unquarantined: strong performance',
          unquarantinedAt: new Date().toISOString()
        };
        c.updatedAt = new Date().toISOString();
        unquarantined.push({ key, pnl, pf, dd, trades, lossStreak });
      }
    }

    kept.push(key);
  }

  // Обновляем summary
  const allRows = Object.values(candidates);
  state.summary = {
    ...state.summary,
    updatedAt: new Date().toISOString(),
    total: allRows.length,
    incubating: allRows.filter(r => r.status === 'incubating').length,
    quarantined: allRows.filter(r => r.status === 'quarantined').length,
    rejected: allRows.filter(r => r.status === 'rejected').length,
    readyForReview: allRows.filter(r => r.status === 'ready-for-review').length,
    autoCleaned: {
      removed: removed.length,
      unquarantined: unquarantined.length
    }
  };

  writeState(state);

  // Логируем
  console.log('=== AUTO CLEANER ===');
  console.log(`Проверено: ${keys.length}`);
  console.log(`Удалено безнадёжных: ${removed.length}`);
  for (const r of removed) {
    console.log(`  🗑️ ${r.key} | PnL: ${r.pnl} | PF: ${r.pf} | DD: ${r.dd}% | Сделок: ${r.trades}`);
  }
  console.log(`Разблокировано сильных: ${unquarantined.length}`);
  for (const r of unquarantined) {
    console.log(`  🟢 ${r.key} | PnL: ${r.pnl} | PF: ${r.pf} | DD: ${r.dd}%`);
  }
  console.log(`Осталось: ${kept.length}`);
  console.log('========================\n');

  return { removed, unquarantined, kept: kept.length };
}

async function main() {
  await autoClean();
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { autoClean };
