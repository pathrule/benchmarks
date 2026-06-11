import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sha256 } from "../hash.js";
import { buildFixtures } from "./generator.js";

function repoDigest(root: string): string {
  const files: Array<[string, string]> = [];
  const walk = (dir: string, prefix = "") => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (statSync(path).isDirectory()) walk(path, rel);
      else files.push([rel, sha256(readFileSync(path))]);
    }
  };
  walk(root);
  return sha256(JSON.stringify(files));
}

test("tiers keep one byte-identical repository while knowledge grows", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-fixtures-"));
  const manifests = buildFixtures(root);
  assert.deepEqual(
    manifests.map((item) => item.knowledge_count),
    [16, 56, 168],
  );
  assert.equal(manifests[0]!.repository_files, manifests[1]!.repository_files);
  assert.equal(manifests[1]!.repository_files, manifests[2]!.repository_files);
  assert.equal(repoDigest(join(root, "easy", "repo")), repoDigest(join(root, "medium", "repo")));
  assert.equal(repoDigest(join(root, "medium", "repo")), repoDigest(join(root, "hard", "repo")));
  assert.ok(manifests.every((item) => item.contamination_passed));
  assert.ok(manifests[0]!.relevance_counts.unrelated > 0);
});

test("all knowledge tiers use the same ten-prompt session", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-fixtures-"));
  buildFixtures(root);
  const session = (tier: string) => readFileSync(join(root, tier, "sessions.json"), "utf8");
  assert.equal(JSON.parse(session("easy"))[0].prompts.length, 10);
  assert.equal(session("easy"), session("medium"));
  assert.equal(session("medium"), session("hard"));
});
