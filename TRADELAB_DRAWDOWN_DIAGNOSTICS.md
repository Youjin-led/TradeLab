# TradeLab Drawdown Diagnostics

Generated: 2026-07-16T13:36:42.507Z
Incubation updated: 2026-07-16T13:36:24.921Z
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.

## Summary

Candidates: 44; forward trades: 154; forward PnL: -682.47; avg/trade: -4.43.
Incubating: 4; rejected: 21; active positive ratio: 50.0%.

## Action List

- **critical**: Freeze auto-adds and real-money preparation until kill-switch clears. Reason: portfolio forward PnL -682.47 <= -500
- **medium**: Quarantine or down-rank LINKUSDT candidates until they recover in paper mode. Reason: LINKUSDT forward PnL -848.89 with no useful news dependency yet.
- **medium**: Quarantine or down-rank ETHUSDT candidates until they recover in paper mode. Reason: ETHUSDT forward PnL -778.60; news dependency moderate 1h up, avg 0.662%, agreement 100.0%.
- **medium**: Quarantine or down-rank SEIUSDT candidates until they recover in paper mode. Reason: SEIUSDT forward PnL -702.68 with no useful news dependency yet.
- **medium**: Quarantine or down-rank LTCUSDT candidates until they recover in paper mode. Reason: LTCUSDT forward PnL -542.91 with no useful news dependency yet.
- **medium**: Quarantine or down-rank SUIUSDT candidates until they recover in paper mode. Reason: SUIUSDT forward PnL -402.49 with no useful news dependency yet.
- **medium**: Reduce priority for 1h timeframe discovery. Reason: 1h is the weakest timeframe group: -758.26 across 52 forward trades.
- **medium**: Tighten validation or pause breakout variants. Reason: breakout is the weakest strategy group: -703.03; blocked 20/22.
- **medium**: Review 41 phase-mismatch candidates — strategy does not match current market phase. Reason: NEARUSDT:4h:breakout:breakout on trending-up-strong market; LINKUSDT:4h:sma-rsi:sma-rsi on ranging-tight market; LINKUSDT:4h:breakout:breakout on ranging-tight market; SUIUSDT:4h:breakout:breakout on trending-down-strong market; INJUSDT:4h:sma-rsi:sma-rsi on trending-up-strong market
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
ATOMUSDT:1h:sma-rsi | quarantined | 4 | -224.46 | 0.66 | 9.19% | 5 | Blocked

## Attribution By Symbol

Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
LINKUSDT | 3 | 10 | -848.89 | -84.89 | 20.0% | 4.09% | 0
ETHUSDT | 2 | 13 | -778.60 | -59.89 | 30.8% | 6.17% | 0
SEIUSDT | 4 | 7 | -702.68 | -100.38 | 14.3% | 8.07% | 1
LTCUSDT | 3 | 15 | -542.91 | -36.19 | 46.7% | 3.64% | 1
SUIUSDT | 1 | 2 | -402.49 | -201.25 | 0.0% | 5.70% | 0
ATOMUSDT | 1 | 4 | -224.46 | -56.12 | 25.0% | 2.38% | 0
TIAUSDT | 1 | 4 | -183.50 | -45.88 | 25.0% | 2.39% | 0
ARBUSDT | 1 | 2 | -120.78 | -60.39 | 50.0% | 3.38% | 0
DOTUSDT | 3 | 9 | -98.83 | -10.98 | 44.4% | 2.64% | 1
AVAXUSDT | 2 | 8 | -87.83 | -10.98 | 25.0% | 3.15% | 1
RENDERUSDT | 2 | 0 | +0.00 | +0.00 | 0.0% | 9.64% | 1
BTCUSDT | 1 | 0 | +0.00 | +0.00 | 0.0% | 9.24% | 1

## Attribution By Timeframe

Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
1h | 14 | 52 | -758.26 | -14.58 | 38.5% | 9.70% | 9
1d | 2 | 4 | -373.92 | -93.48 | 0.0% | 3.33% | 0
4h | 28 | 9111102110000 | +449.71 | +0.00 | 0.0% | 9.24% | 12

## Attribution By Strategy

Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
breakout | 22 | 82 | -703.03 | -8.57 | 39.0% | 9.64% | 20
sma-rsi | 22 | 5911140600000 | +20.56 | +0.00 | 0.0% | 9.70% | 20

## Exit Reasons

Reason | Trades | PnL | Avg/Trade | Winrate
--- | ---: | ---: | ---: | ---:
stop | 72 | -8682.21 | -120.59 | 18.1%
signal | 53 | +489.07 | +9.23 | 45.3%
take | 29 | +7510.64 | +258.99 | 100.0%

## News Context For Weak Symbols

Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence
--- | --- | --- | --- | ---: | ---: | ---:
ETHUSDT | moderate | 1h | up | 0.662% | 100.0% | 59

## Operator Rule

Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.
