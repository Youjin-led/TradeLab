/**
 * TradeLab Telemetry Dashboard
 *
 * Аналитика и метрики для мониторинга:
 *
 * 1. Strategy Performance — PnL, PF, Win Rate по каждой стратегии
 * 2. Time Analysis — PnL по времени суток и дням недели
 * 3. Equity Curve — данных для построения графика
 * 4. Risk-Adjusted Metrics — Sharpe, Sortino, Calmar
 * 5. Trade Distribution — распределение сделок по размеру/длительности
 *
 * Paper-only. Генерирует JSON для визуализации.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const TELEMETRY_PATH = path.join(ROOT, 'tradelab-telemetry.json');

// ===== STATE =====

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { candidates: {} };
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch { return { candidates: {} }; }
}

// ===== ANALYTICS =====

function analyzeByStrategy(candidates) {
  const strategies = {};

  for (const c of candidates) {
    const key = c.strategy || 'unknown';
    if (!strategies[key]) {
      strategies[key] = {
        totalPnl: 0, trades: 0, wins: 0, losses: 0,
        maxDd: 0, symbols: [], forwardPnl: 0, forwardTrades: 0,
        avgHoldBars: 0, totalHoldBars: 0,
      };
    }

    const s = strategies[key];
    const trades = (c.paperLedger && c.paperLedger.trades) || [];

    for (const t of trades) {
      s.totalPnl += t.pnl || 0;
      s.trades++;
      if (t.pnl > 0) s.wins++; else s.losses++;
      s.totalHoldBars += t.bars || 0;
    }

    s.forwardPnl += c.forwardPaperPnl || 0;
    s.forwardTrades += c.forwardPaperTrades || 0;
    if ((c.forwardPaperMaxDd || 0) > s.maxDd) s.maxDd = c.forwardPaperMaxDd;
    if (!s.symbols.includes(c.symbol)) s.symbols.push(c.symbol);
  }

  // Compute derived metrics
  for (const s of Object.values(strategies)) {
    s.winRate = s.trades > 0 ? Number((s.wins / s.trades * 100).toFixed(1)) : 0;
    const totalWin = 0, totalLoss = 0; // Would need per-trade data
    s.avgHoldBars = s.trades > 0 ? Math.round(s.totalHoldBars / s.trades) : 0;
    s.avgPnlPerTrade = s.trades > 0 ? Number((s.totalPnl / s.trades).toFixed(2)) : 0;
  }

  return strategies;
}

function analyzeByTimeOfDay(candidates) {
  const hourPnl = new Array(24).fill(0);
  const hourCount = new Array(24).fill(0);

  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    for (const t of trades) {
      // Parse entry time (format: "2026-06-03 04:00")
      const timeStr = t.entryTime || '';
      const hourMatch = timeStr.match(/(\d{2}):\d{2}$/);
      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        hourPnl[hour] += t.pnl || 0;
        hourCount[hour]++;
      }
    }
  }

  const result = {};
  for (let h = 0; h < 24; h++) {
    result[h] = {
      pnl: Number(hourPnl[h].toFixed(2)),
      trades: hourCount[h],
      avgPnl: hourCount[h] > 0 ? Number((hourPnl[h] / hourCount[h]).toFixed(2)) : 0,
    };
  }
  return result;
}

function analyzeByDayOfWeek(candidates) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayPnl = new Array(7).fill(0);
  const dayCount = new Array(7).fill(0);

  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    for (const t of trades) {
      const timeStr = t.entryTime || '';
      if (timeStr) {
        const date = new Date(timeStr.replace(' ', 'T') + 'Z');
        if (!isNaN(date.getTime())) {
          const day = date.getDay();
          dayPnl[day] += t.pnl || 0;
          dayCount[day]++;
        }
      }
    }
  }

  const result = {};
  for (let d = 0; d < 7; d++) {
    result[dayNames[d]] = {
      pnl: Number(dayPnl[d].toFixed(2)),
      trades: dayCount[d],
      avgPnl: dayCount[d] > 0 ? Number((dayPnl[d] / dayCount[d]).toFixed(2)) : 0,
    };
  }
  return result;
}

function buildEquityCurve(candidates) {
  // Merge all trades chronologically
  const allTrades = [];
  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    for (const t of trades) {
      if (t.exitTime) {
        allTrades.push({
          time: t.exitTime,
          pnl: t.pnl || 0,
          symbol: c.symbol,
          strategy: c.strategy,
          side: t.side,
        });
      }
    }
  }

  allTrades.sort((a, b) => a.time.localeCompare(b.time));

  let equity = 10000;
  const curve = [{ time: 'start', equity: 10000, pnl: 0 }];

  for (const t of allTrades) {
    equity += t.pnl;
    curve.push({
      time: t.time,
      equity: Number(equity.toFixed(2)),
      pnl: Number(t.pnl.toFixed(2)),
      symbol: t.symbol,
      strategy: t.strategy,
    });
  }

  return curve;
}

function riskAdjustedMetrics(candidates) {
  const allReturns = [];

  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    for (const t of trades) {
      if (t.pnlPct !== undefined) {
        allReturns.push(t.pnlPct / 100);
      }
    }
  }

  if (allReturns.length < 5) return null;

  const n = allReturns.length;
  const avgReturn = allReturns.reduce((s, v) => s + v, 0) / n;
  const vol = Math.sqrt(allReturns.reduce((s, v) => s + (v - avgReturn) ** 2, 0) / n);

  // Sharpe Ratio (annualized, assuming daily)
  const riskFreeDaily = 0.0001; // ~3.65% annual
  const sharpe = vol > 0 ? (avgReturn - riskFreeDaily) / vol * Math.sqrt(252) : 0;

  // Sortino Ratio (downside deviation only)
  const negativeReturns = allReturns.filter(r => r < 0);
  const downsideDev = negativeReturns.length > 0
    ? Math.sqrt(negativeReturns.reduce((s, v) => s + v ** 2, 0) / negativeReturns.length)
    : 0.001;
  const sortino = downsideDev > 0 ? (avgReturn - riskFreeDaily) / downsideDev * Math.sqrt(252) : 0;

  // Max drawdown from equity curve
  const equity = buildEquityCurve(candidates);
  let peak = 10000, maxDd = 0;
  for (const point of equity) {
    if (point.equity > peak) peak = point.equity;
    const dd = (peak - point.equity) / peak;
    if (dd > maxDd) maxDd = dd;
  }

  // Calmar Ratio = annualized return / max drawdown
  const annualizedReturn = avgReturn * 252;
  const calmar = maxDd > 0 ? annualizedReturn / maxDd : 0;

  return {
    sharpeRatio: Number(sharpe.toFixed(3)),
    sortinoRatio: Number(sortino.toFixed(3)),
    calmarRatio: Number(calmar.toFixed(3)),
    maxDrawdown: Number((maxDd * 100).toFixed(2)),
    avgDailyReturn: Number((avgReturn * 100).toFixed(4)),
    dailyVolatility: Number((vol * 100).toFixed(4)),
    annualizedReturn: Number((annualizedReturn * 100).toFixed(2)),
    totalTrades: n,
  };
}

function tradeDistribution(candidates) {
  const allTrades = [];
  for (const c of candidates) {
    const trades = (c.paperLedger && c.paperLedger.trades) || [];
    for (const t of trades) {
      allTrades.push(t);
    }
  }

  if (allTrades.length === 0) return null;

  // PnL distribution
  const pnls = allTrades.map(t => t.pnl || 0);
  const sortedPnls = [...pnls].sort((a, b) => a - b);

  // Hold time distribution
  const holdBars = allTrades.map(t => t.bars || 0).filter(b => b > 0);

  // Win/loss streaks
  let maxWinStreak = 0, maxLossStreak = 0;
  let currentWin = 0, currentLoss = 0;
  for (const t of allTrades) {
    if (t.pnl > 0) {
      currentWin++;
      currentLoss = 0;
      if (currentWin > maxWinStreak) maxWinStreak = currentWin;
    } else {
      currentLoss++;
      currentWin = 0;
      if (currentLoss > maxLossStreak) maxLossStreak = currentLoss;
    }
  }

  return {
    totalTrades: allTrades.length,
    pnls: {
      min: Number(sortedPnls[0]?.toFixed(2) || 0),
      max: Number(sortedPnls[sortedPnls.length - 1]?.toFixed(2) || 0),
      median: Number(sortedPnls[Math.floor(sortedPnls.length / 2)]?.toFixed(2) || 0),
      avg: Number((pnls.reduce((s, v) => s + v, 0) / pnls.length).toFixed(2)),
      stdDev: Number(Math.sqrt(pnls.reduce((s, v) => s + (v - pnls.reduce((a, b) => a + b, 0) / pnls.length) ** 2, 0) / pnls.length).toFixed(2)),
    },
    holdTime: {
      avgBars: holdBars.length > 0 ? Math.round(holdBars.reduce((s, v) => s + v, 0) / holdBars.length) : 0,
      minBars: holdBars.length > 0 ? Math.min(...holdBars) : 0,
      maxBars: holdBars.length > 0 ? Math.max(...holdBars) : 0,
    },
    streaks: {
      maxWinStreak,
      maxLossStreak,
    },
  };
}

// ===== MAIN =====

function generateTelemetry() {
  const state = readState();
  const candidates = Object.values(state.candidates || {});

  const telemetry = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCandidates: candidates.length,
      live: candidates.filter(c => c.status === 'incubating').length,
      quarantined: candidates.filter(c => c.status === 'quarantined').length,
      rejected: candidates.filter(c => c.status === 'rejected').length,
      readyForReview: candidates.filter(c => c.status === 'ready-for-review').length,
    },

    byStrategy: analyzeByStrategy(candidates),
    byTimeOfDay: analyzeByTimeOfDay(candidates),
    byDayOfWeek: analyzeByDayOfWeek(candidates),
    equityCurve: buildEquityCurve(candidates),
    riskAdjusted: riskAdjustedMetrics(candidates),
    distribution: tradeDistribution(candidates),
  };

  fs.writeFileSync(TELEMETRY_PATH, JSON.stringify(telemetry, null, 2));
  return telemetry;
}

// ===== CONSOLE DASHBOARD =====

function printDashboard(telemetry) {
  const t = telemetry || generateTelemetry();

  console.log('\n========================================');
  console.log('   TradeLab Telemetry Dashboard');
  console.log(`   ${t.generatedAt}`);
  console.log('========================================\n');

  console.log('SUMMARY');
  console.log(`  Live: ${t.summary.live} | Quarantined: ${t.summary.quarantined} | Rejected: ${t.summary.rejected}`);

  if (t.riskAdjusted) {
    console.log('\nRISK-ADJUSTED METRICS');
    console.log(`  Sharpe Ratio:   ${t.riskAdjusted.sharpeRatio}`);
    console.log(`  Sortino Ratio:  ${t.riskAdjusted.sortinoRatio}`);
    console.log(`  Calmar Ratio:   ${t.riskAdjusted.calmarRatio}`);
    console.log(`  Max Drawdown:   ${t.riskAdjusted.maxDrawdown}%`);
    console.log(`  Annualized Ret: ${t.riskAdjusted.annualizedReturn}%`);
  }

  console.log('\nBY STRATEGY');
  for (const [name, s] of Object.entries(t.byStrategy)) {
    console.log(`  ${name}: PnL ${s.forwardPnl >= 0 ? '+' : ''}${s.forwardPnl.toFixed(2)} | WR ${s.winRate}% | Trades ${s.trades} | MaxDD ${s.maxDd.toFixed(2)}%`);
  }

  if (t.distribution) {
    console.log('\nTRADE DISTRIBUTION');
    console.log(`  Median PnL: ${t.distribution.pnls.median} | Avg: ${t.distribution.pnls.avg} | StdDev: ${t.distribution.pnls.stdDev}`);
    console.log(`  Win/Loss Streaks: ${t.distribution.streaks.maxWinStreak}W / ${t.distribution.streaks.maxLossStreak}L`);
  }

  // Best/worst hours
  const hours = Object.entries(t.byTimeOfDay);
  const bestHour = hours.reduce((best, [h, d]) => d.trades > 0 && d.avgPnl > (best.avgPnl || -Infinity) ? { hour: h, ...d } : best, {});
  const worstHour = hours.reduce((worst, [h, d]) => d.trades > 0 && d.avgPnl < (worst.avgPnl || Infinity) ? { hour: h, ...d } : worst, {});

  if (bestHour.hour !== undefined) {
    console.log('\nTIME ANALYSIS');
    console.log(`  Best Hour:  ${bestHour.hour}:00 (avg ${bestHour.avgPnl} PnL)`);
    console.log(`  Worst Hour: ${worstHour.hour}:00 (avg ${worstHour.avgPnl} PnL)`);
  }

  console.log('\n========================================\n');
}

// ===== MAIN =====

if (require.main === module) {
  const telemetry = generateTelemetry();
  printDashboard(telemetry);
}

module.exports = {
  generateTelemetry,
  printDashboard,
  analyzeByStrategy,
  analyzeByTimeOfDay,
  analyzeByDayOfWeek,
  buildEquityCurve,
  riskAdjustedMetrics,
  tradeDistribution,
};
