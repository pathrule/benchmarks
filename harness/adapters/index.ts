import type { ClientId } from "../types.js";
import { runClaudeSession } from "./claude.js";
import { runCodexSession } from "./codex.js";
import type { AdapterOptions, AdapterResult } from "./types.js";

export function runClientSession(
  client: ClientId,
  options: AdapterOptions,
): Promise<AdapterResult> {
  return client === "claude" ? runClaudeSession(options) : runCodexSession(options);
}
