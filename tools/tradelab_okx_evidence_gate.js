const fs = require('fs');
const path = require('path');

const SHADOW_PATH = path.join(__dirname, '..', 'tradelab-okx-shadow-state.json');
const MIN_SHADOW_CLOSED_POSITIONS = 3;

function readShadow() {
  try { return JSON.parse(fs.readFileSync(SHADOW_PATH, 'utf8')); }
  catch { return null; }
}

function assessOkxEvidence(record, updatedAt, nowMs = Date.now()) {
  const ageMs = nowMs - Date.parse(updatedAt || '');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 3 * 60 * 60 * 1000) {
    return { allowed: false, reason: 'OKX shadow data stale or unavailable' };
  }
  if (!record?.holdout || !record?.holdoutStress || !record?.forward) {
    return { allowed: false, reason: 'OKX paper evidence unavailable' };
  }
  const f = record.forward;
  if ((Number(f.closedTrades) || 0) < MIN_SHADOW_CLOSED_POSITIONS) {
    return { allowed: false, reason: `OKX shadow closed positions ${Number(f.closedTrades) || 0} < ${MIN_SHADOW_CLOSED_POSITIONS}` };
  }
  if (f.closedTrades >= 10 && f.realizedPnl > 0 && f.profitFactor >= 1.5 && f.maxDrawdownPct <= 4) {
    return { allowed: true, reason: 'OKX forward recovery' };
  }
  const h = record.holdout;
  if (h.trades >= 8 && (h.pnl <= 0 || (h.profitFactor !== null && h.profitFactor < 1))) {
    return { allowed: false, reason: `OKX holdout weak: ${h.trades} trades, PnL ${h.pnl}, PF ${h.profitFactor}` };
  }
  const stress = record.holdoutStress;
  if (stress.trades >= 8 && stress.pnl <= 0) {
    return { allowed: false, reason: `OKX cost stress negative: ${stress.pnl}` };
  }
  return { allowed: true, reason: 'OKX shadow sample collected; holdout checks passed' };
}

module.exports = { readShadow, assessOkxEvidence, MIN_SHADOW_CLOSED_POSITIONS };

