/**
 * TradeLab Strategy Scanner
 *
 * Автоматически ищет новые торговые паттерны и стратегии.
 * Анализирует исторические данные, находит работающие комбинации.
 *
 * Paper-only research tool. Does not place orders.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
var SCANNER_PATH = path.join(ROOT, 'tradelab-scanner-results.json');

// ===== ВСПОМОГАТЕЛЬНЫЕ =====

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

// ===== 1. ПАРАМЕТРЫ ДЛЯ ПЕРЕБОРА =====

var PARAM_GRID = {
  'sma-rsi': {
    fastPeriod: [12, 16, 26],
    slowPeriod: [34, 55, 100],
    rsiPeriod: [14],
    rsiBuy: [35, 45],
    rsiSell: [60, 70],
    stopPct: [2.0, 2.4],
    takePct: [4.2, 5.0]
  },
  'breakout': {
    lookback: [20, 30],
    breakoutPct: [1.5, 2.0],
    stopPct: [2.0, 2.4],
    takePct: [4.2, 5.0]
  }
};

// ===== 2. ГЕНЕРАЦИЯ НОВЫХ ПАРАМЕТРОВ =====

/**
 * Генерирует все возможные комбинации параметров для стратегии
 * 
 * @param {string} strategyType - 'sma-rsi' или 'breakout'
 * @returns {Array} Массив объектов с параметрами
 */
function generateParamCombinations(strategyType) {
  var grid = PARAM_GRID[strategyType];
  if (!grid) return [];

  var keys = Object.keys(grid);
  var results = [];

  function combine(current, depth) {
    if (depth === keys.length) {
      results.push(JSON.parse(JSON.stringify(current)));
      return;
    }

    var key = keys[depth];
    var values = grid[key];

    for (var i = 0; i < values.length; i++) {
      current[key] = values[i];
      combine(current, depth + 1);
    }
  }

  combine({}, 0);
  return results;
}

// ===== 3. СИМУЛЯЦИЯ ТОРГОВЛИ =====

/**
 * Симулирует торговлю с заданными параметрами на исторических данных
 * 
 * @param {Array} candles - Массив свечей [{ open, high, low, close, volume }]
 * @param {Object} params - Параметры стратегии
 * @param {string} strategyType - 'sma-rsi' или 'breakout'
 * @returns {Object} Результаты симуляции
 */
function simulateStrategy(candles, params, strategyType) {
  if (!candles || candles.length < 50) {
    return { trades: 0, pnl: 0, profitFactor: 0, maxDd: 0, winRate: 0 };
  }

  var position = null; // { side, entry, stop, take, bars }
  var trades = [];
  var balance = 10000;
  var peak = 10000;
  var maxDd = 0;

  // SMA-RSI стратегия
  if (strategyType === 'sma-rsi') {
    var fastPeriod = params.fastPeriod || 12;
    var slowPeriod = params.slowPeriod || 34;
    var rsiPeriod = params.rsiPeriod || 14;
    var rsiBuy = params.rsiBuy || 40;
    var rsiSell = params.rsiSell || 65;
    var stopPct = params.stopPct || 2.4;
    var takePct = params.takePct || 4.2;

    for (var i = slowPeriod; i < candles.length; i++) {
      // SMA
      var fastSma = 0;
      for (var j = i - fastPeriod + 1; j <= i; j++) {
        fastSma += candles[j].close;
      }
      fastSma /= fastPeriod;

      var slowSma = 0;
      for (var k = i - slowPeriod + 1; k <= i; k++) {
        slowSma += candles[k].close;
      }
      slowSma /= slowPeriod;

      // RSI
      var gains = 0;
      var losses = 0;
      for (var m = i - rsiPeriod + 1; m <= i; m++) {
        var diff = candles[m].close - candles[m - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      var avgGain = gains / rsiPeriod;
      var avgLoss = losses / rsiPeriod;
      var rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

      var close = candles[i].close;

      // Управление позицией
      if (position) {
        position.bars++;
        var pnlPct = position.side === 'LONG'
          ? (close - position.entry) / position.entry * 100
          : (position.entry - close) / position.entry * 100;

        if (pnlPct <= -stopPct) {
          // Stop loss
          var pnl = -balance * (stopPct / 100);
          balance += pnl;
          trades.push({ pnl: pnl, reason: 'stop', bars: position.bars });
          position = null;
        } else if (pnlPct >= takePct) {
          // Take profit
          var pnl = balance * (takePct / 100);
          balance += pnl;
          trades.push({ pnl: pnl, reason: 'take', bars: position.bars });
          position = null;
        } else if (position.side === 'LONG' && rsi > rsiSell) {
          // Signal exit
          var pnl = balance * (pnlPct / 100);
          balance += pnl;
          trades.push({ pnl: pnl, reason: 'signal', bars: position.bars });
          position = null;
        } else if (position.side === 'SHORT' && rsi < rsiBuy) {
          var pnl = balance * (pnlPct / 100);
          balance += pnl;
          trades.push({ pnl: pnl, reason: 'signal', bars: position.bars });
          position = null;
        }
      }

      // Вход в позицию
      if (!position) {
        if (fastSma > slowSma && rsi < rsiBuy) {
          position = { side: 'LONG', entry: close, bars: 0 };
        } else if (fastSma < slowSma && rsi > rsiSell) {
          position = { side: 'SHORT', entry: close, bars: 0 };
        }
      }

      // Обновление peak и dd
      if (balance > peak) peak = balance;
      var dd = (peak - balance) / peak * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }

  // Breakout стратегия
  if (strategyType === 'breakout') {
    var lookback = params.lookback || 20;
    var breakoutPct = params.breakoutPct || 2.0;
    var stopPct = params.stopPct || 2.4;
    var takePct = params.takePct || 4.2;

    for (var n = lookback; n < candles.length; n++) {
      var high = 0;
      var low = Infinity;
      for (var p = n - lookback; p < n; p++) {
        if (candles[p].high > high) high = candles[p].high;
        if (candles[p].low < low) low = candles[p].low;
      }

      var range = (high - low) / low * 100;
      var close = candles[n].close;

      if (position) {
        position.bars++;
        var pnlPct2 = position.side === 'LONG'
          ? (close - position.entry) / position.entry * 100
          : (position.entry - close) / position.entry * 100;

        if (pnlPct2 <= -stopPct) {
          var pnl2 = -balance * (stopPct / 100);
          balance += pnl2;
          trades.push({ pnl: pnl2, reason: 'stop', bars: position.bars });
          position = null;
        } else if (pnlPct2 >= takePct) {
          var pnl2 = balance * (takePct / 100);
          balance += pnl2;
          trades.push({ pnl: pnl2, reason: 'take', bars: position.bars });
          position = null;
        }
      }

      if (!position && range > 0) {
        var breakoutHigh = high * (1 + breakoutPct / 100);
        var breakoutLow = low * (1 - breakoutPct / 100);

        if (close >= breakoutHigh) {
          position = { side: 'LONG', entry: close, bars: 0 };
        } else if (close <= breakoutLow) {
          position = { side: 'SHORT', entry: close, bars: 0 };
        }
      }

      if (balance > peak) peak = balance;
      var dd2 = (peak - balance) / peak * 100;
      if (dd2 > maxDd) maxDd = dd2;
    }
  }

  // Закрываем открытую позицию
  if (position) {
    var lastClose = candles[candles.length - 1].close;
    var finalPnl = position.side === 'LONG'
      ? (lastClose - position.entry) / position.entry * 100
      : (position.entry - lastClose) / position.entry * 100;
    balance += balance * (finalPnl / 100);
    trades.push({ pnl: balance * (finalPnl / 100), reason: 'close', bars: position.bars });
  }

  // Расчёт метрик
  var wins = trades.filter(function (t) { return t.pnl > 0; });
  var losses = trades.filter(function (t) { return t.pnl < 0; });
  var grossProfit = wins.reduce(function (s, t) { return s + t.pnl; }, 0);
  var grossLoss = Math.abs(losses.reduce(function (s, t) { return s + t.pnl; }, 0));
  var pf = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  var totalPnl = balance - 10000;

  return {
    trades: trades.length,
    pnl: Number(totalPnl.toFixed(2)),
    profitFactor: pf === Infinity ? 999 : Number(pf.toFixed(2)),
    maxDd: Number(maxDd.toFixed(2)),
    winRate: trades.length > 0 ? Number((wins.length / trades.length * 100).toFixed(1)) : 0,
    finalBalance: Number(balance.toFixed(2))
  };
}

// ===== 4. ПОИСК ЛУЧШИХ ПАРАМЕТРОВ =====

/**
 * Перебирает все комбинации параметров и находит лучшие
 * 
 * @param {Array} candles - Массив свечей
 * @param {string} strategyType - 'sma-rsi' или 'breakout'
 * @param {Object} options - Опции поиска
 * @returns {Array} Топ-10 лучших комбинаций
 */
function findBestParams(candles, strategyType, options) {
  var opts = options || {};
  // Для коротких данных (50-100 свечей) достаточно 3 трейдов
  var minTrades = opts.minTrades || 3;
  var maxResults = opts.maxResults || 10;

  var combinations = generateParamCombinations(strategyType);
  console.log('  Testing ' + combinations.length + ' combinations...');

  var results = [];

  for (var i = 0; i < combinations.length; i++) {
    var sim = simulateStrategy(candles, combinations[i], strategyType);

    if (sim.trades >= minTrades && sim.profitFactor > 0) {
      results.push({
        params: combinations[i],
        sim: sim,
        score: sim.profitFactor * sim.winRate * (sim.trades / (sim.trades + 10))
      });
    }
  }

  // Сортируем по score
  results.sort(function (a, b) { return b.score - a.score; });

  return results.slice(0, maxResults);
}

// ===== 5. СБОР ИСТОРИЧЕСКИХ ДАННЫХ =====

/**
 * Собирает исторические свечи из существующих данных
 * 
 * @param {Object} state - Состояние инкубации
 * @param {string} symbol - Символ (например 'BTCUSDT')
 * @param {string} interval - Таймфрейм (например '4h')
 * @returns {Array|null} Массив свечей или null
 */
function parseCloseValue(val) {
  // observedCloses может быть строкой вида "2026-07-06 08:00:1.983"
  // или просто числом
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    // Пробуем распарсить "2026-07-06 08:00:1.983" -> 1.983
    var parts = val.split(':');
    var last = parts[parts.length - 1];
    var num = parseFloat(last);
    if (!isNaN(num)) return num;
    // Пробуем просто parseFloat
    num = parseFloat(val);
    if (!isNaN(num)) return num;
  }
  return 0;
}

function collectHistoricalCandles(state, symbol, interval) {
  // Ищем кандидата с таким символом и интервалом
  var keys = Object.keys(state.candidates || {});
  for (var i = 0; i < keys.length; i++) {
    var c = state.candidates[keys[i]];
    if (c.symbol === symbol && c.interval === interval) {
      // Пробуем получить свечи из observedCloses
      if (c.observedCloses && c.observedCloses.length > 20) {
        var closes = c.observedCloses.map(parseCloseValue).filter(function (v) { return v > 0; });
        if (closes.length < 20) return null;
        return closes.map(function (val, idx) {
          return {
            open: val * 0.998,
            high: val * 1.002,
            low: val * 0.997,
            close: val,
            volume: 1000 + Math.random() * 500
          };
        });
      }
    }
  }
  return null;
}

// ===== 6. ПОЛНЫЙ СКАНЕР =====

/**
 * Полный поиск новых стратегий по всем монетам и таймфреймам
 * 
 * @returns {Object} Результаты сканирования
 */
function runScanner() {
  var state = loadJSON(STATE_PATH);
  if (!state || !state.candidates) {
    return { error: 'No incubation state found' };
  }

  var symbols = {};
  var keys = Object.keys(state.candidates);

  // Собираем уникальные символы
  for (var i = 0; i < keys.length; i++) {
    var c = state.candidates[keys[i]];
    var key = c.symbol + ':' + c.interval;
    if (!symbols[key]) {
      symbols[key] = { symbol: c.symbol, interval: c.interval };
    }
  }

  var symbolKeys = Object.keys(symbols);
  console.log('Found ' + symbolKeys.length + ' unique symbol:interval pairs');

  var allResults = {};

  for (var j = 0; j < symbolKeys.length; j++) {
    var sk = symbolKeys[j];
    var info = symbols[sk];
    console.log('\nScanning ' + sk + '...');

    var candles = collectHistoricalCandles(state, info.symbol, info.interval);
    if (!candles || candles.length < 50) {
      console.log('  Not enough data');
      continue;
    }

    console.log('  Candles: ' + candles.length);

    // Тестируем sma-rsi
    console.log('  Testing sma-rsi...');
    var smaResults = findBestParams(candles, 'sma-rsi');

    // Тестируем breakout
    console.log('  Testing breakout...');
    var breakoutResults = findBestParams(candles, 'breakout');

    allResults[sk] = {
      symbol: info.symbol,
      interval: info.interval,
      candles: candles.length,
      smaRsi: smaResults,
      breakout: breakoutResults
    };
  }

  // Сохраняем результаты
  var output = {
    _updatedAt: Date.now(),
    results: allResults,
    summary: {
      scanned: symbolKeys.length,
      found: 0
    }
  };

  // Считаем найденные
  for (var key in allResults) {
    if (!allResults.hasOwnProperty(key)) continue;
    var r = allResults[key];
    if ((r.smaRsi && r.smaRsi.length > 0) || (r.breakout && r.breakout.length > 0)) {
      output.summary.found++;
    }
  }

  saveJSON(SCANNER_PATH, output);
  return output;
}

// ===== 7. ПРИМЕНЕНИЕ НОВЫХ СТРАТЕГИЙ =====

/**
 * Добавляет лучшие найденные параметры как новых кандидатов
 * 
 * @param {number} topN - Сколько лучших добавить
 * @returns {number} Количество добавленных
 */
function applyNewStrategies(topN) {
  topN = topN || 5;

  var scanner = loadJSON(SCANNER_PATH);
  if (!scanner || !scanner.results) return 0;

  var state = loadJSON(STATE_PATH);
  if (!state) return 0;

  var added = 0;

  for (var key in scanner.results) {
    if (!scanner.results.hasOwnProperty(key)) continue;
    var result = scanner.results[key];

    // Проверяем sma-rsi
    if (result.smaRsi && result.smaRsi.length > 0) {
      for (var i = 0; i < Math.min(topN, result.smaRsi.length); i++) {
        var best = result.smaRsi[i];
        if (best.sim.profitFactor >= 1.5 && best.sim.trades >= 3) {
          var candidateKey = result.symbol + ':' + result.interval + ':sma-rsi:auto';
          if (!state.candidates[candidateKey]) {
            state.candidates[candidateKey] = {
              key: candidateKey,
              symbol: result.symbol,
              interval: result.interval,
              strategy: 'sma-rsi',
              source: 'auto-scanner',
              params: best.params,
              status: 'incubating',
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              forwardPaperTrades: [],
              forwardPaperPnl: 0,
              profitFactor: 0,
              winratePct: 0,
              maxDrawdownPct: 0
            };
            added++;
          }
        }
      }
    }

    // Проверяем breakout
    if (result.breakout && result.breakout.length > 0) {
      for (var j = 0; j < Math.min(topN, result.breakout.length); j++) {
        var best2 = result.breakout[j];
        if (best2.sim.profitFactor >= 1.5 && best2.sim.trades >= 10) {
          var candidateKey2 = result.symbol + ':' + result.interval + ':breakout:auto';
          if (!state.candidates[candidateKey2]) {
            state.candidates[candidateKey2] = {
              key: candidateKey2,
              symbol: result.symbol,
              interval: result.interval,
              strategy: 'breakout',
              source: 'auto-scanner',
              params: best2.params,
              status: 'incubating',
              startedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              forwardPaperTrades: [],
              forwardPaperPnl: 0,
              profitFactor: 0,
              winratePct: 0,
              maxDrawdownPct: 0
            };
            added++;
          }
        }
      }
    }
  }

  if (added > 0) {
    state._updatedAt = new Date().toISOString();
    saveJSON(STATE_PATH, state);
  }

  return added;
}

// ===== 8. ЗАПУСК =====

function main() {
  console.log('=== TradeLab Strategy Scanner ===\n');
  console.log('Scanning for new trading strategies...\n');

  var results = runScanner();

  if (results.error) {
    console.log('ERROR: ' + results.error);
    return;
  }

  console.log('\n=== SCAN RESULTS ===');
  console.log('Scanned: ' + results.summary.scanned + ' pairs');
  console.log('Found strategies for: ' + results.summary.found + ' pairs');

  // Показываем лучшие находки
  for (var key in results.results) {
    if (!results.results.hasOwnProperty(key)) continue;
    var r = results.results[key];

    var bestSma = r.smaRsi && r.smaRsi.length > 0 ? r.smaRsi[0] : null;
    var bestBreakout = r.breakout && r.breakout.length > 0 ? r.breakout[0] : null;

    if (bestSma || bestBreakout) {
      console.log('\n' + key + ' (' + r.candles + ' candles):');
      if (bestSma) {
        console.log('  sma-rsi: PF ' + bestSma.sim.profitFactor + ' | WR ' + bestSma.sim.winRate + '% | Trades ' + bestSma.sim.trades + ' | DD ' + bestSma.sim.maxDd + '%');
      }
      if (bestBreakout) {
        console.log('  breakout: PF ' + bestBreakout.sim.profitFactor + ' | WR ' + bestBreakout.sim.winRate + '% | Trades ' + bestBreakout.sim.trades + ' | DD ' + bestBreakout.sim.maxDd + '%');
      }
    }
  }

  // Применяем новые стратегии
  var added = applyNewStrategies(3);
  if (added > 0) {
    console.log('\n✅ Added ' + added + ' new candidates to incubation');
  } else {
    console.log('\nNo new candidates to add');
  }

  console.log('\nDone.');
}

if (require.main === module) {
  main();
}

module.exports = {
  generateParamCombinations: generateParamCombinations,
  simulateStrategy: simulateStrategy,
  findBestParams: findBestParams,
  runScanner: runScanner,
  applyNewStrategies: applyNewStrategies
};
