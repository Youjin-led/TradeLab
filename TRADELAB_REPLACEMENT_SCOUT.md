# TradeLab Replacement Scout

Generated: 2026-06-08T10:08:29.700Z
Universe: 18 symbols x 2 intervals x 2 strategies
Rules: trades >= 6, PF >= 1.65, DD <= 5.25%, health score >= 78, WF ratio >= 0.22
Portfolio kill-switch: ACTIVE

This report is paper-only. It finds replacement candidates but does not activate them or approve real-money trading.

## Shortlist

No replacement candidates passed the strict rules today.

## Near Misses

Symbol | TF | Strategy | Score | Test PnL | PF | DD | Trades | Reasons
--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---
FILUSDT | 1d | breakout | 4799.0 | 4874.69 | 3.85 | 10.30% | 5 | walk-forward weak; health Caution; health score 50 < 78; test trades 5 < 6; test DD 10.30% > 5.25%; test DD 10.30% > 6%; health Caution != Healthy; health score 50 < 75
FILUSDT | 1d | sma-rsi | 3787.6 | 3858.47 | 3.13 | 9.21% | 7 | walk-forward weak; health Caution; health score 50 < 78; test DD 9.21% > 5.25%; test DD 9.21% > 6%; test loss streak 5 > 3; health Caution != Healthy; health score 50 < 75
SEIUSDT | 1d | sma-rsi | 1400.3 | 1098.35 | Infinity | 0.00% | 2 | walk-forward weak; test trades 2 < 6
DOTUSDT | 1d | sma-rsi | 1377.0 | 1420.90 | 2.83 | 7.95% | 9 | test DD 7.95% > 5.25%; test DD 7.95% > 6%
XRPUSDT | 1d | breakout | 1142.9 | 913.39 | 6.16 | 1.82% | 4 | test trades 4 < 6
TIAUSDT | 1d | breakout | 766.3 | 907.73 | 1.60 | 9.63% | 8 | walk-forward weak; health Caution; health score 50 < 78; test PF 1.60 < 1.65; test DD 9.63% > 5.25%; test DD 9.63% > 6%; test loss streak 4 > 3; health Caution != Healthy; health score 50 < 75
TRXUSDT | 4h | breakout | 552.3 | 389.05 | 3.92 | 1.65% | 10 | health Caution; test loss streak 4 > 3; health Caution != Healthy
SUIUSDT | 4h | breakout | 395.8 | 415.46 | 1.65 | 4.67% | 7 | test PF 1.65 < 1.65
BCHUSDT | 4h | sma-rsi | 384.1 | 201.64 | 4.48 | 0.71% | 3 | test trades 3 < 6
JUPUSDT | 1d | sma-rsi | 283.5 | 408.67 | 1.27 | 8.57% | 9 | test PF 1.27 < 1.65; test DD 8.57% > 5.25%; test PF 1.27 < 1.4; test DD 8.57% > 6%
TRXUSDT | 4h | sma-rsi | 272.4 | 199.71 | 2.18 | 1.72% | 6 | walk-forward weak
ARBUSDT | 1d | sma-rsi | 235.5 | 281.13 | 1.30 | 5.45% | 9 | walk-forward weak; test PF 1.30 < 1.65; test DD 5.45% > 5.25%; test PF 1.30 < 1.4

## Skips

Symbol | TF | Strategy | Reason
--- | --- | --- | ---
FILUSDT | 4h | sma-rsi | already known in base, auto, or incubation state
SEIUSDT | 4h | sma-rsi | already known in base, auto, or incubation state
SEIUSDT | 4h | breakout | already known in base, auto, or incubation state
JUPUSDT | 4h | sma-rsi | already known in base, auto, or incubation state
JUPUSDT | 4h | breakout | already known in base, auto, or incubation state
BNBUSDT | 4h | sma-rsi | already known in base, auto, or incubation state
TRXUSDT | 1d | sma-rsi | already known in base, auto, or incubation state

## Operator Rule

A scout candidate can enter auto-incubation only after manual review or a future explicit promotion command. It must still pass paper incubation, quarantine, kill-switch, and the real-money gate.
