# TradeLab Quarantine

Generated: 2026-07-22T20:42:09.604Z
Diagnostics generated: 2026-07-22T20:42:09.600Z

This is a paper-only safety layer. Quarantine blocks weak candidates from further paper updates and prevents similar new candidates from auto-discovery.

## Blocked Symbols

- LTCUSDT: weak symbol: PnL -1061.56, trades 20, winrate 45%, max DD 6.72%
- LINKUSDT: weak symbol: PnL -848.89, trades 10, winrate 20%, max DD 4.09%
- DOGEUSDT: weak symbol: PnL -809.27, trades 9, winrate 22%, max DD 7.6%
- ETHUSDT: weak symbol: PnL -778.6, trades 13, winrate 31%, max DD 6.17%

## Blocked Strategies

- sma-rsi: weak strategy: PnL -2038.17, trades 472443100421120, winrate 0%, max DD 7.6%, blocked 22/22

## Blocked Candidates

- ETHUSDT:4h:breakout: weak candidate: forward PnL -558.91, PF 0, max DD 0%, health Blocked
- DOGEUSDT:4h:sma-rsi: weak candidate: forward PnL -532.1, PF 0.92, max DD 9.12%, health Blocked
- LINKUSDT:4h:sma-rsi: weak candidate: forward PnL -408.4, PF 1.77, max DD 4.27%, health Caution
- SUIUSDT:4h:breakout: weak candidate: forward PnL -402.49, PF 2.07, max DD 6.77%, health Caution
- SOLUSDT:1h:breakout: weak candidate: forward PnL -392.07, PF 0, max DD 0%, health Blocked
- LTCUSDT:4h:breakout: weak candidate: forward PnL -387.74, PF 1.74, max DD 3.93%, health Healthy
- LTCUSDT:1h:sma-rsi: weak candidate: forward PnL -340.45, PF 1.78, max DD 4.89%, health Caution
- LTCUSDT:1d:sma-rsi: weak candidate: forward PnL -333.37, PF 0.95, max DD 9.49%, health Blocked
- SEIUSDT:4h:sma-rsi: weak candidate: forward PnL -294.32, PF 0.68, max DD 8.72%, health Blocked
- RENDERUSDT:4h:sma-rsi: weak candidate: forward PnL -290.69, PF 0.48, max DD 9.54%, health Blocked

## Downranked Timeframes

- none

## Operator Rule

A quarantined symbol, strategy, or candidate can return only after a later paper diagnostic no longer triggers these rules and the real-money gate remains blocked until manual review.
