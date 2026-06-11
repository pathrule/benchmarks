import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import type { CellPlan, RunRecord } from "../types.js";

const TERMINAL = new Set(["completed", "failed", "timed_out", "invalid"]);

function isRunRecord(value: unknown): value is RunRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<RunRecord>;
  return (
    record.schema_version === 1 &&
    typeof record.cell?.cell_id === "string" &&
    typeof record.cell?.config_hash === "string" &&
    typeof record.status === "string"
  );
}

export function readRunLog(path: string): RunRecord[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const records: RunRecord[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (!line) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRunRecord(parsed)) throw new Error("invalid run record");
      records.push(parsed);
    } catch (error) {
      const isFinalNonEmptyLine = lines.slice(index + 1).every((candidate) => !candidate.trim());
      if (isFinalNonEmptyLine) break;
      throw new Error(
        `Invalid JSONL at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return records;
}

export function appendRunRecord(path: string, record: RunRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, { encoding: "utf8", flush: true });
}

export function latestByCell(records: RunRecord[]): Map<string, RunRecord> {
  const latest = new Map<string, RunRecord>();
  for (const record of records) latest.set(record.cell.cell_id, record);
  return latest;
}

export function reusableRecord(plan: CellPlan, record: RunRecord | undefined): boolean {
  return Boolean(
    record &&
      TERMINAL.has(record.status) &&
      record.cell.config_hash === plan.config_hash &&
      record.cell.cell_id === plan.cell_id,
  );
}

export function pendingPlans(
  plans: CellPlan[],
  records: RunRecord[],
  options: { resume: boolean; refreshSelectors: string[]; matchesRefresh: (plan: CellPlan) => boolean },
): CellPlan[] {
  if (!options.resume) return plans;
  const latest = latestByCell(records);
  return plans.filter((plan) => {
    if (options.refreshSelectors.length > 0 && options.matchesRefresh(plan)) return true;
    return !reusableRecord(plan, latest.get(plan.cell_id));
  });
}

export function compactRunLog(path: string): void {
  const records = [...latestByCell(readRunLog(path)).values()].sort((a, b) =>
    a.cell.cell_id.localeCompare(b.cell.cell_id),
  );
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
  renameSync(temp, path);
}
