const r = require('./tools/tradelab_risk_controls');
const g = require('./tools/tradelab_real_money_gate');
const fs = require('fs');
const path = require('path');

const ks = r.portfolioKillSwitch();
const gate = g.evaluateGate();

const statePath = path.join(__dirname, 'tradelab-incubation-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const candidates = Object.values(state.candidates || {});

const incubating = candidates.filter(c => c.status === 'incubating');
const quarantined = candidates.filter(c => c.status === 'quarantined');
const rejected = candidates.filter(c => c.status === 'rejected');
const probation = candidates.filter(c => c.status === 'probation');

const forwardPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
const forwardTrades = candidates.reduce((s, c) => s + (c.forwardPaperTrades || 0), 0);

const top5 = [...candidates]
  .filter(c => (c.forwardPaperPnl || 0) > 0)
  .sort((a, b) => (b.forwardPaperPnl || 0) - (a.forwardPaperPnl || 0))
  .slice(0, 5);

const bottom5 = [...candidates]
  .filter(c => (c.forwardPaperPnl || 0) < 0)
  .sort((a, b) => (a.forwardPaperPnl || 0) - (b.forwardPaperPnl || 0))
  .slice(0, 5);

console.log('\n========================================');
console.log('   TRADELAB — СНАПШОТ');
console.log('========================================\n');

console.log(`📅 ${new Date().toISOString().slice(0, 16)}`);
console.log(`\n🚦 GATE: ${gate.gate}`);
console.log(`   Reason: ${gate.nextAction}`);
console.log(`   Kill-switch: ${ks.status} (${ks.active ? 'ACTIVE' : 'INACTIVE'})`);
console.log(`   Blocks real money: ${ks.blocksRealMoney}`);

console.log(`\n📊 ПОРТФЕЛЬ`);
console.log(`   Forward PnL: ${forwardPnl.toFixed(2)}$`);
console.log(`   Forward trades: ${forwardTrades}`);
console.log(`   Всего кандидатов: ${candidates.length}`);
console.log(`   В инкубации: ${incubating.length}`);
console.log(`   В карантине: ${quarantined.length}`);
console.log(`   Отклонено: ${rejected.length}`);
console.log(`   На probation: ${probation.length}`);

console.log(`\n🏆 ТОП-5 ПО FORWARD PnL`);
top5.forEach((c, i) => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${i+1}. ${key}: +${c.forwardPaperPnl.toFixed(2)}$ (PF: ${(c.profitFactor || 0).toFixed(2)}, статус: ${c.status})`);
});

console.log(`\n🔻 ХУДШИЕ-5 ПО FORWARD PnL`);
bottom5.forEach((c, i) => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${i+1}. ${key}: ${c.forwardPaperPnl.toFixed(2)}$ (PF: ${(c.profitFactor || 0).toFixed(2)}, статус: ${c.status})`);
});

console.log(`\n📋 КАНДИДАТЫ В ИНКУБАЦИИ`);
incubating.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: PnL ${(c.forwardPaperPnl || 0).toFixed(2)}$, trades ${c.forwardPaperTrades || 0}, PF ${(c.profitFactor || 0).toFixed(2)}, health ${(c.health || {}).status || '?'}`);
});

console.log(`\n📋 КАНДИДАТЫ НА PROBATION`);
probation.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: PnL ${(c.forwardPaperPnl || 0).toFixed(2)}$, trades ${c.forwardPaperTrades || 0}, PF ${(c.profitFactor || 0).toFixed(2)}`);
});

console.log(`\n📋 КАНДИДАТЫ В КАРАНТИНЕ (первые 5)`);
quarantined.slice(0, 5).forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: PnL ${(c.forwardPaperPnl || 0).toFixed(2)}$, trades ${c.forwardPaperTrades || 0}, PF ${(c.profitFactor || 0).toFixed(2)}`);
});

console.log(`\n📋 КАНДИДАТЫ ГОТОВЫЕ К РЕВЬЮ`);
const ready = candidates.filter(c => c.status === 'ready-for-review');
ready.forEach(c => {
  const key = `${c.symbol}:${c.interval}:${c.strategy}`;
  console.log(`   ${key}: PnL ${(c.forwardPaperPnl || 0).toFixed(2)}$, trades ${c.forwardPaperTrades || 0}, PF ${(c.profitFactor || 0).toFixed(2)}`);
});

console.log(`\n✅ ДО OPEN GATE: ${(forwardPnl + 500).toFixed(2)}$ (нужно > -500$)`);
console.log('========================================\n');
