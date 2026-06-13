import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildReports } from "../harness/reporting/report.js";

const benchRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rows = buildReports(benchRoot);
console.log(`Wrote benchmark reports for ${rows.length} aggregate rows.`);
