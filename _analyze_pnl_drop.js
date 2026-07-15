const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, 'tradelab-incubation-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const candidates = Object.values(state.candidates || {});

console.log('=== АНАЛИЗ ПАДЕНИЯ PnL ===\n');

// 1. Смотрим кто больше всего просел
const sortedByPnl = [...candidates].sort((a, b) => (a.forwardPaperPnl || 0) - (b.forwardPaperPnl || 0));

console.log('🔻 Кандидаты с наибольшим отрицательным PnL:');
sortedByPnl.filter(c => (c.forwardPaperPnl || 0) < -100).forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: ${c.forwardPaperPnl.toFixed(2)}$ (PF: ${(c.profitFactor || 0).toFixed(2)}, trades: ${c.forwardPaperTrades || 0}, DD: ${((c.maxDrawdown || 0)*100).toFixed(1)}%)`);
});

// 2. Смотрим кто сливает больше всего (loss streak)
console.log('\n🔴 Кандидаты с длинной серией потерь:');
sortedByPnl.filter(c => (c.lossStreak || 0) >= 3).forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: loss streak ${c.lossStreak}, PnL: ${(c.forwardPaperPnl || 0).toFixed(2)}$, PF: ${(c.profitFactor || 0).toFixed(2)}`);
});

// 3. Смотрим кто в инкубации — их динамика
console.log('\n🟢 Кандидаты в инкубации:');
candidates.filter(c => c.status === 'incubating').forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: PnL ${(c.forwardPaperPnl || 0).toFixed(2)}$, trades ${c.forwardPaperTrades || 0}, PF ${(c.profitFactor || 0).toFixed(2)}, DD ${((c.maxDrawdown || 0)*100).toFixed(1)}%`);
});

// 4. Смотрим общую статистику по стратегиям
console.log('\n📊 Статистика по стратегиям:');
const byStrategy = {};
candidates.forEach(c => {
  const strat = c.strategy || 'unknown';
  if (!byStrategy[strat]) byStrategy[strat] = { pnl: 0, trades: 0, count: 0, wins: 0, losses: 0 };
  byStrategy[strat].pnl += c.forwardPaperPnl || 0;
  byStrategy[strat].trades += c.forwardPaperTrades || 0;
  byStrategy[strat].count++;
});
Object.entries(byStrategy).forEach(([strat, data]) => {
  console.log(`   ${strat}: PnL ${data.pnl.toFixed(2)}$, trades ${data.trades}, candidates ${data.count}`);
});

// 5. Смотрим общую статистику по таймфреймам
console.log('\n📊 Статистика по таймфреймам:');
const byTf = {};
candidates.forEach(c => {
  const tf = c.interval || 'unknown';
  if (!byTf[tf]) byTf[tf] = { pnl: 0, trades: 0, count: 0 };
  byTf[tf].pnl += c.forwardPaperPnl || 0;
  byTf[tf].trades += c.forwardPaperTrades || 0;
  byTf[tf].count++;
});
Object.entries(byTf).forEach(([tf, data]) => {
  console.log(`   ${tf}: PnL ${data.pnl.toFixed(2)}$, trades ${data.trades}, candidates ${data.count}`);
});

// 6. Смотрим кто удалился (если есть лог)
console.log('\n📋 Проверка: были ли удалены прибыльные кандидаты?');
const profitableRemoved = candidates.filter(c => (c.forwardPaperPnl || 0) > 0 && c.status === 'rejected');
profitableRemoved.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ❌ ${key}: был +${c.forwardPaperPnl.toFixed(2)}$ (PF: ${(c.profitFactor || 0).toFixed(2)}) — ОТКЛОНЁН`);
});

console.log('\n=== ИТОГО ===');
const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
const totalTrades = candidates.reduce((s, c) => s + (c.forwardPaperTrades || 0), 0);
console.log(`Forward PnL: ${totalPnl.toFixed(2)}$`);
console.log(`Forward trades: ${totalTrades}`);
console.log(`Всего кандидатов: ${candidates.length}`);
