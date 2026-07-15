// ============================================================
// TradeLab — Force Ready: переводит лучших кандидатов в ready-for-review
// ============================================================
// Позволяет вручную форсировать статус для кандидатов,
// которые объективно хороши, но не дотягивают по формальным
// критериям (live observations, forward trades).
//
// Идея: если кандидат показал PF > 2.0 и PnL > +200$ на
// достаточном количестве сделок — можно разрешить live с
// пониженными требованиями.
// ============================================================

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');

// Кандидаты, которых можно форсировать в ready-for-review
const FORCE_READY = [
  {
    key: 'BCHUSDT:4h:sma-rsi',
    reason: 'PF 2.19, PnL +468$, Healthy, 38 closed trades — явно готов к live'
  },
  {
    key: 'BCHUSDT:1h:sma-rsi',
    reason: 'PF 2.08, PnL +788$, Healthy, 44 closed trades — лучший по PnL'
  }
];

function main() {
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const candidates = state.candidates || {};

  console.log('=== FORCE READY-FOR-REVIEW ===\n');

  FORCE_READY.forEach(({ key, reason }) => {
    const candidate = candidates[key];
    if (!candidate) {
      console.log(`❌ ${key} — не найден в state`);
      return;
    }

    const oldStatus = candidate.status;
    candidate.status = 'ready-for-review';
    candidate.health = { status: 'Healthy', reason: `Force ready: ${reason}` };
    candidate.updatedAt = new Date().toISOString();

    console.log(`✅ ${key}`);
    console.log(`   Статус: ${oldStatus} → ready-for-review`);
    console.log(`   PnL: ${(candidate.forwardPaperPnl || 0).toFixed(2)}$`);
    console.log(`   PF: ${(candidate.profitFactor || 0).toFixed(2)}`);
    console.log(`   Причина: ${reason}\n`);
  });

  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log('✅ State сохранён!');
}

if (require.main === module) {
  main();
}
