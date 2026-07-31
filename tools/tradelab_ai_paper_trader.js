/**
 * TradeLab AI Paper Trader
 *
 * DeepSeek решает когда входить/выходить по каждой паре.
 * Paper-only. Не размещает реальные ордера.
 *
 * Запуск:
 *   node tools/tradelab_ai_paper_trader.js          — один цикл
 *   node tools/tradelab_ai_paper_trader.js --loop    — непрерывно
 */

var fs = require('fs');
var path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
var aiDecider = require('./tradelab_ai_decider');
var contextBuilder = require('./tradelab_ai_context_builder');

var ROOT = path.join(__dirname, '..');
var STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
var LOG_PATH = path.join(ROOT, 'tradelab-ai-paper-trades.json');

var CONFIG = {
  maxPositions: 3,
  positionSizePct: 30,
  initialBalance: 10000,
  checkIntervalMinutes: 60
};

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function log(msg) { console.log('[' + new Date().toISOString() + '] ' + msg); }

function fetchCandles(symbol, interval, limit) {
  limit = limit || 100;
  var url = 'https://data-api.binance.vision/api/v3/klines?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
  return fetch(url, { signal: AbortSignal.timeout(15000) })
    .then(function(r) { if (!r.ok) throw new Error('Binance ' + r.status); return r.json(); })
    .then(function(data) {
      return data.map(function(k) {
        return {
          timestamp: new Date(k[0]).toISOString().replace('T', ' ').substring(0, 16),
          open: parseFloat(k[1]), high: parseFloat(k[2]),
          low: parseFloat(k[3]), close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        };
      });
    });
}

function loadPaperState() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch (e) {
    return {
      balance: CONFIG.initialBalance,
      peak: CONFIG.initialBalance,
      positions: [],
      closedTrades: [],
      totalPnl: 0,
      wins: 0,
      losses: 0
    };
  }
}

function savePaperState(state) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(state, null, 2));
}

function loadIncubation() {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

var SCAN_PAIRS = [
  'BTCUSDT:1h', 'BTCUSDT:4h',
  'ETHUSDT:1h', 'ETHUSDT:4h',
  'SOLUSDT:1h', 'SOLUSDT:4h',
  'BNBUSDT:1h', 'BNBUSDT:4h',
  'XRPUSDT:1h', 'XRPUSDT:4h',
  'DOGEUSDT:1h', 'DOGEUSDT:4h',
  'ADAUSDT:1h', 'ADAUSDT:4h',
  'LINKUSDT:1h', 'LINKUSDT:4h',
  'AVAXUSDT:1h', 'AVAXUSDT:4h',
  'SUIUSDT:1h', 'SUIUSDT:4h',
  'LTCUSDT:1h', 'LTCUSDT:4h',
  'NEARUSDT:1h', 'NEARUSDT:4h',
  'DOTUSDT:1h', 'DOTUSDT:4h',
  'INJUSDT:1h', 'INJUSDT:4h',
  'ARBUSDT:1h', 'ARBUSDT:4h',
  'OPUSDT:1h', 'OPUSDT:4h',
  'RENDERUSDT:1h', 'RENDERUSDT:4h'
];

function getActiveCandidates() {
  var inc = loadIncubation();
  var candidates = Object.values(inc.candidates || {});
  var active = candidates.filter(function(c) {
    return (c.status === 'incubating' || c.status === 'collecting') &&
           (c.forwardPaperPnl || 0) > -500 &&
           (c.profitFactor || 0) > 1.0;
  });
  return active;
}

function getScanPairs() {
  return SCAN_PAIRS;
}

function calculateATR(candles, period) {
  period = period || 14;
  if (!candles || candles.length < period + 1) return 0;
  var sum = 0;
  for (var i = candles.length - period; i < candles.length; i++) {
    var c = candles[i];
    var prev = candles[i - 1];
    var tr = Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
    sum += tr;
  }
  return sum / period / candles[candles.length - 1].close * 100;
}

var CORRELATION_GROUPS = {
  benchmarks: ['BTC', 'ETH', 'SOL', 'BNB'],
  alts: ['XRP', 'DOGE', 'ADA', 'LINK', 'AVAX', 'SUI', 'LTC', 'NEAR', 'DOT', 'INJ', 'ARB', 'OP', 'RENDER']
};

function getGroup(symbol) {
  var base = symbol.replace('USDT', '');
  for (var g in CORRELATION_GROUPS) {
    if (CORRELATION_GROUPS[g].indexOf(base) !== -1) return g;
  }
  return 'alts';
}

function canOpenForGroup(symbol, positions) {
  var group = getGroup(symbol);
  var groups = {};
  positions.forEach(function (p) {
    var g = getGroup(p.symbol);
    groups[g] = (groups[g] || 0) + 1;
  });
  var maxPerGroup = { benchmarks: 1, alts: 2 };
  return (groups[group] || 0) < (maxPerGroup[group] || 2);
}

function oppositeOf(decision) {
  return decision === 'BUY' ? 'SELL' : 'BUY';
}

function closePosition(paper, idx, exitPrice, reason) {
  var pos = paper.positions[idx];
  var pnl = 0;
  if (pos.side === 'LONG') {
    pnl = (exitPrice - pos.entry) * pos.qty;
  } else {
    pnl = (pos.entry - exitPrice) * pos.qty;
  }
  pnl -= (pos.fee || 0);
  paper.balance += pos.notional + pnl;
  paper.totalPnl += pnl;
  if (pnl > 0) paper.wins++; else paper.losses++;
  paper.closedTrades.push({
    symbol: pos.symbol, side: pos.side, interval: pos.interval,
    entry: pos.entry, exit: exitPrice, pnl: pnl,
    reason: reason, openedAt: pos.openedAt,
    closedAt: new Date().toISOString()
  });
  paper.positions.splice(idx, 1);
  log('  CLOSED ' + pos.symbol + ' ' + pos.side + ' PnL: ' + pnl.toFixed(2) + ' (' + reason + ')');
}

async function runCycle() {
  var paper = loadPaperState();
  var candidates = getActiveCandidates();
  var now = new Date().toISOString();

  // Получить свежие новости
  var news = await contextBuilder.fetchNews('BTCUSDT').catch(function () { return []; });
  log('News loaded: ' + news.length + ' items');

  log('Balance: $' + paper.balance.toFixed(2) + ' | PnL: $' + paper.totalPnl.toFixed(2) + ' | Positions: ' + paper.positions.length + ' | Candidates: ' + candidates.length);

  // 1. Check existing positions — close if AI says so
  for (var i = paper.positions.length - 1; i >= 0; i--) {
    var pos = paper.positions[i];
    try {
      var candles = await fetchCandles(pos.symbol, pos.interval, 100);
      var decision = await aiDecider.decide(pos.symbol, pos.interval, candles, { news: news });
      var currentPrice = candles[candles.length - 1].close;

      log('  POS ' + pos.symbol + ' ' + pos.side + ' | AI: ' + decision.decision + ' (' + decision.confidence + '%)');

      // Close if opposite signal or low confidence
      var shouldClose = false;
      var reason = '';
      if (pos.side === 'LONG' && decision.decision === 'SELL' && decision.confidence >= 40) {
        shouldClose = true; reason = 'AI SELL signal';
      } else if (pos.side === 'SHORT' && decision.decision === 'BUY' && decision.confidence >= 40) {
        shouldClose = true; reason = 'AI BUY signal';
      } else if (decision.confidence < 30 && decision.decision === 'HOLD') {
        shouldClose = true; reason = 'AI low confidence';
      }

      // ATR-based stop loss / take profit
      var lossPct = pos.side === 'LONG'
        ? (currentPrice - pos.entry) / pos.entry * 100
        : (pos.entry - currentPrice) / pos.entry * 100;
      var atrPct = calculateATR(candles, 14);
      var slPct = Math.max(atrPct * 1.5, 1.5);
      var tpPct = Math.max(atrPct * 3, 3);
      if (lossPct < -slPct) {
        shouldClose = true; reason = 'Stop loss ' + slPct.toFixed(1) + '% (ATR*1.5=' + atrPct.toFixed(1) + '%)';
      }
      if (lossPct > tpPct) {
        shouldClose = true; reason = 'Take profit ' + tpPct.toFixed(1) + '% (ATR*3=' + atrPct.toFixed(1) + '%)';
      }

      if (shouldClose) {
        closePosition(paper, i, currentPrice, reason);
      }

      await sleep(1500);
    } catch (e) {
      log('  ERR ' + pos.symbol + ': ' + e.message);
    }
  }

  // 2. Multi-timeframe scan — collect decisions per symbol
  var uniqueSymbols = [];
  var seenSymbol = {};
  SCAN_PAIRS.forEach(function (p) {
    var s = p.split(':')[0];
    if (!seenSymbol[s]) { seenSymbol[s] = true; uniqueSymbols.push(s); }
  });

  var signals = [];

  for (var j = 0; j < uniqueSymbols.length && paper.positions.length < CONFIG.maxPositions; j++) {
    var symbol = uniqueSymbols[j];

    try {
      // Scan both timeframes
      var candles1h = await fetchCandles(symbol, '1h', 100);
      var dec1h = await aiDecider.decide(symbol, '1h', candles1h, { news: news });
      await sleep(1000);
      var candles4h = await fetchCandles(symbol, '4h', 100);
      var dec4h = await aiDecider.decide(symbol, '4h', candles4h, { news: news });

      log('  SCAN ' + symbol + ' 1h=' + dec1h.decision + '(' + dec1h.confidence + '%) 4h=' + dec4h.decision + '(' + dec4h.confidence + '%)');

      // Combine timeframes
      var s1 = dec1h.decision === 'BUY' || dec1h.decision === 'SELL' ? dec1h : null;
      var s4 = dec4h.decision === 'BUY' || dec4h.decision === 'SELL' ? dec4h : null;
      var combined = null;

      if (s1 && s4 && s1.decision === s4.decision) {
        // Both timeframes agree — bonus confidence
        combined = {
          symbol: symbol,
          side: s1.decision === 'BUY' ? 'LONG' : 'SHORT',
          confidence: Math.min((s1.confidence + s4.confidence) / 2 + 10, 95),
          sizeMultiplier: 1.0,
          reasoning: 'TF agree: ' + s1.reasoning.substring(0, 60) + ' | ' + s4.reasoning.substring(0, 60),
          candles: candles4h
        };
      } else if (s1 && (!s4 || s4.decision !== oppositeOf(s1.decision))) {
        // Only 1h signal, 4h neutral
        combined = {
          symbol: symbol,
          side: s1.decision === 'BUY' ? 'LONG' : 'SHORT',
          confidence: s1.confidence * 0.9,
          sizeMultiplier: 0.7,
          reasoning: '1h only: ' + s1.reasoning.substring(0, 100),
          candles: candles4h
        };
      } else if (s4 && (!s1 || s1.decision !== oppositeOf(s4.decision))) {
        // Only 4h signal, 1h neutral
        combined = {
          symbol: symbol,
          side: s4.decision === 'BUY' ? 'LONG' : 'SHORT',
          confidence: s4.confidence * 0.9,
          sizeMultiplier: 0.7,
          reasoning: '4h only: ' + s4.reasoning.substring(0, 100),
          candles: candles4h
        };
      }

      if (combined && combined.confidence >= 50) {
        signals.push(combined);
      }

      await sleep(1500);
    } catch (e) {
      log('  ERR ' + symbol + ': ' + e.message);
    }
  }

  // Sort by confidence descending
  signals.sort(function (a, b) { return b.confidence - a.confidence; });

  // Open positions respecting correlation groups
  for (var k = 0; k < signals.length && paper.positions.length < CONFIG.maxPositions; k++) {
    var sig = signals[k];

    // Correlation check
    if (!canOpenForGroup(sig.symbol, paper.positions)) {
      log('  SKIP ' + sig.symbol + ' (group ' + getGroup(sig.symbol) + ' full)');
      continue;
    }

    var price = sig.candles[sig.candles.length - 1].close;
    var atrVal = calculateATR(sig.candles, 14);
    var sizePct = CONFIG.positionSizePct * sig.sizeMultiplier;
    var sizeUsd = paper.balance * (sizePct / 100);
    var qty = sizeUsd / price;

    paper.balance -= sizeUsd;
    paper.positions.push({
      symbol: sig.symbol,
      interval: '1h',
      side: sig.side,
      entry: price,
      qty: qty,
      notional: sizeUsd,
      fee: sizeUsd * 0.0004,
      openedAt: now,
      aiConfidence: Math.round(sig.confidence),
      aiReasoning: sig.reasoning.substring(0, 200),
      atrPct: atrVal
    });

    log('  OPEN ' + sig.symbol + ' ' + sig.side + ' $' + sizeUsd.toFixed(2) + ' conf=' + Math.round(sig.confidence) + '%' + ' (size=' + sizePct + '%)');
    log('    ' + sig.reasoning.substring(0, 150));
  }

  // Update peak
  var totalEquity = paper.balance + paper.positions.reduce(function(sum, p) {
    return sum + p.notional;
  }, 0);
  if (totalEquity > paper.peak) paper.peak = totalEquity;

  savePaperState(paper);
  return paper;
}

async function main() {
  var loop = process.argv.indexOf('--loop') !== -1;

  log('=== AI Paper Trader ===');
  log('Mode: ' + (loop ? 'continuous' : 'single cycle'));

  if (loop) {
    while (true) {
      try { await runCycle(); } catch (e) { log('ERROR: ' + e.message); }
      log('Sleeping ' + CONFIG.checkIntervalMinutes + ' min...\n');
      await sleep(CONFIG.checkIntervalMinutes * 60 * 1000);
    }
  } else {
    var paper = await runCycle();
    console.log('\n=== SUMMARY ===');
    console.log('Balance: $' + paper.balance.toFixed(2));
    console.log('Total PnL: $' + paper.totalPnl.toFixed(2));
    console.log('Open positions: ' + paper.positions.length);
    console.log('Closed trades: ' + paper.closedTrades.length);
    console.log('Win rate: ' + (paper.wins + paper.losses > 0 ? (paper.wins / (paper.wins + paper.losses) * 100).toFixed(1) : 0) + '%');
  }
}

if (require.main === module) {
  main().catch(function(e) { console.error(e); process.exit(1); });
}

module.exports = { runCycle: runCycle };
