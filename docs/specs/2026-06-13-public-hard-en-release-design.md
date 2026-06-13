# Public Hard/English Benchmark Release Design

Date: 2026-06-13
Status: Approved

## Objective

Publish the completed benchmark as a narrow, reproducible comparison of
monolithic knowledge delivery and Pathrule's native path-scoped knowledge
delivery for coding agents.

The first public release includes only the cells that have completed the agreed
publication threshold:

- tier: `hard`
- language: English
- repetitions: `N=3`
- clients: Claude Opus 4.8 and OpenAI Codex GPT-5.5
- variants: `monolithic` and `pathrule-current`

Additional tiers, languages, models, and delivery experiments will be added as
their full cells complete. They are not represented as measured results before
that point.

## Public Claim

The release answers one question:

> When the same synthetic project knowledge and prompt sequence are delivered
> as one monolithic instruction file or as native path-scoped instructions,
> what changes in answer quality, token usage, and duration?

The release does not claim to measure semantic embedding retrieval.

`pathrule-current` is defined publicly as native path-scoped compilation plus
navigation. Semantic embedding ranking available through bring-your-own-key or
Pathrule Cloud is an additive layer and was not exercised in the published
cells.

## Evidence

The public report must make the following evidence easy to inspect:

- all published cells completed three runs;
- Claude and Codex used the same pinned Fastify repository snapshot;
- both variants received the same canonical synthetic knowledge;
- fixtures contain relevant records, hard negatives, and unrelated distractors;
- expected facts and required actions were scored mechanically;
- forbidden hits, abstention behavior, and response language remain visible;
- Pathrule quality losses are shown beside efficiency gains;
- raw aggregate data and provenance are linked from the README.

The fixture audit for the published hard tier records 168 synthetic knowledge
items: 7 relevant, 4 hard negatives, and 157 unrelated records. Repository
contamination checks passed.

## README Structure

The root README will:

1. Lead with the benchmark question, not an internal roadmap.
2. Show a compact headline table for Claude and Codex.
3. Visualize paired token and duration changes without hiding quality changes.
4. Explain the synthetic hard fixture and mechanical scoring.
5. Define `monolithic` and `pathrule-current` in public terminology.
6. Include the semantic-ranking scope note exactly once near the variant
   definition.
7. State that the benchmark is ongoing and will be updated as complete cells
   become available.
8. Link to methodology, machine-readable results, provenance, and fixture audit.

The README and methodology must not contain private milestone names, internal
planning commentary, personal filesystem paths, or claims unsupported by the
published artifacts.

## Methodology

The public methodology will describe the experiment that was actually run:

- one pinned Fastify snapshot;
- one English ten-prompt session beginning in `lib`;
- two delivery variants;
- two coding-agent clients;
- three repetitions per cell;
- isolated runtime homes and no configured MCP servers;
- native instruction formats for each client;
- client-reported token accounting;
- mechanical quality scoring;
- append-only run records and generated aggregates.

It will distinguish observed results from architectural explanations and retain
the commitment to publish losses.

## Results Presentation

The headline comparison will preserve the measured values in
`results/latest.csv`.

For Claude, Pathrule preserved 100% fact and action accuracy while reducing
median non-cached tokens from 30,918 to 16,084.

For Codex, Pathrule reduced median non-cached tokens from 30,287 to 27,682 and
median duration from 129,872 ms to 105,700 ms. Fact accuracy changed from 95.2%
to 93.7%, while action accuracy changed from 50.0% to 83.3%.

The README must not collapse these dimensions into one winner label. Efficiency
gains and quality changes are reported independently.

## Publication Scope

The public tree will retain only the hard English fixture and the current
`N=3` result set as supported benchmark scope. Generated reports will be
regenerated after cleanup so they do not list unpublished easy or medium audit
rows.

The repository will include enough harness, fixture, scoring, and provenance
material for a reader to inspect and reproduce the released experiment.

## Verification

Before publication:

- scan tracked files for private milestone names, Turkish prose, secrets,
  absolute personal paths, and stale easy/medium claims;
- run type checking and the full test suite;
- regenerate reports from the retained run records;
- verify every README number against `results/latest.csv`;
- verify a clean archive contains the README, methodology, hard fixture,
  harness, results, license, and required scripts;
- confirm no unpublished result is presented as complete.

