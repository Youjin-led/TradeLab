# TradeLab Scoreboard

Generated: 2026-07-30T14:14:34.763Z
Incubation updated: 2026-07-30T14:14:24.741Z
Real-money gate: **BLOCKED**
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It tracks progress toward manual review; it does not approve real-money trading.

## Summary

Live: 4; probation: 0; quarantined: 21; rejected: 19; ready for review: 0.
Improving: 0; deteriorating: 0; collecting: 2.
Portfolio forward PnL: -4268.42; forward trades: 517; avg/trade: -8.26.

## Live Candidates

Candidate | Progress | Trend | Health | Obs | Fwd Trades | Fwd PnL | PF | DD | Loss Streak | Next Step
--- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---
LTCUSDT:4h:breakout | 52% | phase-mismatch | Healthy | 305 | 7 | +108.96 | 1.12 | 5.48% | 3 | status is incubating, expected ready-for-review
XRPUSDT:4h:breakout | 52% | phase-mismatch | Healthy | 403 | 7 | -140.72 | 1.08 | 5.47% | 3 | status is incubating, expected ready-for-review
SUIUSDT:4h:breakout | 27% | collecting | Caution | 17 | 2 | -402.49 | 2.07 | 6.77% | 6 | status is incubating, expected ready-for-review
NEARUSDT:4h:sma-rsi:auto | 25% | collecting | unknown | 0 |  | +0.00 | 0.00 | 0.00% | 0 | status is incubating, expected ready-for-review

## Highest Risk Live Rows

Candidate | Progress | Trend | Fwd PnL | Blockers
--- | ---: | --- | ---: | ---
NEARUSDT:4h:sma-rsi:auto | 25% | collecting | +0.00 | status is incubating, expected ready-for-review; health is unknown, expected Healthy; live observations 0 < 30; forward paper trades  < 15; profit factor 0 < 1.6
SUIUSDT:4h:breakout | 27% | collecting | -402.49 | status is incubating, expected ready-for-review; health is Caution, expected Healthy; live observations 17 < 30; forward paper trades 2 < 15; loss streak 6 > 2; critical alerts: loss streak 6; quarantine: weak candidate: forward PnL -402.49, PF 2.07, max DD 6.77%, health Caution; auto-unquarantined: trades 9 >= 7; PF 4.22 >= 1.5; DD 2.67% <= 6%; loss streak 2 <= 2; PnL 992.48 >= -50
XRPUSDT:4h:breakout | 52% | phase-mismatch | -140.72 | status is incubating, expected ready-for-review; forward paper trades 7 < 15; profit factor 1.08 < 1.6; loss streak 3 > 2
LTCUSDT:4h:breakout | 52% | phase-mismatch | +108.96 | status is incubating, expected ready-for-review; forward paper trades 7 < 15; profit factor 1.12 < 1.6; loss streak 3 > 2

## Quarantine Count

Quarantined candidates: 21. They are excluded from live-progress scoring until quarantine clears.

## Operator Rule

Only candidates with high progress, no gate blockers, and a clear portfolio kill-switch can move to manual review. Real orders still require separate explicit approval and implementation.
