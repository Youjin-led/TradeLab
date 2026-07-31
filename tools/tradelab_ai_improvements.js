/**
 * TradeLab AI Improvements
 *
 * Оптимизации:
 * 1. Умный приоритизированный скан (топ-10 пар, не все 45)
 * 2. Улучшенный промпт с контекстом предыдущих решений
 * 3. Кэширование результатов (не переспрашивать каждые 5 мин)
 * 4. Multi-timeframe анализ (1h + 4h вместе)
 * 5. Агрегированный dashboard
 */

var contextBuilder = require('./tradelab_ai_context_builder');
var aiDecider = require('./tradelab_ai_decider');
var aiValidator = require('./tradelab_ai_validator');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

// ===== SMART PAIR PRIORITIZATION =====

/**
 * Определить приоритет пары для анализа.
 * Чем выше приоритет, тем раньше анализируем.
 */
function getPairPriority(symbol, candidate) {
  var score = 0;

  // 1. Открытая позиция — высший приоритет
  if (candidate.paperLedger && candidate.paperLedger.position && candidate.paperLedger.position.side) {
    score += 100;
  }

  // 2. Активная инкубация
  if (candidate.status === 'incubating') {
    score += 50;
  }

  // 3. Готов к.review
  if (candidate.status === 'ready-for-review') {
    score += 80;
  }

  // 4. Positивный forward PnL
  if (candidate.forwardPaperPnl > 0) {
    score += 30;
  }

  // 5. Здоровый score
  if (candidate.health && candidate.health.score >= 70) {
    score += 20;
  }

  // 6. Последний анализ был давно
  if (candidate.lastAiAnalysis) {
    var hoursSince = (Date.now() - new Date(candidate.lastAiAnalysis).getTime()) / 3600000;
    if (hoursSince > 4) score += 25;
    if (hoursSince > 8) score += 15;
  } else {
    score += 30; // Никогда не анализировали
  }

  // 7. Негативные алерты — нужно пересмотреть
  if (candidate.alerts && candidate.alerts.length > 0) {
    score += 40;
  }

  return score;
}

/**
 * Выбрать топ-N пар для анализа.
 */
function selectTopPairs(candidates, maxPairs) {
  maxPairs = maxPairs || 10;

  var pairs = [];
  Object.keys(candidates).forEach(function (key) {
    var c = candidates[key];
    // Пропускаем rejected и quarantined
    if (c.status === 'rejected' || (c.quarantine && c.quarantine.active)) return;

    var parts = key.split(':');
    var priority = getPairPriority(key, c);
    pairs.push({
      key: key,
      symbol: parts[0],
      interval: parts[1],
      strategy: parts[2],
      priority: priority,
      candidate: c
    });
  });

  // Сортировка по приоритету (убывание)
  pairs.sort(function (a, b) { return b.priority - a.priority; });

  return pairs.slice(0, maxPairs);
}

// ===== CACHE =====

var CACHE_PATH = path.join(ROOT, 'tradelab-ai-cache.json');
var CACHE_TTL_MS = 30 * 60 * 1000; // 30 минут

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

function isCacheValid(cache, key) {
  if (!cache[key]) return false;
  return (Date.now() - cache[key].timestamp) < CACHE_TTL_MS;
}

// ===== ENHANCED PROMPT =====

/**
 * Улучшенный промпт с контекстом предыдущих решений.
 */
function buildEnhancedPrompt(context, previousDecisions) {
  var base = contextBuilder.buildPrompt(context);

  // Добавить историю предыдущих решений
  if (previousDecisions && previousDecisions.length > 0) {
    base += '\n=== ПРЕДЫДУЩИЕ РЕШЕНИЯ (последние 5) ===\n';
    previousDecisions.slice(-5).forEach(function (d) {
      base += d.timestamp + ': ' + d.decision + ' (' + d.confidence + '%) — ' + d.reasoning.substring(0, 100) + '\n';
    });
    base += '\nУчитывай тренд предыдущих решений.\n';
  }

  // Добавить multi-timeframe контекст
  if (context.multiTimeframe) {
    base += '\n=== MULTI-TIMEFRAME АНАЛИЗ ===\n';
    Object.keys(context.multiTimeframe).forEach(function (tf) {
      var ind = context.multiTimeframe[tf];
      base += tf + ': RSI=' + ind.rsi14 + ' ADX=' + ind.adx14 + ' Trend=' + ind.trendDirection + '\n';
    });
  }

  return base;
}

// ===== MULTI-TIMEFRAME ANALYSIS =====

/**
 * Собрать данные с нескольких таймфреймов.
 */
async function buildMultiTimeframe(symbol, intervals, fetchCandlesFn) {
  var result = {};
  for (var i = 0; i < intervals.length; i++) {
    try {
      var candles = await fetchCandlesFn(symbol, intervals[i], 100);
      result[intervals[i]] = contextBuilder.buildIndicators(candles);
    } catch (e) {
      // Тихий fail
    }
  }
  return result;
}

// ===== AGGREGATED DASHBOARD =====

/**
 * Создать агрегированный dashboard.
 */
function buildDashboard(results) {
  var buys = results.filter(function (r) { return r.decision === 'BUY' && r.confidence >= 65; });
  var sells = results.filter(function (r) { return r.decision === 'SELL' && r.confidence >= 65; });
  var holds = results.filter(function (r) { return r.decision === 'HOLD'; });
  var rateLimited = results.filter(function (r) { return r.source && r.source.indexOf('rate-limit') >= 0; });

  var avgConfidence = 0;
  var count = 0;
  results.forEach(function (r) {
    if (r.confidence > 0) { avgConfidence += r.confidence; count++; }
  });
  avgConfidence = count > 0 ? Math.round(avgConfidence / count) : 0;

  // Market mood
  var mood = 'NEUTRAL';
  if (buys.length > sells.length + 2) mood = 'BULLISH';
  if (sells.length > buys.length + 2) mood = 'BEARISH';

  // Top opportunities
  var opportunities = results.filter(function (r) {
    return r.confidence >= 70 && (r.decision === 'BUY' || r.decision === 'SELL');
  }).sort(function (a, b) { return b.confidence - a.confidence; }).slice(0, 5);

  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    buys: buys.length,
    sells: sells.length,
    holds: holds.length,
    rateLimited: rateLimited.length,
    avgConfidence: avgConfidence,
    marketMood: mood,
    topOpportunities: opportunities.map(function (r) {
      return r.symbol + ' ' + r.interval + ' ' + r.decision + ' (' + r.confidence + '%)';
    }),
    summary: mood + ' | ' + buys.length + ' BUY / ' + sells.length + ' SELL / ' + holds.length + ' HOLD | Avg conf: ' + avgConfidence + '%'
  };
}

module.exports = {
  getPairPriority: getPairPriority,
  selectTopPairs: selectTopPairs,
  loadCache: loadCache,
  saveCache: saveCache,
  isCacheValid: isCacheValid,
  buildEnhancedPrompt: buildEnhancedPrompt,
  buildMultiTimeframe: buildMultiTimeframe,
  buildDashboard: buildDashboard
};
