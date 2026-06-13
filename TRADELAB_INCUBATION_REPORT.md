# TradeLab Incubation Report

Generated: 2026-06-13T11:32:38.371Z
Incubation updated: 2026-06-13T11:32:32.570Z
Real-money gate: **BLOCKED**
Portfolio kill-switch: **ACTIVE**

This report is paper-only. It does not approve automatic trading or exchange connectivity.

## Summary

Candidates: 21; incubating: 2; probation: 0; ready for review: 0; rejected: 4; quarantined: 15.
Network errors in last incubation: 0.

Next action: Portfolio kill-switch active: portfolio forward PnL -11580.78 <= -750

## Portfolio Kill-Switch

Forward PnL: -11580.78; forward trades: 132; rejected ratio: 19.0%.
- portfolio forward PnL -11580.78 <= -750

## Quarantine

Quarantined candidates: 15.
- LINKUSDT:4h:mean-reversion: weak candidate: forward PnL -506.04, PF 0.91, max DD 9.37%, health Blocked
- AVAXUSDT:4h:mean-reversion: weak candidate: forward PnL -1549.14, PF 1.12, max DD 9.81%, health Blocked
- ETHUSDT:1h:mean-reversion: weak candidate: forward PnL -1107.6, PF 0.57, max DD 10.33%, health Blocked
- BTCUSDT:1h:mean-reversion: weak candidate: forward PnL -1321.16, PF 0.4, max DD 9.93%, health Blocked
- INJUSDT:4h:sma-rsi: weak candidate: forward PnL -990.22, PF 1.94, max DD 5.74%, health Healthy
- NEARUSDT:4h:breakout: weak symbol: PnL -1696.33, trades 16, winrate 19%, max DD 20.13%
- APTUSDT:1h:mean-reversion: weak candidate: forward PnL -1402.63, PF 0.85, max DD 10.9%, health Blocked
- JUPUSDT:4h:breakout: weak symbol: PnL -1010.6, trades 7, winrate 14%, max DD 5.53%
- RENDERUSDT:4h:mean-reversion: weak strategy: PnL -9274.38, trades 98, winrate 24%, max DD 20.13%, blocked 8/8
- JUPUSDT:4h:sma-rsi: weak candidate: forward PnL -542.98, PF 1.45, max DD 6.67%, health Healthy
- INJUSDT:1h:mean-reversion: weak candidate: forward PnL -1098.48, PF 1.49, max DD 10.34%, health Blocked
- SEIUSDT:4h:sma-rsi: probation failed: weak live row: PnL 48.22, DD 6.81%, loss streak 3, blockers 5

## Candidates

Symbol | TF | Strategy | Status | Decision | Health | Live Obs | Forward Trades | Forward PnL | Backtest PnL | PF | Max DD | Gate Blockers
--- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---
ATOMUSDT | 1h | sma-rsi | incubating | incubate | Healthy | 16 | 1 | -71.57 | +642.29 | 2.35 | 1.89% | status is incubating, expected ready-for-review; live observations 16 < 20; forward paper trades 1 < 10; loss streak 3 > 2
SEIUSDT | 1h | sma-rsi | incubating | incubate | Healthy | 111 | 3 | +26.44 | +674.02 | 1.90 | 5.00% | status is incubating, expected ready-for-review; forward paper trades 3 < 10
LINKUSDT | 4h | mean-reversion | quarantined | quarantine | Blocked | 68 | 5 | -506.04 | -311.74 | 0.91 | 9.37% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; forward paper trades 5 < 10; profit factor 0.91 < 1.4; drawdown 9.37% > 6%; loss streak 5 > 2; critical alerts: drawdown 9.37% >= limit 9%; loss streak 5; profit factor 0.91 < 1.05; walk-forward overfit risk; quarantine: weak candidate: forward PnL -506.04, PF 0.91, max DD 9.37%, health Blocked
BNBUSDT | 4h | sma-rsi | rejected | reject | Blocked | 131 | 5 | -246.58 | +119.35 | 1.06 | 5.82% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; forward paper trades 5 < 10; profit factor 1.06 < 1.4; loss streak 5 > 2; critical alerts: loss streak 5; walk-forward overfit risk
INJUSDT | 4h | sma-rsi | quarantined | quarantine | Healthy | 51 | 6 | -990.22 | +2207.00 | 1.94 | 5.74% | status is quarantined, expected ready-for-review; forward paper trades 6 < 10; loss streak 3 > 2; critical alerts: quarantine: weak candidate: forward PnL -990.22, PF 1.94, max DD 5.74%, health Healthy
JUPUSDT | 4h | breakout | quarantined | quarantine | Caution | 102 | 2 | -467.62 | +1874.75 | 1.80 | 9.59% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 2 < 10; drawdown 9.59% > 6%; loss streak 4 > 2; critical alerts: drawdown 9.59% >= limit 9%; loss streak 4; quarantine: weak symbol: PnL -1010.6, trades 7, winrate 14%, max DD 5.53%
NEARUSDT | 1d | sma-rsi | quarantined | quarantine | Healthy | 32 | 0 | +0.00 | +1578.84 | 1.74 | 7.81% | status is quarantined, expected ready-for-review; forward paper trades 0 < 10; drawdown 7.81% > 6%; loss streak 3 > 2; critical alerts: quarantine: weak symbol: PnL -1696.33, trades 16, winrate 19%, max DD 20.13%
NEARUSDT | 4h | breakout | quarantined | quarantine | Caution | 50 | 1 | +103.84 | +1623.39 | 1.69 | 5.96% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 1 < 10; loss streak 4 > 2; critical alerts: loss streak 4; quarantine: weak symbol: PnL -1696.33, trades 16, winrate 19%, max DD 20.13%
INJUSDT | 1h | mean-reversion | quarantined | quarantine | Blocked | 48 | 19 | -1098.48 | +1721.02 | 1.49 | 10.34% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; drawdown 10.34% > 6%; loss streak 6 > 2; critical alerts: drawdown 10.34% >= limit 9%; loss streak 6; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1098.48, PF 1.49, max DD 10.34%, health Blocked
OPUSDT | 1h | sma-rsi | quarantined | quarantine | Caution | 77 | 5 | -216.56 | +742.98 | 1.49 | 6.15% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 5 < 10; drawdown 6.15% > 6%; loss streak 3 > 2; critical alerts: walk-forward overfit risk; quarantine: probation failed: weak live row: PnL -323.22, DD 5.41%, loss streak 3, blockers 3
RENDERUSDT | 4h | mean-reversion | quarantined | quarantine | Caution | 49 | 7 | -489.16 | +1604.89 | 1.45 | 8.87% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 7 < 10; drawdown 8.87% > 6%; loss streak 4 > 2; critical alerts: loss streak 4; quarantine: weak strategy: PnL -9274.38, trades 98, winrate 24%, max DD 20.13%, blocked 8/8
JUPUSDT | 4h | sma-rsi | quarantined | quarantine | Healthy | 48 | 5 | -542.98 | +1337.21 | 1.45 | 6.67% | status is quarantined, expected ready-for-review; forward paper trades 5 < 10; drawdown 6.67% > 6%; critical alerts: quarantine: weak candidate: forward PnL -542.98, PF 1.45, max DD 6.67%, health Healthy
SEIUSDT | 4h | sma-rsi | quarantined | quarantine | Healthy | 111 | 3 | +48.22 | +553.13 | 1.25 | 6.81% | status is quarantined, expected ready-for-review; forward paper trades 3 < 10; profit factor 1.25 < 1.4; drawdown 6.81% > 6%; loss streak 3 > 2; critical alerts: quarantine: probation failed: weak live row: PnL 48.22, DD 6.81%, loss streak 3, blockers 5
AVAXUSDT | 4h | mean-reversion | quarantined | quarantine | Blocked | 68 | 10 | -1549.14 | +428.66 | 1.12 | 9.81% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; profit factor 1.12 < 1.4; drawdown 9.81% > 6%; loss streak 3 > 2; critical alerts: drawdown 9.81% >= limit 9%; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1549.14, PF 1.12, max DD 9.81%, health Blocked
NEARUSDT | 1h | mean-reversion | quarantined | quarantine | Blocked | 35 | 15 | -1800.17 | -209.19 | 0.90 | 10.61% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; profit factor 0.9 < 1.4; drawdown 10.61% > 6%; loss streak 6 > 2; critical alerts: drawdown 10.61% >= limit 9%; loss streak 6; profit factor 0.90 < 1.05; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1800.17, PF 0.9, max DD 10.61%, health Blocked
APTUSDT | 1h | mean-reversion | quarantined | quarantine | Blocked | 49 | 15 | -1402.63 | -388.60 | 0.85 | 10.90% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; profit factor 0.85 < 1.4; drawdown 10.9% > 6%; loss streak 4 > 2; critical alerts: drawdown 10.90% >= limit 9%; loss streak 4; profit factor 0.85 < 1.05; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1402.63, PF 0.85, max DD 10.9%, health Blocked
ETHUSDT | 1h | mean-reversion | quarantined | quarantine | Blocked | 69 | 14 | -1107.60 | -585.63 | 0.57 | 10.33% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; profit factor 0.57 < 1.4; drawdown 10.33% > 6%; loss streak 4 > 2; critical alerts: drawdown 10.33% >= limit 9%; loss streak 4; profit factor 0.57 < 1.05; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1107.6, PF 0.57, max DD 10.33%, health Blocked
BTCUSDT | 1h | mean-reversion | quarantined | quarantine | Blocked | 69 | 13 | -1321.16 | -683.62 | 0.40 | 9.93% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; profit factor 0.4 < 1.4; drawdown 9.93% > 6%; loss streak 4 > 2; critical alerts: drawdown 9.93% >= limit 9%; loss streak 4; profit factor 0.40 < 1.05; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1321.16, PF 0.4, max DD 9.93%, health Blocked
SEIUSDT | 4h | breakout | rejected | reject | Caution | 69 | 1 | +296.95 | +1184.35 | 1.88 | 5.08% | status is rejected, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 1 < 10; loss streak 4 > 2; critical alerts: loss streak 4
TRXUSDT | 1d | sma-rsi | rejected | reject | Caution | 103 | 2 | -246.32 | +878.71 | 1.83 | 9.07% | status is rejected, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 2 < 10; drawdown 9.07% > 6%; loss streak 3 > 2; critical alerts: drawdown 9.07% >= limit 9%
FILUSDT | 4h | sma-rsi | rejected | reject | Caution | 64 | 0 | +0.00 | +575.44 | 1.33 | 4.92% | status is rejected, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 0 < 10; profit factor 1.33 < 1.4; loss streak 4 > 2; critical alerts: loss streak 4

## Real-Money Requirements

- minimum live observations: 20
- minimum closed paper trades: 10
- minimum profit factor: 1.4
- maximum drawdown: 6%
- maximum loss streak: 2
- required health: Healthy
- required status: ready-for-review

## Operator Rule

If the gate is `BLOCKED`, do not connect API keys, do not place orders, and do not treat the strategy as real-money ready.
