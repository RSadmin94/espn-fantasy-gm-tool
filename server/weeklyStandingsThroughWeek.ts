/**
 * Re-derive standings through a completed week from existing matchups.
 * Used so completed-week snapshots do not depend on the live (week-0) ESPN standings blob.
 */

export type StandingsTeamSeed = {
  teamId: number;
  name?: string;
};

export type StandingsMatchup = {
  matchupPeriodId?: number | null;
  week?: number | null;
  isCompleted?: boolean | number | null;
  winnerTeamId?: number | null;
  homeTeamId: number;
  awayTeamId: number;
  homeScore?: number | null;
  awayScore?: number | null;
};

export type StandingsThroughWeekRow = {
  teamId: number;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
};

function weekOf(m: StandingsMatchup): number {
  return Number(m.matchupPeriodId ?? m.week ?? 0) || 0;
}

function completed(m: StandingsMatchup): boolean {
  if (m.isCompleted === true || m.isCompleted === 1) return true;
  const winner = Number(m.winnerTeamId);
  return Number.isFinite(winner) && winner > 0;
}

export function buildStandingsThroughWeek(
  teams: StandingsTeamSeed[],
  matchups: StandingsMatchup[],
  throughWeek: number,
): StandingsThroughWeekRow[] {
  const byTeam = new Map<number, StandingsThroughWeekRow>();
  for (const t of teams) {
    const teamId = Number(t.teamId);
    if (!Number.isFinite(teamId)) continue;
    byTeam.set(teamId, {
      teamId,
      rank: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  for (const m of matchups) {
    if (weekOf(m) < 1 || weekOf(m) > throughWeek) continue;
    if (!completed(m)) continue;
    const home = byTeam.get(Number(m.homeTeamId));
    const away = byTeam.get(Number(m.awayTeamId));
    if (!home || !away) continue;
    const hs = Number(m.homeScore) || 0;
    const as = Number(m.awayScore) || 0;
    home.pointsFor += hs;
    home.pointsAgainst += as;
    away.pointsFor += as;
    away.pointsAgainst += hs;
    const winner = Number(m.winnerTeamId);
    if (winner === home.teamId) {
      home.wins += 1;
      away.losses += 1;
    } else if (winner === away.teamId) {
      away.wins += 1;
      home.losses += 1;
    } else if (hs === as) {
      home.ties += 1;
      away.ties += 1;
    } else if (hs > as) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }

  const ranked = Array.from(byTeam.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.teamId - b.teamId;
  });
  ranked.forEach((row, i) => {
    row.rank = i + 1;
  });
  return ranked;
}
