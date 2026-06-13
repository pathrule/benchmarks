import type { PromptResult, SessionSpec } from "../types.js";

export interface AdapterOptions {
  root: string;
  clientHome: string;
  model: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
  session: SessionSpec;
}

export interface TurnTranscript {
  prompt_id: string;
  command: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  events: Record<string, unknown>[];
}

export interface AdapterResult {
  promptResults: PromptResult[];
  transcript: TurnTranscript[];
  reportedModels: string[];
}
