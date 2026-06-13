import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { materializeVariant } from "../harness/runtime/materialize.js";
import { resolvePathruleRuntime } from "../harness/runtime/provenance.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const benchRoot = process.cwd();
const pathruleRepo = resolve(arg("--pathrule-repo") ?? "../pathrule");
const runtime = resolvePathruleRuntime(pathruleRepo);
const temp = mkdtempSync(join(tmpdir(), "pathrule-benchmark-materialize-"));
const outputs = [];
for (const client of ["claude", "codex"] as const) {
  const output = await materializeVariant({
    benchRoot,
    runtime,
    tier: "hard",
    client,
    variant: "pathrule-current",
    destination: join(temp, client, "fastify"),
    runtimeHome: join(temp, client, "runtime"),
  });
  outputs.push({
    client,
    root: output.root,
    workspace_id: output.workspace_id,
    artifact_hashes: output.artifacts,
  });
}
console.log(JSON.stringify(outputs, null, 2));
