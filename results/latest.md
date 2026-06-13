# Benchmark Results

Quality and completeness are shown before efficiency. Failed cells are never counted as zero-cost runs.

> Scope: `pathrule-current` is native path-scoped compilation plus navigation. Semantic embedding ranking (BYO key / Cloud) is additive and was not exercised in these cells.

| Tier | Client | Variant | Lang | Complete | Facts | Actions | Forbidden | Abstain | Language | Non-cached median | Total median | Duration median |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hard | claude | monolithic | en | 3/3 | 100.0% | 100.0% | 0 | 100.0% | 100.0% | 30,918 | 417,167 | 69,246 ms |
| hard | claude | pathrule-current | en | 3/3 | 100.0% | 100.0% | 0 | 100.0% | 100.0% | 16,084 | 198,069 | 69,419 ms |
| hard | codex | monolithic | en | 3/3 | 95.2% | 50.0% | 0 | 100.0% | 100.0% | 30,287 | 412,433 | 129,872 ms |
| hard | codex | pathrule-current | en | 3/3 | 93.7% | 83.3% | 0 | 100.0% | 100.0% | 27,682 | 241,849 | 105,700 ms |

## Where Pathrule Costs More

No completed matched aggregate currently shows Pathrule above monolithic median non-cached tokens.

Publishable claims require at least three completed runs per cell.
