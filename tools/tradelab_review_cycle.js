const { incubateOnce } = require('./tradelab_incubate_once');
const { evaluateGate } = require('./tradelab_real_money_gate');
const { makeReport } = require('./tradelab_incubation_report');
const { analyzeDrawdown } = require('./tradelab_drawdown_diagnostics');
const { refreshQuarantine } = require('./tradelab_quarantine');
const { unquarantine } = require('./tradelab_unquarantine');
const { makeScoreboard } = require('./tradelab_scoreboard');
const { analyzeNetworkHealth } = require('./tradelab_network_health');
const { runRiskManager } = require('./tradelab_risk_manager');
const { applyLifecycle } = require('./tradelab_lifecycle');
const { discover } = require('./tradelab_daily_discovery');
const { analyze: fetchNewsImpact } = require('./tradelab_news_impact');
const { detectPhase } = require('./tradelab_market_phase');
const { autoClean } = require('./tradelab_auto_cleaner');

async function reviewCycle() {
  // Авто-чистка: удаляем безнадёжных, разблокируем сильных
  await autoClean();
  
  const incubation = await incubateOnce();
  const drawdown = analyzeDrawdown();
  const quarantine = refreshQuarantine();
  // Auto-unquarantine: проверяем, можно ли кого-то разблокировать
  const unquarantineResult = await unquarantine();
  const lifecycle = applyLifecycle();
  const gate = evaluateGate();
  const report = makeReport();
  const scoreboard = makeScoreboard();
  const network = analyzeNetworkHealth();
  
  // Risk Manager: портфельный стоп-лосс, трейлинг-стопы, корреляционный guard
  let riskManager = null;
  try {
    riskManager = runRiskManager();
  } catch (error) {
    riskManager = { error: error.message };
  }
  
  // Discovery: ищем новые кандидаты (только каждый 4-й час, чтобы не нагружать Binance)
  let discoveryResult = null;
  try {
    discoveryResult = await discover();
  } catch (error) {
    discoveryResult = { error: error.message };
  }
  
  // News: парсим новости каждый час
  let newsResult = null;
  try {
    newsResult = await fetchNewsImpact();
  } catch (error) {
    newsResult = { error: error.message };
  }
  
  // Определяем текущую фазу рынка
  let marketPhase = 'unknown';
  try {
    const phase = detectPhase([]);
    marketPhase = phase.phase || 'unknown';
  } catch (_) { /* ignore */ }

  return {
    generatedAt: new Date().toISOString(),
    marketPhase,
    incubation: incubation.summary,
    incubationErrors: incubation.errors || [],
    drawdown: {
      summary: drawdown.summary,
      reportPath: drawdown.reportPath
    },
    quarantine,
    unquarantine: {
      checked: unquarantineResult?.summary?.checked || 0,
      unquarantined: unquarantineResult?.summary?.unquarantined || 0,
      actions: unquarantineResult?.actions || []
    },
    lifecycle: {
      summary: lifecycle.summary,
      actions: lifecycle.actions,
      reportPath: lifecycle.reportPath
    },
    gate: {
      status: gate.gate,
      allowed: gate.allowed.length,
      blocked: gate.candidates.filter((candidate) => candidate.decision === 'blocked').length,
      nextAction: gate.nextAction
    },
    report,
    scoreboard: {
      summary: scoreboard.summary,
      reportPath: scoreboard.reportPath
    },
    network,
    riskManager: riskManager ? {
      status: riskManager.status,
      portfolioStopLoss: riskManager.portfolioStopLoss?.triggered || false,
      locks: riskManager.locks,
      activeTrailingStops: riskManager.trailingStops?.active || 0,
      correlationOk: riskManager.correlationGuard?.ok || false,
      marginLevel: riskManager.marginMonitor?.marginLevel || 100,
      nextAction: riskManager.nextAction
    } : null,
    discovery: discoveryResult ? {
      added: (discoveryResult.added || []).length,
      qualified: discoveryResult.qualified || 0,
      errors: (discoveryResult.errors || []).length
    } : null,
    news: newsResult ? {
      articles: newsResult.articles || 0,
      matches: newsResult.matches || 0,
      errors: (newsResult.errors || []).length
    } : null
  };
}


async function main() {
  const result = await reviewCycle();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { reviewCycle };
