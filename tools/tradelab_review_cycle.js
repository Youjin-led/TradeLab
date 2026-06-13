const { incubateOnce } = require('./tradelab_incubate_once');
const { evaluateGate } = require('./tradelab_real_money_gate');
const { makeReport } = require('./tradelab_incubation_report');
const { analyzeDrawdown } = require('./tradelab_drawdown_diagnostics');
const { refreshQuarantine } = require('./tradelab_quarantine');
const { makeScoreboard } = require('./tradelab_scoreboard');
const { analyzeNetworkHealth } = require('./tradelab_network_health');
const { applyLifecycle } = require('./tradelab_lifecycle');

async function reviewCycle() {
  const incubation = await incubateOnce();
  const drawdown = analyzeDrawdown();
  const quarantine = refreshQuarantine();
  const lifecycle = applyLifecycle();
  const gate = evaluateGate();
  const report = makeReport();
  const scoreboard = makeScoreboard();
  const network = analyzeNetworkHealth();
  return {
    generatedAt: new Date().toISOString(),
    incubation: incubation.summary,
    incubationErrors: incubation.errors || [],
    drawdown: {
      summary: drawdown.summary,
      reportPath: drawdown.reportPath
    },
    quarantine,
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
    network
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
