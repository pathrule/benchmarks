import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  ABLATION_VARIANTS,
  CLIENTS,
  HEADLINE_VARIANTS,
  TIERS,
  VARIANTS,
  type ClientId,
  type ExecutionSelection,
  type SessionSpec,
  type SuiteConfig,
  type TierId,
  type VariantId,
} from "./types.js";

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function listArg<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  if (!raw) return [...allowed];
  const selected = raw.split(",").map((item) => item.trim()) as T[];
  const invalid = selected.filter((item) => !allowed.includes(item));
  if (invalid.length > 0) {
    throw new Error(`Unknown value(s): ${invalid.join(", ")}. Allowed: ${allowed.join(", ")}`);
  }
  return selected;
}

export function loadSessions(benchRoot: string, tiers: TierId[]): SuiteConfig["sessions"] {
  return Object.fromEntries(
    tiers.map((tier) => {
      const path = resolve(benchRoot, "fixtures", tier, "sessions.json");
      const sessions = JSON.parse(readFileSync(path, "utf8")) as SessionSpec[];
      return [tier, sessions];
    }),
  );
}

export function createSuiteConfig(options: {
  benchRoot: string;
  pathruleRepo: string;
  tiers: TierId[];
  clients: ClientId[];
  variants: VariantId[];
  repetitions: number;
  timeoutMs: number;
  models: Record<ClientId, string>;
  sessions: SuiteConfig["sessions"];
}): SuiteConfig {
  const repo = resolve(options.pathruleRepo);
  if (!isAbsolute(repo)) throw new Error("pathrule_repo_not_absolute");
  const commit = git(repo, ["rev-parse", "HEAD"]);
  const dirty = git(repo, ["status", "--porcelain"]).length > 0;
  return {
    schema_version: 1,
    suite_version: "honest-v1",
    harness_version: "0.1.0",
    pathrule_repo: repo,
    pathrule_commit: commit,
    pathrule_dirty: dirty,
    clients: options.clients,
    variants: options.variants,
    tiers: options.tiers,
    repetitions: options.repetitions,
    timeout_ms: options.timeoutMs,
    models: options.models,
    sessions: options.sessions,
  };
}

export function selectionFromArgs(args: {
  tiers?: string;
  clients?: string;
  variants?: string;
  repetitions?: string;
  ablations: boolean;
}): ExecutionSelection {
  const defaultVariants = args.ablations
    ? [...HEADLINE_VARIANTS, ...ABLATION_VARIANTS]
    : [...HEADLINE_VARIANTS];
  return {
    tiers: listArg(args.tiers, TIERS),
    clients: listArg(args.clients, CLIENTS),
    variants: args.variants ? listArg(args.variants, VARIANTS) : defaultVariants,
    repetitions: Number(args.repetitions ?? 3),
  };
}
