import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { resolvePathruleRuntime } from "./provenance.js";

const repo = resolve(process.cwd(), "../pathrule");

test(
  "runtime resolves direct source artifacts and never a PATH binary",
  { skip: !existsSync(repo) },
  () => {
    const runtime = resolvePathruleRuntime(repo);
    assert.ok(runtime.cli_entry.startsWith(`${repo}/`));
    assert.ok(runtime.hook_source.startsWith(`${repo}/`));
    assert.equal(runtime.hashes.cli_entry.length, 64);
    assert.equal(runtime.hashes.hook_source.length, 64);
  },
);
