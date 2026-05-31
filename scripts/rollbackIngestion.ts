/**
 * scripts/rollbackIngestion.ts
 * Rollback plan: safely purge ingested data from gm_player_registry + gm_weekly_player_stats.
 *
 * Modes:
 *   --season=2024        Delete all stat rows for one season (safe rollback)
 *   --season=2024 --players  Also delete registry rows only seen in that season
 *   --all                Wipe both tables entirely (use with extreme caution)
 *   --dry-run            Show counts without deleting anything
 *
 * Usage:
 *   npx tsx scripts/rollbackIngestion.ts --season=2024 --dry-run
 *   npx tsx scripts/rollbackIngestion.ts --season=2024
 *   npx tsx scripts/rollbackIngestion.ts --all --dry-run
 */

import { getDb } from "../server/db";
import { gmPlayerRegistry, gmWeeklyPlayerStats } from "../drizzle/schema";
import {
  eq as eqD, and as andD, sql as drizzleSql,
  notInArray as notInArrayD, inArray as inArrayD,
} from "drizzle-orm";

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);

const DRY_RUN       = args["dry-run"] === "true";
const ALL           = args.all === "true";
const SEASON        = args.season ? Number(args.season) : undefined;
const ALSO_PLAYERS  = args.players === "true";

async function run() {
  const db = await getDb();
  if (!db) { console.error("[rollback] Cannot connect."); process.exit(1); }

  if (!ALL && !SEASON) {
    console.error("[rollback] Provide --season=YYYY or --all");
    process.exit(1);
  }

  console.log(`[rollback] DryRun=${DRY_RUN} | ${ALL ? "ALL DATA" : `Season=${SEASON}`}${ALSO_PLAYERS ? " + players" : ""}`);

  if (ALL) {
    // Count first
    const [sc] = await db.execute(drizzleSql`SELECT COUNT(*) AS cnt FROM gm_weekly_player_stats`) as unknown as Array<any>;
    const [pc] = await db.execute(drizzleSql`SELECT COUNT(*) AS cnt FROM gm_player_registry`) as unknown as Array<any>;
    const scnt = ((sc as any)?.[0] as any)?.cnt ?? 0;
    const pcnt = ((pc as any)?.[0] as any)?.cnt ?? 0;

    console.log(`  gm_weekly_player_stats: ${scnt} rows`);
    console.log(`  gm_player_registry:     ${pcnt} rows`);

    if (!DRY_RUN) {
      await db.execute(drizzleSql`SET FOREIGN_KEY_CHECKS=0`);
      await db.execute(drizzleSql`TRUNCATE TABLE gm_weekly_player_stats`);
      await db.execute(drizzleSql`TRUNCATE TABLE gm_player_registry`);
      await db.execute(drizzleSql`SET FOREIGN_KEY_CHECKS=1`);
      console.log("  ✓ Both tables truncated");
    } else {
      console.log("  [dry-run] Would truncate both tables");
    }
    return;
  }

  // Single-season rollback
  const [sc] = await db.execute(
    drizzleSql`SELECT COUNT(*) AS cnt FROM gm_weekly_player_stats WHERE season = ${SEASON!}`
  ) as unknown as Array<any>;
  const scnt = ((sc as any)?.[0] as any)?.cnt ?? 0;
  console.log(`  gm_weekly_player_stats for season ${SEASON}: ${scnt} rows`);

  if (!DRY_RUN) {
    await db.delete(gmWeeklyPlayerStats).where(eqD(gmWeeklyPlayerStats.season, SEASON!));
    console.log(`  ✓ Deleted ${scnt} stat rows for season ${SEASON}`);
  } else {
    console.log(`  [dry-run] Would delete ${scnt} stat rows for season ${SEASON}`);
  }

  if (ALSO_PLAYERS) {
    // Only delete registry rows whose first+last season seen = target season (orphans)
    const [oc] = await db.execute(
      drizzleSql`SELECT COUNT(*) AS cnt FROM gm_player_registry
      WHERE firstSeasonSeen = ${SEASON!} AND lastSeasonSeen = ${SEASON!}`
    ) as unknown as Array<any>;
    const ocnt = ((oc as any)?.[0] as any)?.cnt ?? 0;
    console.log(`  gm_player_registry entries only seen in season ${SEASON}: ${ocnt}`);

    if (!DRY_RUN) {
      await db.execute(
        drizzleSql`DELETE FROM gm_player_registry WHERE firstSeasonSeen = ${SEASON!} AND lastSeasonSeen = ${SEASON!}`
      );
      console.log(`  ✓ Deleted ${ocnt} orphaned player registry rows`);
    } else {
      console.log(`  [dry-run] Would delete ${ocnt} orphaned player registry rows`);
    }
  }

  console.log("[rollback] Done.");
}

run().catch(err => {
  console.error("[rollback] Fatal:", err);
  process.exit(1);
});
