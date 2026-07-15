/**
 * TradeLab Risk Manager
 * 
 * Автоматический портфельный стоп-лосс и управление рисками.
 * 
 * Функции:
 * - Portfolio Stop-Loss: принудительный выход из всех позиций при достижении лимита
 * - Daily Loss Limit: остановка торговли на день при превышении дневного лимита
 * - Position Sizing: автоматический расчёт размера позиции на основе волатильности
 * - Correlation Guard: блокировка слишком коррелированных позиций
 * - Margin Monitor: отслеживание маржинальных требований
 * 
 * Все операции paper-only. Реальные ордера не размещаются.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const RISK_LOG_PATH = path.join(ROOT, 'tradelab-risk-manager.json');
const RISK_REPORT_PATH = path.join(ROOT, 'TRADELAB_RISK_MANAGER.md');

// ===== КОНФИГУРАЦИЯ =====

const RISK_CONFIG = {
  // Портфельный стоп-лосс
  portfolioStopLoss: {
    // Максимальный суммарный убыток портфеля (USDT)
    maxPortfolioLoss: -5000,
    // Максимальный убыток за день (USDT)
    maxDailyLoss: -1000,
    // Максимальный убыток за неделю (USDT)
    maxWeeklyLoss: -2500,
    // Максимальный убыток за месяц (USDT)
    maxMonthlyLoss: -5000,
  },

  // Размер позиции
  positionSizing: {
    // Базовая риск-единица на одну позицию (% от портфеля)
    baseRiskPerPosition: 2.0,
    // Максимальная риск-единица на одну позицию
    maxRiskPerPosition: 5.0,
    // Минимальная риск-единица на одну позицию
    minRiskPerPosition: 0.5,
    // Множитель для волатильных инструментов
    volatilityMultiplier: 0.5,
    // Множитель для низколиквидных инструментов
    liquidityMultiplier: 0.7,
  },

  // Корреляционный guard
  correlationGuard: {
    // Максимальная корреляция между двумя позициями
    maxCorrelation: 0.7,
    // Максимальное количество позиций в одном секторе
    maxSectorExposure: 3,
    // Окно для расчёта корреляции (в свечах)
    correlationWindow: 100,
  },

  // Маржинальный монитор
  marginMonitor: {
    // Минимальный уровень маржи (%)
    minMarginLevel: 150,
    // Критический уровень маржи (%)
    criticalMarginLevel: 110,
    // Маржинальный колл при достижении этого уровня
    marginCallLevel: 100,
  },

  // Стоп-лоссы для отдельных позиций
  stopLossDefaults: {
    // Базовый стоп-лосс (%)
    baseStopPct: 5,
    // Трейлинг стоп-лосс (активируется при +3% прибыли)
    trailingStopActivationPct: 3,
    // Шаг трейлинга (%)
    trailingStopStep: 1,
    // Максимальный стоп-лосс (%)
    maxStopPct: 10,
  },

  // Ограничения на количество позиций
  positionLimits: {
    // Максимальное количество одновременных позиций
    maxConcurrentPositions: 5,
    // Максимальное количество позиций в одном инструменте
    maxPositionsPerSymbol: 1,
    // Максимальная экспозиция на один инструмент (%)
    maxExposurePerSymbol: 15,
  }
};

// ===== СОСТОЯНИЕ =====

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { candidates: {}, summary: null };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function readRiskState() {
  if (!fs.existsSync(RISK_LOG_PATH)) return getDefaultRiskState();
  try {
    return JSON.parse(fs.readFileSync(RISK_LOG_PATH, 'utf8'));
  } catch {
    return getDefaultRiskState();
  }
}

function getDefaultRiskState() {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // Ежедневный счётчик убытков
    dailyLoss: 0,
    dailyLossDate: new Date().toISOString().slice(0, 10),
    // Еженедельный счётчик убытков
    weeklyLoss: 0,
    weeklyLossWeek: getWeekNumber(new Date()),
    // Ежемесячный счётчик убытков
    monthlyLoss: 0,
    monthlyLossMonth: new Date().getMonth(),
    // История стоп-лоссов
    stopLossHistory: [],
    // Активные трейлинг-стопы
    trailingStops: {},
    // Блокировки
    locks: {
      dailyLossLock: false,
      weeklyLossLock: false,
      monthlyLossLock: false,
      portfolioStopLossLock: false,
    },
    // Статистика
    stats: {
      totalStopLossesTriggered: 0,
      totalTrailingStopsTriggered: 0,
      totalCorrelationBlocks: 0,
      totalMarginWarnings: 0,
    }
  };
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function saveRiskState(riskState) {
  riskState.updatedAt = new Date().toISOString();
  fs.writeFileSync(RISK_LOG_PATH, JSON.stringify(riskState, null, 2));
}

// ===== ПОРТФЕЛЬНЫЙ СТОП-ЛОСС =====

function checkPortfolioStopLoss(state, riskState) {
  const candidates = Object.values(state.candidates || {});
  const totalPnl = candidates.reduce((sum, c) => sum + (c.forwardPaperPnl || 0), 0);
  const config = RISK_CONFIG.portfolioStopLoss;
  const reasons = [];

  // Проверка общего убытка портфеля
  if (totalPnl <= config.maxPortfolioLoss) {
    reasons.push(`Portfolio PnL ${totalPnl.toFixed(2)} <= ${config.maxPortfolioLoss} (max portfolio loss)`);
  }

  // Проверка дневного лимита
  const today = new Date().toISOString().slice(0, 10);
  if (riskState.dailyLossDate !== today) {
    riskState.dailyLoss = 0;
    riskState.dailyLossDate = today;
    riskState.locks.dailyLossLock = false;
  }
  if (riskState.dailyLoss <= config.maxDailyLoss) {
    riskState.locks.dailyLossLock = true;
    reasons.push(`Daily loss ${riskState.dailyLoss.toFixed(2)} <= ${config.maxDailyLoss} (daily limit)`);
  }

  // Проверка недельного лимита
  const currentWeek = getWeekNumber(new Date());
  if (riskState.weeklyLossWeek !== currentWeek) {
    riskState.weeklyLoss = 0;
    riskState.weeklyLossWeek = currentWeek;
    riskState.locks.weeklyLossLock = false;
  }
  if (riskState.weeklyLoss <= config.maxWeeklyLoss) {
    riskState.locks.weeklyLossLock = true;
    reasons.push(`Weekly loss ${riskState.weeklyLoss.toFixed(2)} <= ${config.maxWeeklyLoss} (weekly limit)`);
  }

  // Проверка месячного лимита
  const currentMonth = new Date().getMonth();
  if (riskState.monthlyLossMonth !== currentMonth) {
    riskState.monthlyLoss = 0;
    riskState.monthlyLossMonth = currentMonth;
    riskState.locks.monthlyLossLock = false;
  }
  if (riskState.monthlyLoss <= config.maxMonthlyLoss) {
    riskState.locks.monthlyLossLock = true;
    reasons.push(`Monthly loss ${riskState.monthlyLoss.toFixed(2)} <= ${config.maxMonthlyLoss} (monthly limit)`);
  }

  const isTriggered = reasons.length > 0;
  if (isTriggered) {
    riskState.locks.portfolioStopLossLock = true;
    riskState.stats.totalStopLossesTriggered++;
    riskState.stopLossHistory.push({
      timestamp: new Date().toISOString(),
      type: 'portfolio_stop_loss',
      totalPnl,
      reasons,
      action: 'ALL_PAPER_POSITIONS_FROZEN'
    });
  }

  saveRiskState(riskState);

  return {
    triggered: isTriggered,
    totalPnl,
    reasons,
    locks: riskState.locks,
    action: isTriggered
      ? 'EMERGENCY: All paper positions frozen. Manual review required.'
      : 'OK: Portfolio within risk limits.'
  };
}

// ===== РАСЧЁТ РАЗМЕРА ПОЗИЦИИ =====

function calculatePositionSize(candidate, portfolioValue, allCandidates) {
  const config = RISK_CONFIG.positionSizing;
  const volatility = candidate.volatility || 0;
  const atr = candidate.atr || 0;
  const price = candidate.currentPrice || 100;

  // Базовая риск-единица
  let riskPct = config.baseRiskPerPosition;

  // Kelly criterion: use historical win rate and avg win/loss
  const trades = (candidate.paperLedger && candidate.paperLedger.trades) || [];
  if (trades.length >= 10) {
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const winRate = wins.length / trades.length;
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 1;
    const kelly = kellyCriterion(winRate, avgWin, avgLoss, 0.25);
    // Use Kelly as risk% if higher than minimum
    const kellyRiskPct = kelly * 100;
    if (kellyRiskPct > config.minRiskPerPosition) {
      riskPct = kellyRiskPct;
    }
  }

  // Корректировка на волатильность
  if (volatility > 0.05) {
    riskPct *= config.volatilityMultiplier;
  }

  // Корректировка на ликвидность
  const volume = candidate.volume || 0;
  if (volume < 1000000) {
    riskPct *= config.liquidityMultiplier;
  }

  // Portfolio heat check: reduce risk if portfolio is already hot
  if (allCandidates && portfolioValue) {
    const heat = calculatePortfolioHeat(allCandidates, portfolioValue);
    if (heat > 4.0) { // > 4% portfolio heat — reduce position sizes
      riskPct *= 0.5;
    } else if (heat > 2.5) {
      riskPct *= 0.75;
    }
  }

  // Ограничения
  riskPct = Math.max(config.minRiskPerPosition, Math.min(config.maxRiskPerPosition, riskPct));

  const positionSize = portfolioValue * (riskPct / 100);
  const positionUnits = positionSize / price;
  const stopPct = candidate.stopPct || candidate.params?.stopPct || RISK_CONFIG.stopLossDefaults.baseStopPct;
  const stopPrice = price * (1 - stopPct / 100);
  const stopLossAmount = positionSize * (stopPct / 100);

  // Kelly info for reporting
  const trades2 = (candidate.paperLedger && candidate.paperLedger.trades) || [];
  const wins2 = trades2.filter(t => t.pnl > 0);
  const losses2 = trades2.filter(t => t.pnl < 0);
  const winRate = trades2.length >= 10 ? wins2.length / trades2.length : null;
  const avgWin = wins2.length > 0 ? wins2.reduce((s, t) => s + t.pnl, 0) / wins2.length : null;
  const avgLoss = losses2.length > 0 ? Math.abs(losses2.reduce((s, t) => s + t.pnl, 0) / losses2.length) : null;
  const kellyPct = winRate !== null ? kellyCriterion(winRate, avgWin, avgLoss, 0.25) * 100 : null;

  return {
    symbol: candidate.symbol,
    strategy: candidate.strategy,
    interval: candidate.interval,
    portfolioValue,
    riskPct: Number(riskPct.toFixed(2)),
    positionSize: Number(positionSize.toFixed(2)),
    positionUnits: Number(positionUnits.toFixed(6)),
    entryPrice: Number(price.toFixed(2)),
    stopPrice: Number(stopPrice.toFixed(2)),
    stopLossAmount: Number(stopLossAmount.toFixed(2)),
    volatility: Number(volatility.toFixed(4)),
    atr: Number(atr.toFixed(4)),
    kelly: kellyPct !== null ? Number(kellyPct.toFixed(2)) : 'N/A (need 10+ trades)',
    winRate: winRate !== null ? Number((winRate * 100).toFixed(1)) + '%' : 'N/A',
  };
}

// ===== КОРРЕЛЯЦИОННЫЙ GUARD (Real Correlation) =====

/**
 * Pearson correlation between two price series.
 */
function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

/**
 * Calculate portfolio heat: total risk as % of portfolio.
 * heat = sum(|position_risk|) / portfolio_value * 100
 */
function calculatePortfolioHeat(candidates, portfolioValue) {
  if (!portfolioValue || portfolioValue <= 0) return 0;
  let totalRisk = 0;
  for (const c of candidates) {
    if (c.status !== 'incubating') continue;
    const stopPct = c.params?.stopPct || 2.4;
    const riskPct = c.params?.riskPct || 1.2;
    // Heat per position = risk% * stop% (worst-case loss as % of position)
    totalRisk += riskPct * (stopPct / 100);
  }
  return totalRisk;
}

/**
 * Kelly criterion: optimal bet size = (winRate * avgWin - (1-winRate) * avgLoss) / avgWin
 * Capped at maxKellyFraction to avoid over-betting.
 */
function kellyCriterion(winRate, avgWin, avgLoss, maxFraction) {
  if (avgWin <= 0 || avgLoss <= 0) return 0;
  const b = avgWin / avgLoss; // payoff ratio
  const kelly = (winRate * b - (1 - winRate)) / b;
  // Half-Kelly is more conservative and practical
  return Math.max(0, Math.min(maxFraction || 0.25, kelly * 0.5));
}

function checkCorrelation(candidates, candleCache) {
  const config = RISK_CONFIG.correlationGuard;
  const activeCandidates = candidates.filter(c => c.status === 'incubating');
  const warnings = [];
  const blocks = [];
  const correlationPairs = [];

  // Real correlation matrix if candle data available
  if (candleCache && Object.keys(candleCache).length >= 2) {
    const symbols = Object.keys(candleCache);
    for (let i = 0; i < symbols.length; i++) {
      for (let j = i + 1; j < symbols.length; j++) {
        const closesA = candleCache[symbols[i]];
        const closesB = candleCache[symbols[j]];
        if (!closesA || !closesB || closesA.length < 20 || closesB.length < 20) continue;
        // Take returns, not raw prices
        const returnsA = [];
        const returnsB = [];
        const len = Math.min(closesA.length, closesB.length);
        for (let k = 1; k < len; k++) {
          returnsA.push((closesA[k] - closesA[k - 1]) / closesA[k - 1]);
          returnsB.push((closesB[k] - closesB[k - 1]) / closesB[k - 1]);
        }
        const corr = pearsonCorrelation(returnsA, returnsB);
        correlationPairs.push({ a: symbols[i], b: symbols[j], correlation: Number(corr.toFixed(3)) });

        if (Math.abs(corr) > config.maxCorrelation) {
          // Check if both symbols have active positions
          const aActive = activeCandidates.some(c => c.symbol === symbols[i]);
          const bActive = activeCandidates.some(c => c.symbol === symbols[j]);
          if (aActive && bActive) {
            warnings.push({
              type: 'high_correlation',
              pair: `${symbols[i]} / ${symbols[j]}`,
              correlation: Number(corr.toFixed(3)),
              maxAllowed: config.maxCorrelation,
              severity: Math.abs(corr) > 0.85 ? 'block' : 'warning'
            });
            if (Math.abs(corr) > 0.85) {
              blocks.push({
                type: 'high_correlation_block',
                pair: `${symbols[i]} / ${symbols[j]}`,
                correlation: Number(corr.toFixed(3)),
                severity: 'block'
              });
            }
          }
        }
      }
    }
  }

  // Sector grouping (fallback/secondary)
  const sectors = {};
  for (const c of activeCandidates) {
    const sector = getSector(c.symbol);
    if (!sectors[sector]) sectors[sector] = [];
    sectors[sector].push(c);
  }

  for (const [sector, sectorCandidates] of Object.entries(sectors)) {
    if (sectorCandidates.length > config.maxSectorExposure) {
      warnings.push({
        type: 'sector_overexposure',
        sector,
        count: sectorCandidates.length,
        maxAllowed: config.maxSectorExposure,
        candidates: sectorCandidates.map(c => `${c.symbol} ${c.interval} ${c.strategy}`),
        severity: 'warning'
      });
    }
  }

  if (activeCandidates.length > RISK_CONFIG.positionLimits.maxConcurrentPositions) {
    blocks.push({
      type: 'max_concurrent_positions',
      current: activeCandidates.length,
      maxAllowed: RISK_CONFIG.positionLimits.maxConcurrentPositions,
      severity: 'block'
    });
  }

  return {
    ok: blocks.length === 0,
    warnings,
    blocks,
    activeCount: activeCandidates.length,
    sectorDistribution: Object.fromEntries(
      Object.entries(sectors).map(([s, c]) => [s, c.length])
    ),
    correlationMatrix: correlationPairs
  };
}

function getSector(symbol) {
  const btcLike = ['BTC', 'ETH', 'BNB'];
  const altLarge = ['SOL', 'XRP', 'ADA', 'DOGE', 'LINK', 'AVAX', 'DOT', 'MATIC'];
  const altMid = ['ATOM', 'NEAR', 'APT', 'INJ', 'JUP', 'OP', 'RENDER', 'SEI', 'FIL', 'TRX'];
  const altSmall = ['FET', 'AGIX', 'OCEAN', 'GRT', 'ARB', 'BLUR', 'SUI', 'TIA'];

  const base = symbol.replace(/USDT$/, '');
  if (btcLike.includes(base)) return 'blue_chip';
  if (altLarge.includes(base)) return 'alt_large';
  if (altMid.includes(base)) return 'alt_mid';
  if (altSmall.includes(base)) return 'alt_small';
  return 'other';
}

// ===== ТРЕЙЛИНГ СТОП-ЛОСС =====

function updateTrailingStops(state, riskState) {
  const config = RISK_CONFIG.stopLossDefaults;
  const candidates = Object.values(state.candidates || {});
  const updates = [];

  for (const c of candidates) {
    const key = `${c.symbol}_${c.interval}_${c.strategy}`;
    const currentPnl = c.forwardPaperPnl || 0;
    const entryPrice = c.entryPrice || c.currentPrice || 0;
    const currentPrice = c.currentPrice || 0;

    if (!entryPrice || !currentPrice) continue;

    const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;

    // Инициализация трейлинг-стопа
    if (!riskState.trailingStops[key]) {
      riskState.trailingStops[key] = {
        symbol: c.symbol,
        interval: c.interval,
        strategy: c.strategy,
        entryPrice,
        highestPrice: currentPrice,
        trailingStopPrice: currentPrice * (1 - config.baseStopPct / 100),
        activated: false,
        createdAt: new Date().toISOString(),
      };
    }

    const ts = riskState.trailingStops[key];

    // Обновление максимальной цены
    if (currentPrice > ts.highestPrice) {
      ts.highestPrice = currentPrice;
    }

    // Активация трейлинга при достижении порога прибыли
    if (pnlPct >= config.trailingStopActivationPct && !ts.activated) {
      ts.activated = true;
      ts.trailingStopPrice = currentPrice * (1 - config.trailingStopStep / 100);
      updates.push({
        key,
        action: 'trailing_stop_activated',
        pnlPct: Number(pnlPct.toFixed(2)),
        trailingStopPrice: Number(ts.trailingStopPrice.toFixed(2)),
      });
    }

    // Обновление трейлинг-стопа
    if (ts.activated) {
      const newStopPrice = currentPrice * (1 - config.trailingStopStep / 100);
      if (newStopPrice > ts.trailingStopPrice) {
        ts.trailingStopPrice = newStopPrice;
      }
    }

    // Проверка срабатывания трейлинг-стопа
    if (ts.activated && currentPrice <= ts.trailingStopPrice) {
      riskState.stats.totalTrailingStopsTriggered++;
      riskState.stopLossHistory.push({
        timestamp: new Date().toISOString(),
        type: 'trailing_stop',
        key,
        symbol: c.symbol,
        interval: c.interval,
        strategy: c.strategy,
        entryPrice: Number(entryPrice.toFixed(2)),
        exitPrice: Number(currentPrice.toFixed(2)),
        highestPrice: Number(ts.highestPrice.toFixed(2)),
        pnlPct: Number(pnlPct.toFixed(2)),
        pnl: Number(currentPnl.toFixed(2)),
        action: 'PAPER_POSITION_CLOSED'
      });

      // Обновляем дневной/недельный/месячный счётчик убытков
      if (currentPnl < 0) {
        riskState.dailyLoss += currentPnl;
        riskState.weeklyLoss += currentPnl;
        riskState.monthlyLoss += currentPnl;
      }

      // Удаляем трейлинг-стоп
      delete riskState.trailingStops[key];
      updates.push({
        key,
        action: 'trailing_stop_triggered',
        pnlPct: Number(pnlPct.toFixed(2)),
        pnl: Number(currentPnl.toFixed(2)),
      });
    }
  }

  saveRiskState(riskState);
  return updates;
}

// ===== МАРЖИНАЛЬНЫЙ МОНИТОР =====

function checkMargin(candidates) {
  const config = RISK_CONFIG.marginMonitor;
  const totalPnl = candidates.reduce((sum, c) => sum + (c.forwardPaperPnl || 0), 0);
  const totalExposure = candidates.reduce((sum, c) => sum + Math.abs(c.forwardPaperPnl || 0), 0);
  
  // Симулированная маржа (paper-only)
  const marginLevel = totalExposure > 0 
    ? ((totalExposure + totalPnl) / totalExposure) * 100 
    : 100;

  const warnings = [];
  if (marginLevel <= config.marginCallLevel) {
    warnings.push({
      type: 'margin_call',
      marginLevel: Number(marginLevel.toFixed(2)),
      threshold: config.marginCallLevel,
      severity: 'critical'
    });
  } else if (marginLevel <= config.criticalMarginLevel) {
    warnings.push({
      type: 'critical_margin',
      marginLevel: Number(marginLevel.toFixed(2)),
      threshold: config.criticalMarginLevel,
      severity: 'warning'
    });
  } else if (marginLevel <= config.minMarginLevel) {
    warnings.push({
      type: 'low_margin',
      marginLevel: Number(marginLevel.toFixed(2)),
      threshold: config.minMarginLevel,
      severity: 'info'
    });
  }

  return {
    ok: warnings.length === 0,
    marginLevel: Number(marginLevel.toFixed(2)),
    totalPnl: Number(totalPnl.toFixed(2)),
    totalExposure: Number(totalExposure.toFixed(2)),
    warnings
  };
}

// ===== ГЛАВНАЯ ФУНКЦИЯ =====

function runRiskManager() {
  const state = readState();
  const riskState = readRiskState();
  const candidates = Object.values(state.candidates || {});
  const portfolioValue = 10000; // paper starting balance

  // Portfolio heat
  const portfolioHeat = calculatePortfolioHeat(candidates, portfolioValue);

  const result = {
    generatedAt: new Date().toISOString(),
    config: RISK_CONFIG,

    // 1. Портфельный стоп-лосс
    portfolioStopLoss: checkPortfolioStopLoss(state, riskState),

    // 2. Расчёт размера позиций (with Kelly + heat)
    positionSizing: candidates.map(c => calculatePositionSize(c, portfolioValue, candidates)),

    // 3. Корреляционный guard (real correlation)
    correlationGuard: checkCorrelation(candidates),

    // 4. Трейлинг стоп-лоссы
    trailingStops: {
      active: Object.keys(riskState.trailingStops || {}).length,
      updates: updateTrailingStops(state, riskState),
    },

    // 5. Маржинальный монитор
    marginMonitor: checkMargin(candidates),

    // 6. Portfolio Heat
    portfolioHeat: {
      heat: Number(portfolioHeat.toFixed(2)),
      maxHeat: 5.0,
      status: portfolioHeat > 5.0 ? 'OVERHEATED' : portfolioHeat > 3.0 ? 'ELEVATED' : 'NORMAL',
      recommendation: portfolioHeat > 5.0
        ? 'Reduce positions immediately. Portfolio heat exceeds safe limit.'
        : portfolioHeat > 3.0
        ? 'Consider reducing position sizes. Portfolio heat is elevated.'
        : 'Portfolio heat within normal range.'
    },

    // 7. Статистика
    stats: riskState.stats,

    // 8. Блокировки
    locks: riskState.locks,

    // Итоговый статус
    status: getOverallStatus(riskState),
    nextAction: getNextAction(riskState),
  };

  saveRiskState(riskState);
  generateReport(result);
  return result;
}

function getOverallStatus(riskState) {
  const locks = riskState.locks;
  if (locks.portfolioStopLossLock) return 'EMERGENCY_STOP';
  if (locks.dailyLossLock || locks.weeklyLossLock || locks.monthlyLossLock) return 'LIMIT_HIT';
  return 'NORMAL';
}

function getNextAction(riskState) {
  const locks = riskState.locks;
  if (locks.portfolioStopLossLock) {
    return 'EMERGENCY: Portfolio stop-loss triggered. Manual review required before any new paper entries.';
  }
  if (locks.dailyLossLock) {
    return 'Daily loss limit reached. Paper trading paused until tomorrow.';
  }
  if (locks.weeklyLossLock) {
    return 'Weekly loss limit reached. Paper trading paused until next week.';
  }
  if (locks.monthlyLossLock) {
    return 'Monthly loss limit reached. Paper trading paused until next month.';
  }
  return 'Normal operation. All risk limits within bounds.';
}

// ===== ГЕНЕРАЦИЯ ОТЧЁТА =====

function generateReport(result) {
  const lines = [];
  
  lines.push('# TradeLab Risk Manager Report');
  lines.push('');
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Status: **${result.status}**`);
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Статус
  lines.push('## Overall Status');
  lines.push('');
  lines.push(`- **Status:** ${result.status}`);
  lines.push(`- **Next Action:** ${result.nextAction}`);
  lines.push(`- **Portfolio Stop-Loss:** ${result.portfolioStopLoss.triggered ? '🔴 TRIGGERED' : '✅ OK'}`);
  lines.push(`- **Total PnL:** ${result.portfolioStopLoss.totalPnl.toFixed(2)} USDT`);
  lines.push('');
  
  // Блокировки
  lines.push('## Active Locks');
  lines.push('');
  lines.push('| Lock | Status |');
  lines.push('| --- | --- |');
  lines.push(`| Portfolio Stop-Loss | ${result.locks.portfolioStopLossLock ? '🔴 Active' : '✅ Inactive'} |`);
  lines.push(`| Daily Loss Limit | ${result.locks.dailyLossLock ? '🔴 Active' : '✅ Inactive'} |`);
  lines.push(`| Weekly Loss Limit | ${result.locks.weeklyLossLock ? '🔴 Active' : '✅ Inactive'} |`);
  lines.push(`| Monthly Loss Limit | ${result.locks.monthlyLossLock ? '🔴 Active' : '✅ Inactive'} |`);
  lines.push('');
  
  // Позиции
  lines.push('## Position Sizing (with Kelly Criterion)');
  lines.push('');
  lines.push('| Symbol | Strategy | Risk % | Size (USDT) | Kelly | WinRate | Stop |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const ps of result.positionSizing) {
    lines.push(`| ${ps.symbol} | ${ps.strategy} | ${ps.riskPct}% | ${ps.positionSize} | ${ps.kelly} | ${ps.winRate} | ${ps.stopPrice} |`);
  }
  lines.push('');

  // Portfolio Heat
  lines.push('## Portfolio Heat');
  lines.push('');
  lines.push(`- **Heat:** ${result.portfolioHeat.heat}% / ${result.portfolioHeat.maxHeat}% max`);
  lines.push(`- **Status:** ${result.portfolioHeat.status}`);
  lines.push(`- **Recommendation:** ${result.portfolioHeat.recommendation}`);
  lines.push('');
  
  // Корреляция
  lines.push('## Correlation Guard');
  lines.push('');
  lines.push(`- **OK:** ${result.correlationGuard.ok ? '✅' : '❌'}`);
  lines.push(`- **Active Positions:** ${result.correlationGuard.activeCount}`);
  lines.push(`- **Sector Distribution:** ${JSON.stringify(result.correlationGuard.sectorDistribution)}`);
  if (result.correlationGuard.warnings.length) {
    lines.push('- **Warnings:**');
    for (const w of result.correlationGuard.warnings) {
      lines.push(`  - ⚠️ ${w.sector}: ${w.count} positions (max ${w.maxAllowed})`);
    }
  }
  if (result.correlationGuard.blocks.length) {
    lines.push('- **Blocks:**');
    for (const b of result.correlationGuard.blocks) {
      lines.push(`  - 🚫 ${b.type}: ${b.current}/${b.maxAllowed}`);
    }
  }
  lines.push('');
  
  // Трейлинг стопы
  lines.push('## Trailing Stops');
  lines.push('');
  lines.push(`- **Active Trailing Stops:** ${result.trailingStops.active}`);
  if (result.trailingStops.updates.length) {
    lines.push('- **Recent Updates:**');
    for (const u of result.trailingStops.updates) {
      lines.push(`  - ${u.action}: ${u.key} (PnL: ${u.pnlPct || 'N/A'}%)`);
    }
  }
  lines.push('');
  
  // Маржа
  lines.push('## Margin Monitor');
  lines.push('');
  lines.push(`- **Margin Level:** ${result.marginMonitor.marginLevel}%`);
  lines.push(`- **Total PnL:** ${result.marginMonitor.totalPnl} USDT`);
  lines.push(`- **Total Exposure:** ${result.marginMonitor.totalExposure} USDT`);
  if (result.marginMonitor.warnings.length) {
    lines.push('- **Warnings:**');
    for (const w of result.marginMonitor.warnings) {
      lines.push(`  - ${w.severity === 'critical' ? '🔴' : w.severity === 'warning' ? '⚠️' : 'ℹ️'} ${w.type}: ${w.marginLevel}% (threshold: ${w.threshold}%)`);
    }
  }
  lines.push('');
  
  // Статистика
  lines.push('## Statistics');
  lines.push('');
  lines.push(`- **Total Stop-Losses Triggered:** ${result.stats.totalStopLossesTriggered}`);
  lines.push(`- **Total Trailing Stops Triggered:** ${result.stats.totalTrailingStopsTriggered}`);
  lines.push(`- **Total Correlation Blocks:** ${result.stats.totalCorrelationBlocks}`);
  lines.push(`- **Total Margin Warnings:** ${result.stats.totalMarginWarnings}`);
  lines.push('');
  
  // История стоп-лоссов
  if (result.portfolioStopLoss.triggered) {
    lines.push('## Recent Stop-Loss Events');
    lines.push('');
    for (const sl of result.portfolioStopLoss.reasons) {
      lines.push(`- 🔴 ${sl}`);
    }
    lines.push('');
  }
  
  lines.push('---');
  lines.push('');
  lines.push('*This is a paper-only risk manager. No real orders are placed.*');
  
  fs.writeFileSync(RISK_REPORT_PATH, lines.join('\n'));
}

// ===== MAIN =====

function main() {
  const result = runRiskManager();
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nReport saved to: ${RISK_REPORT_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  runRiskManager,
  checkPortfolioStopLoss,
  calculatePositionSize,
  checkCorrelation,
  updateTrailingStops,
  checkMargin,
  calculatePortfolioHeat,
  kellyCriterion,
  pearsonCorrelation,
  RISK_CONFIG
};
