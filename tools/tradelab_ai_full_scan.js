/**
 * TradeLab Full AI Scan
 * Анализирует все пары из incubation state через DeepSeek.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
var aiDecider = require('./tradelab_ai_decider');
var aiValidator = require('./tradelab_ai_validator');

var ROOT = require('path').join(__dirname, '..');

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

async function analyzeOne(symbol, interval) {
  try {
    var candles = await fetchCandles(symbol, interval, 100);
    var result = await aiDecider.decide(symbol, interval, candles);
    return {
      symbol: symbol, interval: interval,
      decision: result.decision, confidence: result.confidence,
      source: result.source, latencyMs: result.latencyMs,
      reasoning: result.reasoning.substring(0, 150),
      params: result.params
    };
  } catch (err) {
    return {
      symbol: symbol, interval: interval,
      decision: 'ERROR', confidence: 0,
      source: 'error', latencyMs: 0,
      reasoning: err.message.substring(0, 100),
      params: null
    };
  }
}

async function main() {
  var pairs = [
    'BTCUSDT:1h', 'BTCUSDT:4h',
    'ETHUSDT:1h', 'ETHUSDT:4h',
    'SOLUSDT:1h', 'SOLUSDT:4h',
    'BNBUSDT:1h', 'BNBUSDT:4h',
    'XRPUSDT:1h', 'XRPUSDT:4h',
    'DOGEUSDT:1h', 'DOGEUSDT:4h',
    'ADAUSDT:1h', 'ADAUSDT:4h',
    'LINKUSDT:1h', 'LINKUSDT:4h',
    'AVAXUSDT:1h', 'AVAXUSDT:4h',
    'DOTUSDT:1h', 'DOTUSDT:4h',
    'SUIUSDT:1h', 'SUIUSDT:4h',
    'LTCUSDT:1h', 'LTCUSDT:4h',
    'NEARUSDT:1h', 'NEARUSDT:4h',
    'INJUSDT:1h', 'INJUSDT:4h',
    'ARBUSDT:1h', 'ARBUSDT:4h',
    'OPUSDT:1h', 'OPUSDT:4h',
    'RENDERUSDT:1h', 'RENDERUSDT:4h',
    'TIAUSDT:1h', 'TIAUSDT:4h',
    'SEIUSDT:1h', 'SEIUSDT:4h',
    'FILUSDT:1h', 'FILUSDT:4h',
    'JUPUSDT:1h', 'JUPUSDT:4h',
    'ATOMUSDT:1h', 'BCHUSDT:1h', 'TRXUSDT:1h'
  ];

  console.log('=== Full AI Scan: ' + pairs.length + ' pairs ===');
  console.log('Time: ' + new Date().toISOString());
  console.log('');

  var results = [];
  for (var i = 0; i < pairs.length; i++) {
    var parts = pairs[i].split(':');
    process.stdout.write('[' + (i+1) + '/' + pairs.length + '] ' + parts[0] + ' ' + parts[1] + '... ');
    var r = await analyzeOne(parts[0], parts[1]);
    results.push(r);
    var icon = r.decision === 'BUY' ? '🟢' : r.decision === 'SELL' ? '🔴' : r.decision === 'ERROR' ? '❌' : '⚪';
    console.log(icon + ' ' + r.decision + ' (' + r.confidence + '%) ' + r.latencyMs + 'ms');
    // Small delay to avoid rate limits
    await new Promise(function(resolve) { setTimeout(resolve, 500); });
  }

  // Summary
  var buys = results.filter(function(r) { return r.decision === 'BUY'; });
  var sells = results.filter(function(r) { return r.decision === 'SELL'; });
  var holds = results.filter(function(r) { return r.decision === 'HOLD'; });
  var errors = results.filter(function(r) { return r.decision === 'ERROR'; });

  console.log('');
  console.log('=== SUMMARY ===');
  console.log('BUY:  ' + buys.length + (buys.length > 0 ? ' → ' + buys.map(function(r) { return r.symbol + ' ' + r.confidence + '%'; }).join(', ') : ''));
  console.log('SELL: ' + sells.length + (sells.length > 0 ? ' → ' + sells.map(function(r) { return r.symbol + ' ' + r.confidence + '%'; }).join(', ') : ''));
  console.log('HOLD: ' + holds.length);
  console.log('ERR:  ' + errors.length);

  if (buys.length > 0 || sells.length > 0) {
    console.log('');
    console.log('=== ACTION REQUIRED ===');
    (buys.concat(sells)).forEach(function(r) {
      console.log(r.decision + ' ' + r.symbol + ' ' + r.interval + ' conf=' + r.confidence + '%');
      console.log('  ' + r.reasoning);
      if (r.params) console.log('  Stop=' + r.params.stopPct + '% Take=' + r.params.takePct + '% Risk=' + r.params.riskPct + '%');
      console.log('');
    });
  }

  console.log('Rate limit: ' + JSON.stringify(aiDecider.getRateLimitInfo()));
}

if (require.main === module) {
  main().catch(function(err) { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { main: main };
