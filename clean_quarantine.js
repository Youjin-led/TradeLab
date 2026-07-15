const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, 'tradelab-incubation-state.json');
const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

const candidates = state.candidates || {};
const keys = Object.keys(candidates);

const toDelete = [];
const kept = [];

for (const key of keys) {
  const c = candidates[key];
  const isMeanRev = c.strategy === 'mean-reversion';
  const isDeadSmaRsi = c.strategy === 'sma-rsi' && (c.profitFactor || 0) < 1.0 && (c.maxDrawdownPct || 0) > 8;
  
  if (isMeanRev || isDeadSmaRsi) {
    toDelete.push({ key, strategy: c.strategy, pnl: c.forwardPaperPnl, pf: c.profitFactor, dd: c.maxDrawdownPct });
    delete candidates[key];
  } else {
    kept.push({ key, strategy: c.strategy, pnl: c.forwardPaperPnl, pf: c.profitFactor, dd: c.maxDrawdownPct });
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
  nextAction: 'quarantine cleaned - mean-reversion and dead sma-rsi removed'
};

fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));

console.log('=== УДАЛЕНО ===');
toDelete.forEach(d => console.log(d.key, '| PnL:', d.pnl, '| PF:', d.pf, '| DD:', d.dd));
console.log('');
console.log('=== ОСТАЛОСЬ ===');
kept.forEach(d => console.log(d.key, '| PnL:', d.pnl, '| PF:', d.pf, '| DD:', d.dd));
console.log('');
console.log('Удалено:', toDelete.length);
console.log('Осталось:', kept.length);
console.log('Новый total:', state.summary.total);
console.log('Новый quarantined:', state.summary.quarantined);
