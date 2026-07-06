/**
 * Large-scale Phase 2a tuning: 135-grid search + 100-run Monte Carlo.
 * League 457622 / season 2026. Caches fixture after first DB load.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";
const SEASON = Number(process.argv[3] ?? "2026");
const FIXTURE_PATH = path.join(ROOT, "scripts", `_mock_fixture_${LEAGUE_ID}.json`);
const REPORT_PATH = path.join(ROOT, "scripts", `_owner_dna_sim_report_${LEAGUE_ID}.json`);

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { getDb } = await import("../server/db.ts");
const { loadMockDraftInputs } = await import("../server/draftWarRoomRouter.ts");
const {
  serializeMockFixture,
  deserializeMockFixture,
  runMockDraftSimulation,
  runTuningGridSearch,
  runMonteCarloSimulation,
} = await import("../server/ownerDraftDnaSimulation.ts");
const { DEFAULT_OWNER_DNA_TUNING, tuningGrid } = await import("../server/ownerDraftDnaTuning.ts");
const { users } = await import("../drizzle/schema.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");

async function loadFixture() {
  if (fs.existsSync(FIXTURE_PATH)) {
    console.log(`Loading cached fixture: ${FIXTURE_PATH}`);
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
    return deserializeMockFixture(raw);
  }

  console.log("Loading mock draft inputs from DB (first run — may take several minutes)...");
  const db = await getDb();
  if (!db) throw new Error("no db");

  let entitled: (typeof users.$inferSelect) | undefined;
  for (const u of await db.select().from(users)) {
    if (await resolvePremiumAccess(u)) {
      entitled = u;
      break;
    }
  }
  if (!entitled?.id) throw new Error("no entitled user");

  const inputs = await loadMockDraftInputs({
    db,
    leagueId: LEAGUE_ID,
    season: SEASON,
    userId: entitled.id,
  });

  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(serializeMockFixture(inputs)));
  console.log(`Wrote fixture (${inputs.playerPool.length} pool players) -> ${FIXTURE_PATH}`);
  return inputs;
}

const inputs = await loadFixture();
const baselinePicks = runMockDraftSimulation(inputs, { disableDna: true });
const defaultReport = runTuningGridSearch(inputs, baselinePicks, [DEFAULT_OWNER_DNA_TUNING])[0]!;

console.log("\n=== Baseline (ADP-only, no DNA) ===");
console.log(`Offense picks: ${baselinePicks.filter((p) => !p.isKeeperSlot && p.position !== "DP").length}`);

console.log("\n=== Current DEFAULT_OWNER_DNA_TUNING ===");
console.log(JSON.stringify(DEFAULT_OWNER_DNA_TUNING, null, 2));
console.log(`Direct DNA nudges: ${defaultReport.report.directDnaNudges}`);
console.log(`League score: ${defaultReport.report.leagueScore.toFixed(4)} lift: ${defaultReport.report.leagueLift.toFixed(4)}`);
console.log(`Composite: ${defaultReport.report.compositeObjective.toFixed(2)}`);
console.log(`Garrett #${defaultReport.report.garrettPick} Warner #${defaultReport.report.warnerPick} DP=${defaultReport.report.dpCount}`);

const grid = tuningGrid();
console.log(`\n=== Grid search (${grid.length} tunings) ===`);
const t0 = Date.now();
const gridResults = runTuningGridSearch(inputs, baselinePicks, grid);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`Completed in ${elapsed}s`);

const best = gridResults[0]!;
const top5 = gridResults.slice(0, 5).map((r) => ({
  composite: r.report.compositeObjective,
  nudges: r.report.directDnaNudges,
  lift: r.report.leagueLift,
  garrett: r.report.garrettPick,
  warner: r.report.warnerPick,
  tuning: {
    closeDecisionGap: r.tuning.closeDecisionGap,
    leagueTendencyDelta: r.tuning.leagueTendencyDelta,
    minProbMargin: r.tuning.minProbMargin,
    inferiorAdpSlots: r.tuning.inferiorAdpSlots,
  },
}));

console.log("\nTop 5 tunings:");
console.log(JSON.stringify(top5, null, 2));

console.log("\n=== Monte Carlo (100 stochastic runs, best tuning) ===");
const mc = runMonteCarloSimulation(inputs, baselinePicks, {
  runs: 100,
  tuning: best.tuning,
  startSeed: 42,
});
console.log(JSON.stringify(mc, null, 2));

const report = {
  leagueId: LEAGUE_ID,
  season: SEASON,
  generatedAt: new Date().toISOString(),
  gridSize: grid.length,
  gridElapsedSec: Number(elapsed),
  currentDefault: {
    tuning: DEFAULT_OWNER_DNA_TUNING,
    report: defaultReport.report,
  },
  bestTuning: {
    tuning: best.tuning,
    report: best.report,
  },
  top5,
  monteCarlo: mc,
  recommendation: best.tuning,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nWrote report -> ${REPORT_PATH}`);

if (best.report.compositeObjective > defaultReport.report.compositeObjective) {
  console.log("\n*** Best tuning beats current default — update ownerDraftDnaTuning.ts DEFAULT_OWNER_DNA_TUNING ***");
  console.log(JSON.stringify(best.tuning, null, 2));
} else {
  console.log("\nCurrent DEFAULT_OWNER_DNA_TUNING remains optimal on composite objective.");
}
