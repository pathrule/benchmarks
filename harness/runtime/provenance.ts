import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { sha256 } from "../hash.js";

export interface PathruleRuntime {
  repo: string;
  commit: string;
  dirty: boolean;
  node_executable: string;
  node_version: string;
  node_abi: string;
  cli_entry: string;
  hook_source: string;
  compiler_source: string;
  claude_renderer_source: string;
  codex_renderer_source: string;
  version: string;
  hashes: Record<string, string>;
}

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function assertInside(repo: string, path: string): void {
  const rel = relative(realpathSync(repo), realpathSync(path));
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`runtime_artifact_outside_source_checkout:${path}`);
  }
}

function fileHash(path: string): string {
  return sha256(readFileSync(path));
}

function resolveCompatibleNode(repo: string): {
  executable: string;
  version: string;
  abi: string;
} {
  const candidates = [
    process.env.NVM_BIN ? join(process.env.NVM_BIN, "node") : null,
    process.execPath,
  ].filter((value): value is string => Boolean(value && existsSync(value)));
  for (const executable of [...new Set(candidates)]) {
    const probe = spawnSync(
      executable,
      [
        "-e",
        "require('better-sqlite3'); process.stdout.write(process.version+'\\n'+process.versions.modules)",
      ],
      { cwd: repo, encoding: "utf8" },
    );
    if (probe.status === 0) {
      const [version, abi] = probe.stdout.trim().split(/\r?\n/);
      return { executable, version: version!, abi: abi! };
    }
  }
  throw new Error("pathrule_compatible_node_not_found:better-sqlite3 probe failed");
}

export function resolvePathruleRuntime(repoInput: string): PathruleRuntime {
  const repo = resolve(repoInput);
  if (!isAbsolute(repo)) throw new Error("pathrule_repo_not_absolute");
  const paths = {
    cli_entry: join(repo, "packages", "cli", "dist", "index.js"),
    hook_source: join(repo, "packages", "shared", "src", "hook-supervisor", "pathrule-hook.js"),
    compiler_source: join(repo, "packages", "core", "src", "backend", "knowledge-compiler.ts"),
    claude_renderer_source: join(
      repo,
      "packages",
      "shared",
      "src",
      "client-renderers",
      "claude-knowledge-renderer.ts",
    ),
    codex_renderer_source: join(
      repo,
      "packages",
      "shared",
      "src",
      "client-renderers",
      "codex-renderer.ts",
    ),
  };
  for (const path of Object.values(paths)) {
    if (!existsSync(path)) throw new Error(`pathrule_runtime_artifact_missing:${path}`);
    assertInside(repo, path);
  }
  const versionRun = spawnSync(process.execPath, [paths.cli_entry, "version", "--json"], {
    encoding: "utf8",
  });
  if (versionRun.status !== 0) {
    throw new Error(`pathrule_source_cli_unusable:${versionRun.stderr || versionRun.stdout}`);
  }
  const version = JSON.parse(versionRun.stdout).data?.version;
  if (typeof version !== "string") throw new Error("pathrule_source_cli_version_missing");
  const node = resolveCompatibleNode(repo);
  const compatibleVersionRun = spawnSync(node.executable, [paths.cli_entry, "version", "--json"], {
    encoding: "utf8",
  });
  if (compatibleVersionRun.status !== 0) {
    throw new Error(
      `pathrule_source_cli_unusable_with_compatible_node:${compatibleVersionRun.stderr}`,
    );
  }
  return {
    repo,
    commit: git(repo, ["rev-parse", "HEAD"]),
    dirty: git(repo, ["status", "--porcelain"]).length > 0,
    node_executable: node.executable,
    node_version: node.version,
    node_abi: node.abi,
    ...paths,
    version,
    hashes: Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [name, fileHash(path)]),
    ),
  };
}

export function buildPathruleRuntime(repoInput: string): PathruleRuntime {
  const repo = resolve(repoInput);
  const result = spawnSync("pnpm", ["--dir", repo, "--filter", "@pathrule/cli", "build"], {
    cwd: repo,
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 1024 * 1024 * 32,
  });
  if (result.status !== 0) {
    throw new Error(`pathrule_source_build_failed:${result.stderr || result.stdout}`);
  }
  return resolvePathruleRuntime(repo);
}
