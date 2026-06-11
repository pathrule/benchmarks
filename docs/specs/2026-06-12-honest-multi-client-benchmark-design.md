# Honest Multi-Client Benchmark Design

Date: 2026-06-12
Status: Approved

## Objective

Build a clean, reproducible benchmark that compares Claude Code and Codex under
equivalent conditions and measures Pathrule's current M60-M64 context delivery
without hiding losing cases.

The benchmark must answer two different questions:

1. Does the current Pathrule stack outperform a realistic monolithic instruction
   file while preserving or improving answer quality?
2. Which Pathrule layer causes each measured change?

The public headline comparison and the diagnostic ablation comparison remain
separate so implementation details cannot be selected after seeing results.

## Honesty Contract

- Every variant receives the same synthetic repository, knowledge corpus, prompt
  sequence, starting directory, permissions, model family, and run count.
- The monolithic and Pathrule variants are generated from the same canonical
  knowledge records. Neither receives facts the other lacks.
- Every tier includes relevant knowledge, plausible hard negatives, and unrelated
  knowledge. Easy is not allowed to be a perfectly clean toy corpus.
- Expected facts must not appear in repository source files, filenames, comments,
  prompts, or unrelated metadata. A contamination audit fails the fixture build.
- Results are persisted before aggregation. Failed, timed-out, and interrupted
  cells remain visible.
- A result is publishable only with at least three analyzable runs per cell.
- Pathrule losses, regressions, routing misses, truncation, and skipped cells are
  reported with the same prominence as wins.
- No model judges its own answer. Scoring is mechanical wherever possible.
- Claims distinguish measured observations from architectural explanations.

## Experimental Matrix

### Headline variants

- `bare`: no generated `CLAUDE.md`, `AGENTS.md`, Pathrule hook, Pathrule MCP, or
  Pathrule runtime state.
- `monolithic`: the complete tier knowledge corpus is rendered into one stable
  root instruction file. Claude receives `CLAUDE.md`; Codex receives `AGENTS.md`.
- `pathrule-current`: the production M60-M64 behavior built from the selected
  Pathrule source checkout:
  - M60 native path-scoped knowledge compilation
  - M61 prompt navigation
  - M63 local sync and current production render pipeline
  - M64 routed full-body delta injection
  - isolated hook index, warehouse, session ledger, and runtime home
  - no read MCP in the normal benchmark path

### Diagnostic ablations

- `pathrule-native`: compiled path-scoped files only; hooks and MCP disabled.
- `pathrule-navigation`: compiled files plus navigation, with routed body
  injection disabled.
- `pathrule-full`: production-equivalent current Pathrule behavior. This must be
  byte-equivalent to `pathrule-current`; the alternate name is used only in the
  ablation report.

Headline rankings use only the three headline variants. Ablations explain
causality and cannot replace an unfavorable headline result.

## Knowledge-Scale Tiers

Every tier uses the same deterministic synthetic TypeScript monorepo, byte for
byte. Repository shape, code volume, path depth, prompt sequence, expected facts,
and relevant knowledge remain fixed. Only accumulated knowledge volume and
distractor density increase.

| Tier | Canonical repository | Knowledge target | Relevant set | Distractors |
| --- | --- | ---: | ---: | ---: |
| easy | same multi-app monorepo | 12-18 items | fixed | at least 50% |
| medium | same multi-app monorepo | 45-65 items | fixed | at least 65% |
| hard | same multi-app monorepo | 140-200 items | fixed | at least 75% |

This isolates the scaling variable: how delivery behaves as team knowledge
accumulates. It does not conflate knowledge growth with a larger codebase.

Each canonical item has:

- stable synthetic ID
- type: memory, rule, or skill
- title/name and full body
- one or more owning paths
- priority and scope where applicable
- tags used only for fixture auditing, never exposed to agents
- relevance labels for benchmark cases

Hard negatives use overlapping vocabulary and adjacent paths but contain
different synthetic identifiers. Unrelated records model normal accumulated
team knowledge from other product areas.

## Multi-Prompt Sessions

The unit of comparison is a session, not an isolated question. Every session
contains a fixed ordered prompt sequence and retains the client's conversation
state.

Required prompt shapes:

1. Direct recall from a path-scoped memory.
2. Same-topic follow-up that should benefit from cache or delta silence.
3. Topic change within the same package.
4. Path change to a different package.
5. Rule application in a code snippet or decision.
6. Procedure/skill recall.
7. Current-code verification requiring a narrow file read.
8. Discovery without a filename.
9. Unknown-fact question requiring explicit abstention.
10. Return to an earlier topic to test duplicate delivery and retained context.

All tiers use the same ten prompts in the same order. Prompt text is equivalent
across clients and identifies no variant.

## Client Isolation

Every run uses a newly materialized fixture worktree and isolated client state:

- dedicated `HOME`
- dedicated `PATHRULE_HOME`
- dedicated `CODEX_HOME`
- dedicated Claude settings and config locations
- no inherited project MCP configuration
- strict MCP config with an empty server set unless a future experiment
  explicitly declares MCP as the tested variable
- no global hooks, plugins, skills, memories, or user instruction files
- read-only agent permissions
- network behavior left at the client's normal model transport only

Authentication credentials may be copied into the isolated home, but no other
user configuration is copied.

Claude and Codex adapters must pin the requested model explicitly and record the
model reported by the client. A mismatch fails the cell rather than merely
writing the requested model into the report.

## Current Pathrule Runtime

The benchmark never executes `pathrule` from `PATH`.

Setup receives an explicit `--pathrule-repo` path. It:

1. resolves and records the source repository commit and dirty state;
2. builds the required CLI, core, shared, and MCP packages from that checkout;
3. resolves the resulting CLI entrypoint directly;
4. copies the real source-built hook into the isolated runtime;
5. records SHA-256 checksums for the CLI bundle, hook, compiler source, renderer
   source, hook index, warehouse, and generated instruction files;
6. runs a keystone check proving the hook and generated files contain a fixture
   nonce known only to the canonical knowledge corpus;
7. rejects any runtime artifact outside the selected source checkout or the
   benchmark's isolated state directory.

Dirty source checkouts are allowed for local development but are prominently
stamped. Publishable runs require a clean source checkout.

## Fixture Generation

One canonical seed produces every variant:

```text
knowledge.json
  -> monolithic CLAUDE.md / AGENTS.md
  -> Pathrule local backend seed
  -> production compiler and client renderers
  -> hook-index.json + warehouse.json
```

The benchmark calls the real source-built Pathrule local write/sync path. It does
not reproduce production compiler or hook behavior inside the benchmark.
Small adapter code may validate and inventory artifacts but cannot synthesize a
fake Pathrule response.

The fixture builder emits a manifest containing item counts, byte counts,
directory counts, rendered instruction paths, truncation flags, relevant-item
survival, and contamination results. Any relevant item omitted by a compiler
budget fails fixture construction.

## Resumability

The execution graph has stable cell IDs:

```text
suite_version / source_commit / tier / session / client / variant / repetition
```

Each completed or failed cell is appended immediately to
`results/runs.jsonl`. Records contain a schema version, configuration hash,
timestamps, status, metrics, scoring output, artifact hashes, and transcript
path.

`--resume`:

- reuses only terminal records whose configuration hash matches;
- reruns missing, interrupted, or explicitly refreshed cells;
- never silently reuses results from another source commit, model, fixture, or
  harness version;
- tolerates one torn final JSONL line;
- rebuilds aggregate reports from the event log at any time.

`--refresh <selector>` invalidates selected cells without deleting unrelated
completed work. `--dry-run` prints the remaining execution graph and estimated
cell count.

## Metrics

Per prompt and per session:

- input tokens
- cache creation tokens where reported
- cache read/cached input tokens
- output tokens
- reasoning tokens where reported
- non-cached tokens using a client-specific documented formula
- total token footprint
- duration
- turns
- tool calls and tool names
- file reads and unique files read
- hook events and injected bytes
- navigation routes emitted and followed
- generated instruction bytes loaded by the client
- expected-fact hits
- forbidden-fact/action hits
- rule compliance
- skill-step coverage
- abstention correctness
- response language correctness

Token fields unsupported by a client are `null`, not estimated into a
cross-client leaderboard. Byte-based estimates may be shown separately and are
never presented as API token usage.

Aggregates report median, mean, min/max, standard deviation, and bootstrap 95%
confidence intervals. Paired deltas use matching repetition numbers.

## Scoring

Case files define normalized expected identifiers, forbidden identifiers,
required actions, forbidden actions, and allowed answer variants.

Scoring operates on the final response and structured tool trace:

- exact or normalized identifier matching
- ordered procedure-step matching
- forbidden API/pattern detection
- file-target correctness
- explicit unknown/insufficient-evidence detection

A manually blinded quality review may supplement mechanical scoring but cannot
replace it or change the primary ranking.

## Reports

Generated artifacts:

- `results/runs.jsonl`: append-only source data
- `results/latest.json`: machine-readable aggregate
- `results/latest.md`: headline and diagnostic tables
- `results/latest.csv`: chart-ready cells
- `results/provenance.json`: source, client, model, OS, and artifact hashes
- `results/fixture-audit.json`: contamination and parity evidence

Reports lead with quality and completeness, then token and latency efficiency.
They include a dedicated "Where Pathrule Costs More" section even when empty.

## Failure Policy

- Timeout, auth failure, model mismatch, malformed usage data, missing hook
  telemetry, contamination, artifact mismatch, and compiler truncation have
  distinct error codes.
- A failed Pathrule setup cannot degrade into `bare`.
- A missing client metric remains missing and cannot be filled from another
  client's accounting.
- The runner terminates child process groups on timeout and preserves diagnostic
  output.
- Aggregation never treats failed cells as zero-cost runs.

## Repository Layout

```text
docs/specs/
fixtures/
  easy/
  medium/
  hard/
harness/
  adapters/
  build/
  execution/
  scoring/
  reporting/
schemas/
results/
scripts/
```

## Implementation Plan

1. Scaffold TypeScript package, schemas, CLI, and append-only run store.
2. Implement source checkout provenance, direct build entrypoint resolution, and
   runtime artifact validation.
3. Implement one deterministic canonical repository and three cumulative
   knowledge overlays, including contamination, repository-identity, and parity
   audits.
4. Implement monolithic and production Pathrule materializers.
5. Implement isolated Claude and Codex adapters with real usage parsing and
   session continuation.
6. Implement the stable execution graph, resume, refresh, timeout, and atomic
   transcript persistence.
7. Implement mechanical scoring and paired aggregation.
8. Add offline smoke tests for generation, parity, resumability, and real-hook
   keystone behavior.
9. Run a one-cell live pilot for each client before spending a full grid.
10. Run the private N>=3 grid, inspect losing cells, and publish only unaltered
    results with the honesty contract.

## Acceptance Criteria

- A clean clone can build fixtures and print the execution graph without model
  credentials.
- The benchmark refuses every global Pathrule binary.
- Provenance identifies the exact Pathrule checkout and hashes every delivery
  artifact.
- Claude and Codex receive equivalent knowledge and prompt sequences through
  their native instruction formats.
- Easy, medium, and hard use byte-identical repositories and prompt sessions,
  with increasing irrelevant and hard-negative knowledge.
- Multi-prompt sessions verify repeat, route change, path change, and return
  behavior.
- Interrupted runs resume without repeating completed matching cells.
- Mechanical fixture audits prove no expected fact leakage and no relevant-item
  loss.
- Reports expose all failures and unfavorable results.
- Full live publication requires N>=3 analyzable runs per cell.
