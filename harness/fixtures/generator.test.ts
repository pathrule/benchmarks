import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildFixtures } from "./generator.js";

test("fixtures grow in repository and knowledge complexity", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-fixtures-"));
  const manifests = buildFixtures(root);
  assert.deepEqual(
    manifests.map((item) => item.knowledge_count),
    [16, 56, 168],
  );
  assert.ok(manifests[2]!.repository_files > manifests[1]!.repository_files);
  assert.ok(manifests.every((item) => item.contamination_passed));
  assert.ok(manifests[0]!.relevance_counts.unrelated > 0);
});

test("medium and hard use ten-prompt sessions while easy remains multi-prompt", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-fixtures-"));
  buildFixtures(root);
  const count = (tier: string) =>
    JSON.parse(readFileSync(join(root, tier, "sessions.json"), "utf8"))[0].prompts.length;
  assert.equal(count("easy"), 6);
  assert.equal(count("medium"), 10);
  assert.equal(count("hard"), 10);
});
