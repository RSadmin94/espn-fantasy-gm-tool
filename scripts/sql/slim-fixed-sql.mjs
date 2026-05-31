/**
 * Post-process import_draft_history_2010_2025_FIXED.sql (slim rawPick JSON).
 * Usage: node scripts/sql/slim-fixed-sql.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { slimRawPickJsonInSqlString } from "./draftPickSqlSlim.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "import_draft_history_2010_2025_FIXED.sql");
const s = fs.readFileSync(p, "utf8");
const out = slimRawPickJsonInSqlString(s);
fs.writeFileSync(p, out, "utf8");
const legacy = path.join(__dirname, "import_draft_history_2010_2025.sql");
if (fs.existsSync(legacy)) {
  fs.writeFileSync(legacy, out, "utf8");
}
if (out.includes('"overallPickNumber"') || out.includes('"roundPickNumber"') || out.includes('"proTeam"')) {
  throw new Error(
    "slim-fixed-sql: rawPick still contained duplicate keys (overallPickNumber / roundPickNumber / proTeam). Check draftPickSqlSlim.mjs.",
  );
}
console.error("Slimmed ->", p);
