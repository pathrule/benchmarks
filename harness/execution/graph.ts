import { hashObject } from "../hash.js";
import type {
  CellIdentity,
  CellPlan,
  ExecutionSelection,
  SuiteConfig,
  VariantId,
} from "../types.js";

export function cellId(identity: CellIdentity): string {
  return [
    identity.suite_version,
    identity.source_commit,
    identity.tier,
    identity.session_id,
    identity.client,
    identity.variant,
    String(identity.repetition),
  ].join("/");
}

export function buildExecutionGraph(
  config: SuiteConfig,
  selection: ExecutionSelection,
): CellPlan[] {
  const plans: CellPlan[] = [];
  for (const tier of selection.tiers) {
    const sessions = config.sessions[tier] ?? [];
    for (const session of sessions) {
      for (const client of selection.clients) {
        for (const variant of selection.variants) {
          for (let repetition = 0; repetition < selection.repetitions; repetition += 1) {
            const sourceCommit =
              variant === "monolithic" ? "pathrule-independent" : config.pathrule_commit;
            const identity: CellIdentity = {
              suite_version: config.suite_version,
              source_commit: sourceCommit,
              tier,
              session_id: session.id,
              client,
              variant,
              repetition,
            };
            const planWithoutHash = {
              ...identity,
              timeout_ms: config.timeout_ms,
              model: config.models[client],
              harness_version: config.harness_version,
              session,
            };
            plans.push({
              ...identity,
              cell_id: cellId(identity),
              config_hash: hashObject(planWithoutHash),
              timeout_ms: config.timeout_ms,
              model: config.models[client],
            });
          }
        }
      }
    }
  }
  return plans;
}

export function parseRefreshSelectors(raw: string | undefined): string[] {
  return raw
    ? raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

export function matchesRefresh(plan: CellPlan, selectors: string[]): boolean {
  if (selectors.length === 0) return false;
  const fields = [
    plan.cell_id,
    plan.tier,
    plan.session_id,
    plan.client,
    plan.variant satisfies VariantId,
  ];
  return selectors.some((selector) => fields.some((field) => field === selector));
}
