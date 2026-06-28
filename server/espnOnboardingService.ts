/**
 * Post-connect onboarding pipeline for ESPN extension / saveCredentials.
 *
 * After a league is linked, syncs the current season, persists owner identity
 * from SWID when unset, and materializes Free-tier derived data (rivalry scores,
 * weekly storylines, fear index). Non-fatal steps are logged and skipped.
 */
import { and, eq } from "drizzle-orm";
import { leagueConnections } from "../drizzle/schema";
import { getDb, persistOwnerFromSwidIfUnset, setActiveLeagueForUser } from "./db";
import { refreshSingleSeason } from "./espnSeasonRefresh";
import type { EspnCreds } from "./espnService";
import { memCache } from "./memCache";

export type EspnOnboardingResult = {
  ok: boolean;
  leagueId: string;
  season: number;
  syncStatus: "success" | "partial" | "failed";
  ownerPersisted: boolean;
  rivalryCount: number;
  storylineCount: number;
  errors: string[];
};

function currentFantasySeason(): number {
  const y = new Date().getFullYear();
  const month = new Date().getMonth();
  return month < 6 ? y : y;
}

/**
 * Full connect → sync → derive pipeline invoked from saveCredentials background job.
 */
export async function completeEspnConnectOnboarding(opts: {
  userId: number;
  leagueId: string;
  creds: EspnCreds;
  season?: number;
}): Promise<EspnOnboardingResult> {
  const { userId, leagueId, creds } = opts;
  const season = opts.season ?? currentFantasySeason();
  const errors: string[] = [];
  const lid = String(leagueId).trim().slice(0, 32);
  if (!lid) {
    return {
      ok: false,
      leagueId: lid,
      season,
      syncStatus: "failed",
      ownerPersisted: false,
      rivalryCount: 0,
      storylineCount: 0,
      errors: ["missing_league_id"],
    };
  }

  let syncStatus: "success" | "partial" | "failed" = "failed";
  try {
    const refresh = await refreshSingleSeason({ season, leagueId: lid, creds, userId });
    syncStatus = refresh.status;
    if (refresh.error) errors.push(`sync:${refresh.error}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`sync:${msg}`);
  }

  try {
    const db = await getDb();
    if (db) {
      const [conn] = await db
        .select({ id: leagueConnections.id })
        .from(leagueConnections)
        .where(
          and(
            eq(leagueConnections.userId, userId),
            eq(leagueConnections.leagueId, lid),
            eq(leagueConnections.provider, "espn"),
          ),
        )
        .limit(1);
      if (conn?.id) await setActiveLeagueForUser(userId, conn.id);
    }
  } catch (e) {
    errors.push(`activate:${e instanceof Error ? e.message : String(e)}`);
  }

  let ownerPersisted = false;
  try {
    ownerPersisted = await persistOwnerFromSwidIfUnset(userId, lid);
    memCache.invalidate(`currentOwner:${userId}`);
  } catch (e) {
    errors.push(`owner:${e instanceof Error ? e.message : String(e)}`);
  }

  let rivalryCount = 0;
  try {
    const { refreshRivalryScores } = await import("./rivalryService");
    const pairs = await refreshRivalryScores(userId, lid);
    rivalryCount = pairs.length;
  } catch (e) {
    errors.push(`rivalry:${e instanceof Error ? e.message : String(e)}`);
  }

  let storylineCount = 0;
  try {
    const { refreshWeeklyStorylines } = await import("./weeklyStorylinesService");
    const rows = await refreshWeeklyStorylines(season, userId);
    storylineCount = rows.length;
  } catch (e) {
    errors.push(`storylines:${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { refreshFearIndex } = await import("./fearIndexService");
    await refreshFearIndex(season, undefined, userId);
  } catch (e) {
    errors.push(`fearIndex:${e instanceof Error ? e.message : String(e)}`);
  }

  memCache.invalidateAll();

  const ok = syncStatus !== "failed";
  return {
    ok,
    leagueId: lid,
    season,
    syncStatus,
    ownerPersisted,
    rivalryCount,
    storylineCount,
    errors,
  };
}
