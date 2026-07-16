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
      async function sendMessage(chatId, text) {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "Markdown"
          })
        });
        const data = await resp.json();
        if (!data.ok) {
          console.error("Telegram send failed:", data.description);
        }
        return data;
      }
      __name(sendMessage, "sendMessage");
      function handleStatus() {
        const now = (/* @__PURE__ */ new Date()).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
        return [
          "*TradeLab Bot* \u{1F916}",
          `_${now}_`,
          "",
          "Bot is running on Cloudflare Workers.",
          "Data files are on your local machine.",
          "",
          "Commands:",
          "/status \u2014 This message",
          "/help \u2014 Show commands",
          "",
          "_To see live data, run the polling bot locally:_",
          "_node tools/tradelab_telegram_bot.js_"
        ].join("\n");
      }
      __name(handleStatus, "handleStatus");
      function handleHelp() {
        return [
          "*TradeLab Bot Commands*",
          "",
          "/status \u2014 Bot status",
          "/help \u2014 This message",
          "",
          "_This bot runs on Cloudflare Workers (free 24/7)._",
          "_Local data requires running the polling bot on your PC._"
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
          console.log("Received:", text, "from chat:", chatId);
          console.log("BOT_TOKEN set:", !!BOT_TOKEN, "CHAT_ID:", CHAT_ID);
          if (chatId !== String(CHAT_ID)) {
            console.log("Chat ID mismatch:", chatId, "!=", CHAT_ID);
            return new Response("ok");
          }
          let response;
          switch (text) {
            case "/status":
              response = handleStatus();
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
        module.exports = { handleWebhook, sendMessage, handleStatus, handleHelp };
      }
    }
  });
  require_tradelab_telegram_webhook();
})();
//# sourceMappingURL=tradelab_telegram_webhook.js.map
