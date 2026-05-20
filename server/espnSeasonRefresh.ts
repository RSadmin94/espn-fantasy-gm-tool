/**
 * Single-season ESPN refresh — used by saveCredentials background sync and bulk refresh.
 */
import {
  fetchEspnViewsHardened,
  fetchTradeProposals,
  mergeTradeProposalsIntoTransactions,
  fetchRecentActivityTrades,
  normalizeTeams,
  normalizeRosters,
  normalizeMatchups,
  normalizeDraftPicks,
  normalizeTransactions,
  validateDataQuality,
  type EspnCreds,
} from "./espnService";
import {
  upsertCachedView,
  upsertRefreshManifest,
  upsertViewHealth,
  getDb,
} from "./db";
import { upsertLeagueIdentity } from "./leagueIdentityService";
import { leagueConnections } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { memCache } from "./memCache";

export async function refreshSingleSeason(opts: {
  season: number;
  leagueId: string;
  creds?: EspnCreds;
  userId?: number;
}): Promise<{ status: "success" | "partial" | "failed"; error?: string }> {
  const { season, leagueId, creds, userId } = opts;

  try {
    const pipelineResult = await fetchEspnViewsHardened(season, undefined, creds);
    const data = pipelineResult.merged;

    for (const vr of pipelineResult.viewResults) {
      await upsertViewHealth(season, vr.viewName, {
        status: vr.status === "auth_error" ? "error" : vr.status,
        errorMessage: vr.error,
        recordCount: vr.recordCount,
      });
    }

    let enrichedData = data;
    try {
      const proposals = await fetchTradeProposals(season, creds);
      enrichedData = mergeTradeProposalsIntoTransactions(data, proposals);
    } catch {
      /* non-fatal */
    }
    try {
      const activityTrades = await fetchRecentActivityTrades(season, enrichedData, creds);
      if (activityTrades.length > 0) {
        enrichedData = mergeTradeProposalsIntoTransactions(enrichedData, activityTrades);
      }
    } catch {
      /* non-fatal */
    }

    await upsertCachedView(season, "combined", enrichedData, leagueId);
    try {
      await upsertLeagueIdentity(season, enrichedData);
    } catch {
      /* non-fatal */
    }

    const teams = normalizeTeams(enrichedData);
    const rosters = normalizeRosters(enrichedData);
    const matchups = normalizeMatchups(enrichedData);
    const picks = normalizeDraftPicks(enrichedData);
    const txs = normalizeTransactions(enrichedData);
    const quality = validateDataQuality(season, data);

    const overallStatus =
      pipelineResult.allViewsOk && quality.isUsable
        ? "success"
        : pipelineResult.hasPartialData || !quality.isUsable
          ? "partial"
          : "success";

    await upsertRefreshManifest(season, {
      teamCount: teams.length,
      rosterCount: rosters.length,
      matchupCount: matchups.length,
      draftPickCount: picks.length,
      transactionCount: (txs as unknown[]).length,
      status: overallStatus,
      viewsRefreshed: pipelineResult.viewResults
        .filter(v => v.status === "ok")
        .map(v => v.viewName),
      errorMessage: quality.issues.length > 0 ? quality.issues.join("; ") : undefined,
    });

    memCache.invalidateAll();

    if (userId) {
      const db = await getDb();
      if (db) {
        await db
          .update(leagueConnections)
          .set({
            syncStatus: "ok",
            syncError: null,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(leagueConnections.userId, userId),
              eq(leagueConnections.leagueId, leagueId),
              eq(leagueConnections.provider, "espn")
            )
          );
      }
    }

    return { status: overallStatus };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await upsertRefreshManifest(season, { status: "failed", errorMessage: msg });

    if (userId) {
      const db = await getDb();
      if (db) {
        await db
          .update(leagueConnections)
          .set({
            syncStatus: "error",
            syncError: msg.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(leagueConnections.userId, userId),
              eq(leagueConnections.leagueId, leagueId),
              eq(leagueConnections.provider, "espn")
            )
          );
      }
    }

    return { status: "failed", error: msg };
  }
}
