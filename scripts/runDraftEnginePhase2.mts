/**
 * Phase 2 — season terrain report.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase2.mts [leagueId] [season]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";
const SEASON = Number(process.argv[3] ?? "2024");

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { getDb } = await import("../server/db.ts");
const { loadSeasonTerrainInputs } = await import("../server/draftEngine/phase2/loadSeasonTerrainInputs.ts");
const { buildSeasonTerrain, formatTerrainTable } = await import("../server/draftEngine/phase2/buildSeasonTerrain.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

const inputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season: SEASON });
const terrain = buildSeasonTerrain({
  leagueId: LEAGUE_ID,
  season: SEASON,
  ...inputs,
});

console.log(formatTerrainTable(terrain, 40));

const outJson = path.join(ROOT, "scripts", `_draft_engine_phase2_${LEAGUE_ID}_${SEASON}.json`);
fs.writeFileSync(outJson, JSON.stringify({ top40: terrain.cards.slice(0, 40), dataGaps: terrain.dataGaps }, null, 2));
console.log(`\nWrote ${outJson}`);
