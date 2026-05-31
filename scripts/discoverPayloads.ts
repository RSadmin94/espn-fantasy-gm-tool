/**
 * scripts/discoverPayloads.ts
 * Step 1: Discover all available ESPN raw cache data.
 *
 * Answers:
 *   - How many historical payloads exist?
 *   - Which seasons / weeks are present?
 *   - Which view names contain lineup/player scoring data?
 *   - Estimated unique players available.
 *
 * Usage:
 *   npx tsx scripts/discoverPayloads.ts [--league=457622] [--output=json]
 *   npx tsx scripts/discoverPayloads.ts --output=sql   (print SQL only, no DB needed)
 */

import { getDb } from "../server/db";
import { espnRawCache } from "../drizzle/schema";
import {
  eq  as eqD,
  sql as drizzleSql,
  asc as ascD,
} from "drizzle-orm";

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);

const LEAGUE_ID  = (args.league as string) ?? process.env.LEAGUE_ID ?? "457622";
const OUTPUT_SQL = args.output === "sql";

// ── View names known to contain lineup/player scoring data ────────────────────
// ESPN API view strings that encode per-player points and roster slots:
const LINEUP_VIEW_PATTERNS = [
  "mRoster",
  "mMatchup",
  "mMatchupScore",
  "mScoringPeriod",
  "mLiveScoring",
  "mBoxscore",
  "kona_game_state",
  "mTeam",
];

function isLineupView(viewName: string): boolean {
  return LINEUP_VIEW_PATTERNS.some(p => viewName.toLowerCase().includes(p.toLowerCase()));
}

// ── Discovery SQL (also printable without DB) ─────────────────────────────────

export const DISCOVERY_SQL = {
  totalPayloads: `
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT season) AS seasons,
       COUNT(DISTINCT CONCAT(season, '_', viewName)) AS season_view_combos,
       SUM(payloadBytes) AS total_bytes,
       MIN(season) AS oldest_season,
       MAX(season) AS newest_season,
       MIN(fetchedAt) AS first_fetch,
       MAX(fetchedAt) AS last_fetch
FROM espn_raw_cache
WHERE leagueId = '${LEAGUE_ID}';`,

  bySeasonAndView: `
SELECT season,
       viewName,
       COUNT(*) AS row_count,
       SUM(payloadBytes) AS total_bytes,
       MIN(fetchedAt) AS first_fetch,
       MAX(fetchedAt) AS last_fetch
FROM espn_raw_cache
WHERE leagueId = '${LEAGUE_ID}'
GROUP BY season, viewName
ORDER BY season ASC, viewName ASC;`,

  weekCoverage: `
-- Extract scoringPeriodId from JSON payload to map season → available weeks
SELECT season,
       JSON_UNQUOTE(JSON_EXTRACT(payload, '$.scoringPeriodId')) AS scoring_period,
       viewName,
       COUNT(*) AS rows
FROM espn_raw_cache
WHERE leagueId = '${LEAGUE_ID}'
  AND (viewName LIKE '%mRoster%'
    OR viewName LIKE '%mMatchup%'
    OR viewName LIKE '%mScoringPeriod%')
  AND JSON_VALID(payload) = 1
GROUP BY season, scoring_period, viewName
ORDER BY season ASC, scoring_period + 0 ASC;`,

  estimatedUniquePlayers: `
-- Approximate unique player IDs found in JSON roster entries
-- Uses JSON_SEARCH pattern on a sample; not exact but fast
SELECT season,
       viewName,
       COUNT(*) AS payload_count
FROM espn_raw_cache
WHERE leagueId = '${LEAGUE_ID}'
  AND (viewName LIKE '%mRoster%' OR viewName LIKE '%mMatchup%' OR viewName LIKE '%mScoringPeriod%')
GROUP BY season, viewName
ORDER BY season ASC;`,
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  if (OUTPUT_SQL) {
    console.log("-- ── Discovery SQL for manual execution ──────────────────────\n");
    Object.entries(DISCOVERY_SQL).forEach(([name, q]) => {
      console.log(`-- ${name}`);
      console.log(q.trim());
      console.log();
    });
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[discover] Cannot connect to DB. Check DATABASE_URL. Use --output=sql to print SQL only.");
    process.exit(1);
  }

  console.log(`\n[discover] League: ${LEAGUE_ID}`);
  console.log("─".repeat(60));

  // 1. Total payload summary
  const [summary] = await db.execute(
    drizzleSql`SELECT COUNT(*) AS total_rows,
      COUNT(DISTINCT season) AS seasons,
      COUNT(DISTINCT CONCAT(season, '_', viewName)) AS season_view_combos,
      SUM(payloadBytes) AS total_bytes,
      MIN(season) AS oldest_season,
      MAX(season) AS newest_season
    FROM espn_raw_cache WHERE leagueId = ${LEAGUE_ID}`
  ) as unknown as Array<Record<string, unknown>>;
  const s = (summary as any)?.[0] ?? {};
  console.log(`\nTotal raw cache rows:    ${s.total_rows ?? 0}`);
  console.log(`Seasons covered:         ${s.seasons ?? 0}  (${s.oldest_season ?? '?'} – ${s.newest_season ?? '?'})`);
  console.log(`Season+view combos:      ${s.season_view_combos ?? 0}`);
  console.log(`Total stored bytes:      ${Number(s.total_bytes ?? 0).toLocaleString()}`);

  // 2. By season and view
  const byView = await db.execute(
    drizzleSql`SELECT season, viewName, COUNT(*) AS row_count
    FROM espn_raw_cache
    WHERE leagueId = ${LEAGUE_ID}
    GROUP BY season, viewName
    ORDER BY season ASC, viewName ASC`
  ) as unknown as Array<Record<string, unknown>>;

  const rows = (byView as any)?.[0] as Array<{season:number; viewName:string; row_count:number}> ?? [];
  const lineupRows = rows.filter(r => isLineupView(r.viewName));
  const nonLineupRows = rows.filter(r => !isLineupView(r.viewName));

  console.log(`\n── Lineup/player scoring views (${lineupRows.length} season+view combos) ──`);
  const seasonMap = new Map<number, string[]>();
  for (const r of lineupRows) {
    if (!seasonMap.has(r.season)) seasonMap.set(r.season, []);
    seasonMap.get(r.season)!.push(r.viewName);
  }
  for (const [season, views] of [...seasonMap.entries()].sort((a,b) => a[0]-b[0])) {
    console.log(`  ${season}: ${[...new Set(views)].sort().join(', ')}`);
  }

  if (nonLineupRows.length > 0) {
    console.log(`\n── Other views (${nonLineupRows.length} combos) ──`);
    for (const r of nonLineupRows.slice(0, 10)) {
      console.log(`  ${r.season}: ${r.viewName}`);
    }
    if (nonLineupRows.length > 10) console.log(`  ... and ${nonLineupRows.length - 10} more`);
  }

  // 3. Season-by-week coverage from scoringPeriodId in JSON
  console.log("\n── Week coverage estimate ──");
  for (const [season, views] of [...seasonMap.entries()].sort((a,b) => a[0]-b[0])) {
    // Quick JSON extraction for scoringPeriodId
    const weekRows = await db.execute(
      drizzleSql`SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.scoringPeriodId')) AS sp
      FROM espn_raw_cache
      WHERE leagueId = ${LEAGUE_ID} AND season = ${season}
        AND (viewName LIKE '%mRoster%' OR viewName LIKE '%mMatchup%' OR viewName LIKE '%mScoringPeriod%')
        AND JSON_VALID(payload) = 1
      LIMIT 100`
    ) as unknown as Array<any>;

    const sps = ((weekRows as any)?.[0] as Array<{sp:string|null}> ?? [])
      .map(r => Number(r.sp))
      .filter(n => Number.isFinite(n) && n > 0);
    const uniqueWeeks = [...new Set(sps)].sort((a,b) => a-b);
    console.log(`  ${season}: weeks [${uniqueWeeks.join(', ') || 'none detected'}] (${views.length} view types)`);
  }

  // 4. Registry / stats current state
  const [regCount] = await db.execute(
    drizzleSql`SELECT COUNT(*) AS cnt FROM gm_player_registry`
  ) as unknown as Array<any>;
  const [statsCount] = await db.execute(
    drizzleSql`SELECT COUNT(*) AS cnt FROM gm_weekly_player_stats`
  ) as unknown as Array<any>;

  const regCnt   = ((regCount   as any)?.[0] as any)?.[0]?.cnt ?? 0;
  const statsCnt = ((statsCount as any)?.[0] as any)?.[0]?.cnt ?? 0;

  console.log(`\n── Current pipeline state ──`);
  console.log(`  gm_player_registry rows:      ${regCnt}`);
  console.log(`  gm_weekly_player_stats rows:  ${statsCnt}`);
  console.log(`  Status: ${statsCnt === 0 ? "⚠ Not yet ingested" : "✓ Data present"}`);

  console.log("\n── Recommended execution order ──");
  if (lineupRows.length === 0) {
    console.log("  ⚠ No lineup/scoring views found. Sync ESPN data first via the extension.");
  } else {
    for (const [season] of [...seasonMap.entries()].sort((a,b) => a[0]-b[0])) {
      console.log(`  npx tsx scripts/runIngestionPipeline.ts --season=${season}`);
    }
    console.log("  npx tsx scripts/validateIngestion.ts");
    console.log("  npx tsx scripts/sanityCheckPlayers.ts");
  }

  console.log();
}

run().catch(err => {
  console.error("[discover] Fatal:", err);
  process.exit(1);
});
