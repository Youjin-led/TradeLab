# TradeLab Drawdown Diagnostics

Generated: 2026-08-14T18:42:15.002Z
Incubation updated: 2026-08-14T16:58:28.804Z
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.

## Summary

Candidates: 44; forward trades: 248; forward PnL: +1180.24; avg/trade: +4.76.
Incubating: 5; rejected: 38; active positive ratio: 80.0%.

## Action List

- **critical**: Freeze auto-adds and real-money preparation until kill-switch clears. Reason: rejected ratio 86.4% >= 50%
- **medium**: Quarantine or down-rank LINKUSDT candidates until they recover in paper mode. Reason: LINKUSDT forward PnL -848.89 with no useful news dependency yet.
- **medium**: Quarantine or down-rank LTCUSDT candidates until they recover in paper mode. Reason: LTCUSDT forward PnL -806.85 with no useful news dependency yet.
- **medium**: Quarantine or down-rank ETHUSDT candidates until they recover in paper mode. Reason: ETHUSDT forward PnL -778.60; news dependency moderate 1h up, avg 0.662%, agreement 100.0%.
- **medium**: Quarantine or down-rank SUIUSDT candidates until they recover in paper mode. Reason: SUIUSDT forward PnL -402.49 with no useful news dependency yet.
- **medium**: Quarantine or down-rank TIAUSDT candidates until they recover in paper mode. Reason: TIAUSDT forward PnL -301.76 with no useful news dependency yet.
- **medium**: Reduce priority for 1d timeframe discovery. Reason: 1d is the weakest timeframe group: -327.05 across 6 forward trades.
- **medium**: Review 41 phase-mismatch candidates — strategy does not match current market phase. Reason: NEARUSDT:4h:breakout:breakout on trending-strong market; LINKUSDT:4h:sma-rsi:sma-rsi on ranging-tight market; LINKUSDT:4h:breakout:breakout on ranging-tight market; SUIUSDT:4h:breakout:breakout on trending-down-strong market; INJUSDT:4h:sma-rsi:sma-rsi on trending-down-strong market
- **medium**: Review stop/take parameters for repeated stop-loss candidates before adding more similar setups. Reason: 8 of the worst candidates already carry drawdown, loss-streak, or profit-factor alerts.

## Worst Candidates

Candidate | Status | Forward Trades | Forward PnL | PF | Max DD | Loss Streak | Health
--- | --- | ---: | ---: | ---: | ---: | ---: | ---
ETHUSDT:4h:breakout | rejected | 4 | -558.91 | 0.93 | 5.53% | 3 | Blocked
LTCUSDT:1h:sma-rsi | rejected | 13 | -473.48 | 1.00 | 2.21% | 4 | Blocked
LINKUSDT:4h:sma-rsi | rejected | 4 | -408.40 | 1.63 | 3.32% | 5 | Caution
SEIUSDT:4h:sma-rsi | rejected | 5 | -405.42 | 0.35 | 1.71% | 3 | Blocked
SUIUSDT:4h:breakout | rejected | 2 | -402.49 | 0.82 | 4.73% | 4 | Blocked
LTCUSDT:1d:sma-rsi | rejected | 2 | -333.37 | 0.67 | 9.38% | 6 | Blocked
TIAUSDT:4h:sma-rsi | rejected | 6 | -301.76 | 0.29 | 2.39% | 4 | Blocked
FILUSDT:4h:sma-rsi | rejected | 4 | -259.99 | 1.26 | 1.13% | 2 | Blocked
LINKUSDT:4h:breakout | rejected | 4 | -236.86 | 0.00 | 0.00% | 0 | Blocked
ETHUSDT:4h:sma-rsi | rejected | 9 | -219.69 | 1.46 | 2.18% | 5 | Caution

## Attribution By Symbol

Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
LINKUSDT | 3 | 10 | -848.89 | -84.89 | 20.0% | 4.09% | 3
LTCUSDT | 3 | 15 | -806.85 | -53.79 | 40.0% | 4.83% | 3
ETHUSDT | 2 | 13 | -778.60 | -59.89 | 30.8% | 6.17% | 2
SUIUSDT | 1 | 2 | -402.49 | -201.25 | 0.0% | 5.70% | 1
TIAUSDT | 1 | 6 | -301.76 | -50.29 | 16.7% | 3.56% | 1
FILUSDT | 1 | 4 | -259.99 | -65.00 | 0.0% | 2.60% | 1
SEIUSDT | 4 | 36 | -165.96 | -4.61 | 55.6% | 5.90% | 3
TRXUSDT | 1 | 1 | -3.59 | -3.59 | 0.0% | 0.04% | 1
RENDERUSDT | 2 | 0 | +0.00 | +0.00 | 0.0% | 4.57% | 2
BTCUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 8.24% | 1
OPUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 2.81% | 1
BNBUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 4.83% | 1

## Attribution By Timeframe

Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
1d | 2 | 6 | -327.05 | -54.51 | 16.7% | 3.33% | 1
4h | 28 | 152 | +696.16 | +4.58 | 50.7% | 8.24% | 25
1h | 14 | 90 | +811.13 | +9.01 | 53.3% | 5.89% | 12

## Attribution By Strategy

Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
breakout | 22 | 92 | +249.70 | +2.71 | 45.7% | 8.24% | 21
sma-rsi | 22 | 156 | +930.54 | +5.96 | 53.8% | 6.74% | 18

## Exit Reasons

Reason | Trades | PnL | Avg/Trade | Winrate
--- | ---: | ---: | ---: | ---:
stop | 117 | -8842.88 | -75.58 | 37.6%
signal | 93 | +194.73 | +2.09 | 47.3%
take | 38 | +9828.39 | +258.64 | 100.0%

## News Context For Weak Symbols

Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence
--- | --- | --- | --- | ---: | ---: | ---:
ETHUSDT | moderate | 1h | up | 0.662% | 100.0% | 59

## Operator Rule

Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.
