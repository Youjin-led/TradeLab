# TradeLab Drawdown Diagnostics

Generated: 2026-07-15T19:42:13.502Z
Incubation updated: 2026-07-15T19:41:53.238Z
Portfolio kill-switch: **clear**

This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.

## Summary

Candidates: 44; forward trades: 164; forward PnL: -327.88; avg/trade: -2.00.
Incubating: 4; rejected: 19; active positive ratio: 50.0%.

## Action List

- **medium**: Quarantine or down-rank LINKUSDT candidates until they recover in paper mode. Reason: LINKUSDT forward PnL -848.89 with no useful news dependency yet.
- **medium**: Quarantine or down-rank ETHUSDT candidates until they recover in paper mode. Reason: ETHUSDT forward PnL -778.60; news dependency moderate 1h up, avg 0.662%, agreement 100.0%.
- **medium**: Quarantine or down-rank SEIUSDT candidates until they recover in paper mode. Reason: SEIUSDT forward PnL -702.68 with no useful news dependency yet.
- **medium**: Quarantine or down-rank LTCUSDT candidates until they recover in paper mode. Reason: LTCUSDT forward PnL -542.91 with no useful news dependency yet.
- **medium**: Quarantine or down-rank SUIUSDT candidates until they recover in paper mode. Reason: SUIUSDT forward PnL -402.49 with no useful news dependency yet.
- **medium**: Reduce priority for 1h timeframe discovery. Reason: 1h is the weakest timeframe group: -445.56 across 67 forward trades.
- **medium**: Tighten validation or pause sma-rsi variants. Reason: sma-rsi is the weakest strategy group: -273.06; blocked 20/22.
- **medium**: Review 40 phase-mismatch candidates — strategy does not match current market phase. Reason: NEARUSDT:4h:breakout:breakout on trending-up-strong market; TRXUSDT:4h:sma-rsi:sma-rsi on ranging-tight market; LINKUSDT:4h:sma-rsi:sma-rsi on ranging-tight market; LINKUSDT:4h:breakout:breakout on ranging-tight market; SUIUSDT:4h:breakout:breakout on trending-down-strong market
- **medium**: Review stop/take parameters for repeated stop-loss candidates before adding more similar setups. Reason: 7 of the worst candidates already carry drawdown, loss-streak, or profit-factor alerts.

## Worst Candidates

Candidate | Status | Forward Trades | Forward PnL | PF | Max DD | Loss Streak | Health
--- | --- | ---: | ---: | ---: | ---: | ---: | ---
ETHUSDT:4h:breakout | quarantined | 4 | -558.91 | 0.00 | 0.00% | 0 | Blocked
LINKUSDT:4h:sma-rsi | quarantined | 4 | -408.40 | 1.77 | 4.27% | 4 | Caution
SUIUSDT:4h:breakout | incubating | 2 | -402.49 | 2.07 | 6.77% | 6 | Caution
LTCUSDT:1h:sma-rsi | rejected | 12 | -340.45 | 1.78 | 4.89% | 3 | Caution
LTCUSDT:1d:sma-rsi | quarantined | 2 | -333.37 | 0.95 | 9.49% | 4 | Blocked
SEIUSDT:4h:sma-rsi | quarantined | 4 | -294.32 | 0.68 | 8.72% | 3 | Blocked
SEIUSDT:1h:breakout | quarantined | 2 | -276.46 | 0.70 | 9.31% | 6 | Blocked
DOTUSDT:1h:breakout | quarantined | 2 | -264.22 | 0.49 | 10.07% | 3 | Blocked
LINKUSDT:4h:breakout | quarantined | 4 | -236.86 | 0.00 | 0.00% | 0 | Blocked
TRXUSDT:4h:sma-rsi | quarantined | 5 | -223.51 | 1.81 | 4.37% | 4 | Caution

## Attribution By Symbol

Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
LINKUSDT | 3 | 10 | -848.89 | -84.89 | 20.0% | 4.09% | 0
ETHUSDT | 2 | 13 | -778.60 | -59.89 | 30.8% | 6.17% | 0
SEIUSDT | 4 | 7 | -702.68 | -100.38 | 14.3% | 9.49% | 1
LTCUSDT | 3 | 15 | -542.91 | -36.19 | 46.7% | 3.64% | 1
SUIUSDT | 1 | 2 | -402.49 | -201.25 | 0.0% | 5.70% | 0
TRXUSDT | 1 | 5 | -223.51 | -44.70 | 20.0% | 3.10% | 0
ARBUSDT | 1 | 1 | -164.72 | -164.72 | 0.0% | 3.38% | 0
ATOMUSDT | 1 | 3 | -129.31 | -43.10 | 33.3% | 2.12% | 1
TIAUSDT | 1 | 3 | -50.26 | -16.75 | 33.3% | 1.45% | 0
DOTUSDT | 3 | 7 | -23.52 | -3.36 | 42.9% | 2.64% | 1
FILUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 5.24% | 0
ADAUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 0.82% | 1

## Attribution By Timeframe

Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
1h | 14 | 67 | -445.56 | -6.65 | 44.8% | 9.52% | 9
1d | 2 | 4 | -373.92 | -93.48 | 0.0% | 3.33% | 0
4h | 28 | 910100100000 | +491.60 | +0.00 | 0.0% | 9.46% | 10

## Attribution By Strategy

Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
sma-rsi | 22 | 70010304000 | -273.06 | +0.00 | 0.0% | 9.52% | 20
breakout | 22 | 86 | -54.82 | -0.64 | 39.5% | 9.46% | 20

## Exit Reasons

Reason | Trades | PnL | Avg/Trade | Winrate
--- | ---: | ---: | ---: | ---:
stop | 65 | -8592.32 | -132.19 | 13.8%
signal | 69 | +470.14 | +6.81 | 46.4%
take | 30 | +7794.29 | +259.81 | 100.0%

## News Context For Weak Symbols

Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence
--- | --- | --- | --- | ---: | ---: | ---:
ETHUSDT | moderate | 1h | up | 0.662% | 100.0% | 59

## Operator Rule

Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.
