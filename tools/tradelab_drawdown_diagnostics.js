const fs = require('fs');
const path = require('path');

const { portfolioKillSwitch, readIncubationState } = require('./tradelab_risk_controls');

const ROOT = path.join(__dirname, '..');
const NEWS_DEPS_PATH = path.join(ROOT, 'tradelab-news-dependencies.json');
const JSON_PATH = path.join(ROOT, 'tradelab-drawdown-diagnostics.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_DRAWDOWN_DIAGNOSTICS.md');

function money(value) {
  return `${value >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function addGroup(map, key, patch) {
  const row = map.get(key) || {
    key,
    count: 0,
    candidates: 0,
    trades: 0,
    pnl: 0,
    wins: 0,
    losses: 0,
    maxDrawdownPct: 0,
    rejected: 0,
    incubating: 0,
    quarantined: 0
  };
  row.count += patch.count || 0;
  row.candidates += patch.candidates || 0;
  row.trades += patch.trades || 0;
  row.pnl += patch.pnl || 0;
  row.wins += patch.wins || 0;
  row.losses += patch.losses || 0;
  row.maxDrawdownPct = Math.max(row.maxDrawdownPct, patch.maxDrawdownPct || 0);
  row.rejected += patch.rejected || 0;
  row.incubating += patch.incubating || 0;
  row.quarantined += patch.quarantined || 0;
  map.set(key, row);
}

function finalizeGroup(row) {
  const winrate = row.trades ? row.wins / row.trades : 0;
  return {
    ...row,
    pnl: Number(row.pnl.toFixed(2)),
    avgPerTrade: Number((row.trades ? row.pnl / row.trades : 0).toFixed(2)),
    winrate: Number(winrate.toFixed(3)),
    maxDrawdownPct: Number(row.maxDrawdownPct.toFixed(2))
  };
}

function allTrades(candidate) {
  const trades = candidate.paperLedger && Array.isArray(candidate.paperLedger.trades)
    ? candidate.paperLedger.trades
    : [];
  return trades.map((trade) => ({
    ...trade,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    candidateKey: candidate.key,
    status: candidate.status
  }));
}

function dominantLosers(candidates) {
  return candidates
    .map((candidate) => ({
      key: candidate.key,
      symbol: candidate.symbol,
      interval: candidate.interval,
      strategy: candidate.strategy,
      status: candidate.status,
      forwardPaperTrades: candidate.forwardPaperTrades || 0,
      forwardPaperPnl: Number((candidate.forwardPaperPnl || 0).toFixed(2)),
      totalPnl: Number((candidate.totalPnl || 0).toFixed(2)),
      profitFactor: Number((candidate.profitFactor || 0).toFixed(2)),
      maxDrawdownPct: Number((candidate.maxDrawdownPct || 0).toFixed(2)),
      maxLossStreak: candidate.maxLossStreak || 0,
      alerts: candidate.alerts || [],
      health: candidate.health || {}
    }))
    .sort((a, b) => a.forwardPaperPnl - b.forwardPaperPnl)
    .slice(0, 10);
}

function groupCandidates(candidates, keyFn) {
  const groups = new Map();
  for (const candidate of candidates) {
    const trades = allTrades(candidate);
    const wins = trades.filter((trade) => (trade.pnl || 0) > 0).length;
    const losses = trades.filter((trade) => (trade.pnl || 0) < 0).length;
    addGroup(groups, keyFn(candidate), {
      candidates: 1,
      trades: candidate.forwardPaperTrades || trades.length || 0,
      pnl: candidate.forwardPaperPnl || 0,
      wins,
      losses,
      maxDrawdownPct: candidate.forwardPaperMaxDd || candidate.maxDrawdownPct || 0,
      rejected: candidate.status === 'rejected' ? 1 : 0,
      incubating: candidate.status === 'incubating' ? 1 : 0,
      quarantined: candidate.status === 'quarantined' ? 1 : 0
    });
  }
  return [...groups.values()].map(finalizeGroup).sort((a, b) => a.pnl - b.pnl);
}

function groupTrades(trades, keyFn) {
  const groups = new Map();
  for (const trade of trades) {
    addGroup(groups, keyFn(trade), {
      count: 1,
      trades: 1,
      pnl: trade.pnl || 0,
      wins: (trade.pnl || 0) > 0 ? 1 : 0,
      losses: (trade.pnl || 0) < 0 ? 1 : 0
    });
  }
  return [...groups.values()].map(finalizeGroup).sort((a, b) => a.pnl - b.pnl);
}

function dependencyForSymbol(newsDeps, symbol) {
  const rows = Array.isArray(newsDeps.rows) ? newsDeps.rows : [];
  return rows
    .filter((row) => row.symbol === symbol && (row.strength === 'strong' || row.strength === 'moderate'))
    .sort((a, b) => b.confidence - a.confidence || Math.abs(b.avgReturn) - Math.abs(a.avgReturn))[0] || null;
}

function buildActions(bySymbol, byInterval, byStrategy, losers, killSwitch, newsDeps, candidates) {
  const actions = [];
  if (killSwitch.active) {
    const reasons = killSwitch.soft?.reasons || killSwitch.hard?.reasons || [];
    actions.push({
      level: 'critical',
      action: 'Freeze auto-adds and real-money preparation until kill-switch clears.',
      reason: reasons.join('; ')
    });
  }

  for (const row of bySymbol.filter((item) => item.pnl < 0).slice(0, 5)) {
    const dep = dependencyForSymbol(newsDeps, row.key);
    const reason = dep
      ? `${row.key} forward PnL ${money(row.pnl)}; news dependency ${dep.strength} ${dep.horizon} ${dep.direction}, avg ${dep.avgReturn}%, agreement ${pct(dep.agreement * 100)}.`
      : `${row.key} forward PnL ${money(row.pnl)} with no useful news dependency yet.`;
    actions.push({
      level: row.pnl <= -1000 ? 'high' : 'medium',
      action: `Quarantine or down-rank ${row.key} candidates until they recover in paper mode.`,
      reason
    });
  }

  const worstInterval = byInterval.find((row) => row.pnl < 0);
  if (worstInterval) {
    actions.push({
      level: 'medium',
      action: `Reduce priority for ${worstInterval.key} timeframe discovery.`,
      reason: `${worstInterval.key} is the weakest timeframe group: ${money(worstInterval.pnl)} across ${worstInterval.trades} forward trades.`
    });
  }

  const worstStrategy = byStrategy.find((row) => row.pnl < 0);
  if (worstStrategy) {
    actions.push({
      level: 'medium',
      action: `Tighten validation or pause ${worstStrategy.key} variants.`,
      reason: `${worstStrategy.key} is the weakest strategy group: ${money(worstStrategy.pnl)}; blocked ${worstStrategy.rejected + worstStrategy.quarantined}/${worstStrategy.candidates}.`
    });
  }

  // Проверка phase-mismatch: если стратегия не подходит под фазу рынка
  const PHASE_MAP = {
    'breakout': ['trending', 'volatile'],
    'sma-rsi': ['trending', 'ranging'],
    'mean-reversion': ['ranging']
  };
  const phaseMismatchCandidates = candidates.filter((c) => {
    const strategy = c.strategy || '';
    const marketPhase = c.marketPhase || '';
    const suitablePhases = PHASE_MAP[strategy] || ['trending', 'ranging', 'volatile'];
    return marketPhase && !suitablePhases.includes(marketPhase);
  });
  if (phaseMismatchCandidates.length) {
    actions.push({
      level: 'medium',
      action: `Review ${phaseMismatchCandidates.length} phase-mismatch candidates — strategy does not match current market phase.`,
      reason: phaseMismatchCandidates.slice(0, 5).map((c) => `${c.key || c.symbol}:${c.strategy} on ${c.marketPhase} market`).join('; ')
    });
  }

  const repeatStopLosers = losers.filter((row) => row.alerts.some((alert) => /drawdown|loss streak|profit factor/i.test(alert)));
  if (repeatStopLosers.length) {
    actions.push({
      level: 'medium',
      action: 'Review stop/take parameters for repeated stop-loss candidates before adding more similar setups.',
      reason: `${repeatStopLosers.length} of the worst candidates already carry drawdown, loss-streak, or profit-factor alerts.`
    });
  }

  return actions;
}

function writeReport(output) {
  const lines = [
    '# TradeLab Drawdown Diagnostics',
    '',
    `Generated: ${output.generatedAt}`,
    `Incubation updated: ${output.incubationUpdatedAt || 'unknown'}`,
    `Portfolio kill-switch: **${output.killSwitch.active ? 'ACTIVE' : 'clear'}**`,
    '',
    'This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.',
    '',
    '## Summary',
    '',
    `Candidates: ${output.summary.candidates}; forward trades: ${output.summary.forwardTrades}; forward PnL: ${money(output.summary.forwardPnl)}; avg/trade: ${money(output.summary.avgPerTrade)}.`,
    `Incubating: ${output.summary.incubating}; rejected: ${output.summary.rejected}; active positive ratio: ${pct(output.summary.activePositiveRatio * 100)}.`,
    '',
    '## Action List',
    ''
  ];

  if (output.actions.length) {
    for (const item of output.actions) lines.push(`- **${item.level}**: ${item.action} Reason: ${item.reason}`);
  } else {
    lines.push('- No critical drawdown action found. Keep collecting paper observations.');
  }

  lines.push(
    '',
    '## Worst Candidates',
    '',
    'Candidate | Status | Forward Trades | Forward PnL | PF | Max DD | Loss Streak | Health',
    '--- | --- | ---: | ---: | ---: | ---: | ---: | ---'
  );
  for (const row of output.worstCandidates) {
    lines.push(`${row.key} | ${row.status} | ${row.forwardPaperTrades} | ${money(row.forwardPaperPnl)} | ${row.profitFactor.toFixed(2)} | ${row.maxDrawdownPct.toFixed(2)}% | ${row.maxLossStreak} | ${row.health.status || 'unknown'}`);
  }

  lines.push(
    '',
    '## Attribution By Symbol',
    '',
    'Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected',
    '--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:'
  );
  for (const row of output.bySymbol.slice(0, 12)) {
    lines.push(`${row.key} | ${row.candidates} | ${row.trades} | ${money(row.pnl)} | ${money(row.avgPerTrade)} | ${pct(row.winrate * 100)} | ${row.maxDrawdownPct.toFixed(2)}% | ${row.rejected}`);
  }

  lines.push(
    '',
    '## Attribution By Timeframe',
    '',
    'Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected',
    '--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:'
  );
  for (const row of output.byInterval) {
    lines.push(`${row.key} | ${row.candidates} | ${row.trades} | ${money(row.pnl)} | ${money(row.avgPerTrade)} | ${pct(row.winrate * 100)} | ${row.maxDrawdownPct.toFixed(2)}% | ${row.rejected}`);
  }

  lines.push(
    '',
    '## Attribution By Strategy',
    '',
    'Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked',
    '--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:'
  );
  for (const row of output.byStrategy) {
    lines.push(`${row.key} | ${row.candidates} | ${row.trades} | ${money(row.pnl)} | ${money(row.avgPerTrade)} | ${pct(row.winrate * 100)} | ${row.maxDrawdownPct.toFixed(2)}% | ${row.rejected + row.quarantined}`);
  }

  lines.push(
    '',
    '## Exit Reasons',
    '',
    'Reason | Trades | PnL | Avg/Trade | Winrate',
    '--- | ---: | ---: | ---: | ---:'
  );
  for (const row of output.byExitReason.slice(0, 12)) {
    lines.push(`${row.key} | ${row.trades} | ${money(row.pnl)} | ${money(row.avgPerTrade)} | ${pct(row.winrate * 100)}`);
  }

  lines.push(
    '',
    '## News Context For Weak Symbols',
    ''
  );
  if (output.newsContext.length) {
    lines.push('Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence');
    lines.push('--- | --- | --- | --- | ---: | ---: | ---:');
    for (const row of output.newsContext) {
      lines.push(`${row.symbol} | ${row.strength} | ${row.horizon} | ${row.direction} | ${row.avgReturn}% | ${pct(row.agreement * 100)} | ${row.confidence}`);
    }
  } else {
    lines.push('No strong/moderate news dependencies found for the weakest symbols yet.');
  }

  lines.push(
    '',
    '## Operator Rule',
    '',
    'Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function analyzeDrawdown() {
  const state = readIncubationState();
  const candidates = Object.values(state.candidates || {});
  const trades = candidates.flatMap(allTrades);
  const killSwitch = portfolioKillSwitch(state);
  const newsDeps = readJson(NEWS_DEPS_PATH, { rows: [] });

  const summary = {
    candidates: candidates.length,
    incubating: candidates.filter((candidate) => candidate.status === 'incubating').length,
    rejected: candidates.filter((candidate) => candidate.status === 'rejected').length,
    forwardTrades: killSwitch.metrics.forwardTrades,
    forwardPnl: killSwitch.metrics.forwardPnl,
    avgPerTrade: killSwitch.metrics.avgPerTrade,
    activePositiveRatio: killSwitch.metrics.activePositiveRatio
  };
  const worstCandidates = dominantLosers(candidates);
  const bySymbol = groupCandidates(candidates, (candidate) => candidate.symbol);
  const byInterval = groupCandidates(candidates, (candidate) => candidate.interval);
  const byStrategy = groupCandidates(candidates, (candidate) => candidate.strategy);
  const byExitReason = groupTrades(trades, (trade) => trade.reason || 'unknown');
  const weakSymbols = bySymbol.filter((row) => row.pnl < 0).slice(0, 8).map((row) => row.key);
  const newsContext = weakSymbols
    .map((symbol) => dependencyForSymbol(newsDeps, symbol))
    .filter(Boolean);
  const actions = buildActions(bySymbol, byInterval, byStrategy, worstCandidates, killSwitch, newsDeps, candidates);

  const output = {
    generatedAt: new Date().toISOString(),
    incubationUpdatedAt: state.updatedAt || null,
    summary,
    killSwitch,
    actions,
    worstCandidates,
    bySymbol,
    byInterval,
    byStrategy,
    byExitReason,
    newsContext
  };

  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeReport(output);

  return {
    generatedAt: output.generatedAt,
    reportPath: REPORT_PATH,
    jsonPath: JSON_PATH,
    killSwitch: {
      active: killSwitch.active,
      reasons: killSwitch.soft?.reasons || killSwitch.hard?.reasons || []
    },
    summary,
    topActions: actions.slice(0, 5)
  };
}

function main() {
  console.log(JSON.stringify(analyzeDrawdown(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { analyzeDrawdown };
