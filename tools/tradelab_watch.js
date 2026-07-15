const fs = require('fs');
const path = require('path');

const { reviewCycle } = require('./tradelab_review_cycle');
const { detectPhase } = require('./tradelab_market_phase');
const { collectAllData, saveNews, saveMacroData, getMacroSummary } = require('./tradelab_data_collector');
const { runOptimization, applyOptimization } = require('./tradelab_strategy_optimizer');
const { runScanner, applyNewStrategies } = require('./tradelab_strategy_scanner');

const LOG_PATH = path.join(__dirname, '..', 'TRADELAB_WATCH_LOG.md');

// ===== РАСПИСАНИЕ =====
// Каждое действие выполняется не чаще указанного интервала (в мс)
const SCHEDULE = {
  reviewCycle: 0,        // каждый цикл
  collectData: 4 * 60 * 60 * 1000,  // раз в 4 часа
  optimize: 6 * 60 * 60 * 1000,     // раз в 6 часов
  scan: 24 * 60 * 60 * 1000         // раз в сутки
};

// Файл для хранения времени последнего запуска каждого действия
const SCHEDULE_PATH = path.join(__dirname, '..', 'tradelab-schedule.json');

function loadSchedule() {
  try {
    if (fs.existsSync(SCHEDULE_PATH)) {
      return JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
    }
  } catch (_) { /* ignore */ }
  return {};
}

function saveSchedule(schedule) {
  fs.writeFileSync(SCHEDULE_PATH, JSON.stringify(schedule, null, 2), 'utf8');
}

function shouldRun(action, schedule) {
  const last = schedule[action] || 0;
  const interval = SCHEDULE[action] || 0;
  return (Date.now() - last) >= interval;
}

function markRun(action, schedule) {
  schedule[action] = Date.now();
  saveSchedule(schedule);
}

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLog(entry) {
  const status = [
    `### ${entry.startedAt}`,
    '',
    `- Gate: ${entry.gate}`,
    `- Market phase: ${entry.marketPhase}`,
    `- Incubating: ${entry.incubating}`,
    `- Ready for review: ${entry.readyForReview}`,
    `- Rejected: ${entry.rejected}`,
    `- Next action: ${entry.nextAction}`,
    ''
  ].join('\n');
  fs.appendFileSync(LOG_PATH, status);
}

async function watch() {
  const runs = Math.max(1, Number(argValue('runs', 24)));
  const minutes = Math.max(0, Number(argValue('minutes', 60)));
  const dryRun = hasFlag('dry-run');
  const forever = hasFlag('forever');

  const config = {
    runs: forever ? Infinity : runs,
    minutes,
    dryRun,
    forever,
    logPath: LOG_PATH,
    note: 'Paper-only watcher. No API keys, no exchange account access, no orders.'
  };

  if (dryRun) {
    return { config, message: 'Dry run only. No network refresh was started.' };
  }

  const schedule = loadSchedule();
  const results = [];

  for (let index = 0; index < runs; index += 1) {
    const startedAt = new Date().toISOString();
    const actions = [];

    // === 1. REVIEW CYCLE (всегда) ===
    const result = await reviewCycle();
    actions.push('review');
    let marketPhase = 'unknown';
    try {
      const phase = detectPhase([]);
      marketPhase = phase.phase || 'unknown';
    } catch (_) { /* ignore */ }

    // === 2. СБОР НОВОСТЕЙ И МАКРО-ДАННЫХ (раз в 4 часа) ===
    let macroSummary = '';
    if (shouldRun('collectData', schedule)) {
      try {
        const data = await collectAllData({});
        saveNews(data.news);
        saveMacroData(data);
        macroSummary = getMacroSummary();
        markRun('collectData', schedule);
        actions.push('data');
        console.log('[DataCollector] News: ' + data.news.length + ' | F&G: ' + (data.fearGreed ? data.fearGreed.value : 'N/A'));
      } catch (e) {
        console.log('[DataCollector] Error: ' + e.message);
      }
    }

    // === 3. ОПТИМИЗАЦИЯ СТРАТЕГИЙ (раз в 6 часов) ===
    let optimizerResult = '';
    if (shouldRun('optimize', schedule)) {
      try {
        const optResult = runOptimization({ fearGreed: { value: 0, label: 'unknown' }, macro: null });
        const updated = applyOptimization();
        optimizerResult = 'Healthy: ' + optResult.summary.healthy + ' | Updated: ' + updated;
        markRun('optimize', schedule);
        actions.push('optimize');
        console.log('[Optimizer] ' + optimizerResult);
      } catch (e) {
        console.log('[Optimizer] Error: ' + e.message);
      }
    }

    // === 4. СКАНИРОВАНИЕ НОВЫХ СТРАТЕГИЙ (раз в сутки) ===
    let scanResult = '';
    if (shouldRun('scan', schedule)) {
      try {
        const scanRes = runScanner();
        const added = applyNewStrategies(3);
        scanResult = 'Found: ' + scanRes.summary.found + ' | Added: ' + added;
        markRun('scan', schedule);
        actions.push('scan');
        console.log('[Scanner] ' + scanResult);
      } catch (e) {
        console.log('[Scanner] Error: ' + e.message);
      }
    }

    const entry = {
      startedAt,
      gate: result.gate.status,
      marketPhase,
      incubating: result.incubation.incubating,
      readyForReview: result.incubation.readyForReview,
      rejected: result.incubation.rejected,
      nextAction: result.gate.nextAction,
      actions: actions.join(', '),
      macroSummary: macroSummary,
      optimizerResult: optimizerResult,
      scanResult: scanResult
    };
    appendLog(entry);
    results.push(entry);

    if (index < runs - 1 && minutes > 0) {
      await sleep(minutes * 60 * 1000);
    }
  }

  return { config, results };
}

async function main() {
  const result = await watch();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { watch };
