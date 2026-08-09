/**
 * RFSN-053B/C — tRPC gallery query + viewer get.
 * Query semantics stay in queryMatchupGallery. Viewer loads recorded lineups only.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, publicProcedure } from "./_core/trpc";
import { getDb, resolveActiveLeagueId } from "./db";
import { gmMatchups, gmTeams } from "../drizzle/schema";
import { buildOwnerIdentityAuthority } from "./ownerIdentityAuthority";
import { parsePlayoffTierFromRawMatchup } from "./matchupPlayoffTier";
import {
  playoffKindFromRaw,
  queryMatchupGallery,
  type GalleryFilter,
  type GalleryGameRecord,
} from "./matchupGalleryQuery";
import { emptyViewerSide, loadMatchupLineups, type MatchupViewerPayload } from "./matchupGalleryViewer";

export const galleryFilterInput = z.object({
  activeLeagueKey: z.string().optional(),
  ownerPersonId: z.string().optional(),
  ownerName: z.string().optional(),
  opponentPersonId: z.string().optional(),
  opponentName: z.string().optional(),
  seasonFrom: z.number().int().optional(),
  seasonTo: z.number().int().optional(),
  week: z.number().int().optional(),
  phase: z.enum(["regular", "playoffs", "all"]).optional(),
  result: z.enum(["win", "loss", "tie", "any"]).optional(),
  onePoint: z.boolean().optional(),
  marginMin: z.number().optional(),
  marginMax: z.number().optional(),
  noMercy: z.boolean().optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  championshipGames: z.boolean().optional(),
  sort: z
    .enum(["newest", "oldest", "closest", "margin_desc", "highest_score", "lowest_score"])
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
});

export async function loadGalleryGames(leagueId: string): Promise<GalleryGameRecord[]> {
  const db = await getDb();
  if (!db) return [];

  const identity = await buildOwnerIdentityAuthority(leagueId);
  const teamRows = await db
    .select({
      season: gmTeams.season,
      teamId: gmTeams.teamId,
      teamName: gmTeams.name,
      logoUrl: gmTeams.logoUrl,
    })
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, leagueId));
  const teamByKey = new Map<string, { name: string | null; logoUrl: string | null }>();
  for (const t of teamRows) {
    if (t.teamId > 0) {
      teamByKey.set(`${t.season}:${t.teamId}`, {
        name: t.teamName || null,
        logoUrl: t.logoUrl || null,
      });
    }
  }

  const rows = await db.select().from(gmMatchups).where(eq(gmMatchups.leagueId, leagueId));
  const out: GalleryGameRecord[] = [];

  for (const r of rows) {
    if (!r.isCompleted) continue;
    const home = identity.resolve(r.season, r.homeTeamId);
    const away = identity.resolve(r.season, r.awayTeamId);
    const homeScore = Number(r.homeScore) || 0;
    const awayScore = Number(r.awayScore) || 0;

    let winnerPersonId: string | null = null;
    if (r.winnerTeamId != null) {
      const w = identity.resolve(r.season, r.winnerTeamId);
      if (w.status === "resolved" && w.canonicalPersonId) winnerPersonId = w.canonicalPersonId;
    }
    if (winnerPersonId == null) {
      if (homeScore > awayScore) {
        winnerPersonId = home.status === "resolved" ? home.canonicalPersonId ?? null : null;
      } else if (awayScore > homeScore) {
        winnerPersonId = away.status === "resolved" ? away.canonicalPersonId ?? null : null;
      }
    }

    const playoffTierType = parsePlayoffTierFromRawMatchup(
      r.rawMatchup != null ? String(r.rawMatchup) : null,
    );
    const isPlayoff = !!r.isPlayoff;
    const homeMeta = teamByKey.get(`${r.season}:${r.homeTeamId}`);
    const awayMeta = teamByKey.get(`${r.season}:${r.awayTeamId}`);

    out.push({
      matchupId: r.id,
      season: r.season,
      week: r.week,
      matchupPeriodId: r.matchupPeriodId,
      isPlayoff,
      playoffTierType,
      playoffKind: playoffKindFromRaw(playoffTierType, isPlayoff),
      homeTeamId: r.homeTeamId,
      awayTeamId: r.awayTeamId,
      homeScore,
      awayScore,
      homePersonId: home.status === "resolved" ? home.canonicalPersonId ?? null : null,
      awayPersonId: away.status === "resolved" ? away.canonicalPersonId ?? null : null,
      homePersonName: home.canonicalName ?? null,
      awayPersonName: away.canonicalName ?? null,
      homeTeamName: homeMeta?.name ?? null,
      awayTeamName: awayMeta?.name ?? null,
      homeLogoUrl: homeMeta?.logoUrl ?? null,
      awayLogoUrl: awayMeta?.logoUrl ?? null,
      winnerPersonId,
    });
  }

  return out;
}

async function resolveGalleryLeagueId(userId: number, activeLeagueKey?: string): Promise<string | null> {
  const { leagueId } = await resolveActiveLeagueId(
    { user: { id: userId } },
    activeLeagueKey && !activeLeagueKey.startsWith("__") ? activeLeagueKey.trim().slice(0, 32) : null,
    undefined,
  );
  return leagueId || null;
}

export const matchupGalleryRouter = router({
  query: publicProcedure.input(galleryFilterInput).query(async ({ ctx, input }) => {
    const filter: GalleryFilter = { ...input };
    if (!ctx.user?.id) {
      return queryMatchupGallery([], filter);
    }
    const leagueId = await resolveGalleryLeagueId(ctx.user.id, input.activeLeagueKey);
    if (!leagueId) return queryMatchupGallery([], filter);
    const games = await loadGalleryGames(leagueId);
    return queryMatchupGallery(games, filter);
  }),

  get: publicProcedure
    .input(
      z.object({
        matchupId: z.number().int(),
        activeLeagueKey: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<MatchupViewerPayload> => {
      const empty: MatchupViewerPayload = {
        matchup: null,
        scoringPrecision: null,
        leagueName: null,
        coverageNote: null,
        home: null,
        away: null,
        lineupNote: "No recorded matchup matched that id.",
      };
      if (!ctx.user?.id) return empty;
      const leagueId = await resolveGalleryLeagueId(ctx.user.id, input.activeLeagueKey);
      if (!leagueId) return empty;

      const games = await loadGalleryGames(leagueId);
      const rec = games.find((g) => g.matchupId === input.matchupId);
      if (!rec) return empty;

      const gallery = queryMatchupGallery(games, {
        seasonFrom: rec.season,
        seasonTo: rec.season,
        week: rec.week,
        phase: "all",
        limit: 80,
      });
      const matchup = gallery.matchups.find((m) => m.matchupId === input.matchupId) ?? null;
      if (!matchup) return { ...empty, scoringPrecision: gallery.coverage.scoringPrecision };

      const db = await getDb();
      const sides = db
        ? await loadMatchupLineups(db, {
            season: matchup.season,
            week: matchup.week,
            homeTeamId: matchup.homeTeamId,
            awayTeamId: matchup.awayTeamId,
            homeDisplayName: matchup.homeDisplayName,
            awayDisplayName: matchup.awayDisplayName,
            homeTeamName: matchup.homeTeamName,
            awayTeamName: matchup.awayTeamName,
            homeScore: matchup.homeScore,
            awayScore: matchup.awayScore,
          })
        : {
            home: emptyViewerSide(
              matchup.homeTeamId,
              matchup.homeDisplayName,
              matchup.homeTeamName,
              matchup.homeScore,
            ),
            away: emptyViewerSide(
              matchup.awayTeamId,
              matchup.awayDisplayName,
              matchup.awayTeamName,
              matchup.awayScore,
            ),
            lineupNote: "Player lineups were not recorded for this week.",
          };

      return {
        matchup,
        scoringPrecision: gallery.coverage.scoringPrecision,
        leagueName: null,
        coverageNote: gallery.summary,
        home: sides.home,
        away: sides.away,
        lineupNote: sides.lineupNote,
      };
    }),
});
