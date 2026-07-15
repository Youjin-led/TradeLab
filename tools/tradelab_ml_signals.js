/**
 * TradeLab ML Signals
 *
 * Предсказание торговых сигналов с помощью простых ML-моделей:
 *
 * 1. Feature Engineering — 15+ индикаторов из свечей
 * 2. Neural Network (Vanilla JS, no deps) — предсказание направления
 * 3. Adaptive Parameters — автонастройка под текущий рынок
 * 4. Sentiment Integration — новостной анализ через LLM
 * 5. Ensemble — комбинация ML + classical signals
 *
 * Paper-only. Не размещает реальные ордера.
 */

// ===== FEATURE ENGINEERING =====

function sma(values, period, index) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

function ema(values, period, index) {
  if (index < period - 1) return null;
  const k = 2 / (period + 1);
  let result = values[index - period + 1];
  for (let i = index - period + 2; i <= index; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function rsi(values, period, index) {
  if (index < period) return 50;
  let gains = 0, losses = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function atr(candles, period, index) {
  if (index < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    sum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }
  return sum / period;
}

function stddev(values, period, index) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  const mean = sum / period;
  let sq = 0;
  for (let i = index - period + 1; i <= index; i++) sq += (values[i] - mean) ** 2;
  return Math.sqrt(sq / period);
}

function bollingerBands(closes, period, index, mult) {
  const mid = sma(closes, period, index);
  const sd = stddev(closes, period, index);
  if (mid === null || sd === null) return null;
  return { upper: mid + sd * mult, mid, lower: mid - sd * mult };
}

/**
 * Extract feature vector from candles at given index.
 * Returns array of numbers (normalized).
 */
function extractFeatures(candles, index) {
  if (index < 50) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);

  const close = closes[index];
  const prevClose = closes[index - 1];

  // Price features
  const roc5 = (close - closes[index - 5]) / closes[index - 5] * 100;
  const roc10 = (close - closes[index - 10]) / closes[index - 10] * 100;
  const roc20 = (close - closes[index - 20]) / closes[index - 20] * 100;

  // Moving averages
  const sma10 = sma(closes, 10, index);
  const sma20 = sma(closes, 20, index);
  const sma50 = sma(closes, 50, index);
  const ema12 = ema(closes, 12, index);
  const ema26 = ema(closes, 26, index);

  // MA distances (normalized)
  const distSma10 = sma10 ? (close - sma10) / sma10 * 100 : 0;
  const distSma20 = sma20 ? (close - sma20) / sma20 * 100 : 0;
  const distSma50 = sma50 ? (close - sma50) / sma50 * 100 : 0;
  const macdLine = ema12 && ema26 ? (ema12 - ema26) / ema26 * 100 : 0;

  // RSI
  const rsi14 = rsi(closes, 14, index);

  // ATR
  const atr14 = atr(candles, 14, index);
  const atrPct = atr14 ? atr14 / close * 100 : 0;

  // Bollinger
  const bb = bollingerBands(closes, 20, index, 2);
  const bbPosition = bb ? (close - bb.lower) / (bb.upper - bb.lower) * 2 - 1 : 0; // -1 to 1

  // Volume
  let avgVol = 0;
  for (let i = index - 20; i < index; i++) avgVol += volumes[i];
  avgVol /= 20;
  const volRatio = avgVol > 0 ? volumes[index] / avgVol : 1;

  // Volatility
  const returns = [];
  for (let i = index - 20; i <= index; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const vol = stddev(returns, returns.length, returns.length - 1) || 0;

  // Candle pattern
  const body = Math.abs(candles[index].close - candles[index].open);
  const range = candles[index].high - candles[index].low;
  const bodyRatio = range > 0 ? body / range : 0.5;
  const isGreen = candles[index].close > candles[index].open ? 1 : 0;

  // Higher highs / lower lows
  const highHigher = candles[index].high > candles[index - 1].high ? 1 : 0;
  const lowLower = candles[index].low < candles[index - 1].low ? 1 : 0;

  return [
    roc5 / 10, roc10 / 10, roc20 / 10,   // Normalized price momentum
    distSma10 / 5, distSma20 / 5, distSma50 / 5, // MA distances
    macdLine / 5,                           // MACD
    rsi14 / 50 - 1,                         // RSI normalized to [-1, 1]
    atrPct / 5,                             // ATR
    bbPosition,                             // Bollinger position
    volRatio / 3,                           // Volume ratio
    vol * 100,                              // Volatility
    bodyRatio * 2 - 1,                      // Body ratio
    isGreen * 2 - 1,                        // Direction
    highHigher * 2 - 1,                     // Higher high
    lowLower * 2 - 1,                       // Lower low
  ];
}

/**
 * Label for training: did price go up or down in next N bars?
 */
function extractLabel(candles, index, lookforward) {
  if (index + lookforward >= candles.length) return null;
  const currentClose = candles[index].close;
  const futureClose = candles[index + lookforward].close;
  return futureClose > currentClose ? 1 : 0; // 1 = UP, 0 = DOWN
}

// ===== SIMPLE NEURAL NETWORK (No Dependencies) =====

/**
 * Minimal feedforward network: Input(16) → Hidden(12) → Output(1)
 * Activations: tanh (hidden), sigmoid (output)
 */
class SimpleNN {
  constructor(inputSize, hiddenSize, outputSize) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;

    // Xavier initialization
    this.w1 = this.randomMatrix(hiddenSize, inputSize, inputSize);
    this.b1 = new Array(hiddenSize).fill(0);
    this.w2 = this.randomMatrix(outputSize, hiddenSize, hiddenSize);
    this.b2 = new Array(outputSize).fill(0);
  }

  randomMatrix(rows, cols, fanIn) {
    const scale = Math.sqrt(2 / fanIn);
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale)
    );
  }

  tanh(x) { return Math.tanh(x); }
  tanhDeriv(x) { return 1 - x * x; }
  sigmoid(x) { return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))); }

  forward(input) {
    // Hidden layer
    this.hidden = [];
    for (let i = 0; i < this.hiddenSize; i++) {
      let sum = this.b1[i];
      for (let j = 0; j < this.inputSize; j++) sum += this.w1[i][j] * input[j];
      this.hidden.push(this.tanh(sum));
    }

    // Output layer
    this.output = [];
    for (let i = 0; i < this.outputSize; i++) {
      let sum = this.b2[i];
      for (let j = 0; j < this.hiddenSize; j++) sum += this.w2[i][j] * this.hidden[j];
      this.output.push(this.sigmoid(sum));
    }

    return this.output;
  }

  train(input, target, lr) {
    const output = this.forward(input);

    // Output error
    const outputDelta = [];
    for (let i = 0; i < this.outputSize; i++) {
      const err = target[i] - output[i];
      outputDelta.push(err * output[i] * (1 - output[i]));
    }

    // Hidden error
    const hiddenDelta = [];
    for (let i = 0; i < this.hiddenSize; i++) {
      let err = 0;
      for (let j = 0; j < this.outputSize; j++) err += outputDelta[j] * this.w2[j][i];
      hiddenDelta.push(err * this.tanhDeriv(this.hidden[i]));
    }

    // Update weights
    for (let i = 0; i < this.outputSize; i++) {
      for (let j = 0; j < this.hiddenSize; j++) {
        this.w2[i][j] += lr * outputDelta[i] * this.hidden[j];
      }
      this.b2[i] += lr * outputDelta[i];
    }

    for (let i = 0; i < this.hiddenSize; i++) {
      for (let j = 0; j < this.inputSize; j++) {
        this.w1[i][j] += lr * hiddenDelta[i] * input[j];
      }
      this.b1[i] += lr * hiddenDelta[i];
    }

    return Math.abs(target[0] - output[0]);
  }
}

// ===== ML PIPELINE =====

/**
 * Train and predict on candle data.
 * Returns array of predictions with confidence.
 */
function trainAndPredict(candles, config) {
  const cfg = Object.assign({
    lookforward: 5,    // Bars to predict ahead
    trainRatio: 0.7,
    learningRate: 0.05,
    epochs: 100,
    confidenceThreshold: 0.6,
  }, config);

  const inputSize = 16;
  const nn = new SimpleNN(inputSize, 12, 1);

  // Extract features and labels
  const data = [];
  for (let i = 50; i < candles.length - cfg.lookforward; i++) {
    const features = extractFeatures(candles, i);
    const label = extractLabel(candles, i, cfg.lookforward);
    if (features && label !== null) {
      data.push({ features, label, index: i });
    }
  }

  if (data.length < 100) {
    return { predictions: [], accuracy: 0, trained: false, reason: 'insufficient data' };
  }

  // Split
  const trainEnd = Math.floor(data.length * cfg.trainRatio);
  const trainData = data.slice(0, trainEnd);
  const testData = data.slice(trainEnd);

  // Train
  let totalError = 0;
  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    let epochError = 0;
    // Shuffle
    for (let i = trainData.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [trainData[i], trainData[j]] = [trainData[j], trainData[i]];
    }
    for (const { features, label } of trainData) {
      epochError += nn.train(features, [label], cfg.learningRate);
    }
    totalError = epochError / trainData.length;
  }

  // Test accuracy
  let correct = 0;
  for (const { features, label } of testData) {
    const pred = nn.forward(features);
    const predicted = pred[0] > 0.5 ? 1 : 0;
    if (predicted === label) correct++;
  }
  const accuracy = testData.length > 0 ? correct / testData.length : 0;

  // Predict on recent candles (last 50)
  const predictions = [];
  for (let i = Math.max(50, candles.length - 50); i < candles.length; i++) {
    const features = extractFeatures(candles, i);
    if (!features) continue;
    const pred = nn.forward(features);
    const confidence = pred[0];
    const signal = confidence > cfg.confidenceThreshold ? 'LONG' :
                   confidence < (1 - cfg.confidenceThreshold) ? 'SHORT' : 'WAIT';
    predictions.push({
      index: i,
      signal,
      confidence: Number(confidence.toFixed(3)),
      price: candles[i].close,
      time: candles[i].time || i,
    });
  }

  return {
    predictions,
    accuracy: Number((accuracy * 100).toFixed(1)),
    trainSize: trainData.length,
    testSize: testData.length,
    finalLoss: Number(totalError.toFixed(4)),
    trained: true,
  };
}

// ===== ADAPTIVE PARAMETERS =====

/**
 * Adjust strategy parameters based on recent market regime.
 */
function adaptiveParams(candles, baseParams, lookback) {
  const lb = lookback || 100;
  const recent = candles.slice(-lb);
  if (recent.length < 50) return baseParams;

  const closes = recent.map(c => c.close);

  // Measure volatility regime
  const returns = [];
  for (let i = 1; i < closes.length; i++) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  const vol = stddev(returns, returns.length, returns.length - 1) || 0.02;

  // Measure trend strength
  const sma20 = sma(closes, 20, closes.length - 1);
  const sma50 = sma(closes, 50, closes.length - 1);
  const trendStrength = sma20 && sma50 ? Math.abs(sma20 - sma50) / sma50 : 0;

  const params = Object.assign({}, baseParams);

  // High volatility: wider stops, tighter sizing
  if (vol > 0.04) {
    params.stopPct = (params.stopPct || 2.4) * 1.3;
    params.takePct = (params.takePct || 4.2) * 1.2;
    params.riskPct = (params.riskPct || 1.2) * 0.7;
  }

  // Low volatility: tighter stops, wider targets
  if (vol < 0.015) {
    params.stopPct = (params.stopPct || 2.4) * 0.8;
    params.takePct = (params.takePct || 4.2) * 1.4;
  }

  // Strong trend: wider take profit
  if (trendStrength > 0.03) {
    params.takePct = (params.takePct || 4.2) * 1.5;
    params.stopPct = (params.stopPct || 2.4) * 1.1;
  }

  // Weak trend: tighter take profit, mean-reversion bias
  if (trendStrength < 0.01) {
    params.takePct = (params.takePct || 4.2) * 0.7;
    params.stopPct = (params.stopPct || 2.4) * 0.9;
  }

  params.marketRegime = {
    volatility: vol > 0.04 ? 'HIGH' : vol < 0.015 ? 'LOW' : 'NORMAL',
    trendStrength: trendStrength > 0.03 ? 'STRONG' : trendStrength < 0.01 ? 'WEAK' : 'MODERATE',
    volPct: Number((vol * 100).toFixed(2)),
    trendPct: Number((trendStrength * 100).toFixed(2)),
  };

  return params;
}

// ===== ENSEMBLE =====

/**
 * Combine ML prediction with classical strategy signals.
 * Uses majority voting with confidence weighting.
 */
function ensembleSignal(mlPrediction, classicalSignals, weights) {
  const w = weights || { ml: 0.4, classical: 0.6 };

  let mlScore = 0;
  if (mlPrediction) {
    if (mlPrediction.signal === 'LONG') mlScore = mlPrediction.confidence;
    else if (mlPrediction.signal === 'SHORT') mlScore = -mlPrediction.confidence;
  }

  let classicalScore = 0;
  for (const sig of classicalSignals) {
    if (sig === 'LONG') classicalScore += 1;
    else if (sig === 'SHORT') classicalScore -= 1;
  }
  // Normalize classical to [-1, 1]
  if (classicalSignals.length > 0) {
    classicalScore = classicalScore / classicalSignals.length;
  }

  const combined = mlScore * w.ml + classicalScore * w.classical;

  if (combined > 0.3) return { signal: 'LONG', confidence: Number(combined.toFixed(3)), source: 'ensemble' };
  if (combined < -0.3) return { signal: 'SHORT', confidence: Number(Math.abs(combined).toFixed(3)), source: 'ensemble' };
  return { signal: 'WAIT', confidence: 0, source: 'ensemble' };
}

module.exports = {
  extractFeatures,
  extractLabel,
  SimpleNN,
  trainAndPredict,
  adaptiveParams,
  ensembleSignal,
  sma, ema, rsi, atr, stddev, bollingerBands,
};
