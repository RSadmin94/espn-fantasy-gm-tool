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

const wallT0 = performance.now();
const { getDb } = await import("../server/db.ts");
const { loadPhase5SimContext } = await import("../server/draftEngine/phase5/loadPhase5SimContext.ts");
const { simulateDraft } = await import("../server/draftEngine/phase5/simulateDraft.ts");
const { formatFullDraftGate, formatFullDraftJson } = await import("../server/draftEngine/phase5/formatFullDraftGate5.ts");
const { SimTimer } = await import("../server/draftEngine/phase5/simTiming.ts");
const { CONFIRMED_ACTIVE_OWNERS } = await import("../server/draftEngine/activeOwners.ts");
const { assessRosterLegality, addToRoster, emptyRosterCounts } = await import("../server/draftEngine/phase5/rosterConstruction.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

const timer = new SimTimer(true);
console.log("Phase 5 (FULL) — loading souls, terrain, ESPN pool, 14-team draft...");
const ctx = await loadPhase5SimContext({
  db,
  leagueId: LEAGUE_ID,
  season: SIM_SEASON,
  orderSeason: ORDER_SEASON,
  userId: process.env.PHASE5_ESPN_USER_ID ? Number(process.env.PHASE5_ESPN_USER_ID) : undefined,
  timer,
});

console.log(
  `Pool: ${ctx.poolStats.total} players (terrain skill ${ctx.poolStats.skillFromTerrain} + ESPN skill ${ctx.poolStats.skillFromEspn} · K ${ctx.poolStats.kickers} · DP ${ctx.poolStats.defenders}) · seed ${SEED}`,
);

const simT0 = performance.now();
const result = simulateDraft({
  leagueId: LEAGUE_ID,
  season: SIM_SEASON,
  terrain: ctx.terrain,
  terrainLookup: ctx.terrainLookup,
  souls: ctx.registry.souls,
  draftOrder: ctx.draftOrder,
  ledger: ctx.ledger,
  rosterRules: ctx.rosterRules,
  playerPool: ctx.playerPool,
  poolHas: ctx.poolHas,
  rounds: 16,
  seed: SEED,
  profile: true,
});
const simMs = Math.round(performance.now() - simT0);

const transcript = formatFullDraftGate({
  result,
  souls: ctx.registry.souls,
  skillPoolSize: ctx.skillPoolSize,
  augmentedPoolSize: ctx.playerPool.length,
  poolStats: ctx.poolStats,
});

console.log(transcript);
console.log("");
console.log("── RUNTIME ──");
console.log(`  Sim loop: ${simMs}ms (${result.picksCompleted} picks)`);
console.log(`  Total script: ${Math.round(performance.now() - wallT0)}ms`);
if (result.timing) {
  for (const line of timer.formatLines()) console.log(line);
  for (const b of result.timing.buckets) {
    console.log(`  ${b.label}: ${b.ms}ms (${b.count} calls)`);
  }
}

const sampleOwner = CONFIRMED_ACTIVE_OWNERS.find((o) => o.displayName === "Bruce Edwards")!;
let sampleRoster = emptyRosterCounts();
for (const p of result.picks.filter((x) => x.chooserProfileKey === sampleOwner.profileOwnerKey)) {
  sampleRoster = addToRoster(sampleRoster, p.chosen);
}
const sampleLeg = assessRosterLegality({ roster: sampleRoster, rules: ctx.rosterRules, poolHas: ctx.poolHas });
const sampleK = result.picks.find((p) => p.chooserProfileKey === sampleOwner.profileOwnerKey && p.chosen.position === "K");
const sampleDp = result.picks.find((p) => p.chooserProfileKey === sampleOwner.profileOwnerKey && p.chosen.position === "DP");
console.log("");
console.log("── SAMPLE LEGAL ROSTER (Bruce Edwards) ──");
console.log(`  ${sampleLeg.honestSummary}`);
if (sampleK) console.log(`  K: ${sampleK.chosen.playerName} (ADP ${sampleK.chosen.adp ?? "n/a"})`);
if (sampleDp) console.log(`  DP: ${sampleDp.chosen.playerName} (ADP ${sampleDp.chosen.adp ?? "n/a"})`);

const outTxt = path.join(ROOT, "scripts", `_draft_engine_phase5_full_${LEAGUE_ID}.txt`);
const outJson = path.join(ROOT, "scripts", `_draft_engine_phase5_full_${LEAGUE_ID}.json`);
fs.writeFileSync(outTxt, transcript);
fs.writeFileSync(
  outJson,
  JSON.stringify(
    formatFullDraftJson({
      result,
      souls: ctx.registry.souls,
      draftOrder: ctx.draftOrder.map((d) => d.displayName),
      skillPoolSize: ctx.skillPoolSize,
      augmentedPoolSize: ctx.playerPool.length,
      poolStats: ctx.poolStats,
      runtimeMs: { total: Math.round(performance.now() - wallT0), simLoop: simMs },
    }),
    null,
    2,
  ),
);
console.log(`\nWrote ${outTxt}`);
console.log(`Wrote ${outJson}`);
