# TradeLab Incubation Report

Generated: 2026-07-06T09:05:55.207Z
Incubation updated: 2026-07-06T09:05:30.210Z
Real-money gate: **BLOCKED**
Portfolio kill-switch: **clear**
Market phase: **unknown**

This report is paper-only. It does not approve automatic trading or exchange connectivity.

## Summary

Candidates: 43; incubating: 2; probation: 0; ready for review: 0; rejected: 15; quarantined: 26.
Network errors in last incubation: 0.

Next action: Continue paper incubation or research new candidates. Do not connect real money.

## Portfolio Kill-Switch

Forward PnL: -89.4; forward trades: 79; rejected ratio: 34.9%.
- clear

## Quarantine

Quarantined candidates: 26.
- TRXUSDT:4h:sma-rsi: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
- LINKUSDT:4h:sma-rsi: weak candidate: forward PnL -408.4, PF 1.77, max DD 4.27%, health Caution
- LINKUSDT:4h:breakout: weak candidate: forward PnL -236.86, PF 0, max DD 0%, health Blocked
- XRPUSDT:4h:breakout: weak candidate: forward PnL -173.7, PF 1.2, max DD 4.87%, health Blocked
- ATOMUSDT:1h:sma-rsi: weak candidate: forward PnL -172.12, PF 0.8, max DD 9.04%, health Blocked
- DOTUSDT:4h:breakout: weak candidate: forward PnL -152.35, PF 0, max DD 0%, health Blocked
- DOTUSDT:1h:breakout: weak candidate: forward PnL -183.78, PF 0, max DD 0%, health Blocked
- LINKUSDT:1h:breakout: weak candidate: forward PnL -203.63, PF 0.61, max DD 9.34%, health Blocked
- SEIUSDT:4h:breakout: weak symbol: PnL -807.69, trades 13, winrate 31%, max DD 6.55%
- ETHUSDT:4h:sma-rsi: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
- SEIUSDT:4h:sma-rsi: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
- FILUSDT:4h:sma-rsi: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21

## Candidates

Symbol | TF | Strategy | Status | Decision | Health | Live Obs | Forward Trades | Forward PnL | Backtest PnL | PF | Max DD | Gate Blockers
--- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---
LTCUSDT | 1h | sma-rsi | incubating | incubate | Healthy | 13 | 2 | +9.53 | +1922.85 | 2.44 | 3.30% | status is incubating, expected ready-for-review; live observations 13 < 30; forward paper trades 2 < 15
SUIUSDT | 4h | breakout | incubating | incubate | Caution | 17 | 2 | -402.49 | +1146.87 | 2.07 | 6.77% | status is incubating, expected ready-for-review; health is Caution, expected Healthy; live observations 17 < 30; forward paper trades 2 < 15; loss streak 6 > 2; critical alerts: loss streak 6; quarantine: weak candidate: forward PnL -402.49, PF 2.07, max DD 6.77%, health Caution; auto-unquarantined: trades 9 >= 7; PF 4.22 >= 1.5; DD 2.67% <= 6%; loss streak 2 <= 2; PnL 992.48 >= -50
NEARUSDT | 4h | breakout | rejected | reject | Blocked | 111 | 15 | +265.10 | +0.00 | 0.00 | 0.00% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; profit factor 0 < 1.6
TRXUSDT | 4h | sma-rsi | quarantined | quarantine | Caution | 30 | 4 | -123.45 | +1248.14 | 2.48 | 2.45% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; forward paper trades 4 < 15; loss streak 4 > 2; critical alerts: loss streak 4; walk-forward overfit risk; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
ETHUSDT | 4h | sma-rsi | quarantined | quarantine | Caution | 23 | 3 | -141.19 | +3843.87 | 2.41 | 4.67% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 23 < 30; forward paper trades 3 < 15; loss streak 4 > 2; critical alerts: loss streak 4; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
LINKUSDT | 4h | sma-rsi | quarantined | quarantine | Caution | 3 | 4 | -408.40 | +1347.15 | 1.77 | 4.27% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 3 < 30; forward paper trades 4 < 15; loss streak 4 > 2; critical alerts: loss streak 4; quarantine: weak strategy: PnL -2758.3, trades 36, winrate 22%, max DD 9.9%, blocked 16/19; quarantine: weak candidate: forward PnL -408.4, PF 1.77, max DD 4.27%, health Caution
ADAUSDT | 4h | sma-rsi | quarantined | quarantine | Caution | 12 | 1 | +249.98 | +601.37 | 1.54 | 3.71% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 12 < 30; forward paper trades 1 < 15; profit factor 1.54 < 1.6; loss streak 4 > 2; critical alerts: loss streak 4; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1534.39, PF 0, max DD 0%, health Blocked
LTCUSDT | 1d | sma-rsi | quarantined | quarantine | Caution | 13 | 0 | +0.00 | +1324.75 | 1.49 | 8.08% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 13 < 30; forward paper trades 0 < 15; profit factor 1.49 < 1.6; drawdown 8.08% > 8%; loss streak 4 > 2; critical alerts: loss streak 4; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
BCHUSDT | 4h | sma-rsi | quarantined | quarantine | Caution | 12 | 0 | +0.00 | +607.07 | 1.42 | 8.16% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 12 < 30; forward paper trades 0 < 15; profit factor 1.42 < 1.6; drawdown 8.16% > 8%; loss streak 4 > 2; critical alerts: loss streak 4; walk-forward overfit risk; quarantine: weak candidate: forward PnL -1566.98, PF 1.4, max DD 8.26%, health Blocked
DOGEUSDT | 1h | sma-rsi | quarantined | quarantine | Caution | 13 | 1 | +26.78 | +461.46 | 1.33 | 4.94% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 13 < 30; forward paper trades 1 < 15; profit factor 1.33 < 1.6; loss streak 6 > 2; critical alerts: loss streak 6; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
TIAUSDT | 4h | sma-rsi | quarantined | quarantine | Caution | 13 | 0 | +0.00 | +413.81 | 1.26 | 6.01% | status is quarantined, expected ready-for-review; health is Caution, expected Healthy; live observations 13 < 30; forward paper trades 0 < 15; profit factor 1.26 < 1.6; loss streak 5 > 2; critical alerts: loss streak 5; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
DOTUSDT | 4h | sma-rsi | quarantined | quarantine | Blocked | 12 | 0 | +0.00 | +504.36 | 1.22 | 7.09% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 12 < 30; forward paper trades 0 < 15; profit factor 1.22 < 1.6; loss streak 3 > 2; critical alerts: walk-forward overfit risk; quarantine: weak candidate: forward PnL -468.08, PF 1.22, max DD 6.96%, health Blocked
XRPUSDT | 4h | breakout | quarantined | quarantine | Blocked | 70 | 6 | -173.70 | +322.00 | 1.20 | 4.87% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; forward paper trades 6 < 15; profit factor 1.2 < 1.6; loss streak 4 > 2; critical alerts: loss streak 4; walk-forward overfit risk; quarantine: weak candidate: forward PnL -21.98, PF 0, max DD 0%, health Blocked; quarantine: weak candidate: forward PnL -173.7, PF 1.2, max DD 4.87%, health Blocked
ATOMUSDT | 1h | sma-rsi | quarantined | quarantine | Blocked | 8 | 1 | -172.12 | -531.84 | 0.80 | 9.04% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 8 < 30; forward paper trades 1 < 15; profit factor 0.8 < 1.6; drawdown 9.04% > 8%; loss streak 4 > 2; critical alerts: drawdown 9.04% >= limit 9%; loss streak 4; profit factor 0.80 < 1.05; quarantine: weak strategy: PnL -2758.3, trades 36, winrate 22%, max DD 9.9%, blocked 16/19; quarantine: weak candidate: forward PnL -172.12, PF 0.8, max DD 9.04%, health Blocked; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
FILUSDT | 4h | sma-rsi | quarantined | quarantine | Blocked | 19 | 1 | -26.70 | -441.01 | 0.64 | 5.61% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 19 < 30; forward paper trades 1 < 15; profit factor 0.64 < 1.6; loss streak 5 > 2; critical alerts: loss streak 5; profit factor 0.64 < 1.05; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
LINKUSDT | 4h | breakout | quarantined | quarantine | Blocked | 52 | 4 | -236.86 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; forward paper trades 4 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -107.34, PF 0, max DD 0%, health Blocked; quarantine: weak candidate: forward PnL -236.86, PF 0, max DD 0%, health Blocked; quarantine: weak symbol: PnL -848.89, trades 10, winrate 20%, max DD 4.09%
INJUSDT | 4h | sma-rsi | rejected | reject | Caution | 23 | 4 | +898.91 | +325.73 | 1.17 | 9.95% | status is rejected, expected ready-for-review; health is Caution, expected Healthy; live observations 23 < 30; forward paper trades 4 < 15; profit factor 1.17 < 1.6; drawdown 9.95% > 8%; loss streak 4 > 2; critical alerts: drawdown 9.95% >= limit 9%; loss streak 4
SEIUSDT | 4h | sma-rsi | quarantined | quarantine | Blocked | 21 | 0 | +0.00 | -392.18 | 0.69 | 5.96% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 21 < 30; forward paper trades 0 < 15; profit factor 0.69 < 1.6; loss streak 3 > 2; critical alerts: profit factor 0.69 < 1.05; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
LINKUSDT | 1h | breakout | quarantined | quarantine | Blocked | 11 | 2 | -203.63 | -933.65 | 0.61 | 9.34% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 11 < 30; forward paper trades 2 < 15; profit factor 0.61 < 1.6; drawdown 9.34% > 8%; loss streak 4 > 2; critical alerts: drawdown 9.34% >= limit 9%; loss streak 4; profit factor 0.61 < 1.05; quarantine: weak candidate: forward PnL -203.63, PF 0.61, max DD 9.34%, health Blocked; quarantine: weak symbol: PnL -848.89, trades 10, winrate 20%, max DD 4.09%
DOTUSDT | 4h | breakout | quarantined | quarantine | Blocked | 21 | 2 | +108.03 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 21 < 30; forward paper trades 2 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -152.35, PF 0, max DD 0%, health Blocked
DOTUSDT | 1h | breakout | quarantined | quarantine | Blocked | 3 | 1 | -183.78 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 3 < 30; forward paper trades 1 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -183.78, PF 0, max DD 0%, health Blocked; quarantine: weak symbol: PnL -804.21, trades 12, winrate 33%, max DD 5.5%
SEIUSDT | 4h | breakout | quarantined | quarantine | Blocked | 24 | 0 | +0.00 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 24 < 30; forward paper trades 0 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak symbol: PnL -807.69, trades 13, winrate 31%, max DD 6.55%
DOGEUSDT | 4h | sma-rsi | rejected | reject | Caution | 18 | 2 | -221.16 | +771.33 | 1.30 | 6.85% | status is rejected, expected ready-for-review; health is Caution, expected Healthy; live observations 18 < 30; forward paper trades 2 < 15; profit factor 1.3 < 1.6; loss streak 4 > 2; critical alerts: loss streak 4
BCHUSDT | 1h | sma-rsi | rejected | reject | Blocked | 1 | 0 | +0.00 | +115.38 | 1.05 | 10.04% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 1 < 30; forward paper trades 0 < 15; profit factor 1.05 < 1.6; drawdown 10.04% > 8%; loss streak 6 > 2; critical alerts: drawdown 10.04% >= limit 9%; loss streak 6; profit factor 1.05 < 1.05; walk-forward overfit risk
BNBUSDT | 4h | breakout | rejected | reject | Blocked | 10 | 0 | +0.00 | -115.59 | 0.92 | 9.63% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 10 < 30; forward paper trades 0 < 15; profit factor 0.92 < 1.6; drawdown 9.63% > 8%; loss streak 5 > 2; critical alerts: drawdown 9.63% >= limit 9%; loss streak 5; profit factor 0.92 < 1.05
SEIUSDT | 1h | breakout | rejected | reject | Blocked | 1 | 0 | +0.00 | -216.41 | 0.90 | 10.38% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 1 < 30; forward paper trades 0 < 15; profit factor 0.9 < 1.6; drawdown 10.38% > 8%; loss streak 7 > 2; critical alerts: drawdown 10.38% >= limit 9%; loss streak 7; profit factor 0.90 < 1.05
OPUSDT | 1h | sma-rsi | rejected | reject | Blocked | 6 | 0 | +0.00 | -421.46 | 0.81 | 9.85% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 6 < 30; forward paper trades 0 < 15; profit factor 0.81 < 1.6; drawdown 9.85% > 8%; loss streak 4 > 2; critical alerts: drawdown 9.85% >= limit 9%; loss streak 4; profit factor 0.81 < 1.05
SEIUSDT | 1h | sma-rsi | rejected | reject | Blocked | 1 | 0 | +0.00 | -986.08 | 0.52 | 9.86% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 1 < 30; forward paper trades 0 < 15; profit factor 0.52 < 1.6; drawdown 9.86% > 8%; loss streak 9 > 2; critical alerts: drawdown 9.86% >= limit 9%; loss streak 9; profit factor 0.52 < 1.05
SOLUSDT | 4h | breakout | rejected | reject | Blocked | 14 | 3 | +182.10 | +0.00 | 0.00 | 0.00% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 14 < 30; forward paper trades 3 < 15; profit factor 0 < 1.6
JUPUSDT | 4h | sma-rsi | quarantined | quarantine | Blocked | 12 | 0 | +0.00 | -834.18 | 0.46 | 9.31% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 12 < 30; forward paper trades 0 < 15; profit factor 0.46 < 1.6; drawdown 9.31% > 8%; loss streak 5 > 2; critical alerts: drawdown 9.31% >= limit 9%; loss streak 5; profit factor 0.46 < 1.05; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
RENDERUSDT | 4h | sma-rsi | quarantined | quarantine | Blocked | 11 | 0 | +0.00 | -1045.16 | 0.34 | 10.45% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 11 < 30; forward paper trades 0 < 15; profit factor 0.34 < 1.6; drawdown 10.45% > 8%; loss streak 4 > 2; critical alerts: drawdown 10.45% >= limit 9%; loss streak 4; profit factor 0.34 < 1.05; quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
AVAXUSDT | 4h | breakout | quarantined | quarantine | Blocked | 14 | 0 | +0.00 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 14 < 30; forward paper trades 0 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -524.07, PF 0, max DD 0%, health Blocked
SOLUSDT | 1h | breakout | quarantined | quarantine | Blocked | 9 | 3 | -219.20 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 9 < 30; forward paper trades 3 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -290.02, PF 0, max DD 0%, health Blocked; quarantine: weak candidate: forward PnL -219.2, PF 0, max DD 0%, health Blocked
JUPUSDT | 4h | breakout | rejected | reject | Blocked | 15 | 3 | +515.40 | +0.00 | 0.00 | 0.00% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 15 < 30; forward paper trades 3 < 15; profit factor 0 < 1.6
NEARUSDT | 1d | sma-rsi | quarantined | quarantine | Blocked | 13 | 0 | +0.00 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 13 < 30; forward paper trades 0 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak strategy: PnL -5366.2, trades 107, winrate 34%, max DD 21.37%, blocked 19/21
ARBUSDT | 4h | breakout | quarantined | quarantine | Blocked | 3 | 3 | -187.26 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 3 < 30; forward paper trades 3 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -187.26, PF 0, max DD 0%, health Blocked
ETHUSDT | 4h | breakout | rejected | reject | Caution | 11 | 0 | +0.00 | +285.09 | 1.11 | 10.04% | status is rejected, expected ready-for-review; health is Caution, expected Healthy; live observations 11 < 30; forward paper trades 0 < 15; profit factor 1.11 < 1.6; drawdown 10.04% > 8%; loss streak 3 > 2; critical alerts: drawdown 10.04% >= limit 9%
BTCUSDT | 4h | breakout | rejected | reject | Blocked | 2 | 0 | +0.00 | -158.42 | 0.90 | 10.67% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 2 < 30; forward paper trades 0 < 15; profit factor 0.9 < 1.6; drawdown 10.67% > 8%; loss streak 7 > 2; critical alerts: drawdown 10.67% >= limit 9%; loss streak 7; profit factor 0.90 < 1.05
LTCUSDT | 4h | breakout | rejected | reject | Blocked | 14 | 0 | +0.00 | +0.00 | 0.00 | 0.00% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 14 < 30; forward paper trades 0 < 15; profit factor 0 < 1.6
BCHUSDT | 1h | breakout | rejected | reject | Blocked | 14 | 10 | +405.57 | +0.00 | 0.00 | 0.00% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 14 < 30; forward paper trades 10 < 15; profit factor 0 < 1.6
DOGEUSDT | 1h | breakout | rejected | reject | Blocked | 14 | 1 | -29.41 | +0.00 | 0.00 | 0.00% | status is rejected, expected ready-for-review; health is Blocked, expected Healthy; live observations 14 < 30; forward paper trades 1 < 15; profit factor 0 < 1.6
AVAXUSDT | 1h | breakout | quarantined | quarantine | Blocked | 12 | 1 | -21.45 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 12 < 30; forward paper trades 1 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -431.43, PF 0.86, max DD 9.37%, health Blocked
RENDERUSDT | 1h | breakout | quarantined | quarantine | Blocked | 12 | 0 | +0.00 | +0.00 | 0.00 | 0.00% | status is quarantined, expected ready-for-review; health is Blocked, expected Healthy; live observations 12 < 30; forward paper trades 0 < 15; profit factor 0 < 1.6; critical alerts: quarantine: weak candidate: forward PnL -376.83, PF 0, max DD 0%, health Blocked

## Real-Money Requirements

- minimum live observations: 30
- minimum closed paper trades: 15
- minimum profit factor: 1.6
- maximum drawdown: 8%
- maximum loss streak: 2
- required health: Healthy
- required status: ready-for-review

## Operator Rule

If the gate is `BLOCKED`, do not connect API keys, do not place orders, and do not treat the strategy as real-money ready.
