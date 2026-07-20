# TradeLab Scoreboard

Generated: 2026-07-20T18:09:38.650Z
Incubation updated: 2026-07-20T18:09:30.220Z
Real-money gate: **BLOCKED**
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It tracks progress toward manual review; it does not approve real-money trading.

## Summary

Live: 5; probation: 0; quarantined: 21; rejected: 18; ready for review: 0.
Improving: 0; deteriorating: 0; collecting: 3.
Portfolio forward PnL: -3516.78; forward trades: 265; avg/trade: -13.27.

## Live Candidates

Candidate | Progress | Trend | Health | Obs | Fwd Trades | Fwd PnL | PF | DD | Loss Streak | Next Step
--- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---
BCHUSDT:1h:breakout | 65% | phase-mismatch | Healthy | 237 | 21 | +534.13 | 1.24 | 5.08% | 3 | status is incubating, expected ready-for-review
LTCUSDT:4h:breakout | 63% | phase-mismatch | Healthy | 245 | 3 | +218.85 | 2.42 | 2.91% | 2 | status is incubating, expected ready-for-review
XRPUSDT:4h:breakout | 46% | collecting | Healthy | 343 | 2 | -82.83 | 1.30 | 6.61% | 3 | status is incubating, expected ready-for-review
SUIUSDT:4h:breakout | 27% | collecting | Caution | 17 | 2 | -402.49 | 2.07 | 6.77% | 6 | status is incubating, expected ready-for-review
NEARUSDT:4h:sma-rsi:auto | 25% | collecting | unknown | 0 |  | +0.00 | 0.00 | 0.00% | 0 | status is incubating, expected ready-for-review

## Highest Risk Live Rows

Candidate | Progress | Trend | Fwd PnL | Blockers
--- | ---: | --- | ---: | ---
NEARUSDT:4h:sma-rsi:auto | 25% | collecting | +0.00 | status is incubating, expected ready-for-review; health is unknown, expected Healthy; live observations 0 < 30; forward paper trades  < 15; profit factor 0 < 1.6
SUIUSDT:4h:breakout | 27% | collecting | -402.49 | status is incubating, expected ready-for-review; health is Caution, expected Healthy; live observations 17 < 30; forward paper trades 2 < 15; loss streak 6 > 2; critical alerts: loss streak 6; quarantine: weak candidate: forward PnL -402.49, PF 2.07, max DD 6.77%, health Caution; auto-unquarantined: trades 9 >= 7; PF 4.22 >= 1.5; DD 2.67% <= 6%; loss streak 2 <= 2; PnL 992.48 >= -50
XRPUSDT:4h:breakout | 46% | collecting | -82.83 | status is incubating, expected ready-for-review; forward paper trades 2 < 15; profit factor 1.3 < 1.6; loss streak 3 > 2
LTCUSDT:4h:breakout | 63% | phase-mismatch | +218.85 | status is incubating, expected ready-for-review; forward paper trades 3 < 15
BCHUSDT:1h:breakout | 65% | phase-mismatch | +534.13 | status is incubating, expected ready-for-review; profit factor 1.24 < 1.6; loss streak 3 > 2

## Quarantine Count

Quarantined candidates: 21. They are excluded from live-progress scoring until quarantine clears.

## Operator Rule

Only candidates with high progress, no gate blockers, and a clear portfolio kill-switch can move to manual review. Real orders still require separate explicit approval and implementation.
