const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CURSOR_PATH = path.join(ROOT, 'tradelab-discovery-cursor.json');
const MIN_QUOTE_VOLUME_USDT = 1_000_000;
const DEFAULT_BATCH_SIZE = 40;

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function compatibleSymbols(okxInfo, okxTickers, minQuoteVolume = MIN_QUOTE_VOLUME_USDT) {
  if (okxInfo?.code !== '0' || !Array.isArray(okxInfo.data) ||
      okxTickers?.code !== '0' || !Array.isArray(okxTickers.data)) {
    throw new Error('Invalid exchange instrument response');
  }
  const liquid = new Set(okxTickers.data
    .filter((item) => Number(item.volCcy24h) * Number(item.last) >= minQuoteVolume)
    .map((item) => item.instId));
  return okxInfo.data
    .filter((item) => item.state === 'live' && item.ruleType === 'normal' &&
      item.ctType === 'linear' && item.settleCcy === 'USDT' &&
      /^[A-Z0-9]+-USDT-SWAP$/.test(item.instId || '') && liquid.has(item.instId))
    .map((item) => item.instId.replace('-USDT-SWAP', 'USDT')).sort();
}

function batchFromCursor(symbols, cursor, batchSize = DEFAULT_BATCH_SIZE) {
  if (!symbols.length) return { symbols: [], nextCursor: 0 };
  const start = Math.max(0, Number(cursor) || 0) % symbols.length;
  const count = Math.min(symbols.length, batchSize);
  return {
    symbols: Array.from({ length: count }, (_, i) => symbols[(start + i) % symbols.length]),
    nextCursor: (start + count) % symbols.length
  };
}

async function discoveryBatch() {
  const [okxInfo, okxTickers] = await Promise.all([
    getJson('https://www.okx.com/api/v5/public/instruments?instType=SWAP'),
    getJson('https://www.okx.com/api/v5/market/tickers?instType=SWAP')
  ]);
  const allSymbols = compatibleSymbols(okxInfo, okxTickers);
  if (!allSymbols.length) throw new Error('No liquid OKX swaps; discovery stopped');
  let cursor = 0;
  try { cursor = JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8')).nextCursor || 0; } catch { /* first run */ }
  const batchSize = Math.min(100, Math.max(1, Number(process.env.DISCOVERY_SYMBOLS_PER_RUN) || DEFAULT_BATCH_SIZE));
  const batch = batchFromCursor(allSymbols, cursor, batchSize);
  return { allSymbols, ...batch, minQuoteVolume: MIN_QUOTE_VOLUME_USDT, batchSize };
}

function saveCursor(nextCursor) {
  fs.writeFileSync(CURSOR_PATH, JSON.stringify({ nextCursor, updatedAt: new Date().toISOString() }, null, 2));
}

module.exports = { compatibleSymbols, batchFromCursor, discoveryBatch, saveCursor };

if (require.main === module) {
  discoveryBatch().then((batch) => console.log(JSON.stringify({
    universeSize: batch.allSymbols.length,
    batchSize: batch.symbols.length,
    firstSymbols: batch.symbols.slice(0, 8),
    nextCursor: batch.nextCursor,
    minQuoteVolume: batch.minQuoteVolume
  }))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}

