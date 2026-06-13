# Benchmark Methodology

This document defines the protocol behind the published
`hard / English / N=3` Pathrule benchmark snapshot.

## Research question

The benchmark compares two ways of delivering identical standing project
knowledge to a coding agent:

1. one monolithic native instruction file;
2. native path-scoped instruction files compiled by Pathrule.

It measures whether either layout changes answer quality, token usage, or
duration during the same ordered coding-agent session.

## Published matrix

| Dimension | Values |
| --- | --- |
| Tier | `hard` |
| Language | English |
| Clients | Claude Opus 4.8, OpenAI Codex GPT-5.5 |
| Variants | `monolithic`, `pathrule-current` |
| Repetitions | 3 per cell |
| Session length | 10 prompts |

Only complete cells are published. The suite will expand as additional cells
reach the same completion and audit threshold.

## Repository and fixture

Every run uses the same Fastify snapshot:

- repository: `fastify/fastify`
- tag: `v5.8.5`
- commit: `3983cce8124714242099e8756a7a9a80a0ba0aea`

The benchmark layers fabricated project knowledge over that public repository.
The hard fixture contains 168 canonical records:

| Record class | Count |
| --- | ---: |
| Relevant | 7 |
| Hard negative | 4 |
| Unrelated distractor | 157 |

The corpus contains memories, rules, and procedural skills. Hard negatives share
vocabulary or nearby paths with relevant records but encode different answers.
All expected project-specific identifiers are synthetic.

Before a fixture is accepted, the generator checks that hidden knowledge-only
facts do not occur in repository files, filenames, or prompt text. The published
hard fixture passed this contamination audit.

## Session

Each repetition runs one stateful ten-prompt English conversation. The prompt
sequence covers:

1. direct project-knowledge recall;
2. same-topic follow-up;
3. topic change;
4. another scoped decision;
5. rule application in a code snippet;
6. ordered procedural recall;
7. narrow source-code verification;
8. discovery without a supplied filename;
9. an unknown fact requiring abstention;
10. return to the opening topic.

The prompt text and order are identical between variants. Conversation state is
retained within a repetition.

## Delivery variants

### `monolithic`

The complete canonical corpus is rendered into one root instruction file:

- Claude receives `CLAUDE.md`;
- Codex receives `AGENTS.md`.

### `pathrule-current`

The same canonical records are processed by the selected production Pathrule
checkout and rendered into native path-scoped instruction files plus navigation
metadata for the target client.

`pathrule-current` in this snapshot means native path-scoped compilation plus
navigation. Semantic embedding ranking available through bring-your-own-key or
Pathrule Cloud is additive and was not exercised in these cells.

No read MCP server was configured. The measured difference is the native
knowledge layout, not an MCP retrieval comparison.

## Isolation and parity

Each run receives:

- a newly materialized Fastify worktree;
- the same canonical knowledge and ordered prompts;
- an isolated `HOME`, `PATHRULE_HOME`, and client configuration;
- no inherited project MCP configuration;
- no global instruction, skill, plugin, or hook configuration;
- read-only agent permissions;
- an explicitly requested model.

Pathrule is built and invoked from an explicitly selected source checkout.
The harness does not resolve a global `pathrule` executable through `PATH`.
Runtime source commits and artifact hashes are recorded in provenance.

## Scoring

Scoring is mechanical. No model judges its own response.

For each prompt, the fixture declares some combination of:

- expected facts;
- source-verification facts;
- required actions;
- forbidden facts or actions;
- expected abstention;
- response language.

Matching is normalized and case-insensitive where appropriate. Reports recompute
scores from stored responses and the committed fixture specification rather than
trusting a precomputed quality number in the run log.

### Reported quality metrics

- **Fact accuracy:** expected fact hits divided by expected fact count.
- **Action accuracy:** required action hits divided by required action count.
- **Forbidden hits:** matched forbidden facts plus forbidden actions.
- **Abstention:** whether unknown-fact prompts explicitly declined to invent an
  answer.
- **Language:** whether the response used the requested language.

## Token accounting

Usage comes from each client CLI's structured event stream.

- **Non-cached tokens** represent fresh processing using the client-specific
  fields available in its usage report.
- **Total token footprint** includes the full reported input/cache/output
  footprint for the complete session.
- Unsupported fields remain `null`; the harness does not silently estimate them.

Session metrics sum the ten prompt-level values. The headline table reports the
median of three completed sessions for each cell. Machine-readable reports also
retain mean, minimum, maximum, and standard deviation.

Token accounting should be compared primarily within the same client. Claude and
Codex expose different usage and cache fields, so this repository does not turn
their raw token totals into a cross-provider leaderboard.

## Duration

Prompt duration is measured as wall-clock time around each client invocation.
Session duration is the sum of the ten prompts. The published value is the median
of three completed sessions.

Duration includes normal provider and network variability. It is descriptive,
not a claim about guaranteed model latency.

## Persistence and failures

Every terminal cell is appended to `results/runs.jsonl` before aggregation.
Stable cell identities include suite version, source commit, tier, session,
client, variant, and repetition.

For public portability, a deterministic sanitation step removes only the
machine-local worktree prefix from paths embedded in responses and file-read
lists. Repository-relative paths, response content, metrics, scores, hashes, and
timestamps are otherwise unchanged.

Failed, timed-out, interrupted, and invalid cells are retained. Aggregation never
treats a failed run as zero cost. Resume logic reuses only records with matching
configuration hashes.

## Publication rules

- At least three completed runs are required per published cell.
- Quality and completeness appear before efficiency.
- Losses and regressions are shown with the same prominence as gains.
- Missing values are not replaced with estimates.
- Fixture or scoring changes require versioning and rerunning affected cells.
- Raw observations are separated from explanations of why they occurred.

## Published artifacts

| Artifact | Purpose |
| --- | --- |
| `results/runs.jsonl` | Append-only source records |
| `results/latest.json` | Machine-readable aggregates |
| `results/latest.md` | Human-readable result table |
| `results/latest.csv` | Chart-ready aggregate rows |
| `results/provenance.json` | Source, model, platform, and artifact identity |
| `results/fixture-audit.json` | Fixture composition and contamination result |
