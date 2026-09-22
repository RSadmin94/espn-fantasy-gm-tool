/**
 * weeklyIntelHandler.ts
 * ─────────────────────
 * Heartbeat handler for the weekly intelligence refresh.
 * Registered at POST /api/scheduled/weekly-intel
 *
 * Delegates to processLeagueWeek — the canonical (leagueId, season, week)
 * orchestrator. Season and week are resolved from ESPN provider state, never
 * from a hardcoded CURRENT_SEASON.
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { notifyOwner } from "./_core/notification";
import {
  processLeagueWeek,
  resolveCronLeagueIds,
  planScheduledWeeks,
  refreshWeeklyProviderForLeague,
} from "./weeklySeasonEngine";

export async function weeklyIntelHandler(req: Request, res: Response) {
  const startedAt = Date.now();
  let taskUid: string | undefined;

  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }
    taskUid = user.taskUid;

    const body = (req.body ?? {}) as { leagueId?: string; season?: number; week?: number };
    const leagueIds = await resolveCronLeagueIds(body.leagueId);
    const packs = [];
    for (const leagueId of leagueIds) {
      await refreshWeeklyProviderForLeague(leagueId, body.season);
      const planned = await planScheduledWeeks({
        leagueId,
        season: body.season,
        week: body.week,
      });
      for (const week of planned.weeks) {
        const pack = await processLeagueWeek({
          leagueId,
          season: planned.clock.season,
          week,
          mode: "scheduled",
          skipProviderRefresh: true,
        });
        packs.push(pack);
      }
    }

    const durationSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    const primary = packs[0];
    if (primary) {
      notifyOwner({
        title: `Weekly Intel Refresh — ${primary.clock.season} Week ${primary.clock.requestedWeek}`,
        content: [
          `League: ${primary.clock.leagueId}`,
          `Weeks: ${packs.map((p) => p.clock.requestedWeek).join(", ")}`,
          `Week status: **${primary.clock.weekStatus}**`,
          `Teams: ${primary.facts.teamCount} | Matchups: ${primary.facts.matchupCount}`,
          `Stats: ${primary.receipts.weeklyStatsStatus} (${primary.receipts.weeklyStatsRows} rows)`,
          `Storylines: ${primary.receipts.storylineCount} | Fear: ${primary.receipts.fearCount}`,
          primary.receipts.errors.length ? `Errors: ${primary.receipts.errors.join("; ")}` : "No step errors",
          `Duration: ${durationSec}s`,
        ].join("\n"),
      }).catch(() => {});
    }

    return res.json({
      ok: true,
      season: primary?.clock.season ?? body.season ?? null,
      week: primary?.clock.requestedWeek ?? body.week ?? null,
      weekStatus: primary?.clock.weekStatus ?? null,
      leagueId: primary?.clock.leagueId ?? leagueIds[0] ?? null,
      weeks: packs.map((p) => p.clock.requestedWeek),
      packs: packs.map((p) => ({
        leagueId: p.clock.leagueId,
        season: p.clock.season,
        week: p.clock.requestedWeek,
        weekStatus: p.clock.weekStatus,
        receipts: p.receipts,
      })),
      durationMs: Date.now() - startedAt,
      taskUid,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[weekly-intel] FAILED (taskUid=${taskUid ?? "unknown"}):`, msg);
    notifyOwner({
      title: `Weekly Intel Refresh FAILED`,
      content: `Error: ${msg}\nTask UID: ${taskUid ?? "unknown"}`,
    }).catch(() => {});
    return res.status(500).json({
      error: msg,
      context: { taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
