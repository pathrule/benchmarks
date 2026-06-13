import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSuiteConfig, loadSessions, selectionFromArgs } from "./config.js";
import { buildExecutionGraph, matchesRefresh, parseRefreshSelectors } from "./execution/graph.js";
import { executeCell } from "./execution/runner.js";
import { pendingPlans, readRunLog } from "./execution/store.js";
import {
  buildPathruleRuntime,
  resolvePathruleRuntime,
} from "./runtime/provenance.js";

function value(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function printHelp(): void {
  console.log(`Pathrule benchmark

Usage:
  npm run bench -- [options]

Options:
  --dry-run                 Print the execution graph without model calls
  --resume                  Reuse matching completed cells
  --tiers hard              Published tier (default: hard)
  --clients LIST            claude,codex (default: both)
  --variants LIST           monolithic,pathrule-current (default: both)
  --runs N                  Repetitions per cell (default: 3)
  --pathrule-repo PATH      Pathrule source checkout (default: ../pathrule)
  --claude-model MODEL      Claude model request (default: opus)
  --codex-model MODEL       Codex model request (default: gpt-5.5)
  --timeout-ms N            Per-client timeout (default: 300000)
  --skip-build              Use existing Pathrule build output
  --keep-worktrees          Preserve materialized run directories
  --refresh SELECTORS       Rerun matching cells while resuming others
  --help                    Show this help without starting a run
`);
}

async function main(): Promise<void> {
  if (flag("--help") || flag("-h")) {
    printHelp();
    return;
  }
  const benchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const pathruleRepo = resolve(value("--pathrule-repo") ?? "../pathrule");
  const selection = selectionFromArgs({
    tiers: value("--tiers"),
    clients: value("--clients"),
    variants: value("--variants"),
    repetitions: value("--runs"),
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

  if (flag("--dry-run")) return;
  const runtime = flag("--skip-build")
    ? resolvePathruleRuntime(pathruleRepo)
    : buildPathruleRuntime(pathruleRepo);
  const provenancePath = resolve(benchRoot, "results", "provenance.json");
  await import("node:fs").then(({ mkdirSync, writeFileSync }) => {
    mkdirSync(resolve(benchRoot, "results"), { recursive: true });
    writeFileSync(
      provenancePath,
      `${JSON.stringify(
        {
          schema_version: 1,
          generated_at: new Date().toISOString(),
          suite: config,
          runtime,
          clients: {
            claude: value("--claude-model") ?? "opus",
            codex: value("--codex-model") ?? "gpt-5.5",
          },
          platform: {
            platform: process.platform,
            arch: process.arch,
            node: process.version,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  });
  for (const [index, plan] of pending.entries()) {
    console.log(`[${index + 1}/${pending.length}] ${plan.cell_id}`);
    const record = await executeCell({
      benchRoot,
      config,
      runtime,
      plan,
      runLog,
      keepWorktrees: flag("--keep-worktrees"),
    });
    console.log(`${record.status}: ${plan.cell_id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
