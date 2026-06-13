import type { PromptResult, PromptSpec, ScoreResult } from "../types.js";

// Bump whenever the scoring logic changes. Scores are derived at report time
// from the immutable stored transcripts, so a version bump re-scores every cell
// without re-running any model.
export const SCORING_VERSION = 4;

export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    // Keep ' and " so quote-bearing patterns (e.g. the `throw '` / `throw "`
    // string-literal anti-pattern) stay distinguishable from `throw new ...`.
    // Without them v1 collapsed both needles to "throw" and flagged correct
    // `throw new FST_ERR_...` code as a forbidden hit.
    .replace(/[^\p{L}\p{N}._/()'"-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includes(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function isAbstention(response: string): boolean {
  const value = normalize(response);
  return [
    // English
    "i don't know",
    "unknown",
    "insufficient evidence",
    "no evidence",
    "cannot determine",
    // Spanish
    "no lo se",
    "no hay evidencia",
    "no tengo evidencia",
    "no se puede determinar",
    "desconozco",
  ].some((phrase) => value.includes(normalize(phrase)));
}

function languageMatches(response: string, language: PromptSpec["response_language"]): boolean {
  // Spanish-only orthography is a near-certain signal. Check it on the RAW text
  // (normalize() strips these), since code-heavy English answers carry few
  // function words and would otherwise be misclassified by word-count alone.
  const spanishStrong = /[áéíóúñ¿¡]/i.test(response);
  const value = ` ${normalize(response)} `;
  // Function-word markers (normalized form). English set is broad so that even
  // terse, code-heavy English prose still scores.
  const englishSignals = [
    " the ", " and ", " is ", " are ", " to ", " of ", " for ", " with ",
    " which ", " should ", " this ", " that ", " file ", " unknown ",
  ];
  const spanishSignals = [
    " el ", " la ", " los ", " las ", " una ", " de ", " del ", " en ",
    " para ", " con ", " que ", " por ", " se ", " segun ", " debe ",
    " archivo ", " nombre ",
  ];
  const en = englishSignals.filter((signal) => value.includes(signal)).length;
  const es = spanishSignals.filter((signal) => value.includes(signal)).length;
  if (language === "es") return spanishStrong || es > en;
  return !spanishStrong && en >= es;
}

export function scorePrompt(spec: PromptSpec, result: PromptResult): ScoreResult {
  const expected = [...spec.expected_facts, ...(spec.expected_source_facts ?? [])];
  const evidence = [
    result.response_text,
    ...result.files_read,
    ...result.tool_names,
  ].join("\n");
  const forbiddenFacts = (spec.forbidden_facts ?? []).filter((fact) =>
    includes(result.response_text, fact),
  );
  const forbiddenActions = (spec.forbidden_actions ?? []).filter((action) =>
    includes(evidence, action),
  );
  return {
    expected_fact_hits: expected.filter((fact) => includes(result.response_text, fact)).length,
    expected_fact_count: expected.length,
    forbidden_fact_hits: forbiddenFacts,
    required_action_hits: (spec.required_actions ?? []).filter((action) =>
      includes(evidence, action),
    ).length,
    required_action_count: spec.required_actions?.length ?? 0,
    forbidden_action_hits: forbiddenActions,
    abstention_correct: spec.expects_abstention
      ? isAbstention(result.response_text)
      : null,
    response_language_correct: languageMatches(result.response_text, spec.response_language),
  };
}
