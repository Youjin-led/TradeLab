/**
 * TradeLab Data Collector
 *
 * Собирает информацию из интернета для анализа:
 * 1. CryptoPanic — новости и тональность по монетам
 * 2. Alternative.me — Fear & Greed Index
 * 3. CoinGecko — макро-данные (BTC dominance, volume)
 * 4. Binance — Open Interest, Funding Rate
 *
 * Paper-only research tool. Does not place orders.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var NEWS_PATH = path.join(ROOT, 'tradelab-news-impact.json');
var MACRO_PATH = path.join(ROOT, 'tradelab-macro-data.json');
var CACHE_TTL_MS = 10 * 60 * 1000; // 10 минут кэш

// ===== ВСПОМОГАТЕЛЬНЫЕ =====

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function loadJSON(filepath) {
  try {
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

function isCacheFresh(filepath, ttlMs) {
  var data = loadJSON(filepath);
  if (!data || !data._updatedAt) return false;
  return (Date.now() - data._updatedAt) < ttlMs;
}

// ===== 1. CRYPTOPANIC NEWS =====

/**
 * Собрать новости с CryptoPanic
 * Бесплатный API (без ключа — ограничен, лучше с ключом)
 * 
 * @param {string} apiKey - API ключ CryptoPanic (опционально)
 * @returns {Array} Массив новостей
 */
async function fetchCryptoPanicNews(apiKey) {
  var url = 'https://cryptopanic.com/api/v1/posts/?auth_token=';
  if (apiKey) {
    url += apiKey;
  } else {
    url += 'public'; // публичный доступ (ограничен)
  }
  url += '&kind=news&filter=hot&limit=50';

  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
    var response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return [];

    var data = await response.json();
    if (!data.results) return [];

    return data.results.map(function (post) {
      // Определяем монету из тегов
      var symbol = null;
      var currencies = post.currencies || [];
      if (currencies.length > 0) {
        symbol = currencies[0].code + 'USDT';
      }

      // Определяем тональность
      var score = 0;
      var votes = post.votes || {};
      if (votes.positive > votes.negative) score = 1;
      else if (votes.negative > votes.positive) score = -1;
      // Если много голосов — усиливаем
      var totalVotes = votes.positive + votes.negative;
      if (totalVotes > 50) score *= 2;
      if (totalVotes > 200) score *= 3;

      return {
        title: post.title,
        source: 'cryptopanic',
        symbol: symbol,
        publishedAt: post.published_at,
        sentiment: {
          score: score,
          label: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'
        },
        url: post.url
      };
    });
  } catch (e) {
    return [];
  }
}

// ===== 2. FEAR & GREED INDEX =====

/**
 * Получить Fear & Greed Index с alternative.me
 * 
 * @returns {Object} { value, label, timestamp }
 */
async function fetchFearGreedIndex() {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
    var response = await fetch('https://api.alternative.me/fng/?limit=1', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    var data = await response.json();
    if (!data.data || data.data.length === 0) return null;

    var item = data.data[0];
    var value = parseInt(item.value, 10);
    var label = 'neutral';
    if (value <= 25) label = 'extreme-fear';
    else if (value <= 45) label = 'fear';
    else if (value <= 55) label = 'neutral';
    else if (value <= 75) label = 'greed';
    else label = 'extreme-greed';

    return {
      value: value,
      label: label,
      timestamp: item.timestamp ? parseInt(item.timestamp, 10) * 1000 : Date.now()
    };
  } catch (e) {
    return null;
  }
}

// ===== 3. COINGECKO MACRO =====

/**
 * Получить макро-данные с CoinGecko
 * 
 * @returns {Object} { btcDominance, totalVolume, btcPrice, ethPrice }
 */
async function fetchCoinGeckoMacro() {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
    var response = await fetch(
      'https://api.coingecko.com/api/v3/global',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    var data = await response.json();
    if (!data.data) return null;

    var marketData = data.data;
    var btcDom = marketData.market_cap_percentage || {};
    var totalVol = marketData.total_volume || {};

    return {
      btcDominance: btcDom.btc || null,
      totalMarketCap: marketData.total_market_cap ? (marketData.total_market_cap.usd || null) : null,
      totalVolume24h: totalVol.usd || null,
      activeCryptocurrencies: marketData.active_cryptocurrencies || null,
      markets: marketData.markets || null
    };
  } catch (e) {
    return null;
  }
}

// ===== 4. BINANCE OPEN INTEREST =====

/**
 * Получить Open Interest для символа с Binance
 * 
 * @param {string} symbol - Например 'BTCUSDT'
 * @returns {Object|null} { openInterest, timestamp }
 */
async function fetchBinanceOpenInterest(symbol) {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
    var response = await fetch(
      'https://fapi.binance.com/fapi/v1/openInterest?symbol=' + symbol,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    var data = await response.json();
    return {
      symbol: symbol,
      openInterest: parseFloat(data.openInterest),
      timestamp: data.time || Date.now()
    };
  } catch (e) {
    return null;
  }
}

/**
 * Получить Funding Rate для символа с Binance
 * 
 * @param {string} symbol - Например 'BTCUSDT'
 * @returns {Object|null} { fundingRate, nextFundingTime }
 */
async function fetchBinanceFundingRate(symbol) {
  try {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 10000);
    var response = await fetch(
      'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + symbol,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    var data = await response.json();
    return {
      symbol: symbol,
      fundingRate: parseFloat(data.lastFundingRate) * 100, // в процентах
      nextFundingTime: data.nextFundingTime || null,
      markPrice: parseFloat(data.markPrice) || null
    };
  } catch (e) {
    return null;
  }
}

// ===== 5. ОСНОВНОЙ СБОРЩИК =====

/**
 * Полный сбор данных: новости + макро + OI + funding
 * 
 * @param {Object} options
 * @param {string} options.cryptoPanicKey - API ключ CryptoPanic
 * @param {Array} options.symbols - Список символов для OI/funding (по умолчанию топ-10)
 * @param {boolean} options.force - Принудительно обновить (игнорировать кэш)
 * @returns {Object} Собранные данные
 */
async function collectAllData(options) {
  var opts = options || {};
  var symbols = opts.symbols || [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
    'ADAUSDT', 'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT'
  ];
  var force = opts.force || false;

  var result = {
    _updatedAt: Date.now(),
    news: [],
    fearGreed: null,
    macro: null,
    openInterest: [],
    fundingRates: [],
    errors: []
  };

  // 1. Новости (всегда свежие)
  try {
    var news = await fetchCryptoPanicNews(opts.cryptoPanicKey);
    result.news = news;
  } catch (e) {
    result.errors.push('news: ' + e.message);
  }

  // 2. Fear & Greed
  try {
    result.fearGreed = await fetchFearGreedIndex();
  } catch (e) {
    result.errors.push('fearGreed: ' + e.message);
  }

  // 3. Макро
  try {
    result.macro = await fetchCoinGeckoMacro();
  } catch (e) {
    result.errors.push('macro: ' + e.message);
  }

  // 4. Open Interest (по одному, с задержкой)
  for (var i = 0; i < symbols.length; i++) {
    try {
      var oi = await fetchBinanceOpenInterest(symbols[i]);
      if (oi) result.openInterest.push(oi);
      if (i < symbols.length - 1) await sleep(200); // задержка между запросами
    } catch (e) {
      result.errors.push('oi_' + symbols[i] + ': ' + e.message);
    }
  }

  // 5. Funding Rate
  for (var j = 0; j < symbols.length; j++) {
    try {
      var fr = await fetchBinanceFundingRate(symbols[j]);
      if (fr) result.fundingRates.push(fr);
      if (j < symbols.length - 1) await sleep(200);
    } catch (e) {
      result.errors.push('fr_' + symbols[j] + ': ' + e.message);
    }
  }

  return result;
}

// ===== 6. СОХРАНЕНИЕ И ЗАГРУЗКА =====

/**
 * Сохранить новости в tradelab-news-impact.json
 * Объединяет с существующими (хранит последние 500)
 */
function saveNews(news) {
  var existing = loadJSON(NEWS_PATH);
  var events = existing && existing.events ? existing.events : [];

  // Добавляем новые
  for (var i = 0; i < news.length; i++) {
    events.unshift({
      title: news[i].title,
      source: news[i].source,
      symbol: news[i].symbol,
      publishedAt: news[i].publishedAt,
      sentiment: news[i].sentiment
    });
  }

  // Удаляем дубликаты по title
  var seen = {};
  events = events.filter(function (event) {
    var key = event.title;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  // Храним только последние 500
  events = events.slice(0, 500);

  saveJSON(NEWS_PATH, {
    _updatedAt: Date.now(),
    events: events
  });

  return events.length;
}

/**
 * Сохранить макро-данные
 */
function saveMacroData(data) {
  saveJSON(MACRO_PATH, data);
}

/**
 * Получить последние макро-данные
 */
function loadMacroData() {
  return loadJSON(MACRO_PATH);
}

/**
 * Получить сводку макро-данных для отчёта
 */
function getMacroSummary() {
  var macro = loadMacroData();
  if (!macro) return 'No macro data';

  var lines = [];
  if (macro.fearGreed) {
    lines.push('Fear & Greed: ' + macro.fearGreed.value + ' (' + macro.fearGreed.label + ')');
  }
  if (macro.macro) {
    if (macro.macro.btcDominance) lines.push('BTC Dominance: ' + macro.macro.btcDominance.toFixed(1) + '%');
    if (macro.macro.totalVolume24h) lines.push('24h Volume: $' + (macro.macro.totalVolume24h / 1e12).toFixed(2) + 'T');
  }
  if (macro.news && macro.news.length > 0) {
    var pos = macro.news.filter(function (n) { return n.sentiment && n.sentiment.score > 0; }).length;
    var neg = macro.news.filter(function (n) { return n.sentiment && n.sentiment.score < 0; }).length;
    lines.push('News: ' + macro.news.length + ' events (' + pos + ' pos / ' + neg + ' neg)');
  }
  if (macro.errors && macro.errors.length > 0) {
    lines.push('Errors: ' + macro.errors.length);
  }

  return lines.join(' | ');
}

// ===== 7. ЗАПУСК =====

async function main() {
  var cryptoPanicKey = process.argv[2] || '';
  var force = process.argv.includes('--force');

  console.log('=== TradeLab Data Collector ===');
  console.log('Collecting data from internet...\n');

  var data = await collectAllData({
    cryptoPanicKey: cryptoPanicKey,
    force: force
  });

  // Сохраняем новости
  var newsCount = saveNews(data.news);
  console.log('News saved: ' + newsCount + ' events');

  // Сохраняем макро
  saveMacroData(data);
  console.log('Macro data saved');

  // Выводим сводку
  console.log('\n=== SUMMARY ===');
  if (data.fearGreed) {
    console.log('Fear & Greed: ' + data.fearGreed.value + ' (' + data.fearGreed.label + ')');
  }
  if (data.macro) {
    console.log('BTC Dominance: ' + (data.macro.btcDominance ? data.macro.btcDominance.toFixed(1) + '%' : 'N/A'));
    console.log('24h Volume: $' + (data.macro.totalVolume24h ? (data.macro.totalVolume24h / 1e12).toFixed(2) + 'T' : 'N/A'));
  }
  console.log('Open Interest: ' + data.openInterest.length + ' symbols');
  console.log('Funding Rates: ' + data.fundingRates.length + ' symbols');
  if (data.errors.length > 0) {
    console.log('\nErrors (' + data.errors.length + '):');
    data.errors.forEach(function (e) { console.log('  ⚠ ' + e); });
  }
  console.log('\nDone.');
}

if (require.main === module) {
  main().catch(function (error) {
    console.error('Fatal:', error.message);
    process.exit(1);
  });
}

module.exports = {
  collectAllData: collectAllData,
  fetchCryptoPanicNews: fetchCryptoPanicNews,
  fetchFearGreedIndex: fetchFearGreedIndex,
  fetchCoinGeckoMacro: fetchCoinGeckoMacro,
  fetchBinanceOpenInterest: fetchBinanceOpenInterest,
  fetchBinanceFundingRate: fetchBinanceFundingRate,
  saveNews: saveNews,
  saveMacroData: saveMacroData,
  loadMacroData: loadMacroData,
  getMacroSummary: getMacroSummary
};
