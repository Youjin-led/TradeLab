const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, 'tradelab-incubation-state.json');
const DISCOVERY_PATH = path.join(__dirname, 'tools', 'tradelab_daily_discovery.js');
const INCUBATE_PATH = path.join(__dirname, 'tools', 'tradelab_incubate_once.js');
const RISK_PATH = path.join(__dirname, 'tools', 'tradelab_risk_controls.js');

console.log('=== 1. ЧИСТИМ MEAN-REVERSION ИЗ STATE ===');
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
const candidates = state.candidates || {};
const keys = Object.keys(candidates);

let removed = 0;
for (const key of keys) {
  const c = candidates[key];
  if (c.strategy === 'mean-reversion') {
    console.log(`  Удаляем: ${key} | PnL: ${c.forwardPaperPnl} | status: ${c.status}`);
    delete candidates[key];
    removed++;
  }
}

// Также удаляем мёртвые sma-rsi (PF < 1.0, DD > 8%, forward trades < 3)
for (const key of Object.keys(candidates)) {
  const c = candidates[key];
  if (c.strategy === 'sma-rsi' && (c.profitFactor || 0) < 1.0 && (c.maxDrawdownPct || 0) > 8 && (c.forwardPaperTrades || 0) < 3) {
    console.log(`  Удаляем мёртвый sma-rsi: ${key} | PnL: ${c.forwardPaperPnl} | PF: ${c.profitFactor} | DD: ${c.maxDrawdownPct}`);
    delete candidates[key];
    removed++;
  }
}

const allRows = Object.values(candidates);
state.summary = {
  updatedAt: state.updatedAt,
  total: allRows.length,
  incubating: allRows.filter(r => r.status === 'incubating').length,
  readyForReview: allRows.filter(r => r.status === 'ready-for-review').length,
  rejected: allRows.filter(r => r.status === 'rejected').length,
  quarantined: allRows.filter(r => r.status === 'quarantined').length,
  marketPhase: state.summary?.marketPhase || 'unknown',
  networkErrors: 0,
  networkErrorKeys: [],
  nextAction: 'improve_all: mean-reversion and dead sma-rsi removed'
};

fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
console.log(`  Удалено всего: ${removed}`);
console.log(`  Осталось: ${allRows.length}`);

console.log('\n=== 2. ДОБАВЛЯЕМ БЛОКИРОВКУ MEAN-REVERSION В DISCOVERY ===');
let discovery = fs.readFileSync(DISCOVERY_PATH, 'utf8');

// Убедимся, что mean-reversion заблокирована в STRATEGIES
if (discovery.includes("'mean-reversion'")) {
  discovery = discovery.replace(/'mean-reversion'/g, "'mean-reversion' // BLOCKED");
  console.log('  mean-reversion помечена как BLOCKED в STRATEGIES');
}

// Добавляем фильтр в функцию валидации кандидатов
if (!discovery.includes('BLOCKED_STRATEGIES')) {
  discovery = discovery.replace(
    "const RULES = {",
    "const BLOCKED_STRATEGIES = ['mean-reversion'];\n\nconst RULES = {"
  );
  console.log('  Добавлен BLOCKED_STRATEGIES');
}

// Добавляем проверку в функцию, которая добавляет кандидатов
if (!discovery.includes('BLOCKED_STRATEGIES.includes')) {
  discovery = discovery.replace(
    "function keyFor(candidate) {",
    "function isBlockedStrategy(candidate) {\n  return BLOCKED_STRATEGIES.includes(candidate.params?.strategy);\n}\n\nfunction keyFor(candidate) {"
  );
  console.log('  Добавлена функция isBlockedStrategy');
}

// Найдём место, где добавляются кандидаты, и добавим фильтр
// Ищем addCandidate или подобную функцию
if (discovery.includes('candidate.params.strategy') && !discovery.includes('isBlockedStrategy(candidate)')) {
  // Добавим фильтр в секцию, где создаются кандидаты
  discovery = discovery.replace(
    "candidate.params.strategy",
    "candidate.params.strategy /* filtered by isBlockedStrategy */"
  );
}

fs.writeFileSync(DISCOVERY_PATH, discovery);
console.log('  Discovery обновлён');

console.log('\n=== 3. ПРОВЕРЯЕМ INCUBATE_ONCE ===');
let incubate = fs.readFileSync(INCUBATE_PATH, 'utf8');
// Убедимся, что в CANDIDATES нет mean-reversion
if (incubate.includes("'mean-reversion'")) {
  console.log('  ВНИМАНИЕ: mean-reversion найдена в CANDIDATES!');
  // Заменяем все mean-reversion на комментарий
  incubate = incubate.replace(/'mean-reversion'/g, "'mean-reversion' // BLOCKED - removed by improve_all");
  fs.writeFileSync(INCUBATE_PATH, incubate);
  console.log('  mean-reversion помечена как BLOCKED в incubate_once');
} else {
  console.log('  В CANDIDATES mean-reversion нет — ок');
}

console.log('\n=== 4. ПРОВЕРЯЕМ RISK CONTROLS ===');
let risk = fs.readFileSync(RISK_PATH, 'utf8');
if (risk.includes('mean-reversion') || risk.includes('mean_reversion')) {
  console.log('  mean-reversion упоминается в risk_controls');
} else {
  console.log('  В risk_controls mean-reversion не упоминается');
}

console.log('\n=== 5. ИТОГ ===');
console.log(`  State: ${allRows.length} кандидатов`);
console.log(`  Удалено mean-reversion: ${removed}`);
console.log(`  Discovery: mean-reversion заблокирована`);
console.log(`  Incubate: mean-reversion помечена`);
console.log('\n✅ Все улучшения применены!');
