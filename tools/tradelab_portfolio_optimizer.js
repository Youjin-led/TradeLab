/**
 * TradeLab Portfolio Optimizer
 *
 * Оптимизация портфеля paper-кандидатов:
 *
 * 1. Correlation Matrix — реальная матрица корреляций
 * 2. Risk Parity — распределение весов по риску
 * 3. Max Portfolio Heat — ограничение суммарного риска
 * 4. Portfolio-level PnL — агрегированная доходность
 * 5. Rebalancing — рекомендации по ребалансировке
 *
 * Paper-only. Не размещает реальные ордера.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const PORTFOLIO_PATH = path.join(ROOT, 'tradelab-portfolio.json');

// ===== MATH HELPERS =====

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

// ===== STATE =====

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { candidates: {} };
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch { return { candidates: {} }; }
}

function savePortfolio(portfolio) {
  fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
}

// ===== CORRELATION MATRIX =====

/**
 * Build correlation matrix from price returns.
 * candidates: array of { symbol, candles: [{close}] }
 */
function buildCorrelationMatrix(candidates) {
  const returns = {};

  for (const c of candidates) {
    const closes = (c.paperLedger && c.paperLedger.processedCandles) || [];
    if (closes.length < 20) {
      // Fallback: derive from processedCloses in format "time:price"
      const processed = (c.paperLedger && c.paperLedger.processedCloses) || [];
      const prices = processed.map(p => parseFloat(p.split(':')[1])).filter(v => !isNaN(v));
      if (prices.length >= 20) {
        returns[c.symbol] = [];
        for (let i = 1; i < prices.length; i++) {
          returns[c.symbol].push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
      }
    } else {
      returns[c.symbol] = [];
      for (let i = 1; i < closes.length; i++) {
        returns[c.symbol].push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }
    }
  }

  const symbols = Object.keys(returns);
  const matrix = {};

  for (let i = 0; i < symbols.length; i++) {
    matrix[symbols[i]] = {};
    for (let j = 0; j < symbols.length; j++) {
      if (i === j) {
        matrix[symbols[i]][symbols[j]] = 1.0;
      } else if (matrix[symbols[j]] && matrix[symbols[j]][symbols[i]] !== undefined) {
        matrix[symbols[i]][symbols[j]] = matrix[symbols[j]][symbols[i]];
      } else {
        matrix[symbols[i]][symbols[j]] = pearsonCorrelation(returns[symbols[i]], returns[symbols[j]]);
      }
    }
  }

  return { matrix, symbols, returns };
}

// ===== RISK PARITY =====

/**
 * Risk Parity allocation: weight inversely proportional to volatility.
 * Higher volatility → lower weight.
 */
function riskParityWeights(candidates) {
  const weights = {};
  let totalInvVol = 0;

  for (const c of candidates) {
    const processed = (c.paperLedger && c.paperLedger.processedCloses) || [];
    const prices = processed.map(p => parseFloat(p.split(':')[1])).filter(v => !isNaN(v));

    if (prices.length < 20) {
      weights[c.symbol] = 1; // Equal weight fallback
      totalInvVol += 1;
      continue;
    }

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    const vol = stddev(returns);
    const invVol = vol > 0 ? 1 / vol : 1;
    weights[c.symbol] = invVol;
    totalInvVol += invVol;
  }

  // Normalize to sum = 1
  for (const sym of Object.keys(weights)) {
    weights[sym] = weights[sym] / totalInvVol;
  }

  return weights;
}

// ===== PORTFOLIO HEAT =====

function calculatePortfolioHeat(candidates, weights, portfolioValue) {
  let totalHeat = 0;
  for (const c of candidates) {
    const w = weights[c.symbol] || 0;
    const stopPct = c.params?.stopPct || 2.4;
    // Heat = weight * stop% (risk contribution)
    totalHeat += w * stopPct;
  }
  return totalHeat;
}

// ===== PORTFOLIO PnL =====

function aggregatePortfolioPnL(candidates) {
  let totalPnl = 0;
  let totalTrades = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let maxDd = 0;

  const bySymbol = [];

  for (const c of candidates) {
    const pnl = c.forwardPaperPnl || 0;
    const trades = c.forwardPaperTrades || 0;
    const health = c.health?.status || 'Unknown';
    const trades2 = (c.paperLedger && c.paperLedger.trades) || [];
    const wins = trades2.filter(t => t.pnl > 0).length;
    const losses = trades2.filter(t => t.pnl <= 0).length;

    totalPnl += pnl;
    totalTrades += trades;
    totalWins += wins;
    totalLosses += losses;

    if (c.forwardPaperMaxDd > maxDd) maxDd = c.forwardPaperMaxDd;

    bySymbol.push({
      symbol: c.symbol,
      interval: c.interval,
      strategy: c.strategy,
      status: c.status,
      pnl: Number(pnl.toFixed(2)),
      trades,
      health,
      winRate: trades2.length > 0 ? Number((wins / trades2.length * 100).toFixed(1)) : 0,
    });
  }

  return {
    totalPnl: Number(totalPnl.toFixed(2)),
    totalTrades,
    totalWins,
    totalLosses,
    winRate: totalTrades > 0 ? Number((totalWins / (totalWins + totalLosses) * 100).toFixed(1)) : 0,
    maxDd: Number(maxDd.toFixed(2)),
    sharpeRatio: calculateSharpeRatio(candidates),
    bySymbol,
  };
}

function calculateSharpeRatio(candidates, riskFreeRate) {
  const rf = riskFreeRate || 0;
  const returns = [];

  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    for (const t of trades.slice(-20)) {
      returns.push(t.pnlPct || 0);
    }
  }

  if (returns.length < 5) return null;
  const avgReturn = mean(returns);
  const vol = stddev(returns);
  if (vol === 0) return null;
  return Number(((avgReturn - rf) / vol).toFixed(3));
}

// ===== REBALANCING RECOMMENDATIONS =====

function rebalanceRecommendations(candidates, weights, portfolioHeat) {
  const recs = [];

  // 1. Overweight check
  const maxWeight = 0.35; // Max 35% in single position
  for (const [sym, w] of Object.entries(weights)) {
    if (w > maxWeight) {
      recs.push({
        type: 'OVERWEIGHT',
        symbol: sym,
        currentWeight: Number((w * 100).toFixed(1)),
        maxWeight: maxWeight * 100,
        action: `Reduce ${sym} to ${maxWeight * 100}% max`,
        severity: 'warning'
      });
    }
  }

  // 2. Correlation check
  const corrData = buildCorrelationMatrix(candidates);
  for (let i = 0; i < corrData.symbols.length; i++) {
    for (let j = i + 1; j < corrData.symbols.length; j++) {
      const corr = corrData.matrix[corrData.symbols[i]][corrData.symbols[j]];
      if (Math.abs(corr) > 0.8) {
        recs.push({
          type: 'HIGH_CORRELATION',
          pair: `${corrData.symbols[i]} / ${corrData.symbols[j]}`,
          correlation: Number(corr.toFixed(3)),
          action: `Consider removing one of ${corrData.symbols[i]} or ${corrData.symbols[j]}`,
          severity: corr > 0.9 ? 'critical' : 'warning'
        });
      }
    }
  }

  // 3. Heat check
  if (portfolioHeat > 4.0) {
    recs.push({
      type: 'HIGH_HEAT',
      heat: Number(portfolioHeat.toFixed(2)),
      maxHeat: 5.0,
      action: 'Reduce overall position sizes by 25-50%',
      severity: 'critical'
    });
  }

  // 4. Underperforming positions
  for (const c of candidates) {
    if (c.status === 'incubating' && (c.forwardPaperPnl || 0) < -200) {
      recs.push({
        type: 'UNDERPERFORMING',
        symbol: c.symbol,
        pnl: Number((c.forwardPaperPnl || 0).toFixed(2)),
        action: `Review ${c.symbol}: PnL ${c.forwardPaperPnl < 0 ? '' : '+'}${c.forwardPaperPnl?.toFixed(2)}`,
        severity: 'info'
      });
    }
  }

  return recs;
}

// ===== MAIN OPTIMIZER =====

function optimizePortfolio() {
  const state = readState();
  const candidates = Object.values(state.candidates || {}).filter(c => c.status === 'incubating');

  if (candidates.length === 0) {
    const result = { generatedAt: new Date().toISOString(), message: 'No active candidates', allocations: {}, portfolio: null };
    savePortfolio(result);
    return result;
  }

  // 1. Risk Parity weights
  const weights = riskParityWeights(candidates);

  // 2. Portfolio Heat
  const portfolioHeat = calculatePortfolioHeat(candidates, weights, 10000);

  // 3. Aggregate PnL
  const portfolio = aggregatePortfolioPnL(candidates);

  // 4. Rebalancing recommendations
  const recommendations = rebalanceRecommendations(candidates, weights, portfolioHeat);

  // 5. Max concurrent positions check
  const maxPositions = 5;
  const overConcentrated = candidates.length > maxPositions;

  const result = {
    generatedAt: new Date().toISOString(),

    // Allocation
    allocations: Object.fromEntries(
      Object.entries(weights).map(([sym, w]) => [sym, {
        weight: Number((w * 100).toFixed(1)),
        targetUsd: Number((w * 10000).toFixed(2)),
      }])
    ),

    // Risk
    portfolioHeat: {
      heat: Number(portfolioHeat.toFixed(2)),
      maxHeat: 5.0,
      status: portfolioHeat > 5.0 ? 'OVERHEATED' : portfolioHeat > 3.0 ? 'ELEVATED' : 'NORMAL',
    },

    // PnL
    portfolio,

    // Rebalancing
    recommendations,
    overConcentrated,

    // Correlation
    correlationMatrix: buildCorrelationMatrix(candidates),
  };

  savePortfolio(result);
  return result;
}

// ===== REPORT =====

function generatePortfolioReport(result) {
  const lines = [];
  lines.push('# Portfolio Optimization Report');
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push('');

  if (result.message) {
    lines.push(result.message);
    return lines.join('\n');
  }

  // Allocations
  lines.push('## Risk Parity Allocation');
  lines.push('| Symbol | Weight | Target USD |');
  lines.push('| --- | --- | --- |');
  for (const [sym, alloc] of Object.entries(result.allocations)) {
    lines.push(`| ${sym} | ${alloc.weight}% | ${alloc.targetUsd} |`);
  }
  lines.push('');

  // Heat
  lines.push('## Portfolio Heat');
  lines.push(`- Heat: ${result.portfolioHeat.heat}% / ${result.portfolioHeat.maxHeat}%`);
  lines.push(`- Status: ${result.portfolioHeat.status}`);
  lines.push('');

  // PnL
  lines.push('## Portfolio PnL');
  lines.push(`- Total PnL: ${result.portfolio.totalPnl >= 0 ? '+' : ''}${result.portfolio.totalPnl} USDT`);
  lines.push(`- Trades: ${result.portfolio.totalTrades} (W:${result.portfolio.totalWins} / L:${result.portfolio.totalLosses})`);
  lines.push(`- Win Rate: ${result.portfolio.winRate}%`);
  lines.push(`- Max DD: ${result.portfolio.maxDd}%`);
  lines.push(`- Sharpe Ratio: ${result.portfolio.sharpeRatio || 'N/A'}`);
  lines.push('');

  if (result.recommendations.length > 0) {
    lines.push('## Recommendations');
    for (const r of result.recommendations) {
      const emoji = r.severity === 'critical' ? '🔴' : r.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`- ${emoji} ${r.type}: ${r.action}`);
    }
    lines.push('');
  }

  lines.push('*Paper-only portfolio optimization. Not investment advice.*');
  return lines.join('\n');
}

// ===== MAIN =====

if (require.main === module) {
  const result = optimizePortfolio();
  const report = generatePortfolioReport(result);
  console.log(report);
}

module.exports = {
  optimizePortfolio,
  buildCorrelationMatrix,
  riskParityWeights,
  calculatePortfolioHeat,
  aggregatePortfolioPnL,
  calculateSharpeRatio,
  rebalanceRecommendations,
  generatePortfolioReport,
};
