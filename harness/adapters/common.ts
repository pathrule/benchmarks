import { spawn } from "node:child_process";

import type { TokenUsage } from "../types.js";

export interface CommandResult {
  events: Record<string, unknown>[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export const EMPTY_TOKENS: TokenUsage = {
  input_tokens: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  cached_input_tokens: null,
  output_tokens: null,
  reasoning_output_tokens: null,
  non_cached_tokens: null,
  total_tokens: null,
};

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function claudeTokens(usage: Record<string, unknown> | undefined): TokenUsage {
  if (!usage) return { ...EMPTY_TOKENS };
  const input = numberOrNull(usage.input_tokens);
  const cacheCreation = numberOrNull(usage.cache_creation_input_tokens);
  const cacheRead = numberOrNull(usage.cache_read_input_tokens);
  const output = numberOrNull(usage.output_tokens);
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    cached_input_tokens: null,
    output_tokens: output,
    reasoning_output_tokens: null,
    non_cached_tokens:
      input !== null && cacheCreation !== null && output !== null
        ? input + cacheCreation + output
        : null,
    total_tokens:
      input !== null && cacheCreation !== null && cacheRead !== null && output !== null
        ? input + cacheCreation + cacheRead + output
        : null,
  };
}

export function codexTokens(usage: Record<string, unknown> | undefined): TokenUsage {
  if (!usage) return { ...EMPTY_TOKENS };
  const input = numberOrNull(usage.input_tokens);
  const cached = numberOrNull(usage.cached_input_tokens);
  const output = numberOrNull(usage.output_tokens);
  const reasoning = numberOrNull(usage.reasoning_output_tokens);
  return {
    input_tokens: input,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cached_input_tokens: cached,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    non_cached_tokens:
      input !== null && cached !== null && output !== null
        ? input - cached + output + (reasoning ?? 0)
        : null,
    total_tokens:
      input !== null && output !== null ? input + output + (reasoning ?? 0) : null,
  };
}

export function tokenDelta(current: TokenUsage, previous: TokenUsage | null): TokenUsage {
  if (!previous) return current;
  return Object.fromEntries(
    Object.entries(current).map(([key, value]) => {
      const before = previous[key as keyof TokenUsage];
      return [key, value !== null && before !== null ? Math.max(0, value - before) : value];
    }),
  ) as unknown as TokenUsage;
}

export function parseJsonLines(stdout: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const value: unknown = JSON.parse(trimmed);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        events.push(value as Record<string, unknown>);
      }
    } catch {
      // Keep raw stdout in the transcript; transport noise is not an event.
    }
  }
  return events;
}

export function runCommand(options: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs: number;
}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        child.kill("SIGKILL");
      }
    }, options.timeoutMs);
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({
        events: parseJsonLines(stdout),
        stdout,
        stderr,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

export function eventModel(event: Record<string, unknown>): string | null {
  for (const key of ["model", "model_name"]) {
    if (typeof event[key] === "string") return event[key];
  }
  const message = event.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    const model = (message as Record<string, unknown>).model;
    if (typeof model === "string") return model;
  }
  return null;
}

export function stringFields(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return ["file_path", "path", "cwd"]
    .map((key) => record[key])
    .filter((item): item is string => typeof item === "string");
}
