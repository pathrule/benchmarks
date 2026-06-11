# Benchmark workspace instructions

This repository contains an honesty-first benchmark. Do not alter fixtures,
prompts, scoring, variants, or aggregation after inspecting live results unless
the change is versioned and every affected cell is rerun.

## Invariants

- Never execute `pathrule` through `PATH`. Resolve a selected Pathrule source
  checkout and invoke its built entrypoints directly.
- Claude and Codex must receive the same canonical knowledge and ordered prompt
  sequence through equivalent native instruction files.
- Persist each terminal cell to append-only JSONL before aggregation.
- Never convert missing token fields into estimated API token counts.
- Preserve failed, timed-out, interrupted, and losing cells in reports.
- Expected facts must not appear in repository source, prompts, filenames, or
  unrelated metadata.
- Production Pathrule behavior must come from the selected source checkout. Do
  not mimic compiler, renderer, router, or hook behavior in the harness.

## Editing

- Keep generated fixtures and results reproducible from committed source data.
- Avoid absolute machine paths in committed configuration and fixtures.
- Add focused tests for fixture parity, contamination, provenance, and resume
  behavior before running paid model grids.
