# Public Hard/English Release Plan

**Goal:** Publish a defensible first benchmark release containing only the
completed `hard / en / N=3` Claude and Codex comparison.

## 1. Freeze the public matrix

- Set the supported tier list to `hard`.
- Set headline variants to `monolithic` and `pathrule-current`.
- Keep the English ten-prompt session and three-run default.
- Remove generated easy and medium fixture directories.
- Keep the 12 completed run records unchanged.

## 2. Make the harness publication-safe

- Add a real `--help` command that never initializes or executes a run.
- Document explicit dry-run and execution commands.
- Generate fixture audit data only for supported tiers.
- Update fixture and reporting tests for the hard-only matrix.

## 3. Create public documentation

- Add a polished root `README.md`.
- Add a root `METHODOLOGY.md`.
- Frame the comparison as path-scoped knowledge delivery versus a monolithic
  instruction dump.
- State the semantic-ranking scope limit once in the variant definition.
- Show Claude and Codex quality, token, and duration changes independently.
- State that complete future cells will be added as testing continues.

## 4. Curate public evidence

- Regenerate `latest.json`, `latest.md`, `latest.csv`, and
  `fixture-audit.json`.
- Remove personal absolute paths from public provenance while retaining source
  commit and artifact hashes.
- Ensure result files contain only hard/English/N=3 aggregates.

## 5. Verify and publish

- Run type checking and tests.
- Run fixture generation and report generation.
- Scan tracked content for private milestone names, Turkish prose, secrets, and
  personal paths.
- Verify README figures against `latest.csv`.
- Inspect a clean git archive for required public files.
- Commit the release changes and push `main` to `origin`.

