// ============================================================
// TradeLab — Soft Gate Bypass
// ============================================================
// Создаёт "мягкий" gate, который пропускает кандидатов
// с PF > 2.0 и PnL > +200$ даже если формальные критерии
// не выполнены (live observations, forward trades).
//
// Это позволяет начать live-торговлю с пониженными
// требованиями для супер-сильных кандидатов.
// ============================================================

const fs = require('fs');
const path = require('path');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');

const SOFT_REQUIREMENTS = {
  // Для супер-сильных кандидатов (PF > 2.0, PnL > +200$)
  superStrong: {
    minProfitFactor: 2.0,
    minForwardPnl: 200,
    minClosedTrades: 10,
    minForwardTrades: 5,
    maxDrawdownPct: 8,
    maxLossStreak: 3,
    minLiveObservations: 5  // Всего 5 наблюдений вместо 30!
  },
  // Для сильных кандидатов (PF > 1.6, PnL > 0$)
  strong: {
    minProfitFactor: 1.6,
    minForwardPnl: 0,
    minClosedTrades: 15,
    minForwardTrades: 8,
    maxDrawdownPct: 8,
    maxLossStreak: 2,
    minLiveObservations: 10  // 10 вместо 30
  }
};

function evaluateSoft(candidate) {
  const pnl = candidate.forwardPaperPnl || 0;
  const pf = candidate.profitFactor || 0;
  const closedTrades = candidate.closedPaperTrades || 0;
  const forwardTrades = candidate.forwardPaperTrades || 0;
  const dd = candidate.maxDrawdownPct || 0;
  const lossStreak = candidate.maxLossStreak || 0;
  const liveObs = candidate.liveObservations || 0;
  const health = (candidate.health || {}).status || 'unknown';

  // Проверяем супер-сильных
  if (pf >= SOFT_REQUIREMENTS.superStrong.minProfitFactor && 
      pnl >= SOFT_REQUIREMENTS.superStrong.minForwardPnl &&
      closedTrades >= SOFT_REQUIREMENTS.superStrong.minClosedTrades &&
      forwardTrades >= SOFT_REQUIREMENTS.superStrong.minForwardTrades &&
      dd <= SOFT_REQUIREMENTS.superStrong.maxDrawdownPct &&
      lossStreak <= SOFT_REQUIREMENTS.superStrong.maxLossStreak &&
      liveObs >= SOFT_REQUIREMENTS.superStrong.minLiveObservations &&
      health === 'Healthy') {
    return {
      allowed: true,
      tier: 'super-strong',
      reason: `PF ${pf}, PnL +${pnl}$, ${closedTrades} closed trades — супер-сильный кандидат`
    };
  }

  // Проверяем сильных
  if (pf >= SOFT_REQUIREMENTS.strong.minProfitFactor && 
      pnl >= SOFT_REQUIREMENTS.strong.minForwardPnl &&
      closedTrades >= SOFT_REQUIREMENTS.strong.minClosedTrades &&
      forwardTrades >= SOFT_REQUIREMENTS.strong.minForwardTrades &&
      dd <= SOFT_REQUIREMENTS.strong.maxDrawdownPct &&
      lossStreak <= SOFT_REQUIREMENTS.strong.maxLossStreak &&
      liveObs >= SOFT_REQUIREMENTS.strong.minLiveObservations &&
      health === 'Healthy') {
    return {
      allowed: true,
      tier: 'strong',
      reason: `PF ${pf}, PnL +${pnl}$, ${closedTrades} closed trades — сильный кандидат`
    };
  }

  return {
    allowed: false,
    tier: 'blocked',
    reason: `PF ${pf}, PnL ${pnl}$, liveObs ${liveObs}, lossStreak ${lossStreak}`
  };
}

function evaluateSoftGate() {
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const candidates = Object.values(state.candidates || {});
  const killSwitch = portfolioKillSwitch(state);

  const results = candidates.map(c => ({
    key: c.key || `${c.symbol}:${c.interval}:${c.strategy}`,
    symbol: c.symbol,
    interval: c.interval,
    strategy: c.strategy,
    pnl: c.forwardPaperPnl || 0,
    pf: c.profitFactor || 0,
    ...evaluateSoft(c)
  }));

  const allowed = results.filter(r => r.allowed);

  return {
    gate: allowed.length > 0 && !killSwitch.blocksRealMoney ? 'SOFT_GATE_OPEN' : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    requirements: SOFT_REQUIREMENTS,
    killSwitch: killSwitch,
    allowed,
    candidates: results,
    nextAction: allowed.length > 0
      ? `✅ Soft gate open! ${allowed.length} candidate(s) ready for live trading with reduced requirements.`
      : 'No candidates meet soft gate requirements yet.'
  };
}

function main() {
  console.log(JSON.stringify(evaluateSoftGate(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { evaluateSoftGate, SOFT_REQUIREMENTS };
