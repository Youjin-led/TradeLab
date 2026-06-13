# TradeLab Paper Trading Lab

TradeLab is a browser-only paper trading laboratory. It researches strategies, runs backtests, validates candidates, and watches paper positions. It does not place real orders, does not ask for exchange API keys, and does not manage real money.

## Main Flow

1. Fetch Binance candles or load CSV data.
2. Run Research Grid across symbols and intervals.
3. Add stable candidates to Candidate Watchlist.
4. Incubate a candidate with Paper live loop.
5. Promote or reject the candidate after enough paper observations.

## Safety

- Real orders are disabled.
- API keys are not used.
- Binance integration is public market data only.
- Guardrails can block live paper entries.
- Strategy Health can mark a strategy as Healthy, Caution, or Blocked.

## Current Strategy Set

- SMA + RSI
- Breakout
- Mean Reversion

Each strategy can run long-only, short-only, or long+short. Backtests include commission and slippage.

## Reports

- Backtest summary
- Equity curve
- Risk metrics
- Walk-forward validation
- Portfolio results
- Research results
- Candidate watchlist and incubation state
- CSV/JSON export

## Recommended Use

Keep this as a research and paper-watch tool. A candidate should not be trusted after one good backtest. Prefer candidates that survive walk-forward checks, portfolio review, and live paper incubation without guardrail alerts.

## Incubation Shortlist - 2026-05-31

Expanded Binance research was run on BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT, and AVAXUSDT across 15m, 1h, and 4h candles with 1000-candle lookback. This was research only: public market data, no API keys, no real orders.

Best candidates for paper incubation:

| Priority | Symbol | Interval | Strategy | Why |
| --- | --- | --- | --- | --- |
| 1 | LINKUSDT | 4h | Mean Reversion | Healthy 100, test PnL +648.05, PF 3.15, max DD 2.04%, 7 test trades |
| 2 | BNBUSDT | 4h | SMA + RSI | Healthy 100, test PnL +304.12, PF 2.72, max DD 1.20%, 8 test trades |
| 3 | AVAXUSDT | 4h | Mean Reversion | Healthy 90, test PnL +212.98, PF 1.37, max DD 4.38%, 7 test trades |
| 4 | ETHUSDT | 1h | Mean Reversion | Healthy 100, test PnL +159.53, PF 1.86, max DD 2.18%, 4 test trades |
| 5 | BTCUSDT | 1h | Mean Reversion | Healthy 100, test PnL +68.16, PF 1.49, max DD 1.78%, 3 test trades |

Treat candidates with only 1-2 test trades as weak evidence even when their score is high. No candidate is approved for real money until it survives a separate paper incubation period with live refreshes, stable guardrail status, and enough closed paper trades.

## Incubation Runner

Run one incubation refresh with:

```bash
npm.cmd run tradelab:incubate
```

The runner writes `tradelab-incubation-state.json`. It refreshes the shortlist from public Binance candles, updates live observation counts, applies guardrails, and assigns each candidate a decision: `incubate`, `watch`, `reject`, or `promote-to-manual-review`.

First incubation result on 2026-05-31:

| Symbol | Interval | Strategy | Decision | Reason |
| --- | --- | --- | --- | --- |
| ETHUSDT | 1h | Mean Reversion | incubate | Healthy 100, PF 2.76, DD 2.18%, no alerts |
| BTCUSDT | 1h | Mean Reversion | incubate | Healthy 100, PF 2.70, DD 1.78%, no alerts |
| LINKUSDT | 4h | Mean Reversion | reject | loss streak guardrail triggered |
| BNBUSDT | 4h | SMA + RSI | reject | loss streak guardrail triggered |
| AVAXUSDT | 4h | Mean Reversion | reject | drawdown exceeded guardrail |

Current next action: continue paper incubation for ETHUSDT 1h and BTCUSDT 1h. Real-money use remains blocked until candidates collect enough live paper observations and closed paper trades.

## Real-Money Gate

Run the gate with:

```bash
npm.cmd run tradelab:gate
```

The gate does not trade and does not connect to an exchange. It reads `tradelab-incubation-state.json` and returns `BLOCKED` unless a candidate satisfies all requirements:

- status is `ready-for-review`
- health is `Healthy`
- at least 20 live observations
- at least 10 forward paper trades collected after incubation starts
- profit factor at least 1.4
- max drawdown no more than 6%
- max loss streak no more than 2
- no critical alerts

First gate result on 2026-05-31: `BLOCKED`. ETHUSDT and BTCUSDT remain promising, but they have only 1 live observation each, so real-money use is not allowed.

Forward-paper rule: historical backtest trades are not enough for real-money readiness. The gate uses `forwardPaperTrades`, which only grows from new candles observed after the incubation ledger starts.

## Incubation Report

Generate a readable report with:

```bash
npm.cmd run tradelab:report
```

The report is written to `TRADELAB_INCUBATION_REPORT.md`. It combines the incubation state and real-money gate into a single operator view: status, decision, health, live observations, paper trades, PnL, profit factor, drawdown, and gate blockers.

Recommended operating loop:

1. `npm.cmd run tradelab:incubate`
2. `npm.cmd run tradelab:gate`
3. `npm.cmd run tradelab:report`
4. Keep real money disconnected while the gate is `BLOCKED`.

Or run the full review cycle with one command:

```bash
npm.cmd run tradelab:cycle
```

This refreshes incubation, evaluates the real-money gate, and regenerates `TRADELAB_INCUBATION_REPORT.md`.

## Watch Mode

Run repeated paper review cycles with:

```bash
npm.cmd run tradelab:watch -- --runs=24 --minutes=60
```

Useful variants:

```bash
npm.cmd run tradelab:watch -- --dry-run --runs=2 --minutes=1
npm.cmd run tradelab:watch -- --runs=1 --minutes=0
```

The watcher appends summaries to `TRADELAB_WATCH_LOG.md`. It remains paper-only and uses the same hard gate: no API keys, no account access, no orders.

Current autonomous watch setup:

```bash
npm.cmd run tradelab:watch -- --runs=24 --minutes=60
```

When asked to review the trader, read `TRADELAB_WATCH_LOG.md`, `TRADELAB_INCUBATION_REPORT.md`, and `tradelab-incubation-state.json`, then summarize whether candidates improved, degraded, stayed blocked, or need new research.

Expanded zero-money research on 2026-06-02 scanned 20 symbols across 1h, 4h, and 1d. New candidates added to paper incubation:

- INJUSDT 4h SMA + RSI
- NEARUSDT 4h Breakout
- APTUSDT 1h Mean Reversion
- TRXUSDT 1d SMA + RSI

## Daily Discovery

Run manually:

```bash
npm.cmd run tradelab:discover
```

The discovery job scans a broader zero-money universe, writes `TRADELAB_DAILY_DISCOVERY.md`, and appends the strongest strict candidates to `tradelab-auto-candidates.json`. The incubation runner reads that file automatically.

When the portfolio kill-switch is active, discovery does not auto-add new candidates. It still writes `tradelab-recovery-sandbox.json` with strict recovery ideas and profitable near misses. This keeps research moving without mixing unproven recovery ideas into the live paper portfolio.

To manually promote strict recovery ideas into paper auto-incubation, run:

```bash
npm.cmd run tradelab:recovery:promote
```

This command promotes at most one strict sandbox row at a time and writes `TRADELAB_RECOVERY_PROMOTION.md`. It is paper-only and does not bypass quarantine, lifecycle, kill-switch, manual review, or the real-money gate.

Daily scheduled runner:

```text
run-tradelab-discovery.ps1
```

Task name:

```text
TradeLab Daily Discovery
```

## News Impact Research

Run:

```bash
npm.cmd run tradelab:news
```

The news-impact tool reads public RSS feeds, scores headline sentiment with a simple keyword model, links news to tracked symbols by aliases, and measures 1h/4h/12h/24h candle reactions. It writes `TRADELAB_NEWS_IMPACT.md` and `tradelab-news-impact.json`.

Source groups currently include crypto media, market-media, and regulatory feeds. Feed failures are non-fatal and are recorded in the report error section.

This is a research signal only. It is noisy, source-dependent, and must not bypass the real-money gate.

Scheduled news analysis:

```text
TradeLab News Impact AM
TradeLab News Impact PM
```

Runner script:

```text
run-tradelab-news.ps1
```

The scheduled news jobs run twice per day and write `TRADELAB_NEWS_SCHEDULE_LOG.md`.

After each news run, dependency analysis can be generated with:

```bash
npm.cmd run tradelab:dependencies
```

It reads `tradelab-news-impact.json`, searches for repeated news/market dependencies, and writes `TRADELAB_NEWS_DEPENDENCIES.md` plus `tradelab-news-dependencies.json`. The scheduled news runner executes this automatically after refreshing news impact.

## Drawdown Diagnostics

Run:

```bash
npm.cmd run tradelab:drawdown
```

The drawdown diagnostic reads the paper-incubation state, groups losses by symbol, timeframe, strategy, and exit reason, then writes `TRADELAB_DRAWDOWN_DIAGNOSTICS.md` plus `tradelab-drawdown-diagnostics.json`. It also cross-checks the weakest symbols against the latest news dependency hypotheses when available.

Use it as a triage map while the portfolio kill-switch is active. It can recommend quarantines or validation tightening, but it does not approve real-money trading.

## Quarantine

Run:

```bash
npm.cmd run tradelab:quarantine
```

The quarantine tool reads the latest drawdown diagnostics and writes `TRADELAB_QUARANTINE.md` plus `tradelab-quarantine.json`. It blocks weak symbols, weak strategies, and specific losing candidates from further paper updates. Daily discovery also skips quarantined combinations before they can enter auto-incubation.

The hourly review cycle refreshes drawdown diagnostics and quarantine before evaluating the real-money gate.

## Replacement Scout

Run:

```bash
npm.cmd run tradelab:scout
```

The replacement scout searches for reserve paper candidates outside the current quarantine. It avoids `mean-reversion`, quarantined symbols, known candidates, and already incubated/rejected rows. It writes `TRADELAB_REPLACEMENT_SCOUT.md` plus `tradelab-replacement-scout.json`.

Scout results are inactive reserve ideas. They are not added to auto-incubation while the portfolio kill-switch is active, and they never approve real-money trading.

## Live Candidate Scoreboard

Run:

```bash
npm.cmd run tradelab:scoreboard
```

The scoreboard reads the current incubation state and real-money gate, then writes `TRADELAB_SCOREBOARD.md` plus `tradelab-scoreboard.json`. It ranks live candidates by progress toward manual review, shows trend labels, blockers, and the next action for each row.

The hourly review cycle refreshes this report automatically.

## Network Health

Run:

```bash
npm.cmd run tradelab:network
```

The network health report reads `TRADELAB_SCHEDULE_LOG.md`, counts recent scheduled-cycle failures, and writes `TRADELAB_NETWORK_HEALTH.md` plus `tradelab-network-health.json`. Candle fetching uses retry/backoff, and incubation now runs in partial-cycle mode: one failed symbol should not stop the rest of the paper update.

## Lifecycle

Run:

```bash
npm.cmd run tradelab:lifecycle
```

The lifecycle tool manages paper-only status transitions after each cycle. Weak live candidates can move to `probation`; repeated or severe weakness can move them to `quarantined`; strong candidates can enter `tradelab-promotion-queue.json` and `TRADELAB_LIFECYCLE.md` for manual review tracking.

Lifecycle transitions are counted once per incubation-state snapshot. Re-running `tradelab:lifecycle` manually against the same `tradelab-incubation-state.json` refreshes the queue/report, but it does not add another probation cycle or repeat quarantine decisions.

Promotion queue is not real-money permission. It is only a list for manual review.

## Windows Scheduled Cycle

The preferred long-running setup is now Windows Task Scheduler instead of a permanently running watcher process.

Task name:

```text
TradeLab Paper Cycle
```

Runner script:

```text
run-tradelab-cycle.ps1
```

The task runs the paper-only review cycle hourly, writes `TRADELAB_SCHEDULE_LOG.md`, and exits. It does not keep Node in memory between runs. If the computer is asleep, the task will not trade or run in the background; with `StartWhenAvailable`, Windows can run it after the computer wakes.

Useful commands:

```powershell
Get-ScheduledTask -TaskName 'TradeLab Paper Cycle'
Get-ScheduledTaskInfo -TaskName 'TradeLab Paper Cycle'
Start-ScheduledTask -TaskName 'TradeLab Paper Cycle'
Unregister-ScheduledTask -TaskName 'TradeLab Paper Cycle' -Confirm:$false
```

## Safety Audit

Run:

```bash
npm.cmd run tradelab:safety
```

The audit scans the TradeLab files for exchange API-key access, order endpoints, order-placement verbs, and verifies the real-money gate status. A passing audit means the current project surface is still paper-only. It does not mean a strategy is profitable or approved for real money.

## Doctor Check

Run:

```bash
npm.cmd run tradelab:doctor
```

The doctor is a fast non-network, non-browser health check. It runs syntax checks for TradeLab scripts, safety audit, gate, and report generation. Run browser QA separately with:

```bash
npm.cmd run qa
```
