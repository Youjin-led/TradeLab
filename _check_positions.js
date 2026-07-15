const fs = require('fs');
const s = JSON.parse(fs.readFileSync('tradelab-incubation-state.json','utf8'));

const keys = ['BCHUSDT:1h:sma-rsi', 'BCHUSDT:4h:sma-rsi'];
keys.forEach(key => {
  const c = s.candidates[key];
  if (!c) { console.log(`❌ ${key} not found\n`); return; }
  console.log(`=== ${key} ===`);
  console.log(`Status: ${c.status}`);
  console.log(`Signal: ${c.lastSignal}`);
  console.log(`Close: ${c.lastClose}`);
  console.log(`Balance: ${(c.paperLedger?.balance || 0).toFixed(2)}$`);
  console.log(`Peak: ${(c.paperLedger?.peak || 0).toFixed(2)}$`);
  console.log(`MaxDD: ${(c.paperLedger?.maxDd || 0).toFixed(2)}%`);
  console.log(`Position: ${JSON.stringify(c.paperLedger?.position || 'none', null, 2)}`);
  console.log(`PnL: ${(c.forwardPaperPnl || 0).toFixed(2)}$`);
  console.log(`PF: ${(c.profitFactor || 0).toFixed(2)}`);
  console.log(`Trades: ${c.closedPaperTrades || 0}`);
  console.log('');
});
