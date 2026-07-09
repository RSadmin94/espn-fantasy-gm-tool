/**
 * Load league roster rules from ESPN combined cache (league-walled).
 */

import { sql } from "drizzle-orm";
import type { getDb } from "../../db";
import { rosterRulesFromLineupSlotCounts, type LeagueRosterRules } from "./leagueRosterRules";

type Db = Awaited<ReturnType<typeof getDb>>;

export async function loadLeagueRosterRules(args: {
  db: NonNullable<Db>;
  leagueId: string;
  season: number;
}): Promise<LeagueRosterRules> {
  // League-generic: derive roster rules from THIS league's real ESPN lineup settings.
  const rows = await args.db.execute(
    sql`SELECT payload FROM espn_raw_cache WHERE leagueId=${args.leagueId} AND season=${args.season} AND viewName='combined' LIMIT 1`,
  );
  const rowList = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : (rows as { rows?: unknown[] }).rows ?? rows;
  const row = (rowList as { payload?: unknown }[])[0];
  if (!row?.payload) return rosterRulesFromLineupSlotCounts({ leagueId: args.leagueId, lineupSlotCounts: null });

  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  const counts = payload?.settings?.rosterSettings?.lineupSlotCounts as Record<string, unknown> | undefined;
  return rosterRulesFromLineupSlotCounts({ leagueId: args.leagueId, lineupSlotCounts: counts ?? null });
}
