import assert from "node:assert/strict";
import test from "node:test";

import type { PromptResult, PromptSpec } from "../types.js";
import { normalize, scorePrompt } from "./score.js";
import { EMPTY_TOKENS, tokenDelta } from "../adapters/common.js";

function result(response: string): PromptResult {
  return {
    prompt_id: "p",
    status: "completed",
    started_at: "2026-06-12T00:00:00.000Z",
    completed_at: "2026-06-12T00:00:01.000Z",
    duration_ms: 1000,
    response_text: response,
    tokens: EMPTY_TOKENS,
    tool_calls: 1,
    tool_names: ["Read"],
    files_read: ["lib/route.js"],
    hook_events: 0,
    injected_bytes: 0,
  };
}

test("normalization is case and diacritic insensitive", () => {
  assert.equal(normalize("SEGÚN!"), "segun");
});

test("scoring combines response facts and structured file evidence", () => {
  const spec: PromptSpec = {
    id: "p",
    text: "question",
    expected_facts: ["Cedarline"],
    required_actions: ["lib/route.js"],
    response_language: "en",
  };
  const score = scorePrompt(spec, result("The Cedarline decision is applied in this file."));
  assert.equal(score.expected_fact_hits, 1);
  assert.equal(score.required_action_hits, 1);
  assert.equal(score.response_language_correct, true);
});

test("language detection separates English and Spanish responses", () => {
  const enSpec: PromptSpec = { id: "p", text: "question", expected_facts: [], response_language: "en" };
  const esSpec: PromptSpec = { ...enSpec, response_language: "es" };
  const english = "The architecture name is Cedarline and it should be read from the file.";
  const spanish = "El nombre de la arquitectura es Cedarline según el archivo del equipo.";
  assert.equal(scorePrompt(enSpec, result(english)).response_language_correct, true);
  assert.equal(scorePrompt(esSpec, result(spanish)).response_language_correct, true);
  assert.equal(scorePrompt(enSpec, result(spanish)).response_language_correct, false);
  assert.equal(scorePrompt(esSpec, result(english)).response_language_correct, false);
});

test("quote-bearing forbidden patterns survive normalization (v2 regression)", () => {
  const spec: PromptSpec = {
    id: "p",
    text: "question",
    expected_facts: [],
    forbidden_facts: ["throw '", 'throw "'],
    response_language: "en",
  };
  // Correct repo-convention code must NOT trip the forbidden check.
  assert.deepEqual(
    scorePrompt(spec, result("throw new FST_ERR_ROUTE_FROZEN(path)")).forbidden_fact_hits,
    [],
  );
  // The actual string-literal anti-pattern is still caught.
  assert.deepEqual(scorePrompt(spec, result("throw 'route frozen'")).forbidden_fact_hits, [
    "throw '",
  ]);
});

test("unknown cases require explicit abstention", () => {
  const en: PromptSpec = {
    id: "p",
    text: "question",
    expected_facts: [],
    expects_abstention: true,
    response_language: "en",
  };
  const es: PromptSpec = { ...en, response_language: "es" };
  assert.equal(scorePrompt(en, result("There is no evidence; I don't know.")).abstention_correct, true);
  assert.equal(scorePrompt(es, result("No hay evidencia; no lo sé.")).abstention_correct, true);
  assert.equal(scorePrompt(en, result("The codename is probably Falcon.")).abstention_correct, false);
});

test("cumulative client usage is converted to per-turn deltas", () => {
  const first = {
    ...EMPTY_TOKENS,
    input_tokens: 100,
    cached_input_tokens: 80,
    output_tokens: 20,
    non_cached_tokens: 40,
    total_tokens: 120,
  };
  const second = {
    ...EMPTY_TOKENS,
    input_tokens: 260,
    cached_input_tokens: 210,
    output_tokens: 50,
    non_cached_tokens: 100,
    total_tokens: 310,
  };
  assert.deepEqual(tokenDelta(second, first), {
    ...EMPTY_TOKENS,
    input_tokens: 160,
    cached_input_tokens: 130,
    output_tokens: 30,
    non_cached_tokens: 60,
    total_tokens: 190,
  });
});
