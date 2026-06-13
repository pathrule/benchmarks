import { resolve } from "node:path";

import { buildFixtures } from "../harness/fixtures/generator.js";
import {
  ensureRepositoryCheckout,
  loadRepositorySpec,
} from "../harness/fixtures/repository.js";

const root = resolve(process.cwd(), "fixtures");
const spec = loadRepositorySpec(process.cwd());
const checkout = ensureRepositoryCheckout(process.cwd(), spec);
const manifests = buildFixtures(root, checkout, spec);
for (const manifest of manifests) {
  console.log(
    `${manifest.tier}: knowledge=${manifest.knowledge_count} files=${manifest.repository_files} ` +
      `prompts=${manifest.prompt_count} distractors=${manifest.relevance_counts.unrelated + manifest.relevance_counts["hard-negative"]}`,
  );
}
