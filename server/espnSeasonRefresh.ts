/**
 * Single-season ESPN refresh — used by espn onboarding pipeline and bulk refresh.
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
  upsertRefreshManifest,
  upsertViewHealth,
  getDb,
} from "./db";
import { syncEspnCombinedFullPipeline } from "./espnPersistence";
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

  // ── League-scoping guard (fix the pipe before cleaning the water) ──
  // A sync MUST fetch from the same league it stores under. Previously the fetch
  // helpers resolved their league from creds (falling back to the module default
  // LEAGUE_ID=457622) while the result was persisted under `leagueId` — so a refresh
  // with a missing/incorrect creds.leagueId silently pulled the default league's data
  // and stored it under the wrong key. Force fetch identity == storage identity here,
  // and never let a sync silently fall back to the default league.
  const lid = String(leagueId).slice(0, 32);
  if (!lid) {
    return { status: "failed", error: "refreshSingleSeason called without a leagueId" };
  }
  const fetchCreds: EspnCreds = creds
    ? { ...creds, leagueId: lid }
    : { swid: process.env.ESPN_SWID || "", espnS2: process.env.ESPN_S2 || "", leagueId: lid };

  try {
    const pipelineResult = await fetchEspnViewsHardened(season, undefined, fetchCreds);
    const data = pipelineResult.merged;

    for (const vr of pipelineResult.viewResults) {
      try {
        await upsertViewHealth(season, vr.viewName, {
          status: vr.status === "auth_error" ? "error" : vr.status,
          errorMessage: vr.error,
          recordCount: vr.recordCount,
        });
      } catch (vhErr) {
        console.warn("[espnSeasonRefresh] upsertViewHealth failed:", season, vr.viewName, vhErr);
      }
    }

    let enrichedData = data;
    try {
      const proposals = await fetchTradeProposals(season, fetchCreds);
      enrichedData = mergeTradeProposalsIntoTransactions(data, proposals);
    } catch {
      /* non-fatal */
    }
    try {
      const activityTrades = await fetchRecentActivityTrades(season, enrichedData, fetchCreds);
      if (activityTrades.length > 0) {
        enrichedData = mergeTradeProposalsIntoTransactions(enrichedData, activityTrades);
      }
    } catch {
      /* non-fatal */
    }

    const quality = validateDataQuality(season, data);
    try {
      await syncEspnCombinedFullPipeline(lid, season, enrichedData as Record<string, unknown>, {
        pipelineAllOk: pipelineResult.allViewsOk,
        qualityUsable: quality.isUsable,
      });
    } catch (persistErr) {
      console.warn("[espnSeasonRefresh] syncEspnCombinedFullPipeline failed:", season, persistErr);
      throw persistErr;
    }
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

    const overallStatus =
      pipelineResult.allViewsOk && quality.isUsable
        ? "success"
        : pipelineResult.hasPartialData || !quality.isUsable
          ? "partial"
          : "success";

    try {
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
    } catch (mfErr) {
      console.warn("[espnSeasonRefresh] upsertRefreshManifest failed:", season, mfErr);
    }

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
    try {
      await upsertRefreshManifest(season, { status: "failed", errorMessage: msg });
    } catch (mfErr) {
      console.warn("[espnSeasonRefresh] upsertRefreshManifest (failed) failed:", season, mfErr);
    }

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
