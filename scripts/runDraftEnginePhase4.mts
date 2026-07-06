/**
 * Phase 4 — fit all active souls + Gate 4 readouts + before/after separation check.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase4.mts
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
const { CONFIRMED_ACTIVE_OWNERS, confirmedActiveProfileKeySet } = await import(
  "../server/draftEngine/activeOwners.ts"
);
const { loadChoiceLedgerInputs } = await import("../server/draftEngine/phase1/loadChoiceLedgerInputs.ts");
const { buildChoiceLedger, choiceRecordsForOwner } = await import("../server/draftEngine/phase1/choiceLedger.ts");
const { loadSeasonTerrainInputs } = await import("../server/draftEngine/phase2/loadSeasonTerrainInputs.ts");
const { buildSeasonTerrain } = await import("../server/draftEngine/phase2/buildSeasonTerrain.ts");
const { buildTerrainLookup, buildChoiceEventsForFit, DRIVE_NAMES } = await import(
  "../server/draftEngine/phase3/driveFeatures.ts"
);
const { fitMultinomialLogit } = await import("../server/draftEngine/phase3/discreteChoiceModel.ts");
const { fitAllActiveSouls } = await import("../server/draftEngine/phase4/fitAllSouls.ts");
const { formatGate4Readouts, formatBeforeAfterSpread } = await import(
  "../server/draftEngine/phase4/soulReadout.ts"
);
const { spreadScore } = await import("../server/draftEngine/phase4/personalityDeviations.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

console.log("Loading ledger and terrain (league 457622)...");
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

function legacyClusterLabel(coefficients: Record<string, number>): string {
  const rb = coefficients.rbEarlyRound + coefficients.rbEarlyLegacyEra;
  const wr = coefficients.wrEarlyRound + coefficients.wrEarlyModernEra;
  if (coefficients.need > 0.45 && coefficients.value < 0.1) return "Roster-Architect";
  if (rb > wr + 0.15) return "RB-First Builder";
  if (wr > rb + 0.15) return "WR-Value Patient";
  return "Balanced Drafter";
}

function topDrive(coefficients: Record<string, number>): string {
  return [...DRIVE_NAMES]
    .map((d) => ({ d, c: Math.abs(coefficients[d] ?? 0) }))
    .sort((a, b) => b.c - a.c)[0]!.d;
}

console.log("Building before (legacy unregularized) snapshot...");
const legacyFits: Array<{ displayName: string; coefficients: Record<string, number> }> = [];
for (const owner of CONFIRMED_ACTIVE_OWNERS) {
  const records = choiceRecordsForOwner(ledger, owner.profileOwnerKey);
  if (!records.length) continue;
  const events = buildChoiceEventsForFit({ records, terrainLookup });
  const fit = fitMultinomialLogit(events, 400);
  legacyFits.push({ displayName: owner.displayName, coefficients: fit.coefficients });
}

const beforeRows = legacyFits.map((f) => ({
  displayName: f.displayName,
  clusterLabel: legacyClusterLabel(f.coefficients),
  topDrive: topDrive(f.coefficients),
  needCoef: f.coefficients.need,
}));
const spreadBefore = {
  uniqueLabels: new Set(beforeRows.map((b) => b.clusterLabel)).size,
  meanNeed: beforeRows.reduce((s, b) => s + b.needCoef, 0) / beforeRows.length,
};

console.log(`Fitting ${confirmedActiveProfileKeySet().size} active souls (tuned)...`);
const registry = fitAllActiveSouls({ leagueId: LEAGUE_ID, ledger, terrainLookup });

const afterRows = registry.souls.map((s) => ({
  displayName: s.displayName,
  archetype: s.distinctiveArchetype,
  topDrive: s.distinctiveDrives[0]?.drive ?? "—",
  needCoef: s.coefficients.need,
}));
const spreadAfter = spreadScore(
  registry.souls.map((s) => ({ deviation: s.deviationCoefficients, archetype: s.distinctiveArchetype })),
);

console.log(
  formatBeforeAfterSpread({
    before: beforeRows,
    after: afterRows,
    spreadBefore,
    spreadAfter: {
      uniqueArchetypes: spreadAfter.uniqueArchetypes,
      meanAbsDeviation: spreadAfter.meanAbsDeviation,
    },
  }),
);
console.log("");
console.log(formatGate4Readouts(registry.souls));

const outJson = path.join(ROOT, "scripts", `_draft_engine_phase4_${LEAGUE_ID}.json`);
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      separation: { spreadBefore, spreadAfter },
      clusters: registry.clusters.map((c) => ({
        id: c.id,
        label: c.label,
        members: c.memberKeys.length,
      })),
      souls: registry.souls.map((s) => ({
        displayName: s.displayName,
        personalityFitTier: s.personalityFitTier,
        choiceEventCount: s.choiceEventCount,
        distinctiveArchetype: s.distinctiveArchetype,
        clusterLabel: s.clusterLabel,
        distinctiveDrives: s.distinctiveDrives,
        avgChosenProbability: s.avgChosenProbability,
        shrinkage: s.shrinkage,
        coefficients: s.coefficients,
        deviationCoefficients: s.deviationCoefficients,
      })),
      legacyBefore: beforeRows,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${outJson}`);
