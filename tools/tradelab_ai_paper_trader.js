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
  var url = 'https://api.binance.com/api/v3/klines?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
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

  log('Balance: $' + paper.balance.toFixed(2) + ' | PnL: $' + paper.totalPnl.toFixed(2) + ' | Positions: ' + paper.positions.length + ' | Candidates: ' + candidates.length);

  // 1. Check existing positions — close if AI says so
  for (var i = paper.positions.length - 1; i >= 0; i--) {
    var pos = paper.positions[i];
    try {
      var candles = await fetchCandles(pos.symbol, pos.interval, 100);
      var decision = await aiDecider.decide(pos.symbol, pos.interval, candles);
      var currentPrice = candles[candles.length - 1].close;

      log('  POS ' + pos.symbol + ' ' + pos.side + ' | AI: ' + decision.decision + ' (' + decision.confidence + '%)');

      // Close if opposite signal or low confidence
      var shouldClose = false;
      var reason = '';
      if (pos.side === 'LONG' && decision.decision === 'SELL' && decision.confidence >= 50) {
        shouldClose = true; reason = 'AI SELL signal';
      } else if (pos.side === 'SHORT' && decision.decision === 'BUY' && decision.confidence >= 50) {
        shouldClose = true; reason = 'AI BUY signal';
      } else if (decision.confidence < 30 && decision.decision === 'HOLD') {
        shouldClose = true; reason = 'AI low confidence';
      }

      // Stop loss at -3%
      var lossPct = pos.side === 'LONG'
        ? (currentPrice - pos.entry) / pos.entry * 100
        : (pos.entry - currentPrice) / pos.entry * 100;
      if (lossPct < -3) {
        shouldClose = true; reason = 'Stop loss -3%';
      }

      // Take profit at +5%
      if (lossPct > 5) {
        shouldClose = true; reason = 'Take profit +5%';
      }

      if (shouldClose) {
        closePosition(paper, i, currentPrice, reason);
      }

      await sleep(1500);
    } catch (e) {
      log('  ERR ' + pos.symbol + ': ' + e.message);
    }
  }

  // 2. Open new positions — scan ALL pairs
  var activeSymbols = paper.positions.map(function(p) { return p.symbol + ':' + p.interval; });
  var scanPairs = getScanPairs();

  for (var j = 0; j < scanPairs.length && paper.positions.length < CONFIG.maxPositions; j++) {
    var parts = scanPairs[j].split(':');
    var symbol = parts[0];
    var interval = parts[1];
    var key = symbol + ':' + interval;
    if (activeSymbols.indexOf(key) !== -1) continue;

    try {
      var candles2 = await fetchCandles(symbol, interval, 100);
      var decision2 = await aiDecider.decide(symbol, interval, candles2);
      var price = candles2[candles2.length - 1].close;

      log('  SCAN ' + symbol + ' ' + interval + ' | AI: ' + decision2.decision + ' (' + decision2.confidence + '%)');

      if ((decision2.decision === 'BUY' || decision2.decision === 'SELL') && decision2.confidence >= 60) {
        var sizeUsd = paper.balance * (CONFIG.positionSizePct / 100);
        var qty = sizeUsd / price;
        var side = decision2.decision === 'BUY' ? 'LONG' : 'SHORT';

        paper.balance -= sizeUsd;
        paper.positions.push({
          symbol: symbol, interval: interval, side: side,
          entry: price, qty: qty, notional: sizeUsd,
          fee: sizeUsd * 0.0004,
          openedAt: now, aiConfidence: decision2.confidence,
          aiReasoning: decision2.reasoning.substring(0, 200)
        });

        log('  OPEN ' + symbol + ' ' + side + ' $' + sizeUsd.toFixed(2) + ' conf=' + decision2.confidence + '%');
        log('    ' + decision2.reasoning.substring(0, 150));
      }

      await sleep(1500);
    } catch (e) {
      log('  ERR ' + symbol + ': ' + e.message);
    }
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
