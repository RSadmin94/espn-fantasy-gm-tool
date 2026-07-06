/**
 * Phase 4.5 — fit souls + build decision-rule profiles + GATE 4.5 readouts.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase4_5.mts
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
const { confirmedActiveProfileKeySet } = await import("../server/draftEngine/activeOwners.ts");
const { loadChoiceLedgerInputs } = await import("../server/draftEngine/phase1/loadChoiceLedgerInputs.ts");
const { buildChoiceLedger } = await import("../server/draftEngine/phase1/choiceLedger.ts");
const { loadSeasonTerrainInputs } = await import("../server/draftEngine/phase2/loadSeasonTerrainInputs.ts");
const { buildSeasonTerrain } = await import("../server/draftEngine/phase2/buildSeasonTerrain.ts");
const { buildTerrainLookup } = await import("../server/draftEngine/phase3/driveFeatures.ts");
const { fitAllActiveSouls } = await import("../server/draftEngine/phase4/fitAllSouls.ts");
const { buildAllDecisionProfiles } = await import("../server/draftEngine/phase4_5/decisionRules.ts");
const { formatGate45Readouts } = await import("../server/draftEngine/phase4_5/formatGate45.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

console.log("Phase 4.5 — loading ledger + terrain (league 457622)...");
const { shared, draftRows } = await loadChoiceLedgerInputs({ db, leagueId: LEAGUE_ID });
const ledger = buildChoiceLedger({
  leagueId: LEAGUE_ID,
  draftRows,
  allLeagueTeams: shared.allLeagueTeams,
  activeProfileKeys: confirmedActiveProfileKeySet(),
});

const seasons = [...new Set(draftRows.map((r) => r.season))].sort();
const terrainMap = new Map<number, Awaited<ReturnType<typeof buildSeasonTerrain>>>();
for (const season of seasons) {
  const inputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season });
  terrainMap.set(season, buildSeasonTerrain({ leagueId: LEAGUE_ID, season, ...inputs }));
}
const terrainLookup = buildTerrainLookup(terrainMap);

console.log("Fitting souls (coefficients unchanged) + translating to decision rules...");
const registry = fitAllActiveSouls({ leagueId: LEAGUE_ID, ledger, terrainLookup });
const profiles = buildAllDecisionProfiles(registry.souls);

console.log(formatGate45Readouts(profiles));

const outJson = path.join(ROOT, "scripts", `_draft_engine_phase4_5_${LEAGUE_ID}.json`);
fs.writeFileSync(
  outJson,
  JSON.stringify(
    profiles.map((p) => ({
      displayName: p.displayName,
      personalityFitTier: p.personalityFitTier,
      provisionalNote: p.provisionalNote,
      rules: p.rules,
      exceptions: p.exceptions,
      ruleModifiers: p.ruleModifiers,
      eras: p.eras,
      stability: p.stability,
      overallStability: p.overallStability,
      choiceEventCount: p.choiceEventCount,
      avgChosenProbability: p.avgChosenProbability,
    })),
    null,
    2,
  ),
);
console.log(`Wrote ${outJson}`);
