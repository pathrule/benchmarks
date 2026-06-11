export const TIERS = ["easy", "medium", "hard"] as const;
export type TierId = (typeof TIERS)[number];

export const CLIENTS = ["claude", "codex"] as const;
export type ClientId = (typeof CLIENTS)[number];

export const HEADLINE_VARIANTS = ["bare", "monolithic", "pathrule-current"] as const;
export const ABLATION_VARIANTS = [
  "pathrule-native",
  "pathrule-navigation",
  "pathrule-full",
] as const;
export const VARIANTS = [...HEADLINE_VARIANTS, ...ABLATION_VARIANTS] as const;
export type VariantId = (typeof VARIANTS)[number];

export type RunStatus =
  | "completed"
  | "failed"
  | "timed_out"
  | "interrupted"
  | "invalid";

export interface SessionSpec {
  id: string;
  initial_cwd_rel: string;
  prompts: PromptSpec[];
}

export interface PromptSpec {
  id: string;
  text: string;
  cwd_rel?: string;
  expected_facts: string[];
  forbidden_facts?: string[];
  required_actions?: string[];
  forbidden_actions?: string[];
  expects_abstention?: boolean;
  response_language: "tr" | "en";
}

export interface SuiteConfig {
  schema_version: 1;
  suite_version: string;
  harness_version: string;
  pathrule_repo: string;
  pathrule_commit: string;
  pathrule_dirty: boolean;
  clients: ClientId[];
  variants: VariantId[];
  tiers: TierId[];
  repetitions: number;
  timeout_ms: number;
  models: Record<ClientId, string>;
  sessions: Partial<Record<TierId, SessionSpec[]>>;
}

export interface CellIdentity {
  suite_version: string;
  source_commit: string;
  tier: TierId;
  session_id: string;
  client: ClientId;
  variant: VariantId;
  repetition: number;
}

export interface CellPlan extends CellIdentity {
  cell_id: string;
  config_hash: string;
  timeout_ms: number;
  model: string;
}

export interface TokenUsage {
  input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_output_tokens: number | null;
  non_cached_tokens: number | null;
  total_tokens: number | null;
}

export interface PromptResult {
  prompt_id: string;
  status: RunStatus;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  response_text: string;
  tokens: TokenUsage;
  tool_calls: number;
  tool_names: string[];
  files_read: string[];
  hook_events: number;
  injected_bytes: number;
  error_code?: string;
  error_message?: string;
}

export interface ScoreResult {
  expected_fact_hits: number;
  expected_fact_count: number;
  forbidden_fact_hits: string[];
  required_action_hits: number;
  required_action_count: number;
  forbidden_action_hits: string[];
  abstention_correct: boolean | null;
  response_language_correct: boolean;
}

export interface RunRecord {
  schema_version: 1;
  cell: CellPlan;
  status: RunStatus;
  started_at: string;
  completed_at: string;
  prompt_results: PromptResult[];
  scores: Record<string, ScoreResult>;
  transcript_path: string | null;
  artifact_hashes: Record<string, string>;
  error_code?: string;
  error_message?: string;
}

export interface ExecutionSelection {
  tiers: TierId[];
  clients: ClientId[];
  variants: VariantId[];
  repetitions: number;
}
