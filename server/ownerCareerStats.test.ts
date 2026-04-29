/**
 * Tests for ownerCareerStats endpoint logic
 */
import { describe, it, expect } from "vitest";

// ── Helper functions mirroring the endpoint logic ─────────────────────────────

function computeWinPct(wins: number, losses: number, ties: number): number {
  const total = wins + losses + ties;
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

function computePlayoffRate(appearances: number, seasons: number): number {
  return seasons > 0 ? Math.round((appearances / seasons) * 1000) / 10 : 0;
}

function determineChampion(
  schedule: Array<{ matchupPeriodId: number; playoffTierType: string; winner: string; home?: { teamId: number }; away?: { teamId: number } }>
): { championTeamId: number | null; runnerUpTeamId: number | null } {
  const completedPlayoffs = schedule.filter(
    (m) => m.playoffTierType === "WINNERS_BRACKET" && m.winner && m.winner !== "UNDECIDED"
  );
  if (completedPlayoffs.length === 0) return { championTeamId: null, runnerUpTeamId: null };

  const champMatchup = completedPlayoffs.reduce((a, b) =>
    a.matchupPeriodId >= b.matchupPeriodId ? a : b
  );

  if (champMatchup.winner === "HOME") {
    return { championTeamId: champMatchup.home?.teamId ?? null, runnerUpTeamId: champMatchup.away?.teamId ?? null };
  } else if (champMatchup.winner === "AWAY") {
    return { championTeamId: champMatchup.away?.teamId ?? null, runnerUpTeamId: champMatchup.home?.teamId ?? null };
  }
  return { championTeamId: null, runnerUpTeamId: null };
}

function buildH2H(
  matchups: Array<{ homeTeamId: number; awayTeamId: number; winner: "HOME" | "AWAY" | "TIE" }>
): Map<number, Map<number, { wins: number; losses: number; ties: number }>> {
  const h2h = new Map<number, Map<number, { wins: number; losses: number; ties: number }>>();
  const getOrCreate = (a: number, b: number) => {
    if (!h2h.has(a)) h2h.set(a, new Map());
    const inner = h2h.get(a)!;
    if (!inner.has(b)) inner.set(b, { wins: 0, losses: 0, ties: 0 });
    return inner.get(b)!;
  };
  for (const m of matchups) {
    const homeRec = getOrCreate(m.homeTeamId, m.awayTeamId);
    const awayRec = getOrCreate(m.awayTeamId, m.homeTeamId);
    if (m.winner === "HOME") { homeRec.wins++; awayRec.losses++; }
    else if (m.winner === "AWAY") { awayRec.wins++; homeRec.losses++; }
    else { homeRec.ties++; awayRec.ties++; }
  }
  return h2h;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("ownerCareerStats endpoint logic", () => {

  it("computes win percentage correctly", () => {
    expect(computeWinPct(8, 6, 0)).toBe(57.1);
    expect(computeWinPct(0, 14, 0)).toBe(0);
    expect(computeWinPct(14, 0, 0)).toBe(100);
    expect(computeWinPct(7, 7, 0)).toBe(50);
    expect(computeWinPct(0, 0, 0)).toBe(0);
  });

  it("computes playoff rate correctly", () => {
    expect(computePlayoffRate(6, 8)).toBe(75);
    expect(computePlayoffRate(0, 8)).toBe(0);
    expect(computePlayoffRate(8, 8)).toBe(100);
    expect(computePlayoffRate(0, 0)).toBe(0);
  });

  it("determines champion from WINNERS_BRACKET matchups — HOME wins", () => {
    const schedule = [
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "HOME", home: { teamId: 11 }, away: { teamId: 4 } },
      { matchupPeriodId: 14, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 7 }, away: { teamId: 11 } },
    ];
    const { championTeamId, runnerUpTeamId } = determineChampion(schedule);
    expect(championTeamId).toBe(11);
    expect(runnerUpTeamId).toBe(4);
  });

  it("determines champion from WINNERS_BRACKET matchups — AWAY wins", () => {
    const schedule = [
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 3 }, away: { teamId: 7 } },
    ];
    const { championTeamId, runnerUpTeamId } = determineChampion(schedule);
    expect(championTeamId).toBe(7);
    expect(runnerUpTeamId).toBe(3);
  });

  it("returns null champion when no completed playoff matchups exist", () => {
    const schedule = [
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "UNDECIDED", home: { teamId: 11 }, away: { teamId: 4 } },
    ];
    const { championTeamId } = determineChampion(schedule);
    expect(championTeamId).toBeNull();
  });

  it("builds H2H record correctly for two teams", () => {
    const matchups = [
      { homeTeamId: 1, awayTeamId: 2, winner: "HOME" as const },
      { homeTeamId: 2, awayTeamId: 1, winner: "AWAY" as const }, // team 1 wins again
      { homeTeamId: 1, awayTeamId: 2, winner: "AWAY" as const }, // team 2 wins
    ];
    const h2h = buildH2H(matchups);
    const team1vs2 = h2h.get(1)?.get(2);
    const team2vs1 = h2h.get(2)?.get(1);
    expect(team1vs2?.wins).toBe(2);
    expect(team1vs2?.losses).toBe(1);
    expect(team2vs1?.wins).toBe(1);
    expect(team2vs1?.losses).toBe(2);
  });

  it("handles ties in H2H correctly", () => {
    const matchups = [
      { homeTeamId: 5, awayTeamId: 6, winner: "TIE" as const },
    ];
    const h2h = buildH2H(matchups);
    expect(h2h.get(5)?.get(6)?.ties).toBe(1);
    expect(h2h.get(6)?.get(5)?.ties).toBe(1);
    expect(h2h.get(5)?.get(6)?.wins).toBe(0);
  });

  it("correctly identifies playoff appearances from playoffSeed", () => {
    const teams = [
      { playoffSeed: 1 },  // made playoffs
      { playoffSeed: 7 },  // made playoffs (7-team playoff)
      { playoffSeed: 8 },  // did NOT make playoffs
      { playoffSeed: 0 },  // did NOT make playoffs
    ];
    const playoffTeams = teams.filter((t) => t.playoffSeed > 0 && t.playoffSeed <= 7);
    expect(playoffTeams).toHaveLength(2);
  });

  it("selects best season by win percentage", () => {
    const seasons = [
      { season: 2022, wins: 5, losses: 9, ties: 0 },
      { season: 2023, wins: 11, losses: 3, ties: 0 },
      { season: 2024, wins: 8, losses: 6, ties: 0 },
    ];
    const sorted = [...seasons].sort((a, b) => {
      const aGames = a.wins + a.losses + a.ties;
      const bGames = b.wins + b.losses + b.ties;
      return (b.wins / bGames) - (a.wins / aGames);
    });
    expect(sorted[0].season).toBe(2023);
    expect(sorted[sorted.length - 1].season).toBe(2022);
  });

  it("sorts owners by win percentage descending", () => {
    const owners = [
      { displayName: "Alice", winPct: 45 },
      { displayName: "Bob", winPct: 62 },
      { displayName: "Carol", winPct: 55 },
    ];
    const sorted = [...owners].sort((a, b) => b.winPct - a.winPct);
    expect(sorted[0].displayName).toBe("Bob");
    expect(sorted[1].displayName).toBe("Carol");
    expect(sorted[2].displayName).toBe("Alice");
  });
});
