import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { fetchEspnViewsHardened } from "./espnService";
import {
  upsertViewHealth,
  upsertCachedView,
  upsertRefreshManifest,
} from "./db";
import {
  normalizeTeams,
  normalizeRosters,
  normalizeMatchups,
  normalizeDraftPicks,
  normalizeTransactions,
  validateDataQuality,
} from "./espnService";

// Seasons to refresh on every weekly trigger
const AUTO_REFRESH_SEASONS = [2025, 2026];

/**
 * POST /api/scheduled/espn-refresh
 * Called by the Manus Heartbeat platform every Monday at 06:00 UTC.
 * Authenticates the cron caller, then refreshes ESPN data for the
 * current and upcoming seasons (2025, 2026).
 */
export async function espnRefreshHandler(req: Request, res: Response) {
  const startedAt = Date.now();
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

    const taskUid = user.taskUid;
    const results: Record<number, {
      status: string;
      viewHealth?: Record<string, string>;
      qualityWarnings?: string[];
      error?: string;
    }> = {};

    for (const season of AUTO_REFRESH_SEASONS) {
      try {
        const pipelineResult = await fetchEspnViewsHardened(season);
        const data = pipelineResult.merged;

        // Persist per-view health records
        for (const vr of pipelineResult.viewResults) {
          await upsertViewHealth(season, vr.viewName, {
            status: vr.status === "auth_error" ? "error" : vr.status,
            errorMessage: vr.error,
            recordCount: vr.recordCount,
          });
        }

        await upsertCachedView(season, "combined", data);

        const teams = normalizeTeams(data);
        const rosters = normalizeRosters(data);
        const matchups = normalizeMatchups(data);
        const picks = normalizeDraftPicks(data);
        const txs = normalizeTransactions(data);

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
          transactionCount: txs.length,
          status: overallStatus,
          viewsRefreshed: pipelineResult.viewResults
            .filter((v) => v.status === "ok")
            .map((v) => v.viewName),
          errorMessage:
            quality.issues.length > 0 ? quality.issues.join("; ") : undefined,
        });

        const viewHealth: Record<string, string> = {};
        for (const vr of pipelineResult.viewResults) {
          viewHealth[vr.viewName] = vr.status;
        }

        results[season] = {
          status: overallStatus,
          viewHealth,
          qualityWarnings: [...quality.issues, ...quality.warnings],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await upsertRefreshManifest(season, {
          status: "failed",
          errorMessage: msg,
        });
        results[season] = { status: "failed", error: msg };
        console.error(`[ScheduledRefresh] Season ${season} failed:`, msg);
      }
    }

    const allOk = Object.values(results).every((r) => r.status === "success");
    const durationMs = Date.now() - startedAt;

    console.log(
      `[ScheduledRefresh] taskUid=${taskUid} completed in ${durationMs}ms allOk=${allOk}`,
      results
    );

    return res.json({ ok: true, taskUid, durationMs, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[ScheduledRefresh] Handler error:", msg);
    return res.status(500).json({
      error: msg,
      stack,
      context: {
        url: req.url,
        taskUid: req.headers["x-manus-cron-task-uid"],
      },
      timestamp: new Date().toISOString(),
    });
  }
}
