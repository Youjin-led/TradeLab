require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const ccxt = require('ccxt');

const exchange = new ccxt.okx({
  apiKey: process.env.OKX_API_KEY,
  secret: process.env.OKX_SECRET_KEY,
  password: process.env.OKX_PASSPHRASE,
});

exchange.fetchBalance()
  .then(balance => {
    console.log('✅ OKX Connected!');
    console.log('Total (USD):', balance.total?.USD || 'N/A');
    console.log('Free (USDT):', balance.free?.USDT || balance.free?.USDC || 'N/A');
  })
  .catch(err => {
    console.log('❌ OKX Error:', err.message || err);
  })
  .finally(() => process.exit(0));
