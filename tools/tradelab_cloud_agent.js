/**
 * TradeLab Cloud Agent — Cloudflare Workers
 *
 * Полноценный агент: Telegram бот + сбор данных + аналитика.
 * Работает 24/7 бесплатно на Cloudflare Workers.
 *
 * Источники данных:
 * - OKX: цены, funding rate, свечи (основной)
 * - Bybit / Gate.io: фолбэки
 * - CoinGecko: BTC dominance, market cap, volume
 * - Alternative.me: Fear & Greed Index
 *
 * Binance блокирует Cloudflare Workers (403), поэтому здесь не используется.
 *
 * Cron Triggers:
 * - Каждый час: обновление цен и метрик
 * - Каждые 6 часов: новостной анализ
 */

// ===== CONFIG =====

const BOT_TOKEN = (typeof globalThis !== 'undefined' && globalThis.TELEGRAM_BOT_TOKEN)
  || (typeof process !== 'undefined' && process.env && process.env.TELEGRAM_BOT_TOKEN) || '';

const CHAT_ID = (typeof globalThis !== 'undefined' && globalThis.TELEGRAM_CHAT_ID)
  || (typeof process !== 'undefined' && process.env && process.env.TELEGRAM_CHAT_ID) || '';

const GITHUB_RAW = 'https://raw.githubusercontent.com/Youjin-led/TradeLab/main';
const GITHUB_API = 'https://api.github.com/repos/Youjin-led/TradeLab/contents';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT', 'LTCUSDT', 'NEARUSDT'];

// ===== TELEGRAM =====

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  } catch (e) { console.error('Send failed:', e); }
}

// ===== DATA COLLECTION =====

async function fetchJSON(url, timeoutMs) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    const resp = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'TradeLab/1.0' } });
    clearTimeout(t);
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

// Binance blocks Cloudflare IPs (403), so use OKX (primary), Bybit, Gate as fallbacks.
function toOkx(symbol) { return symbol.replace('USDT', '-USDT'); }
function toGate(symbol) { return symbol.replace('USDT', '_USDT'); }

// 1. Prices — OKX → Bybit → Gate
async function fetchPrices() {
  const okx = await fetchJSON('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
  if (okx && okx.code === '0' && Array.isArray(okx.data)) {
    const result = {};
    for (const t of okx.data) {
      const sym = t.instId.replace('-', '');
      if (SYMBOLS.includes(sym)) {
        const last = parseFloat(t.last);
        const open = parseFloat(t.open24h);
        result[sym] = {
          price: last,
          change24h: open ? Number(((last - open) / open * 100).toFixed(2)) : 0,
          volume: parseFloat(t.volCcy24h || 0),
          high: parseFloat(t.high24h || 0),
          low: parseFloat(t.low24h || 0)
        };
      }
    }
    if (Object.keys(result).length > 0) return result;
  }
  const bybit = await fetchJSON('https://api.bybit.com/v5/market/tickers?category=spot');
  if (bybit && bybit.retCode === 0 && Array.isArray(bybit.result?.list)) {
    const result = {};
    for (const t of bybit.result.list) {
      if (SYMBOLS.includes(t.symbol)) {
        result[t.symbol] = {
          price: parseFloat(t.lastPrice || 0),
          change24h: parseFloat(t.price24hPcnt || 0) * 100,
          volume: parseFloat(t.turnover24h || 0),
          high: parseFloat(t.highPrice24h || 0),
          low: parseFloat(t.lowPrice24h || 0)
        };
      }
    }
    if (Object.keys(result).length > 0) return result;
  }
  const gate = await fetchJSON('https://api.gateio.ws/api/v4/spot/tickers');
  if (Array.isArray(gate)) {
    const result = {};
    for (const t of gate) {
      const sym = t.currency_pair.replace('_', '');
      if (SYMBOLS.includes(sym)) {
        result[sym] = {
          price: parseFloat(t.last || 0),
          change24h: parseFloat(t.change_percentage || 0),
          volume: parseFloat(t.quote_volume || 0),
          high: parseFloat(t.high_24h || 0),
          low: parseFloat(t.low_24h || 0)
        };
      }
    }
    if (Object.keys(result).length > 0) return result;
  }
  return null;
}

// 2. Fear & Greed Index
async function fetchFearGreed() {
  const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
  if (!data || !data.data) return null;
  return data.data.map(d => ({
    value: parseInt(d.value),
    classification: d.value_classification,
    timestamp: parseInt(d.timestamp) * 1000
  }));
}

// 3. Funding rates — OKX swaps
async function fetchFundingRates() {
  const rates = {};
  for (const symbol of SYMBOLS) {
    const data = await fetchJSON(`https://www.okx.com/api/v5/public/funding-rate?instId=${toOkx(symbol)}-SWAP`);
    if (data && data.code === '0' && data.data && data.data[0]) {
      rates[symbol] = {
        rate: parseFloat(data.data[0].fundingRate),
        time: parseInt(data.data[0].fundingTime || 0)
      };
    }
  }
  return rates;
}

// 4. BTC Dominance from CoinGecko (rate-limited, retry once)
async function fetchMarketData() {
  for (let i = 0; i < 2; i++) {
    const data = await fetchJSON('https://api.coingecko.com/api/v3/global', 20000);
    if (data && data.data) {
      return {
        btcDominance: data.data.market_cap_percentage?.btc || 0,
        totalMarketCap: data.data.total_market_cap?.usd || 0,
        totalVolume: data.data.total_volume?.usd || 0,
        marketCapChange24h: data.data.market_cap_change_percentage_24h_usd || 0
      };
    }
  }
  return null;
}

// 5. Candles — OKX → Bybit → Gate (returns oldest→newest)
const OKX_BARS = { '1h': '1H', '4h': '4H', '1d': '1D' };
const BYBIT_MINUTES = { '1h': '60', '4h': '240', '1d': 'D' };
async function fetchCandles(symbol, interval, limit) {
  const okx = await fetchJSON(`https://www.okx.com/api/v5/market/candles?instId=${toOkx(symbol)}&bar=${OKX_BARS[interval] || '4H'}&limit=${limit || 100}`);
  if (okx && okx.code === '0' && Array.isArray(okx.data)) {
    return okx.data.map(k => ({
      time: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).reverse();
  }
  const bybit = await fetchJSON(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${BYBIT_MINUTES[interval] || '240'}&limit=${limit || 100}`);
  if (bybit && bybit.retCode === 0 && Array.isArray(bybit.result?.list)) {
    return bybit.result.list.map(k => ({
      time: parseInt(k[0]),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).reverse();
  }
  const gate = await fetchJSON(`https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${toGate(symbol)}&interval=${interval || '4h'}&limit=${limit || 100}`);
  if (Array.isArray(gate)) {
    return gate.map(k => ({
      time: parseInt(k[0]) * 1000,
      open: parseFloat(k[5]),
      high: parseFloat(k[3]),
      low: parseFloat(k[4]),
      close: parseFloat(k[2]),
      volume: parseFloat(k[6])
    }));
  }
  return null;
}

// ===== TECHNICAL ANALYSIS =====

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
    symbol,
    price: current,
    sma20: sma20 ? Number(sma20.toFixed(2)) : null,
    sma50: sma50 ? Number(sma50.toFixed(2)) : null,
    rsi: rsi14 ? Number(rsi14.toFixed(1)) : null,
    signal,
    change7d: closes.length >= 7 ? Number(((current - closes[closes.length - 7]) / closes[closes.length - 7] * 100).toFixed(2)) : null
  };
}

// ===== MAIN DATA COLLECTION =====

async function collectAllData() {
  console.log('Collecting data...');

  const [prices, fearGreed, funding, market] = await Promise.all([
    fetchPrices(),
    fetchFearGreed(),
    fetchFundingRates(),
    fetchMarketData()
  ]);

  // Technical analysis for key symbols
  const analysis = {};
  const keySymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'SUIUSDT', 'LTCUSDT'];
  for (const sym of keySymbols) {
    const candles = await fetchCandles(sym, '4h', 100);
    if (candles) {
      analysis[sym] = analyzeSymbol(sym, candles);
    }
  }

  return {
    _collectedAt: new Date().toISOString(),
    prices,
    fearGreed,
    funding,
    market,
    analysis
  };
}

// ===== FORMAT DATA FOR TELEGRAM =====

function formatMarketOverview(data) {
  const lines = ['Market Overview', ''];

  if (data.fearGreed && data.fearGreed.length > 0) {
    const fg = data.fearGreed[0];
    const emoji = fg.value >= 75 ? 'GREED' : fg.value >= 50 ? 'NEUTRAL' : fg.value >= 25 ? 'FEAR' : 'EXTREME FEAR';
    lines.push(`Fear & Greed: ${fg.value} (${emoji})`);
    lines.push(`7d trend: ${data.fearGreed[0].value} -> ${data.fearGreed[data.fearGreed.length-1].value}`);
    lines.push('');
  }

  if (data.market) {
    lines.push(`BTC Dominance: ${data.market.btcDominance.toFixed(1)}%`);
    lines.push(`Total Market Cap: $${(data.market.totalMarketCap / 1e9).toFixed(0)}B`);
    lines.push(`24h Change: ${data.market.marketCapChange24h >= 0 ? '+' : ''}${data.market.marketCapChange24h.toFixed(2)}%`);
    lines.push('');
  }

  if (data.prices) {
    lines.push('Top Coins:');
    for (const [sym, info] of Object.entries(data.prices).slice(0, 8)) {
      lines.push(`  ${sym}: $${info.price.toFixed(2)} (${info.change24h >= 0 ? '+' : ''}${info.change24h.toFixed(2)}%)`);
    }
    lines.push('');
  }

  if (data.funding) {
    lines.push('Funding Rates:');
    for (const [sym, info] of Object.entries(data.funding).slice(0, 5)) {
      const rate = (info.rate * 100).toFixed(4);
      lines.push(`  ${sym}: ${rate}%`);
    }
    lines.push('');
  }

  if (data.analysis) {
    lines.push('Technical Signals:');
    for (const [sym, a] of Object.entries(data.analysis)) {
      if (a) {
        lines.push(`  ${sym}: ${a.signal} (RSI: ${a.rsi}, 7d: ${a.change7d >= 0 ? '+' : ''}${a.change7d}%)`);
      }
    }
  }

  return lines.join('\n');
}

function formatDetailedStatus() {
  return 'Detailed status coming soon. Use /market for overview.';
}

// ===== CRON HANDLERS =====

async function scheduledHourly() {
  console.log('Cron: hourly data collection');
  const data = await collectAllData();

  // Store in globalThis (persists within worker instance)
  if (typeof globalThis !== 'undefined') {
    globalThis._lastData = data;
    globalThis._lastUpdate = Date.now();
  }

  // Send hourly market summary to Telegram
  if (CHAT_ID) {
    await sendMessage(CHAT_ID, formatMarketOverview(data));
  }

  return data;
}

// ===== WEBHOOK HANDLERS =====

function getStoredData() {
  if (typeof globalThis !== 'undefined' && globalThis._lastData) {
    return globalThis._lastData;
  }
  return null;
}

async function handleMarket() {
  let data = getStoredData();
  if (!data) {
    data = await collectAllData();
    if (typeof globalThis !== 'undefined') {
      globalThis._lastData = data;
    }
  }
  return formatMarketOverview(data);
}

async function handleStatus() {
  const state = await fetchJSON(`${GITHUB_RAW}/tradelab-incubation-state.json`);
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  const lines = ['TradeLab Agent', now, ''];

  // Live paper-trader equity (живой портфель AI, файл в репозитории)
  const paper = await fetchJSON(`${GITHUB_RAW}/tradelab-ai-paper-trades.json`).catch(() => null);
  if (paper && typeof paper.balance === 'number') {
    let notional = 0;
    const positions = Array.isArray(paper.positions) ? paper.positions : [];
    for (const pos of positions) notional += (pos.notional || 0);
    const equity = paper.balance + notional;
    lines.push(`Live Paper Equity: $${equity.toFixed(2)}`);
    lines.push(`  Cash: $${paper.balance.toFixed(2)} | In positions: $${notional.toFixed(2)} | Open: ${positions.length}`);
    lines.push(`  Realized PnL: ${paper.totalPnl >= 0 ? '+' : ''}${(paper.totalPnl || 0).toFixed(2)} USDT`);
    lines.push('');
  }

  // Incubation state (параллельные бэктесты стратегий)
  if (state && state.candidates) {
    const candidates = Object.values(state.candidates);
    const live = candidates.filter(c => c.status === 'incubating');
    const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
    lines.push(`Incubation PnL: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)} USDT`);
    lines.push(`Live: ${live.length} | Total: ${candidates.length}`);
  } else {
    lines.push('Incubation: loading...');
  }

  // Market data
  const data = getStoredData();
  if (data && data.fearGreed && data.fearGreed[0]) {
    const fg = data.fearGreed[0];
    lines.push(`Fear & Greed: ${fg.value} (${fg.classification})`);
  }

  if (data && data.market) {
    lines.push(`BTC Dom: ${data.market.btcDominance.toFixed(1)}%`);
    lines.push(`Market Cap: $${(data.market.totalMarketCap / 1e9).toFixed(0)}B`);
  }

  if (data && data.prices && data.prices.BTCUSDT) {
    lines.push(`BTC: $${data.prices.BTCUSDT.price.toFixed(0)} (${data.prices.BTCUSDT.change24h >= 0 ? '+' : ''}${data.prices.BTCUSDT.change24h.toFixed(2)}%)`);
  }

  lines.push('');
  lines.push('Commands: /market /trades /pnl /signals /help');

  return lines.join('\n');
}

async function handlePnl() {
  const state = await fetchJSON(`${GITHUB_RAW}/tradelab-incubation-state.json`);
  if (!state || !state.candidates) return 'No PnL data yet.';

  const lines = ['PnL Report', ''];

  // Live paper-trader equity (живой портфель AI)
  const paper = await fetchJSON(`${GITHUB_RAW}/tradelab-ai-paper-trades.json`).catch(() => null);
  if (paper && typeof paper.balance === 'number') {
    let notional = 0;
    const positions = Array.isArray(paper.positions) ? paper.positions : [];
    for (const pos of positions) notional += (pos.notional || 0);
    const equity = paper.balance + notional;
    lines.push(`Live Paper Equity: $${equity.toFixed(2)}`);
    lines.push(`  Realized PnL: ${(paper.totalPnl || 0) >= 0 ? '+' : ''}${(paper.totalPnl || 0).toFixed(2)} USDT (${(paper.closedTrades || []).length} trades)`);
    lines.push('');
  }

  const candidates = Object.values(state.candidates);
  let total = 0, wins = 0, losses = 0;
  const perSym = [];

  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    let s = 0;
    for (const t of trades) {
      if (typeof t.pnl !== 'number') continue;
      s += t.pnl;
      total += t.pnl;
      if (t.pnl >= 0) wins++; else losses++;
    }
    perSym.push({ sym: c.symbol, pnl: s, n: trades.length });
  }

  lines.push('Incubation PnL:');
  for (const p of perSym.sort((a, b) => b.pnl - a.pnl)) {
    if (p.n > 0) {
      lines.push(`${p.sym}: ${p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)} USDT (${p.n} trades)`);
    }
  }
  lines.push('');
  lines.push(`Incubation Total: ${total >= 0 ? '+' : ''}${total.toFixed(2)} USDT`);
  const totalTrades = wins + losses;
  const winrate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(0) : 0;
  lines.push(`Wins: ${wins} | Losses: ${losses} | Winrate: ${winrate}%`);

  return lines.join('\n');
}

async function handleSignals() {
  const data = getStoredData();
  if (!data || !data.analysis) return 'No signal data yet. Try /market first.';

  const lines = ['Technical Signals', ''];
  for (const [sym, a] of Object.entries(data.analysis)) {
    if (a) {
      const emoji = a.signal === 'BULLISH' ? 'GREEN' : a.signal === 'BEARISH' ? 'RED' : 'GRAY';
      lines.push(`${sym}: ${a.signal}`);
      lines.push(`  Price: $${a.price.toFixed(2)} | RSI: ${a.rsi} | 7d: ${a.change7d >= 0 ? '+' : ''}${a.change7d}%`);
      lines.push(`  SMA20: ${a.sma20} | SMA50: ${a.sma50}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function handleTrades() {
  const state = await fetchJSON(`${GITHUB_RAW}/tradelab-incubation-state.json`);
  if (!state || !state.candidates) return 'No trade data.';

  const candidates = Object.values(state.candidates).filter(c => c.paperLedger && c.paperLedger.trades && c.paperLedger.trades.length > 0);
  const lines = ['Recent Trades', ''];

  for (const c of candidates.slice(0, 5)) {
    const trades = c.paperLedger.trades.slice(-3);
    lines.push(`${c.symbol} ${c.interval} ${c.strategy}:`);
    for (const t of trades) {
      const pnl = t.pnl >= 0 ? `+${t.pnl.toFixed(2)}` : t.pnl.toFixed(2);
      lines.push(`  ${t.side} ${t.entryTime || '?'} -> ${t.exitTime || 'open'} | PnL: ${pnl}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function handleHelp() {
  return [
    'TradeLab Agent Commands',
    '',
    '/status - Portfolio + market overview',
    '/market - Full market data',
    '/signals - Technical signals',
    '/trades - Recent paper trades',
    '/pnl - PnL report',
    '/help - This message',
    '',
    'Data: OKX, Bybit, Gate, CoinGecko',
    'Hourly Telegram reports + on-demand commands.'
  ].join('\n');
}

// ===== WEBHOOK HANDLER =====

async function handleWebhook(request) {
  try {
    const update = await request.json();
    if (!update.message) return new Response('ok');

    const msg = update.message;
    const text = (msg.text || '').trim().toLowerCase();
    const chatId = String(msg.chat.id);

    if (chatId !== String(CHAT_ID)) return new Response('ok');

    let response;
    switch (text) {
      case '/status': response = await handleStatus(); break;
      case '/market': response = await handleMarket(); break;
      case '/signals': response = await handleSignals(); break;
      case '/trades': response = await handleTrades(); break;
      case '/pnl': response = await handlePnl(); break;
      case '/start':
      case '/help': response = handleHelp(); break;
      default: return new Response('ok');
    }

    await sendMessage(chatId, response);
    return new Response('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('ok');
  }
}

// ===== CLOUDFLARE WORKERS ENTRY =====

if (typeof globalThis !== 'undefined' && globalThis.addEventListener) {
  globalThis.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (url.pathname === '/webhook' && event.request.method === 'POST') {
      event.respondWith(handleWebhook(event.request));
    } else if (url.pathname === '/collect') {
      event.respondWith(collectAllData().then(d => new Response(JSON.stringify(d, null, 2))));
    } else {
      event.respondWith(new Response('TradeLab Agent running. POST /webhook'));
    }
  });

  // Cron trigger handler
  globalThis.addEventListener('scheduled', event => {
    event.waitUntil(scheduledHourly());
  });
}

if (typeof module !== 'undefined') {
  module.exports = { handleWebhook, collectAllData, scheduledHourly, sendMessage };
}
