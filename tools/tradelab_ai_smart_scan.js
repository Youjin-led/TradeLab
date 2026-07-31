/**
 * TradeLab Smart AI Scan
 *
 * Умный скан с приоритизацией:
 * 1. Приоритизирует пары по важности (открытые позиции, инкубация, PnL)
 * 2. Анализирует топ-10 пар (вместо 45) — укладывается в rate limit
 * 3. Кэширует результаты 30 минут
 * 4. Multi-timeframe: 1h + 4h для каждой пары
 * 5. Агрегированный dashboard
 *
 * Usage:
 *   node tools/tradelab_ai_smart_scan.js
 *   node tools/tradelab_ai_smart_scan.js --top=5
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
var aiDecider = require('./tradelab_ai_decider');
var aiValidator = require('./tradelab_ai_validator');
var improvements = require('./tradelab_ai_improvements');
var contextBuilder = require('./tradelab_ai_context_builder');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');

async function fetchCandles(symbol, interval, limit) {
  limit = limit || 100;
  var url = 'https://api.binance.com/api/v3/klines?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
  var response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Binance ' + response.status);
  var data = await response.json();
  return data.map(function(k) {
    return {
      timestamp: new Date(k[0]).toISOString().replace('T', ' ').substring(0, 16),
      open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    };
  });
}

async function analyzeWithCache(symbol, interval, cache) {
  var cacheKey = symbol + ':' + interval;

  // Check cache
  if (improvements.isCacheValid(cache, cacheKey)) {
    return { ...cache[cacheKey], fromCache: true };
  }

  // Fetch candles
  var candles = await fetchCandles(symbol, interval, 100);

  // Get previous decisions for context
  var decisionsPath = path.join(ROOT, 'tradelab-ai-decisions.json');
  var previousDecisions = [];
  try {
    if (fs.existsSync(decisionsPath)) {
      var allDecisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
      previousDecisions = allDecisions.filter(function (d) {
        return d.symbol === symbol && d.interval === interval;
      });
    }
  } catch (e) {}

  // AI decision
  var aiResult = await aiDecider.decide(symbol, interval, candles);

  // Classical signal
  var closes = candles.map(function (c) { return c.close; });
  var idx = closes.length - 1;
  var sma20 = 0;
  for (var i = idx - 19; i <= idx; i++) sma20 += closes[i];
  sma20 /= 20;
  var classical = 'HOLD';
  if (idx > 0) {
    var prevSma20 = 0;
    for (var i = idx - 20; i < idx; i++) prevSma20 += closes[i];
    prevSma20 /= 20;
    if (closes[idx] > sma20 && closes[idx - 1] <= prevSma20) classical = 'BUY';
    if (closes[idx] < sma20 && closes[idx - 1] >= prevSma20) classical = 'SELL';
  }

  // Merge
  var merged = aiValidator.processDecision(aiResult, { action: classical, price: closes[idx] }, symbol, interval);

  // Build indicators for dashboard
  var indicators = contextBuilder.buildIndicators(candles);

  var result = {
    symbol: symbol,
    interval: interval,
    decision: merged.decision,
    confidence: merged.confidence,
    source: merged.source,
    reasoning: merged.reasoning.substring(0, 200),
    aiDecision: aiResult.decision,
    aiConfidence: aiResult.confidence,
    classical: classical,
    latencyMs: aiResult.latencyMs,
    price: closes[idx],
    indicators: {
      rsi: indicators.rsi14,
      adx: indicators.adx14,
      trend: indicators.trendDirection,
      atrPct: indicators.atrPct,
      volRatio: indicators.volumeRatio
    },
    params: merged.params,
    timestamp: new Date().toISOString(),
    fromCache: false
  };

  // Save to cache
  cache[cacheKey] = result;
  return result;
}

async function main() {
  // Parse args
  var maxPairs = 10;
  process.argv.slice(2).forEach(function (arg) {
    if (arg.startsWith('--top=')) maxPairs = parseInt(arg.split('=')[1]) || 10;
  });

  // Load candidates from incubation state
  var candidates = {};
  try {
    var statePath = path.join(ROOT, 'tradelab-incubation-state.json');
    if (fs.existsSync(statePath)) {
      var state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      candidates = state.candidates || {};
    }
  } catch (e) {
    console.error('Cannot load incubation state:', e.message);
    return;
  }

  // Load cache
  var cache = improvements.loadCache();

  // Prioritize
  var topPairs = improvements.selectTopPairs(candidates, maxPairs);

  console.log('=== Smart AI Scan: топ-' + topPairs.length + ' из ' + Object.keys(candidates).length + ' кандидатов ===');
  console.log('Time: ' + new Date().toISOString());
  console.log('');

  // Log priorities
  topPairs.forEach(function (p, i) {
    console.log((i + 1) + '. ' + p.key + ' (priority=' + p.priority + ', status=' + p.candidate.status + ')');
  });
  console.log('');

  // Analyze
  var results = [];
  for (var i = 0; i < topPairs.length; i++) {
    var p = topPairs[i];
    process.stdout.write('[' + (i + 1) + '/' + topPairs.length + '] ' + p.symbol + ' ' + p.interval + '... ');

    try {
      var result = await analyzeWithCache(p.symbol, p.interval, cache);
      results.push(result);

      var icon = result.decision === 'BUY' ? '🟢' : result.decision === 'SELL' ? '🔴' : '⚪';
      var cacheTag = result.fromCache ? ' [cached]' : '';
      console.log(icon + ' ' + result.decision + ' (' + result.confidence + '%)' + cacheTag + ' ' + result.latencyMs + 'ms');
    } catch (err) {
      console.log('❌ ERROR: ' + err.message);
      results.push({
        symbol: p.symbol, interval: p.interval,
        decision: 'ERROR', confidence: 0, source: 'error',
        reasoning: err.message
      });
    }

    // Small delay
    await new Promise(function (r) { setTimeout(r, 300); });
  }

  // Save cache
  improvements.saveCache(cache);

  // Dashboard
  var dashboard = improvements.buildDashboard(results);
  console.log('');
  console.log('=== DASHBOARD ===');
  console.log(dashboard.summary);
  console.log('');

  if (dashboard.topOpportunities.length > 0) {
    console.log('=== TOP OPPORTUNITIES ===');
    dashboard.topOpportunities.forEach(function (opp) {
      console.log('  ' + opp);
    });
    console.log('');
  }

  // Save dashboard
  var dashboardPath = path.join(ROOT, 'tradelab-ai-dashboard.json');
  fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2), 'utf8');
  console.log('Dashboard saved to tradelab-ai-dashboard.json');
  console.log('Rate limit: ' + JSON.stringify(aiDecider.getRateLimitInfo()));
}

main().catch(function (err) { console.error('Fatal:', err); process.exit(1); });
