import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const runLog = resolve(process.cwd(), "results", "runs.jsonl");
const worktreePrefix =
  /\/Users\/[^/]+\/Documents\/GitHub\/benchmarks\/\.bench-work\/[a-f0-9]+\/repo\//g;

const records = readFileSync(runLog, "utf8")
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return value.replace(worktreePrefix, "");
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, sanitize(nested)]),
    );
  }
  return value;
}

writeFileSync(
  runLog,
  `${records.map((record) => JSON.stringify(sanitize(record))).join("\n")}\n`,
  "utf8",
);

console.log(`Sanitized machine-local worktree prefixes in ${records.length} run records.`);
