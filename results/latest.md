# Benchmark Results

Quality and completeness are shown before efficiency. Failed cells are never counted as zero-cost runs.

> Scope: `pathrule-current` is native path-scoped compilation plus navigation. Semantic embedding ranking (BYO key / Cloud) is additive and was not exercised in these cells.

> Metrics: **Total footprint** is every token the model processes per turn, the provider-neutral measure of how much context each delivery puts in front of the model, and the primary efficiency number here. **Non-cached** is the billable subset after prompt caching; a static dump caches heavily, so non-cached understates its footprint. Both are shown.

| Tier | Client | Variant | Lang | Complete | Facts | Actions | Forbidden | Abstain | Language | Total footprint median | Non-cached (billable) median | Duration median |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hard | claude | monolithic | en | 3/3 | 100.0% | 100.0% | 0 | 100.0% | 100.0% | 417,167 | 30,918 | 69,246 ms |
| hard | claude | pathrule-current | en | 3/3 | 100.0% | 100.0% | 0 | 100.0% | 100.0% | 198,069 | 16,084 | 69,419 ms |
| hard | codex | monolithic | en | 3/3 | 95.2% | 50.0% | 0 | 100.0% | 100.0% | 412,433 | 30,287 | 129,872 ms |
| hard | codex | pathrule-current | en | 3/3 | 93.7% | 83.3% | 0 | 100.0% | 100.0% | 241,849 | 27,682 | 105,700 ms |

## Where Pathrule Costs More

Flagged when Pathrule's median is above the monolithic baseline on EITHER total footprint OR non-cached tokens, so a regression on either metric is never hidden by the other.

No completed matched aggregate currently shows Pathrule above the monolithic baseline on total footprint or non-cached tokens.

Publishable claims require at least three completed runs per cell.
