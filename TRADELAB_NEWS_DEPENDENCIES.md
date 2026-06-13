# TradeLab News/Market Dependencies

Generated: 2026-06-13T06:05:15.600Z
Input news-impact generated: 2026-06-13T06:05:15.316Z
Matched events: 95

This is research-only. Dependencies are hypotheses until they survive more samples and forward validation.

## Findings

- NEARUSDT: all matched news has a strong 24h down dependency, avg -3.39%, agreement 100%, n=5.
- XRPUSDT: positive news has a moderate 12h up dependency, avg 0.738%, agreement 70%, n=10.
- XRPUSDT: all matched news has a moderate 4h up dependency, avg 0.638%, agreement 73%, n=15.
- NEARUSDT: all matched news has a moderate 12h down dependency, avg -1.132%, agreement 80%, n=5.
- XRPUSDT: positive news has a moderate 4h up dependency, avg 0.672%, agreement 70%, n=10.
- XRPUSDT: all matched news has a moderate 12h up dependency, avg 0.614%, agreement 67%, n=15.
- ETHUSDT: positive news has a moderate 1h up dependency, avg 0.662%, agreement 100%, n=8.
- NEARUSDT: all matched news has a moderate 1h up dependency, avg 0.639%, agreement 80%, n=5.
- NEARUSDT: all matched news has a moderate 4h down dependency, avg -0.953%, agreement 60%, n=5.

## Dependency Table

Symbol | Sentiment | Horizon | Strength | Count | Avg Return | Agreement | Corr | Confidence
--- | --- | --- | --- | ---: | ---: | ---: | ---: | ---:
NEARUSDT | all | 24h | strong | 5 | -3.39% | 100.0% | 0.757 | 80
XRPUSDT | positive | 12h | moderate | 10 | 0.738% | 70.0% | -0.302 | 71
XRPUSDT | all | 4h | moderate | 15 | 0.638% | 73.3% | 0.039 | 65
NEARUSDT | all | 12h | moderate | 5 | -1.132% | 80.0% | 0.553 | 64
XRPUSDT | positive | 4h | moderate | 10 | 0.672% | 70.0% | -0.018 | 62
XRPUSDT | all | 12h | moderate | 15 | 0.614% | 66.7% | -0.086 | 61
ETHUSDT | positive | 1h | moderate | 8 | 0.662% | 100.0% | -0.071 | 59
NEARUSDT | all | 1h | moderate | 5 | 0.639% | 80.0% | 0.427 | 58
NEARUSDT | all | 4h | moderate | 5 | -0.953% | 60.0% | 0.697 | 51
ETHUSDT | all | 1h | weak | 12 | 0.338% | 83.3% | 0.537 | 78
BTCUSDT | negative | 1h | weak | 15 | -0.177% | 66.7% | -0.561 | 70
BTCUSDT | negative | 24h | weak | 15 | -0.126% | 66.7% | -0.389 | 66
BTCUSDT | negative | 4h | weak | 15 | -0.105% | 66.7% | -0.234 | 61
ETHUSDT | all | 24h | weak | 12 | -0.016% | 58.3% | 0.377 | 58
BTCUSDT | positive | 4h | weak | 21 | -0.066% | 66.7% | -0.099 | 57
XRPUSDT | positive | 24h | weak | 10 | 0.256% | 60.0% | -0.188 | 56
BTCUSDT | negative | 12h | weak | 15 | -0.193% | 66.7% | 0.003 | 55
BTCUSDT | all | 4h | weak | 54 | -0.02% | 66.7% | -0.056 | 55
BTCUSDT | all | 12h | weak | 54 | -0.014% | 64.8% | 0.088 | 55
XRPUSDT | positive | 1h | weak | 10 | 0.49% | 60.0% | -0.081 | 54
ETHUSDT | all | 12h | weak | 12 | 0.015% | 50.0% | 0.445 | 53
XRPUSDT | all | 1h | weak | 15 | 0.444% | 60.0% | 0.02 | 52
ETHUSDT | all | 4h | weak | 12 | 0.111% | 50.0% | 0.377 | 52
ETHUSDT | positive | 4h | weak | 8 | 0.414% | 62.5% | -0.15 | 50
ETHUSDT | positive | 12h | weak | 8 | 0.412% | 62.5% | -0.166 | 50
XRPUSDT | all | 24h | weak | 15 | 0.172% | 60.0% | -0.015 | 50
BTCUSDT | neutral | 24h | weak | 18 | 0.196% | 55.6% | 0 | 46
BTCUSDT | positive | 24h | weak | 21 | 0.09% | 42.9% | -0.187 | 46
BTCUSDT | positive | 1h | weak | 21 | 0.137% | 52.4% | 0.075 | 45
BTCUSDT | all | 1h | weak | 54 | 0.034% | 44.4% | 0.155 | 45
BTCUSDT | positive | 12h | weak | 21 | 0.028% | 38.1% | -0.057 | 42
BTCUSDT | neutral | 4h | weak | 18 | 0.104% | 33.3% | 0 | 41
BTCUSDT | neutral | 1h | weak | 18 | 0.09% | 44.4% | 0 | 41
BTCUSDT | neutral | 12h | weak | 18 | 0.087% | 33.3% | 0 | 41
BTCUSDT | all | 24h | weak | 54 | 0.066% | 44.4% | 0.005 | 41
ETHUSDT | positive | 24h | weak | 8 | 0.321% | 50.0% | -0.174 | 40
NEARUSDT | positive | 24h | too-thin | 4 | -3.162% | 100.0% | 0.829 | 76
SOLUSDT | all | 24h | too-thin | 3 | 2.341% | 100.0% | -0.693 | 66
SOLUSDT | all | 12h | too-thin | 3 | 2.215% | 100.0% | -0.693 | 65
SOLUSDT | all | 4h | too-thin | 3 | 1.91% | 100.0% | -0.693 | 62

## Rules

- `too-thin`: fewer than 5 events.
- `weak`: not enough consistency or effect size.
- `moderate`: enough events plus visible average move and direction agreement.
- `strong`: larger effect, stronger agreement, and higher confidence.

Do not use this as a standalone trading signal. It can only become a filter alongside paper strategy results and the real-money gate.
