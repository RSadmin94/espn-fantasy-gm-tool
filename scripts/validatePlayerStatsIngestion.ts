/**
 * scripts/validatePlayerStatsIngestion.ts
 * Post-ingestion validation report for gm_player_registry + gm_weekly_player_stats.
 *
 * Outputs:
 *   - Total players in gm_player_registry
 *   - Total rows in gm_weekly_player_stats
 *   - Rows by season
 *   - Rows by week within a season
 *   - Players needing review
 *   - Missing owner mappings (unresolved "team:" prefix)
 *   - Skipped/review records
 *   - espn_raw_cache coverage vs ingested data
 *
 * Usage:
 *   npx tsx scripts/validatePlayerStatsIngestion.ts
 *   npx tsx scripts/validatePlayerStatsIngestion.ts --season=2024
 *   npx tsx scripts/validatePlayerStatsIngestion.ts --output=sql
 */

import "dotenv/config";
import { sql as drizzleSql, eq as eqD } from "drizzle-orm";
import { getDbConn } from "../server/espnPersistence";

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);

const LEAGUE_ID    = (args.league as string)  ?? process.env.LEAGUE_ID ?? "457622";
const SEASON_FILTER = args.season ? Number(args.season) : undefined;
const OUTPUT_SQL   = args.output === "sql";

// ── SQL printable for DBA use ──────────────────────────────────────────────────

const SQL = {
  registrySummary: `
SELECT
  COUNT(*) AS total_players,
  SUM(CASE WHEN espnPlayerId IS NOT NULL THEN 1 ELSE 0 END) AS with_espn_id,
  SUM(CASE WHEN espnPlayerId IS NULL THEN 1 ELSE 0 END) AS without_espn_id,
  SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) AS needs_review,
  SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS is_active,
  COUNT(DISTINCT position) AS distinct_positions
FROM gm_player_registry;`,

  statsBySeason: `
SELECT
  season,
  COUNT(*) AS total_rows,
  COUNT(DISTINCT playerId) AS unique_players,
  COUNT(DISTINCT week) AS distinct_weeks,
  COUNT(DISTINCT ownerKey) AS distinct_owners,
  SUM(CASE WHEN isStarter = 1 THEN 1 ELSE 0 END) AS starter_rows,
  SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) AS review_rows,
  ROUND(AVG(sourceConfidence), 1) AS avg_confidence,
  ROUND(SUM(pointsScored), 2) AS total_pts
FROM gm_weekly_player_stats
GROUP BY season
ORDER BY season ASC;`,

  statsByWeek: `
-- Replace :season with target season
SELECT
  week,
  COUNT(*) AS rows,
  COUNT(DISTINCT playerId) AS players,
  COUNT(DISTINCT ownerKey) AS owners,
  ROUND(SUM(pointsScored), 2) AS total_pts
FROM gm_weekly_player_stats
WHERE season = :season
GROUP BY week
ORDER BY week ASC;`,

  missingOwners: `
SELECT ownerKey, season, COUNT(*) AS rows
FROM gm_weekly_player_stats
WHERE ownerKey LIKE 'team:%'
GROUP BY ownerKey, season
ORDER BY season DESC, rows DESC
LIMIT 30;`,

  reviewQueue: `
SELECT id, fullName, position, espnPlayerId, firstSeasonSeen, lastSeasonSeen, reviewReason
FROM gm_player_registry
WHERE needsReview = 1
ORDER BY lastSeasonSeen DESC, fullName ASC
LIMIT 50;`,

  cacheVsIngested: `
SELECT
  c.season,
  SUM(CASE WHEN c.viewName LIKE 'playerStats:%' THEN 1 ELSE 0 END) AS player_stat_cache_rows,
  COALESCE(s.stat_rows, 0) AS ingested_stat_rows,
  COALESCE(s.unique_players, 0) AS ingested_players
FROM espn_raw_cache c
LEFT JOIN (
  SELECT season, COUNT(*) AS stat_rows, COUNT(DISTINCT playerId) AS unique_players
  FROM gm_weekly_player_stats
  GROUP BY season
) s ON c.season = s.season
WHERE c.leagueId = '457622'
GROUP BY c.season
ORDER BY c.season ASC;`,

  topPlayersBySeason: `
-- Top 10 scorers from gm_weekly_player_stats for a given season
SELECT pr.fullName, pr.position, wps.season,
  COUNT(*) AS weeks,
  SUM(wps.pointsScored) AS total_pts,
  ROUND(AVG(wps.pointsScored), 2) AS avg_per_week
FROM gm_weekly_player_stats wps
JOIN gm_player_registry pr ON pr.id = wps.playerId
WHERE wps.season = :season AND wps.isStarter = 1
GROUP BY pr.id, pr.fullName, pr.position, wps.season
ORDER BY total_pts DESC
LIMIT 10;`,
};

// ── Runtime report ─────────────────────────────────────────────────────────────

async function run() {
  if (OUTPUT_SQL) {
    console.log("-- ── Validation SQL ──────────────────────────────────────────\n");
    for (const [name, q] of Object.entries(SQL)) {
      console.log(`-- ${name}`);
      console.log(q.trim());
      console.log();
    }
    return;
  }

  const db = await getDbConn();
  if (!db) {
    console.error("[validate] Cannot connect. Use --output=sql to print SQL only.");
    process.exit(1);
  }

  console.log(`\n[validate] League: ${LEAGUE_ID}${SEASON_FILTER ? ` | Season: ${SEASON_FILTER}` : ""}`);
  console.log("═".repeat(65));

  // ── 1. Registry summary ─────────────────────────────────────────────────────
  console.log("\n── gm_player_registry ──");
  const [regRaw] = await db.execute(
    drizzleSql`SELECT COUNT(*) AS total,
      SUM(CASE WHEN espnPlayerId IS NOT NULL THEN 1 ELSE 0 END) AS with_id,
      SUM(CASE WHEN needsReview = 1 THEN 1 ELSE 0 END) AS review,
      SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) AS active,
      COUNT(DISTINCT position) AS positions
    FROM gm_player_registry`
  ) as unknown as Array<any>;
  const reg = ((regRaw as any)?.[0] as any) ?? {};
  console.log(`  Total players:        ${reg.total       ?? 0}`);
  console.log(`  With ESPN ID:         ${reg.with_id     ?? 0}`);
  console.log(`  Without ESPN ID:      ${Number(reg.total??0) - Number(reg.with_id??0)}`);
  console.log(`  Active:               ${reg.active      ?? 0}`);
  console.log(`  Needing review:       ${reg.review      ?? 0}`);
  console.log(`  Distinct positions:   ${reg.positions   ?? 0}`);

  if (Number(reg.total ?? 0) === 0) {
    console.log("\n  ⚠ No players in registry. Run pnpm player:ingest first.");
  }

  // ── 2. Stats total ──────────────────────────────────────────────────────────
  console.log("\n── gm_weekly_player_stats ──");
  const [statsTotalRaw] = await db.execute(
    drizzleSql`SELECT COUNT(*) AS total, COUNT(DISTINCT season) AS seasons,
      COUNT(DISTINCT playerId) AS players, COUNT(DISTINCT ownerKey) AS owners
    FROM gm_weekly_player_stats`
  ) as unknown as Array<any>;
  const st = ((statsTotalRaw as any)?.[0] as any) ?? {};
  console.log(`  Total rows:           ${st.total   ?? 0}`);
  console.log(`  Distinct seasons:     ${st.seasons ?? 0}`);
  console.log(`  Distinct players:     ${st.players ?? 0}`);
  console.log(`  Distinct owners:      ${st.owners  ?? 0}`);

  if (Number(st.total ?? 0) === 0) {
    console.log("\n  ⚠ No stat rows. Run pnpm player:fetch then pnpm player:ingest.");
    return;
  }

  // ── 3. By season ────────────────────────────────────────────────────────────
  console.log("\n── Rows by season ──");
  const [seasonRaw] = await db.execute(
    SEASON_FILTER
      ? drizzleSql`SELECT season, COUNT(*) AS rows,
          COUNT(DISTINCT playerId) AS players,
          COUNT(DISTINCT week) AS weeks,
          SUM(CASE WHEN needsReview=1 THEN 1 ELSE 0 END) AS review,
          ROUND(AVG(sourceConfidence),1) AS avg_conf
        FROM gm_weekly_player_stats WHERE season = ${SEASON_FILTER} GROUP BY season`
      : drizzleSql`SELECT season, COUNT(*) AS rows,
          COUNT(DISTINCT playerId) AS players,
          COUNT(DISTINCT week) AS weeks,
          SUM(CASE WHEN needsReview=1 THEN 1 ELSE 0 END) AS review,
          ROUND(AVG(sourceConfidence),1) AS avg_conf
        FROM gm_weekly_player_stats GROUP BY season ORDER BY season ASC`
  ) as unknown as Array<any>;

  const seasons = (seasonRaw as any)?.[0] as Array<Record<string,unknown>> ?? [];
  if (seasons.length > 0) {
    console.log(`  ${"Season".padEnd(8)} ${"Rows".padEnd(8)} ${"Players".padEnd(10)} ${"Weeks".padEnd(8)} ${"Review".padEnd(8)} Conf%`);
    console.log("  " + "─".repeat(50));
    for (const r of seasons as any[]) {
      console.log(`  ${String(r.season).padEnd(8)} ${String(r.rows).padEnd(8)} ${String(r.players).padEnd(10)} ${String(r.weeks).padEnd(8)} ${String(r.review).padEnd(8)} ${r.avg_conf ?? "?"}`);
    }
  }

  // ── 4. By week (if season filter) ───────────────────────────────────────────
  if (SEASON_FILTER) {
    console.log(`\n── Rows by week (season ${SEASON_FILTER}) ──`);
    const [weekRaw] = await db.execute(
      drizzleSql`SELECT week, COUNT(*) AS rows, COUNT(DISTINCT playerId) AS players,
        COUNT(DISTINCT ownerKey) AS owners, ROUND(SUM(pointsScored),2) AS total_pts
      FROM gm_weekly_player_stats WHERE season = ${SEASON_FILTER}
      GROUP BY week ORDER BY week ASC`
    ) as unknown as Array<any>;
    const weeks = (weekRaw as any)?.[0] as Array<Record<string,unknown>> ?? [];
    for (const r of weeks as any[]) {
      console.log(`  Week ${String(r.week).padStart(2)}: ${String(r.rows).padStart(6)} rows | ${r.players} players | ${r.owners} owners | ${r.total_pts} pts`);
    }
    if (weeks.length === 0) console.log("  (no rows for this season)");
  }

  // ── 5. Missing owner mappings ────────────────────────────────────────────────
  console.log("\n── Missing owner mappings (team: prefix = unresolved) ──");
  const [ownerRaw] = await db.execute(
    drizzleSql`SELECT ownerKey, season, COUNT(*) AS rows
    FROM gm_weekly_player_stats WHERE ownerKey LIKE 'team:%'
    GROUP BY ownerKey, season ORDER BY season DESC, rows DESC LIMIT 20`
  ) as unknown as Array<any>;
  const unknownOwners = (ownerRaw as any)?.[0] as Array<Record<string,unknown>> ?? [];
  if (unknownOwners.length === 0) {
    console.log("  ✓ All owner keys resolved");
  } else {
    for (const r of unknownOwners as any[]) {
      console.log(`  ⚠ ${r.ownerKey} — season ${r.season}: ${r.rows} rows`);
    }
    console.log("  → Fix: approve aliases in Owner Identity Review or ensure gmTeams has ownerName");
  }

  // ── 6. Review queue ─────────────────────────────────────────────────────────
  console.log("\n── Players needing review ──");
  const [revRaw] = await db.execute(
    drizzleSql`SELECT fullName, position, espnPlayerId, firstSeasonSeen, lastSeasonSeen, reviewReason
    FROM gm_player_registry WHERE needsReview = 1
    ORDER BY lastSeasonSeen DESC, fullName ASC LIMIT 20`
  ) as unknown as Array<any>;
  const reviewRows = (revRaw as any)?.[0] as Array<Record<string,unknown>> ?? [];
  if (reviewRows.length === 0) {
    console.log("  ✓ No players in review queue");
  } else {
    for (const r of reviewRows as any[]) {
      const espnTag = r.espnPlayerId ? `ESPN:${r.espnPlayerId}` : "no ESPN ID";
      console.log(`  ${String(r.fullName).padEnd(28)} ${String(r.position).padEnd(5)} ${espnTag.padEnd(15)} s${r.firstSeasonSeen}–${r.lastSeasonSeen} | ${r.reviewReason ?? ""}`);
    }
  }

  // ── 7. Cache vs ingested ─────────────────────────────────────────────────────
  console.log("\n── espn_raw_cache playerStats views vs ingested rows ──");
  const [cacheRaw] = await db.execute(
    drizzleSql`SELECT c.season,
      SUM(CASE WHEN c.viewName LIKE 'playerStats:%' THEN 1 ELSE 0 END) AS player_cache,
      SUM(CASE WHEN c.viewName LIKE 'mMatchup:%' THEN 1 ELSE 0 END) AS matchup_cache,
      COALESCE(s.stat_rows, 0) AS ingested
    FROM espn_raw_cache c
    LEFT JOIN (SELECT season, COUNT(*) AS stat_rows FROM gm_weekly_player_stats GROUP BY season) s
      ON c.season = s.season
    WHERE c.leagueId = ${LEAGUE_ID}
    GROUP BY c.season ORDER BY c.season ASC`
  ) as unknown as Array<any>;
  const cacheRows = (cacheRaw as any)?.[0] as Array<Record<string,unknown>> ?? [];
  if (cacheRows.length > 0) {
    console.log(`  ${"Season".padEnd(8)} ${"playerStats cache".padEnd(20)} ${"mMatchup cache".padEnd(18)} Ingested rows`);
    console.log("  " + "─".repeat(58));
    for (const r of cacheRows as any[]) {
      const status = Number(r.ingested) > 0 ? "✓" : Number(r.player_cache) > 0 || Number(r.matchup_cache) > 0 ? "⚠ not ingested" : "✗ no cache";
      console.log(`  ${String(r.season).padEnd(8)} ${String(r.player_cache).padEnd(20)} ${String(r.matchup_cache).padEnd(18)} ${r.ingested}  ${status}`);
    }
  }

  // ── 8. Skipped confidence tiers ──────────────────────────────────────────────
  console.log("\n── Source confidence distribution ──");
  const [confRaw] = await db.execute(
    drizzleSql`SELECT
      CASE WHEN sourceConfidence = 100 THEN 'espn_id (100)'
           WHEN sourceConfidence >= 95  THEN 'high (95-99)'
           WHEN sourceConfidence >= 85  THEN 'review_high (85-94)'
           ELSE 'review_low (<85)'
      END AS tier, COUNT(*) AS cnt
    FROM gm_weekly_player_stats GROUP BY tier ORDER BY MIN(sourceConfidence) DESC`
  ) as unknown as Array<any>;
  const confRows = (confRaw as any)?.[0] as Array<{tier:string;cnt:number}> ?? [];
  const confTotal = confRows.reduce((s, r) => s + Number(r.cnt), 0);
  for (const r of confRows) {
    const pct = confTotal > 0 ? ((Number(r.cnt)/confTotal)*100).toFixed(1) : "0.0";
    console.log(`  ${String(r.tier).padEnd(25)} ${String(r.cnt).padStart(8)} rows (${pct}%)`);
  }

  console.log("\n[validate] Done.\n");
}

run().catch(err => {
  console.error("[validate] Fatal:", err);
  process.exit(1);
});
