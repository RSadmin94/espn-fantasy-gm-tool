/**
 * scripts/validateIngestion.ts
 * Step 4: Post-ingestion data validation report.
 *
 * Outputs:
 *   - Coverage by season (players, weekly records, %)
 *   - Confidence summary (100 / 95+ / review queue)
 *   - Missing data summary (no ESPN ID, no owner mapping, duplicates)
 *   - Per-season comparison against espn_raw_cache payload count
 *
 * Usage:
 *   npx tsx scripts/validateIngestion.ts [--league=457622] [--season=2024]
 *   npx tsx scripts/validateIngestion.ts --output=sql   (print SQL only)
 */

import { getDb } from "../server/db";
import {
  gmPlayerRegistry,
  gmWeeklyPlayerStats,
  espnRawCache,
} from "../drizzle/schema";
import {
  eq  as eqD,
  sql as drizzleSql,
} from "drizzle-orm";

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);
const LEAGUE_ID    = (args.league  as string) ?? process.env.LEAGUE_ID ?? "457622";
const SEASON_FILTER = args.season  ? Number(args.season) : undefined;
const OUTPUT_SQL   = args.output === "sql";

// ── Validation SQL (printable) ────────────────────────────────────────────────

export const VALIDATION_SQL = {
  seasonCoverage: `
-- Coverage by season: player + stat row counts
SELECT
  wps.season,
  COUNT(DISTINCT wps.playerId) AS unique_players,
  COUNT(*) AS weekly_records,
  COUNT(DISTINCT wps.week) AS weeks_present,
  ROUND(COUNT(*) / (COUNT(DISTINCT wps.week) * COUNT(DISTINCT wps.playerId)) * 100, 1) AS fill_pct,
  SUM(CASE WHEN wps.needsReview = 1 THEN 1 ELSE 0 END) AS needs_review,
  MIN(wps.sourceConfidence) AS min_confidence,
  MAX(wps.sourceConfidence) AS max_confidence,
  ROUND(AVG(wps.sourceConfidence), 1) AS avg_confidence
FROM gm_weekly_player_stats wps
GROUP BY wps.season
ORDER BY wps.season ASC;`,

  confidenceSummary: `
-- Confidence tier distribution
SELECT
  CASE
    WHEN sourceConfidence = 100 THEN '100 (ESPN ID confirmed)'
    WHEN sourceConfidence >= 95 THEN '95-99 (high confidence)'
    WHEN sourceConfidence >= 85 THEN '85-94 (review_high)'
    WHEN sourceConfidence >= 70 THEN '70-84 (review_low)'
    ELSE '<70 (should not exist)'
  END AS confidence_tier,
  COUNT(*) AS row_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) AS pct_of_total
FROM gm_weekly_player_stats
GROUP BY confidence_tier
ORDER BY MIN(sourceConfidence) DESC;`,

  missingEspnId: `
-- Players in registry without an ESPN ID (legacy/name-matched only)
SELECT
  COUNT(*) AS total_players,
  SUM(CASE WHEN espnPlayerId IS NOT NULL THEN 1 ELSE 0 END) AS with_espn_id,
  SUM(CASE WHEN espnPlayerId IS NULL THEN 1 ELSE 0 END) AS without_espn_id,
  SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) AS needs_review
FROM gm_player_registry;`,

  reviewQueue: `
-- Review queue: all records flagged for manual verification
SELECT
  pr.fullName, pr.position, pr.espnPlayerId,
  pr.firstSeasonSeen, pr.lastSeasonSeen,
  pr.reviewReason
FROM gm_player_registry pr
WHERE pr.needsReview = 1
ORDER BY pr.lastSeasonSeen DESC, pr.fullName ASC
LIMIT 100;`,

  duplicateCandidates: `
-- Possible duplicate players: same normalizedName + position, different IDs
SELECT
  normalizedName, position,
  COUNT(*) AS record_count,
  GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') AS registry_ids,
  GROUP_CONCAT(COALESCE(espnPlayerId,'null') ORDER BY id SEPARATOR ', ') AS espn_ids
FROM gm_player_registry
GROUP BY normalizedName, position
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 50;`,

  unknownOwnerKeys: `
-- Stat rows with owner key that looks like a fallback (team: prefix = unresolved)
SELECT
  ownerKey,
  season,
  COUNT(*) AS stat_rows
FROM gm_weekly_player_stats
WHERE ownerKey LIKE 'team:%'
GROUP BY ownerKey, season
ORDER BY season DESC, stat_rows DESC
LIMIT 50;`,

  cacheVsIngested: `
-- Compare espn_raw_cache row count to ingested stat rows per season
SELECT
  c.season,
  c.cache_rows,
  COALESCE(s.stat_rows, 0) AS stat_rows,
  COALESCE(s.unique_players, 0) AS unique_players
FROM (
  SELECT season, COUNT(*) AS cache_rows
  FROM espn_raw_cache WHERE leagueId = ?
  GROUP BY season
) c
LEFT JOIN (
  SELECT season, COUNT(*) AS stat_rows, COUNT(DISTINCT playerId) AS unique_players
  FROM gm_weekly_player_stats
  GROUP BY season
) s ON c.season = s.season
ORDER BY c.season ASC;`,
};

// ── Human-readable report ─────────────────────────────────────────────────────

async function run() {
  if (OUTPUT_SQL) {
    console.log("-- ── Validation SQL for manual execution ─────────────────────\n");
    Object.entries(VALIDATION_SQL).forEach(([name, q]) => {
      console.log(`-- ${name}`);
      console.log(q.trim());
      console.log();
    });
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[validate] Cannot connect. Use --output=sql to print SQL only.");
    process.exit(1);
  }

  console.log(`\n[validate] League: ${LEAGUE_ID}${SEASON_FILTER ? ` | Season: ${SEASON_FILTER}` : ""}`);
  console.log("═".repeat(60));

  // ── 1. Season coverage ──────────────────────────────────────────────────────
  console.log("\n── Coverage by season ──");
  const coverageRows = await db.execute(
    SEASON_FILTER
      ? drizzleSql`SELECT wps.season,
          COUNT(DISTINCT wps.playerId) AS unique_players,
          COUNT(*) AS weekly_records,
          COUNT(DISTINCT wps.week) AS weeks_present,
          SUM(CASE WHEN wps.needsReview = 1 THEN 1 ELSE 0 END) AS needs_review,
          ROUND(AVG(wps.sourceConfidence),1) AS avg_confidence
        FROM gm_weekly_player_stats wps
        WHERE wps.season = ${SEASON_FILTER}
        GROUP BY wps.season`
      : drizzleSql`SELECT wps.season,
          COUNT(DISTINCT wps.playerId) AS unique_players,
          COUNT(*) AS weekly_records,
          COUNT(DISTINCT wps.week) AS weeks_present,
          SUM(CASE WHEN wps.needsReview = 1 THEN 1 ELSE 0 END) AS needs_review,
          ROUND(AVG(wps.sourceConfidence),1) AS avg_confidence
        FROM gm_weekly_player_stats wps
        GROUP BY wps.season ORDER BY wps.season ASC`
  ) as unknown as Array<any>;

  const seasons = ((coverageRows as any)?.[0] as Array<Record<string,unknown>>) ?? [];
  if (seasons.length === 0) {
    console.log("  ⚠ No data in gm_weekly_player_stats. Run ingestion first.");
  } else {
    console.log(`  ${"Season".padEnd(8)} ${"Players".padEnd(10)} ${"Records".padEnd(10)} ${"Weeks".padEnd(8)} ${"Review".padEnd(8)} ${"Conf%"}`);
    console.log("  " + "─".repeat(50));
    for (const r of seasons as any[]) {
      const estCov = r.weeks_present > 0 && r.unique_players > 0
        ? `${Math.round((r.weekly_records / (r.weeks_present * r.unique_players)) * 100)}%`
        : "?";
      console.log(
        `  ${String(r.season).padEnd(8)} ${String(r.unique_players).padEnd(10)} ${String(r.weekly_records).padEnd(10)} ${String(r.weeks_present).padEnd(8)} ${String(r.needs_review).padEnd(8)} ${r.avg_confidence ?? "?"}`
      );
    }
  }

  // ── 2. Confidence summary ───────────────────────────────────────────────────
  console.log("\n── Confidence summary ──");
  const confRows = await db.execute(
    drizzleSql`SELECT
      CASE WHEN sourceConfidence = 100 THEN 'espn_id_confirmed'
           WHEN sourceConfidence >= 95  THEN 'high_confidence'
           WHEN sourceConfidence >= 85  THEN 'review_high'
           ELSE 'review_low_or_skip'
      END AS tier,
      COUNT(*) AS cnt
    FROM gm_weekly_player_stats GROUP BY tier ORDER BY MIN(sourceConfidence) DESC`
  ) as unknown as Array<any>;
  const conf = ((confRows as any)?.[0] as Array<{tier:string;cnt:number}>) ?? [];
  let total = conf.reduce((s, r) => s + Number(r.cnt), 0);
  for (const r of conf) {
    const pct = total > 0 ? ((Number(r.cnt)/total)*100).toFixed(1) : "0.0";
    console.log(`  ${r.tier.padEnd(25)} ${String(r.cnt).padStart(8)} rows  (${pct}%)`);
  }
  console.log(`  ${"TOTAL".padEnd(25)} ${String(total).padStart(8)} rows`);

  // ── 3. Registry summary ─────────────────────────────────────────────────────
  console.log("\n── Player registry ──");
  const regRows = await db.execute(
    drizzleSql`SELECT COUNT(*) AS total,
      SUM(CASE WHEN espnPlayerId IS NOT NULL THEN 1 ELSE 0 END) AS with_espn_id,
      SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) AS needs_review,
      SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS active
    FROM gm_player_registry`
  ) as unknown as Array<any>;
  const reg = ((regRows as any)?.[0] as any)?.[0] ?? {};
  console.log(`  Total players:        ${reg.total ?? 0}`);
  console.log(`  With ESPN ID:         ${reg.with_espn_id ?? 0}`);
  console.log(`  Without ESPN ID:      ${Number(reg.total??0) - Number(reg.with_espn_id??0)}`);
  console.log(`  Active:               ${reg.active ?? 0}`);
  console.log(`  Review queue:         ${reg.needs_review ?? 0}`);

  // ── 4. Missing/unknown owner keys ──────────────────────────────────────────
  console.log("\n── Unknown owner keys (team: prefix = unresolved) ──");
  const ownerRows = await db.execute(
    drizzleSql`SELECT ownerKey, season, COUNT(*) AS cnt
    FROM gm_weekly_player_stats WHERE ownerKey LIKE 'team:%'
    GROUP BY ownerKey, season ORDER BY season DESC, cnt DESC LIMIT 20`
  ) as unknown as Array<any>;
  const unknownOwners = ((ownerRows as any)?.[0] as Array<{ownerKey:string;season:number;cnt:number}>) ?? [];
  if (unknownOwners.length === 0) {
    console.log("  ✓ All owner keys resolved");
  } else {
    for (const r of unknownOwners) {
      console.log(`  ${r.ownerKey.padEnd(20)} season=${r.season} rows=${r.cnt}`);
    }
    console.log(`  → Fix: approve pending owner_aliases or add ownerName to gmTeams`);
  }

  // ── 5. Duplicate candidates ─────────────────────────────────────────────────
  console.log("\n── Duplicate player candidates ──");
  const dupRows = await db.execute(
    drizzleSql`SELECT normalizedName, position, COUNT(*) AS cnt,
      GROUP_CONCAT(id ORDER BY id SEPARATOR ',') AS ids
    FROM gm_player_registry GROUP BY normalizedName, position HAVING COUNT(*) > 1 LIMIT 20`
  ) as unknown as Array<any>;
  const dups = ((dupRows as any)?.[0] as Array<{normalizedName:string;position:string;cnt:number;ids:string}>) ?? [];
  if (dups.length === 0) {
    console.log("  ✓ No duplicate player records found");
  } else {
    for (const d of dups) {
      console.log(`  ⚠ "${d.normalizedName}" (${d.position}): ${d.cnt} records [ids: ${d.ids}]`);
    }
  }

  // ── 6. Cache vs ingested comparison ────────────────────────────────────────
  console.log("\n── Cache vs ingested comparison ──");
  const compRows = await db.execute(
    drizzleSql`SELECT c.season, c.cache_rows,
      COALESCE(s.stat_rows, 0) AS stat_rows,
      COALESCE(s.unique_players, 0) AS unique_players
    FROM (SELECT season, COUNT(*) AS cache_rows FROM espn_raw_cache WHERE leagueId = ${LEAGUE_ID} GROUP BY season) c
    LEFT JOIN (SELECT season, COUNT(*) AS stat_rows, COUNT(DISTINCT playerId) AS unique_players FROM gm_weekly_player_stats GROUP BY season) s
      ON c.season = s.season
    ORDER BY c.season ASC`
  ) as unknown as Array<any>;
  const comp = ((compRows as any)?.[0] as Array<{season:number;cache_rows:number;stat_rows:number;unique_players:number}>) ?? [];
  if (comp.length > 0) {
    console.log(`  ${"Season".padEnd(8)} ${"Cache rows".padEnd(12)} ${"Stat rows".padEnd(12)} ${"Players".padEnd(10)} Status`);
    console.log("  " + "─".repeat(50));
    for (const r of comp) {
      const status = r.stat_rows === 0 ? "⚠ NOT INGESTED" : "✓ ingested";
      console.log(`  ${String(r.season).padEnd(8)} ${String(r.cache_rows).padEnd(12)} ${String(r.stat_rows).padEnd(12)} ${String(r.unique_players).padEnd(10)} ${status}`);
    }
  }

  console.log("\n[validate] Done.\n");
}

run().catch(err => {
  console.error("[validate] Fatal:", err);
  process.exit(1);
});
