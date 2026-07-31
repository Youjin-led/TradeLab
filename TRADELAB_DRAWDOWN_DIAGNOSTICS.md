# TradeLab Drawdown Diagnostics

Generated: 2026-07-22T20:42:09.600Z
Incubation updated: 2026-07-22T20:41:57.846Z
Portfolio kill-switch: **clear**

This report is paper-only. It explains losses; it does not approve exchange connectivity or real-money trading.

## Summary

Candidates: 44; forward trades: 793; forward PnL: +23925.98; avg/trade: +30.17.
Incubating: 3; rejected: 11; active positive ratio: 33.3%.

## Action List

- **high**: Quarantine or down-rank LTCUSDT candidates until they recover in paper mode. Reason: LTCUSDT forward PnL -1061.56 with no useful news dependency yet.
- **medium**: Quarantine or down-rank LINKUSDT candidates until they recover in paper mode. Reason: LINKUSDT forward PnL -848.89 with no useful news dependency yet.
- **medium**: Quarantine or down-rank DOGEUSDT candidates until they recover in paper mode. Reason: DOGEUSDT forward PnL -809.27 with no useful news dependency yet.
- **medium**: Quarantine or down-rank ETHUSDT candidates until they recover in paper mode. Reason: ETHUSDT forward PnL -778.60; news dependency moderate 1h up, avg 0.662%, agreement 100.0%.
- **medium**: Quarantine or down-rank SOLUSDT candidates until they recover in paper mode. Reason: SOLUSDT forward PnL -441.51 with no useful news dependency yet.
- **medium**: Reduce priority for 1d timeframe discovery. Reason: 1d is the weakest timeframe group: -572.28 across 5 forward trades.
- **medium**: Tighten validation or pause sma-rsi variants. Reason: sma-rsi is the weakest strategy group: -2038.17; blocked 22/22.
- **medium**: Review 40 phase-mismatch candidates — strategy does not match current market phase. Reason: NEARUSDT:4h:breakout:breakout on trending-down-strong market; LINKUSDT:4h:sma-rsi:sma-rsi on ranging-tight market; LINKUSDT:4h:breakout:breakout on ranging-tight market; SUIUSDT:4h:breakout:breakout on trending-down-strong market; LINKUSDT:1h:breakout:breakout on trending-down-strong market
- **medium**: Review stop/take parameters for repeated stop-loss candidates before adding more similar setups. Reason: 6 of the worst candidates already carry drawdown, loss-streak, or profit-factor alerts.

## Worst Candidates

Candidate | Status | Forward Trades | Forward PnL | PF | Max DD | Loss Streak | Health
--- | --- | ---: | ---: | ---: | ---: | ---: | ---
ETHUSDT:4h:breakout | quarantined | 4 | -558.91 | 0.00 | 0.00% | 0 | Blocked
DOGEUSDT:4h:sma-rsi | quarantined | 4 | -532.10 | 0.92 | 9.12% | 5 | Blocked
LINKUSDT:4h:sma-rsi | quarantined | 4 | -408.40 | 1.77 | 4.27% | 4 | Caution
SUIUSDT:4h:breakout | incubating | 2 | -402.49 | 2.07 | 6.77% | 6 | Caution
SOLUSDT:1h:breakout | quarantined | 4 | -392.07 | 0.00 | 0.00% | 0 | Blocked
LTCUSDT:4h:breakout | incubating | 6 | -387.74 | 1.74 | 3.93% | 2 | Healthy
LTCUSDT:1h:sma-rsi | rejected | 12 | -340.45 | 1.78 | 4.89% | 3 | Caution
LTCUSDT:1d:sma-rsi | quarantined | 2 | -333.37 | 0.95 | 9.49% | 4 | Blocked
SEIUSDT:4h:sma-rsi | quarantined | 4 | -294.32 | 0.68 | 8.72% | 3 | Blocked
RENDERUSDT:4h:sma-rsi | quarantined | 3 | -290.69 | 0.48 | 9.54% | 3 | Blocked

## Attribution By Symbol

Symbol | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
LTCUSDT | 3 | 20 | -1061.56 | -53.08 | 45.0% | 6.72% | 1
LINKUSDT | 3 | 10 | -848.89 | -84.89 | 20.0% | 4.09% | 0
DOGEUSDT | 3 | 9 | -809.27 | -89.92 | 22.2% | 7.60% | 0
ETHUSDT | 2 | 13 | -778.60 | -59.89 | 30.8% | 6.17% | 0
SOLUSDT | 2 | 6 | -441.51 | -73.58 | 33.3% | 5.45% | 1
SUIUSDT | 1 | 2 | -402.49 | -201.25 | 0.0% | 5.70% | 0
SEIUSDT | 4 | 5 | -353.27 | -70.65 | 20.0% | 4.81% | 2
RENDERUSDT | 2 | 3 | -290.69 | -96.90 | 0.0% | 9.27% | 0
ARBUSDT | 1 | 3 | -254.05 | -84.68 | 33.3% | 3.38% | 0
OPUSDT | 1 | 2 | -75.09 | -37.55 | 0.0% | 1.33% | 0
INJUSDT | 1 | 4 | -61.06 | -15.27 | 50.0% | 1.48% | 0
ADAUSDT | 1 | 4 | -34.85 | -8.71 | 50.0% | 2.67% | 0

## Attribution By Timeframe

Timeframe | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Rejected
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
1d | 2 | 5 | -572.28 | -114.46 | 0.0% | 3.33% | 0
1h | 14 | 82 | -188.06 | -2.29 | 50.0% | 9.27% | 3
4h | 28 | 155244334648210042000 | +24686.32 | +0.00 | 0.0% | 33.27% | 8

## Attribution By Strategy

Strategy | Candidates | Trades | PnL | Avg/Trade | Winrate | Max DD | Blocked
--- | ---: | ---: | ---: | ---: | ---: | ---: | ---:
sma-rsi | 22 | 472443100421120 | -2038.17 | +0.00 | 0.0% | 7.60% | 22
breakout | 22 | 722 | +25964.15 | +35.96 | 44.0% | 33.27% | 19

## Exit Reasons

Reason | Trades | PnL | Avg/Trade | Winrate
--- | ---: | ---: | ---: | ---:
stop | 457 | -61635.75 | -134.87 | 21.7%
signal | 128 | -1625.44 | -12.70 | 32.0%
take | 208 | +87187.16 | +419.17 | 100.0%

## News Context For Weak Symbols

Symbol | Strength | Horizon | Direction | Avg Return | Agreement | Confidence
--- | --- | --- | --- | ---: | ---: | ---:
ETHUSDT | moderate | 1h | up | 0.662% | 100.0% | 59

## Operator Rule

Treat this as a triage map. A symbol or strategy can return only after paper evidence improves and the real-money gate is clear.
