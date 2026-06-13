# TradeLab Drawdown Diagnostics

Generated: 2026-06-13T11:32:38.342Z
Incubation updated: 2026-06-13T11:32:32.570Z
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.

## Summary

Candidates: 21; forward trades: 132; forward PnL: -11580.78; avg/trade: -87.73.
Incubating: 2; rejected: 4; active positive ratio: 50.0%.

## Action List

- **critical**: Freeze auto-adds and real-money preparation until kill-switch clears. Reason: portfolio forward PnL -11580.78 <= -750
- **high**: Quarantine or down-rank INJUSDT candidates until they recover in paper mode. Reason: INJUSDT forward PnL -2088.70 with no useful news dependency yet.
- **high**: Quarantine or down-rank NEARUSDT candidates until they recover in paper mode. Reason: NEARUSDT forward PnL -1696.33; news dependency strong 24h down, avg -3.39%, agreement 100.0%.
- **high**: Quarantine or down-rank AVAXUSDT candidates until they recover in paper mode. Reason: AVAXUSDT forward PnL -1549.14 with no useful news dependency yet.
- **high**: Quarantine or down-rank APTUSDT candidates until they recover in paper mode. Reason: APTUSDT forward PnL -1402.63 with no useful news dependency yet.
- **high**: Quarantine or down-rank BTCUSDT candidates until they recover in paper mode. Reason: BTCUSDT forward PnL -1321.16 with no useful news dependency yet.
- **medium**: Reduce priority for 1h timeframe discovery. Reason: 1h is the weakest timeframe group: -6991.73 across 85 forward trades.
- **medium**: Tighten validation or pause mean-reversion variants. Reason: mean-reversion is the weakest strategy group: -9274.38; blocked 8/8.
- **medium**: Review stop/take parameters for repeated stop-loss candidates before adding more similar setups. Reason: 8 of the worst candidates already carry drawdown, loss-streak, or profit-factor alerts.

## Worst Candidates

Candidate | Status | Forward Trades | Forward PnL | PF | Max DD | Loss Streak | Health
--- | --- | ---: | ---: | ---: | ---: | ---: | ---
NEARUSDT:1h:mean-reversion | quarantined | 15 | -1800.17 | 0.90 | 10.61% | 6 | Blocked
AVAXUSDT:4h:mean-reversion | quarantined | 10 | -1549.14 | 1.12 | 9.81% | 3 | Blocked
APTUSDT:1h:mean-reversion | quarantined | 15 | -1402.63 | 0.85 | 10.90% | 4 | Blocked
BTCUSDT:1h:mean-reversion | quarantined | 13 | -1321.16 | 0.40 | 9.93% | 4 | Blocked
ETHUSDT:1h:mean-reversion | quarantined | 14 | -1107.60 | 0.57 | 10.33% | 4 | Blocked
INJUSDT:1h:mean-reversion | quarantined | 19 | -1098.48 | 1.49 | 10.34% | 6 | Blocked
INJUSDT:4h:sma-rsi | quarantined | 6 | -990.22 | 1.94 | 5.74% | 3 | Healthy
JUPUSDT:4h:sma-rsi | quarantined | 5 | -542.98 | 1.45 | 6.67% | 2 | Healthy
LINKUSDT:4h:mean-reversion | quarantined | 5 | -506.04 | 0.91 | 9.37% | 5 | Blocked
RENDERUSDT:4h:mean-reversion | quarantined | 7 | -489.16 | 1.45 | 8.87% | 4 | Caution

## Attribution By Symbol

Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
INJUSDT | 2 | 25 | -2088.70 | -83.55 | 20.0% | 18.02% | 0
NEARUSDT | 3 | 16 | -1696.33 | -106.02 | 18.8% | 20.13% | 0
AVAXUSDT | 1 | 10 | -1549.14 | -154.91 | 10.0% | 16.32% | 0
APTUSDT | 1 | 15 | -1402.63 | -93.51 | 26.7% | 17.13% | 0
BTCUSDT | 1 | 13 | -1321.16 | -101.63 | 23.1% | 14.68% | 0
ETHUSDT | 1 | 14 | -1107.60 | -79.11 | 35.7% | 12.59% | 0
JUPUSDT | 2 | 7 | -1010.60 | -144.37 | 14.3% | 5.53% | 0
LINKUSDT | 1 | 5 | -506.04 | -101.21 | 20.0% | 8.15% | 0
RENDERUSDT | 1 | 7 | -489.16 | -69.88 | 28.6% | 8.26% | 0
BNBUSDT | 1 | 5 | -246.58 | -49.32 | 20.0% | 3.15% | 1
TRXUSDT | 1 | 2 | -246.32 | -123.16 | 0.0% | 2.59% | 1
OPUSDT | 1 | 5 | -216.56 | -43.31 | 40.0% | 5.02% | 0

## Attribution By Timeframe

Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
1h | 8 | 85 | -6991.73 | -82.26 | 27.1% | 20.13% | 0
4h | 11 | 45 | -4342.73 | -96.51 | 22.2% | 16.32% | 3
1d | 2 | 2 | -246.32 | -123.16 | 0.0% | 7.81% | 1

## Attribution By Strategy

Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
mean-reversion | 8 | 98 | -9274.38 | -94.64 | 23.5% | 20.13% | 8
sma-rsi | 10 | 30 | -2239.57 | -74.65 | 26.7% | 9.90% | 8
breakout | 3 | 4 | -66.83 | -16.71 | 50.0% | 4.68% | 3

## Exit Reasons

Reason | Trades | PnL | Avg/Trade | Winrate
--- | ---: | ---: | ---: | ---:
stop | 89 | -16161.17 | -181.59 | 0.0%
signal | 28 | +629.13 | +22.47 | 64.3%
take | 15 | +3951.26 | +263.42 | 100.0%

## News Context For Weak Symbols

Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence
--- | --- | --- | --- | ---: | ---: | ---:
NEARUSDT | strong | 24h | down | -3.39% | 100.0% | 80
ETHUSDT | moderate | 1h | up | 0.662% | 100.0% | 59

## Operator Rule

Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.
