# TradeLab Quarantine

Generated: 2026-06-13T11:32:38.344Z
Diagnostics generated: 2026-06-13T11:32:38.342Z

This is a paper-only safety layer. Quarantine blocks weak candidates from further paper updates and prevents similar new candidates from auto-discovery.

## Blocked Symbols

- INJUSDT: weak symbol: PnL -2088.7, trades 25, winrate 20%, max DD 18.02%
- NEARUSDT: weak symbol: PnL -1696.33, trades 16, winrate 19%, max DD 20.13%
- AVAXUSDT: weak symbol: PnL -1549.14, trades 10, winrate 10%, max DD 16.32%
- APTUSDT: weak symbol: PnL -1402.63, trades 15, winrate 27%, max DD 17.13%
- BTCUSDT: weak symbol: PnL -1321.16, trades 13, winrate 23%, max DD 14.68%
- ETHUSDT: weak symbol: PnL -1107.6, trades 14, winrate 36%, max DD 12.59%
- JUPUSDT: weak symbol: PnL -1010.6, trades 7, winrate 14%, max DD 5.53%

## Blocked Strategies

- mean-reversion: weak strategy: PnL -9274.38, trades 98, winrate 24%, max DD 20.13%, blocked 8/8

## Blocked Candidates

- NEARUSDT:1h:mean-reversion: weak candidate: forward PnL -1800.17, PF 0.9, max DD 10.61%, health Blocked
- AVAXUSDT:4h:mean-reversion: weak candidate: forward PnL -1549.14, PF 1.12, max DD 9.81%, health Blocked
- APTUSDT:1h:mean-reversion: weak candidate: forward PnL -1402.63, PF 0.85, max DD 10.9%, health Blocked
- BTCUSDT:1h:mean-reversion: weak candidate: forward PnL -1321.16, PF 0.4, max DD 9.93%, health Blocked
- ETHUSDT:1h:mean-reversion: weak candidate: forward PnL -1107.6, PF 0.57, max DD 10.33%, health Blocked
- INJUSDT:1h:mean-reversion: weak candidate: forward PnL -1098.48, PF 1.49, max DD 10.34%, health Blocked
- INJUSDT:4h:sma-rsi: weak candidate: forward PnL -990.22, PF 1.94, max DD 5.74%, health Healthy
- JUPUSDT:4h:sma-rsi: weak candidate: forward PnL -542.98, PF 1.45, max DD 6.67%, health Healthy
- LINKUSDT:4h:mean-reversion: weak candidate: forward PnL -506.04, PF 0.91, max DD 9.37%, health Blocked

## Downranked Timeframes

- 1h: weak timeframe: PnL -6991.73, trades 85, winrate 27%, max DD 20.13%

## Operator Rule

A quarantined symbol, strategy, or candidate can return only after a later paper diagnostic no longer triggers these rules and the real-money gate remains blocked until manual review.
