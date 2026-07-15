/**
 * TradeLab Strategy Optimizer
 *
 * Анализирует свои сделки и сам подбирает оптимальные параметры.
 * Использует макро-данные (Fear & Greed, новости) для корректировки.
 *
 * Paper-only research tool. Does not place orders.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
var OPTIMIZER_PATH = path.join(ROOT, 'tradelab-optimizer-results.json');

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

// ===== 1. АНАЛИЗ СДЕЛОК =====

/**
 * Анализирует все сделки кандидата и находит паттерны
 * 
 * @param {Object} candidate - Кандидат из incubation state
 * @returns {Object} Анализ
 */
function analyzeTrades(candidate) {
  // Трейды могут быть в разных полях в зависимости от версии
  var trades = [];
  if (candidate.paperLedger && Array.isArray(candidate.paperLedger)) {
    trades = candidate.paperLedger;
  } else if (candidate.forwardTrades && Array.isArray(candidate.forwardTrades)) {
    trades = candidate.forwardTrades;
  } else if (candidate.trades && Array.isArray(candidate.trades)) {
    trades = candidate.trades;
  }
  
  if (trades.length === 0) {
    return {
      total: 0,
      winRate: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxConsecutiveLosses: 0,
      avgBarsHeld: 0,
      bestTimeframe: null,
      worstTimeframe: null,
      exitReasons: {}
    };
  }

  var wins = trades.filter(function (t) { return t.pnl > 0; });
  var losses = trades.filter(function (t) { return t.pnl < 0; });
  var winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  var avgWin = wins.length > 0 ? wins.reduce(function (s, t) { return s + t.pnl; }, 0) / wins.length : 0;
  var avgLoss = losses.length > 0 ? Math.abs(losses.reduce(function (s, t) { return s + t.pnl; }, 0)) / losses.length : 0;
  var grossProfit = wins.reduce(function (s, t) { return s + t.pnl; }, 0);
  var grossLoss = Math.abs(losses.reduce(function (s, t) { return s + t.pnl; }, 0));
  var profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

  // Максимальная серия убытков
  var streak = 0;
  var maxStreak = 0;
  for (var i = 0; i < trades.length; i++) {
    if (trades[i].pnl < 0) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  // Среднее время удержания
  var barsHeld = trades.filter(function (t) { return t.bars; }).map(function (t) { return t.bars; });
  var avgBars = barsHeld.length > 0 ? barsHeld.reduce(function (s, b) { return s + b; }, 0) / barsHeld.length : 0;

  // Причины выходов
  var exitReasons = {};
  trades.forEach(function (t) {
    var reason = t.reason || 'unknown';
    if (!exitReasons[reason]) exitReasons[reason] = { count: 0, pnl: 0 };
    exitReasons[reason].count++;
    exitReasons[reason].pnl += t.pnl;
  });

  return {
    total: trades.length,
    winRate: Number(winRate.toFixed(1)),
    avgPnl: Number((trades.reduce(function (s, t) { return s + t.pnl; }, 0) / trades.length).toFixed(2)),
    avgWin: Number(avgWin.toFixed(2)),
    avgLoss: Number(avgLoss.toFixed(2)),
    profitFactor: Number(profitFactor.toFixed(2)),
    maxConsecutiveLosses: maxStreak,
    avgBarsHeld: Number(avgBars.toFixed(1)),
    exitReasons: exitReasons
  };
}

// ===== 2. ОЦЕНКА СТРАТЕГИИ =====

/**
 * Оценивает здоровье стратегии и даёт рекомендации
 * 
 * @param {Object} analysis - Результат analyzeTrades
 * @param {Object} macroData - Макро-данные (опционально)
 * @returns {Object} Оценка и рекомендации
 */
function evaluateStrategy(analysis, macroData) {
  var score = 50; // база
  var issues = [];
  var strengths = [];
  var recommendations = [];

  // Оценка по метрикам
  if (analysis.total < 10) {
    issues.push('Too few trades (' + analysis.total + ') for reliable analysis');
    score -= 10;
  } else {
    strengths.push('Sufficient trades: ' + analysis.total);
  }

  if (analysis.winRate >= 55) {
    strengths.push('Win rate: ' + analysis.winRate + '%');
    score += 10;
  } else if (analysis.winRate >= 45) {
    score += 5;
  } else {
    issues.push('Low win rate: ' + analysis.winRate + '%');
    score -= 10;
  }

  if (analysis.profitFactor >= 2) {
    strengths.push('Strong PF: ' + analysis.profitFactor);
    score += 15;
  } else if (analysis.profitFactor >= 1.5) {
    strengths.push('Good PF: ' + analysis.profitFactor);
    score += 8;
  } else if (analysis.profitFactor >= 1.1) {
    score += 3;
  } else {
    issues.push('Weak PF: ' + analysis.profitFactor);
    score -= 15;
  }

  if (analysis.maxConsecutiveLosses >= 5) {
    issues.push('Long loss streak: ' + analysis.maxConsecutiveLosses);
    score -= 15;
    recommendations.push('Increase stop loss or reduce risk');
  } else if (analysis.maxConsecutiveLosses >= 3) {
    issues.push('Loss streak: ' + analysis.maxConsecutiveLosses);
    score -= 5;
  }

  // Анализ причин выходов
  var exitReasons = analysis.exitReasons || {};
  var stopLossPnl = exitReasons.stop ? exitReasons.stop.pnl : 0;
  var takeProfitPnl = exitReasons.take ? exitReasons.take.pnl : 0;
  var signalPnl = exitReasons.signal ? exitReasons.signal.pnl : 0;

  if (stopLossPnl < 0 && Math.abs(stopLossPnl) > Math.abs(takeProfitPnl)) {
    issues.push('Stop losses are larger than take profits');
    recommendations.push('Widen stop loss or tighten take profit');
    score -= 10;
  }

  if (signalPnl > 0) {
    strengths.push('Signal exits are profitable');
    score += 5;
  }

  // Учёт макро-данных
  if (macroData && macroData.fearGreed) {
    var fng = macroData.fearGreed;
    if (fng.label === 'extreme-fear') {
      recommendations.push('Extreme fear in market — consider reducing position size');
      score -= 5;
    } else if (fng.label === 'extreme-greed') {
      recommendations.push('Extreme greed — market may be overbought');
      score -= 5;
    } else if (fng.label === 'fear') {
      recommendations.push('Fear in market — potential buying opportunity');
      score += 3;
    }
  }

  // Итоговая оценка
  score = Math.max(0, Math.min(100, score));
  var status = score >= 70 ? 'healthy' : score >= 40 ? 'needs-attention' : 'poor';

  return {
    score: score,
    status: status,
    strengths: strengths,
    issues: issues,
    recommendations: recommendations
  };
}

// ===== 3. ПОДБОР ПАРАМЕТРОВ =====

/**
 * Рекомендует новые параметры на основе анализа
 * 
 * @param {Object} candidate - Кандидат
 * @param {Object} analysis - Результат analyzeTrades
 * @returns {Object} Рекомендованные параметры
 */
function suggestParameters(candidate, analysis) {
  var current = candidate.params || {};
  var suggested = {};

  // Копируем текущие
  for (var key in current) {
    if (current.hasOwnProperty(key)) {
      suggested[key] = current[key];
    }
  }

  // Анализируем и корректируем
  var exitReasons = analysis.exitReasons || {};
  var stopCount = exitReasons.stop ? exitReasons.stop.count : 0;
  var takeCount = exitReasons.take ? exitReasons.take.count : 0;
  var signalCount = exitReasons.signal ? exitReasons.signal.count : 0;
  var totalExits = stopCount + takeCount + signalCount;

  // Если слишком много стопов — расширяем стоп
  if (totalExits > 0 && stopCount / totalExits > 0.5) {
    suggested.stopPct = Math.min((current.stopPct || 2.4) * 1.3, 5);
    suggested.takePct = Math.min((current.takePct || 4.2) * 1.3, 8);
  }

  // Если слишком много тейков — сужаем стоп (можно рискнуть больше)
  if (totalExits > 0 && takeCount / totalExits > 0.6) {
    suggested.stopPct = Math.max((current.stopPct || 2.4) * 0.85, 1);
    suggested.takePct = Math.max((current.takePct || 4.2) * 0.85, 2);
  }

  // Если низкий winrate — меняем RSI пороги
  if (analysis.winRate < 45 && analysis.total >= 10) {
    suggested.rsiBuy = Math.max((current.rsiBuy || 42) - 5, 25);
    suggested.rsiSell = Math.min((current.rsiSell || 68) + 5, 85);
  }

  // Если высокая просадка — уменьшаем риск
  var maxDd = candidate.maxDrawdownPct || 0;
  if (maxDd > 8) {
    suggested.riskPct = Math.max((current.riskPct || 1.2) * 0.7, 0.3);
  }

  // Если всё хорошо — можно увеличить риск
  if (analysis.profitFactor >= 2 && analysis.winRate >= 55 && maxDd < 5) {
    suggested.riskPct = Math.min((current.riskPct || 1.2) * 1.2, 3);
  }

  return suggested;
}

// ===== 4. ПОЛНЫЙ АНАЛИЗ =====

/**
 * Полный анализ всех кандидатов с рекомендациями
 * 
 * @param {Object} macroData - Макро-данные (опционально)
 * @returns {Object} Результаты оптимизации
 */
function runOptimization(macroData) {
  var state = loadJSON(STATE_PATH);
  if (!state || !state.candidates) {
    return { error: 'No incubation state found', candidates: {} };
  }

  var results = {};
  var candidates = state.candidates;

  for (var key in candidates) {
    if (!candidates.hasOwnProperty(key)) continue;

    var candidate = candidates[key];
    var analysis = analyzeTrades(candidate);
    var evaluation = evaluateStrategy(analysis, macroData);
    var suggestedParams = suggestParameters(candidate, analysis);

    results[key] = {
      symbol: candidate.symbol,
      interval: candidate.interval,
      strategy: candidate.strategy,
      status: candidate.status,
      analysis: analysis,
      evaluation: evaluation,
      currentParams: candidate.params || {},
      suggestedParams: suggestedParams,
      needsUpdate: JSON.stringify(candidate.params) !== JSON.stringify(suggestedParams)
    };
  }

  // Сохраняем результаты
  var output = {
    _updatedAt: Date.now(),
    macroData: macroData ? {
      fearGreed: macroData.fearGreed,
      btcDominance: macroData.macro ? macroData.macro.btcDominance : null
    } : null,
    candidates: results,
    summary: {
      total: Object.keys(results).length,
      healthy: Object.values(results).filter(function (r) { return r.evaluation.status === 'healthy'; }).length,
      needsAttention: Object.values(results).filter(function (r) { return r.evaluation.status === 'needs-attention'; }).length,
      poor: Object.values(results).filter(function (r) { return r.evaluation.status === 'poor'; }).length,
      needsUpdate: Object.values(results).filter(function (r) { return r.needsUpdate; }).length
    }
  };

  saveJSON(OPTIMIZER_PATH, output);
  return output;
}

// ===== 5. ПРИМЕНЕНИЕ ПАРАМЕТРОВ =====

/**
 * Применяет рекомендованные параметры к кандидатам
 * Возвращает количество обновлённых
 */
function applyOptimization() {
  var optimizer = loadJSON(OPTIMIZER_PATH);
  if (!optimizer || !optimizer.candidates) return 0;

  var state = loadJSON(STATE_PATH);
  if (!state || !state.candidates) return 0;

  var updated = 0;
  var candidates = state.candidates;

  for (var key in optimizer.candidates) {
    if (!optimizer.candidates.hasOwnProperty(key)) continue;
    if (!candidates[key]) continue;

    var opt = optimizer.candidates[key];
    if (!opt.needsUpdate) continue;

    // Обновляем параметры
    candidates[key].params = opt.suggestedParams;
    candidates[key].paramsUpdatedAt = new Date().toISOString();
    updated++;
  }

  if (updated > 0) {
    state._updatedAt = new Date().toISOString();
    saveJSON(STATE_PATH, state);
  }

  return updated;
}

// ===== 6. ЗАПУСК =====

async function main() {
  console.log('=== TradeLab Strategy Optimizer ===\n');

  // Пробуем загрузить макро-данные
  var macroData = null;
  try {
    var collector = require('./tradelab_data_collector');
    macroData = collector.loadMacroData();
    if (macroData) {
      console.log('Macro data loaded:');
      console.log('  Fear & Greed: ' + (macroData.fearGreed ? macroData.fearGreed.value + ' (' + macroData.fearGreed.label + ')' : 'N/A'));
      console.log('  BTC Dominance: ' + (macroData.macro && macroData.macro.btcDominance ? macroData.macro.btcDominance.toFixed(1) + '%' : 'N/A'));
    } else {
      console.log('No macro data available. Run tradelab_data_collector.js first.');
    }
  } catch (e) {
    console.log('Data collector not available: ' + e.message);
  }

  console.log('\nAnalyzing candidates...\n');

  var results = runOptimization(macroData);

  if (results.error) {
    console.log('ERROR: ' + results.error);
    return;
  }

  console.log('Total candidates: ' + results.summary.total);
  console.log('  🟢 Healthy: ' + results.summary.healthy);
  console.log('  🟡 Needs attention: ' + results.summary.needsAttention);
  console.log('  🔴 Poor: ' + results.summary.poor);
  console.log('  📝 Needs param update: ' + results.summary.needsUpdate);

  // Показываем детали по проблемным
  console.log('\n=== DETAILS ===');
  for (var key in results.candidates) {
    if (!results.candidates.hasOwnProperty(key)) continue;
    var c = results.candidates[key];

    var statusIcon = c.evaluation.status === 'healthy' ? '🟢' : c.evaluation.status === 'needs-attention' ? '🟡' : '🔴';
    console.log('\n' + statusIcon + ' ' + key);
    console.log('  Score: ' + c.evaluation.score + '/' + c.evaluation.status);
    console.log('  Trades: ' + c.analysis.total + ' | WR: ' + c.analysis.winRate + '% | PF: ' + c.analysis.profitFactor);

    if (c.evaluation.issues.length > 0) {
      console.log('  Issues:');
      c.evaluation.issues.forEach(function (issue) { console.log('    ⚠ ' + issue); });
    }
    if (c.evaluation.recommendations.length > 0) {
      console.log('  Recommendations:');
      c.evaluation.recommendations.forEach(function (rec) { console.log('    💡 ' + rec); });
    }
    if (c.needsUpdate) {
      console.log('  📝 Params need update');
    }
  }

  // Применяем изменения
  var updated = applyOptimization();
  if (updated > 0) {
    console.log('\n✅ Applied new parameters to ' + updated + ' candidates');
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
  analyzeTrades: analyzeTrades,
  evaluateStrategy: evaluateStrategy,
  suggestParameters: suggestParameters,
  runOptimization: runOptimization,
  applyOptimization: applyOptimization
};
