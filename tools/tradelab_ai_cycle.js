/**
 * TradeLab AI Cycle
 *
 * Полный цикл AI-анализа: сбор данных → LLM → валидация → merge → лог.
 * Можно запускать вручную или через cloud agent.
 *
 * Usage:
 *   node tools/tradelab_ai_cycle.js BTCUSDT 1h
 *   node tools/tradelab_ai_cycle.js --all
 *
 * Paper-only research tool. Не размещает реальные ордера.
 */

var contextBuilder = require('./tradelab_ai_context_builder');
var aiDecider = require('./tradelab_ai_decider');
var aiValidator = require('./tradelab_ai_validator');
var fs = require('fs');
var path = require('path');

// Load .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

var ROOT = path.join(__dirname, '..');

// ===== FETCH CANDLES =====

async function fetchCandles(symbol, interval, limit) {
  limit = limit || 100;
  var url = 'https://data-api.binance.vision/api/v3/klines?symbol=' + symbol +
    '&interval=' + interval + '&limit=' + limit;

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 15000);

  try {
    var response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Binance API ' + response.status);
    var data = await response.json();

    return data.map(function (k) {
      return {
        timestamp: new Date(k[0]).toISOString().replace('T', ' ').substring(0, 16),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      };
    });
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error('Failed to fetch candles for ' + symbol + ': ' + err.message);
  }
}

// ===== CLASSICAL SIGNAL (simplified) =====

function classicalSignal(candles) {
  var closes = candles.map(function (c) { return c.close; });
  var idx = closes.length - 1;
  if (idx < 20) return { action: 'WAIT', price: closes[idx] };

  var sma20 = 0;
  for (var i = idx - 19; i <= idx; i++) sma20 += closes[i];
  sma20 /= 20;

  var price = closes[idx];
  var prevPrice = closes[idx - 1];
  var prevSma = 0;
  for (var i = idx - 20; i < idx; i++) prevSma += closes[i];
  prevSma /= 20;

  // Кроссовер
  if (prevPrice <= prevSma && price > sma20) return { action: 'BUY', price: price, reason: 'SMA20 crossup' };
  if (prevPrice >= prevSma && price < sma20) return { action: 'SELL', price: price, reason: 'SMA20 crossdown' };

  return { action: 'WAIT', price: price };
}

// ===== MAIN =====

async function runAICycle(symbol, interval) {
  console.log('=== AI Cycle: ' + symbol + ' ' + interval + ' ===');
  console.log('Time: ' + new Date().toISOString());

  // 1. Fetch candles
  console.log('\n[1/5] Fetching candles...');
  var candles;
  try {
    candles = await fetchCandles(symbol, interval, 100);
    console.log('  Got ' + candles.length + ' candles, last: ' + candles[candles.length - 1].close);
  } catch (err) {
    console.error('  ERROR: ' + err.message);
    return { error: err.message };
  }

  // 2. Classical signal
  console.log('\n[2/5] Classical signal...');
  var classical = classicalSignal(candles);
  console.log('  Signal: ' + classical.action + ' ($' + classical.price + ')' + (classical.reason ? ' [' + classical.reason + ']' : ''));

  // 3. AI decision
  console.log('\n[3/5] AI analysis...');
  var aiResult = await aiDecider.decide(symbol, interval, candles);
  console.log('  AI: ' + aiResult.decision + ' (confidence: ' + aiResult.confidence + '%)');
  console.log('  Source: ' + aiResult.source + ' | Latency: ' + aiResult.latencyMs + 'ms');
  console.log('  Reasoning: ' + aiResult.reasoning);

  // 4. Merge
  console.log('\n[4/5] Merging signals...');
  var merged = aiValidator.processDecision(aiResult, classical, symbol, interval);
  console.log('  FINAL: ' + merged.decision + ' (confidence: ' + merged.confidence + '%)');
  console.log('  Source: ' + merged.source);
  console.log('  Reasoning: ' + merged.reasoning);

  // 5. Rate limit
  var rateInfo = aiDecider.getRateLimitInfo();
  console.log('\n[5/5] Rate limit: ' + rateInfo.used + '/' + rateInfo.max);

  console.log('\n=== Result ===');
  console.log(JSON.stringify(merged, null, 2));

  return {
    symbol: symbol,
    interval: interval,
    classical: classical,
    ai: aiResult,
    merged: merged,
    timestamp: new Date().toISOString()
  };
}

async function runAllPairs() {
  var pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  var intervals = ['1h', '4h'];
  var results = [];

  for (var i = 0; i < pairs.length; i++) {
    for (var j = 0; j < intervals.length; j++) {
      try {
        var result = await runAICycle(pairs[i], intervals[j]);
        results.push(result);
        await new Promise(function (r) { setTimeout(r, 1000); }); // пауза между запросами
      } catch (err) {
        console.error('Error for ' + pairs[i] + ' ' + intervals[j] + ': ' + err.message);
      }
    }
  }

  return results;
}

// ===== CLI =====

if (require.main === module) {
  var args = process.argv.slice(2);

  if (args[0] === '--all') {
    runAllPairs().then(function () {
      console.log('\nAll pairs analyzed.');
    }).catch(function (err) {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
  } else if (args.length >= 2) {
    runAICycle(args[0], args[1]).catch(function (err) {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node tools/tradelab_ai_cycle.js BTCUSDT 1h');
    console.log('  node tools/tradelab_ai_cycle.js --all');
  }
}

module.exports = { runAICycle: runAICycle, runAllPairs: runAllPairs };
