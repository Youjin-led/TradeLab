require('dotenv').config();
const ccxt = require('ccxt');

async function main() {
  const ex = new ccxt.okx({
    apiKey: process.env.OKX_API_KEY,
    secret: process.env.OKX_SECRET_KEY,
    password: process.env.OKX_PASSPHRASE,
  });

  try {
    const balance = await ex.fetchBalance();
    const free = balance.free?.USDT || 0;
    const total = balance.total?.USDT || 0;
    const used = total - free;

    console.log('=== OKX Balance ===');
    console.log(`Free USDT:  ${free.toFixed(2)}$`);
    console.log(`Used USDT:  ${used.toFixed(2)}$`);
    console.log(`Total USDT: ${total.toFixed(2)}$`);
    console.log('');

    // Проверяем открытые позиции
    const positions = await ex.fetchPositions();
    const openPositions = positions.filter(p => parseFloat(p.contracts) > 0);
    if (openPositions.length > 0) {
      console.log('=== Open Positions ===');
      openPositions.forEach(p => {
        console.log(`${p.symbol}: ${p.side} ${p.contracts} contracts, PnL: ${parseFloat(p.unrealizedPnl).toFixed(2)}$`);
      });
    } else {
      console.log('No open positions.');
    }

  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) console.error('Response:', e.response.data);
  }
}

main();
