/**
 * TradeLab Paper Trader
 * 
 * Симуляция real-money торговли с задержками и проскальзыванием.
 * 
 * Функции:
 * - Order Simulation: исполнение ордеров с задержкой (latency simulation)
 * - Slippage: проскальзывание цены при исполнении
 * - Fill Simulation: частичное/полное исполнение ордеров
 * - Commission: комиссия за сделку
 * - Order Book: симуляция стакана заявок
 * 
 * Все операции paper-only. Реальные ордера не размещаются.
 */

const fs = require('fs');
const path = require('path');

const { detectPhase } = require('./tradelab_market_phase');

const ROOT = path.join(__dirname, '..');
const STATE_PATH = path.join(ROOT, 'tradelab-incubation-state.json');
const PAPER_TRADER_PATH = path.join(ROOT, 'tradelab-paper-trader.json');
const PAPER_TRADER_REPORT = path.join(ROOT, 'TRADELAB_PAPER_TRADER.md');

// ===== КОНФИГУРАЦИЯ =====

const PAPER_CONFIG = {
  // Симуляция задержки (мс)
  latency: {
    // Минимальная задержка
    min: 50,
    // Максимальная задержка
    max: 500,
    // Задержка для рыночных ордеров
    marketOrderLatency: 100,
    // Задержка для лимитных ордеров
    limitOrderLatency: 200,
  },

  // Проскальзывание
  slippage: {
    // Базовое проскальзывание (%)
    base: 0.05,
    // Проскальзывание для волатильных инструментов (%)
    volatileMultiplier: 2,
    // Проскальзывание для низколиквидных инструментов (%)
    lowLiquidityMultiplier: 3,
    // Максимальное проскальзывание (%)
    maxSlippage: 1.0,
  },

  // Исполнение ордеров
  fill: {
    // Вероятность полного исполнения рыночного ордера
    marketFillProbability: 0.95,
    // Вероятность полного исполнения лимитного ордера
    limitFillProbability: 0.60,
    // Минимальный процент исполнения
    minFillPercent: 50,
    // Максимальный процент исполнения
    maxFillPercent: 100,
  },

  // Комиссия
  commission: {
    // Комиссия maker (%)
    maker: 0.02,
    // Комиссия taker (%)
    taker: 0.04,
    // Минимальная комиссия (USDT)
    minCommission: 0.1,
  },

  // Типы ордеров
  orderTypes: {
    market: {
      label: 'Market',
      fillSpeed: 'instant',
      slippageRisk: 'high',
    },
    limit: {
      label: 'Limit',
      fillSpeed: 'slow',
      slippageRisk: 'none',
    },
    stop: {
      label: 'Stop',
      fillSpeed: 'delayed',
      slippageRisk: 'medium',
    },
    stopLimit: {
      label: 'Stop Limit',
      fillSpeed: 'delayed',
      slippageRisk: 'low',
    },
  },

  // Ограничения
  limits: {
    // Минимальный размер ордера (USDT)
    minOrderSize: 10,
    // Максимальный размер ордера (USDT)
    maxOrderSize: 10000,
    // Максимальное количество открытых ордеров
    maxOpenOrders: 10,
  }
};

// ===== СОСТОЯНИЕ =====

function readState() {
  if (!fs.existsSync(STATE_PATH)) return { candidates: {}, summary: null };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function readPaperState() {
  if (!fs.existsSync(PAPER_TRADER_PATH)) return getDefaultPaperState();
  try {
    return JSON.parse(fs.readFileSync(PAPER_TRADER_PATH, 'utf8'));
  } catch {
    return getDefaultPaperState();
  }
}

function getDefaultPaperState() {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    // История ордеров
    orders: [],
    // Открытые ордера
    openOrders: [],
    // Закрытые позиции
    closedPositions: [],
    // Статистика
    stats: {
      totalOrders: 0,
      filledOrders: 0,
      partiallyFilled: 0,
      cancelledOrders: 0,
      rejectedOrders: 0,
      totalCommission: 0,
      totalSlippage: 0,
      averageLatency: 0,
    },
    // Баланс (симулированный)
    balance: {
      initial: 10000,
      current: 10000,
      equity: 10000,
      free: 10000,
      locked: 0,
    }
  };
}

function savePaperState(state) {
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(PAPER_TRADER_PATH, JSON.stringify(state, null, 2));
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function randomLatency(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFill() {
  return Math.floor(Math.random() * (PAPER_CONFIG.fill.maxFillPercent - PAPER_CONFIG.fill.minFillPercent + 1)) + PAPER_CONFIG.fill.minFillPercent;
}

function calculateSlippage(candidate, orderType) {
  const config = PAPER_CONFIG.slippage;
  let slippage = config.base;

  // Используем ATR% из market phase для реалистичного slippage
  const atrPct = candidate.atrPct || 0;
  if (atrPct > 0) {
    // ATR-based slippage: базовый 5% от ATR для market, 2% для limit
    const atrSlippage = orderType === 'market' ? atrPct * 0.05 : atrPct * 0.02;
    slippage = Math.max(slippage, atrSlippage);
  }

  // Волатильность (запасной вариант, если нет ATR)
  if (!atrPct && (candidate.volatility || 0) > 0.05) {
    slippage *= config.volatileMultiplier;
  }

  // Ликвидность
  if ((candidate.volume || 0) < 1000000) {
    slippage *= config.lowLiquidityMultiplier;
  }

  // Тип ордера
  if (orderType === 'market') {
    slippage *= 2;
  } else if (orderType === 'limit') {
    slippage = slippage * 0.3; // Лимитные ордера с минимальным проскальзыванием
  }

  return Math.min(slippage, config.maxSlippage);
}

function calculateCommission(orderValue, isTaker) {
  const config = PAPER_CONFIG.commission;
  const rate = isTaker ? config.taker : config.maker;
  const commission = orderValue * (rate / 100);
  return Math.max(commission, config.minCommission);
}

// ===== СИМУЛЯЦИЯ ОРДЕРА =====

async function simulateOrder(candidate, orderType, side, quantity, price) {
  const paperState = readPaperState();
  const config = PAPER_CONFIG;

  // Проверка лимитов
  const orderValue = quantity * price;
  if (orderValue < config.limits.minOrderSize) {
    return {
      success: false,
      reason: `Order value ${orderValue.toFixed(2)} USDT < minimum ${config.limits.minOrderSize} USDT`,
      order: null
    };
  }
  if (orderValue > config.limits.maxOrderSize) {
    return {
      success: false,
      reason: `Order value ${orderValue.toFixed(2)} USDT > maximum ${config.limits.maxOrderSize} USDT`,
      order: null
    };
  }
  if (paperState.openOrders.length >= config.limits.maxOpenOrders) {
    return {
      success: false,
      reason: `Maximum open orders (${config.limits.maxOpenOrders}) reached`,
      order: null
    };
  }

  // Симуляция задержки
  const latency = orderType === 'market' 
    ? randomLatency(config.latency.marketOrderLatency, config.latency.marketOrderLatency * 2)
    : randomLatency(config.latency.limitOrderLatency, config.latency.limitOrderLatency * 2);
  
  await new Promise(resolve => setTimeout(resolve, Math.min(latency, 100))); // Не ждём реально >100мс

  // Симуляция проскальзывания
  const slippagePct = calculateSlippage(candidate, orderType);
  const slippageAmount = price * (slippagePct / 100);
  const executedPrice = side === 'buy' 
    ? price + slippageAmount  // Покупаем дороже
    : price - slippageAmount; // Продаём дешевле

  // Симуляция исполнения
  let fillPct = 100;
  let isTaker = true;

  if (orderType === 'market') {
    // Рыночные ордера исполняются почти всегда полностью
    fillPct = Math.random() < config.fill.marketFillProbability ? 100 : randomFill();
    isTaker = true;
  } else if (orderType === 'limit') {
    // Лимитные ордера могут исполниться частично
    fillPct = Math.random() < config.fill.limitFillProbability ? 100 : randomFill();
    isTaker = false;
  }

  const filledQuantity = quantity * (fillPct / 100);
  const executedValue = filledQuantity * executedPrice;
  const commission = calculateCommission(executedValue, isTaker);
  const slippageCost = Math.abs(executedPrice - price) * filledQuantity;

  // Создаём ордер
  const order = {
    id: `paper_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy,
    side,
    orderType,
    requestedQuantity: quantity,
    requestedPrice: price,
    filledQuantity: Number(filledQuantity.toFixed(6)),
    executedPrice: Number(executedPrice.toFixed(2)),
    fillPct,
    commission: Number(commission.toFixed(2)),
    slippagePct: Number(slippagePct.toFixed(3)),
    slippageCost: Number(slippageCost.toFixed(2)),
    latency,
    value: Number(executedValue.toFixed(2)),
    status: fillPct >= 100 ? 'filled' : fillPct > 0 ? 'partially_filled' : 'rejected',
  };

  // Обновляем статистику
  paperState.stats.totalOrders++;
  paperState.stats.averageLatency = (paperState.stats.averageLatency * (paperState.stats.totalOrders - 1) + latency) / paperState.stats.totalOrders;
  paperState.stats.totalCommission += commission;
  paperState.stats.totalSlippage += slippageCost;

  if (order.status === 'filled') {
    paperState.stats.filledOrders++;
    paperState.orders.push(order);
    
    // Обновляем баланс
    if (side === 'buy') {
      paperState.balance.current -= executedValue + commission;
      paperState.balance.free -= executedValue + commission;
    } else {
      paperState.balance.current += executedValue - commission;
      paperState.balance.free += executedValue - commission;
    }
    paperState.balance.equity = paperState.balance.current;

  } else if (order.status === 'partially_filled') {
    paperState.stats.partiallyFilled++;
    paperState.openOrders.push(order);
    
    // Частичное исполнение
    if (side === 'buy') {
      paperState.balance.current -= executedValue + commission;
      paperState.balance.free -= executedValue + commission;
    } else {
      paperState.balance.current += executedValue - commission;
      paperState.balance.free += executedValue - commission;
    }
    paperState.balance.equity = paperState.balance.current;

  } else {
    paperState.stats.rejectedOrders++;
  }

  savePaperState(paperState);

  return {
    success: order.status !== 'rejected',
    order,
    simulation: {
      latency,
      slippagePct,
      slippageCost,
      commission,
      fillPct,
      executedPrice,
    }
  };
}

// ===== ТЕСТОВЫЙ ЗАПУСК =====

async function runPaperSimulation() {
  const state = readState();
  const candidates = Object.values(state.candidates || {});
  const results = [];

  for (const c of candidates.slice(0, 3)) { // Симулируем только первые 3
    const price = c.currentPrice || 100;
    const quantity = 1; // 1 единица для теста

    // Покупка
    const buyResult = await simulateOrder(c, 'market', 'buy', quantity, price);
    results.push(buyResult);

    // Продажа (через лимитный ордер)
    const sellResult = await simulateOrder(c, 'limit', 'sell', quantity, price * 1.02);
    results.push(sellResult);
  }

  return results;
}

// ===== ГЕНЕРАЦИЯ ОТЧЁТА =====

function generateReport() {
  const paperState = readPaperState();
  const lines = [];

  // Определяем текущую фазу рынка
  let marketPhase = 'unknown';
  try {
    const phase = detectPhase([]);
    marketPhase = phase.phase || 'unknown';
  } catch (_) { /* ignore */ }

  lines.push('# TradeLab Paper Trader Report');
  lines.push('');
  lines.push(`Generated: ${paperState.updatedAt}`);
  lines.push(`Market phase: **${marketPhase}**`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Баланс
  lines.push('## Account Balance');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Initial Balance | ${paperState.balance.initial} USDT |`);
  lines.push(`| Current Balance | ${paperState.balance.current.toFixed(2)} USDT |`);
  lines.push(`| Equity | ${paperState.balance.equity.toFixed(2)} USDT |`);
  lines.push(`| Free | ${paperState.balance.free.toFixed(2)} USDT |`);
  lines.push(`| Locked | ${paperState.balance.locked.toFixed(2)} USDT |`);
  lines.push(`| PnL | ${(paperState.balance.current - paperState.balance.initial).toFixed(2)} USDT |`);
  lines.push('');

  // Статистика
  lines.push('## Order Statistics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Total Orders | ${paperState.stats.totalOrders} |`);
  lines.push(`| Filled Orders | ${paperState.stats.filledOrders} |`);
  lines.push(`| Partially Filled | ${paperState.stats.partiallyFilled} |`);
  lines.push(`| Cancelled | ${paperState.stats.cancelledOrders} |`);
  lines.push(`| Rejected | ${paperState.stats.rejectedOrders} |`);
  lines.push(`| Total Commission | ${paperState.stats.totalCommission.toFixed(2)} USDT |`);
  lines.push(`| Total Slippage | ${paperState.stats.totalSlippage.toFixed(2)} USDT |`);
  lines.push(`| Average Latency | ${paperState.stats.averageLatency.toFixed(0)} ms |`);
  lines.push('');

  // Последние ордера
  const recentOrders = paperState.orders.slice(-10).reverse();
  if (recentOrders.length) {
    lines.push('## Recent Orders');
    lines.push('');
    lines.push('| Time | Symbol | Side | Type | Qty | Price | Fill% | Commission | Slippage |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const o of recentOrders) {
      lines.push(`| ${o.timestamp.slice(11, 19)} | ${o.symbol} | ${o.side} | ${o.orderType} | ${o.filledQuantity} | ${o.executedPrice} | ${o.fillPct}% | ${o.commission} | ${o.slippagePct}% |`);
    }
    lines.push('');
  }

  // Открытые ордера
  if (paperState.openOrders.length) {
    lines.push('## Open Orders');
    lines.push('');
    for (const o of paperState.openOrders) {
      lines.push(`- ${o.side.toUpperCase()} ${o.symbol} ${o.orderType}: ${o.filledQuantity}/${o.requestedQuantity} @ ${o.executedPrice}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('*This is a paper-only trading simulation. No real orders are placed.*');

  fs.writeFileSync(PAPER_TRADER_REPORT, lines.join('\n'));
  return PAPER_TRADER_REPORT;
}

// ===== MAIN =====

async function main() {
  console.log('📈 TradeLab Paper Trader');
  console.log('   Simulating paper orders with latency, slippage, and commission...\n');

  const results = await runPaperSimulation();
  
  for (const r of results) {
    if (r.success) {
      console.log(`   ✅ ${r.order.side.toUpperCase()} ${r.order.symbol} ${r.order.orderType}`);
      console.log(`      Price: ${r.order.executedPrice} | Fill: ${r.order.fillPct}% | Commission: ${r.order.commission} USDT | Slippage: ${r.order.slippagePct}% | Latency: ${r.order.latency}ms`);
    } else {
      console.log(`   ❌ ${r.reason}`);
    }
  }

  const reportPath = generateReport();
  console.log(`\n   Report saved to: ${reportPath}`);
  console.log(`   Paper state: ${PAPER_TRADER_PATH}`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  simulateOrder,
  runPaperSimulation,
  generateReport,
  PAPER_CONFIG
};
