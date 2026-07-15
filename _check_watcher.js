const fs = require('fs');
const path = require('path');

const statePath = path.join(__dirname, 'tradelab-incubation-state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

console.log('=== ПРОВЕРКА WATCHER ===\n');
console.log('updatedAt:', state.updatedAt);
console.log('summary:', JSON.stringify(state.summary, null, 2));

// Смотрим дату последнего обновления
const updated = new Date(state.updatedAt);
const now = new Date();
const hoursSinceUpdate = (now - updated) / 3600000;
console.log(`\nЧасов с последнего обновления: ${hoursSinceUpdate.toFixed(1)}ч`);

// Смотрим когда были последние forward сделки
const candidates = Object.values(state.candidates || {});
let lastTradeTime = null;
candidates.forEach(c => {
  if (c.forwardPaperTrades > 0 && c.updatedAt) {
    const t = new Date(c.updatedAt);
    if (!lastTradeTime || t > lastTradeTime) lastTradeTime = t;
  }
});
if (lastTradeTime) {
  const hoursSinceTrade = (now - lastTradeTime) / 3600000;
  console.log(`Последняя forward сделка: ${lastTradeTime.toISOString()} (${hoursSinceTrade.toFixed(1)}ч назад)`);
} else {
  console.log('Forward сделок не найдено');
}

// Проверяем watcher лог
const logPath = path.join(__dirname, 'tradelab-watch.log');
if (fs.existsSync(logPath)) {
  const log = fs.readFileSync(logPath, 'utf8');
  const lines = log.trim().split('\n').slice(-10);
  console.log('\nПоследние 10 строк watcher лога:');
  lines.forEach(l => console.log('  ' + l));
} else {
  console.log('\nФайл tradelab-watch.log НЕ НАЙДЕН');
}

// Проверяем запущен ли watcher процесс
console.log('\nПроверка: запущен ли watcher?');
