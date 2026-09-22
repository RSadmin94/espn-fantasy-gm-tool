import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { gmRosterEntries, gmTeams, weeklyPlayerStats } from "../drizzle/schema";
import { requireAttributedLeagueId } from "./weeklySeasonIdentity";

const BENCH_SLOT = 20;
const IR_SLOT = 21;

/** ESPN lineupSlotId → positions that can legally occupy it. Same mapping as draftRealitySimulator. */
export const SLOT_ELIGIBLE: Record<number, string[]> = {
  0: ["QB"],
  2: ["RB"],
  4: ["WR"],
  6: ["TE"],
  15: ["D/ST"],
  16: ["D/ST"],
  17: ["K"],
  23: ["RB", "WR", "TE"],
  24: ["RB", "WR", "TE"],
  25: ["RB", "WR", "TE"],
};

export type LineupPlayer = {
  teamId: number;
  playerId: number;
  playerName: string;
  position: string;
  slotId: number | null;
  points: number;
  ownerId: string;
  ownerName: string;
};

export type PlayerOfGame = {
  playerId: number;
  playerName: string;
  teamId: number;
  ownerId: string;
  ownerName: string;
  points: number;
  teamScoreShare: number | null;
  nextTeammatePoints: number | null;
  evidence: string;
};

export type BenchRegretImpact =
  | "WIN_FLIP"
  | "NARROWED_LOSS"
  | "INCREASED_MARGIN"
  | "INSIGNIFICANT";

export type BenchRegret = {
  playerId: number;
  playerName: string;
  teamId: number;
  ownerId: string;
  ownerName: string;
  benchPoints: number;
  replacedStarterId: number;
  replacedStarterName: string;
  lowestStarterPoints: number;
  netImprovement: number;
  impact: BenchRegretImpact;
  evidence: string;
};

export function isStarterSlot(slotId: number | null | undefined): boolean {
  if (slotId == null) return false;
  return slotId !== BENCH_SLOT && slotId !== IR_SLOT;
}

export function normalizePosition(position: string | null | undefined): string {
  const p = String(position ?? "").trim().toUpperCase();
  if (p === "DST" || p === "DEF" || p === "D/ST") return "D/ST";
  return p;
}

export function canFillSlot(position: string, slotId: number | null | undefined): boolean {
  if (slotId == null || !isStarterSlot(slotId)) return false;
  const elig = SLOT_ELIGIBLE[slotId];
  if (!elig) return false;
  return elig.includes(normalizePosition(position));
}

export function playerOfGameForTeams(
  players: LineupPlayer[],
  teamIds: number[],
  teamScoreById?: Record<number, number>,
): PlayerOfGame | null {
  const ids = new Set(teamIds);
  const starters = players.filter((p) => ids.has(p.teamId) && isStarterSlot(p.slotId) && p.points > 0);
  if (starters.length === 0) return null;
  const top = starters.reduce((a, b) => (b.points > a.points ? b : a));
  const teammates = starters.filter((p) => p.teamId === top.teamId && p.playerId !== top.playerId);
  const next = teammates.length ? teammates.reduce((a, b) => (b.points > a.points ? b : a)).points : null;
  const teamScore = teamScoreById?.[top.teamId] ?? null;
  const share = teamScore && teamScore > 0 ? top.points / teamScore : null;
  return {
    playerId: top.playerId,
    playerName: top.playerName,
    teamId: top.teamId,
    ownerId: top.ownerId,
    ownerName: top.ownerName,
    points: top.points,
    teamScoreShare: share,
    nextTeammatePoints: next,
    evidence: `${top.playerName} led starters in this matchup with ${top.points.toFixed(2)} pts (canonical owner ${top.ownerName}).`,
  };
}

export function classifyBenchImpact(opts: {
  netImprovement: number;
  teamScore: number;
  opponentScore: number;
}): BenchRegretImpact {
  const { netImprovement, teamScore, opponentScore } = opts;
  const won = teamScore > opponentScore;
  const margin = Math.abs(teamScore - opponentScore);
  if (!won && netImprovement > margin) return "WIN_FLIP";
  if (!won && netImprovement >= 8) return "NARROWED_LOSS";
  if (won && netImprovement >= 10) return "INCREASED_MARGIN";
  return "INSIGNIFICANT";
}

/**
 * Meaningful bench regret: a benched player who could legally occupy a starter's
 * slot and would have improved the lineup. Highest bench score alone is not enough.
 */
export function benchRegretForTeam(
  players: LineupPlayer[],
  teamId: number,
  matchup?: { teamScore: number; opponentScore: number },
): BenchRegret | null {
  const team = players.filter((p) => p.teamId === teamId);
  const starters = team.filter((p) => isStarterSlot(p.slotId));
  const bench = team.filter((p) => p.slotId === BENCH_SLOT && p.points > 0);
  if (starters.length === 0 || bench.length === 0) return null;

  let best: {
    bench: LineupPlayer;
    starter: LineupPlayer;
    net: number;
  } | null = null;
  for (const b of bench) {
    for (const s of starters) {
      if (!canFillSlot(b.position, s.slotId)) continue;
      const net = b.points - s.points;
      if (net <= 0) continue;
      if (!best || net > best.net) best = { bench: b, starter: s, net };
    }
  }
  if (!best) return null;

  const impact = matchup
    ? classifyBenchImpact({
        netImprovement: best.net,
        teamScore: matchup.teamScore,
        opponentScore: matchup.opponentScore,
      })
    : best.net >= 8
      ? "NARROWED_LOSS"
      : "INSIGNIFICANT";
  if (impact === "INSIGNIFICANT" && best.net < 8) return null;

  return {
    playerId: best.bench.playerId,
    playerName: best.bench.playerName,
    teamId,
    ownerId: best.bench.ownerId,
    ownerName: best.bench.ownerName,
    benchPoints: best.bench.points,
    replacedStarterId: best.starter.playerId,
    replacedStarterName: best.starter.playerName,
    lowestStarterPoints: best.starter.points,
    netImprovement: Number(best.net.toFixed(2)),
    impact,
    evidence: `${best.bench.playerName} (${best.bench.points.toFixed(2)}) was eligible to replace ${best.starter.playerName} (${best.starter.points.toFixed(2)}) at slot ${best.starter.slotId}; net +${best.net.toFixed(2)} (${impact}).`,
  };
}

export function leagueWeekMvp(players: LineupPlayer[]): LineupPlayer | null {
  const starters = players.filter((p) => isStarterSlot(p.slotId) && p.points > 0);
  if (starters.length === 0) return null;
  return starters.reduce((a, b) => (b.points > a.points ? b : a));
}

/**
 * Ownership comes from teams.ownerId for (leagueId, season, teamId).
 * Never uses gm_weekly_player_stats.ownerKey.
 */
export async function loadLineupPlayersForWeek(
  leagueId: string,
  season: number,
  week: number,
): Promise<LineupPlayer[]> {
  const lid = requireAttributedLeagueId(leagueId);
  const db = await getDb();
  if (!db) return [];

  const [rosters, stats, teams] = await Promise.all([
    db
      .select()
      .from(gmRosterEntries)
      .where(and(eq(gmRosterEntries.leagueId, lid), eq(gmRosterEntries.season, season), eq(gmRosterEntries.week, week))),
    db
      .select()
      .from(weeklyPlayerStats)
      .where(and(eq(weeklyPlayerStats.leagueId, lid), eq(weeklyPlayerStats.season, season), eq(weeklyPlayerStats.week, week))),
    db
      .select()
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, lid), eq(gmTeams.season, season))),
  ]);

  const ownerByTeam = new Map<number, { ownerId: string; ownerName: string }>();
  for (const t of teams) {
    ownerByTeam.set(t.teamId, { ownerId: t.ownerId || "", ownerName: t.ownerName || t.name || `Team ${t.teamId}` });
  }

  const pointsByPlayer = new Map<number, number>();
  const posByPlayer = new Map<number, string>();
  for (const s of stats) {
    pointsByPlayer.set(s.playerId, (Number(s.fantasyPoints) || 0) / 100);
    if (s.position) posByPlayer.set(s.playerId, s.position);
  }

  return rosters.map((r) => {
    const owner = ownerByTeam.get(r.teamId) ?? { ownerId: "", ownerName: "" };
    const fromStats = pointsByPlayer.get(r.playerId);
    const points = fromStats != null ? fromStats : Number(r.actualPoints) || 0;
    return {
      teamId: r.teamId,
      playerId: r.playerId,
      playerName: r.playerName,
      position: normalizePosition(posByPlayer.get(r.playerId) || r.position),
      slotId: r.slotId,
      points,
      ownerId: owner.ownerId,
      ownerName: owner.ownerName,
    };
  });
}
