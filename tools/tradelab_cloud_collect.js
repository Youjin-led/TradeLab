/**
 * TradeLab Cloud Collector
 *
 * Лёгкий скрипт для GitHub Actions:
 * Собирает рыночные данные из публичных API.
 * Не требует API-ключей.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TradeLab/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===== OKX USDT swaps =====

async function fetchPrices() {
  const response = await fetchJSON('https://www.okx.com/api/v5/market/tickers?instType=SWAP');
  if (response?.code !== '0' || !Array.isArray(response.data)) return null;
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT', 'LTCUSDT', 'NEARUSDT'];
  const result = {};
  for (const t of response.data) {
    const symbol = t.instId?.replace('-USDT-SWAP', 'USDT');
    if (symbols.includes(symbol) && t.instId === `${symbol.slice(0, -4)}-USDT-SWAP`) {
      result[symbol] = {
        price: Number(t.last),
        change24h: Number(t.open24h) ? (Number(t.last) / Number(t.open24h) - 1) * 100 : null,
        volume: Number(t.volCcy24h) * Number(t.last),
        high: Number(t.high24h),
        low: Number(t.low24h)
      };
    }
  }
  return result;
}

async function fetchCandles(symbol, interval, limit) {
  try {
    const data = await require('./tradelab_okx_candles').fetchOkxSwapCandles(symbol, interval, limit);
    return data.map((k) => ({ ...k, time: Date.parse(k.time.replace(' ', 'T') + ':00Z') }));
  } catch { return null; }
}

async function fetchFundingRates() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'SUIUSDT'];
  const rates = {};
  for (const sym of symbols) {
    const data = await fetchJSON(`https://www.okx.com/api/v5/public/funding-rate?instId=${sym.slice(0, -4)}-USDT-SWAP`);
    if (data?.code === '0' && data.data?.length) {
      rates[sym] = { rate: Number(data.data[0].fundingRate), time: Number(data.data[0].fundingTime) };
    }
    await sleep(200);
  }
  return rates;
}

// ===== Fear & Greed =====

async function fetchFearGreed() {
  const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
  if (!data || !data.data) return null;
  return data.data.map(d => ({
    value: parseInt(d.value),
    classification: d.value_classification,
    timestamp: parseInt(d.timestamp) * 1000
  }));
}

// ===== CoinGecko =====

async function fetchMarketData() {
  const data = await fetchJSON('https://api.coingecko.com/api/v3/global');
  if (!data || !data.data) return null;
  return {
    btcDominance: data.data.market_cap_percentage?.btc || 0,
    totalMarketCap: data.data.total_market_cap?.usd || 0,
    totalVolume: data.data.total_volume?.usd || 0,
    marketCapChange24h: data.data.market_cap_change_percentage_24h_usd || 0
  };
}

// ===== Technical Analysis =====

function sma(closes, period) {
  if (closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) sum += closes[i];
  return sum / period;
}

function rsi(closes, period) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function analyzeSymbol(symbol, candles) {
  if (!candles || candles.length < 50) return null;
  const closes = candles.map(c => c.close);
  const current = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);

  let signal = 'WAIT';
  if (sma20 && sma50 && rsi14) {
    if (current > sma20 && sma20 > sma50 && rsi14 < 70) signal = 'BULLISH';
    else if (current < sma20 && sma20 < sma50 && rsi14 > 30) signal = 'BEARISH';
  }

  return {
    symbol, price: current,
    sma20: sma20 ? Number(sma20.toFixed(2)) : null,
    sma50: sma50 ? Number(sma50.toFixed(2)) : null,
    rsi: rsi14 ? Number(rsi14.toFixed(1)) : null,
    signal
  };
}

// ===== MAIN =====

async function main() {
  console.log('=== TradeLab Cloud Collector ===');
  console.log('Time:', new Date().toISOString());

  // 1. Prices
  console.log('Fetching prices...');
  const prices = await fetchPrices();
  console.log(`  Got ${Object.keys(prices || {}).length} symbols`);

  // 2. Fear & Greed
  console.log('Fetching Fear & Greed...');
  const fearGreed = await fetchFearGreed();
  console.log(`  Current: ${fearGreed ? fearGreed[0].value : 'N/A'}`);

  // 3. Funding rates
  console.log('Fetching funding rates...');
  const funding = await fetchFundingRates();
  console.log(`  Got ${Object.keys(funding || {}).length} rates`);

  // 4. Market data
  console.log('Fetching market data...');
  const market = await fetchMarketData();
  console.log(`  BTC Dom: ${market ? market.btcDominance.toFixed(1) : 'N/A'}%`);

  // 5. Technical analysis
  console.log('Running technical analysis...');
  const analysis = {};
  const keySymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'SUIUSDT', 'LTCUSDT'];
  for (const sym of keySymbols) {
    const candles = await fetchCandles(sym, '4h', 100);
    if (candles) {
      analysis[sym] = analyzeSymbol(sym, candles);
      console.log(`  ${sym}: ${analysis[sym].signal} (RSI: ${analysis[sym].rsi})`);
    }
    await sleep(300);
  }

  // Save results
  const result = {
    _collectedAt: new Date().toISOString(),
    prices, fearGreed, funding, market, analysis
  };

  fs.writeFileSync(path.join(ROOT, 'tradelab-cloud-data.json'), JSON.stringify(result, null, 2));
  console.log('\nData saved to tradelab-cloud-data.json');

  // Generate signals summary
  const signals = Object.entries(analysis)
    .filter(([_, a]) => a && a.signal !== 'WAIT')
    .map(([sym, a]) => `${sym}: ${a.signal} (RSI: ${a.rsi})`);

  if (signals.length > 0) {
    console.log('\nActive signals:');
    signals.forEach(s => console.log(`  ${s}`));
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);

