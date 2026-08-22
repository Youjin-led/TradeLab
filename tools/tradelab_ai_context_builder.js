/**
 * TradeLab AI Context Builder
 *
 * Собирает все рыночные данные в структурированный объект для LLM.
 * Включает: индикаторы, фазу рынка, Fear&Greed, funding, новости, портфель.
 *
 * Paper-only research tool. Не размещает реальные ордера.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// ===== INDICATOR FUNCTIONS =====

function sma(values, period, index) {
  if (index < period - 1) return null;
  var sum = 0;
  for (var i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

function ema(values, period, index) {
  if (index < period - 1) return null;
  var k = 2 / (period + 1);
  var result = values[index - period + 1];
  for (var i = index - period + 2; i <= index; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values, period, index) {
  if (index < period) return 50;
  var gains = 0, losses = 0;
  for (var i = index - period + 1; i <= index; i++) {
    var d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function calculateATR(candles, period, index) {
  if (!index) index = candles.length - 1;
  if (index < period) return 0;
  var sum = 0;
  for (var i = index - period + 1; i <= index; i++) {
    sum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }
  return sum / period;
}

function calculateADX(candles, period, index) {
  if (!index) index = candles.length - 1;
  if (index < period * 2) return 0;
  var trValues = [], plusDM = [], minusDM = [];
  for (var i = index - period * 2 + 1; i <= index; i++) {
    var high = candles[i].high, low = candles[i].low;
    var prevHigh = candles[i - 1].high, prevLow = candles[i - 1].low;
    var prevClose = candles[i - 1].close;
    var tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
    var pDM = high - prevHigh;
    var mDM = prevLow - low;
    plusDM.push(pDM > mDM && pDM > 0 ? pDM : 0);
    minusDM.push(mDM > pDM && mDM > 0 ? mDM : 0);
  }
  var smoothTR = 0, smoothPDM = 0, smoothMDM = 0;
  for (var i = 0; i < period; i++) {
    smoothTR += trValues[i]; smoothPDM += plusDM[i]; smoothMDM += minusDM[i];
  }
  var diPlus = 0, diMinus = 0;
  if (smoothTR > 0) { diPlus = (smoothPDM / smoothTR) * 100; diMinus = (smoothMDM / smoothTR) * 100; }
  var dxValues = [];
  for (var i = period; i < trValues.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trValues[i];
    smoothPDM = smoothPDM - smoothPDM / period + plusDM[i];
    smoothMDM = smoothMDM - smoothMDM / period + minusDM[i];
    diPlus = smoothTR > 0 ? (smoothPDM / smoothTR) * 100 : 0;
    diMinus = smoothTR > 0 ? (smoothMDM / smoothTR) * 100 : 0;
    var diSum = diPlus + diMinus;
    dxValues.push(diSum > 0 ? Math.abs(diPlus - diMinus) / diSum * 100 : 0);
  }
  if (dxValues.length === 0) return 0;
  var adx = 0;
  for (var i = 0; i < dxValues.length; i++) adx += dxValues[i];
  return adx / dxValues.length;
}

function bollingerBands(closes, period, index, mult) {
  var mid = sma(closes, period, index);
  if (mid === null) return null;
  var sq = 0;
  for (var i = index - period + 1; i <= index; i++) sq += (closes[i] - mid) ** 2;
  var sd = Math.sqrt(sq / period);
  return { upper: mid + sd * mult, mid: mid, lower: mid - sd * mult };
}

function macd(closes, index) {
  var fast = ema(closes, 12, index);
  var slow = ema(closes, 26, index);
  if (fast === null || slow === null) return { line: 0, signal: 0, hist: 0 };
  var macdLine = fast - slow;
  return { line: macdLine, signal: 0, hist: macdLine };
}

// ===== CONTEXT BUILDER =====

/**
 * Собрать индикаторы из свечей.
 */
function buildIndicators(candles) {
  var idx = candles.length - 1;
  var closes = candles.map(function (c) { return c.close; });
  var volumes = candles.map(function (c) { return c.volume; });

  var sma20 = sma(closes, 20, idx);
  var sma50 = sma(closes, 50, idx);
  var ema12 = ema(closes, 12, idx);
  var ema26 = ema(closes, 26, idx);
  var rsi14 = rsi(closes, 14, idx);
  var atr14 = calculateATR(candles, 14, idx);
  var adx14 = calculateADX(candles, 14, idx);
  var bb = bollingerBands(closes, 20, idx, 2);
  var macdVal = macd(closes, idx);
  var price = closes[idx];

  // Объём
  var avgVol = 0;
  for (var i = Math.max(0, idx - 19); i <= idx; i++) avgVol += volumes[i];
  avgVol /= Math.min(20, idx + 1);
  var volRatio = avgVol > 0 ? volumes[idx] / avgVol : 1;

  // Позиция в Bollinger
  var bbPosition = 'middle';
  if (bb) {
    if (price > bb.upper) bbPosition = 'above-upper';
    else if (price > bb.mid) bbPosition = 'above-mid';
    else if (price < bb.lower) bbPosition = 'below-lower';
    else if (price < bb.mid) bbPosition = 'below-mid';
  }

  return {
    price: price,
    sma20: sma20 ? +sma20.toFixed(6) : null,
    sma50: sma50 ? +sma50.toFixed(6) : null,
    ema12: ema12 ? +ema12.toFixed(6) : null,
    ema26: ema26 ? +ema26.toFixed(6) : null,
    rsi14: +rsi14.toFixed(1),
    atr14: atr14 ? +atr14.toFixed(6) : 0,
    atrPct: price > 0 ? +(atr14 / price * 100).toFixed(2) : 0,
    adx14: +adx14.toFixed(1),
    bollinger: bb ? {
      upper: +bb.upper.toFixed(6),
      mid: +bb.mid.toFixed(6),
      lower: +bb.lower.toFixed(6),
      position: bbPosition
    } : null,
    macdLine: +macdVal.line.toFixed(6),
    volumeRatio: +volRatio.toFixed(2),
    trendDirection: sma20 && sma50 ? (sma20 > sma50 ? 'bullish' : 'bearish') : 'unknown'
  };
}

/**
 * Определить фазу рынка.
 */
function detectPhase(candles) {
  var adx = calculateADX(candles, 14, candles.length - 1);
  var atr = calculateATR(candles, 14, candles.length - 1);
  var price = candles[candles.length - 1].close;
  var atrPctVal = price > 0 ? (atr / price) * 100 : 0;
  var closes = candles.map(function (c) { return c.close; });
  var bb = bollingerBands(closes, 20, closes.length - 1, 2);
  var bbWidth = bb ? (bb.upper - bb.lower) / bb.mid * 100 : 5;

  if (adx > 25 && atrPctVal < 5) {
    var slope = (closes[closes.length - 1] - closes[Math.max(0, closes.length - 20)]) / closes[Math.max(0, closes.length - 20)] * 100;
    return slope > 0 ? 'trending-up' : 'trending-down';
  }
  if (atrPctVal > 4) return 'volatile';
  if (adx < 20 && bbWidth < 4) return 'ranging';
  return 'mixed';
}

/**
 * Загрузить макро-данные (Fear&Greed, BTC dominance и т.д.)
 */
function loadMacroData() {
  var macroPath = path.join(ROOT, 'tradelab-macro-data.json');
  try {
    if (fs.existsSync(macroPath)) {
      return JSON.parse(fs.readFileSync(macroPath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

/**
 * Загрузить новостной анализ.
 */
function loadNewsData() {
  var newsPath = path.join(ROOT, 'tradelab-news-impact.json');
  try {
    if (fs.existsSync(newsPath)) {
      return JSON.parse(fs.readFileSync(newsPath, 'utf8'));
    }
  } catch (e) {}
  return null;
}

/**
 * Загрузить состояние портфеля.
 */
function loadPortfolioState() {
  var statePath = path.join(ROOT, 'tradelab-incubation-state.json');
  try {
    if (fs.existsSync(statePath)) {
      var state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return state;
    }
  } catch (e) {}
  return null;
}

/**
 * Собрать контекст для LLM-решения.
 *
 * @param {string} symbol - Торговая пара (например BTCUSDT)
 * @param {string} interval - Интервал (1h, 4h)
 * @param {Array} candles - Массив свечей [{ open, high, low, close, volume, timestamp }]
 * @returns {Object} Структурированный контекст для промпта
 */
function buildContext(symbol, interval, candles, newsParam) {
  var indicators = buildIndicators(candles);
  var phase = detectPhase(candles);
  var macro = loadMacroData();
  var news = newsParam || loadNewsData();
  var portfolio = loadPortfolioState();

  // Последние 10 свечей (для паттернов)
  var recentCandles = candles.slice(-10).map(function (c) {
    return {
      time: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      vol: c.volume
    };
  });

  // Собрать позиции из портфеля
  var positions = [];
  var totalPnl = 0;
  var totalHeat = 0;
  if (portfolio && portfolio.candidates) {
    Object.keys(portfolio.candidates).forEach(function (key) {
      var c = portfolio.candidates[key];
      if (c.paperLedger && c.paperLedger.position) {
        positions.push({
          symbol: c.symbol,
          side: c.paperLedger.position.side,
          entry: c.paperLedger.position.entry,
          stop: c.paperLedger.position.stop,
          take: c.paperLedger.position.take
        });
      }
      if (c.paperLedger) {
        totalPnl += (c.paperLedger.balance || 10000) - 10000;
      }
    });
  }

  // Fear&Greed
  var fearGreed = null;
  if (macro && macro.fearGreed) {
    fearGreed = {
      value: macro.fearGreed.value,
      classification: macro.fearGreed.classification
    };
  }

  // Funding rate
  var fundingRate = null;
  if (macro && macro.fundingRates && macro.fundingRates[symbol]) {
    fundingRate = macro.fundingRates[symbol];
  }

  // Новости по символу
  var symbolNews = null;
  if (news && news.impacts) {
    var relevant = news.impacts.filter(function (n) {
      return n.symbol === symbol || n.symbol === symbol.replace('USDT', '');
    }).slice(0, 5);
    if (relevant.length > 0) {
      symbolNews = relevant.map(function (n) {
        return { headline: n.headline, sentiment: n.sentiment, score: n.score };
      });
    }
  }

  // Уровни поддержки/сопротивления (50 свечей)
  var high50 = 0, low50 = Infinity;
  var idx50 = Math.max(0, candles.length - 50);
  for (var i = idx50; i < candles.length; i++) {
    if (candles[i].high > high50) high50 = candles[i].high;
    if (candles[i].low < low50) low50 = candles[i].low;
  }

  return {
    symbol: symbol,
    interval: interval,
    timestamp: new Date().toISOString(),
    indicators: indicators,
    marketPhase: phase,
    recentCandles: recentCandles,
    fearGreed: fearGreed,
    fundingRate: fundingRate,
    news: symbolNews,
    support: low50,
    resistance: high50,
    portfolio: {
      openPositions: positions,
      totalPnl: +totalPnl.toFixed(2),
      positionCount: positions.length,
      maxPositions: 3
    }
  };
}

/**
 * Сформировать промпт для LLM.
 */
function buildPrompt(context) {
  var supportVal = context.support || 0;
  var resistanceVal = context.resistance || 0;

  var posDesc = 'Нет открытых позиций';
  if (context.portfolio.openPositions.length > 0) {
    posDesc = context.portfolio.openPositions.map(function (p) {
      return p.symbol + ' ' + p.side + ' entry=' + p.entry;
    }).join('; ');
  }

  var newsDesc = 'Нет свежих новостей по символу.';
  if (context.news) {
    newsDesc = context.news.map(function (n) {
      return '[' + n.sentiment + ' score=' + n.score + '] ' + n.headline;
    }).join('\n');
  }

  var fearGreedDesc = 'Нет данных';
  if (context.fearGreed) {
    fearGreedDesc = context.fearGreed.value + ' (' + context.fearGreed.classification + ')';
  }

  var fundingDesc = 'Нет данных';
  if (context.fundingRate !== null && context.fundingRate !== undefined) {
    fundingDesc = context.fundingRate + '%';
  }

  var prompt =
    'You are a professional crypto futures trader analyzing a single trading pair.\n' +
    'Give a decisive BUY or SELL call whenever the indicators align; HOLD only when data is genuinely neutral or conflicting.\n\n' +

    'PAIR: ' + context.symbol + ' ' + context.interval + '\n' +
    'LAST PRICE: ' + context.indicators.price + '\n\n' +

    'INDICATORS:\n' +
    'RSI14=' + context.indicators.rsi14 + ' (overbought > 70, oversold < 30)\n' +
    'MACD line=' + context.indicators.macdLine + ' (positive = bullish momentum)\n' +
    'ADX14=' + context.indicators.adx14 + ' (trend strength: < 20 weak/choppy, > 25 trending)\n' +
    'ATR=' + context.indicators.atrPct + '% ' +
    'SMA20=' + context.indicators.sma20 + ' SMA50=' + context.indicators.sma50 + '\n' +
    'Trend=' + context.indicators.trendDirection + '\n' +
    'Volume ratio=' + context.indicators.volumeRatio + 'x of 20-bar average\n' +
    (context.indicators.bollinger ?
      'Bollinger pos=' + context.indicators.bollinger.position + '\n' : '') +
    'Support=' + supportVal.toFixed(6) + ' Resistance=' + resistanceVal.toFixed(6) + '\n\n' +

    'MARKET: phase=' + context.marketPhase + ' | Fear&Greed=' + fearGreedDesc + ' | Funding=' + fundingDesc + '\n' +
    'NEWS: ' + newsDesc + '\n\n' +

    'RECENT CANDLES (last 5):\n' +
    context.recentCandles.slice(-5).map(function (c) {
      return c.time + ' O:' + c.open + ' H:' + c.high + ' L:' + c.low + ' C:' + c.close;
    }).join('\n') + '\n\n' +

    'PORTFOLIO: open positions=' + context.portfolio.positionCount + '/' + context.portfolio.maxPositions +
    ' | total PnL=$' + context.portfolio.totalPnl + '\n' +
    'Open positions: ' + posDesc + '\n\n' +

    'DECISION RULES:\n' +
    '1. BUY when at least 2 of these confirm bullish: price above SMA20 and SMA50, rising trend, MACD > 0, RSI 45-65 ticking up, breakout above nearest resistance.\n' +
    '2. SELL when at least 2 of these confirm bearish: price below SMA20 and SMA50, falling trend, MACD < 0, RSI 35-55 ticking down, breakdown below nearest support.\n' +
    '3. HOLD only when indicators conflict or trend is clearly absent (ADX < 18).\n' +
    '4. HARD BLOCK — do not fight a strong trend. If ADX >= 40 AND SMA20 > SMA50, then SELL is FORBIDDEN: you MUST set "decision":"HOLD". ' +
    'If ADX >= 40 AND SMA20 < SMA50, then BUY is FORBIDDEN: you MUST set "decision":"HOLD". ' +
    'If ADX > 25 and price is above SMA50, also avoid SELL. Never output a BUY/SELL that opposes a strong prevailing trend.\n' +
    '5. Use the full 0-100 confidence range: 51-70 moderate signal, 71-100 strong confirmation.\n' +
    '6. Set stopPct per ATR regime (tight 2.5-3.5 for calm, wider 4.0-5.0 for volatile), takePct 1.5-2x the stop, riskPct 0.3-1.0.\n' +
    '7. If portfolio is full (3 positions) or you already hold this pair, prefer HOLD.\n\n' +

    'Respond with strict JSON only (no markdown, no comments):\n' +
    '{"decision":"BUY|SELL|HOLD","confidence":0-100,"reasoning":"brief multi-factor reasoning","stopPct":2.5-5.0,"takePct":3.0-8.0,"riskPct":0.3-1.0}\n' +
    'IMPORTANT: "decision" MUST be consistent with rule 4. If a BUY/SELL violates rule 4, set "decision":"HOLD".\n';

  return prompt;
}

/**
 * Получить рыночный контекст (замена новостям).
 * Использует CoinGecko global данные (free, no key, работает).
 */
function fetchNews(symbol) {
  var baseSymbol = (symbol || '').replace('USDT', '').toLowerCase();

  return Promise.all([
    fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(5000) })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.data || {}; })
      .catch(function () { return {}; }),
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true', { signal: AbortSignal.timeout(5000) })
      .then(function (r) { return r.json(); })
      .catch(function () { return {}; })
  ]).then(function (results) {
    var globalData = results[0];
    var prices = results[1];
    var result = [];

    // Top coins 24h change
    var coins = {
      bitcoin: prices.bitcoin,
      ethereum: prices.ethereum,
      solana: prices.solana
    };

    var coinNames = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL' };
    Object.keys(coins).forEach(function (id) {
      var c = coins[id];
      if (c && c.usd_24h_change !== undefined) {
        var change = c.usd_24h_change.toFixed(1);
        var sentiment = change > 0 ? 'bullish' : 'bearish';
        result.push({
          headline: id.charAt(0).toUpperCase() + id.slice(1) + ' 24h: ' + change + '%',
          sentiment: sentiment,
          score: change > 2 ? 2 : (change < -2 ? -2 : (change > 0 ? 1 : -1)),
          source: 'CoinGecko',
          date: new Date().toISOString().substring(0, 10)
        });
      }
    });

    // Market-wide stats
    if (globalData.total_market_cap && globalData.total_market_cap.usd) {
      var btcDom = globalData.market_cap_percentage ? globalData.market_cap_percentage.btc : 0;
      result.push({
        headline: 'Total market cap: $' + (globalData.total_market_cap.usd / 1e12).toFixed(2) + 'T | BTC dominance: ' + btcDom.toFixed(1) + '%',
        sentiment: 'neutral', score: 0,
        source: 'CoinGecko', date: new Date().toISOString().substring(0, 10)
      });
    }

    return result;
  });
}

module.exports = {
  buildContext: buildContext,
  buildPrompt: buildPrompt,
  buildIndicators: buildIndicators,
  detectPhase: detectPhase,
  fetchNews: fetchNews
};
