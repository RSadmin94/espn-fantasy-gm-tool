/**
 * Writes scripts/draft-data/2010.json (14-team snake, 16 rounds = 224 picks).
 * Run from repo root: node scripts/draft-data/emit-2010-json.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build2010DraftDocument } from "./build2010DraftDocument.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = build2010DraftDocument();
const dest = join(__dirname, "2010.json");
writeFileSync(dest, JSON.stringify(out, null, 2), "utf8");
console.log(`Wrote ${out.picks.length} picks to ${dest}`);
