// Test OKX connection
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const okx = require('okx');
const RestClient = okx.default?.RestClient || okx.RestClient;

const client = new RestClient({
  apiKey: process.env.OKX_API_KEY,
  apiSecret: process.env.OKX_SECRET_KEY,
  apiPass: process.env.OKX_PASSPHRASE,
});

client.getAccountBalance()
  .then(res => {
    console.log('✅ OKX Connected!');
    const data = res.data?.[0];
    if (data) {
      console.log('Account:', data.totalEq || 'N/A');
    } else {
      console.log('Response:', JSON.stringify(res).slice(0, 200));
    }
  })
  .catch(err => {
    console.log('❌ OKX Error:', err.message || err);
    if (err.response) console.log('Details:', err.response.data);
  })
  .finally(() => process.exit(0));
