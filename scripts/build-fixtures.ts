import { resolve } from "node:path";

import { buildFixtures } from "../harness/fixtures/generator.js";

const root = resolve(process.cwd(), "fixtures");
const manifests = buildFixtures(root);
for (const manifest of manifests) {
  console.log(
    `${manifest.tier}: knowledge=${manifest.knowledge_count} files=${manifest.repository_files} ` +
      `prompts=${manifest.prompt_count} distractors=${manifest.relevance_counts.unrelated + manifest.relevance_counts["hard-negative"]}`,
  );
}
