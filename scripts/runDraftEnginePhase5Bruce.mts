/**
 * Phase 5 partial gate — simulate one draft, show Bruce's team only.
 * Usage: pnpm exec tsx scripts/runDraftEnginePhase5Bruce.mts
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
const { loadPhase5SimContext } = await import("../server/draftEngine/phase5/loadPhase5SimContext.ts");
const { simulateDraft } = await import("../server/draftEngine/phase5/simulateDraft.ts");
const { formatBrucePartialGate } = await import("../server/draftEngine/phase5/formatBruceGate5.ts");

const db = await getDb();
if (!db) {
  console.error("No database connection");
  process.exit(1);
}

console.log("Phase 5 (partial) — loading souls, terrain, ESPN pool, draft order...");
const ctx = await loadPhase5SimContext({
  db,
  leagueId: LEAGUE_ID,
  season: SIM_SEASON,
  orderSeason: ORDER_SEASON,
  userId: process.env.PHASE5_ESPN_USER_ID ? Number(process.env.PHASE5_ESPN_USER_ID) : undefined,
});

console.log(`Draft order (${ctx.draftOrder.length} seats): ${ctx.draftOrder.map((d) => d.displayName).join(", ")}`);
console.log(
  `Pool: ${ctx.poolStats.total} players (terrain ${ctx.poolStats.skillFromTerrain} + ESPN skill ${ctx.poolStats.skillFromEspn} · K ${ctx.poolStats.kickers} · DP ${ctx.poolStats.defenders}) · seed ${SEED}`,
);

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
});

console.log(formatBrucePartialGate(result));

const outJson = path.join(ROOT, "scripts", `_draft_engine_phase5_bruce_${LEAGUE_ID}.json`);
fs.writeFileSync(
  outJson,
  JSON.stringify(
    {
      seed: SEED,
      season: SIM_SEASON,
      draftOrder: ctx.draftOrder.map((d) => d.displayName),
      poolStats: ctx.poolStats,
      bruceRosterLegality: result.bruceRosterLegality,
      rosterRules: {
        starters: result.rosterRules.starters,
        source: result.rosterRules.source,
      },
      brucePicks: result.brucePicks.map((p) => ({
        round: p.round,
        overallPick: p.overallPick,
        player: p.chosen.playerName,
        position: p.chosen.position,
        adp: p.chosen.adp,
        takenOver: p.moment?.takenOver,
        winningDrive: p.moment?.winningDrive,
        winningDriveLabel: p.moment?.winningDriveLabel,
        pickProbability: p.moment?.pickProbability,
        forcedSlotFill: p.moment?.forcedSlotFill,
        scoreDebug: p.round === 2 || p.round === 3 ? p.moment?.scoreDebug : undefined,
        consideration: p.moment?.consideration.map((c) => c.playerName),
      })),
    },
    null,
    2,
  ),
);
console.log(`Wrote ${outJson}`);
