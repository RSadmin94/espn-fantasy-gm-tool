/**
 * Sofia Phase 1 orchestrator — read-only template commentary for the active league's finished mock.
 *
 * Both endpoints are ACTIVE-LEAGUE-SCOPED: mock data is loaded via draftWarRoom.getDraftWarRoomData,
 * which resolves the user's active league. Requesting commentary for a non-active leagueId fails loudly.
 *
 * Responses are cacheable by momentId in a later phase; no cache in Phase 1.
 */
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb, resolveActiveLeagueId } from "../../db";
import { gmTeams } from "../../../drizzle/schema";
import { getEspnPlayerInfoMap } from "../../playerStatsRouter";
import { rosterRulesFromLineupSlotCounts } from "../../draftEngine/phase5/leagueRosterRules";
import { computeRivalryScores } from "../../rivalryService";
import { computeLeaguePositionTimingProfiles } from "../../leagueDraftTimingProfile";
import { buildDraftMoments } from "../draftMoments/draftMomentBuilder";
import type { SofiaCommentary } from "./sofiaContract";
import { buildSofiaFactPacket } from "./sofiaFactPacketBuilder";
import { renderTemplateCommentary } from "./sofiaTemplateRenderer";

export type SofiaCommentaryUser = {
  id: number;
  openId?: string | null;
  role?: string;
};

async function assertActiveLeagueMatches(userId: number, leagueId: string, season: number): Promise<void> {
  const { leagueId: activeLeagueId } = await resolveActiveLeagueId(
    { user: { id: userId } },
    null,
    season,
  );
  if (!activeLeagueId || activeLeagueId === "default") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Sofia commentary is scoped to your active league. Switch to league ${leagueId} before requesting commentary.`,
    });
  }
  if (String(activeLeagueId) !== String(leagueId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Sofia commentary is scoped to your active league. Switch to league ${leagueId} before requesting commentary.`,
    });
  }
}

async function loadMomentsForActiveLeague(args: {
  user: SofiaCommentaryUser;
  leagueId: string;
  season: number;
}) {
  await assertActiveLeagueMatches(args.user.id, args.leagueId, args.season);

  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }

  const { appRouter } = await import("../../routers");
  const caller = appRouter.createCaller({
    user: { ...args.user, role: args.user.role ?? "user" },
    auth: { userId: args.user.openId ?? String(args.user.id) },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => undefined },
  } as any);

  const dwr: any = await caller.draftWarRoom.getDraftWarRoomData({ season: args.season } as any);
  if (!dwr || dwr.ok === false) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: String(dwr?.error ?? "Draft War Room data unavailable for the active league."),
    });
  }

  const mockDraft: any[] = dwr.mockDraft ?? [];
  const { moments } = await buildDraftMoments({
    db,
    sql,
    leagueId: args.leagueId,
    season: args.season,
    mockDraft,
    teamCount: dwr.teamCount ?? 14,
    focalUserId: args.user.id,
    gmTeams,
    getEspnPlayerInfoMap,
    rosterRulesFromLineupSlotCounts,
    computeRivalryScores,
    computeLeaguePositionTimingProfiles,
  });

  return moments;
}

function momentsToCommentary(moments: Awaited<ReturnType<typeof loadMomentsForActiveLeague>>): SofiaCommentary[] {
  return moments
    .map((moment) => renderTemplateCommentary(buildSofiaFactPacket(moment)))
    .sort((a, b) => a.subject.overallPick - b.subject.overallPick);
}

/** Full draft commentary for the active league's finished mock. */
export async function buildDraftCommentary(args: {
  user: SofiaCommentaryUser;
  leagueId: string;
  season: number;
}): Promise<SofiaCommentary[]> {
  const moments = await loadMomentsForActiveLeague(args);
  return momentsToCommentary(moments);
}

/** Single-moment commentary for the active league's finished mock. */
export async function buildMomentCommentary(args: {
  user: SofiaCommentaryUser;
  leagueId: string;
  season: number;
  momentId: string;
}): Promise<SofiaCommentary> {
  const moments = await loadMomentsForActiveLeague(args);
  const commentary = momentsToCommentary(moments).find((c) => c.momentId === args.momentId);
  if (!commentary) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No commentary found for momentId ${args.momentId}`,
    });
  }
  return commentary;
}
