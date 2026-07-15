const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, 'tradelab-incubation-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const candidates = state.candidates || {};

const toDelete = [
  'SOLUSDT:4h:breakout',
  'JUPUSDT:4h:breakout',
  'ARBUSDT:4h:breakout',
  'BCHUSDT:1h:breakout',
  'NEARUSDT:1d:sma-rsi',
  'TIAUSDT:4h:sma-rsi',
  'LTCUSDT:4h:breakout',
  'AVAXUSDT:4h:breakout',
  'SOLUSDT:1h:breakout'
];

const toUnblock = [
  'BCHUSDT:1h:sma-rsi'
];

const toProbation = [
  'TRXUSDT:4h:sma-rsi',
  'LINKUSDT:4h:sma-rsi',
  'SUIUSDT:4h:breakout'
];

console.log('=== ВЫПОЛНЕНИЕ ОЧИСТКИ ===\n');

// 1. Удаляем мёртвых
console.log('🗑️ Удаление кандидатов:');
toDelete.forEach(key => {
  if (candidates[key]) {
    console.log(`   🗑️ ${key} (PnL: ${(candidates[key].forwardPaperPnl || 0).toFixed(2)}$)`);
    delete candidates[key];
  } else {
    console.log(`   ⚠️ ${key} — не найден`);
  }
});

// 2. Разблокируем BCH
console.log('\n🟢 Разблокировка:');
toUnblock.forEach(key => {
  if (candidates[key]) {
    const c = candidates[key];
    c.status = 'probation';
    c.health = { status: 'Healthy', reason: 'Unblocked manually — strong PF and positive PnL' };
    console.log(`   🟢 ${key} → probation (PnL: +${(c.forwardPaperPnl || 0).toFixed(2)}$, PF: ${(c.profitFactor || 0).toFixed(2)})`);
  } else {
    console.log(`   ⚠️ ${key} — не найден`);
  }
});

// 3. Переводим на probation
console.log('\n🟡 Перевод на probation:');
toProbation.forEach(key => {
  if (candidates[key]) {
    const c = candidates[key];
    c.status = 'probation';
    c.health = { status: 'Caution', reason: 'Moved to probation — PF > 1.5 but negative PnL' };
    console.log(`   🟡 ${key} → probation (PnL: ${(c.forwardPaperPnl || 0).toFixed(2)}$, PF: ${(c.profitFactor || 0).toFixed(2)})`);
  } else {
    console.log(`   ⚠️ ${key} — не найден`);
  }
});

// Сохраняем
state.updatedAt = new Date().toISOString();
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
console.log('\n✅ State сохранён!');

// Итог
const remaining = Object.values(candidates);
const totalPnl = remaining.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
const totalTrades = remaining.reduce((s, c) => s + (c.forwardPaperTrades || 0), 0);
console.log(`\n=== ИТОГ ===`);
console.log(`Осталось кандидатов: ${remaining.length}`);
console.log(`Forward PnL: ${totalPnl.toFixed(2)}$`);
console.log(`Forward trades: ${totalTrades}`);
console.log(`Gate: ${totalPnl > -500 ? 'OPEN ✅' : 'BLOCKED 🔴'} (нужно > -500$)`);
