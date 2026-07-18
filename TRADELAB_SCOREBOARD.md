# TradeLab Scoreboard

Generated: 2026-07-18T09:38:19.665Z
Incubation updated: 2026-07-18T09:38:09.875Z
Real-money gate: **BLOCKED**
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It tracks progress toward manual review; it does not approve real-money trading.

## Summary

Live: 3; probation: 0; quarantined: 21; rejected: 20; ready for review: 0.
Improving: 0; deteriorating: 0; collecting: 3.
Portfolio forward PnL: -1371.55; forward trades: 214; avg/trade: -6.41.

## Live Candidates

Candidate | Progress | Trend | Health | Obs | Fwd Trades | Fwd PnL | PF | DD | Loss Streak | Next Step
--- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---
XRPUSDT:4h:breakout | 47% | collecting | Healthy | 329 | 1 | +61.68 | 1.34 | 5.40% | 3 | status is incubating, expected ready-for-review
SUIUSDT:4h:breakout | 27% | collecting | Caution | 17 | 2 | -402.49 | 2.07 | 6.77% | 6 | status is incubating, expected ready-for-review
NEARUSDT:4h:sma-rsi:auto | 25% | collecting | unknown | 0 |  | +0.00 | 0.00 | 0.00% | 0 | status is incubating, expected ready-for-review

## Highest Risk Live Rows

Candidate | Progress | Trend | Fwd PnL | Blockers
--- | ---: | --- | ---: | ---
NEARUSDT:4h:sma-rsi:auto | 25% | collecting | +0.00 | status is incubating, expected ready-for-review; health is unknown, expected Healthy; live observations 0 < 30; forward paper trades  < 15; profit factor 0 < 1.6
SUIUSDT:4h:breakout | 27% | collecting | -402.49 | status is incubating, expected ready-for-review; health is Caution, expected Healthy; live observations 17 < 30; forward paper trades 2 < 15; loss streak 6 > 2; critical alerts: loss streak 6; quarantine: weak candidate: forward PnL -402.49, PF 2.07, max DD 6.77%, health Caution; auto-unquarantined: trades 9 >= 7; PF 4.22 >= 1.5; DD 2.67% <= 6%; loss streak 2 <= 2; PnL 992.48 >= -50
XRPUSDT:4h:breakout | 47% | collecting | +61.68 | status is incubating, expected ready-for-review; forward paper trades 1 < 15; profit factor 1.34 < 1.6; loss streak 3 > 2

## Quarantine Count

Quarantined candidates: 21. They are excluded from live-progress scoring until quarantine clears.

## Operator Rule

Only candidates with high progress, no gate blockers, and a clear portfolio kill-switch can move to manual review. Real orders still require separate explicit approval and implementation.
