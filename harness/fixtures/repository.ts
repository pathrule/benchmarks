import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface RepositorySpec {
  schema_version: 1;
  name: string;
  url: string;
  tag: string;
  commit: string;
  license: string;
}

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 32,
  }).trim();
}

export function loadRepositorySpec(benchRoot: string): RepositorySpec {
  return JSON.parse(
    readFileSync(join(benchRoot, "fixtures", "repository.json"), "utf8"),
  ) as RepositorySpec;
}

export function repositoryCheckoutPath(
  benchRoot: string,
  spec: RepositorySpec,
): string {
  return resolve(benchRoot, ".bench-home", "repositories", `${spec.name}-${spec.tag}`);
}

export function ensureRepositoryCheckout(
  benchRoot: string,
  spec = loadRepositorySpec(benchRoot),
): string {
  const destination = repositoryCheckoutPath(benchRoot, spec);
  if (existsSync(join(destination, ".git"))) {
    const current = git(["-C", destination, "rev-parse", "HEAD"]);
    if (current === spec.commit) return destination;
    rmSync(destination, { recursive: true, force: true });
  }
  mkdirSync(dirname(destination), { recursive: true });
  git(["clone", "--filter=blob:none", "--no-checkout", spec.url, destination]);
  git(["-C", destination, "checkout", "--detach", spec.commit]);
  const current = git(["-C", destination, "rev-parse", "HEAD"]);
  if (current !== spec.commit) {
    throw new Error(`repository_commit_mismatch:expected=${spec.commit}:actual=${current}`);
  }
  return destination;
}

export function repositoryFileList(checkout: string): string[] {
  return git(["-C", checkout, "ls-files"])
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
}
