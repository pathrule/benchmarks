import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { buildFixtures } from "./generator.js";
import {
  ensureRepositoryCheckout,
  loadRepositorySpec,
} from "./repository.js";

const benchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repositorySpec = loadRepositorySpec(benchRoot);
const checkout = ensureRepositoryCheckout(benchRoot, repositorySpec);

test("hard fixture uses the pinned repository and passes contamination checks", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-fixtures-"));
  const manifests = buildFixtures(root, checkout, repositorySpec);
  assert.equal(manifests.length, 1);
  assert.equal(manifests[0]!.tier, "hard");
  assert.equal(manifests[0]!.knowledge_count, 168);
  assert.equal(manifests[0]!.repository_commit, repositorySpec.commit);
  assert.equal(manifests[0]!.contamination_passed, true);
  assert.equal(manifests[0]!.relevance_counts.unrelated, 157);
});

test("hard fixture contains one English ten-prompt session", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-fixtures-"));
  buildFixtures(root, checkout, repositorySpec);
  const sessions = JSON.parse(readFileSync(join(root, "hard", "sessions.json"), "utf8"));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, "world-en");
  assert.equal(sessions[0].prompts.length, 10);
  assert.ok(
    sessions[0].prompts.every(
      (prompt: { response_language: string }) => prompt.response_language === "en",
    ),
  );
});
