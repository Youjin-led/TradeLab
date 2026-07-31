# TradeLab Session (2026-07-28)

## Summary
AI Paper Trader improvements complete. DeepSeek now actively trades with 3 major enhancements.

## Changes (commits)
- `0d7a988` — Lower AI thresholds (prompt: 70>50, paper trader: 60>50, close: 50>40)
- `3edefc7` — News integration (CoinGecko market data instead of RSS)
- `3eb487f` — Multi-TF, ATR SL/TP, correlation groups

## Current State
- **AI Paper Trader** fully operational
- News: 3-4 items/cycle (BTC/ETH/SOL 24h change + market cap)
- Multi-TF: scan 1h+4h per symbol, combine decisions
  - Both agree > full position (30%), +10% confidence bonus
  - Single TF > reduced size (21%), confidence ? 0.9
  - Conflicting > HOLD
- ATR SL/TP: SL=ATR?1.5 (min 1.5%), TP=ATR?3 (min 3%)
- Correlation groups: benchmarks max 1, alts max 2
- DeepSeek model: deepseek-chat (deepseek-chat), temp 0.3
- Rate limit: 50 requests/hour

## Files Modified
- `tools/tradelab_ai_context_builder.js` — prompt rules relaxed, fetchNews() added, newsParam support
- `tools/tradelab_ai_decider.js` — passes options.news to buildContext
- `tools/tradelab_ai_paper_trader.js` — major rewrite (multi-TF, ATR, correlation groups)

## Environment
- Node 24.12.0, win32
- OKX balance: $36.59 (0.0187 ETH), no positions
- DeepSeek key in .env + GitHub Secrets
- GitHub: github.com/Youjin-led/TradeLab

## To Continue
- Run `npm run tradelab:ai:paper` for single cycle
- Run `npm run tradelab:ai:paper:loop` for continuous
- Monitor `tradelab-ai-paper-trades.json`
