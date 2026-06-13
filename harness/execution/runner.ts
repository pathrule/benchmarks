import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { runClientSession } from "../adapters/index.js";
import { materializeVariant } from "../runtime/materialize.js";
import type { PathruleRuntime } from "../runtime/provenance.js";
import { scorePrompt } from "../scoring/score.js";
import type {
  CellPlan,
  RunRecord,
  RunStatus,
  SessionSpec,
  SuiteConfig,
} from "../types.js";
import { appendRunRecord } from "./store.js";

function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temp, path);
}

function sessionFor(config: SuiteConfig, plan: CellPlan): SessionSpec {
  const session = (config.sessions[plan.tier] ?? []).find(
    (candidate) => candidate.id === plan.session_id,
  );
  if (!session) throw new Error(`session_not_found:${plan.tier}:${plan.session_id}`);
  return session;
}

function modelMismatch(requested: string, reported: string[]): boolean {
  if (reported.length === 0 || ["opus", "sonnet", "haiku"].includes(requested)) return false;
  return !reported.some((model) => model === requested || model.includes(requested));
}

function finalStatus(results: RunRecord["prompt_results"], expectedCount: number): RunStatus {
  if (results.some((item) => item.status === "timed_out")) return "timed_out";
  if (results.some((item) => item.status === "invalid")) return "invalid";
  if (results.some((item) => item.status === "failed")) return "failed";
  return results.length === expectedCount ? "completed" : "interrupted";
}

export async function executeCell(options: {
  benchRoot: string;
  config: SuiteConfig;
  runtime: PathruleRuntime;
  plan: CellPlan;
  runLog: string;
  keepWorktrees: boolean;
}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const cellRoot = resolve(options.benchRoot, ".bench-work", options.plan.config_hash);
  const fixtureRoot = resolve(cellRoot, "repo");
  const runtimeHome = resolve(cellRoot, "runtime");
  const clientHome = resolve(cellRoot, "client");
  const transcriptAbsolute = resolve(
    options.benchRoot,
    "results",
    "raw",
    `${options.plan.config_hash}.json`,
  );
  let record: RunRecord;
  try {
    rmSync(cellRoot, { recursive: true, force: true });
    mkdirSync(cellRoot, { recursive: true });
    const materialized = await materializeVariant({
      benchRoot: options.benchRoot,
      runtime: options.runtime,
      tier: options.plan.tier,
      client: options.plan.client,
      variant: options.plan.variant,
      destination: fixtureRoot,
      runtimeHome,
    });
    const session = sessionFor(options.config, options.plan);
    const adapter = await runClientSession(options.plan.client, {
      root: materialized.root,
      clientHome,
      model: options.plan.model,
      timeoutMs: options.plan.timeout_ms,
      env: materialized.env,
      session,
    });
    const mismatch = modelMismatch(options.plan.model, adapter.reportedModels);
    const status = mismatch
      ? "invalid"
      : finalStatus(adapter.promptResults, session.prompts.length);
    const scores = Object.fromEntries(
      adapter.promptResults.map((result) => {
        const prompt = session.prompts.find((item) => item.id === result.prompt_id)!;
        return [result.prompt_id, scorePrompt(prompt, result)];
      }),
    );
    writeJsonAtomic(transcriptAbsolute, {
      schema_version: 1,
      cell: options.plan,
      requested_model: options.plan.model,
      reported_models: adapter.reportedModels,
      turns: adapter.transcript,
    });
    record = {
      schema_version: 1,
      cell: options.plan,
      status,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      prompt_results: adapter.promptResults,
      scores,
      transcript_path: relative(options.benchRoot, transcriptAbsolute),
      artifact_hashes: materialized.artifacts,
      ...(mismatch
        ? {
            error_code: "model_mismatch",
            error_message: `requested=${options.plan.model} reported=${adapter.reportedModels.join(",")}`,
          }
        : {}),
    };
  } catch (error) {
    record = {
      schema_version: 1,
      cell: options.plan,
      status: "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      prompt_results: [],
      scores: {},
      transcript_path: null,
      artifact_hashes: options.runtime.hashes,
      error_code: "cell_execution_failed",
      error_message: error instanceof Error ? error.stack ?? error.message : String(error),
    };
  }
  appendRunRecord(options.runLog, record);
  if (!options.keepWorktrees) rmSync(cellRoot, { recursive: true, force: true });
  return record;
}
