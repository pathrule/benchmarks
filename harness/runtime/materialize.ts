import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { sha256 } from "../hash.js";
import type { CanonicalKnowledgeItem } from "../fixtures/types.js";
import {
  ensureRepositoryCheckout,
  loadRepositorySpec,
} from "../fixtures/repository.js";
import type { ClientId, TierId, VariantId } from "../types.js";
import { parseToolJson, StdioMcpClient } from "./mcp-client.js";
import type { PathruleRuntime } from "./provenance.js";

export interface MaterializedVariant {
  root: string;
  env: NodeJS.ProcessEnv;
  artifacts: Record<string, string>;
  workspace_id: string | null;
}

interface KnowledgeFile {
  schema_version: 1;
  tier: TierId;
  items: CanonicalKnowledgeItem[];
}

function runCli(
  runtime: PathruleRuntime,
  cwd: string,
  env: NodeJS.ProcessEnv,
  args: string[],
): unknown {
  const result = spawnSync(runtime.node_executable, [runtime.cli_entry, ...args, "--json"], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 1024 * 1024 * 32,
  });
  if (result.status !== 0) {
    throw new Error(
      `pathrule_source_cli_failed:${args.join(" ")}:${result.stderr || result.stdout}`,
    );
  }
  return JSON.parse(result.stdout);
}

function renderMonolithic(items: CanonicalKnowledgeItem[]): string {
  const lines = [
    "<!-- Benchmark monolithic knowledge: generated from the canonical corpus. -->",
    "# Project instructions and accumulated team knowledge",
    "",
    "Use the applicable path and scope metadata. The corpus intentionally contains unrelated records.",
    "",
  ];
  for (const kind of ["rule", "memory", "skill"] as const) {
    const heading =
      kind === "rule" ? "Rules" : kind === "memory" ? "Memories and decisions" : "Procedures";
    lines.push(`## ${heading}`, "");
    for (const item of items.filter((candidate) => candidate.kind === kind)) {
      lines.push(
        `### ${item.title}`,
        `Applies to: ${item.node_paths.join(", ") || "/"}`,
        item.body,
        "",
      );
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
}

function listArtifactHashes(root: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === ".git" || name === "node_modules") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      const rel = relative(root, path);
      if (
        name === "CLAUDE.md" ||
        name === "AGENTS.md" ||
        rel === ".claude/settings.json" ||
        rel.startsWith(".claude/rules/") ||
        rel === ".codex/hooks.json" ||
        rel === ".codex/config.toml" ||
        rel === ".pathrule/managed-files.json"
      ) {
        hashes[rel] = sha256(readFileSync(path));
      }
    }
  };
  walk(root);
  return hashes;
}

async function seedLocalKnowledge(options: {
  runtime: PathruleRuntime;
  root: string;
  env: NodeJS.ProcessEnv;
  items: CanonicalKnowledgeItem[];
}): Promise<string> {
  const init = runCli(options.runtime, options.root, options.env, ["init", "--local"]) as {
    data?: { workspaceId?: string };
  };
  const initWorkspace = init.data?.workspaceId;
  const client = new StdioMcpClient({
    command: options.runtime.node_executable,
    args: [options.runtime.cli_entry, "mcp", "run"],
    cwd: options.root,
    env: options.env,
  });
  try {
    await client.initialize();
    const context = parseToolJson(
      await client.tool("pathrule_get_context", {
        cwd: options.root,
        user_intent: "Seed deterministic benchmark knowledge",
        omit_protocol: true,
      }),
    ) as { workspace_id?: string };
    const workspaceId = context?.workspace_id ?? initWorkspace;
    if (!workspaceId) throw new Error("pathrule_local_workspace_id_missing");
    for (const item of options.items) {
      if (item.kind === "memory") {
        await client.tool("pathrule_write_memory", {
          workspace_id: workspaceId,
          node_path: item.node_paths[0] ?? "/",
          title: item.title,
          content: item.body,
          source: "manual",
        });
      } else if (item.kind === "rule") {
        await client.tool("pathrule_write_rule", {
          workspace_id: workspaceId,
          node_path: item.node_paths[0] ?? "/",
          name: item.title,
          content: item.body,
          priority: item.priority ?? "medium",
          scope_type: item.scope_type ?? "folder",
        });
      } else {
        await client.tool("pathrule_write_skill", {
          workspace_id: workspaceId,
          node_path: item.node_paths[0] ?? "/",
          name: item.title,
          description: item.description ?? item.title,
          content: item.body,
          source: "manual",
        });
      }
    }
    return workspaceId;
  } finally {
    client.close();
  }
}

export async function materializeVariant(options: {
  benchRoot: string;
  runtime: PathruleRuntime;
  tier: TierId;
  client: ClientId;
  variant: VariantId;
  destination: string;
  runtimeHome: string;
}): Promise<MaterializedVariant> {
  const tierRoot = resolve(options.benchRoot, "fixtures", options.tier);
  const knowledge = JSON.parse(
    readFileSync(join(tierRoot, "knowledge", "knowledge.json"), "utf8"),
  ) as KnowledgeFile;
  rmSync(options.destination, { recursive: true, force: true });
  mkdirSync(options.destination, { recursive: true });
  const repositorySpec = loadRepositorySpec(options.benchRoot);
  const repository = ensureRepositoryCheckout(options.benchRoot, repositorySpec);
  cpSync(repository, options.destination, {
    recursive: true,
    filter: (source) => source !== join(repository, ".git") && !source.startsWith(join(repository, ".git") + "/"),
  });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: join(options.runtimeHome, "home"),
    PATHRULE_HOME: join(options.runtimeHome, "pathrule"),
    PATHRULE_LOCAL: "1",
    PATHRULE_MCP_TOOLS: "all",
    PATHRULE_NAVIGATION: "on",
    NO_TELEMETRY: "1",
  };
  mkdirSync(env.HOME!, { recursive: true });
  let workspaceId: string | null = null;

  if (options.variant === "monolithic") {
    write(
      join(options.destination, options.client === "claude" ? "CLAUDE.md" : "AGENTS.md"),
      renderMonolithic(knowledge.items),
    );
  } else if (options.variant === "pathrule-current") {
    if (options.client === "codex") {
      write(join(options.destination, ".codex", "hooks.json"), JSON.stringify({ hooks: {} }));
    }
    workspaceId = await seedLocalKnowledge({
      runtime: options.runtime,
      root: options.destination,
      env,
      items: knowledge.items,
    });
    runCli(options.runtime, options.destination, env, ["sync", "--local"]);
  }

  const artifacts = {
    ...options.runtime.hashes,
    ...Object.fromEntries(
      Object.entries(listArtifactHashes(options.destination)).map(([key, value]) => [
        `fixture:${key}`,
        value,
      ]),
    ),
  };
  if (workspaceId) {
    for (const name of ["hook-index.json", "warehouse.json"]) {
      const path = join(env.PATHRULE_HOME!, "cache", workspaceId, name);
      if (existsSync(path)) artifacts[`runtime:${name}`] = sha256(readFileSync(path));
    }
  }
  if (
    options.variant === "pathrule-current" &&
    !existsSync(join(env.PATHRULE_HOME!, "bin", "pathrule-hook.js"))
  ) {
    throw new Error("source_built_pathrule_hook_missing");
  }
  if (options.variant.startsWith("pathrule")) {
    const nativeName = options.client === "claude" ? "CLAUDE.md" : "AGENTS.md";
    const nativeFiles = Object.keys(artifacts).filter((key) => key.endsWith(nativeName));
    if (nativeFiles.length === 0) throw new Error(`native_knowledge_files_missing:${options.client}`);
    const noncePresent = nativeFiles.some((key) =>
      readFileSync(join(options.destination, key.replace(/^fixture:/, "")), "utf8").includes(
        "Cedarline",
      ),
    );
    if (!noncePresent) throw new Error(`native_knowledge_nonce_missing:${options.client}`);
  }
  for (const path of Object.keys(artifacts).filter((key) => key.startsWith("fixture:"))) {
    if (path.includes("..")) throw new Error(`invalid_artifact_path:${path}`);
  }
  return { root: options.destination, env, artifacts, workspace_id: workspaceId };
}

export function relativeArtifactPath(root: string, path: string): string {
  return relative(root, path);
}
