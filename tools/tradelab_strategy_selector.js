/**
 * TradeLab Strategy Selector
 *
 * Автоматически выбирает лучшую стратегию под текущую фазу рынка.
 * Комбинирует: фаза рынка + historical performance + текущий momentum.
 */

const { detectPhase, atrPct } = require('./tradelab_market_phase');

// ===== STRATEGY RULES =====

const STRATEGY_RULES = {
  'sma-rsi': {
    // Works in: trending, ranging (not extreme volatility)
    suitable: ['strong-trending', 'mild-trending', 'ranging'],
    avoid: ['volatile-ranging', 'volatile-trending'],
    minADX: 15,
    maxATR: 5.0,
    description: 'SMA crossover + RSI. Works in most conditions.'
  },
  'breakout': {
    // Works in: trending only
    suitable: ['strong-trending', 'mild-trending'],
    avoid: ['ranging', 'volatile-ranging'],
    minADX: 25,
    maxATR: 6.0,
    description: 'Price breakout from range. Needs trend.'
  },
  'mean-reversion': {
    // Works in: ranging only
    suitable: ['ranging', 'volatile-ranging'],
    avoid: ['strong-trending', 'mild-trending'],
    minADX: 0,
    maxATR: 4.0,
    description: 'Buy oversold, sell overbought. Needs range.'
  },
  'momentum': {
    // Works in: strong trends with volume
    suitable: ['strong-trending'],
    avoid: ['ranging', 'volatile-ranging'],
    minADX: 30,
    maxATR: 5.0,
    description: 'RSI + ROC + Volume surge. Strong trends only.'
  },
  'trend-following': {
    // Works in: strong trends
    suitable: ['strong-trending', 'mild-trending'],
    avoid: ['ranging', 'volatile-ranging'],
    minADX: 25,
    maxATR: 5.0,
    description: 'ADX + EMA crossover. Trend confirmation.'
  },
  'volatility-breakout': {
    // Works in: volatile markets
    suitable: ['volatile-trending', 'volatile-ranging'],
    avoid: ['ranging'],
    minADX: 15,
    maxATR: 10.0,
    description: 'ATR band breakout. Volatile markets.'
  }
};

// ===== HISTORICAL PERFORMANCE =====

function getHistoricalPerformance(candidates) {
  const perf = {};
  for (const c of candidates) {
    const strat = c.strategy;
    if (!perf[strat]) perf[strat] = { pnl: 0, trades: 0, wins: 0 };
    perf[strat].pnl += (c.forwardPaperPnl || 0);
    perf[strat].trades += Number(c.forwardPaperTrades) || 0;
    if ((c.forwardPaperPnl || 0) > 0) perf[strat].wins++;
  }
  // Calculate win rate and score
  for (const [strat, p] of Object.entries(perf)) {
    p.winRate = p.trades > 0 ? p.wins / p.trades : 0;
    p.score = p.pnl > 0 ? p.pnl * p.winRate : p.pnl * 0.5;
  }
  return perf;
}

// ===== SELECT BEST STRATEGY =====

function selectStrategy(candles, candidates, options = {}) {
  const phase = detectPhase(candles);
  const atr = atrPct(candles, 14);
  const perf = getHistoricalPerformance(candidates || []);

  const scored = [];

  for (const [name, rules] of Object.entries(STRATEGY_RULES)) {
    // Check phase suitability
    const phaseMatch = rules.suitable.some(s => phase.phase.includes(s));
    const phaseAvoid = rules.avoid.some(a => phase.phase.includes(a));

    // Check ADX
    const adxOk = phase.adx >= rules.minADX;

    // Check ATR
    const atrOk = atr <= rules.maxATR;

    // Historical performance
    const historical = perf[name] || { score: 0, winRate: 0 };
    const historicalScore = historical.score || 0;

    // Composite score
    let score = 0;
    if (phaseMatch) score += 40;
    if (phaseAvoid) score -= 30;
    if (adxOk) score += 20;
    if (atrOk) score += 10;
    score += Math.min(historicalScore / 100, 30); // Cap historical bonus at 30

    scored.push({
      name,
      score,
      phaseMatch,
      phaseAvoid,
      adxOk,
      atrOk,
      historical: historical.winRate,
      description: rules.description
    });
  }

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  return {
    selected: scored[0],
    alternatives: scored.slice(1, 3),
    phase,
    atr,
    allScores: scored
  };
}

// ===== RECOMMEND RISK ADJUSTMENT =====

function recommendRiskAdjustment(phase, atr, strategy) {
  const rec = {
    riskPct: 0.5,    // Base: 0.5%
    stopPct: 3.5,    // Base: 3.5%
    takePct: 5.0,    // Base: 5.0%
    maxPositions: 3
  };

  // High volatility: reduce risk
  if (atr > 4.0) {
    rec.riskPct = 0.3;
    rec.stopPct = 4.5;
    rec.maxPositions = 2;
  }

  // Low volatility: slightly more aggressive
  if (atr < 1.5) {
    rec.riskPct = 0.7;
    rec.stopPct = 2.5;
    rec.takePct = 4.0;
  }

  // Strong trend: allow more positions
  if (phase.phase.includes('strong-trending')) {
    rec.maxPositions = 4;
  }

  return rec;
}

module.exports = {
  selectStrategy,
  recommendRiskAdjustment,
  getHistoricalPerformance,
  STRATEGY_RULES
};
