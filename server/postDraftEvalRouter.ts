import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { gmDraftPicks, gmTeams } from "../drizzle/schema";
import { router, protectedProcedure, resolvePremiumAccess } from "./_core/trpc";
import { getDb, resolveActiveLeagueId, resolveActiveProfile } from "./db";
import { getSeasonDraftPicks, getSeasonSettings } from "./leagueDataReads";
import { rosterRulesFromLineupSlotCounts } from "./draftEngine/phase5/leagueRosterRules";
import { loadPdeRankingBoard, pdeRankingNote, resolvePdePickIdentities } from "./postDraftEvalBoard";
import { pdeSeasonPolicy } from "../client/src/lib/postDraftEval/historicalIntegrity";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function normalizePos(position: string | null | undefined): string {
  const p = String(position || "").toUpperCase().trim();
  if (p === "D/ST" || p === "DST") return "DEF";
  if (p === "PK") return "K";
  return p;
}

function nameKey(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’.]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\.?$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}


async function resolveSeasonUserTeamId(args: {
  leagueId: string;
  season: number;
  selectedTeamId: number;
  selectedOwnerKey: string | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) return args.selectedTeamId;
  const ownerId = args.selectedOwnerKey?.startsWith("id:")
    ? args.selectedOwnerKey.slice(3)
    : args.selectedOwnerKey?.trim() || "";
  if (ownerId) {
    const byOwner = await db
      .select({ teamId: gmTeams.teamId })
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, args.leagueId), eq(gmTeams.season, args.season), eq(gmTeams.ownerId, ownerId)))
      .limit(1);
    if (byOwner[0]?.teamId != null) return Number(byOwner[0].teamId);
  }
  const sameId = await db
    .select({ teamId: gmTeams.teamId })
    .from(gmTeams)
    .where(and(eq(gmTeams.leagueId, args.leagueId), eq(gmTeams.season, args.season), eq(gmTeams.teamId, args.selectedTeamId)))
    .limit(1);
  if (sameId[0]?.teamId != null) return Number(sameId[0].teamId);
  return args.selectedTeamId;
}

export const postDraftEvalRouter = router({
  getBoard: protectedProcedure
    .input(
      z.object({
        season: z.number().int().min(2009).max(2030),
        activeLeagueKey: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      void input.activeLeagueKey;
      if (!(await resolvePremiumAccess(ctx.user))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Post-Draft Evaluation requires Rivals.",
        });
      }
      const { leagueId } = await resolveActiveLeagueId({ user: { id: ctx.user.id } }, null, input.season);
      if (!leagueId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active league." });
      }
      const profile = await resolveActiveProfile({ id: ctx.user.id, openId: ctx.user.openId });
      if (profile.selectedTeamId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select your team before running post-draft evaluation." });
      }
      const userTeamId = await resolveSeasonUserTeamId({
        leagueId,
        season: input.season,
        selectedTeamId: profile.selectedTeamId,
        selectedOwnerKey: profile.selectedOwnerKey ?? null,
      });

      const [picksRes, settingsRes] = await Promise.all([
        getSeasonDraftPicks({ leagueId, season: input.season }),
        getSeasonSettings({ leagueId, season: input.season }),
      ]);

      const rawPicks = picksRes.rows.map((row) => ({
        overallPick: Number(row.overallPickNumber ?? row.overallPick ?? 0),
        round: Number(row.roundId ?? 0),
        roundPick: Number(row.roundPickNumber ?? row.roundPick ?? 0),
        teamId: Number(row.teamId ?? 0),
        playerId: row.playerId != null ? Number(row.playerId) : null,
        playerName: String(row.playerName ?? "").trim(),
        position: row.position != null ? normalizePos(String(row.position)) : null,
        isKeeper: Boolean(row.keeper ?? row.isKeeper),
      })).filter((p) => p.overallPick > 0);
      const picks = await resolvePdePickIdentities(leagueId, input.season, rawPicks);
      const policy = pdeSeasonPolicy(input.season);

      const settings = settingsRes.rows[0] ?? null;
      const rosterPositions = asRecord(settings?.rosterPositions);
      const rules = rosterRulesFromLineupSlotCounts({
        leagueId,
        lineupSlotCounts: rosterPositions,
      });
      const lineupReqs: Record<string, number> = {
        QB: rules.starters.QB,
        RB: rules.starters.RB,
        WR: rules.starters.WR,
        TE: rules.starters.TE,
        FLEX: rules.starters.FLEX,
        K: rules.starters.K,
      };
      if (rules.starters.DP > 0) lineupReqs.DP = rules.starters.DP;
      if (rules.starters.DST > 0) lineupReqs.DEF = rules.starters.DST;

      const scoringType = String(settings?.scoringType ?? "").toLowerCase();
      const receptionPoints = scoringType.includes("half") ? 0.5 : scoringType.includes("ppr") ? 1 : 0;

      const ranking = await loadPdeRankingBoard(input.season, picks);
      const board = ranking.board;
      const rankingSource = ranking.rankingSource;
      const rankingEvidenceQuality = ranking.rankingEvidenceQuality;
      const rankingSourceNote = pdeRankingNote(rankingSource, input.season);

      const slot7 = Number(rosterPositions?.["7"] ?? 0);
      const superflexKnown = rules.source === "espn_reliable" && rosterPositions != null && Object.keys(rosterPositions).length > 0;
      const superflexSlots = superflexKnown && Number.isFinite(slot7) ? Math.max(0, slot7) : 0;
      const superflexStatus = superflexKnown ? (superflexSlots > 0 ? "present" : "none") : "unknown";
      if (superflexKnown && superflexSlots > 0) {
        lineupReqs.QB = Math.max(0, (lineupReqs.QB ?? 0) - superflexSlots);
      }

      return {
        leagueId,
        season: input.season,
        userTeamId,
        userTeamName: profile.selectedFranchiseName ?? profile.selectedOwnerName ?? `Team ${userTeamId}`,
        picks,
        board,
        lineupReqs,
        softCap: rules.softCap,
        hardCap: rules.hardCap,
        benchSlots: rules.benchSlots,
        superflexSlots,
        superflexStatus,
        rankingEvidenceQuality,
        receptionPoints,
        tePremium: receptionPoints >= 1,
        rankingSource,
        rankingSourceNote,
        pickSource: picksRes.source,
        pickCount: picks.length,
        debugReason: picksRes.debugReason ?? null,
        supportStatus: policy.support,
        recommendationCeiling: policy.recommendationCeiling,
        availabilityConfidence: policy.availabilityConfidence,
        rankingTier: policy.rankingTier,
        limitedRankingDisclosure: policy.limitedRankingDisclosure,
      };
    }),

  listSeasons: protectedProcedure
    .input(z.object({ activeLeagueKey: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      void input?.activeLeagueKey;
      const { leagueId } = await resolveActiveLeagueId({ user: { id: ctx.user.id } }, null, undefined);
      if (!leagueId) return [] as number[];
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({ season: gmDraftPicks.season })
        .from(gmDraftPicks)
        .where(eq(gmDraftPicks.leagueId, leagueId))
        .orderBy(desc(gmDraftPicks.season));
      return [...new Set(rows.map((r) => r.season).filter((s) => s > 0))];
    }),

  getNarrative: protectedProcedure
    .input(
      z.object({
        season: z.number().int().min(2009).max(2030),
        facts: z
          .object({
            evaluatorVersion: z.string(),
            narrativeVersion: z.string(),
            leagueId: z.string(),
            season: z.number(),
            teamId: z.number(),
            teamName: z.string(),
            overallGrade: z.string(),
            rivalsRedraftGrade: z.string(),
            overallConfidence: z.enum(["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"]),
          })
          .passthrough(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await resolvePremiumAccess(ctx.user))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Post-Draft Evaluation requires Rivals.",
        });
      }
      const { leagueId } = await resolveActiveLeagueId({ user: { id: ctx.user.id } }, null, input.season);
      if (!leagueId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active league." });
      }
      const profile = await resolveActiveProfile({ id: ctx.user.id, openId: ctx.user.openId });
      const userTeamId = profile.selectedTeamId;
      if (userTeamId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Select your team before running post-draft evaluation." });
      }
      if (input.facts.leagueId !== leagueId || input.facts.teamId !== userTeamId || input.facts.season !== input.season) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Narrative facts do not match the active league, team, and season." });
      }
      const { getPostDraftNarrative } = await import("./postDraftEvalNarrative");
      return getPostDraftNarrative({
        facts: input.facts as import("../client/src/lib/postDraftEval/narrative").NarrativeFacts,
        userId: ctx.user.id,
        leagueId,
      });
    }),
});
