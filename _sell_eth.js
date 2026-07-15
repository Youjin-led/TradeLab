require('dotenv').config();
const ccxt = require('ccxt');

async function main() {
  const ex = new ccxt.okx({
    apiKey: process.env.OKX_API_KEY,
    secret: process.env.OKX_SECRET_KEY,
    password: process.env.OKX_PASSPHRASE,
  });

  try {
    // 1. Проверяем баланс ETH
    const balance = await ex.fetchBalance();
    const ethFree = balance.free?.ETH || 0;
    console.log(`ETH free: ${ethFree}`);

    if (ethFree < 0.001) {
      console.log('❌ Недостаточно ETH для продажи');
      return;
    }

    // 2. Получаем текущую цену ETH/USDT
    const ticker = await ex.fetchTicker('ETH/USDT');
    const price = ticker.last;
    console.log(`ETH/USDT price: ${price}$`);

    // 3. Продаём весь ETH за USDT по market
    console.log(`\n🔄 Selling ${ethFree} ETH @ market...`);
    const order = await ex.createMarketSellOrder('ETH/USDT', ethFree);
    console.log(`✅ Order filled:`);
    console.log(`   ID: ${order.id}`);
    console.log(`   Price: ${order.price || 'market'}`);
    console.log(`   Cost: ${order.cost} USDT`);
    console.log(`   Fee: ${order.fee?.cost || 0} ${order.fee?.currency || 'USDT'}`);

    // 4. Проверяем итоговый баланс
    const newBalance = await ex.fetchBalance();
    const usdtNow = newBalance.free?.USDT || 0;
    console.log(`\n💰 New USDT balance: ${usdtNow.toFixed(2)}$`);

  } catch (e) {
    console.error('❌ Error:', e.message);
    if (e.response) console.error('Response:', JSON.stringify(e.response.data || e.response).slice(0, 500));
  }
}

main();
