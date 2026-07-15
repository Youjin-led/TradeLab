# TradeLab Scoreboard

Generated: 2026-07-06T09:05:55.223Z
Incubation updated: 2026-07-06T09:05:30.210Z
Real-money gate: **BLOCKED**
Portfolio kill-switch: **clear**

This report is paper-only. It tracks progress toward manual review; it does not approve real-money trading.

## Summary

Live: 2; probation: 0; quarantined: 26; rejected: 15; ready for review: 0.
Improving: 0; deteriorating: 0; collecting: 2.
Portfolio forward PnL: -89.40; forward trades: 79; avg/trade: -1.13.

## Live Candidates

Candidate | Progress | Trend | Health | Obs | Fwd Trades | Fwd PnL | PF | DD | Loss Streak | Next Step
--- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---
LTCUSDT:1h:sma-rsi | 51% | collecting | Healthy | 13 | 2 | +9.53 | 2.44 | 3.30% | 2 | status is incubating, expected ready-for-review
SUIUSDT:4h:breakout | 27% | collecting | Caution | 17 | 2 | -402.49 | 2.07 | 6.77% | 6 | status is incubating, expected ready-for-review

## Highest Risk Live Rows

Candidate | Progress | Trend | Fwd PnL | Blockers
--- | ---: | --- | ---: | ---
SUIUSDT:4h:breakout | 27% | collecting | -402.49 | status is incubating, expected ready-for-review; health is Caution, expected Healthy; live observations 17 < 30; forward paper trades 2 < 15; loss streak 6 > 2; critical alerts: loss streak 6; quarantine: weak candidate: forward PnL -402.49, PF 2.07, max DD 6.77%, health Caution; auto-unquarantined: trades 9 >= 7; PF 4.22 >= 1.5; DD 2.67% <= 6%; loss streak 2 <= 2; PnL 992.48 >= -50
LTCUSDT:1h:sma-rsi | 51% | collecting | +9.53 | status is incubating, expected ready-for-review; live observations 13 < 30; forward paper trades 2 < 15

## Quarantine Count

Quarantined candidates: 26. They are excluded from live-progress scoring until quarantine clears.

## Operator Rule

Only candidates with high progress, no gate blockers, and a clear portfolio kill-switch can move to manual review. Real orders still require separate explicit approval and implementation.
