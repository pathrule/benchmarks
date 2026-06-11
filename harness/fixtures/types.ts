import type { PromptSpec, SessionSpec, TierId } from "../types.js";

export type KnowledgeKind = "memory" | "rule" | "skill";

export interface CanonicalKnowledgeItem {
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  node_paths: string[];
  priority?: "high" | "medium" | "low";
  scope_type?: "project" | "folder" | "file_type";
  description?: string;
  relevance: "relevant" | "hard-negative" | "unrelated";
  case_ids: string[];
}

export interface FixtureManifest {
  schema_version: 1;
  tier: TierId;
  generated_at: string;
  knowledge_count: number;
  counts: Record<KnowledgeKind, number>;
  relevance_counts: Record<CanonicalKnowledgeItem["relevance"], number>;
  repository_files: number;
  directory_count: number;
  prompt_count: number;
  contamination_passed: boolean;
}

export interface FixtureDefinition {
  tier: TierId;
  files: Record<string, string>;
  knowledge: CanonicalKnowledgeItem[];
  sessions: SessionSpec[];
}

export function allKnowledgeFacts(prompts: PromptSpec[]): string[] {
  return prompts.flatMap((prompt) => prompt.expected_facts);
}
