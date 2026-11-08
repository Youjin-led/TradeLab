/**
 * TradeLab — единый реестр порогов.
 *
 * Единственное место, где задаются все числовые пороги конвейера.
 * Правило: никакой другой файл НЕ должен содержать магических чисел для
 * этих проверок — только импорт отсюда. Расхождения порогов между этапами
 * раньше были главным источником «косяков дня» (см. аудит 2026-09).
 *
 * Лестница строгости (осознанно, не баг):
 *   discovery/scout (вход) .... PF >= 1.8 — strict, мусор не входит
 *   forward-proven (промоут) .. PF >= 1.8 при 10+ paper-сделках
 *   gate non-proven (выход) ... PF >= 0.5 — мягко, но туда же требуются
 *                                status ready-for-review + Healthy + liveObs 30.
 *                                Ужесточение 0.5 -> выше меняет, кто торгует
 *                                реалом: решать отдельно, не в рамках рефактора.
 */

// Валидатор бэктеста: вход в инкубацию и строгие проверки.
const VALIDATOR_RULES = {
  minTestTrades: 8,
  minProfitFactor: 1.8,
  maxDrawdownPct: 8.0,
  maxLossStreak: 3,
  minHealthScore: 80,
  maxRiskPct: 0.8,
  maxStopPct: 5,
  minTakePct: 3
};

// Гейт реальных денег.
const GATE_REQUIREMENTS = {
  minLiveObservations: 30,
  minClosedPaperTrades: 3,
  minProfitFactor: 0.5,
  maxDrawdownPct: 8,
  maxLossStreak: 5,
  requiredHealth: 'Healthy',
  requiredStatus: 'ready-for-review'
};

// Forward-доказательство: бумага сильнее бэктеста.
const FORWARD_PROVEN = {
  minTrades: 10,
  minProfitFactor: 1.8,
  maxDrawdownPct: 8.0,
  maxLossStreak: 3
};

// Жизненный цикл: probation / quarantine / promotion.
const LIFECYCLE_RULES = {
  probationCyclesBeforeQuarantine: 3,
  probationMinForwardTrades: 3,
  probationMaxForwardPnl: -80,
  probationMaxDrawdownPct: 5.0,
  probationMaxLossStreak: 2,
  quarantineMaxForwardPnl: -300,
  promotionMinForwardTrades: 8
};

// Льгота от probation для прибыльной бумаги (мягче proven: достаточно PF 1.5).
const PROBATION_EXEMPT = {
  minForwardTrades: 3,
  minForwardPF: 1.5
};

// Живой loss-streak в paper-ledger: карантин при достижении.
const MAX_CONSECUTIVE_LOSSES = 3;

// Выход из карантина.
const UNQUARANTINE = {
  minForwardTrades: 3,
  minProfitFactor: 1.8,
  maxDrawdownPct: 8.0,
  maxLossStreak: 3,
  minForwardPnl: 0,
  minCyclesBetweenUnquarantine: 5
};

// Перевооружение approve после реала.
const REAPPROVAL = {
  lossCooldownMs: 4 * 60 * 60 * 1000,
  lossEpsUsd: 0.03,
  // Исполненный ключ снова просит кнопку, если всё ещё proven и прошло столько.
  rearmAfterMs: 3 * 24 * 60 * 60 * 1000
};

module.exports = {
  VALIDATOR_RULES,
  REQUIREMENTS: GATE_REQUIREMENTS,
  GATE_REQUIREMENTS,
  FORWARD_PROVEN,
  FORWARD_PROVEN_MIN_TRADES: FORWARD_PROVEN.minTrades,
  LIFECYCLE_RULES,
  PROBATION_EXEMPT,
  MAX_CONSECUTIVE_LOSSES,
  UNQUARANTINE_THRESHOLDS: UNQUARANTINE,
  UNQUARANTINE,
  REAPPROVAL,
  REAL_LOSS_COOLDOWN_MS: REAPPROVAL.lossCooldownMs,
  REAL_LOSS_EPS_USD: REAPPROVAL.lossEpsUsd,
  REARM_AFTER_MS: REAPPROVAL.rearmAfterMs
};

