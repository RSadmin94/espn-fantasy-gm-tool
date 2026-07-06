/**
 * Phase 3 — Bruce personality fit runner.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase3.mts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = "457622";

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { getDb } = await import("../server/db.ts");
const { BRUCE_PROFILE_OWNER_KEY, confirmedActiveProfileKeySet } = await import("../server/draftEngine/activeOwners.ts");
const { loadChoiceLedgerInputs } = await import("../server/draftEngine/phase1/loadChoiceLedgerInputs.ts");
const { buildChoiceLedger, choiceRecordsForOwner } = await import("../server/draftEngine/phase1/choiceLedger.ts");
const { loadSeasonTerrainInputs } = await import("../server/draftEngine/phase2/loadSeasonTerrainInputs.ts");
const { buildSeasonTerrain } = await import("../server/draftEngine/phase2/buildSeasonTerrain.ts");
const { buildTerrainLookup, buildChoiceEventsForFit } = await import("../server/draftEngine/phase3/driveFeatures.ts");
const { fitMultinomialLogit } = await import("../server/draftEngine/phase3/discreteChoiceModel.ts");
const { formatPersonalityReadout } = await import("../server/draftEngine/phase3/personalityReadout.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

const { shared, draftRows } = await loadChoiceLedgerInputs({ db, leagueId: LEAGUE_ID });
const ledger = buildChoiceLedger({
  leagueId: LEAGUE_ID,
  draftRows,
  allLeagueTeams: shared.allLeagueTeams,
  activeProfileKeys: confirmedActiveProfileKeySet(),
});

const bruceRecords = choiceRecordsForOwner(ledger, BRUCE_PROFILE_OWNER_KEY);
const seasons = [...new Set(bruceRecords.map((r) => r.season))].sort();

const terrainMap = new Map<number, Awaited<ReturnType<typeof buildSeasonTerrain>>>();
for (const season of seasons) {
  const inputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season });
  terrainMap.set(season, buildSeasonTerrain({ leagueId: LEAGUE_ID, season, ...inputs }));
}

const terrainLookup = buildTerrainLookup(terrainMap);
const events = buildChoiceEventsForFit({ records: bruceRecords, terrainLookup });
const fit = fitMultinomialLogit(events);
const readout = formatPersonalityReadout({
  displayName: "Bruce Edwards",
  fit,
  records: bruceRecords,
  thesisCheckYear: 2023,
});

console.log(readout.text);
console.log("");
console.log(`Thesis holds: ${readout.thesisHolds ? "YES" : "PARTIAL/NO"}`);

const outPath = path.join(ROOT, "scripts", `_draft_engine_phase3_bruce.json`);
fs.writeFileSync(
  outPath,
  JSON.stringify({ fit, thesisHolds: readout.thesisHolds, thesisNotes: readout.thesisNotes }, null, 2),
);
console.log(`Wrote ${outPath}`);
