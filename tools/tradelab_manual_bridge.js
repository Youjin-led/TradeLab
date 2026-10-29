// ============================================================
// TradeLab — Manual Review Bridge (server side)
// ============================================================
// Мост AI -> ручное подтверждение через GitHub-репозиторий.
//
// Поток:
//   1. live_loop находит кандидата с decision === 'manual-review-allowed'
//   2. createApprovalRequest() пишет заявку в tradelab-manual-approvals.json
//      (в GitHub через API, если есть GITHUB_TOKEN, иначе локально)
//      и отправляет в Telegram сообщение с кнопками Подтвердить/Отклонить
//   3. Android/Cloudflare-бот по нажатию кнопки обновляет files в GitHub
//   4. getApprovedCandidates() читает approvals и возвращает только approved
//   5. Сервер исполняет ТОЛЬКО approved (gate перепроверяется в executor)
// ============================================================

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { sendTelegram } = require('./tradelab_telegram_sender');

const REPO = 'Youjin-led/TradeLab';
const APPR_FILE = 'tradelab-manual-approvals.json';
const GITHUB_API = `https://api.github.com/repos/${REPO}/contents/${APPR_FILE}`;
const GITHUB_RAW = `https://raw.githubusercontent.com/${REPO}/main/${APPR_FILE}`;
const LOCAL_PATH = path.join(__dirname, '..', APPR_FILE);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const { effectiveLossCoolUntil, shouldRearmExecuted } = require('./tradelab_reapproval_policy');

// ===== local cache of sent requests (dedupe Telegram messages) =====
const SENT_PATH = path.join(__dirname, '..', 'tradelab-approval-sent.json');
// Incubation-state: по нему отсекаем фантомные approve (ключи вне state).
const STATE_PATH = path.join(__dirname, '..', 'tradelab-incubation-state.json');

function currentSourceApproval(record, state) {
  if (state?.marketDataSource !== 'okx-swap') return true;
  const migrationAt = Date.parse(state.createdAt || '');
  const requestedAt = Date.parse(record?.created || '');
  return Number.isFinite(migrationAt) && Number.isFinite(requestedAt) && requestedAt >= migrationAt;
}

function loadJSON(filepath, fallback) {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch { return fallback; }
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ===== GitHub file helpers =====

async function readRemoteApprovals() {
  // Через API contents (публичный репо) — всегда свежие данные, без CDN-кэша raw.
  try {
    const resp = await fetch(`${GITHUB_API}?ref=main&cb=${Date.now()}`, {
      headers: { 'User-Agent': 'TradeLab/1.0', Accept: 'application/vnd.github+json' }
    });
    if (!resp.ok) return null;
    const info = await resp.json();
    const content = Buffer.from(info.content.replace(/\n/g, ''), 'base64').toString('utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`[ApprovalBridge] Remote read error: ${e.message}`);
    return null;
  }
}

async function writeRemoteApprovals(approvals) {
  if (!GITHUB_TOKEN) return false;
  try {
    const resp = await fetch(GITHUB_API, {
      method: 'GET',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'TradeLab/1.0' }
    });
    let sha = null;
    if (resp.ok) {
      const existing = await resp.json();
      sha = existing.sha;
    }
    const putResp = await fetch(GITHUB_API, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'TradeLab/1.0', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'TradeLab manual approval update',
        content: Buffer.from(JSON.stringify(approvals, null, 2)).toString('base64'),
        sha: sha || undefined
      })
    });
    if (!putResp.ok) {
      const err = await putResp.text().catch(() => '');
      console.error(`[ApprovalBridge] GitHub write failed (${putResp.status}): ${err.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[ApprovalBridge] GitHub write error: ${e.message}`);
    return false;
  }
}

async function writeLocalApprovals(approvals) {
  try {
    saveJSON(LOCAL_PATH, approvals);
    return true;
  } catch (e) {
    console.error(`[ApprovalBridge] Local write error: ${e.message}`);
    return false;
  }
}

// ===== Main operations =====

async function getApprovals() {
  // Предпочитаем решения из GitHub (их пишет Cloudflare-бот после нажатия кнопки).
  // Репозиторий публичный (raw доступен без токена), поэтому читаем всегда.
  // Поверх накатываем локальный overlay: executed-метки сервер пишет только локально
  // (без GITHUB_TOKEN), и их нельзя терять при чтении remote.
  const remote = await readRemoteApprovals();
  const base = (remote && typeof remote === 'object') ? remote : loadJSON(LOCAL_PATH, {});
  return applyLocalOverlay(base);
}

async function setApprovals(approvals) {
  // Сохраняем локальные executed-метки: иначе следующая запись затрет их
  // remote-содержимым (last-writer-wins между двумя хранилищами).
  const merged = applyLocalOverlay(approvals);
  if (GITHUB_TOKEN) {
    const ok = await writeRemoteApprovals(merged);
    if (ok) return true;
  }
  return await writeLocalApprovals(merged);
}

// Локальные executed-метки — авторитетный overlay поверх любого источника.
// НО: свежее нажатие пользователя (remote decidedAt новее локального executedAt)
// всегда побеждает — иначе бессмертная метка будет давить новые approve вечно.
function applyLocalOverlay(approvals) {
  const local = loadJSON(LOCAL_PATH, {});
  const merged = { ...(approvals || {}) };
  for (const k of Object.keys(local)) {
    const v = local[k];
    if (v && (v.status === 'executed' || v.executed)) {
      const remoteDecided = new Date((merged[k] && merged[k].decidedAt) || 0).getTime() || 0;
      const localExec = new Date(v.executedAt || 0).getTime() || 0;
      if (remoteDecided > localExec) continue;
      // Дату НЕ выдумываем: если в локальной метке нет executedAt — оставляем как есть.
      // Иначе каждое чтение штампует «сейчас», setApprovals сохраняет его в файл,
      // и метка вечно молодеет (rearm невозможен никогда).
      merged[k] = {
        ...(merged[k] || { key: k }),
        status: 'executed',
        executed: true,
        ...(v.executedAt ? { executedAt: v.executedAt } : {})
      };
    }
  }
  return merged;
}

/**
 * Создаёт заявку на ручное подтверждение кандидата.
 * Шлёт Telegram-сообщение с кнопками. Дедуп по candidateKey.
 */
async function createApprovalRequest(candidate) {
  const approvals = await getApprovals();
  const key = candidate.key;
  const state = loadJSON(STATE_PATH, null);
  if (approvals[key] && !currentSourceApproval(approvals[key], state)) {
    delete approvals[key];
    const local = loadJSON(LOCAL_PATH, {});
    delete local[key];
    saveJSON(LOCAL_PATH, local);
    const sent = loadJSON(SENT_PATH, {});
    delete sent[key];
    saveJSON(SENT_PATH, sent);
    await setApprovals(approvals);
  }

  if (approvals[key] && approvals[key].status === 'approved') {
    return { ok: true, action: 'already-approved' };
  }
  if (approvals[key] && approvals[key].status === 'declined') {
    return { ok: true, action: 'already-declined' };
  }
  if (approvals[key] && Date.now() < effectiveLossCoolUntil(approvals[key], REAL_LOSS_COOLDOWN_MS)) {
    return { ok: true, action: 'cooldown' };
  }
  // Перевооружение исполненного: кандидат отработал реал в ноль/плюс, всё ещё proven
  // и прошло достаточно времени — просим кнопку заново, как в первый раз.
  // Порядок важен: сначала чистим локал+SENT, потом setApprovals — иначе overlay
  // воскресит executed раньше чистки. Кулдаун после убытка проверяется первым.
  if (approvals[key] && approvals[key].status === 'executed') {
    if (Date.now() < effectiveLossCoolUntil(approvals[key], REAL_LOSS_COOLDOWN_MS)) {
      return { ok: true, action: 'cooldown' };
    }
    let proven = false;
    try {
      proven = require('./tradelab_real_money_gate').isForwardProven(candidate);
    } catch { proven = false; }
    // Нет даты исполнения — fail-closed: ждём, а не перевооружаем мгновенно.
    // (Раньше отсутствие даты трактовалось как «давно», давая мгновенный rearm.)
    const execParsed = new Date(approvals[key].executedAt || NaN).getTime();
    if (!Number.isFinite(execParsed)) {
      return { ok: true, action: 'executed-wait' };
    }
    if (shouldRearmExecuted(approvals[key], Date.now(), proven, REAL_LOSS_COOLDOWN_MS, REARM_AFTER_MS)) {
      try {
        const sentLog = loadJSON(SENT_PATH, {});
        delete sentLog[key];
        saveJSON(SENT_PATH, sentLog);
        const localFile = loadJSON(LOCAL_PATH, {});
        delete localFile[key];
        saveJSON(LOCAL_PATH, localFile);
      } catch { /* ignore */ }
      delete approvals[key];
      await setApprovals(approvals);
    } else {
      return { ok: true, action: 'executed-wait' };
    }
  }

  // Локальный dedupe: уже отправляли кнопку по этому кандидату (независимо от GitHub-решений)
  const sentLog = loadJSON(SENT_PATH, {});
  if (sentLog[key]) {
    if (!approvals[key]) {
      approvals[key] = {
        key,
        symbol: candidate.symbol,
        interval: candidate.interval,
        strategy: candidate.strategy || '',
        side: candidate.side || 'auto',
        forwardPnL: candidate.forwardPaperPnl || 0,
        forwardPF: candidate.forwardProfitFactor != null ? candidate.forwardProfitFactor : null,
        forwardTrades: candidate.forwardPaperTrades || 0,
        status: 'pending',
        created: new Date().toISOString(),
        messageLink: sentLog[key].messageLink || `tl-${key.replace(/[^A-Za-z0-9]/g, '-')}`
      };
      await setApprovals(approvals);
    }
    return { ok: true, action: 'already-sent' };
  }

  const msgId = `tl-${key.replace(/[^A-Za-z0-9]/g, '-')}`;

  const text =
    `🧠 *AI-кандидат ждёт вашего решения*\n\n` +
    `Ключ: \`${candidate.key}\`\n` +
    `Сторона: ${candidate.side || 'auto'}\n` +
    `Forward PnL: +${(candidate.forwardPaperPnl || 0).toFixed(2)}$\n` +
    `Forward PF: ${candidate.forwardProfitFactor != null ? candidate.forwardProfitFactor.toFixed(2) : 'n/a'}\n` +
    `Paper trades: ${candidate.forwardPaperTrades || 0}\n\n` +
    `Нажмите **✅ Подтвердить** — реальный вход будет выполнен в следующем цикле\n` +
    `Нажмите **⛔ Отклонить** — кандидат отбрасывается`;

  const opts = {
    inlineButtons: [
      [
        { text: '✅ Подтвердить', callback_data: `approve:${key}` },
        { text: '⛔ Отклонить', callback_data: `decline:${key}` }
      ]
    ]
  };

  const sent = await sendTelegram(text, opts);

  // Лэтчим заявку ТОЛЬКО если кнопки реально ушли: иначе кандидат зависнет
  // в pending без сообщения у пользователя навсегда. Неудача — повтор в следующем цикле.
  if (!sent) {
    return { ok: false, action: 'send-failed' };
  }

  sentLog[key] = { messageLink: msgId, sentAt: new Date().toISOString() };
  saveJSON(SENT_PATH, sentLog);

  approvals[key] = {
    key,
    symbol: candidate.symbol,
    interval: candidate.interval,
    strategy: candidate.strategy || '',
    side: candidate.side || 'auto',
    forwardPnL: candidate.forwardPaperPnl || 0,
    forwardPF: candidate.forwardProfitFactor != null ? candidate.forwardProfitFactor : null,
    forwardTrades: candidate.forwardPaperTrades || 0,
    status: 'pending',
    created: new Date().toISOString(),
    messageLink: msgId
  };

  await setApprovals(approvals);

  return { ok: true, action: 'sent', sent };
}

/** Список кандидатов со статусом approved (для исполнения). */
async function getApprovedCandidates() {
  // Свежесть решает overlay в getApprovals (свежий approve бьёт старую executed-метку),
  // поэтому здесь прямой чек локального файла НЕ нужен — он давил актуальные approve.
  // Фантомы (approve по ключам, которых нет в incubation-state) отсекаем здесь же.
  const approvals = await getApprovals();
  let knownKeys = null;
  let state = null;
  try {
    state = loadJSON(STATE_PATH, null);
    if (state && state.candidates) knownKeys = new Set(Object.keys(state.candidates));
  } catch { knownKeys = null; }
  return Object.values(approvals).filter((a) => {
    if (!a || a.status !== 'approved' || a.executed) return false;
    if (!currentSourceApproval(a, state)) return false;
    if (knownKeys && a.key && !knownKeys.has(a.key)) return false;
    return true;
  });
}

// Кулдаун и порог пыли — из единого реестра порогов.
const { REAL_LOSS_COOLDOWN_MS, REAL_LOSS_EPS_USD, REARM_AFTER_MS } = require('./tradelab_thresholds');

/**
 * Расчёт после закрытия реальной позиции:
 * - pnl > +eps → кандидат остаётся одобренным, ждёт новых сигналов;
 * - |pnl| <= eps → пыль комиссий, статус не меняется (игра продолжается);
 * - pnl < -eps → approve сгорает, кнопка заново только после кулдауна.
 */
async function settleApprovalAfterClose(candidateKey, pnl) {
  const approvals = await getApprovals();
  const rec = approvals[candidateKey];
  if (!rec) return { ok: false, action: 'no-record' };
  const v = Number(pnl) || 0;
  // Сначала фиксируем свежую запись в ЛОКАЛЬНЫЙ файл, потом setApprovals:
  // иначе overlay воскресит старый executed поверх свежей записи.
  const writeLocalFresh = (record) => {
    try {
      const localFile = loadJSON(LOCAL_PATH, {});
      localFile[candidateKey] = record;
      saveJSON(LOCAL_PATH, localFile);
    } catch { /* ignore */ }
  };
  if (v >= -REAL_LOSS_EPS_USD) {
    approvals[candidateKey] = {
      ...rec,
      status: 'approved',
      executed: false,
      decidedAt: new Date().toISOString(),
      rearmedAt: new Date().toISOString(),
      coolUntil: 0
    };
    writeLocalFresh(approvals[candidateKey]);
    await setApprovals(approvals);
    return { ok: true, action: v > REAL_LOSS_EPS_USD ? 'rearmed' : 'dust-keep' };
  }
  approvals[candidateKey] = {
    ...rec,
    status: 'executed',
    executed: true,
    executedAt: new Date().toISOString(),
    coolUntil: Date.now() + REAL_LOSS_COOLDOWN_MS
  };
  writeLocalFresh(approvals[candidateKey]);
  await setApprovals(approvals);
  // Снимаем дедуп, чтобы после кулдауна могла уйти свежая кнопка
  try {
    const sentLog = loadJSON(SENT_PATH, {});
    delete sentLog[candidateKey];
    saveJSON(SENT_PATH, sentLog);
  } catch { /* ignore */ }
  return { ok: true, action: 'consumed-cooldown' };
}

/** Пометить исполненным после успешного входа. */
async function markExecuted(candidateKey) {
  const approvals = await getApprovals();
  if (approvals[candidateKey]) {
    approvals[candidateKey].status = 'executed';
    approvals[candidateKey].executedAt = new Date().toISOString();
    await setApprovals(approvals);
  }
}

/**
 * Самочистка протухших approve: фантомы (ключа нет в state) и rejected
 * удаляются вместе с дедуп-метками — иначе мёртвые записи вечно жрут слоты
 * исполнения и шумят в логе. Карантин/ probation не трогаем (могут вернуться).
 * Возвращает число удалённых.
 */
async function pruneStaleApprovals() {
  const approvals = await getApprovals();
  let state = null;
  try {
    state = loadJSON(STATE_PATH, null);
  } catch { state = null; }
  const known = state && state.candidates ? state.candidates : null;
  const droppedKeys = [];
  for (const k of Object.keys(approvals)) {
    const rec = approvals[k];
    if (!rec || (rec.status !== 'approved' && rec.status !== 'pending')) continue;
    const cand = known ? known[k] : undefined;
    if (known && !cand) {
      delete approvals[k];
      droppedKeys.push(k);
    } else if (cand && cand.status === 'rejected') {
      delete approvals[k];
      droppedKeys.push(k);
    }
  }
  const dropped = droppedKeys.length;
  if (dropped > 0) {
    await setApprovals(approvals);
    try {
      const sentLog = loadJSON(SENT_PATH, {});
      for (const k of droppedKeys) delete sentLog[k];
      saveJSON(SENT_PATH, sentLog);
    } catch { /* ignore */ }
  }
  return dropped;
}

module.exports = { createApprovalRequest, getApprovals, setApprovals, getApprovedCandidates, markExecuted, settleApprovalAfterClose, pruneStaleApprovals, REAL_LOSS_COOLDOWN_MS, REAL_LOSS_EPS_USD, REARM_AFTER_MS };

