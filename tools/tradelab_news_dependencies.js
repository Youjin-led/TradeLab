const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'tradelab-news-impact.json');
const REPORT_PATH = path.join(ROOT, 'TRADELAB_NEWS_DEPENDENCIES.md');
const JSON_PATH = path.join(ROOT, 'tradelab-news-dependencies.json');

const HORIZONS = [
  { key: 'r1h', label: '1h' },
  { key: 'r4h', label: '4h' },
  { key: 'r12h', label: '12h' },
  { key: 'r24h', label: '24h' }
];

function readInput() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error('Missing tradelab-news-impact.json. Run npm.cmd run tradelab:news first.');
  }
  return JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function correlation(xs, ys) {
  if (xs.length < 3 || xs.length !== ys.length) return 0;
  const mx = average(xs);
  const my = average(ys);
  const numerator = xs.reduce((sum, x, index) => sum + ((x - mx) * (ys[index] - my)), 0);
  const dx = Math.sqrt(xs.reduce((sum, x) => sum + ((x - mx) ** 2), 0));
  const dy = Math.sqrt(ys.reduce((sum, y) => sum + ((y - my) ** 2), 0));
  return dx && dy ? numerator / (dx * dy) : 0;
}

function confidence(count, absEffect, agreement, absCorr) {
  let score = 0;
  score += Math.min(40, count * 4);
  score += Math.min(25, absEffect * 8);
  score += Math.min(20, Math.max(0, agreement - 0.5) * 80);
  score += Math.min(15, absCorr * 30);
  return Math.round(score);
}

function classify(row) {
  if (row.count < 5) return 'too-thin';
  if (row.confidence >= 70 && Math.abs(row.avgReturn) >= 1 && row.agreement >= 0.62) return 'strong';
  if (row.confidence >= 50 && Math.abs(row.avgReturn) >= 0.5 && row.agreement >= 0.56) return 'moderate';
  return 'weak';
}

function dependencyRows(events) {
  const rows = [];
  const groups = new Map();

  for (const event of events) {
    for (const horizon of HORIZONS) {
      const value = event.reaction && event.reaction[horizon.key];
      if (!Number.isFinite(value)) continue;
      const keys = [
        `${event.symbol}:all:${horizon.key}`,
        `${event.symbol}:${event.sentiment.label}:${horizon.key}`
      ];
      for (const key of keys) {
        const group = groups.get(key) || {
          key,
          symbol: event.symbol,
          sentiment: key.split(':')[1],
          horizon: horizon.label,
          horizonKey: horizon.key,
          returns: [],
          scores: [],
          titles: []
        };
        group.returns.push(value);
        group.scores.push(event.sentiment.score);
        group.titles.push(event.title);
        groups.set(key, group);
      }
    }
  }

  for (const group of groups.values()) {
    const avgReturn = average(group.returns);
    const direction = avgReturn > 0 ? 'up' : avgReturn < 0 ? 'down' : 'flat';
    const sameDirection = group.returns.filter((value) => direction === 'up' ? value > 0 : direction === 'down' ? value < 0 : value === 0).length;
    const agreement = group.returns.length ? sameDirection / group.returns.length : 0;
    const corr = correlation(group.scores, group.returns);
    const score = confidence(group.returns.length, Math.abs(avgReturn), agreement, Math.abs(corr));
    const row = {
      symbol: group.symbol,
      sentiment: group.sentiment,
      horizon: group.horizon,
      count: group.returns.length,
      avgReturn: Number(avgReturn.toFixed(3)),
      medianReturn: Number([...group.returns].sort((a, b) => a - b)[Math.floor(group.returns.length / 2)].toFixed(3)),
      stdev: Number(stdev(group.returns).toFixed(3)),
      direction,
      agreement: Number(agreement.toFixed(3)),
      sentimentReturnCorr: Number(corr.toFixed(3)),
      confidence: score,
      strength: '',
      examples: group.titles.slice(0, 3)
    };
    row.strength = classify(row);
    rows.push(row);
  }

  return rows.sort((a, b) => {
    const rank = { strong: 0, moderate: 1, weak: 2, 'too-thin': 3 };
    return rank[a.strength] - rank[b.strength]
      || b.confidence - a.confidence
      || Math.abs(b.avgReturn) - Math.abs(a.avgReturn);
  });
}

function marketNarratives(rows) {
  const useful = rows.filter((row) => row.strength === 'strong' || row.strength === 'moderate');
  return useful.slice(0, 10).map((row) => {
    const sentiment = row.sentiment === 'all' ? 'all matched news' : `${row.sentiment} news`;
    return `${row.symbol}: ${sentiment} has a ${row.strength} ${row.horizon} ${row.direction} dependency, avg ${row.avgReturn}%, agreement ${(row.agreement * 100).toFixed(0)}%, n=${row.count}.`;
  });
}

function writeReport(output) {
  const lines = [
    '# TradeLab News/Market Dependencies',
    '',
    `Generated: ${output.generatedAt}`,
    `Input news-impact generated: ${output.inputGeneratedAt || 'unknown'}`,
    `Matched events: ${output.matchedEvents}`,
    '',
    'This is research-only. Dependencies are hypotheses until they survive more samples and forward validation.',
    '',
    '## Findings',
    ''
  ];

  if (output.narratives.length) {
    for (const narrative of output.narratives) lines.push(`- ${narrative}`);
  } else {
    lines.push('- No strong or moderate dependencies yet. Keep collecting samples.');
  }

  lines.push(
    '',
    '## Dependency Table',
    '',
    'Symbol | Sentiment | Horizon | Strength | Count | Avg Return | Agreement | Corr | Confidence',
    '--- | --- | --- | --- | ---: | ---: | ---: | ---: | ---:'
  );
  for (const row of output.rows.slice(0, 40)) {
    lines.push(`${row.symbol} | ${row.sentiment} | ${row.horizon} | ${row.strength} | ${row.count} | ${row.avgReturn}% | ${(row.agreement * 100).toFixed(1)}% | ${row.sentimentReturnCorr} | ${row.confidence}`);
  }

  lines.push(
    '',
    '## Rules',
    '',
    '- `too-thin`: fewer than 5 events.',
    '- `weak`: not enough consistency or effect size.',
    '- `moderate`: enough events plus visible average move and direction agreement.',
    '- `strong`: larger effect, stronger agreement, and higher confidence.',
    '',
    'Do not use this as a standalone trading signal. It can only become a filter alongside paper strategy results and the real-money gate.'
  );

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function analyzeDependencies() {
  const input = readInput();
  const events = Array.isArray(input.events) ? input.events : [];
  const rows = dependencyRows(events);
  const output = {
    generatedAt: new Date().toISOString(),
    inputGeneratedAt: input.generatedAt || null,
    matchedEvents: events.length,
    narratives: marketNarratives(rows),
    rows
  };
  fs.writeFileSync(JSON_PATH, `${JSON.stringify(output, null, 2)}\n`);
  writeReport(output);
  return {
    generatedAt: output.generatedAt,
    matchedEvents: output.matchedEvents,
    findings: output.narratives,
    reportPath: REPORT_PATH
  };
}

function main() {
  console.log(JSON.stringify(analyzeDependencies(), null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { analyzeDependencies };
