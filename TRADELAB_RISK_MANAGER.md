# TradeLab Risk Manager Report

Generated: 2026-11-14T17:50:19.210Z
Status: **NORMAL**

---

## Overall Status

- **Status:** NORMAL
- **Next Action:** Normal operation. All risk limits within bounds.
- **Entry Gate:** ✅ OPEN (all risk limits OK)
- **Portfolio Stop-Loss:** ✅ OK
- **Total PnL:** 486.80 USDT

## Loss Windows (realized)

| Window | PnL | Limit | Status |
| --- | --- | --- | --- |
| Daily (UTC) | 403.47 | -500 | ✅ |
| Weekly (7d) | 486.81 | -2500 | ✅ |
| Monthly | 486.81 | -5000 | ✅ |
| Total (all time) | 486.80 | -5000 | ✅ |

## Hard Exposure

- **Open Notional:** 8442.29 USDT (max 30000)
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

- **Heat:** 0.26% / 5% max
- **Status:** NORMAL
- **Recommendation:** Portfolio heat within normal range.

## Correlation Guard

- **OK:** ❌
- **Active Positions:** 9
- **Sector Distribution:** {"alt_mid":5,"alt_large":4}
- **Warnings:**
  - ⚠️ alt_mid: 5 positions (max 3)
  - ⚠️ alt_large: 4 positions (max 3)
- **Blocks:**
  - 🚫 max_concurrent_positions: 9/3

## Trailing Stops

- **Active Trailing Stops:** 0

## Margin Monitor

- **Margin Level:** 124.22%
- **Total PnL:** 486.8 USDT
- **Total Exposure:** 8442.29 USDT
- **Warnings:**
  - ℹ️ low_margin: 124.22% (threshold: 150%)

## Statistics

- **Total Stop-Losses Triggered:** 47
- **Total Trailing Stops Triggered:** 0
- **Total Correlation Blocks:** 0
- **Total Margin Warnings:** 0

---

*This is a paper-only risk manager. No real orders are placed.*