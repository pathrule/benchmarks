import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { TIERS, type PromptSpec, type SessionSpec, type TierId } from "../types.js";
import {
  allKnowledgeFacts,
  type CanonicalKnowledgeItem,
  type FixtureDefinition,
  type FixtureManifest,
  type KnowledgeKind,
} from "./types.js";
import {
  loadRepositorySpec,
  repositoryFileList,
  type RepositorySpec,
} from "./repository.js";

const GENERATED_AT = "2026-06-12T00:00:00.000Z";

const CORE_ITEMS: CanonicalKnowledgeItem[] = [
  {
    id: "mem-auth-001",
    kind: "memory",
    title: "Route compilation decision",
    body:
      "The route compilation architecture is internally called **Cedarline**. The decision was recorded in **FAST-271** after the failed mutable-router experiment. Routes become immutable once boot starts.",
    node_paths: ["/lib/route.js"],
    relevance: "relevant",
    case_ids: ["auth-recall", "auth-return"],
  },
  {
    id: "mem-auth-002",
    kind: "memory",
    title: "Hook timeout recovery policy",
    body:
      "A timed-out lifecycle hook enters the **Sundial quarantine** path. Recovery must preserve the original hook name and append timeout context before the error is propagated.",
    node_paths: ["/lib/hooks.js"],
    relevance: "relevant",
    case_ids: ["auth-followup"],
  },
  {
    id: "mem-billing-001",
    kind: "memory",
    title: "Reply serialization migration",
    body:
      "The reply serialization migration is codenamed **Harbor-17**. Its compatibility verifier is **payload-lantern** and mismatches must surface through Fastify errors rather than silent coercion.",
    node_paths: ["/lib/reply.js"],
    relevance: "relevant",
    case_ids: ["billing-switch"],
  },
  {
    id: "mem-worker-001",
    kind: "memory",
    title: "Validation compiler topology",
    body:
      "Validation and serialization compiler ownership uses the **Quartz Relay** topology. Schema compilation belongs to the route setup phase, while request handling consumes the compiled functions.",
    node_paths: ["/lib/validation.js", "/lib/route.js"],
    relevance: "relevant",
    case_ids: ["worker-path-change"],
  },
  {
    id: "rule-billing-001",
    kind: "rule",
    title: "Create framework errors through the canonical module",
    body:
      "New framework errors MUST be declared through `createError` in `lib/errors.js` and consumed as named `FST_ERR_*` constructors. Throwing anonymous string errors is forbidden by **ERR-19**.",
    node_paths: ["/lib"],
    priority: "high",
    scope_type: "folder",
    relevance: "relevant",
    case_ids: ["money-rule"],
  },
  {
    id: "skill-billing-001",
    kind: "skill",
    title: "route-change-review",
    description: "Project checklist for reviewing Fastify route lifecycle changes.",
    body:
      "Checklist marker: **ROUTE-REVIEW-7**.\n1. Confirm registration still calls `throwIfAlreadyStarted`.\n2. Preserve `onRoute` hook execution before router insertion.\n3. Verify validation and serialization compilers are prepared during route setup.\n4. Add focused coverage under `test/route.1.test.js` or `test/route-hooks.test.js`.\n5. Use `inject()` for behavior tests unless the change specifically concerns listening sockets.",
    node_paths: ["/lib/route.js", "/test"],
    relevance: "relevant",
    case_ids: ["billing-procedure"],
  },
  {
    id: "mem-observability-001",
    kind: "memory",
    title: "Logger ownership",
    body:
      "The child logger compatibility initiative is called **Northglass**. Logger construction is owned by `lib/logger-factory.js`; request or reply modules must not instantiate pino directly.",
    node_paths: ["/lib/logger-factory.js", "/lib/logger-pino.js"],
    relevance: "relevant",
    case_ids: ["discovery"],
  },
];

const HARD_NEGATIVES: CanonicalKnowledgeItem[] = [
  {
    id: "mem-auth-neg-001",
    kind: "memory",
    title: "Route constraint registration",
    body:
      "Constraint registration uses the **Cedarbridge** flow recorded in FAST-217. It applies only to router constraints and says nothing about route compilation immutability.",
    node_paths: ["/lib/route.js"],
    relevance: "hard-negative",
    case_ids: [],
  },
  {
    id: "mem-billing-neg-001",
    kind: "memory",
    title: "Reply trailer migration",
    body:
      "The reply trailer rewrite is **Harbor-71** and its verifier is `payload-beacon`. It concerns trailers and is unrelated to serialization compiler ownership.",
    node_paths: ["/lib/reply.js"],
    relevance: "hard-negative",
    case_ids: [],
  },
  {
    id: "rule-billing-neg-001",
    kind: "rule",
    title: "Validate trailer names",
    body:
      "Reply trailers use the existing trailer validation path. This rule is unrelated to declaring new framework error constructors.",
    node_paths: ["/lib/reply.js"],
    priority: "medium",
    scope_type: "folder",
    relevance: "hard-negative",
    case_ids: [],
  },
  {
    id: "mem-worker-neg-001",
    kind: "memory",
    title: "Schema response normalization",
    body:
      "Response schema normalization uses the **Quartz Mirror** path. It must not be confused with validation compiler ownership during route setup.",
    node_paths: ["/lib/validation.js"],
    relevance: "hard-negative",
    case_ids: [],
  },
];

const AREAS = [
  "search",
  "notifications",
  "files",
  "analytics",
  "admin",
  "mobile",
  "web",
  "design-system",
  "feature-flags",
  "support",
  "compliance",
  "imports",
  "exports",
  "reporting",
  "experiments",
  "localization",
  "onboarding",
  "audit",
  "scheduler",
  "catalog",
  "recommendations",
  "profiles",
  "teams",
  "invitations",
];

function unrelatedItem(index: number, tier: TierId): CanonicalKnowledgeItem {
  const area = AREAS[index % AREAS.length]!;
  const cycle = Math.floor(index / AREAS.length) + 1;
  const kind: KnowledgeKind = index % 11 === 0 ? "skill" : index % 5 === 0 ? "rule" : "memory";
  const code = `${tier.toUpperCase()}-${String(index + 1).padStart(3, "0")}-${area.replaceAll("-", "")}`;
  const path =
    index % 3 === 0
      ? `/test/${area}/case-${cycle}.test.js`
      : `/lib/${area}/module-${cycle}.js`;
  if (kind === "rule") {
    return {
      id: `rule-${tier}-${index}`,
      kind,
      title: `${area} boundary rule ${cycle}`,
      body:
        `Within ${path}, public adapters must pass through \`guard${code}\` before emitting state. ` +
        `This convention is tracked by **${code}** and does not apply outside this area.`,
      node_paths: [path],
      priority: index % 2 === 0 ? "medium" : "low",
      scope_type: "folder",
      relevance: "unrelated",
      case_ids: [],
    };
  }
  if (kind === "skill") {
    return {
      id: `skill-${tier}-${index}`,
      kind,
      title: `${area}-release-check-${cycle}`,
      description: `Release checklist for ${area} module ${cycle}.`,
      body:
        `1. Run \`check${code}\`.\n2. Compare the ${area} snapshot.\n3. Record marker **${code}**.\n4. Notify the owning ${area} channel.`,
      node_paths: [path],
      relevance: "unrelated",
      case_ids: [],
    };
  }
  return {
    id: `mem-${tier}-${index}`,
    kind,
    title: `${area} decision record ${cycle}`,
    body:
      `The ${area} team's module ${cycle} is internally named **${code}**. ` +
      `Its maintenance window and ownership are local to ${path}; this record is unrelated to auth, billing, delivery, and logging.`,
    node_paths: [path],
    relevance: "unrelated",
    case_ids: [],
  };
}

const PROMPTS: PromptSpec[] = [
  {
    id: "auth-recall",
    text: "Explain the team's internal name for Fastify's route compilation architecture and its decision record. Do not guess.",
    cwd_rel: "lib",
    expected_facts: ["Cedarline", "FAST-271"],
    knowledge_only_facts: ["Cedarline", "FAST-271"],
    response_language: "en",
  },
  {
    id: "auth-followup",
    text: "If a lifecycle hook times out, what is the team's internal name for the recovery path, and which two pieces of information must be preserved when the error is propagated?",
    cwd_rel: "lib",
    expected_facts: ["Sundial quarantine", "original hook name", "timeout context"],
    knowledge_only_facts: ["Sundial quarantine"],
    response_language: "en",
  },
  {
    id: "billing-switch",
    text: "Now switch to the reply area: what is the serialization migration codename and its compatibility verifier?",
    cwd_rel: "lib",
    expected_facts: ["Harbor-17", "payload-lantern"],
    knowledge_only_facts: ["Harbor-17", "payload-lantern"],
    response_language: "en",
  },
  {
    id: "worker-path-change",
    text: "Give the team's internal name for the validation compiler topology and state which phase schema compilation belongs to.",
    cwd_rel: "lib",
    expected_facts: ["Quartz Relay"],
    knowledge_only_facts: ["Quartz Relay"],
    required_actions: ["route setup"],
    response_language: "en",
  },
  {
    id: "money-rule",
    text: "Give a short CommonJS snippet to add a new framework error to Fastify core. Follow the repo convention.",
    cwd_rel: "lib",
    expected_facts: ["createError", "FST_ERR_", "ERR-19"],
    knowledge_only_facts: ["ERR-19"],
    forbidden_facts: ["throw '", "throw \""],
    response_language: "en",
  },
  {
    id: "billing-procedure",
    text: "List, in order, the project-specific mandatory steps when a Fastify route lifecycle change is reviewed.",
    cwd_rel: "lib",
    expected_facts: ["ROUTE-REVIEW-7", "throwIfAlreadyStarted", "onRoute", "inject()"],
    knowledge_only_facts: ["ROUTE-REVIEW-7"],
    response_language: "en",
  },
  {
    id: "code-verification",
    text: "Which router library does Fastify route registration use, and which function checks for an already-started instance when adding a new route? Verify by reading only the necessary code.",
    cwd_rel: "lib",
    expected_facts: [],
    expected_source_facts: ["find-my-way", "throwIfAlreadyStarted"],
    required_actions: ["lib/route.js"],
    response_language: "en",
  },
  {
    id: "discovery",
    text: "Find the team's internal name for the child logger compatibility decision and which file owns logger construction. Do not do a broad repo scan.",
    cwd_rel: "lib",
    expected_facts: ["Northglass", "lib/logger-factory.js"],
    knowledge_only_facts: ["Northglass"],
    response_language: "en",
  },
  {
    id: "unknown",
    text: "What is the secret codename of the HTTP/3 migration program in this Fastify workspace? If there is no evidence, clearly say you don't know.",
    cwd_rel: "lib",
    expected_facts: [],
    expects_abstention: true,
    response_language: "en",
  },
  {
    id: "auth-return",
    text: "Return to the first route compilation topic: what was the architecture name and after which failed experiment was it recorded?",
    cwd_rel: "lib",
    expected_facts: ["Cedarline", "mutable-router"],
    knowledge_only_facts: ["Cedarline", "mutable-router"],
    response_language: "en",
  },
];

function definition(tier: TierId): FixtureDefinition {
  const targets: Record<TierId, number> = { hard: 168 };
  const base = [...CORE_ITEMS, ...HARD_NEGATIVES];
  const knowledge = [...base];
  for (let index = 0; knowledge.length < targets[tier]; index += 1) {
    knowledge.push(unrelatedItem(index, tier));
  }
  const prompts = structuredClone(PROMPTS);
  const sessions: SessionSpec[] = [
    { id: "world-en", initial_cwd_rel: prompts[0]!.cwd_rel ?? ".", prompts },
  ];
  return { tier, knowledge, sessions };
}

function assertNoContamination(
  def: FixtureDefinition,
  repositoryRoot: string,
  repositoryFiles: string[],
): void {
  const prompts = def.sessions.flatMap((session) => session.prompts);
  const hiddenFacts = allKnowledgeFacts(prompts);
  const searchable = [
    ...repositoryFiles.flatMap((path) => {
      const absolute = join(repositoryRoot, path);
      try {
        return [path, readFileSync(absolute, "utf8")];
      } catch {
        return [path];
      }
    }),
    ...prompts.map((prompt) => prompt.text),
  ].join("\n").toLowerCase();
  const leaked = hiddenFacts.filter((fact) => searchable.includes(fact.toLowerCase()));
  if (leaked.length > 0) {
    throw new Error(`${def.tier}: hidden knowledge leaked outside corpus: ${leaked.join(", ")}`);
  }
}

function assertPromptDirectoriesExist(def: FixtureDefinition, repositoryFiles: string[]): void {
  const directories = new Set<string>(["."]);
  for (const path of repositoryFiles) {
    let current = dirname(path);
    while (current !== "." && !directories.has(current)) {
      directories.add(current);
      current = dirname(current);
    }
  }
  const missing = def.sessions
    .flatMap((session) => session.prompts)
    .map((prompt) => prompt.cwd_rel ?? ".")
    .filter((cwd) => !directories.has(cwd));
  if (missing.length > 0) {
    throw new Error(`${def.tier}: prompt cwd does not exist: ${[...new Set(missing)].join(", ")}`);
  }
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function manifest(
  def: FixtureDefinition,
  repositorySpec: RepositorySpec,
  repositoryFiles: string[],
): FixtureManifest {
  const counts = { memory: 0, rule: 0, skill: 0 };
  const relevanceCounts = { relevant: 0, "hard-negative": 0, unrelated: 0 };
  for (const item of def.knowledge) {
    counts[item.kind] += 1;
    relevanceCounts[item.relevance] += 1;
  }
  const dirs = new Set(repositoryFiles.map((path) => dirname(path)));
  return {
    schema_version: 1,
    tier: def.tier,
    generated_at: GENERATED_AT,
    repository_name: repositorySpec.name,
    repository_commit: repositorySpec.commit,
    knowledge_count: def.knowledge.length,
    counts,
    relevance_counts: relevanceCounts,
    repository_files: repositoryFiles.length,
    directory_count: dirs.size,
    prompt_count: def.sessions.reduce((sum, session) => sum + session.prompts.length, 0),
    contamination_passed: true,
  };
}

export function buildFixtures(
  root: string,
  repositoryRoot: string,
  repositorySpec = loadRepositorySpec(dirname(root)),
): FixtureManifest[] {
  const manifests: FixtureManifest[] = [];
  const repositoryFiles = repositoryFileList(repositoryRoot);
  for (const tier of TIERS) {
    const def = definition(tier);
    assertNoContamination(def, repositoryRoot, repositoryFiles);
    assertPromptDirectoriesExist(def, repositoryFiles);
    const tierRoot = join(root, tier);
    rmSync(tierRoot, { recursive: true, force: true });
    write(
      join(tierRoot, "knowledge", "knowledge.json"),
      JSON.stringify({ schema_version: 1, tier, items: def.knowledge }, null, 2) + "\n",
    );
    write(join(tierRoot, "sessions.json"), JSON.stringify(def.sessions, null, 2) + "\n");
    const output = manifest(def, repositorySpec, repositoryFiles);
    write(join(tierRoot, "manifest.json"), JSON.stringify(output, null, 2) + "\n");
    manifests.push(output);
  }
  return manifests;
}
