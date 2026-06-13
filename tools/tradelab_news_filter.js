/**
 * TradeLab News Filter
 *
 * Integrates news sentiment into trading decisions.
 * Provides functions to check if news conditions are favorable for entry.
 *
 * Paper-only research tool. Does not place orders.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NEWS_IMPACT_PATH = path.join(ROOT, 'tradelab-news-impact.json');

/**
 * Load the latest news impact data.
 * @returns {Object|null} News impact data or null if unavailable
 */
function loadNewsImpact() {
  try {
    if (!fs.existsSync(NEWS_IMPACT_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(NEWS_IMPACT_PATH, 'utf8'));
    return data;
  } catch {
    return null;
  }
}

/**
 * Get recent news sentiment for a specific symbol.
 *
 * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
 * @param {number} hoursBack - How many hours back to look (default 24)
 * @returns {Object|null} { score, positive, negative, events, label } or null
 */
function getSymbolSentiment(symbol, hoursBack = 24) {
  const data = loadNewsImpact();
  if (!data || !data.events) return null;

  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const relevant = data.events.filter((event) => {
    const eventTime = new Date(event.publishedAt).getTime();
    return event.symbol === symbol && eventTime >= cutoff;
  });

  if (relevant.length === 0) return null;

  const totalScore = relevant.reduce((sum, event) => sum + event.sentiment.score, 0);
  const positive = relevant.filter((event) => event.sentiment.score > 0).length;
  const negative = relevant.filter((event) => event.sentiment.score < 0).length;

  return {
    score: totalScore,
    positive,
    negative,
    events: relevant.length,
    label: totalScore > 0 ? 'positive' : totalScore < 0 ? 'negative' : 'neutral',
    details: relevant.slice(0, 5).map((event) => ({
      title: event.title,
      source: event.source,
      sentiment: event.sentiment.score,
      publishedAt: event.publishedAt
    }))
  };
}

/**
 * Get overall market sentiment across all tracked symbols.
 *
 * @param {number} hoursBack - How many hours back to look (default 24)
 * @returns {Object} { score, positive, negative, total, symbols }
 */
function getMarketSentiment(hoursBack = 24) {
  const data = loadNewsImpact();
  if (!data || !data.events) {
    return { score: 0, positive: 0, negative: 0, total: 0, symbols: {} };
  }

  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const recent = data.events.filter((event) => new Date(event.publishedAt).getTime() >= cutoff);

  const bySymbol = {};
  for (const event of recent) {
    if (!bySymbol[event.symbol]) bySymbol[event.symbol] = { score: 0, count: 0, positive: 0, negative: 0 };
    bySymbol[event.symbol].score += event.sentiment.score;
    bySymbol[event.symbol].count += 1;
    if (event.sentiment.score > 0) bySymbol[event.symbol].positive += 1;
    if (event.sentiment.score < 0) bySymbol[event.symbol].negative += 1;
  }

  const totalScore = recent.reduce((sum, event) => sum + event.sentiment.score, 0);
  const positive = recent.filter((event) => event.sentiment.score > 0).length;
  const negative = recent.filter((event) => event.sentiment.score < 0).length;

  return {
    score: totalScore,
    positive,
    negative,
    total: recent.length,
    symbols: bySymbol
  };
}

/**
 * Check if news conditions allow entry for a given symbol.
 *
 * @param {string} symbol - Trading symbol
 * @param {Object} options - Threshold options
 * @param {number} options.maxNegativeScore - Maximum allowed negative sentiment score (default -2)
 * @param {number} options.hoursBack - Lookback window in hours (default 12)
 * @returns {Object} { allowed, reason, sentiment }
 */
function shouldAllowEntry(symbol, options = {}) {
  const opts = {
    maxNegativeScore: options.maxNegativeScore || -2,
    hoursBack: options.hoursBack || 12,
    ...options
  };

  const sentiment = getSymbolSentiment(symbol, opts.hoursBack);

  // No news data available — allow entry
  if (!sentiment) {
    return { allowed: true, reason: 'no recent news data', sentiment: null };
  }

  // Strong negative sentiment — block entry
  if (sentiment.score <= opts.maxNegativeScore) {
    return {
      allowed: false,
      reason: `news sentiment ${sentiment.score} (${sentiment.label}) exceeds threshold ${opts.maxNegativeScore}`,
      sentiment
    };
  }

  // Mixed sentiment with more negative than positive — caution
  if (sentiment.negative > sentiment.positive && sentiment.negative >= 2) {
    return {
      allowed: true,
      reason: `caution: ${sentiment.negative} negative vs ${sentiment.positive} positive news events`,
      sentiment
    };
  }

  return { allowed: true, reason: 'news sentiment favorable', sentiment };
}

/**
 * Get the recommended risk adjustment based on news sentiment.
 *
 * @param {string} symbol - Trading symbol
 * @returns {Object} { riskMultiplier, stopMultiplier, reason }
 */
function getNewsRiskAdjustment(symbol) {
  const sentiment = getSymbolSentiment(symbol, 24);

  if (!sentiment) {
    return { riskMultiplier: 1.0, stopMultiplier: 1.0, reason: 'no news data' };
  }

  // Negative news — reduce risk, widen stops
  if (sentiment.score < -3) {
    return {
      riskMultiplier: 0.5,
      stopMultiplier: 1.5,
      reason: `negative news sentiment ${sentiment.score}: reducing risk 50%, widening stops 50%`
    };
  }

  if (sentiment.score < -1) {
    return {
      riskMultiplier: 0.75,
      stopMultiplier: 1.25,
      reason: `slightly negative news sentiment ${sentiment.score}: reducing risk 25%, widening stops 25%`
    };
  }

  // Positive news — normal risk
  if (sentiment.score > 3) {
    return {
      riskMultiplier: 1.0,
      stopMultiplier: 1.0,
      reason: `positive news sentiment ${sentiment.score}: normal risk`
    };
  }

  return { riskMultiplier: 1.0, stopMultiplier: 1.0, reason: 'neutral news sentiment' };
}

/**
 * Get a summary of recent news events for the report.
 *
 * @param {number} limit - Max events to return (default 10)
 * @returns {Array} Recent news events
 */
function getRecentNews(limit = 10) {
  const data = loadNewsImpact();
  if (!data || !data.events) return [];
  return data.events.slice(0, limit).map((event) => ({
    time: event.publishedAt,
    symbol: event.symbol,
    sentiment: event.sentiment.label,
    score: event.sentiment.score,
    source: event.source,
    title: event.title
  }));
}

module.exports = {
  loadNewsImpact,
  getSymbolSentiment,
  getMarketSentiment,
  shouldAllowEntry,
  getNewsRiskAdjustment,
  getRecentNews
};
