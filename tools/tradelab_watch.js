const fs = require('fs');
const path = require('path');

const { reviewCycle } = require('./tradelab_review_cycle');

const LOG_PATH = path.join(__dirname, '..', 'TRADELAB_WATCH_LOG.md');

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

  const config = {
    runs,
    minutes,
    dryRun,
    logPath: LOG_PATH,
    note: 'Paper-only watcher. No API keys, no exchange account access, no orders.'
  };

  if (dryRun) {
    return { config, message: 'Dry run only. No network refresh was started.' };
  }

  const results = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = new Date().toISOString();
    const result = await reviewCycle();
    const entry = {
      startedAt,
      gate: result.gate.status,
      incubating: result.incubation.incubating,
      readyForReview: result.incubation.readyForReview,
      rejected: result.incubation.rejected,
      nextAction: result.gate.nextAction
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
