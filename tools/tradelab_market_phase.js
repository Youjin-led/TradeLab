/**
 * TradeLab Market Phase Detector
 *
 * Determines the current market phase: trending, ranging, volatile.
 * Used to select the right strategy and adjust risk parameters.
 *
 * Paper-only research tool. Does not place orders.
 */

/**
 * Calculate ATR (Average True Range) for volatility measurement.
 */
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  const trValues = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);
  }
  // Simple moving average of TR
  let sum = 0;
  for (let i = trValues.length - period; i < trValues.length; i++) {
    sum += trValues[i];
  }
  return sum / period;
}

/**
 * Calculate ATR as percentage of current price.
 */
function atrPct(candles, period = 14) {
  const atr = calculateATR(candles, period);
  const price = candles[candles.length - 1].close;
  return price > 0 ? (atr / price) * 100 : 0;
}

/**
 * Calculate ADX (Average Directional Index) for trend strength.
 * Returns value 0-100. >25 indicates trending, <20 indicates ranging.
 */
function calculateADX(candles, period = 14) {
  if (candles.length < period * 2) return 0;

  const trValues = [];
  const plusDM = [];
  const minusDM = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trValues.push(tr);

    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  // Smooth with Wilder's method
  const atr = smoothWilder(trValues, period);
  const plus = smoothWilder(plusDM, period);
  const minus = smoothWilder(minusDM, period);

  if (atr === 0) return 0;

  const plusDI = (plus / atr) * 100;
  const minusDI = (minus / atr) * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;

  return Number.isFinite(dx) ? dx : 0;
}

function smoothWilder(values, period) {
  if (values.length < period) return values.reduce((s, v) => s + v, 0) / values.length;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  return sum / period;
}

/**
 * Calculate Bollinger Band width as percentage of middle band.
 * Narrow bands (< 5%) indicate ranging, wide bands (> 15%) indicate volatile.
 */
function calculateBBWidth(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  const width = ((stddev * multiplier * 2) / mean) * 100;
  return Number(width.toFixed(2));
}

/**
 * Calculate linear regression slope to determine trend direction and strength.
 * Returns slope as percentage change over the period.
 */
function calculateSlope(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const n = slice.length;
  const xMean = (n - 1) / 2;
  const yMean = slice.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (slice[i] - yMean);
    den += (i - xMean) ** 2;
  }

  if (den === 0) return 0;
  const slope = num / den;
  const slopePct = (slope / yMean) * 100;
  return Number(slopePct.toFixed(4));
}

/**
 * Detect the current market phase.
 *
 * @param {Array} candles - Array of { time, open, high, low, close, volume }
 * @param {Object} options - Optional thresholds
 * @returns {Object} { phase, adx, atrPct, bbWidth, slope, volatility, details }
 */
function detectPhase(candles, options = {}) {
  const opts = {
    adxTrending: options.adxTrending || 22,
    adxStrong: options.adxStrong || 30,
    bbNarrow: options.bbNarrow || 6,
    bbWide: options.bbWide || 14,
    atrHigh: options.atrHigh || 4,
    atrExtreme: options.atrExtreme || 7,
    ...options
  };

  const closes = candles.map((c) => c.close);
  const adx = calculateADX(candles, 14);
  const atrValue = atrPct(candles, 14);
  const bbWidth = calculateBBWidth(closes, 20);
  const slope = calculateSlope(closes, 20);

  let phase;
  let volatility = 'normal';
  const details = [];

  // Determine volatility
  if (atrValue >= opts.atrExtreme || bbWidth >= opts.bbWide * 1.5) {
    volatility = 'extreme';
    details.push('extreme volatility');
  } else if (atrValue >= opts.atrHigh || bbWidth >= opts.bbWide) {
    volatility = 'high';
    details.push('high volatility');
  } else if (bbWidth <= opts.bbNarrow) {
    volatility = 'low';
    details.push('low volatility');
  }

  // Determine phase
  if (adx >= opts.adxStrong) {
    if (slope > 0.05) {
      phase = 'trending-up-strong';
      details.push('strong uptrend');
    } else if (slope < -0.05) {
      phase = 'trending-down-strong';
      details.push('strong downtrend');
    } else {
      phase = 'trending-strong';
      details.push('strong trend, direction unclear');
    }
  } else if (adx >= opts.adxTrending) {
    if (slope > 0.03) {
      phase = 'trending-up';
      details.push('uptrend');
    } else if (slope < -0.03) {
      phase = 'trending-down';
      details.push('downtrend');
    } else {
      phase = 'trending';
      details.push('trending, low slope');
    }
  } else if (bbWidth <= opts.bbNarrow) {
    phase = 'ranging-tight';
    details.push('tight range');
  } else {
    phase = 'ranging';
    details.push('ranging / no clear trend');
  }

  // Special cases
  if (volatility === 'extreme' && phase.startsWith('ranging')) {
    phase = 'volatile-ranging';
    details.push('choppy with wide swings');
  }

  return {
    phase,
    adx: Number(adx.toFixed(1)),
    atrPct: Number(atrValue.toFixed(2)),
    bbWidth,
    slope: Number(slope.toFixed(4)),
    volatility,
    details: details.join('; '),
    // Recommendations
    recommendedStrategy: phase.startsWith('trending')
      ? 'breakout'
      : phase.startsWith('ranging')
        ? 'sma-rsi'
        : 'sma-rsi',
    stopMultiplier: volatility === 'extreme' ? 3.5 : volatility === 'high' ? 3.0 : 2.5,
    riskPct: volatility === 'extreme' ? 0.8 : volatility === 'high' ? 1.0 : 1.2
  };
}

/**
 * Get dynamic stop-loss percentage based on ATR.
 *
 * @param {Array} candles - Price candles
 * @param {number} multiplier - ATR multiplier (default 2.5)
 * @param {number} minStop - Minimum stop percentage (default 1.5)
 * @param {number} maxStop - Maximum stop percentage (default 8)
 * @returns {number} Stop-loss percentage
 */
function dynamicStopPct(candles, multiplier = 2.5, minStop = 1.5, maxStop = 8) {
  const atr = atrPct(candles, 14);
  const stop = Math.max(atr * multiplier, minStop);
  return Math.min(stop, maxStop);
}

/**
 * Get dynamic take-profit percentage (usually 1.5-2x the stop).
 */
function dynamicTakePct(candles, stopPct, multiplier = 1.8) {
  return Math.max(stopPct * multiplier, 2.0);
}

/**
 * Get dynamic risk percentage based on volatility.
 */
function dynamicRiskPct(candles, baseRisk = 1.2) {
  const atr = atrPct(candles, 14);
  if (atr > 6) return Math.max(baseRisk * 0.6, 0.5);
  if (atr > 4) return Math.max(baseRisk * 0.8, 0.7);
  return baseRisk;
}

module.exports = {
  calculateATR,
  atrPct,
  calculateADX,
  calculateBBWidth,
  calculateSlope,
  detectPhase,
  dynamicStopPct,
  dynamicTakePct,
  dynamicRiskPct
};
