/**
 * RFSN-053C — Historical Matchup Viewer lineup loader.
 * Does not change gallery query semantics. Honest empty when week lineups are missing.
 */
import { and, eq, inArray } from "drizzle-orm";
import { gmPlayerRegistry, gmWeeklyPlayerStats, weeklyPlayerStats } from "../drizzle/schema";
import type { getDb } from "./db";
import type { GalleryMatchup, ScoringPrecision } from "./matchupGalleryQuery";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ViewerLineupSource = "gm_weekly_player_stats" | "weekly_player_stats" | "none";

export type ViewerLineupPlayer = {
  playerId: number;
  playerName: string;
  position: string;
  slotLabel: string;
  points: number | null;
  isStarter: boolean;
  isBench: boolean;
};

export type ViewerSideLineup = {
  teamId: number;
  ownerName: string;
  teamName: string | null;
  score: number;
  starters: ViewerLineupPlayer[];
  bench: ViewerLineupPlayer[];
  roster: ViewerLineupPlayer[];
  source: ViewerLineupSource;
};

export type MatchupViewerPayload = {
  matchup: GalleryMatchup | null;
  scoringPrecision: ScoringPrecision | null;
  leagueName: string | null;
  coverageNote: string | null;
  home: ViewerSideLineup | null;
  away: ViewerSideLineup | null;
  lineupNote: string | null;
};

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "D/ST", "DST", "DEF", "FLEX", "BN", "BENCH", "IR"];

export function slotLabelForWeekly(isStarter: boolean, rosterSlotId: number | null | undefined, position: string): string {
  if (rosterSlotId === 2) return "IR";
  if (!isStarter || rosterSlotId === 0) return "BN";
  return position?.trim() || "FLEX";
}

export function sortLineupPlayers(rows: ViewerLineupPlayer[]): ViewerLineupPlayer[] {
  return [...rows].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.position.toUpperCase());
    const bi = POSITION_ORDER.indexOf(b.position.toUpperCase());
    const aOrder = ai === -1 ? 99 : ai;
    const bOrder = bi === -1 ? 99 : bi;
    return aOrder - bOrder || (b.points ?? -1) - (a.points ?? -1) || a.playerName.localeCompare(b.playerName);
  });
}

export function emptyViewerSide(
  teamId: number,
  ownerName: string,
  teamName: string | null,
  score: number,
  source: ViewerLineupSource = "none",
): ViewerSideLineup {
  return { teamId, ownerName, teamName, score, starters: [], bench: [], roster: [], source };
}

function buildUndifferentiatedRoster(
  teamId: number,
  ownerName: string,
  teamName: string | null,
  score: number,
  players: ViewerLineupPlayer[],
  source: ViewerLineupSource,
): ViewerSideLineup {
  return {
    teamId,
    ownerName,
    teamName,
    score,
    starters: [],
    bench: [],
    roster: sortLineupPlayers(players),
    source,
  };
}

function buildSplitLineup(
  teamId: number,
  ownerName: string,
  teamName: string | null,
  score: number,
  players: ViewerLineupPlayer[],
  source: ViewerLineupSource,
): ViewerSideLineup {
  const starters = sortLineupPlayers(players.filter((p) => p.isStarter));
  const bench = sortLineupPlayers(players.filter((p) => !p.isStarter));
  return { teamId, ownerName, teamName, score, starters, bench, roster: [], source };
}

export async function loadMatchupLineups(
  db: AppDb,
  rec: {
    season: number;
    week: number;
    homeTeamId: number;
    awayTeamId: number;
    homeDisplayName: string;
    awayDisplayName: string;
    homeTeamName: string | null;
    awayTeamName: string | null;
    homeScore: number;
    awayScore: number;
  },
): Promise<{ home: ViewerSideLineup; away: ViewerSideLineup; lineupNote: string | null }> {
  const teamIds = [rec.homeTeamId, rec.awayTeamId];
  const weeklyRows = await db
    .select({
      playerId: gmWeeklyPlayerStats.playerId,
      teamId: gmWeeklyPlayerStats.teamId,
      pointsScored: gmWeeklyPlayerStats.pointsScored,
      isStarter: gmWeeklyPlayerStats.isStarter,
      rosterSlotId: gmWeeklyPlayerStats.rosterSlotId,
      fullName: gmPlayerRegistry.fullName,
      position: gmPlayerRegistry.position,
    })
    .from(gmWeeklyPlayerStats)
    .leftJoin(gmPlayerRegistry, eq(gmWeeklyPlayerStats.playerId, gmPlayerRegistry.id))
    .where(
      and(
        eq(gmWeeklyPlayerStats.season, rec.season),
        eq(gmWeeklyPlayerStats.week, rec.week),
        inArray(gmWeeklyPlayerStats.teamId, teamIds),
      ),
    );

  if (weeklyRows.length > 0) {
    const byTeam = new Map<number, ViewerLineupPlayer[]>();
    for (const row of weeklyRows) {
      const teamId = Number(row.teamId);
      if (!Number.isFinite(teamId)) continue;
      const position = String(row.position ?? "").trim() || "?";
      const isStarter = !!row.isStarter;
      const player: ViewerLineupPlayer = {
        playerId: Number(row.playerId),
        playerName: String(row.fullName ?? "").trim() || `Player ${row.playerId}`,
        position,
        slotLabel: slotLabelForWeekly(isStarter, row.rosterSlotId, position),
        points: row.pointsScored != null ? Number(row.pointsScored) : null,
        isStarter,
        isBench: !isStarter,
      };
      const list = byTeam.get(teamId) ?? [];
      list.push(player);
      byTeam.set(teamId, list);
    }
    return {
      home: buildSplitLineup(
        rec.homeTeamId,
        rec.homeDisplayName,
        rec.homeTeamName,
        rec.homeScore,
        byTeam.get(rec.homeTeamId) ?? [],
        "gm_weekly_player_stats",
      ),
      away: buildSplitLineup(
        rec.awayTeamId,
        rec.awayDisplayName,
        rec.awayTeamName,
        rec.awayScore,
        byTeam.get(rec.awayTeamId) ?? [],
        "gm_weekly_player_stats",
      ),
      lineupNote: null,
    };
  }

  const legacyRows = await db
    .select({
      playerId: weeklyPlayerStats.playerId,
      playerName: weeklyPlayerStats.playerName,
      position: weeklyPlayerStats.position,
      teamId: weeklyPlayerStats.teamId,
      fantasyPoints: weeklyPlayerStats.fantasyPoints,
    })
    .from(weeklyPlayerStats)
    .where(
      and(
        eq(weeklyPlayerStats.season, rec.season),
        eq(weeklyPlayerStats.week, rec.week),
        inArray(weeklyPlayerStats.teamId, teamIds),
      ),
    );

  if (legacyRows.length > 0) {
    const byTeam = new Map<number, ViewerLineupPlayer[]>();
    for (const row of legacyRows) {
      const teamId = Number(row.teamId);
      if (!Number.isFinite(teamId)) continue;
      const position = String(row.position ?? "").trim() || "?";
      const pts = row.fantasyPoints != null ? Number(row.fantasyPoints) / 100 : null;
      const player: ViewerLineupPlayer = {
        playerId: Number(row.playerId),
        playerName: String(row.playerName ?? "").trim() || `Player ${row.playerId}`,
        position,
        slotLabel: position,
        points: pts,
        isStarter: false,
        isBench: false,
      };
      const list = byTeam.get(teamId) ?? [];
      list.push(player);
      byTeam.set(teamId, list);
    }
    return {
      home: buildUndifferentiatedRoster(
        rec.homeTeamId,
        rec.homeDisplayName,
        rec.homeTeamName,
        rec.homeScore,
        byTeam.get(rec.homeTeamId) ?? [],
        "weekly_player_stats",
      ),
      away: buildUndifferentiatedRoster(
        rec.awayTeamId,
        rec.awayDisplayName,
        rec.awayTeamName,
        rec.awayScore,
        byTeam.get(rec.awayTeamId) ?? [],
        "weekly_player_stats",
      ),
      lineupNote: "Starter and bench slots were not recorded for this week. Showing the recorded roster.",
    };
  }

  return {
    home: emptyViewerSide(rec.homeTeamId, rec.homeDisplayName, rec.homeTeamName, rec.homeScore),
    away: emptyViewerSide(rec.awayTeamId, rec.awayDisplayName, rec.awayTeamName, rec.awayScore),
    lineupNote: "Player lineups were not recorded for this week.",
  };
}
