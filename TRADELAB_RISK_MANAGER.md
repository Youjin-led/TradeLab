# TradeLab Risk Manager Report

Generated: 2026-11-12T06:40:05.888Z
Status: **NORMAL**

---

## Overall Status

- **Status:** NORMAL
- **Next Action:** Normal operation. All risk limits within bounds.
- **Entry Gate:** ✅ OPEN (all risk limits OK)
- **Portfolio Stop-Loss:** ✅ OK
- **Total PnL:** -0.25 USDT

## Loss Windows (realized)

| Window | PnL | Limit | Status |
| --- | --- | --- | --- |
| Daily (UTC) | -1.13 | -500 | ✅ |
| Weekly (7d) | -0.25 | -2500 | ✅ |
| Monthly | -0.25 | -5000 | ✅ |
| Total (all time) | -0.25 | -5000 | ✅ |

## Hard Exposure

- **Open Notional:** 0 USDT (max 30000)
- **Status:** OK

## Active Locks

| Lock | Status |
| --- | --- |
| Portfolio Stop-Loss | ✅ Inactive |
| Daily Loss Limit | ✅ Inactive |
| Weekly Loss Limit | ✅ Inactive |
| Monthly Loss Limit | ✅ Inactive |

## Position Sizing (with Kelly Criterion)

| Symbol | Strategy | Risk % | Size (USDT) | Kelly | WinRate | Stop |
| --- | --- | --- | --- | --- | --- | --- |
| SEIUSDT | sma-rsi | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| ATOMUSDT | sma-rsi | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| INJUSDT | sma-rsi | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| JUPUSDT | sma-rsi | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| OPUSDT | sma-rsi | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| RENDERUSDT | sma-rsi | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| BTCUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| ETHUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| SOLUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| NEARUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| BNBUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| LINKUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| DOTUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| AVAXUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| SOLUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| AVAXUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| DOTUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |
| LINKUSDT | breakout | 0.7% | 70 | N/A (need 10+ trades) | N/A | 95 |

## Portfolio Heat

- **Heat:** 0.14% / 5% max
- **Status:** NORMAL
- **Recommendation:** Portfolio heat within normal range.

## Correlation Guard

- **OK:** ❌
- **Active Positions:** 5
- **Sector Distribution:** {"alt_mid":3,"alt_large":2}
- **Blocks:**
  - 🚫 max_concurrent_positions: 5/3

## Trailing Stops

- **Active Trailing Stops:** 0

## Margin Monitor

- **Margin Level:** 497500%
- **Total PnL:** -0.25 USDT
- **Total Exposure:** 2.01 USDT

## Statistics

- **Total Stop-Losses Triggered:** 47
- **Total Trailing Stops Triggered:** 0
- **Total Correlation Blocks:** 0
- **Total Margin Warnings:** 0

---

*This is a paper-only risk manager. No real orders are placed.*