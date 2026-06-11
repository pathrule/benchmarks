import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildExecutionGraph } from "./graph.js";
import {
  appendRunRecord,
  pendingPlans,
  readRunLog,
  reusableRecord,
} from "./store.js";
import type { RunRecord, SuiteConfig } from "../types.js";

const config: SuiteConfig = {
  schema_version: 1,
  suite_version: "honest-v1",
  harness_version: "0.1.0",
  pathrule_repo: "/src/pathrule",
  pathrule_commit: "abc123",
  pathrule_dirty: false,
  clients: ["claude"],
  variants: ["bare"],
  tiers: ["easy"],
  repetitions: 1,
  timeout_ms: 1000,
  models: { claude: "opus", codex: "gpt" },
  sessions: {
    easy: [
      {
        id: "session-a",
        initial_cwd_rel: ".",
        prompts: [
          {
            id: "p1",
            text: "question",
            expected_facts: ["answer"],
            response_language: "en",
          },
        ],
      },
    ],
  },
};

function recordFor(plan: ReturnType<typeof buildExecutionGraph>[number]): RunRecord {
  return {
    schema_version: 1,
    cell: plan,
    status: "completed",
    started_at: "2026-06-12T00:00:00.000Z",
    completed_at: "2026-06-12T00:00:01.000Z",
    prompt_results: [],
    scores: {},
    transcript_path: null,
    artifact_hashes: {},
  };
}

test("resume reuses only matching terminal config hashes", () => {
  const graph = buildExecutionGraph(config, {
    tiers: ["easy"],
    clients: ["claude"],
    variants: ["bare"],
    repetitions: 1,
  });
  const record = recordFor(graph[0]!);
  assert.equal(reusableRecord(graph[0]!, record), true);
  assert.equal(
    reusableRecord({ ...graph[0]!, config_hash: "different" }, record),
    false,
  );
  assert.equal(
    pendingPlans(graph, [record], {
      resume: true,
      refreshSelectors: [],
      matchesRefresh: () => false,
    }).length,
    0,
  );
});

test("refresh reruns matching cells without invalidating others", () => {
  const graph = buildExecutionGraph(
    { ...config, variants: ["bare", "monolithic"] },
    {
      tiers: ["easy"],
      clients: ["claude"],
      variants: ["bare", "monolithic"],
      repetitions: 1,
    },
  );
  const records = graph.map(recordFor);
  const pending = pendingPlans(graph, records, {
    resume: true,
    refreshSelectors: ["monolithic"],
    matchesRefresh: (plan) => plan.variant === "monolithic",
  });
  assert.deepEqual(pending.map((plan) => plan.variant), ["monolithic"]);
});

test("run log tolerates one torn final line and preserves prior records", () => {
  const dir = mkdtempSync(join(tmpdir(), "bench-store-"));
  const path = join(dir, "runs.jsonl");
  const plan = buildExecutionGraph(config, {
    tiers: ["easy"],
    clients: ["claude"],
    variants: ["bare"],
    repetitions: 1,
  })[0]!;
  appendRunRecord(path, recordFor(plan));
  writeFileSync(path, `${JSON.stringify(recordFor(plan))}\n{"schema_version":`, "utf8");
  assert.equal(readRunLog(path).length, 1);
});

test("cell hash changes when the prompt sequence changes", () => {
  const before = buildExecutionGraph(config, {
    tiers: ["easy"],
    clients: ["claude"],
    variants: ["bare"],
    repetitions: 1,
  })[0]!;
  const changed: SuiteConfig = structuredClone(config);
  changed.sessions.easy![0]!.prompts[0]!.text = "different";
  const after = buildExecutionGraph(changed, {
    tiers: ["easy"],
    clients: ["claude"],
    variants: ["bare"],
    repetitions: 1,
  })[0]!;
  assert.equal(before.cell_id, after.cell_id);
  assert.notEqual(before.config_hash, after.config_hash);
});
