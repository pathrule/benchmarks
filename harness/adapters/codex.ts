import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import type { PromptResult } from "../types.js";
import {
  codexTokens,
  eventModel,
  runCommand,
  stringFields,
  tokenDelta,
} from "./common.js";
import type { AdapterOptions, AdapterResult } from "./types.js";

function analyze(events: Record<string, unknown>[]): {
  threadId: string | null;
  response: string;
  tokens: PromptResult["tokens"];
  toolNames: string[];
  filesRead: string[];
  models: string[];
} {
  let threadId: string | null = null;
  let response = "";
  let usage: Record<string, unknown> | undefined;
  const toolNames: string[] = [];
  const filesRead: string[] = [];
  const models = new Set<string>();
  for (const event of events) {
    const model = eventModel(event);
    if (model) models.add(model);
    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      threadId = event.thread_id;
    }
    if (event.type === "turn.completed" && event.usage && typeof event.usage === "object") {
      usage = event.usage as Record<string, unknown>;
    }
    const item = event.item;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    if (record.type === "agent_message" && typeof record.text === "string") {
      response = record.text;
    }
    if (typeof record.type === "string" && record.type !== "agent_message") {
      toolNames.push(record.type);
      filesRead.push(...stringFields(record));
      if (typeof record.command === "string") {
        const matches = record.command.matchAll(
          /(?:^|\s)(?:cat|sed|rg|head|tail|nl)\s+(?:-[^\s]+\s+)*['"]?([^'"\s|;&]+)/g,
        );
        for (const match of matches) filesRead.push(match[1]!);
      }
    }
  }
  return {
    threadId,
    response,
    tokens: codexTokens(usage),
    toolNames,
    filesRead: [...new Set(filesRead)],
    models: [...models],
  };
}

function prepareCodexHome(clientHome: string): { codexHome: string; home: string } {
  const codexHome = resolve(clientHome, "codex");
  const home = resolve(clientHome, "home");
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(home, { recursive: true });
  const sourceAuth = resolve(homedir(), ".codex", "auth.json");
  if (existsSync(sourceAuth)) copyFileSync(sourceAuth, resolve(codexHome, "auth.json"));
  return { codexHome, home };
}

export async function runCodexSession(options: AdapterOptions): Promise<AdapterResult> {
  const { codexHome, home } = prepareCodexHome(options.clientHome);
  const env = { ...options.env, HOME: home, CODEX_HOME: codexHome };
  const promptResults: PromptResult[] = [];
  const transcript: AdapterResult["transcript"] = [];
  const reportedModels = new Set<string>();
  let threadId: string | null = null;
  let previousCumulativeTokens: PromptResult["tokens"] | null = null;

  for (let index = 0; index < options.session.prompts.length; index += 1) {
    const prompt = options.session.prompts[index]!;
    const cwd = resolve(options.root, prompt.cwd_rel ?? options.session.initial_cwd_rel);
    const startedAt = new Date().toISOString();
    const args =
      index === 0
        ? [
            "exec",
            "--json",
            "--model",
            options.model,
            "--sandbox",
            "read-only",
            "--cd",
            cwd,
            "--skip-git-repo-check",
            "--ignore-user-config",
            "--ignore-rules",
            "--enable",
            "codex_hooks",
            "-",
          ]
        : [
            "exec",
            "resume",
            "--json",
            "--model",
            options.model,
            "--skip-git-repo-check",
            "--ignore-user-config",
            "--ignore-rules",
            "--enable",
            "codex_hooks",
            threadId!,
            "-",
          ];
    const result = await runCommand({
      command: "codex",
      args,
      cwd,
      env,
      input: prompt.text,
      timeoutMs: options.timeoutMs,
    });
    const analyzed = analyze(result.events);
    const cumulativeTokens = analyzed.tokens;
    analyzed.tokens = tokenDelta(cumulativeTokens, previousCumulativeTokens);
    previousCumulativeTokens = cumulativeTokens;
    if (!threadId) threadId = analyzed.threadId;
    for (const model of analyzed.models) reportedModels.add(model);
    let status: PromptResult["status"] = result.timedOut
      ? "timed_out"
      : result.exitCode === 0
        ? "completed"
        : "failed";
    let errorCode: string | undefined;
    if (status === "completed" && !threadId) {
      status = "invalid";
      errorCode = "codex_thread_id_missing";
    }
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
      hook_events: 0,
      injected_bytes: 0,
      ...(status === "completed"
        ? {}
        : {
            error_code:
              errorCode ?? (result.timedOut ? "client_timeout" : "codex_exit_nonzero"),
            error_message: result.stderr.slice(-4000),
          }),
    });
    transcript.push({
      prompt_id: prompt.id,
      command: ["codex", ...args.slice(0, -1), "<prompt>"],
      cwd,
      stdout: result.stdout,
      stderr: result.stderr,
      events: result.events,
    });
    if (status !== "completed") break;
  }
  return { promptResults, transcript, reportedModels: [...reportedModels] };
}
