/** Quick startup + sim profile — writes progress to stdout immediately. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
}

const wall = performance.now();
const log = (msg: string) => console.log(`[+${Math.round(performance.now() - wall)}ms] ${msg}`);

const { getDb } = await import("../server/db.ts");
const { SimTimer } = await import("../server/draftEngine/phase5/simTiming.ts");
const { loadPhase5SimContext } = await import("../server/draftEngine/phase5/loadPhase5SimContext.ts");
const { simulateDraft } = await import("../server/draftEngine/phase5/simulateDraft.ts");

const db = await getDb();
if (!db) throw new Error("no db");

const timer = new SimTimer(true);
log("loading context...");
const ctx = await loadPhase5SimContext({
  db,
  leagueId: "457622",
  season: 2026,
  orderSeason: 2025,
  timer,
});
log(`context ready · pool ${ctx.poolStats.total} (K ${ctx.poolStats.kickers} DP ${ctx.poolStats.defenders})`);
for (const line of timer.formatLines()) log(line);

const simT0 = performance.now();
const result = simulateDraft({
  leagueId: "457622",
  season: 2026,
  terrain: ctx.terrain,
  terrainLookup: ctx.terrainLookup,
  souls: ctx.registry.souls,
  draftOrder: ctx.draftOrder,
  ledger: ctx.ledger,
  rosterRules: ctx.rosterRules,
  playerPool: ctx.playerPool,
  poolHas: ctx.poolHas,
  seed: 457622,
  profile: true,
});
log(`sim done: ${result.picksCompleted}/224 picks in ${Math.round(performance.now() - simT0)}ms`);
if (result.timing) log(result.timing.summary);
log(`total ${Math.round(performance.now() - wall)}ms`);
