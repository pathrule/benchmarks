import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { TIERS, type PromptSpec, type SessionSpec, type TierId } from "../types.js";
import {
  allKnowledgeFacts,
  type CanonicalKnowledgeItem,
  type FixtureDefinition,
  type FixtureManifest,
  type KnowledgeKind,
} from "./types.js";

const GENERATED_AT = "2026-06-12T00:00:00.000Z";

const CORE_ITEMS: CanonicalKnowledgeItem[] = [
  {
    id: "mem-auth-001",
    kind: "memory",
    title: "Authentication session decision",
    body:
      "The session architecture is internally called **Cedarline**. The decision was recorded in **AUTH-271** after the failed rotating-cookie experiment. Browser sessions use a server-held family record; mobile refresh remains separate.",
    node_paths: ["/apps/api/src/auth"],
    relevance: "relevant",
    case_ids: ["auth-recall", "auth-return"],
  },
  {
    id: "mem-auth-002",
    kind: "memory",
    title: "Authentication recovery policy",
    body:
      "Compromised session families enter the **Sundial quarantine** state. Recovery requires revoking the family before issuing a replacement; extending the old family is forbidden.",
    node_paths: ["/apps/api/src/auth"],
    relevance: "relevant",
    case_ids: ["auth-followup"],
  },
  {
    id: "mem-billing-001",
    kind: "memory",
    title: "Billing ledger migration",
    body:
      "The ledger migration is codenamed **Harbor-17**. Its nightly reconciliation job is **invoice-lantern** and discrepancies are escalated to the finance queue rather than repaired inline.",
    node_paths: ["/apps/api/src/billing"],
    relevance: "relevant",
    case_ids: ["billing-switch"],
  },
  {
    id: "mem-worker-001",
    kind: "memory",
    title: "Worker delivery topology",
    body:
      "Cross-region delivery uses the **Quartz Relay** topology. Retry ownership belongs to the worker, while the API records only the durable handoff receipt.",
    node_paths: ["/apps/worker/src/delivery"],
    relevance: "relevant",
    case_ids: ["worker-path-change"],
  },
  {
    id: "rule-billing-001",
    kind: "rule",
    title: "Format ledger values with the project helper",
    body:
      "User-visible ledger amounts MUST use `fmtLedgerValue` from `@acme/ledger-format`. Direct `Intl.NumberFormat`, `toLocaleString`, and currency-symbol concatenation are forbidden by **FIN-19**.",
    node_paths: ["/apps/api/src/billing"],
    priority: "high",
    scope_type: "folder",
    relevance: "relevant",
    case_ids: ["money-rule"],
  },
  {
    id: "skill-billing-001",
    kind: "skill",
    title: "billing-event-review",
    description: "Project checklist for reviewing a billing event handler.",
    body:
      "1. Verify the envelope with `verifyEventSeal`.\n2. Check `event_receipts` by event id and return on duplicates.\n3. Persist the receipt before side effects.\n4. Emit `billing.event.accepted` before returning success.\n5. Route reconciliation failures to the finance queue; never mutate totals inline.",
    node_paths: ["/apps/api/src/billing"],
    relevance: "relevant",
    case_ids: ["billing-procedure"],
  },
  {
    id: "mem-observability-001",
    kind: "memory",
    title: "Observability ownership",
    body:
      "The log sampling initiative is called **Northglass**. Sampling policy is owned by platform observability and must not be overridden inside feature packages.",
    node_paths: ["/packages/observability"],
    relevance: "relevant",
    case_ids: ["discovery"],
  },
];

const HARD_NEGATIVES: CanonicalKnowledgeItem[] = [
  {
    id: "mem-auth-neg-001",
    kind: "memory",
    title: "Authentication device enrollment",
    body:
      "Device enrollment uses the **Cedarbridge** flow recorded in AUTH-217. It applies only to trusted-device registration and says nothing about session-family recovery.",
    node_paths: ["/apps/api/src/auth/devices"],
    relevance: "hard-negative",
    case_ids: [],
  },
  {
    id: "mem-billing-neg-001",
    kind: "memory",
    title: "Billing export migration",
    body:
      "The accounting export rewrite is **Harbor-71** and its batch is `invoice-beacon`. It exports settled rows and is unrelated to ledger reconciliation.",
    node_paths: ["/apps/api/src/billing/exports"],
    relevance: "hard-negative",
    case_ids: [],
  },
  {
    id: "rule-billing-neg-001",
    kind: "rule",
    title: "Format internal CSV decimals",
    body:
      "Internal finance CSV files use `fmtLedgerCsvDecimal`. This helper is for machine exports only and must never format user-visible values.",
    node_paths: ["/apps/api/src/billing/exports"],
    priority: "medium",
    scope_type: "folder",
    relevance: "hard-negative",
    case_ids: [],
  },
  {
    id: "mem-worker-neg-001",
    kind: "memory",
    title: "Worker analytics relay",
    body:
      "Analytics fanout uses the **Quartz Mirror** stream. It is lossy telemetry and must not be confused with durable cross-region delivery.",
    node_paths: ["/apps/worker/src/analytics"],
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

const CODE_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "acme-synthetic-workspace",
      private: true,
      type: "module",
      workspaces: ["apps/*", "packages/*"],
    },
    null,
    2,
  ) + "\n",
  "README.md":
    "# Acme synthetic workspace\n\nThis repository is generated for context-delivery benchmarks.\n",
  "apps/api/src/server.ts":
    "import { registerRoutes } from './routes.js';\n\nexport async function boot() {\n  const app = { ready: false };\n  registerRoutes(app);\n  app.ready = true;\n  return app;\n}\n",
  "apps/api/src/routes.ts":
    "export function registerRoutes(app: { ready: boolean }) {\n  if (app.ready) throw new Error('routes must register before ready');\n}\n",
  "apps/api/src/auth/session.ts":
    "export function rotateSession(familyId: string) {\n  return { familyId, rotatedAt: Date.now() };\n}\n",
  "apps/api/src/auth/recovery.ts":
    "export function revokeFamily(id: string) {\n  return { id, revoked: true };\n}\n",
  "apps/api/src/billing/ledger.ts":
    "export function monthlyLedgerTotal(rows: number[]) {\n  return rows.reduce((sum, value) => sum + value, 0);\n}\n",
  "apps/api/src/billing/events.ts":
    "export async function acceptBillingEvent(eventId: string) {\n  return { eventId, accepted: true };\n}\n",
  "apps/worker/src/delivery/dispatch.ts":
    "export async function dispatch(receiptId: string) {\n  return { receiptId, handedOff: true };\n}\n",
  "apps/worker/src/analytics/fanout.ts":
    "export function fanout(event: unknown) {\n  return { event, durable: false };\n}\n",
  "packages/observability/src/logger.ts":
    "export function childLogger(scope: string) {\n  return { scope, info: console.log };\n}\n",
  "packages/ui/src/Button.tsx":
    "export function Button(props: { label: string }) {\n  return `<button>${props.label}</button>`;\n}\n",
};

function unrelatedItem(index: number, tier: TierId): CanonicalKnowledgeItem {
  const area = AREAS[index % AREAS.length]!;
  const cycle = Math.floor(index / AREAS.length) + 1;
  const kind: KnowledgeKind = index % 11 === 0 ? "skill" : index % 5 === 0 ? "rule" : "memory";
  const code = `${tier.toUpperCase()}-${String(index + 1).padStart(3, "0")}-${area.replaceAll("-", "")}`;
  const path =
    index % 3 === 0
      ? `/apps/${area}/src/feature-${cycle}`
      : `/packages/${area}/src/module-${cycle}`;
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

function promptsForTier(tier: TierId): PromptSpec[] {
  const common: PromptSpec[] = [
    {
      id: "auth-recall",
      text:
        "Bu projede tarayıcı session mimarisinin arkasındaki proje içi kararı ve karar kaydını açıkla. Tahmin etme.",
      cwd_rel: "apps/api/src/auth",
      expected_facts: ["Cedarline", "AUTH-271"],
      response_language: "tr",
    },
    {
      id: "auth-followup",
      text:
        "Aynı session ailesi ele geçirilmiş sayılırsa içeride hangi duruma alınır ve recovery sırası nasıl olmalıdır?",
      cwd_rel: "apps/api/src/auth",
      expected_facts: ["Sundial quarantine", "revoking the family"],
      response_language: "tr",
    },
    {
      id: "billing-switch",
      text:
        "Şimdi billing alanına geç: ledger migration kod adı ve gece çalışan reconciliation işi nedir?",
      cwd_rel: "apps/api/src/billing",
      expected_facts: ["Harbor-17", "invoice-lantern"],
      response_language: "tr",
    },
    {
      id: "worker-path-change",
      text:
        "Worker tarafındaki cross-region durable delivery topolojisinin proje içi adını ve retry sahibini söyle.",
      cwd_rel: "apps/worker/src/delivery",
      expected_facts: ["Quartz Relay"],
      required_actions: ["retry ownership belongs to the worker"],
      response_language: "tr",
    },
    {
      id: "money-rule",
      text:
        "Billing ekranında kullanıcıya ledger tutarı gösterecek kısa bir TypeScript snippet ver. Repo konvansiyonuna uy.",
      cwd_rel: "apps/api/src/billing",
      expected_facts: ["fmtLedgerValue", "FIN-19"],
      forbidden_facts: ["Intl.NumberFormat", "toLocaleString"],
      response_language: "tr",
    },
    {
      id: "billing-procedure",
      text:
        "Yeni billing event handler review edilirken bu projeye özgü zorunlu adımları sırayla yaz.",
      cwd_rel: "apps/api/src/billing",
      expected_facts: ["verifyEventSeal", "event_receipts", "billing.event.accepted"],
      response_language: "tr",
    },
  ];
  if (tier === "easy") return common;
  return [
    ...common,
    {
      id: "code-verification",
      text:
        "Route registration boot akışında hangi fonksiyondan geçiyor ve ready durumundan önce mi sonra mı çağrılıyor? Yalnız gerekli kodu okuyarak doğrula.",
      cwd_rel: "apps/api/src",
      expected_facts: [],
      expected_source_facts: ["registerRoutes", "before ready"],
      required_actions: ["apps/api/src/server.ts", "apps/api/src/routes.ts"],
      response_language: "tr",
    },
    {
      id: "discovery",
      text:
        "Log sampling kararının proje içi adını ve bu ayarın hangi ekip sınırında tutulduğunu bul. Geniş repo taraması yapma.",
      cwd_rel: "packages/observability",
      expected_facts: ["Northglass", "platform observability"],
      response_language: "tr",
    },
    {
      id: "unknown",
      text:
        "Bu projede veritabanı failover tatbikatının gizli kod adı nedir? Kanıt yoksa açıkça bilmediğini söyle.",
      cwd_rel: "apps/api/src",
      expected_facts: [],
      expects_abstention: true,
      response_language: "tr",
    },
    {
      id: "auth-return",
      text:
        "İlk session konusuna dön: mimari adı neydi ve hangi başarısız deneyden sonra kayda geçmişti?",
      cwd_rel: "apps/api/src/auth",
      expected_facts: ["Cedarline", "rotating-cookie"],
      response_language: "tr",
    },
  ];
}

function definition(tier: TierId): FixtureDefinition {
  const targets: Record<TierId, number> = { easy: 16, medium: 56, hard: 168 };
  const base = [...CORE_ITEMS, ...HARD_NEGATIVES];
  const knowledge = [...base];
  for (let index = 0; knowledge.length < targets[tier]; index += 1) {
    knowledge.push(unrelatedItem(index, tier));
  }
  const prompts = promptsForTier(tier);
  const session: SessionSpec = {
    id: `${tier}-world-session`,
    initial_cwd_rel: prompts[0]!.cwd_rel ?? ".",
    prompts,
  };
  const files = { ...CODE_FILES };
  if (tier === "easy") {
    for (const path of Object.keys(files)) {
      if (
        path.includes("observability") ||
        path.includes("ui") ||
        path.includes("routes")
      ) {
        delete files[path];
      }
    }
  }
  if (tier === "hard") {
    for (let index = 0; index < 36; index += 1) {
      const area = AREAS[index % AREAS.length]!;
      files[`packages/${area}/src/module-${index + 1}.ts`] =
        `export const module${index + 1} = { area: ${JSON.stringify(area)}, enabled: true };\n`;
    }
  }
  return { tier, files, knowledge, sessions: [session] };
}

function assertNoContamination(def: FixtureDefinition): void {
  const prompts = def.sessions.flatMap((session) => session.prompts);
  const hiddenFacts = allKnowledgeFacts(prompts);
  const searchable = [
    ...Object.entries(def.files).flatMap(([path, content]) => [path, content]),
    ...prompts.map((prompt) => prompt.text),
  ].join("\n").toLocaleLowerCase("tr");
  const leaked = hiddenFacts.filter((fact) => searchable.includes(fact.toLocaleLowerCase("tr")));
  if (leaked.length > 0) {
    throw new Error(`${def.tier}: hidden knowledge leaked outside corpus: ${leaked.join(", ")}`);
  }
}

function assertPromptDirectoriesExist(def: FixtureDefinition): void {
  const directories = new Set<string>(["."]);
  for (const path of Object.keys(def.files)) {
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

function manifest(def: FixtureDefinition): FixtureManifest {
  const counts = { memory: 0, rule: 0, skill: 0 };
  const relevanceCounts = { relevant: 0, "hard-negative": 0, unrelated: 0 };
  for (const item of def.knowledge) {
    counts[item.kind] += 1;
    relevanceCounts[item.relevance] += 1;
  }
  const dirs = new Set(Object.keys(def.files).map((path) => dirname(path)));
  return {
    schema_version: 1,
    tier: def.tier,
    generated_at: GENERATED_AT,
    knowledge_count: def.knowledge.length,
    counts,
    relevance_counts: relevanceCounts,
    repository_files: Object.keys(def.files).length,
    directory_count: dirs.size,
    prompt_count: def.sessions.reduce((sum, session) => sum + session.prompts.length, 0),
    contamination_passed: true,
  };
}

export function buildFixtures(root: string): FixtureManifest[] {
  const manifests: FixtureManifest[] = [];
  for (const tier of TIERS) {
    const def = definition(tier);
    assertNoContamination(def);
    assertPromptDirectoriesExist(def);
    const tierRoot = join(root, tier);
    rmSync(tierRoot, { recursive: true, force: true });
    for (const [path, content] of Object.entries(def.files)) {
      write(join(tierRoot, "repo", path), content);
    }
    write(
      join(tierRoot, "knowledge", "knowledge.json"),
      JSON.stringify({ schema_version: 1, tier, items: def.knowledge }, null, 2) + "\n",
    );
    write(join(tierRoot, "sessions.json"), JSON.stringify(def.sessions, null, 2) + "\n");
    const output = manifest(def);
    write(join(tierRoot, "manifest.json"), JSON.stringify(output, null, 2) + "\n");
    manifests.push(output);
  }
  return manifests;
}
