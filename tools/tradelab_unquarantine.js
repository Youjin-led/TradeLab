/**
 * TradeLab Unquarantine
 *
 * Автоматически проверяет кандидатов в карантине и возвращает их
 * в инкубацию, если метрики улучшились.
 *
 * Запуск: node tools/tradelab_unquarantine.js
 */

const fs = require('fs');
const path = require('path');
const {
  fetchCandles,
  simulate,
  describe,
  health,
  getSignal,
  signalToEntrySide,
  executionPrice,
  exitAction,
  makePosition,
  tradePnl,
  floatingPnl,
  exitReason,
  DEFAULT_PARAMS
} = require('./tradelab_run_once');
const { detectPhase } = require('./tradelab_market_phase');
const { REQUIREMENTS } = require('./tradelab_real_money_gate');
const { VALIDATOR_RULES } = require('./tradelab_risk_controls');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');
const SCOREBOARD_PATH = path.join(__dirname, '..', 'tradelab-scoreboard.json');

// Пороги для автоматического выхода из карантина
const UNQUARANTINE_THRESHOLDS = {
  // Должен набрать минимум forward сделок
  minForwardTrades: REQUIREMENTS.minClosedPaperTrades,
  // Profit Factor должен быть >=
  minProfitFactor: VALIDATOR_RULES.minProfitFactor,
  // Максимальная просадка
  maxDrawdownPct: VALIDATOR_RULES.maxDrawdownPct,
  // Максимальная серия убытков
  maxLossStreak: VALIDATOR_RULES.maxLossStreak,
  // Forward PnL должен быть положительным
  minForwardPnl: 0,
  // Здоровье должно быть не Blocked
  minHealthStatus: 'Healthy',
  // Минимальное количество циклов между авто-анкарантином (cooldown)
  minCyclesBetweenUnquarantine: 5
};

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { candidates: {} };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function readScoreboard() {
  if (!fs.existsSync(SCOREBOARD_PATH)) return null;
  return JSON.parse(fs.readFileSync(SCOREBOARD_PATH, 'utf8'));
}

function parseParams(description) {
  // Парсит строку вида "SMA 12/24, RSI 42, SL 1.6%, TP 3%"
  // или "Breakout LB 20, SL 3.2%, TP 5.8%"
  const params = { ...DEFAULT_PARAMS };
  
  if (description.startsWith('SMA')) {
    const match = description.match(/SMA (\d+)\/(\d+), RSI (\d+)/);
    if (match) {
      params.fast = Number(match[1]);
      params.slow = Number(match[2]);
      params.rsiBuy = Number(match[3]);
      params.strategy = 'sma-rsi';
    }
  } else if (description.startsWith('Breakout')) {
    const match = description.match(/Breakout LB (\d+)/);
    if (match) {
      params.lookback = Number(match[1]);
      params.strategy = 'breakout';
    }
  } else if (description.startsWith('Mean Reversion')) {
    const match = description.match(/Mean Reversion LB (\d+), dev ([\d.]+)%/);
    if (match) {
      params.lookback = Number(match[1]);
      params.deviationPct = Number(match[2]);
      params.strategy = 'mean-reversion';
    }
  }

  // Парсим SL/TP
  const slMatch = description.match(/SL ([\d.]+)%/);
  const tpMatch = description.match(/TP ([\d.]+)%/);
  if (slMatch) params.stopPct = Number(slMatch[1]);
  if (tpMatch) params.takePct = Number(tpMatch[1]);

  return params;
}

async function checkCandidate(candidate) {
  /**
   * Проверяет кандидата: загружает свежие данные, прогоняет симуляцию,
   * и решает, можно ли его разблокировать.
   */
  const params = parseParams(candidate.params);
  params.strategy = candidate.strategy;

  try {
    const candles = await fetchCandles(candidate.symbol, candidate.interval, 500);
    const result = simulate(candles, params);
    const summary = result.summary;
    const phase = detectPhase(candles);

    // Собираем свежие метрики
    const freshMetrics = {
      tradeCount: summary.tradeCount,
      profitFactor: summary.profitFactor,
      maxDd: summary.maxDd,
      maxLossStreak: summary.maxLossStreak,
      pnl: summary.pnl,
      marketPhase: phase.phase,
      volatility: phase.volatility
    };

    const ledger = candidate.paperLedger;
    const forwardTrades = candidate.forwardPaperTrades || 0;
    const forwardPnl = candidate.forwardPaperPnl || 0;
    const forwardMaxDd = candidate.forwardPaperMaxDd || 0;
    let forwardPF = 0;
    if (ledger && Array.isArray(ledger.trades) && ledger.trades.length) {
      const grossProfit = ledger.trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
      const grossLoss = Math.abs(ledger.trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
      forwardPF = grossLoss ? grossProfit / grossLoss : (grossProfit ? Infinity : 0);
    }
    const forwardMetrics = {
      trades: forwardTrades,
      profitFactor: forwardPF,
      pnl: forwardPnl,
      maxDd: forwardMaxDd
    };

    // Проверяем пороги по forward-бумаге (не по свежему бэктесту)
    const checks = [];
    const passed = [];

    if (forwardMetrics.trades >= UNQUARANTINE_THRESHOLDS.minForwardTrades) {
      passed.push(`forward trades ${forwardMetrics.trades} >= ${UNQUARANTINE_THRESHOLDS.minForwardTrades}`);
    } else {
      checks.push(`forward trades ${forwardMetrics.trades} < ${UNQUARANTINE_THRESHOLDS.minForwardTrades}`);
    }

    if (forwardMetrics.profitFactor >= UNQUARANTINE_THRESHOLDS.minProfitFactor) {
      passed.push(`forward PF ${Number(forwardMetrics.profitFactor).toFixed(2)} >= ${UNQUARANTINE_THRESHOLDS.minProfitFactor}`);
    } else {
      checks.push(`forward PF ${Number(forwardMetrics.profitFactor).toFixed(2)} < ${UNQUARANTINE_THRESHOLDS.minProfitFactor}`);
    }

    if (forwardMetrics.maxDd <= UNQUARANTINE_THRESHOLDS.maxDrawdownPct) {
      passed.push(`forward DD ${forwardMetrics.maxDd.toFixed(2)}% <= ${UNQUARANTINE_THRESHOLDS.maxDrawdownPct}%`);
    } else {
      checks.push(`forward DD ${forwardMetrics.maxDd.toFixed(2)}% > ${UNQUARANTINE_THRESHOLDS.maxDrawdownPct}%`);
    }

    if (forwardMetrics.pnl >= UNQUARANTINE_THRESHOLDS.minForwardPnl) {
      passed.push(`forward PnL ${forwardMetrics.pnl.toFixed(2)} >= ${UNQUARANTINE_THRESHOLDS.minForwardPnl}`);
    } else {
      checks.push(`forward PnL ${forwardMetrics.pnl.toFixed(2)} < ${UNQUARANTINE_THRESHOLDS.minForwardPnl}`);
    }

    if (freshMetrics.maxLossStreak <= UNQUARANTINE_THRESHOLDS.maxLossStreak) {
      passed.push(`backtest loss streak ${freshMetrics.maxLossStreak} <= ${UNQUARANTINE_THRESHOLDS.maxLossStreak}`);
    } else {
      checks.push(`backtest loss streak ${freshMetrics.maxLossStreak} > ${UNQUARANTINE_THRESHOLDS.maxLossStreak}`);
    }

    const canUnquarantine = checks.length === 0;

    return {
      key: candidate.key,
      symbol: candidate.symbol,
      interval: candidate.interval,
      strategy: candidate.strategy,
      canUnquarantine,
      freshMetrics,
      forwardMetrics,
      checks,
      passed,
      marketPhase: freshMetrics.marketPhase,
      volatility: freshMetrics.volatility,
      oldStatus: candidate.status,
      oldHealth: candidate.health?.status,
      oldPnl: candidate.forwardPaperPnl
    };
  } catch (error) {
    return {
      key: candidate.key,
      symbol: candidate.symbol,
      interval: candidate.interval,
      strategy: candidate.strategy,
      canUnquarantine: false,
      error: error.message,
      checks: [`fetch error: ${error.message}`],
      passed: []
    };
  }
}

async function unquarantine() {
  const state = readState();
  const scoreboard = readScoreboard();
  const candidates = Object.values(state.candidates || {});
  const now = new Date();
  
  // Находим всех в карантине
  const quarantined = candidates.filter((c) => c.status === 'quarantined');
  
  if (quarantined.length === 0) {
    console.log(JSON.stringify({
      generatedAt: now.toISOString(),
      summary: 'No quarantined candidates to check',
      checked: 0,
      unquarantined: 0,
      actions: []
    }, null, 2));
    return;
  }

  console.log(`Checking ${quarantined.length} quarantined candidates...`);

  const results = [];
  const actions = [];

  for (const candidate of quarantined) {
    // Проверка cooldown: если кандидата уже разблокировали недавно — пропускаем
    const prevUnquarantine = candidate.quarantine?.previousQuarantine?.unquarantinedAt || 
                             candidate.quarantine?.unquarantinedAt;
    if (prevUnquarantine) {
      const cyclesSinceUnquarantine = candidate.quarantine?.unquarantineCycleCount || 0;
      if (cyclesSinceUnquarantine < UNQUARANTINE_THRESHOLDS.minCyclesBetweenUnquarantine) {
        results.push({
          key: candidate.key,
          symbol: candidate.symbol,
          interval: candidate.interval,
          strategy: candidate.strategy,
          canUnquarantine: false,
          checks: [`cooldown: only ${cyclesSinceUnquarantine} cycles since last unquarantine, need ${UNQUARANTINE_THRESHOLDS.minCyclesBetweenUnquarantine}`],
          passed: [],
          skipped: true
        });
        // Увеличиваем счётчик циклов
        if (state.candidates[candidate.key]?.quarantine) {
          state.candidates[candidate.key].quarantine.unquarantineCycleCount = (cyclesSinceUnquarantine || 0) + 1;
        }
        continue;
      }
    }

    const result = await checkCandidate(candidate);
    results.push(result);

    if (result.canUnquarantine) {
      // Возвращаем в инкубацию
      const key = result.key;
      if (state.candidates[key]) {
        state.candidates[key].status = 'incubating';
        state.candidates[key].decision = 'incubate';
        state.candidates[key].previousStatus = 'quarantined';
        state.candidates[key].quarantine = {
          active: false,
          reason: 'auto-unquarantined: metrics improved',
          unquarantinedAt: now.toISOString(),
          unquarantineCycleCount: 0,
          previousQuarantine: candidate.quarantine
        };
        state.candidates[key].updatedAt = now.toISOString();
        state.candidates[key].alerts = [
          ...(state.candidates[key].alerts || []),
          `auto-unquarantined: ${result.passed.join('; ')}`
        ];

        actions.push({
          key: result.key,
          symbol: result.symbol,
          action: 'unquarantine',
          reason: result.passed.join('; '),
          oldPnl: result.oldPnl,
          newPnl: result.forwardMetrics.pnl,
          forwardPF: Number(result.forwardMetrics.profitFactor).toFixed(2)
        });
      }
    }
  }

  // Обновляем summary
  const allRows = Object.values(state.candidates || {});
  state.summary = {
    ...state.summary,
    updatedAt: new Date().toISOString(),
    total: allRows.length,
    incubating: allRows.filter((r) => r.status === 'incubating').length,
    quarantined: allRows.filter((r) => r.status === 'quarantined').length,
    rejected: allRows.filter((r) => r.status === 'rejected').length,
    readyForReview: allRows.filter((r) => r.status === 'ready-for-review').length
  };

  writeState(state);

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      checked: quarantined.length,
      unquarantined: actions.length,
      stillQuarantined: quarantined.length - actions.length
    },
    actions,
    details: results.map((r) => ({
      key: r.key,
      symbol: r.symbol,
      interval: r.interval,
      strategy: r.strategy,
      canUnquarantine: r.canUnquarantine,
      checks: r.checks,
      passed: r.passed,
      forwardMetrics: r.forwardMetrics,
      marketPhase: r.marketPhase,
      volatility: r.volatility,
      error: r.error
    }))
  };

  console.log(JSON.stringify(output, null, 2));
  return output;
}

async function main() {
  await unquarantine();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { unquarantine, checkCandidate, UNQUARANTINE_THRESHOLDS };
