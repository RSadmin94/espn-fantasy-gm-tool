/**
 * Phase 0 — readiness report runner (read-only).
 * Usage: tsx scripts/runDraftEnginePhase0.mts [leagueId]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { getDb } = await import("../server/db.ts");
const { loadOwnerProfileSharedData } = await import("../server/ownerProfileService.ts");
const { buildLeagueReadinessReport, formatReadinessTable } = await import("../server/draftEngine/phase0/readiness.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection (DATABASE_URL missing?)");
  process.exit(1);
}

const shared = await loadOwnerProfileSharedData({ db, leagueId: LEAGUE_ID });
const report = buildLeagueReadinessReport({ leagueId: LEAGUE_ID, shared });

console.log(formatReadinessTable(report));
console.log("");

const outJson = path.join(ROOT, "scripts", `_draft_engine_phase0_${LEAGUE_ID}.json`);
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log(`Wrote ${outJson}`);
