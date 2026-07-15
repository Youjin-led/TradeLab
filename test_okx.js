// Quick OKX connection test
require('dotenv').config();
console.log('API Key:', process.env.OKX_API_KEY ? '✅ found' : '❌ missing');
console.log('Secret Key:', process.env.OKX_SECRET_KEY ? '✅ found' : '❌ missing');
console.log('Passphrase:', process.env.OKX_PASSPHRASE ? '✅ found' : '❌ missing');

const { RestClient } = require('okx');
const client = new RestClient({
  apiKey: process.env.OKX_API_KEY,
  apiSecret: process.env.OKX_SECRET_KEY,
  apiPass: process.env.OKX_PASSPHRASE,
});

client.getAccountBalance().then(res => {
  console.log('✅ OKX Connected!');
  console.log('Balance:', JSON.stringify(res.data?.[0]?.totalEq || 'check response'));
}).catch(err => {
  console.log('❌ OKX Error:', err.message || err);
}).finally(() => process.exit(0));
