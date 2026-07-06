/**
 * Phase 5 full gate — 14-team draft transcript.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase5Full.mts
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = "457622";
const SIM_SEASON = 2026;
const ORDER_SEASON = 2025;
const SEED = 457622;

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
const { resolveDraftOrderFromLedger, poolFromTerrain } = await import("../server/draftEngine/phase5/loadSimDraftSetup.ts");
const { loadLeagueRosterRules } = await import("../server/draftEngine/phase5/loadLeagueRosterRules.ts");
const { simulateDraft } = await import("../server/draftEngine/phase5/simulateDraft.ts");
const { augmentPoolWithRosterFillers } = await import("../server/draftEngine/phase5/rosterConstruction.ts");
const { formatFullDraftGate, formatFullDraftJson } = await import("../server/draftEngine/phase5/formatFullDraftGate5.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

console.log("Phase 5 (FULL) — loading souls, terrain, 14-team draft...");
const { shared, draftRows } = await loadChoiceLedgerInputs({ db, leagueId: LEAGUE_ID });
const ledger = buildChoiceLedger({
  leagueId: LEAGUE_ID,
  draftRows,
  allLeagueTeams: shared.allLeagueTeams,
  activeProfileKeys: confirmedActiveProfileKeySet(),
});

let terrainInputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season: SIM_SEASON });
let terrain = buildSeasonTerrain({
  leagueId: LEAGUE_ID,
  season: SIM_SEASON,
  ...terrainInputs,
  teamCount: 14,
});

let mergedPicks: Awaited<ReturnType<typeof loadSeasonTerrainInputs>>["draftPicks"] = [];
const poolSeasons = [ORDER_SEASON, ORDER_SEASON - 1, ORDER_SEASON - 2];
const seen = new Set<string>();
for (const s of poolSeasons) {
  const inp = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season: s });
  for (const p of inp.draftPicks) {
    const key = `${p.playerName}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    mergedPicks.push({ ...p, season: SIM_SEASON });
  }
}

if (poolFromTerrain(terrain).length < 180) {
  console.log(`Building sim pool from ${ORDER_SEASON} draft universe + ${SIM_SEASON} value signals.`);
  const priorInputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season: ORDER_SEASON });
  const simPriorInputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season: SIM_SEASON });
  terrain = buildSeasonTerrain({
    leagueId: LEAGUE_ID,
    season: SIM_SEASON,
    draftPicks: mergedPicks.length > 80 ? mergedPicks : priorInputs.draftPicks.map((p) => ({ ...p, season: SIM_SEASON })),
    priorSeasonPoints: simPriorInputs.priorSeasonPoints.length
      ? simPriorInputs.priorSeasonPoints
      : priorInputs.priorSeasonPoints,
    playerCache: priorInputs.playerCache.length ? priorInputs.playerCache : simPriorInputs.playerCache,
    teamCount: 14,
  });
}

const skillPool = poolFromTerrain(terrain);
const { pool: augmentedPool } = augmentPoolWithRosterFillers({ skillPool, draftPicks: mergedPicks });

const rosterRules = await loadLeagueRosterRules({ db, leagueId: LEAGUE_ID, season: SIM_SEASON });

const seasons = [...new Set(draftRows.map((r) => r.season))].sort();
const terrainMap = new Map<number, ReturnType<typeof buildSeasonTerrain>>();
for (const season of seasons) {
  const inputs = await loadSeasonTerrainInputs({ db, leagueId: LEAGUE_ID, season });
  terrainMap.set(season, buildSeasonTerrain({ leagueId: LEAGUE_ID, season, ...inputs }));
}
const terrainLookup = buildTerrainLookup(terrainMap);

const registry = fitAllActiveSouls({ leagueId: LEAGUE_ID, ledger, terrainLookup });
const draftOrder = resolveDraftOrderFromLedger({ ledger, orderSeason: ORDER_SEASON });

console.log(`Simulating ${draftOrder.length} teams · skill pool ${skillPool.length} · augmented ${augmentedPool.length} · seed ${SEED}`);

const result = simulateDraft({
  leagueId: LEAGUE_ID,
  season: SIM_SEASON,
  terrain,
  souls: registry.souls,
  draftOrder,
  ledger,
  rosterRules,
  fillerDraftPicks: mergedPicks,
  rounds: 16,
  seed: SEED,
});

const transcript = formatFullDraftGate({
  result,
  souls: registry.souls,
  skillPoolSize: skillPool.length,
  augmentedPoolSize: augmentedPool.length,
});

console.log(transcript);

const outTxt = path.join(ROOT, "scripts", `_draft_engine_phase5_full_${LEAGUE_ID}.txt`);
const outJson = path.join(ROOT, "scripts", `_draft_engine_phase5_full_${LEAGUE_ID}.json`);
fs.writeFileSync(outTxt, transcript);
fs.writeFileSync(
  outJson,
  JSON.stringify(
    formatFullDraftJson({
      result,
      souls: registry.souls,
      draftOrder: draftOrder.map((d) => d.displayName),
      skillPoolSize: skillPool.length,
      augmentedPoolSize: augmentedPool.length,
    }),
    null,
    2,
  ),
);
console.log(`\nWrote ${outTxt}`);
console.log(`Wrote ${outJson}`);
