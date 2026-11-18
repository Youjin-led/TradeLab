# TradeLab Risk Manager Report

Generated: 2026-11-18T17:04:45.158Z
Status: **NORMAL**

---

## Overall Status

- **Status:** NORMAL
- **Next Action:** Normal operation. All risk limits within bounds.
- **Entry Gate:** ✅ OPEN (all risk limits OK)
- **Portfolio Stop-Loss:** ✅ OK
- **Total PnL:** 863.70 USDT

## Loss Windows (realized)

| Window | PnL | Limit | Status |
| --- | --- | --- | --- |
| Daily (UTC) | 32.37 | -500 | ✅ |
| Weekly (7d) | 862.80 | -2500 | ✅ |
| Monthly | 863.68 | -5000 | ✅ |
| Total (all time) | 863.70 | -5000 | ✅ |

## Hard Exposure

- **Open Notional:** 7664.14 USDT (max 30000)
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

- **Heat:** 0.32% / 5% max
- **Status:** NORMAL
- **Recommendation:** Portfolio heat within normal range.

## Correlation Guard

- **OK:** ❌
- **Active Positions:** 11
- **Sector Distribution:** {"alt_mid":4,"alt_large":7}
- **Warnings:**
  - ⚠️ alt_mid: 4 positions (max 3)
  - ⚠️ alt_large: 7 positions (max 3)
- **Blocks:**
  - 🚫 max_concurrent_positions: 11/3

## Trailing Stops

- **Active Trailing Stops:** 0

## Margin Monitor

- **Margin Level:** 141.75%
- **Total PnL:** 863.7 USDT
- **Total Exposure:** 7664.14 USDT
- **Warnings:**
  - ℹ️ low_margin: 141.75% (threshold: 150%)

## Statistics

- **Total Stop-Losses Triggered:** 47
- **Total Trailing Stops Triggered:** 0
- **Total Correlation Blocks:** 0
- **Total Margin Warnings:** 0

---

*This is a paper-only risk manager. No real orders are placed.*