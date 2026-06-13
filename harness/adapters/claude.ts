import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { PromptResult } from "../types.js";
import {
  claudeTokens,
  eventModel,
  runCommand,
  stringFields,
} from "./common.js";
import type { AdapterOptions, AdapterResult } from "./types.js";

function keychainSecret(args: string[]): string | undefined {
  if (process.platform !== "darwin") return undefined;
  try {
    const value = execFileSync("security", args, { encoding: "utf8" }).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

// The benchmark runs `claude` with an isolated HOME/CLAUDE_CONFIG_DIR, which
// severs the CLI's normal credential lookup. We therefore inject an OAuth token
// explicitly, in order of preference:
//   1. An explicit CLAUDE_CODE_OAUTH_TOKEN env override.
//   2. A dedicated long-lived token in the `pathrule-benchmark` keychain entry.
//   3. The live subscription login the user already has (`claude /login`), read
//      straight from the `Claude Code-credentials` keychain item. This is the
//      zero-maintenance path: the regular CLI keeps that token refreshed, so no
//      separate setup-token has to be generated or babysat.
function benchmarkOAuthToken(): string | undefined {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const dedicated = keychainSecret([
    "find-generic-password",
    "-a",
    "pathrule-benchmark",
    "-s",
    "pathrule-benchmark-claude-oauth",
    "-w",
  ]);
  if (dedicated) return dedicated;
  const live = keychainSecret(["find-generic-password", "-s", "Claude Code-credentials", "-w"]);
  if (!live) return undefined;
  try {
    const parsed = JSON.parse(live) as { claudeAiOauth?: { accessToken?: string } };
    return parsed.claudeAiOauth?.accessToken || undefined;
  } catch {
    return undefined;
  }
}

function analyze(events: Record<string, unknown>[]): {
  response: string;
  tokens: PromptResult["tokens"];
  toolNames: string[];
  filesRead: string[];
  hookEvents: number;
  injectedBytes: number;
  models: string[];
} {
  let response = "";
  let usage: Record<string, unknown> | undefined;
  let hookEvents = 0;
  let injectedBytes = 0;
  const toolNames: string[] = [];
  const filesRead: string[] = [];
  const models = new Set<string>();
  for (const event of events) {
    const model = eventModel(event);
    if (model) models.add(model);
    if (event.type === "result") {
      if (typeof event.result === "string") response = event.result;
      if (event.usage && typeof event.usage === "object") {
        usage = event.usage as Record<string, unknown>;
      }
    }
    if (String(event.type ?? "").toLowerCase().includes("hook")) {
      hookEvents += 1;
      injectedBytes += Buffer.byteLength(JSON.stringify(event));
    }
    const message = event.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) continue;
    const content = (message as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const record = block as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string" && !response) {
        response += record.text;
      }
      if (record.type === "tool_use" && typeof record.name === "string") {
        toolNames.push(record.name);
        if (["Read", "Grep", "Glob"].includes(record.name)) {
          filesRead.push(...stringFields(record.input));
        }
      }
    }
  }
  return {
    response,
    tokens: claudeTokens(usage),
    toolNames,
    filesRead: [...new Set(filesRead)],
    hookEvents,
    injectedBytes,
    models: [...models],
  };
}

function isAuthFailure(stdout: string, stderr: string): boolean {
  const text = `${stdout}\n${stderr}`.toLowerCase();
  return (
    text.includes("invalid bearer token") ||
    text.includes("invalid authentication") ||
    text.includes("failed to authenticate") ||
    text.includes("please run /login")
  );
}

export async function runClaudeSession(options: AdapterOptions): Promise<AdapterResult> {
  const sessionId = randomUUID();
  const configDir = resolve(options.clientHome, "claude");
  const home = resolve(options.clientHome, "home");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(home, { recursive: true });
  const sourceState = resolve(homedir(), ".claude.json");
  if (existsSync(sourceState)) {
    const state = JSON.parse(readFileSync(sourceState, "utf8")) as Record<string, unknown>;
    const authOnly = Object.fromEntries(
      [
        "hasCompletedOnboarding",
        "lastOnboardingVersion",
        "migrationVersion",
        "oauthAccount",
        "userID",
      ]
        .filter((key) => state[key] !== undefined)
        .map((key) => [key, state[key]]),
    );
    writeFileSync(resolve(home, ".claude.json"), JSON.stringify(authOnly), "utf8");
  }
  // The OAuth token is read fresh PER PROMPT (below), not snapshotted here: the
  // live subscription token in the keychain can rotate mid-session, which would
  // otherwise 401 every prompt after the rotation with a stale snapshot.
  const baseEnv = {
    ...options.env,
    HOME: home,
    CLAUDE_CONFIG_DIR: configDir,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
  const promptResults: PromptResult[] = [];
  const transcript: AdapterResult["transcript"] = [];
  const reportedModels = new Set<string>();

  for (let index = 0; index < options.session.prompts.length; index += 1) {
    const prompt = options.session.prompts[index]!;
    const cwd = resolve(options.root, prompt.cwd_rel ?? options.session.initial_cwd_rel);
    const startedAt = new Date().toISOString();
    const sessionArgs =
      index === 0 ? ["--session-id", sessionId] : ["--resume", sessionId];
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-hook-events",
      "--permission-mode",
      "dontAsk",
      "--tools",
      "Read,Grep,Glob",
      "--disallowedTools",
      "Edit,Write,NotebookEdit,Bash,WebFetch,WebSearch",
      "--model",
      options.model,
      "--setting-sources",
      "project",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--disable-slash-commands",
      ...sessionArgs,
      prompt.text,
    ];
    const invoke = () =>
      runCommand({
        command: "claude",
        args,
        cwd,
        env: { ...baseEnv, CLAUDE_CODE_OAUTH_TOKEN: benchmarkOAuthToken() },
        timeoutMs: options.timeoutMs,
      });
    let result = await invoke();
    // The live subscription token can rotate between prompts; one retry with a
    // freshly-read token turns a transient 401 into a successful prompt instead
    // of a dead cell.
    if (!result.timedOut && result.exitCode !== 0 && isAuthFailure(result.stdout, result.stderr)) {
      result = await invoke();
    }
    const analyzed = analyze(result.events);
    for (const model of analyzed.models) reportedModels.add(model);
    const status = result.timedOut ? "timed_out" : result.exitCode === 0 ? "completed" : "failed";
    promptResults.push({
      prompt_id: prompt.id,
      status,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      duration_ms: result.durationMs,
      response_text: analyzed.response,
      tokens: analyzed.tokens,
      tool_calls: analyzed.toolNames.length,
      tool_names: analyzed.toolNames,
      files_read: analyzed.filesRead,
      hook_events: analyzed.hookEvents,
      injected_bytes: analyzed.injectedBytes,
      ...(status === "completed"
        ? {}
        : {
            error_code: result.timedOut ? "client_timeout" : "claude_exit_nonzero",
            error_message: result.stderr.slice(-4000),
          }),
    });
    transcript.push({
      prompt_id: prompt.id,
      command: ["claude", ...args.slice(0, -1), "<prompt>"],
      cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      events: result.events,
    });
    if (status !== "completed") break;
  }
  return { promptResults, transcript, reportedModels: [...reportedModels] };
}
