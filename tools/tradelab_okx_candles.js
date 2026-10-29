const BAR = { '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1Dutc' };
let nextRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const start = Math.max(now, nextRequestAt);
  nextRequestAt = start + 120; // OKX history-candles: 20 requests per 2 seconds per IP.
  if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
}

function parseRow(row) {
  if (!Array.isArray(row) || row.length < 9) throw new Error('Malformed OKX candle');
  const timestamp = Number(row[0]);
  const [open, high, low, close, volume] = [row[1], row[2], row[3], row[4], row[6]].map(Number);
  if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) {
    throw new Error('Non-finite OKX candle');
  }
  return { timestamp, time: new Date(timestamp).toISOString().replace('T', ' ').slice(0, 16),
    open, high, low, close, volume, complete: row[8] === '1' };
}

async function fetchOkxSwapCandles(symbol, interval, limit = 1000, fetchFn = fetch) {
  if (!/^[A-Z0-9]+USDT$/.test(symbol) || !BAR[interval]) throw new Error('Unsupported OKX candle symbol or interval');
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error('Invalid OKX candle limit');
  const instId = `${symbol.slice(0, -4)}-USDT-SWAP`;
  const byTime = new Map();
  let after = null;
  for (let page = 0; page < Math.ceil(limit / 100) + 2 && byTime.size < limit; page += 1) {
    const url = new URL('https://www.okx.com/api/v5/market/history-candles');
    url.searchParams.set('instId', instId);
    url.searchParams.set('bar', BAR[interval]);
    url.searchParams.set('limit', String(Math.min(100, limit - byTime.size + 1)));
    if (after !== null) url.searchParams.set('after', String(after));
    await throttle();
    const response = await fetchFn(url.toString(), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`OKX candles HTTP ${response.status}`);
    const body = await response.json();
    if (body.code !== '0' || !Array.isArray(body.data)) throw new Error(`OKX candles API ${body.code || 'invalid response'}`);
    if (!body.data.length) break;
    for (const raw of body.data) {
      const candle = parseRow(raw);
      byTime.set(candle.timestamp, candle);
    }
    const oldest = Math.min(...body.data.map((row) => Number(row[0])));
    if (!Number.isFinite(oldest) || (after !== null && oldest >= after)) break;
    after = oldest;
  }
  const candles = [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
  if (candles.length < limit) throw new Error(`OKX candles insufficient: ${candles.length}/${limit} ${symbol} ${interval}`);
  return candles.map(({ timestamp, complete, ...candle }, index) => ({ ...candle, index, complete }));
}

module.exports = { parseRow, fetchOkxSwapCandles };

