import { resolve } from "node:path";

import { buildPathruleRuntime } from "../harness/runtime/provenance.js";

const index = process.argv.indexOf("--pathrule-repo");
const repo = resolve(index >= 0 ? process.argv[index + 1]! : "../pathrule");
const runtime = buildPathruleRuntime(repo);
console.log(JSON.stringify(runtime, null, 2));
