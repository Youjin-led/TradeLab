const fs = require('fs');
const path = require('path');

const { fetchCandles } = require('./tradelab_run_once');

const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_NEWS_IMPACT.md');
const JSON_PATH = path.join(ROOT, 'tradelab-news-impact.json');

const FEEDS = [
  { name: 'CoinDesk', category: 'crypto-media', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Cointelegraph', category: 'crypto-media', url: 'https://cointelegraph.com/rss' },
  { name: 'Decrypt', category: 'crypto-media', url: 'https://decrypt.co/feed' },
  { name: 'CryptoSlate', category: 'crypto-media', url: 'https://cryptoslate.com/feed/' },
  { name: 'Bitcoin Magazine', category: 'crypto-media', url: 'https://bitcoinmagazine.com/.rss/full/' },
  { name: 'NewsBTC', category: 'market-media', url: 'https://www.newsbtc.com/feed/' },
  { name: 'CryptoPotato', category: 'market-media', url: 'https://cryptopotato.com/feed/' },
  { name: 'Investing Crypto', category: 'market-media', url: 'https://www.investing.com/rss/news_301.rss' },
  { name: 'SEC Press Releases', category: 'regulatory', url: 'https://www.sec.gov/news/pressreleases.rss' },
  { name: 'CFTC Press Releases', category: 'regulatory', url: 'https://www.cftc.gov/PressRoom/PressReleases/rss.xml' }
];

const DEFAULT_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'INJUSDT', 'APTUSDT', 'JUPUSDT',
  'SEIUSDT', 'OPUSDT', 'NEARUSDT', 'FILUSDT', 'RENDERUSDT', 'AVAXUSDT', 'LINKUSDT'
];

const ALIASES = {
  BTCUSDT: ['btc', 'bitcoin'],
  ETHUSDT: ['eth', 'ether', 'ethereum'],
  SOLUSDT: ['sol', 'solana'],
  BNBUSDT: ['bnb', 'binance coin', 'binance'],
  XRPUSDT: ['xrp', 'ripple'],
  ADAUSDT: ['ada', 'cardano'],
  DOGEUSDT: ['doge', 'dogecoin'],
  LINKUSDT: ['link', 'chainlink'],
  AVAXUSDT: ['avax', 'avalanche'],
  DOTUSDT: ['dot', 'polkadot'],
  INJUSDT: ['inj', 'injective'],
  APTUSDT: ['apt', 'aptos'],
  JUPUSDT: ['jup', 'jupiter'],
  SEIUSDT: ['sei'],
  FILUSDT: ['fil', 'filecoin'],
  RENDERUSDT: ['render', 'rndr'],
  NEARUSDT: ['near'],
  OPUSDT: ['op', 'optimism'],
  ARBUSDT: ['arb', 'arbitrum']
};

const POSITIVE = [
  'adoption', 'approve', 'approved', 'approval', 'bullish', 'buy', 'buys', 'partnership',
  'inflow', 'inflows', 'record', 'rally', 'surge', 'gain', 'gains', 'upgrade', 'launch',
  'etf', 'institutional', 'accumulate', 'accumulation', 'support', 'win', 'settlement',
  'breakout', 'reserves', 'treasury', 'integrates', 'integration', 'license', 'clarity',
  'growth', 'rebound', 'recovery', 'milestone', 'funding', 'raises', 'expands'
];

const NEGATIVE = [
  'ban', 'bearish', 'bankrupt', 'bankruptcy', 'crackdown', 'charges', 'charged', 'delay',
  'delist', 'exploit', 'hack', 'hacked', 'investigation', 'lawsuit', 'liquidation',
  'outflow', 'outflows', 'scam', 'sell-off', 'slump', 'drop', 'falls', 'fraud', 'fine',
  'probe', 'warning', 'risk', 'risks', 'breach', 'stolen', 'panic', 'pressure',
  'uncertainty', 'sanction', 'sanctions', 'reject', 'rejected', 'cuts', 'cut'
];

function decodeEntities(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(text) {
  return decodeEntities(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripTags(match[1]) : '';
}

function linkValue(block) {
  const direct = tagValue(block, 'link');
  if (direct) return direct;
  const atom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return atom ? decodeEntities(atom[1]) : '';
}

function parseItems(xml, source) {
  const blocks = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomBlocks = blocks.length ? [] : [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  return [...blocks, ...atomBlocks].map((block) => {
    const title = tagValue(block, 'title');
    const summary = tagValue(block, 'description') || tagValue(block, 'summary') || tagValue(block, 'content:encoded');
    const publishedRaw = tagValue(block, 'pubDate') || tagValue(block, 'updated') || tagValue(block, 'published');
    const publishedAt = publishedRaw ? new Date(publishedRaw) : null;
    return {
      source,
      title,
      summary,
      link: linkValue(block),
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt.toISOString() : null
    };
  }).filter((item) => item.title && item.publishedAt);
}

function countWords(text, words) {
  const normalized = ` ${text.toLowerCase()} `;
  return words.reduce((sum, word) => {
    const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = normalized.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
}

function sentiment(text) {
  const positive = countWords(text, POSITIVE);
  const negative = countWords(text, NEGATIVE);
  const score = positive - negative;
  return {
    score,
    label: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
    positive,
    negative
  };
}

function matchesSymbol(item, symbol) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  return (ALIASES[symbol] || [symbol.replace('USDT', '').toLowerCase()]).some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
  });
}

function candleTime(candle) {
  return new Date(`${candle.time.replace(' ', 'T')}:00Z`).getTime();
}

function reactionFor(candles, publishedAt) {
  const eventTime = new Date(publishedAt).getTime();
  const index = candles.findIndex((candle) => candleTime(candle) >= eventTime);
  if (index < 0 || index >= candles.length - 2) return null;
  const base = candles[index].close;
  const ret = (offset) => {
    const next = candles[Math.min(candles.length - 1, index + offset)];
    return Number((((next.close - base) / base) * 100).toFixed(3));
  };
  return {
    eventCandle: candles[index].time,
    baseClose: base,
    r1h: ret(1),
    r4h: ret(4),
    r12h: ret(12),
    r24h: ret(24)
  };
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function summarize(events) {
  const byKey = new Map();
  for (const event of events) {
    const key = `${event.symbol}:${event.sentiment.label}`;
    const row = byKey.get(key) || { symbol: event.symbol, sentiment: event.sentiment.label, count: 0, r1h: [], r4h: [], r12h: [], r24h: [] };
    row.count += 1;
    row.r1h.push(event.reaction.r1h);
    row.r4h.push(event.reaction.r4h);
    row.r12h.push(event.reaction.r12h);
    row.r24h.push(event.reaction.r24h);
    byKey.set(key, row);
  }
  return [...byKey.values()].map((row) => ({
    symbol: row.symbol,
    sentiment: row.sentiment,
    count: row.count,
    avg1h: Number(average(row.r1h).toFixed(3)),
    avg4h: Number(average(row.r4h).toFixed(3)),
    avg12h: Number(average(row.r12h).toFixed(3)),
    avg24h: Number(average(row.r24h).toFixed(3))
  })).sort((a, b) => b.count - a.count || Math.abs(b.avg24h) - Math.abs(a.avg24h));
}

function writeReport(output) {
  const lines = [
    '# TradeLab News Impact',
    '',
    `Generated: ${output.generatedAt}`,
    `Feeds: ${output.feeds.map((feed) => `${feed.name} (${feed.category || 'uncategorized'})`).join(', ')}`,
    `Symbols: ${output.symbols.join(', ')}`,
    '',
    'This report is research-only. It does not approve trading and does not place orders.',
    '',
    '## Summary',
    '',
    'Symbol | Sentiment | Events | Avg 1h | Avg 4h | Avg 12h | Avg 24h',
    '--- | --- | ---: | ---: | ---: | ---: | ---:'
  ];
  for (const row of output.summary) {
    lines.push(`${row.symbol} | ${row.sentiment} | ${row.count} | ${row.avg1h}% | ${row.avg4h}% | ${row.avg12h}% | ${row.avg24h}%`);
  }
  if (!output.summary.length) lines.push('No matched events | - | 0 | 0% | 0% | 0% | 0%');

  lines.push('', '## Recent Matched Events', '');
  lines.push('Time | Symbol | Sentiment | 24h | Source | Title');
  lines.push('--- | --- | --- | ---: | --- | ---');
  for (const event of output.events.slice(0, 30)) {
    lines.push(`${event.publishedAt} | ${event.symbol} | ${event.sentiment.label} (${event.sentiment.score}) | ${event.reaction.r24h}% | ${event.source} | ${event.title.replace(/\|/g, '/')}`);
  }

  if (output.errors.length) {
    lines.push('', '## Feed/Market Errors', '');
    for (const error of output.errors) lines.push(`- ${error.name || error.symbol}: ${error.error}`);
  }

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, { headers: { 'User-Agent': 'TradeLab paper research bot' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseItems(await response.text(), feed.name);
}

async function analyze(symbols = DEFAULT_SYMBOLS) {
  const errors = [];
  const feedItems = [];
  for (const feed of FEEDS) {
    try {
      feedItems.push(...await fetchFeed(feed));
    } catch (error) {
      errors.push({ name: feed.name, error: error.message });
    }
  }

  const candlesBySymbol = new Map();
  for (const symbol of symbols) {
    try {
      candlesBySymbol.set(symbol, await fetchCandles(symbol, '1h', 1000));
    } catch (error) {
      errors.push({ symbol, error: error.message });
    }
  }

  const events = [];
  for (const item of feedItems) {
    const itemSentiment = sentiment(`${item.title} ${item.summary}`);
    for (const symbol of symbols) {
      if (!matchesSymbol(item, symbol) || !candlesBySymbol.has(symbol)) continue;
      const reaction = reactionFor(candlesBySymbol.get(symbol), item.publishedAt);
      if (!reaction) continue;
      events.push({
        source: item.source,
        symbol,
        title: item.title,
        link: item.link,
        publishedAt: item.publishedAt,
        sentiment: itemSentiment,
        reaction
      });
    }
  }

  events.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  const output = {
    generatedAt: new Date().toISOString(),
    feeds: FEEDS.map(({ name, category, url }) => ({ name, category, url })),
    symbols,
    itemCount: feedItems.length,
    matchedEvents: events.length,
    summary: summarize(events),
    events,
    errors
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeReport(output);
  return {
    generatedAt: output.generatedAt,
    itemCount: output.itemCount,
    matchedEvents: output.matchedEvents,
    summary: output.summary.slice(0, 10),
    errors,
    reportPath: REPORT_PATH
  };
}

async function main() {
  const symbols = (process.argv[2] || DEFAULT_SYMBOLS.join(',')).split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  console.log(JSON.stringify(await analyze(symbols), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { analyze };
