/**
 * TradeLab New Strategies
 *
 * Дополнительные торговые стратегии к существующим SMA+RSI, Breakout, Mean Reversion:
 *
 * 1. Momentum — сила тренда + объём
 * 2. Volatility Breakout — прорыв на основе ATR
 * 3. Grid Trading — сетка ордеров в диапазоне
 * 4. Trend Following — ADX + EMA кроссовер
 *
 * Paper-only. Не размещает реальные ордера.
 */

// ===== ВСПОМОГАТЕЛЬНЫЕ =====

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
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta; else losses -= delta;
  }
  if (losses === 0) return 100;
  return 100 - (100 / (1 + gains / losses));
}

function atr(candles, period, index) {
  if (index < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    sum += tr;
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

// ===== 1. MOMENTUM STRATEGY =====
// Combo: RSI momentum + volume surge + price momentum (ROC)
// Signal: RSI > 55 + ROC > 0 + volume > 1.5x average → LONG
// Signal: RSI < 45 + ROC < 0 + volume > 1.5x average → SHORT

function momentumSignal(candles, index, params) {
  const rsiPeriod = params.rsiPeriod || 14;
  const rocPeriod = params.rocPeriod || 10;
  const volPeriod = params.volPeriod || 20;
  const volMultiplier = params.volMultiplier || 1.5;

  if (index < Math.max(rsiPeriod, rocPeriod, volPeriod) + 1) return 'WAIT';

  const rsiVal = rsi(candles.map(c => c.close), rsiPeriod, index);
  const roc = (candles[index].close - candles[index - rocPeriod].close) / candles[index - rocPeriod].close * 100;

  let avgVol = 0;
  for (let i = index - volPeriod; i < index; i++) avgVol += candles[i].volume || 0;
  avgVol /= volPeriod;
  const currentVol = candles[index].volume || 0;
  const volSurge = avgVol > 0 ? currentVol / avgVol : 1;

  if (rsiVal > (params.rsiBuy || 55) && roc > 0 && volSurge > volMultiplier) return 'LONG';
  if (rsiVal < (params.rsiSell || 45) && roc < 0 && volSurge > volMultiplier) return 'SHORT';
  return 'WAIT';
}

function simulateMomentum(candles, params) {
  const defaults = {
    rsiPeriod: 14, rocPeriod: 10, volPeriod: 20, volMultiplier: 1.5,
    rsiBuy: 55, rsiSell: 45, stopPct: 2.5, takePct: 5.0, riskPct: 1.2
  };
  const p = Object.assign({}, defaults, params);
  let position = null, balance = 10000, peak = 10000, maxDd = 0;
  const trades = [];

  for (let i = p.volPeriod + 1; i < candles.length; i++) {
    const signal = momentumSignal(candles, i, p);
    const close = candles[i].close;

    if (position) {
      const pnlPct = position.side === 'LONG'
        ? (close - position.entry) / position.entry * 100
        : (position.entry - close) / position.entry * 100;

      if (pnlPct <= -p.stopPct) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'stop', bars: i - position.bar });
        position = null;
      } else if (pnlPct >= p.takePct) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'take', bars: i - position.bar });
        position = null;
      } else if ((position.side === 'LONG' && signal === 'SHORT') || (position.side === 'SHORT' && signal === 'LONG')) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'signal', bars: i - position.bar });
        position = null;
      }
    }

    if (!position && signal !== 'WAIT') {
      position = { side: signal, entry: close, bar: i };
    }

    if (balance > peak) peak = balance;
    const dd = (peak - balance) / peak * 100;
    if (dd > maxDd) maxDd = dd;
  }

  return summarizeTrades(trades, balance, maxDd, 'momentum');
}

// ===== 2. VOLATILITY BREAKOUT =====
// Price breaks above/below ATR band
// Signal: close > upperBand (SMA + ATR*mult) → LONG
// Signal: close < lowerBand (SMA - ATR*mult) → SHORT

function volatilityBreakoutSignal(candles, index, params) {
  const smaPeriod = params.smaPeriod || 20;
  const atrPeriod = params.atrPeriod || 14;
  const atrMult = params.atrMult || 1.5;

  if (index < Math.max(smaPeriod, atrPeriod) + 1) return 'WAIT';

  const closes = candles.map(c => c.close);
  const smaVal = sma(closes, smaPeriod, index);
  const atrVal = atr(candles, atrPeriod, index);
  if (smaVal === null || atrVal === null) return 'WAIT';

  const upperBand = smaVal + atrVal * atrMult;
  const lowerBand = smaVal - atrVal * atrMult;
  const close = candles[index].close;

  if (close > upperBand) return 'LONG';
  if (close < lowerBand) return 'SHORT';
  return 'WAIT';
}

function simulateVolatilityBreakout(candles, params) {
  const defaults = {
    smaPeriod: 20, atrPeriod: 14, atrMult: 1.5,
    stopPct: 3.0, takePct: 6.0, riskPct: 1.0
  };
  const p = Object.assign({}, defaults, params);
  let position = null, balance = 10000, peak = 10000, maxDd = 0;
  const trades = [];

  for (let i = Math.max(p.smaPeriod, p.atrPeriod) + 1; i < candles.length; i++) {
    const signal = volatilityBreakoutSignal(candles, i, p);
    const close = candles[i].close;

    if (position) {
      const pnlPct = position.side === 'LONG'
        ? (close - position.entry) / position.entry * 100
        : (position.entry - close) / position.entry * 100;

      if (pnlPct <= -p.stopPct) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'stop' });
        position = null;
      } else if (pnlPct >= p.takePct) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'take' });
        position = null;
      } else if ((position.side === 'LONG' && signal === 'SHORT') || (position.side === 'SHORT' && signal === 'LONG')) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'signal' });
        position = null;
      }
    }

    if (!position && signal !== 'WAIT') {
      position = { side: signal, entry: close, bar: i };
    }

    if (balance > peak) peak = balance;
    const dd = (peak - balance) / peak * 100;
    if (dd > maxDd) maxDd = dd;
  }

  return summarizeTrades(trades, balance, maxDd, 'volatility-breakout');
}

// ===== 3. GRID TRADING =====
// Place buy/sell orders at fixed intervals in a range
// Works best in ranging markets

function simulateGrid(candles, params) {
  const defaults = {
    gridPct: 1.5,       // Distance between grid levels %
    stopPct: 8.0,       // Wide stop for grid
    takePct: 3.0,       // Take profit per grid level
    riskPct: 0.8,
    maxGridPositions: 5
  };
  const p = Object.assign({}, defaults, params);
  let balance = 10000, peak = 10000, maxDd = 0;
  const trades = [];
  const positions = [];

  // Determine range from first 100 candles
  const rangeStart = 100;
  if (candles.length < rangeStart + 50) {
    return summarizeTrades([], balance, 0, 'grid');
  }

  let rangeHigh = -Infinity, rangeLow = Infinity;
  for (let i = 0; i < rangeStart; i++) {
    if (candles[i].high > rangeHigh) rangeHigh = candles[i].high;
    if (candles[i].low < rangeLow) rangeLow = candles[i].low;
  }

  // Grid levels
  const gridLevels = [];
  const rangeSize = rangeHigh - rangeLow;
  const gridStep = rangeSize * (p.gridPct / 100);
  for (let level = rangeLow; level <= rangeHigh; level += gridStep) {
    gridLevels.push(level);
  }

  for (let i = rangeStart; i < candles.length; i++) {
    const close = candles[i].close;

    // Check exits
    for (let j = positions.length - 1; j >= 0; j--) {
      const pos = positions[j];
      const pnlPct = pos.side === 'LONG'
        ? (close - pos.entry) / pos.entry * 100
        : (pos.entry - close) / pos.entry * 100;

      if (pnlPct <= -p.stopPct || pnlPct >= p.takePct) {
        balance += balance * (pnlPct / 100 * 0.1); // 10% of balance per position
        trades.push({ pnl: balance * (pnlPct / 100 * 0.1), reason: pnlPct >= p.takePct ? 'take' : 'stop' });
        positions.splice(j, 1);
      }
    }

    // Grid entries
    if (positions.length < p.maxGridPositions) {
      for (const level of gridLevels) {
        const distPct = Math.abs(close - level) / level * 100;
        if (distPct < 0.3) { // Price near grid level
          const side = close < level ? 'LONG' : 'SHORT';
          if (!positions.find(pos => Math.abs(pos.entry - level) / level < 0.01)) {
            positions.push({ side, entry: close, bar: i, gridLevel: level });
          }
        }
      }
    }

    if (balance > peak) peak = balance;
    const dd = (peak - balance) / peak * 100;
    if (dd > maxDd) maxDd = dd;
  }

  return summarizeTrades(trades, balance, maxDd, 'grid');
}

// ===== 4. TREND FOLLOWING (ADX + EMA) =====
// Strong trend (ADX > 25) + EMA crossover → enter
// Weak trend (ADX < 20) or EMA cross back → exit

function adx(candles, period, index) {
  if (index < period * 2) return null;
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = index - period + 1; i <= index; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trSum += tr;
  }
  const atrVal = trSum / period;
  if (atrVal === 0) return 0;
  const plusDI = (plusDM / period) / atrVal * 100;
  const minusDI = (minusDM / period) / atrVal * 100;
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
  return { adx: dx, plusDI, minusDI };
}

function trendFollowingSignal(candles, index, params) {
  const emaFast = params.emaFast || 12;
  const emaSlow = params.emaSlow || 26;
  const adxPeriod = params.adxPeriod || 14;
  const adxThreshold = params.adxThreshold || 25;

  if (index < emaSlow + adxPeriod) return 'WAIT';

  const closes = candles.map(c => c.close);
  const emaF = ema(closes, emaFast, index);
  const emaS = ema(closes, emaSlow, index);
  const adxVal = adx(candles, adxPeriod, index);

  if (emaF === null || emaS === null || !adxVal) return 'WAIT';

  if (adxVal.adx > adxThreshold) {
    if (emaF > emaS && adxVal.plusDI > adxVal.minusDI) return 'LONG';
    if (emaF < emaS && adxVal.minusDI > adxVal.plusDI) return 'SHORT';
  }
  return 'WAIT';
}

function simulateTrendFollowing(candles, params) {
  const defaults = {
    emaFast: 12, emaSlow: 26, adxPeriod: 14, adxThreshold: 25,
    stopPct: 3.0, takePct: 7.0, riskPct: 1.0
  };
  const p = Object.assign({}, defaults, params);
  let position = null, balance = 10000, peak = 10000, maxDd = 0;
  const trades = [];

  for (let i = p.emaSlow + p.adxPeriod; i < candles.length; i++) {
    const signal = trendFollowingSignal(candles, i, p);
    const close = candles[i].close;

    if (position) {
      const pnlPct = position.side === 'LONG'
        ? (close - position.entry) / position.entry * 100
        : (position.entry - close) / position.entry * 100;

      if (pnlPct <= -p.stopPct) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'stop' });
        position = null;
      } else if (pnlPct >= p.takePct) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'take' });
        position = null;
      } else if (signal === 'WAIT') {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'trend_end' });
        position = null;
      } else if ((position.side === 'LONG' && signal === 'SHORT') || (position.side === 'SHORT' && signal === 'LONG')) {
        balance += balance * (pnlPct / 100);
        trades.push({ pnl: balance * (pnlPct / 100), reason: 'signal' });
        position = null;
      }
    }

    if (!position && signal !== 'WAIT') {
      position = { side: signal, entry: close, bar: i };
    }

    if (balance > peak) peak = balance;
    const dd = (peak - balance) / peak * 100;
    if (dd > maxDd) maxDd = dd;
  }

  return summarizeTrades(trades, balance, maxDd, 'trend-following');
}

// ===== SUMMARIZE =====

function summarizeTrades(trades, finalBalance, maxDd, strategy) {
  if (trades.length === 0) {
    return { strategy, trades: 0, pnl: 0, profitFactor: 0, maxDd: 0, winRate: 0, avgBars: 0 };
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  return {
    strategy,
    trades: trades.length,
    winRate: Number((wins.length / trades.length * 100).toFixed(1)),
    profitFactor: totalLoss > 0 ? Number((totalWin / totalLoss).toFixed(2)) : totalWin > 0 ? 99 : 0,
    pnl: Number((finalBalance - 10000).toFixed(2)),
    maxDd: Number(maxDd.toFixed(2)),
    avgBars: trades.length > 0 ? Math.round(trades.reduce((s, t) => s + (t.bars || 0), 0) / trades.length) : 0,
    totalWin: Number(totalWin.toFixed(2)),
    totalLoss: Number(totalLoss.toFixed(2)),
    wins: wins.length,
    losses: losses.length
  };
}

// ===== PARAM GRIDS FOR SCANNER =====

const STRATEGY_PARAM_GRIDS = {
  momentum: {
    rsiPeriod: [10, 14, 21],
    rocPeriod: [5, 10, 15],
    volPeriod: [15, 20, 30],
    volMultiplier: [1.3, 1.5, 2.0],
    rsiBuy: [50, 55, 60],
    rsiSell: [40, 45, 50],
    stopPct: [2.0, 2.5, 3.0],
    takePct: [4.0, 5.0, 6.0]
  },
  'volatility-breakout': {
    smaPeriod: [15, 20, 30],
    atrPeriod: [10, 14, 20],
    atrMult: [1.0, 1.5, 2.0, 2.5],
    stopPct: [2.5, 3.0, 3.5],
    takePct: [5.0, 6.0, 7.0]
  },
  grid: {
    gridPct: [1.0, 1.5, 2.0, 2.5],
    stopPct: [6.0, 8.0, 10.0],
    takePct: [2.0, 3.0, 4.0],
    maxGridPositions: [3, 5, 7]
  },
  'trend-following': {
    emaFast: [8, 12, 16],
    emaSlow: [21, 26, 34],
    adxPeriod: [10, 14, 20],
    adxThreshold: [20, 25, 30],
    stopPct: [2.5, 3.0, 4.0],
    takePct: [5.0, 7.0, 9.0]
  }
};

module.exports = {
  simulateMomentum,
  simulateVolatilityBreakout,
  simulateGrid,
  simulateTrendFollowing,
  momentumSignal,
  volatilityBreakoutSignal,
  trendFollowingSignal,
  STRATEGY_PARAM_GRIDS
};
