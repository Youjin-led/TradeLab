require('dotenv').config();
const ccxt = require('ccxt');

async function main() {
  const ex = new ccxt.okx({
    apiKey: process.env.OKX_API_KEY,
    secret: process.env.OKX_SECRET_KEY,
    password: process.env.OKX_PASSPHRASE,
  });

  try {
    // 1. Баланс (trading account)
    console.log('=== Trading Account ===');
    const balance = await ex.fetchBalance();
    const nonZero = Object.entries(balance.total || {})
      .filter(([k, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v} (free: ${balance.free?.[k] || 0})`);
    
    if (nonZero.length > 0) {
      nonZero.forEach(l => console.log(`  ${l}`));
    } else {
      console.log('  Empty');
    }

    // 2. Funding account
    console.log('\n=== Funding Account ===');
    try {
      const funding = await ex.privateGetAssetBalances();
      const data = Array.isArray(funding) ? funding : (funding.data || []);
      const nonZero = data.filter(a => parseFloat(a.bal) > 0);
      if (nonZero.length > 0) {
        nonZero.forEach(a => console.log(`  ${a.ccy}: ${a.bal} (avail: ${a.availBal})`));
      } else {
        console.log('  Empty');
      }
    } catch (e) {
      console.log('  Error:', e.message);
    }

    // 3. Все счета
    console.log('\n=== Account Config ===');
    try {
      const config = await ex.privateGetAccountConfig();
      console.log(`  acctLv: ${config.acctLv}`);
      console.log(`  posMode: ${config.posMode}`);
      console.log(`  autoLoan: ${config.autoLoan}`);
    } catch (e) {
      console.log('  Error:', e.message);
    }

  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) console.error('Response:', JSON.stringify(e.response.data || e.response).slice(0, 500));
  }
}

main();
