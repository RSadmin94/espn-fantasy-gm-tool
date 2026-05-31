/**
 * scripts/sanityCheckPlayers.ts
 * Step 5: Verify specific known players across registry + weekly stats.
 *
 * Checks:
 *   - Josh Allen
 *   - Christian McCaffrey
 *   - Patrick Mahomes
 *   - Justin Jefferson
 *
 * For each player verifies:
 *   - Registry entry exists
 *   - Weekly stats exist
 *   - Seasons match expectations
 *   - Ownership history appears
 *
 * Usage:
 *   npx tsx scripts/sanityCheckPlayers.ts [--league=457622]
 *   npx tsx scripts/sanityCheckPlayers.ts --output=sql
 */

import { getDb } from "../server/db";
import type { AppDb } from "../server/db";
import { gmPlayerRegistry, gmWeeklyPlayerStats } from "../drizzle/schema";
import { eq as eqD, and as andD, sql as drizzleSql, like as likeD, desc as descD } from "drizzle-orm";
import { normalizePlayerName } from "../server/playerStatsTypes";

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);
const LEAGUE_ID = (args.league as string) ?? process.env.LEAGUE_ID ?? "457622";
const OUTPUT_SQL = args.output === "sql";

// ── Known players to check ────────────────────────────────────────────────────
// Each entry has name, position, first/last expected season in league context.
const SANITY_PLAYERS = [
  { fullName: "Josh Allen",          position: "QB",  firstExpected: 2018, lastExpected: 2025, espnIdHint: "3054211" },
  { fullName: "Christian McCaffrey", position: "RB",  firstExpected: 2017, lastExpected: 2025, espnIdHint: "3054211" },
  { fullName: "Patrick Mahomes",     position: "QB",  firstExpected: 2017, lastExpected: 2025, espnIdHint: "3139477" },
  { fullName: "Justin Jefferson",    position: "WR",  firstExpected: 2020, lastExpected: 2025, espnIdHint: "4262921" },
];

// ── Raw SQL for manual DBA use ─────────────────────────────────────────────────
export const SANITY_SQL = SANITY_PLAYERS.map(p => {
  const norm = normalizePlayerName(p.fullName);
  return `-- ── ${p.fullName} ──────────────────────────────────────────────
-- 1. Registry entry
SELECT id, fullName, position, espnPlayerId, currentNflTeam,
       firstSeasonSeen, lastSeasonSeen, isActive, needsReview
FROM gm_player_registry
WHERE normalizedName LIKE '${norm}%' AND position = '${p.position}'
LIMIT 5;

-- 2. Weekly stats count by season
SELECT pr.fullName, wps.season,
       COUNT(*) AS weeks,
       SUM(CASE WHEN wps.isStarter = 1 THEN 1 ELSE 0 END) AS weeks_started,
       ROUND(SUM(wps.pointsScored), 2) AS total_pts,
       ROUND(AVG(wps.pointsScored), 2) AS avg_pts,
       MIN(wps.sourceConfidence) AS min_conf
FROM gm_weekly_player_stats wps
JOIN gm_player_registry pr ON pr.id = wps.playerId
WHERE pr.normalizedName LIKE '${norm}%' AND pr.position = '${p.position}'
GROUP BY pr.fullName, wps.season ORDER BY wps.season ASC;

-- 3. Ownership history
SELECT wps.season, wps.ownerKey,
       COUNT(*) AS weeks_on_roster,
       SUM(CASE WHEN wps.isStarter=1 THEN 1 ELSE 0 END) AS weeks_started
FROM gm_weekly_player_stats wps
JOIN gm_player_registry pr ON pr.id = wps.playerId
WHERE pr.normalizedName LIKE '${norm}%' AND pr.position = '${p.position}'
GROUP BY wps.season, wps.ownerKey ORDER BY wps.season ASC, weeks_on_roster DESC;
`;
}).join("\n");

// ── Runtime check ─────────────────────────────────────────────────────────────

type PlayerSanityResult = {
  playerName:      string;
  position:        string;
  registryFound:   boolean;
  espnIdPresent:   boolean;
  registryId?:     number;
  firstSeason?:    number;
  lastSeason?:     number;
  seasonsCovered:  number[];
  totalWeeklyRows: number;
  totalPts:        number;
  ownerHistory:    Array<{ season: number; ownerKey: string; weeks: number }>;
  warnings:        string[];
};

async function checkPlayer(
  db: AppDb,
  spec: typeof SANITY_PLAYERS[0]
): Promise<PlayerSanityResult> {
  if (!db) throw new Error("No DB");
  const norm = normalizePlayerName(spec.fullName);
  const warnings: string[] = [];

  // 1. Registry lookup
  const regRows = await db
    .select({
      id: gmPlayerRegistry.id,
      espnPlayerId: gmPlayerRegistry.espnPlayerId,
      firstSeasonSeen: gmPlayerRegistry.firstSeasonSeen,
      lastSeasonSeen: gmPlayerRegistry.lastSeasonSeen,
    })
    .from(gmPlayerRegistry)
    .where(andD(
      likeD(gmPlayerRegistry.normalizedName, `${norm}%`),
      eqD(gmPlayerRegistry.position, spec.position),
    ))
    .limit(3);

  const reg = regRows[0];

  if (!reg) {
    return {
      playerName: spec.fullName, position: spec.position,
      registryFound: false, espnIdPresent: false,
      seasonsCovered: [], totalWeeklyRows: 0, totalPts: 0, ownerHistory: [],
      warnings: ["Player not found in gm_player_registry"],
    };
  }

  if (regRows.length > 1) warnings.push(`Multiple registry entries (${regRows.length}) — possible duplicate`);
  if (!reg.espnPlayerId) warnings.push("No ESPN player ID — name-matched only");

  // 2. Weekly stats
  const statsRows = await db
    .select({
      season:       gmWeeklyPlayerStats.season,
      ownerKey:     gmWeeklyPlayerStats.ownerKey,
      pointsScored: gmWeeklyPlayerStats.pointsScored,
      isStarter:    gmWeeklyPlayerStats.isStarter,
    })
    .from(gmWeeklyPlayerStats)
    .where(eqD(gmWeeklyPlayerStats.playerId, reg.id))
    .orderBy(descD(gmWeeklyPlayerStats.season))
    .limit(500);

  const totalPts = statsRows.reduce((s, r) => s + Number(r.pointsScored ?? 0), 0);
  const seasonsCovered = [...new Set(statsRows.map(r => r.season))].sort((a,b)=>a-b);

  // 3. Ownership history
  const ownerBySeason = new Map<string, number>();
  for (const r of statsRows) {
    const key = `${r.season}:${r.ownerKey}`;
    ownerBySeason.set(key, (ownerBySeason.get(key) ?? 0) + 1);
  }
  const ownerHistory = [...ownerBySeason.entries()]
    .map(([k, weeks]) => {
      const [season, ownerKey] = k.split(/:(.+)/);
      return { season: Number(season), ownerKey, weeks };
    })
    .sort((a, b) => a.season - b.season);

  // Warnings
  if (statsRows.length === 0) warnings.push("No weekly stats found — player in registry but no ingested stats");
  if (reg.firstSeasonSeen && reg.firstSeasonSeen > spec.firstExpected) {
    warnings.push(`firstSeasonSeen=${reg.firstSeasonSeen} > expected ${spec.firstExpected} — missing early seasons?`);
  }
  if (ownerHistory.some(o => o.ownerKey.startsWith("team:"))) {
    warnings.push("Some ownership entries use unresolved team: keys");
  }

  return {
    playerName:      spec.fullName,
    position:        spec.position,
    registryFound:   true,
    espnIdPresent:   !!reg.espnPlayerId,
    registryId:      reg.id,
    firstSeason:     reg.firstSeasonSeen ?? undefined,
    lastSeason:      reg.lastSeasonSeen ?? undefined,
    seasonsCovered,
    totalWeeklyRows: statsRows.length,
    totalPts:        Number(totalPts.toFixed(2)),
    ownerHistory,
    warnings,
  };
}

async function run() {
  if (OUTPUT_SQL) {
    console.log("-- ── Sanity check SQL for manual execution ───────────────────\n");
    console.log(SANITY_SQL);
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[sanity] Cannot connect. Use --output=sql to print SQL only.");
    process.exit(1);
  }

  console.log(`\n[sanity] League: ${LEAGUE_ID}`);
  console.log("═".repeat(60));

  for (const spec of SANITY_PLAYERS) {
    console.log(`\n── ${spec.fullName} (${spec.position}) ──`);
    try {
      const r = await checkPlayer(db, spec);

      if (!r.registryFound) {
        console.log("  ✗ NOT in gm_player_registry");
        r.warnings.forEach(w => console.log(`  ⚠ ${w}`));
        continue;
      }

      console.log(`  ✓ Registry ID:        ${r.registryId}`);
      console.log(`  ESPN ID present:      ${r.espnIdPresent ? "✓" : "✗"}`);
      console.log(`  Seasons in registry:  ${r.firstSeason ?? "?"} – ${r.lastSeason ?? "?"}`);
      console.log(`  Seasons w/ stats:     ${r.seasonsCovered.join(", ") || "none"}`);
      console.log(`  Total weekly rows:    ${r.totalWeeklyRows}`);
      console.log(`  Total fantasy pts:    ${r.totalPts.toFixed(2)}`);

      if (r.ownerHistory.length > 0) {
        console.log("  Ownership history:");
        for (const o of r.ownerHistory) {
          console.log(`    ${o.season}: ${o.ownerKey} (${o.weeks} weeks)`);
        }
      } else {
        console.log("  Ownership history:    (none)");
      }

      if (r.warnings.length > 0) {
        console.log("  Warnings:");
        r.warnings.forEach(w => console.log(`    ⚠ ${w}`));
      }
    } catch (err: unknown) {
      console.log(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("\n[sanity] Done.\n");
}

run().catch(err => {
  console.error("[sanity] Fatal:", err);
  process.exit(1);
});
