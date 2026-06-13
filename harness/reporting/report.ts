import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { latestByCell, readRunLog } from "../execution/store.js";
import { SCORING_VERSION, scorePrompt } from "../scoring/score.js";
import { TIERS, type PromptSpec, type RunRecord, type ScoreResult, type SessionSpec } from "../types.js";

// Scores are NOT trusted from the (immutable) run log. They are recomputed here
// from the stored transcripts against the current fixtures, so a SCORING_VERSION
// bump re-scores every cell without re-running any model. Falls back to the
// baked-in score if a matching prompt spec can no longer be found.
function loadSpecIndex(benchRoot: string): Map<string, PromptSpec> {
  const index = new Map<string, PromptSpec>();
  for (const tier of TIERS) {
    let sessions: SessionSpec[];
    try {
      sessions = JSON.parse(
        readFileSync(resolve(benchRoot, "fixtures", tier, "sessions.json"), "utf8"),
      ) as SessionSpec[];
    } catch {
      continue;
    }
    for (const session of sessions) {
      for (const prompt of session.prompts) {
        index.set(`${tier}/${session.id}/${prompt.id}`, prompt);
      }
    }
  }
  return index;
}

function recomputeScores(record: RunRecord, specs: Map<string, PromptSpec>): ScoreResult[] {
  return record.prompt_results.map((prompt) => {
    const spec = specs.get(`${record.cell.tier}/${record.cell.session_id}/${prompt.prompt_id}`);
    return spec ? scorePrompt(spec, prompt) : record.scores[prompt.prompt_id]!;
  });
}

// Language track of a cell, derived from its prompt specs (each session is
// single-language). Falls back to the `world-<lang>` session-id suffix.
function recordLanguage(record: RunRecord, specs: Map<string, PromptSpec>): string {
  for (const prompt of record.prompt_results) {
    const spec = specs.get(`${record.cell.tier}/${record.cell.session_id}/${prompt.prompt_id}`);
    if (spec) return spec.response_language;
  }
  const match = record.cell.session_id.match(/-([a-z]{2})$/);
  return match ? match[1]! : "?";
}

interface Stats {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stddev: number | null;
}

interface Aggregate {
  tier: string;
  client: string;
  variant: string;
  lang: string;
  cells: number;
  completed: number;
  failed: number;
  expected_fact_hits: number;
  expected_fact_count: number;
  required_action_hits: number;
  required_action_count: number;
  forbidden_hits: number;
  abstention_correct: number;
  abstention_count: number;
  language_correct: number;
  language_count: number;
  non_cached_tokens: Stats;
  total_tokens: Stats;
  duration_ms: Stats;
}

function stats(values: number[]): Stats {
  if (values.length === 0) {
    return { count: 0, mean: null, median: null, min: null, max: null, stddev: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;
  return {
    count: values.length,
    mean,
    median,
    min: sorted[0]!,
    max: sorted.at(-1)!,
    stddev: Math.sqrt(variance),
  };
}

function sessionMetric(
  record: RunRecord,
  field: "non_cached_tokens" | "total_tokens",
): number | null {
  const values = record.prompt_results.map((prompt) => prompt.tokens[field]);
  return values.every((value): value is number => value !== null)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function aggregate(records: RunRecord[], specs: Map<string, PromptSpec>): Aggregate[] {
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    const key = [
      record.cell.tier,
      record.cell.client,
      record.cell.variant,
      recordLanguage(record, specs),
    ].join("/");
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const [tier, client, variant, lang] = key.split("/");
      const completed = group.filter((record) => record.status === "completed");
      const scores = completed.flatMap((record) => recomputeScores(record, specs));
      const nonCached = completed
        .map((record) => sessionMetric(record, "non_cached_tokens"))
        .filter((value): value is number => value !== null);
      const total = completed
        .map((record) => sessionMetric(record, "total_tokens"))
        .filter((value): value is number => value !== null);
      const durations = completed.map((record) =>
        record.prompt_results.reduce((sum, prompt) => sum + prompt.duration_ms, 0),
      );
      return {
        tier: tier!,
        client: client!,
        variant: variant!,
        lang: lang!,
        cells: group.length,
        completed: completed.length,
        failed: group.length - completed.length,
        expected_fact_hits: scores.reduce((sum, score) => sum + score.expected_fact_hits, 0),
        expected_fact_count: scores.reduce((sum, score) => sum + score.expected_fact_count, 0),
        required_action_hits: scores.reduce((sum, score) => sum + score.required_action_hits, 0),
        required_action_count: scores.reduce((sum, score) => sum + score.required_action_count, 0),
        forbidden_hits: scores.reduce(
          (sum, score) =>
            sum + score.forbidden_fact_hits.length + score.forbidden_action_hits.length,
          0,
        ),
        abstention_correct: scores.filter((score) => score.abstention_correct === true).length,
        abstention_count: scores.filter((score) => score.abstention_correct !== null).length,
        language_correct: scores.filter((score) => score.response_language_correct).length,
        language_count: scores.length,
        non_cached_tokens: stats(nonCached),
        total_tokens: stats(total),
        duration_ms: stats(durations),
      };
    })
    .sort((a, b) =>
      [a.tier, a.client, a.variant, a.lang].join("/").localeCompare(
        [b.tier, b.client, b.variant, b.lang].join("/"),
      ),
    );
}

function percent(numerator: number, denominator: number): string {
  return denominator === 0 ? "n/a" : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function number(value: number | null): string {
  return value === null ? "n/a" : Math.round(value).toLocaleString("en-US");
}

function markdown(rows: Aggregate[], costly: Aggregate[]): string {
  const lines = [
    "# Benchmark Results",
    "",
    "Quality and completeness are shown before efficiency. Failed cells are never counted as zero-cost runs.",
    "",
    "> Scope: `pathrule-current` is native path-scoped compilation plus navigation. Semantic embedding ranking (BYO key / Cloud) is additive and was not exercised in these cells.",
    "",
    "> Metrics: **Total footprint** is every token the model processes per turn, the provider-neutral measure of how much context each delivery puts in front of the model, and the primary efficiency number here. **Non-cached** is the billable subset after prompt caching; a static dump caches heavily, so non-cached understates its footprint. Both are shown.",
    "",
    "| Tier | Client | Variant | Lang | Complete | Facts | Actions | Forbidden | Abstain | Language | Total footprint median | Non-cached (billable) median | Duration median |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...rows.map(
      (row) =>
        `| ${row.tier} | ${row.client} | ${row.variant} | ${row.lang} | ${row.completed}/${row.cells} | ${percent(row.expected_fact_hits, row.expected_fact_count)} | ${percent(row.required_action_hits, row.required_action_count)} | ${row.forbidden_hits} | ${percent(row.abstention_correct, row.abstention_count)} | ${percent(row.language_correct, row.language_count)} | ${number(row.total_tokens.median)} | ${number(row.non_cached_tokens.median)} | ${number(row.duration_ms.median)} ms |`,
    ),
    "",
    "## Where Pathrule Costs More",
    "",
    "Flagged when Pathrule's median is above the monolithic baseline on EITHER total footprint OR non-cached tokens, so a regression on either metric is never hidden by the other.",
    "",
    ...(costly.length === 0
      ? ["No completed matched aggregate currently shows Pathrule above the monolithic baseline on total footprint or non-cached tokens."]
      : costly.map(
          (row) =>
            `- ${row.tier}/${row.client}/${row.variant}: total footprint ${number(row.total_tokens.median)}, non-cached ${number(row.non_cached_tokens.median)}.`,
        )),
    "",
    "Publishable claims require at least three completed runs per cell.",
    "",
  ];
  return lines.join("\n");
}

function csv(rows: Aggregate[]): string {
  const header = [
    "tier",
    "client",
    "variant",
    "lang",
    "cells",
    "completed",
    "failed",
    "fact_accuracy",
    "action_accuracy",
    "forbidden_hits",
    "non_cached_median",
    "total_median",
    "duration_median_ms",
  ];
  return [
    header.join(","),
    ...rows.map((row) =>
      [
        row.tier,
        row.client,
        row.variant,
        row.lang,
        row.cells,
        row.completed,
        row.failed,
        row.expected_fact_count
          ? row.expected_fact_hits / row.expected_fact_count
          : "",
        row.required_action_count
          ? row.required_action_hits / row.required_action_count
          : "",
        row.forbidden_hits,
        row.non_cached_tokens.median ?? "",
        row.total_tokens.median ?? "",
        row.duration_ms.median ?? "",
      ].join(","),
    ),
    "",
  ].join("\n");
}

export function buildReports(benchRoot: string): Aggregate[] {
  const resultsRoot = resolve(benchRoot, "results");
  const records = [...latestByCell(readRunLog(resolve(resultsRoot, "runs.jsonl"))).values()];
  const specs = loadSpecIndex(benchRoot);
  const rows = aggregate(records, specs);
  const monolithic = new Map(
    rows
      .filter((row) => row.variant === "monolithic")
      .map((row) => [`${row.tier}/${row.client}/${row.lang}`, row]),
  );
  const costly = rows.filter((row) => {
    if (!row.variant.startsWith("pathrule")) return false;
    const baseline = monolithic.get(`${row.tier}/${row.client}/${row.lang}`);
    if (!baseline) return false;
    const above = (a: number | null, b: number | null | undefined) =>
      a !== null && b !== null && b !== undefined && a > b;
    // Flag a regression on EITHER metric so switching the headline to total
    // footprint can never hide a non-cached (billable) loss, or vice versa.
    return (
      above(row.total_tokens.median, baseline.total_tokens.median) ||
      above(row.non_cached_tokens.median, baseline.non_cached_tokens.median)
    );
  });
  mkdirSync(resultsRoot, { recursive: true });
  writeFileSync(
    resolve(resultsRoot, "latest.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        scoring_version: SCORING_VERSION,
        generated_at: new Date().toISOString(),
        published_scope: {
          tiers: [...TIERS],
          language: "en",
          repetitions: 3,
          variants: ["monolithic", "pathrule-current"],
        },
        aggregates: rows,
        where_pathrule_costs_more: costly,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(resolve(resultsRoot, "latest.md"), markdown(rows, costly), "utf8");
  writeFileSync(resolve(resultsRoot, "latest.csv"), csv(rows), "utf8");
  const fixtureAudit = TIERS.map((tier) =>
    JSON.parse(readFileSync(resolve(benchRoot, "fixtures", tier, "manifest.json"), "utf8")),
  );
  writeFileSync(
    resolve(resultsRoot, "fixture-audit.json"),
    `${JSON.stringify({ schema_version: 1, tiers: fixtureAudit }, null, 2)}\n`,
    "utf8",
  );
  return rows;
}
