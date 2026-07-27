/**
 * TradeLab AI Decider
 *
 * Отправляет контекст рынка в LLM и получает торговое решение.
 * Поддержка: DeepSeek, OpenAI, fallback на классику.
 * Rate limit: максимум 10 запросов в час.
 *
 * Paper-only research tool. Не размещает реальные ордера.
 */

var contextBuilder = require('./tradelab_ai_context_builder');

// ===== CONFIG =====

var RATE_LIMIT_MAX = 50;      // максимум запросов в час
var RATE_WINDOW_MS = 60 * 60 * 1000; // 1 час
var TIMEOUT_MS = 30000;       // 30 секунд timeout
var MAX_RETRIES = 2;

var requestTimestamps = [];

// ===== PROVIDERS =====

var PROVIDERS = {
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
    headers: function (apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      };
    },
    buildBody: function (prompt) {
      return {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      };
    },
    extractContent: function (data) {
      return data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : null;
    }
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    headers: function (apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      };
    },
    buildBody: function (prompt) {
      return {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      };
    },
    extractContent: function (data) {
      return data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : null;
    }
  }
};

// ===== RATE LIMITING =====

function canMakeRequest() {
  var now = Date.now();
  // Удалить старые записи
  requestTimestamps = requestTimestamps.filter(function (t) {
    return now - t < RATE_WINDOW_MS;
  });
  return requestTimestamps.length < RATE_LIMIT_MAX;
}

function recordRequest() {
  requestTimestamps.push(Date.now());
}

function getRateLimitInfo() {
  var now = Date.now();
  var recent = requestTimestamps.filter(function (t) { return now - t < RATE_WINDOW_MS; });
  return {
    used: recent.length,
    max: RATE_LIMIT_MAX,
    resetIn: recent.length > 0 ? RATE_WINDOW_MS - (now - recent[0]) : 0
  };
}

// ===== LLM CALL =====

async function callLLM(prompt, provider, apiKey) {
  var config = PROVIDERS[provider];
  if (!config) throw new Error('Unknown provider: ' + provider);
  if (!apiKey) throw new Error('No API key for ' + provider);

  var body = config.buildBody(prompt);
  var headers = config.headers(apiKey);

  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      var controller = new AbortController();
      var timeoutId = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

      var response = await fetch(config.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        var errorText = await response.text();
        if (attempt < MAX_RETRIES) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error('LLM API error ' + response.status + ': ' + errorText);
      }

      var data = await response.json();
      return config.extractContent(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        throw new Error('LLM timeout after ' + MAX_RETRIES + ' retries');
      }
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

// ===== PARSE RESPONSE =====

function parseAIResponse(content) {
  if (!content) return null;

  try {
    var parsed = JSON.parse(content);
    // Валидация полей
    var decision = (parsed.decision || '').toUpperCase();
    if (['BUY', 'SELL', 'HOLD'].indexOf(decision) === -1) return null;

    return {
      decision: decision,
      confidence: Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0)),
      reasoning: String(parsed.reasoning || ''),
      stopPct: Math.min(5, Math.max(1, parseFloat(parsed.stopPct) || 3)),
      takePct: Math.min(8, Math.max(1, parseFloat(parsed.takePct) || 5)),
      riskPct: Math.min(1, Math.max(0.1, parseFloat(parsed.riskPct) || 0.5))
    };
  } catch (e) {
    // Попытка найти JSON в тексте
    var jsonMatch = content.match(/\{[\s\S]*"decision"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return parseAIResponse(jsonMatch[0]);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

// ===== MAIN FUNCTION =====

/**
 * Принять торговое решение с помощью LLM.
 *
 * @param {string} symbol - Торговая пара (BTCUSDT)
 * @param {string} interval - Интервал (1h, 4h)
 * @param {Array} candles - Массив свечей
 * @param {Object} options - { provider, apiKey } или из переменных окружения
 * @returns {Object} { decision, confidence, reasoning, params, source, latencyMs }
 */
async function decide(symbol, interval, candles, options) {
  options = options || {};
  var provider = options.provider || process.env.AI_PROVIDER || 'deepseek';
  var apiKey = options.apiKey || process.env.AI_API_KEY || '';

  // Сбор контекста
  var startTime = Date.now();
  var context = contextBuilder.buildContext(symbol, interval, candles);
  var prompt = contextBuilder.buildPrompt(context);

  // Fallback на классику если нет API ключа
  if (!apiKey) {
    return {
      decision: 'HOLD',
      confidence: 0,
      reasoning: 'AI отключён: нет API ключа. Используйте классические стратегии.',
      params: null,
      source: 'fallback-no-key',
      latencyMs: 0,
      context: context
    };
  }

  // Rate limit check
  if (!canMakeRequest()) {
    var rateInfo = getRateLimitInfo();
    return {
      decision: 'HOLD',
      confidence: 0,
      reasoning: 'AI rate limit: ' + rateInfo.used + '/' + rateInfo.max + ' запросов в час. Сброс через ' + Math.round(rateInfo.resetIn / 60000) + ' мин.',
      params: null,
      source: 'fallback-rate-limit',
      latencyMs: 0,
      context: context
    };
  }

  try {
    recordRequest();
    var content = await callLLM(prompt, provider, apiKey);
    var latencyMs = Date.now() - startTime;

    var result = parseAIResponse(content);

    if (!result) {
      return {
        decision: 'HOLD',
        confidence: 0,
        reasoning: 'AI вернул некорректный ответ. Fallback на классику.',
        params: null,
        source: 'fallback-parse-error',
        latencyMs: latencyMs,
        context: context
      };
    }

    return {
      decision: result.decision,
      confidence: result.confidence,
      reasoning: result.reasoning,
      params: {
        stopPct: result.stopPct,
        takePct: result.takePct,
        riskPct: result.riskPct
      },
      source: 'ai-' + provider,
      latencyMs: latencyMs,
      context: context
    };

  } catch (err) {
    var latencyMs = Date.now() - startTime;
    return {
      decision: 'HOLD',
      confidence: 0,
      reasoning: 'AI ошибка: ' + err.message + '. Fallback на классику.',
      params: null,
      source: 'fallback-error',
      latencyMs: latencyMs,
      context: context,
      error: err.message
    };
  }
}

module.exports = {
  decide: decide,
  canMakeRequest: canMakeRequest,
  getRateLimitInfo: getRateLimitInfo,
  parseAIResponse: parseAIResponse,
  PROVIDERS: PROVIDERS
};
