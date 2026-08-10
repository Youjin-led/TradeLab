# TradeLab Drawdown Diagnostics

Generated: 2026-08-10T14:03:20.754Z
Incubation updated: 2026-08-10T14:02:25.079Z
Portfolio kill-switch: **clear**

This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.

## Summary

Candidates: 44; forward trades: 242; forward PnL: +1421.41; avg/trade: +5.87.
Incubating: 3; rejected: 20; active positive ratio: 66.7%.

## Action List

- **medium**: Quarantine or down-rank LINKUSDT candidates until they recover in paper mode. Reason: LINKUSDT forward PnL -848.89 with no useful news dependency yet.
- **medium**: Quarantine or down-rank ETHUSDT candidates until they recover in paper mode. Reason: ETHUSDT forward PnL -778.60; news dependency moderate 1h up, avg 0.662%, agreement 100.0%.
- **medium**: Quarantine or down-rank LTCUSDT candidates until they recover in paper mode. Reason: LTCUSDT forward PnL -673.82 with no useful news dependency yet.
- **medium**: Quarantine or down-rank SUIUSDT candidates until they recover in paper mode. Reason: SUIUSDT forward PnL -402.49 with no useful news dependency yet.
- **medium**: Quarantine or down-rank TIAUSDT candidates until they recover in paper mode. Reason: TIAUSDT forward PnL -301.76 with no useful news dependency yet.
- **medium**: Reduce priority for 1d timeframe discovery. Reason: 1d is the weakest timeframe group: -327.05 across 6 forward trades.
- **medium**: Review 37 phase-mismatch candidates — strategy does not match current market phase. Reason: NEARUSDT:4h:breakout:breakout on trending-up-strong market; LINKUSDT:4h:sma-rsi:sma-rsi on ranging-tight market; LINKUSDT:4h:breakout:breakout on ranging-tight market; SUIUSDT:4h:breakout:breakout on trending-down-strong market; INJUSDT:4h:sma-rsi:sma-rsi on trending-down market
- **medium**: Review stop/take parameters for repeated stop-loss candidates before adding more similar setups. Reason: 7 of the worst candidates already carry drawdown, loss-streak, or profit-factor alerts.

## Worst Candidates

Candidate | Status | Forward Trades | Forward PnL | PF | Max DD | Loss Streak | Health
--- | --- | ---: | ---: | ---: | ---: | ---: | ---
ETHUSDT:4h:breakout | quarantined | 4 | -558.91 | 0.00 | 0.00% | 0 | Blocked
LINKUSDT:4h:sma-rsi | quarantined | 4 | -408.40 | 1.77 | 4.27% | 4 | Caution
SUIUSDT:4h:breakout | incubating | 2 | -402.49 | 2.07 | 6.77% | 6 | Caution
LTCUSDT:1h:sma-rsi | rejected | 12 | -340.45 | 1.78 | 4.89% | 3 | Caution
LTCUSDT:1d:sma-rsi | quarantined | 2 | -333.37 | 0.95 | 9.49% | 4 | Blocked
TIAUSDT:4h:sma-rsi | quarantined | 6 | -301.76 | 1.16 | 5.39% | 5 | Blocked
SEIUSDT:4h:sma-rsi | quarantined | 4 | -294.32 | 0.68 | 8.72% | 3 | Blocked
FILUSDT:4h:sma-rsi | quarantined | 4 | -259.99 | 0.64 | 4.87% | 4 | Blocked
LINKUSDT:4h:breakout | quarantined | 4 | -236.86 | 0.00 | 0.00% | 0 | Blocked
ETHUSDT:4h:sma-rsi | quarantined | 9 | -219.69 | 2.29 | 4.04% | 6 | Caution

## Attribution By Symbol

Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
LINKUSDT | 3 | 10 | -848.89 | -84.89 | 20.0% | 4.09% | 0
ETHUSDT | 2 | 13 | -778.60 | -59.89 | 30.8% | 6.17% | 0
LTCUSDT | 3 | 14 | -673.82 | -48.13 | 42.9% | 3.64% | 2
SUIUSDT | 1 | 2 | -402.49 | -201.25 | 0.0% | 5.70% | 0
TIAUSDT | 1 | 6 | -301.76 | -50.29 | 16.7% | 3.56% | 0
FILUSDT | 1 | 4 | -259.99 | -65.00 | 0.0% | 2.60% | 0
SEIUSDT | 4 | 33 | -40.30 | -1.22 | 57.6% | 4.81% | 2
TRXUSDT | 1 | 1 | -3.59 | -3.59 | 0.0% | 0.04% | 0
SOLUSDT | 2 | 1 | -2.97 | -2.97 | 0.0% | 8.31% | 1
RENDERUSDT | 2 | 0 | +0.00 | +0.00 | 0.0% | 5.03% | 1
BTCUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 7.22% | 1
OPUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 4.48% | 1

## Attribution By Timeframe

Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
1d | 2 | 6 | -327.05 | -54.51 | 16.7% | 3.33% | 0
4h | 28 | 111412160200112100000 | +801.23 | +0.00 | 0.0% | 8.31% | 10
1h | 14 | 86 | +947.23 | +11.01 | 53.5% | 5.89% | 10

## Attribution By Strategy

Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
breakout | 22 | 90 | +232.18 | +2.58 | 44.4% | 8.31% | 20
sma-rsi | 22 | 88412271620210000 | +1189.23 | +0.00 | 0.0% | 7.16% | 21

## Exit Reasons

Reason | Trades | PnL | Avg/Trade | Winrate
--- | ---: | ---: | ---: | ---:
stop | 113 | -8673.25 | -76.75 | 37.2%
signal | 91 | +266.26 | +2.93 | 47.3%
take | 38 | +9828.39 | +258.64 | 100.0%

## News Context For Weak Symbols

Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence
--- | --- | --- | --- | ---: | ---: | ---:
ETHUSDT | moderate | 1h | up | 0.662% | 100.0% | 59

## Operator Rule

Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.
