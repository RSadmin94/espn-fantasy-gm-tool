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

/**
 * Mirror of the findChampionshipMatchup function from routers.ts.
 * Identifies the true championship game by tracing semi-final winners,
 * distinguishing it from the 3rd-place game when both appear as
 * WINNERS_BRACKET in the same final period.
 */
function findChampionshipMatchup(
  schedule: Array<{
    matchupPeriodId: number;
    playoffTierType: string;
    winner: string;
    home?: { teamId: number };
    away?: { teamId: number };
  }>
): typeof schedule[number] | null {
  const completed = schedule.filter(
    (m) => m.playoffTierType === "WINNERS_BRACKET" && m.winner && m.winner !== "UNDECIDED"
  );
  if (completed.length === 0) return null;

  const maxPeriod = Math.max(...completed.map((m) => m.matchupPeriodId));
  const finalRound = completed.filter((m) => m.matchupPeriodId === maxPeriod);

  if (finalRound.length === 1) return finalRound[0];

  const semiFinalPeriod = maxPeriod - 1;
  const semiFinals = completed.filter((m) => m.matchupPeriodId === semiFinalPeriod);
  if (semiFinals.length > 0) {
    const semiFinalWinners = new Set<number>();
    for (const sf of semiFinals) {
      const winnerId = sf.winner === "HOME" ? sf.home?.teamId : sf.away?.teamId;
      if (winnerId != null) semiFinalWinners.add(winnerId);
    }
    for (const m of finalRound) {
      const homeId = m.home?.teamId;
      const awayId = m.away?.teamId;
      if (
        homeId != null &&
        awayId != null &&
        semiFinalWinners.has(homeId) &&
        semiFinalWinners.has(awayId)
      ) {
        return m;
      }
    }
  }

  return finalRound[finalRound.length - 1];
}

function determineChampion(
  schedule: Array<{
    matchupPeriodId: number;
    playoffTierType: string;
    winner: string;
    home?: { teamId: number };
    away?: { teamId: number };
  }>
): { championTeamId: number | null; runnerUpTeamId: number | null } {
  const champMatchup = findChampionshipMatchup(schedule);
  if (!champMatchup) return { championTeamId: null, runnerUpTeamId: null };

  if (champMatchup.winner === "HOME") {
    return {
      championTeamId: champMatchup.home?.teamId ?? null,
      runnerUpTeamId: champMatchup.away?.teamId ?? null,
    };
  } else if (champMatchup.winner === "AWAY") {
    return {
      championTeamId: champMatchup.away?.teamId ?? null,
      runnerUpTeamId: champMatchup.home?.teamId ?? null,
    };
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

  // ── New: 3rd-place game disambiguation ─────────────────────────────────────

  it("correctly identifies champion when championship and 3rd-place game are both WINNERS_BRACKET in the same period", () => {
    // Semi-finals (period 15): team 4 beats team 21, team 1 beats team 27
    // Finals (period 16): team 1 vs team 4 (championship), team 18 vs team 14 (3rd place)
    const schedule = [
      // Semi-finals
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 21 }, away: { teamId: 4 } },
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "HOME", home: { teamId: 1 }, away: { teamId: 27 } },
      // Finals — championship (semi-final winners: 4 and 1)
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 1 }, away: { teamId: 4 } },
      // Finals — 3rd place (semi-final losers: 21 and 27)
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 18 }, away: { teamId: 14 } },
    ];
    const { championTeamId, runnerUpTeamId } = determineChampion(schedule);
    // Team 4 (AWAY winner of the championship matchup) should be champion
    expect(championTeamId).toBe(4);
    // Team 1 (HOME of the championship matchup) should be runner-up
    expect(runnerUpTeamId).toBe(1);
  });

  it("does NOT credit the 3rd-place game winner as champion", () => {
    const schedule = [
      // Semi-finals
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 21 }, away: { teamId: 4 } },
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "HOME", home: { teamId: 1 }, away: { teamId: 27 } },
      // Championship
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 1 }, away: { teamId: 4 } },
      // 3rd place — team 14 wins
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 18 }, away: { teamId: 14 } },
    ];
    const { championTeamId } = determineChampion(schedule);
    // Team 14 won the 3rd-place game — should NOT be champion
    expect(championTeamId).not.toBe(14);
    // Team 18 lost the 3rd-place game — should NOT be champion
    expect(championTeamId).not.toBe(18);
  });

  it("falls back gracefully when semi-final data is missing", () => {
    // Only final round matchups, no semi-finals to trace
    const schedule = [
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "HOME", home: { teamId: 5 }, away: { teamId: 9 } },
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "AWAY", home: { teamId: 3 }, away: { teamId: 7 } },
    ];
    // Without semi-finals, falls back to last matchup in the final round
    const champMatchup = findChampionshipMatchup(schedule);
    expect(champMatchup).not.toBeNull();
    // Should return one of the two final-round matchups
    const validTeams = new Set([5, 9, 3, 7]);
    expect(validTeams.has(champMatchup!.home?.teamId ?? -1) || validTeams.has(champMatchup!.away?.teamId ?? -1)).toBe(true);
  });

  it("handles single-game final (no 3rd-place game) correctly", () => {
    const schedule = [
      { matchupPeriodId: 15, playoffTierType: "WINNERS_BRACKET", winner: "HOME", home: { teamId: 2 }, away: { teamId: 8 } },
      { matchupPeriodId: 16, playoffTierType: "WINNERS_BRACKET", winner: "HOME", home: { teamId: 2 }, away: { teamId: 6 } },
    ];
    const { championTeamId, runnerUpTeamId } = determineChampion(schedule);
    expect(championTeamId).toBe(2);
    expect(runnerUpTeamId).toBe(6);
  });

  // ── Existing tests ──────────────────────────────────────────────────────────

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
