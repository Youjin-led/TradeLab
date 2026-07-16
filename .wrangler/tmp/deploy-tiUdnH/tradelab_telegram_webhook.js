(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // tools/tradelab_telegram_webhook.js
  var require_tradelab_telegram_webhook = __commonJS({
    "tools/tradelab_telegram_webhook.js"(exports, module) {
      var BOT_TOKEN = typeof globalThis !== "undefined" && globalThis.TELEGRAM_BOT_TOKEN || typeof globalThis !== "undefined" && globalThis.env && globalThis.env.TELEGRAM_BOT_TOKEN || typeof process !== "undefined" && process.env && process.env.TELEGRAM_BOT_TOKEN || "";
      var CHAT_ID = typeof globalThis !== "undefined" && globalThis.TELEGRAM_CHAT_ID || typeof globalThis !== "undefined" && globalThis.env && globalThis.env.TELEGRAM_CHAT_ID || typeof process !== "undefined" && process.env && process.env.TELEGRAM_CHAT_ID || "";
      var GITHUB_RAW = "https://raw.githubusercontent.com/Youjin-led/TradeLab/main";
      async function fetchJSON(filename) {
        try {
          const resp = await fetch(`${GITHUB_RAW}/${filename}`, {
            headers: { "Accept": "application/json" },
            redirect: "follow"
          });
          if (!resp.ok) return null;
          return await resp.json();
        } catch {
          return null;
        }
      }
      __name(fetchJSON, "fetchJSON");
      async function sendMessage(chatId, text) {
        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text })
        });
        return resp.json();
      }
      __name(sendMessage, "sendMessage");
      async function handleStatus() {
        const state = await fetchJSON("tradelab-incubation-state.json");
        const now = (/* @__PURE__ */ new Date()).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
        if (!state || !state.candidates) {
          return `TradeLab Status
${now}

No data found. Run: npm run tradelab:incubate`;
        }
        const candidates = Object.values(state.candidates);
        const live = candidates.filter((c) => c.status === "incubating");
        const quarantined = candidates.filter((c) => c.status === "quarantined");
        const rejected = candidates.filter((c) => c.status === "rejected");
        const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
        const totalTrades = candidates.reduce((s, c) => s + (c.forwardPaperTrades || 0), 0);
        const lines = [
          `TradeLab Status`,
          now,
          "",
          `Portfolio: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`,
          `Forward trades: ${totalTrades}`,
          `Live: ${live.length} | Quarantined: ${quarantined.length} | Rejected: ${rejected.length}`,
          ""
        ];
        if (live.length > 0) {
          lines.push("Live Candidates:");
          for (const c of live) {
            const pnl = c.forwardPaperPnl || 0;
            const health = c.health && c.health.status || "?";
            lines.push(`  ${c.symbol} ${c.interval} ${c.strategy}`);
            lines.push(`    PnL: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} | Health: ${health} | Trades: ${c.forwardPaperTrades || 0}`);
          }
        } else {
          lines.push("No live candidates.");
        }
        return lines.join("\n");
      }
      __name(handleStatus, "handleStatus");
      async function handleTrades() {
        const state = await fetchJSON("tradelab-incubation-state.json");
        if (!state || !state.candidates) return "No data found.";
        const candidates = Object.values(state.candidates);
        const lines = ["Recent Paper Trades", ""];
        for (const c of candidates) {
          const trades = c.paperLedger && c.paperLedger.trades || [];
          if (trades.length === 0) continue;
          const recent = trades.slice(-3);
          lines.push(`${c.symbol} ${c.interval} ${c.strategy}:`);
          for (const t of recent) {
            const pnl = t.pnl >= 0 ? `+${t.pnl.toFixed(2)}` : t.pnl.toFixed(2);
            lines.push(`  ${t.side} ${t.entryTime || "?"} -> ${t.exitTime || "open"} | PnL: ${pnl}`);
          }
          lines.push("");
        }
        if (lines.length === 2) lines.push("No trades yet.");
        return lines.join("\n");
      }
      __name(handleTrades, "handleTrades");
      async function handlePnl() {
        const state = await fetchJSON("tradelab-incubation-state.json");
        if (!state || !state.candidates) return "No data found.";
        const candidates = Object.values(state.candidates);
        const totalPnl = candidates.reduce((s, c) => s + (c.forwardPaperPnl || 0), 0);
        const lines = [
          "PnL Report",
          "",
          `Total PnL: ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`,
          "",
          "By Candidate:"
        ];
        for (const c of candidates) {
          const pnl = c.forwardPaperPnl || 0;
          lines.push(`  ${c.symbol}: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`);
        }
        return lines.join("\n");
      }
      __name(handlePnl, "handlePnl");
      async function handleScoreboard() {
        const sb = await fetchJSON("tradelab-scoreboard.json");
        if (!sb) return "No scoreboard data.";
        const lines = [
          "Scoreboard",
          "",
          `Portfolio PnL: ${sb.totalPnl || 0}`,
          `Live: ${sb.live || 0}`,
          `Quarantined: ${sb.quarantined || 0}`,
          `Forward trades: ${sb.forwardTrades || 0}`
        ];
        return lines.join("\n");
      }
      __name(handleScoreboard, "handleScoreboard");
      function handleHelp() {
        return [
          "TradeLab Bot Commands",
          "",
          "/status - Portfolio status",
          "/trades - Recent paper trades",
          "/pnl - PnL report",
          "/scoreboard - Scoreboard",
          "/help - This message"
        ].join("\n");
      }
      __name(handleHelp, "handleHelp");
      async function handleWebhook(request) {
        try {
          const update = await request.json();
          if (!update.message) return new Response("ok");
          const msg = update.message;
          const text = (msg.text || "").trim().toLowerCase();
          const chatId = String(msg.chat.id);
          if (chatId !== String(CHAT_ID)) return new Response("ok");
          let response;
          switch (text) {
            case "/status":
              response = await handleStatus();
              break;
            case "/trades":
              response = await handleTrades();
              break;
            case "/pnl":
              response = await handlePnl();
              break;
            case "/scoreboard":
              response = await handleScoreboard();
              break;
            case "/start":
            case "/help":
              response = handleHelp();
              break;
            default:
              return new Response("ok");
          }
          await sendMessage(chatId, response);
          return new Response("ok");
        } catch (err) {
          console.error("Webhook error:", err);
          return new Response("ok");
        }
      }
      __name(handleWebhook, "handleWebhook");
      if (typeof globalThis !== "undefined" && globalThis.addEventListener) {
        globalThis.addEventListener("fetch", (event) => {
          const url = new URL(event.request.url);
          if (url.pathname === "/webhook" && event.request.method === "POST") {
            event.respondWith(handleWebhook(event.request));
          } else {
            event.respondWith(new Response("TradeLab Bot is running. POST to /webhook"));
          }
        });
      }
      if (typeof module !== "undefined") {
        module.exports = { handleWebhook, sendMessage, handleStatus, handleTrades, handlePnl, handleScoreboard, handleHelp };
      }
    }
  });
  require_tradelab_telegram_webhook();
})();
//# sourceMappingURL=tradelab_telegram_webhook.js.map
