import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSuiteConfig, loadSessions, selectionFromArgs } from "./config.js";
import { buildExecutionGraph, matchesRefresh, parseRefreshSelectors } from "./execution/graph.js";
import { pendingPlans, readRunLog } from "./execution/store.js";

function value(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function main(): void {
  const benchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const pathruleRepo = resolve(value("--pathrule-repo") ?? "../pathrule");
  const selection = selectionFromArgs({
    tiers: value("--tiers"),
    clients: value("--clients"),
    variants: value("--variants"),
    repetitions: value("--runs"),
    ablations: flag("--ablations"),
  });
  const sessions = loadSessions(benchRoot, selection.tiers);
  const config = createSuiteConfig({
    benchRoot,
    pathruleRepo,
    tiers: selection.tiers,
    clients: selection.clients,
    variants: selection.variants,
    repetitions: selection.repetitions,
    timeoutMs: Number(value("--timeout-ms") ?? 300_000),
    models: {
      claude: value("--claude-model") ?? "opus",
      codex: value("--codex-model") ?? "gpt-5.5",
    },
    sessions,
  });
  const graph = buildExecutionGraph(config, selection);
  const runLog = resolve(benchRoot, "results", "runs.jsonl");
  const prior = readRunLog(runLog);
  const selectors = parseRefreshSelectors(value("--refresh"));
  const pending = pendingPlans(graph, prior, {
    resume: flag("--resume"),
    refreshSelectors: selectors,
    matchesRefresh: (plan) => matchesRefresh(plan, selectors),
  });

  console.log(
    JSON.stringify(
      {
        suite_version: config.suite_version,
        pathrule_commit: config.pathrule_commit,
        pathrule_dirty: config.pathrule_dirty,
        total_cells: graph.length,
        completed_records: prior.length,
        pending_cells: pending.length,
        pending: pending.map((plan) => plan.cell_id),
      },
      null,
      2,
    ),
  );

  if (!flag("--dry-run")) {
    throw new Error("execution_not_implemented_yet: use --dry-run");
  }
}

main();
