/**
 * TradeLab AI Validator
 *
 * Проверяет решения LLM и объединяет с классическими сигналами.
 * Гарантирует что AI не обходит систему безопасности.
 *
 * Paper-only research tool. Не размещает реальные ордера.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var DECISIONS_LOG = path.join(ROOT, 'tradelab-ai-decisions.json');

// ===== VALIDATION RULES =====

var MIN_CONFIDENCE = 70;        // минимальная уверенность (повышена с 65)
var MAX_CONFIDENCE = 100;
var MIN_STOP_PCT = 1.0;
var MAX_STOP_PCT = 5.0;
var MIN_TAKE_PCT = 2.0;
var MAX_TAKE_PCT = 8.0;
var MIN_RISK_PCT = 0.1;
var MAX_RISK_PCT = 1.0;
var MAX_POSITIONS = 3;

/**
 * Проверить решение LLM.
 * @returns {{ valid: boolean, reasons: string[] }}
 */
function validateDecision(aiResult, portfolioState) {
  var reasons = [];
  var valid = true;

  // 1. Confidence check
  if (aiResult.confidence < MIN_CONFIDENCE) {
    reasons.push('confidence ' + aiResult.confidence + ' < ' + MIN_CONFIDENCE);
    valid = false;
  }

  // 2. Decision validity
  if (['BUY', 'SELL', 'HOLD'].indexOf(aiResult.decision) === -1) {
    reasons.push('invalid decision: ' + aiResult.decision);
    valid = false;
  }

  // 3. HOLD всегда валиден
  if (aiResult.decision === 'HOLD') {
    return { valid: true, reasons: ['HOLD — пропуск'] };
  }

  // 4. Params check (только для BUY/SELL)
  if (aiResult.params) {
    var p = aiResult.params;
    if (p.stopPct < MIN_STOP_PCT || p.stopPct > MAX_STOP_PCT) {
      reasons.push('stopPct ' + p.stopPct + ' вне [' + MIN_STOP_PCT + '-' + MAX_STOP_PCT + ']');
      valid = false;
    }
    if (p.takePct < MIN_TAKE_PCT || p.takePct > MAX_TAKE_PCT) {
      reasons.push('takePct ' + p.takePct + ' вне [' + MIN_TAKE_PCT + '-' + MAX_TAKE_PCT + ']');
      valid = false;
    }
    if (p.riskPct < MIN_RISK_PCT || p.riskPct > MAX_RISK_PCT) {
      reasons.push('riskPct ' + p.riskPct + ' вне [' + MIN_RISK_PCT + '-' + MAX_RISK_PCT + ']');
      valid = false;
    }
    // Risk/Reward check: take должен быть >= stop
    if (p.takePct < p.stopPct) {
      reasons.push('takePct (' + p.takePct + ') < stopPct (' + p.stopPct + ') — risk/reward < 1');
      valid = false;
    }
  }

  // 5. Проверка лимита позиций
  if (portfolioState && portfolioState.candidates) {
    var openCount = 0;
    Object.keys(portfolioState.candidates).forEach(function (key) {
      var c = portfolioState.candidates[key];
      if (c.paperLedger && c.paperLedger.position && c.paperLedger.position.side) {
        openCount++;
      }
    });
    if (openCount >= MAX_POSITIONS && aiResult.decision !== 'SELL') {
      reasons.push('portfolio full: ' + openCount + '/' + MAX_POSITIONS + ' позиций');
      valid = false;
    }
  }

  // 6. Проверка на дублирование
  if (aiResult.decision === 'BUY') {
    // Если уже есть та же пара в портфеле — HOLD
    if (portfolioState && portfolioState.candidates) {
      var symbol = aiResult.context ? aiResult.context.symbol : '';
      Object.keys(portfolioState.candidates).forEach(function (key) {
        if (key.indexOf(symbol) === 0) {
          var c = portfolioState.candidates[key];
          if (c.paperLedger && c.paperLedger.position && c.paperLedger.position.side === 'LONG') {
            reasons.push('уже есть LONG позиция по ' + symbol);
            valid = false;
          }
        }
      });
    }
  }

  // 7. Kill-switch проверка
  if (portfolioState && portfolioState.killSwitch && portfolioState.killSwitch.hard) {
    reasons.push('kill-switch активен');
    valid = false;
  }

  if (valid && reasons.length === 0) {
    reasons.push('прошло все проверки');
  }

  return { valid: valid, reasons: reasons };
}

/**
 * Объединить AI-решение с классическим сигналом.
 *
 * Логика:
 * - Если AI и классика совпадают → high confidence, используем AI params
 * - Если AI уверен (>=80) и классика молчит → используем AI
 * - Если классика уверена и AI HOLD → используем классику
 * - Если оба HOLD → HOLD
 * - Если конфликт → HOLD (осторожность)
 *
 * @param {Object} aiResult - Результат AI
 * @param {Object} classicalSignal - Классический сигнал { action, price }
 * @returns {Object} Финальное решение
 */
function mergeSignals(aiResult, classicalSignal) {
  var classicalAction = classicalSignal ? classicalSignal.action : 'WAIT';
  var aiAction = aiResult ? aiResult.decision : 'HOLD';

  // Картирование WAIT → HOLD для единообразия
  if (classicalAction === 'WAIT') classicalAction = 'HOLD';

  // Оба HOLD → HOLD
  if (aiAction === 'HOLD' && classicalAction === 'HOLD') {
    return {
      decision: 'HOLD',
      confidence: 0,
      reasoning: 'Оба источника: HOLD',
      params: null,
      source: 'merge-both-hold'
    };
  }

  // Классика молчит, AI уверен → AI
  if (classicalAction === 'HOLD' && aiAction !== 'HOLD' && aiResult.confidence >= 80) {
    return {
      decision: aiAction,
      confidence: aiResult.confidence,
      reasoning: '[AI] ' + aiResult.reasoning + ' (классика: HOLD)',
      params: aiResult.params,
      source: 'merge-ai-only'
    };
  }

  // Совпадают → high confidence
  if (aiAction === classicalAction && aiAction !== 'HOLD') {
    return {
      decision: aiAction,
      confidence: Math.min(100, aiResult.confidence + 15),
      reasoning: '[AI+Class] ' + aiResult.reasoning,
      params: aiResult.params,
      source: 'merge-confirmed'
    };
  }

  // Конфликт → HOLD
  if (aiAction !== 'HOLD' && classicalAction !== 'HOLD' && aiAction !== classicalAction) {
    return {
      decision: 'HOLD',
      confidence: 0,
      reasoning: '[CONFLICT] AI=' + aiAction + ' vs Class=' + classicalAction + '. Безопасность: HOLD. AI: ' + aiResult.reasoning,
      params: null,
      source: 'merge-conflict'
    };
  }

  // Классика активна, AI HOLD (low confidence) → классика
  if (classicalAction !== 'HOLD' && aiAction === 'HOLD') {
    return {
      decision: classicalAction,
      confidence: classicalSignal.confidence || 50,
      reasoning: '[Class] Классика: ' + (classicalSignal.reason || '') + '. AI: HOLD (' + (aiResult ? aiResult.confidence : 0) + '%)',
      params: null,
      source: 'merge-classical'
    };
  }

  // Fallback
  return {
    decision: 'HOLD',
    confidence: 0,
    reasoning: 'Неопределенное состояние',
    params: null,
    source: 'merge-fallback'
  };
}

/**
 * Записать решение в лог.
 */
function logDecision(symbol, interval, aiResult, merged, validation) {
  try {
    var log = [];
    if (fs.existsSync(DECISIONS_LOG)) {
      log = JSON.parse(fs.readFileSync(DECISIONS_LOG, 'utf8'));
    }

    log.push({
      timestamp: new Date().toISOString(),
      symbol: symbol,
      interval: interval,
      aiDecision: aiResult ? aiResult.decision : null,
      aiConfidence: aiResult ? aiResult.confidence : 0,
      aiSource: aiResult ? aiResult.source : null,
      aiLatencyMs: aiResult ? aiResult.latencyMs : 0,
      aiReasoning: aiResult ? aiResult.reasoning : null,
      mergedDecision: merged.decision,
      mergedSource: merged.source,
      mergedReasoning: merged.reasoning,
      validationValid: validation.valid,
      validationReasons: validation.reasons
    });

    // Хранить последние 200 записей
    if (log.length > 200) {
      log = log.slice(-200);
    }

    fs.writeFileSync(DECISIONS_LOG, JSON.stringify(log, null, 2), 'utf8');
  } catch (e) {
    // Тихий fail — лог не критичен
  }
}

/**
 * Полный пайплайн: AI → валидация → merge → лог.
 *
 * @param {Object} aiResult - Результат tradelab_ai_decider.decide()
 * @param {Object} classicalSignal - Классический сигнал { action, price }
 * @param {string} symbol - Торговая пара
 * @param {string} interval - Интервал
 * @returns {Object} Финальное решение
 */
function processDecision(aiResult, classicalSignal, symbol, interval) {
  // Загрузить состояние портфеля
  var portfolioState = null;
  try {
    var statePath = require('path').join(ROOT, 'tradelab-incubation-state.json');
    if (fs.existsSync(statePath)) {
      portfolioState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch (e) {}

  // Валидация
  var validation = validateDecision(aiResult, portfolioState);

  // Если невалидно — fallback на классику
  if (!validation.valid && aiResult.decision !== 'HOLD') {
    var fallbackResult = {
      decision: 'HOLD',
      confidence: 0,
      reasoning: '[AI BLOCKED] ' + validation.reasons.join('; ') + '. Fallback.',
      params: null,
      source: 'fallback-validation'
    };

    logDecision(symbol, interval, aiResult, fallbackResult, validation);
    return fallbackResult;
  }

  // Merge
  var merged = mergeSignals(aiResult, classicalSignal);

  // Лог
  logDecision(symbol, interval, aiResult, merged, validation);

  return merged;
}

module.exports = {
  validateDecision: validateDecision,
  mergeSignals: mergeSignals,
  processDecision: processDecision,
  logDecision: logDecision,
  MIN_CONFIDENCE: MIN_CONFIDENCE,
  MAX_RISK_PCT: MAX_RISK_PCT,
  MAX_POSITIONS: MAX_POSITIONS
};
