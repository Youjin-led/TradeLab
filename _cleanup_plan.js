const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, 'tradelab-incubation-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const candidates = Object.values(state.candidates || {});

console.log('=== ПЛАН ОЧИСТКИ ПОРТФЕЛЯ ===\n');

// 1. Мёртвые кандидаты (0 trades, PF=0) — удалить
console.log('🗑️ 1. МЁРТВЫЕ (0 сделок, PF=0) — удалить:');
const dead = candidates.filter(c => (c.forwardPaperTrades || 0) === 0 && (c.profitFactor || 0) === 0);
dead.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   🗑️ ${key} | статус: ${c.status}`);
});
console.log(`   Всего: ${dead.length}`);

// 2. Кандидаты с PF < 1.0 и PnL < -200 — удалить
console.log('\n🗑️ 2. УБЫТОЧНЫЕ (PF < 1.0, PnL < -200) — удалить:');
const bad = candidates.filter(c => (c.profitFactor || 0) < 1.0 && (c.forwardPaperPnl || 0) < -200);
bad.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   🗑️ ${key} | PnL: ${(c.forwardPaperPnl || 0).toFixed(2)}$, PF: ${(c.profitFactor || 0).toFixed(2)}, trades: ${c.forwardPaperTrades || 0}`);
});
console.log(`   Всего: ${bad.length}`);

// 3. Сильные кандидаты в карантине — разблокировать
console.log('\n🟢 3. СИЛЬНЫЕ В КАРАНТИНЕ (PF > 1.5, PnL > 0) — разблокировать:');
const strong = candidates.filter(c => 
  c.status === 'quarantined' && 
  (c.profitFactor || 0) > 1.5 && 
  (c.forwardPaperPnl || 0) > 0
);
strong.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   🟢 ${key} | PnL: +${(c.forwardPaperPnl || 0).toFixed(2)}$, PF: ${(c.profitFactor || 0).toFixed(2)}, trades: ${c.forwardPaperTrades || 0}`);
});
console.log(`   Всего: ${strong.length}`);

// 4. Кандидаты с PF > 1.5 но PnL < 0 — на probation
console.log('\n🟡 4. ПОТЕНЦИАЛЬНЫЕ (PF > 1.5, PnL < 0) — на probation:');
const potential = candidates.filter(c => 
  (c.profitFactor || 0) > 1.5 && 
  (c.forwardPaperPnl || 0) < 0
);
potential.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   🟡 ${key} | PnL: ${(c.forwardPaperPnl || 0).toFixed(2)}$, PF: ${(c.profitFactor || 0).toFixed(2)}, trades: ${c.forwardPaperTrades || 0}`);
});
console.log(`   Всего: ${potential.length}`);

// 5. Итог
console.log('\n=== ИТОГ ===');
const totalDead = dead.length + bad.length;
const totalUnblock = strong.length;
const totalProbation = potential.length;
console.log(`🗑️ Удалить: ${totalDead}`);
console.log(`🟢 Разблокировать: ${totalUnblock}`);
console.log(`🟡 На probation: ${totalProbation}`);

const currentPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
const deadPnl = [...dead, ...bad].reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
const strongPnl = strong.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
console.log(`\n💰 Текущий PnL: ${currentPnl.toFixed(2)}$`);
console.log(`   Убыток от мёртвых: ${deadPnl.toFixed(2)}$`);
console.log(`   Прибыль от сильных в карантине: +${strongPnl.toFixed(2)}$`);
console.log(`   После очистки: ${(currentPnl - deadPnl).toFixed(2)}$`);
console.log(`   После разблокировки: ${(currentPnl - deadPnl + strongPnl).toFixed(2)}$`);
