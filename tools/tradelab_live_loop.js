// ============================================================
// TradeLab — Live Trading Loop (автоматический цикл)
// ============================================================
// Запускается каждые N минут, проверяет gate и сигналы,
// выполняет сделки если все условия соблюдены.
// ============================================================

const fs = require('fs');
const path = require('path');
const { executeTrade, checkGate, loadTrades, loadDailyPnl } = require('./tradelab_live_executor');
const { evaluateGate } = require('./tradelab_real_money_gate');
const { evaluateSoftGate } = require('./tradelab_soft_gate');
const { portfolioKillSwitch } = require('./tradelab_risk_controls');

const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');

const CONFIG = {
  // Интервал проверки в минутах
  checkIntervalMinutes: Number(process.env.LIVE_LOOP_INTERVAL_MINUTES) || 15,
  // Режим: 'paper' (только логирует) или 'live' (реальные сделки)
  mode: process.env.LIVE_LOOP_MODE || 'paper',
  // Максимум сделок за цикл
  maxTradesPerCycle: 2,
  // Только кандидаты с PnL выше порога
  minPnlThreshold: 0
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${msg}`);
}

// ============================================================
// Поиск лучших кандидатов для торговли
// ============================================================

function findBestCandidates() {
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const candidates = Object.values(state.candidates || {});
  
  // Фильтруем: только с положительным PnL и PF > 1.5
  const profitable = candidates.filter(c => 
    (c.forwardPaperPnl || 0) > CONFIG.minPnlThreshold &&
    (c.profitFactor || 0) > 1.5 &&
    (c.forwardPaperTrades || 0) >= 3
  );
  
  // Сортируем по PnL (лучшие сверху)
  profitable.sort((a, b) => (b.forwardPaperPnl || 0) - (a.forwardPaperPnl || 0));
  
  return profitable.slice(0, CONFIG.maxTradesPerCycle);
}

// ============================================================
// Основной цикл
// ============================================================

async function liveLoop() {
  log('========================================');
  log(`TradeLab Live Loop STARTED`);
  log(`Mode: ${CONFIG.mode}`);
  log(`Check interval: ${CONFIG.checkIntervalMinutes} min`);
  log('========================================\n');

  let cycleCount = 0;

  while (true) {
    cycleCount++;
    log(`--- Cycle #${cycleCount} ---`);

    try {
      // 1. Проверяем kill-switch
      const killSwitch = portfolioKillSwitch();
      if (killSwitch.blocksRealMoney) {
        log(`⛔ Kill-switch active: ${killSwitch.soft.reasons.join('; ')}`);
        log(`   Waiting ${CONFIG.checkIntervalMinutes} min...\n`);
        await sleep(CONFIG.checkIntervalMinutes * 60 * 1000);
        continue;
      }

      // 2. Проверяем gate
      const gate = evaluateGate();
      log(`Gate: ${gate.gate}`);
      
      if (gate.gate !== 'MANUAL_REVIEW_ALLOWED') {
        log(`   Gate BLOCKED: ${gate.nextAction}`);
        
        // В paper-режиме всё равно показываем что могли бы сделать
        if (CONFIG.mode === 'paper') {
          const best = findBestCandidates();
          if (best.length > 0) {
            log(`   📋 Paper signal — best candidates:`);
            best.forEach(c => {
              const key = `${c.symbol}:${c.interval}:${c.strategy}`;
              log(`      ${key}: PnL +${(c.forwardPaperPnl || 0).toFixed(2)}$, PF ${(c.profitFactor || 0).toFixed(2)}`);
            });
          }
        }
        
        log(`   Waiting ${CONFIG.checkIntervalMinutes} min...\n`);
        await sleep(CONFIG.checkIntervalMinutes * 60 * 1000);
        continue;
      }

      // 3. Gate открыт — ищем кандидатов
      const allowedCandidates = gate.allowed || [];
      
      if (allowedCandidates.length === 0) {
        log(`   No candidates ready for live trading`);
        log(`   Waiting ${CONFIG.checkIntervalMinutes} min...\n`);
        await sleep(CONFIG.checkIntervalMinutes * 60 * 1000);
        continue;
      }

      log(`   ✅ ${allowedCandidates.length} candidate(s) ready:`);
      allowedCandidates.forEach(c => {
        log(`      ${c.key}: PnL ${c.metrics.forwardPaperPnl}$, PF ${c.metrics.profitFactor}`);
      });

      // 4. Выполняем сделки
      if (CONFIG.mode === 'live') {
        for (const candidate of allowedCandidates.slice(0, CONFIG.maxTradesPerCycle)) {
          log(`   🚀 Executing trade for: ${candidate.key}`);
          
          try {
            const result = await executeTrade(candidate.key);
            if (result.success) {
              log(`      ✅ Trade executed! Entry: ${result.trade.entryPrice}, Size: ${result.trade.size}`);
            } else {
              log(`      ❌ Trade failed: ${result.reason}`);
            }
          } catch (error) {
            log(`      ❌ Error: ${error.message}`);
          }
          
          // Пауза между сделками
          await sleep(5000);
        }
      } else {
        log(`   📋 Paper mode — would execute ${Math.min(allowedCandidates.length, CONFIG.maxTradesPerCycle)} trade(s)`);
      }

    } catch (error) {
      log(`❌ Cycle error: ${error.message}`);
    }

    log(`   Waiting ${CONFIG.checkIntervalMinutes} min...\n`);
    await sleep(CONFIG.checkIntervalMinutes * 60 * 1000);
  }
}

// ============================================================
// CLI entry point
// ============================================================

async function main() {
  const mode = process.argv[2] || CONFIG.mode;
  
  if (mode === 'live' || mode === 'paper') {
    CONFIG.mode = mode;
  }
  
  if (mode === '--once') {
    // Один цикл для проверки
    CONFIG.mode = 'paper';
    const best = findBestCandidates();
    console.log(JSON.stringify({ best, gate: evaluateGate().gate, killSwitch: portfolioKillSwitch() }, null, 2));
    return;
  }

  await liveLoop();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { liveLoop, findBestCandidates };
