import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildReports } from "./report.js";

test("report generation works with an empty run log and preserves fixture audit", () => {
  const root = mkdtempSync(join(tmpdir(), "bench-report-"));
  mkdirSync(join(root, "results"), { recursive: true });
  writeFileSync(join(root, "results", "runs.jsonl"), "", "utf8");
  mkdirSync(join(root, "fixtures", "hard"), { recursive: true });
  writeFileSync(
    join(root, "fixtures", "hard", "manifest.json"),
    JSON.stringify({ tier: "hard", contamination_passed: true }),
    "utf8",
  );
  assert.deepEqual(buildReports(root), []);
  assert.equal(existsSync(join(root, "results", "latest.md")), true);
  assert.equal(existsSync(join(root, "results", "fixture-audit.json")), true);
});
