import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import type { UniversalLeague } from "./providers/types";
import { getDb } from "./db";
import {
  gmTeams,
  gmMatchups,
  gmTransactions,
  gmDraftPicks,
  gmRosterEntries,
  gmLeagueSettings,
} from "../drizzle/schema";
import {
  persistUniversalLeague,
  countUniversalPersistRows,
} from "./universalPersistence";
import { txPlayerKey } from "./transactionPersist";
import { prepareSleeperIntegrationTest } from "./testing/sleeperIntegrationHarness";

const TEST_LEAGUE_ID = "univpersisttest01";
const TEST_SEASON = 2099;

function buildFixtureLeague(overrides?: Partial<{ team1Wins: number }>): UniversalLeague {
  const team1Wins = overrides?.team1Wins ?? 3;
  return {
    settings: {
      leagueId: TEST_LEAGUE_ID,
      provider: "sleeper",
      season: TEST_SEASON,
      leagueName: "Universal Persist Test League",
      teamCount: 4,
      scoringType: "ppr",
      playoffTeamCount: 2,
      regularSeasonWeeks: 14,
      currentWeek: 5,
      isActive: true,
      tradeDeadlineMs: 1_700_000_000_000,
    },
    teams: [
      {
        teamId: "1",
        ownerId: "owner_alpha",
        ownerName: "Alpha Owner",
        ownerNames: ["Alpha Owner"],
        teamName: "Alpha Squad",
        abbreviation: "ALPH",
        wins: team1Wins,
        losses: 1,
        ties: 0,
        pointsFor: 412.5,
        pointsAgainst: 380.2,
        winPct: 0.75,
        standingRank: 1,
        playoffSeed: 1,
      },
      {
        teamId: "2",
        ownerId: "owner_beta",
        ownerName: "Beta Owner",
        ownerNames: ["Beta Owner"],
        teamName: "Beta Ballers",
        abbreviation: "BETA",
        wins: 2,
        losses: 2,
        ties: 0,
        pointsFor: 398.1,
        pointsAgainst: 401.0,
        winPct: 0.5,
        standingRank: 2,
        playoffSeed: 2,
      },
      {
        teamId: "3",
        ownerId: "owner_gamma",
        ownerName: "Gamma Owner",
        ownerNames: ["Gamma Owner"],
        teamName: "Gamma Grid",
        abbreviation: "GAMM",
        wins: 1,
        losses: 3,
        ties: 0,
        pointsFor: 350.0,
        pointsAgainst: 420.0,
        winPct: 0.25,
        standingRank: 3,
      },
      {
        teamId: "4",
        ownerId: "owner_delta",
        ownerName: "Delta Owner",
        ownerNames: ["Delta Owner"],
        teamName: "Delta Dynasty",
        abbreviation: "DELT",
        wins: 0,
        losses: 4,
        ties: 0,
        pointsFor: 300.0,
        pointsAgainst: 450.0,
        winPct: 0,
        standingRank: 4,
      },
    ],
    matchups: [
      {
        season: TEST_SEASON,
        week: 1,
        homeTeamId: "1",
        awayTeamId: "2",
        homeScore: 112.4,
        awayScore: 98.7,
        winner: "home",
        isPlayoff: false,
      },
      {
        season: TEST_SEASON,
        week: 2,
        homeTeamId: "3",
        awayTeamId: "4",
        homeScore: 85.0,
        awayScore: 90.2,
        winner: "away",
        isPlayoff: false,
      },
      {
        season: TEST_SEASON,
        week: 3,
        homeTeamId: "1",
        awayTeamId: "3",
        homeScore: 100.0,
        awayScore: 100.0,
        winner: "tie",
        isPlayoff: false,
      },
      {
        season: TEST_SEASON,
        week: 5,
        homeTeamId: "2",
        awayTeamId: "4",
        homeScore: 50.0,
        awayScore: 48.0,
        winner: "undecided",
        isPlayoff: false,
      },
      {
        season: TEST_SEASON,
        week: 15,
        homeTeamId: "1",
        awayTeamId: "2",
        homeScore: 120.0,
        awayScore: 115.5,
        winner: "home",
        isPlayoff: true,
      },
    ],
    transactions: [
      {
        transactionId: "trade_multi_001",
        season: TEST_SEASON,
        type: "TRADE",
        status: "EXECUTED",
        timestampMs: 1_700_100_000_000,
        teamId: "1",
        playerId: "401",
        playerName: "Player One",
        playerPosition: "RB",
        fromTeamId: "1",
        toTeamId: "2",
      },
      {
        transactionId: "trade_multi_001",
        season: TEST_SEASON,
        type: "TRADE",
        status: "EXECUTED",
        timestampMs: 1_700_100_000_000,
        teamId: "2",
        playerId: "402",
        playerName: "Player Two",
        playerPosition: "WR",
        fromTeamId: "2",
        toTeamId: "1",
      },
      {
        transactionId: "waiver_add_001",
        season: TEST_SEASON,
        type: "WAIVER",
        status: "EXECUTED",
        timestampMs: 1_700_200_000_000,
        teamId: "3",
        playerId: "403",
        playerName: "Waiver Target",
        playerPosition: "TE",
        faabBid: 12,
      },
    ],
    draftPicks: [
      {
        season: TEST_SEASON,
        round: 1,
        pickInRound: 1,
        overallPick: 1,
        teamId: "1",
        playerId: "501",
        playerName: "First Overall",
        position: "RB",
        nflTeam: "KC",
      },
      {
        season: TEST_SEASON,
        round: 1,
        pickInRound: 2,
        overallPick: 2,
        teamId: "2",
        playerId: "502",
        playerName: "Second Overall",
        position: "WR",
        nflTeam: "BUF",
        isKeeper: true,
      },
    ],
    rosters: [
      {
        teamId: "1",
        season: TEST_SEASON,
        slots: [
          {
            player: {
              playerId: "501",
              playerName: "First Overall",
              position: "RB",
              nflTeam: "KC",
            },
            slotType: "starter",
            lineupSlot: "RB",
          },
          {
            player: {
              playerId: "601",
              playerName: "Bench Player",
              position: "WR",
              nflTeam: "DAL",
            },
            slotType: "bench",
            lineupSlot: "BN",
          },
        ],
      },
      {
        teamId: "2",
        season: TEST_SEASON,
        slots: [
          {
            player: {
              playerId: "502",
              playerName: "Second Overall",
              position: "WR",
              nflTeam: "BUF",
            },
            slotType: "starter",
            lineupSlot: "WR",
          },
        ],
      },
    ],
  };
}

let dbAvailable = false;

beforeAll(async () => {
  dbAvailable = await prepareSleeperIntegrationTest("universalPersistence");
}, 60_000);

afterAll(async () => {
  if (dbAvailable) {
    const { cleanupSleeperIntegrationScope } = await import("./testing/sleeperIntegrationCleanup");
    await cleanupSleeperIntegrationScope("universalPersistence");
  }
}, 60_000);

describe("universalPersistence", () => {
  it("requires database for integration tests", () => {
    expect(dbAvailable, "DATABASE_URL / getDb() required").toBe(true);
  });

  it("dry run performs zero DB writes and returns expected counts", async () => {
    if (!dbAvailable) return;
    const before = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(before.settings).toBe(0);

    const league = buildFixtureLeague();
    const result = await persistUniversalLeague(league, { dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.counts.settings).toEqual({ attempted: 1, persisted: 1 });
    expect(result.counts.teams).toEqual({ attempted: 4, persisted: 4 });
    expect(result.counts.matchups).toEqual({ attempted: 5, persisted: 5 });
    expect(result.counts.transactions).toEqual({ attempted: 3, persisted: 3 });
    expect(result.counts.draftPicks).toEqual({ attempted: 2, persisted: 2 });
    expect(result.counts.rosterEntries).toEqual({ attempted: 3, persisted: 3 });

    const after = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(after).toEqual(before);
  }, 30_000);

  it("first persist creates expected row counts", async () => {
    if (!dbAvailable) return;

    const result = await persistUniversalLeague(buildFixtureLeague());
    expect(result.failures).toHaveLength(0);
    expect(result.counts.settings.persisted).toBe(1);
    expect(result.counts.teams.persisted).toBe(4);
    expect(result.counts.matchups.persisted).toBe(5);
    expect(result.counts.transactions.persisted).toBe(3);
    expect(result.counts.draftPicks.persisted).toBe(2);
    expect(result.counts.rosterEntries.persisted).toBe(3);

    const rows = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(rows.settings).toBe(1);
    expect(rows.teams).toBe(4);
    expect(rows.matchups).toBe(5);
    expect(rows.transactions).toBe(3);
    expect(rows.draftPicks).toBe(2);
    expect(rows.rosterEntries).toBe(3);
  }, 30_000);

  it("second identical persist keeps row counts unchanged", async () => {
    if (!dbAvailable) return;
    const before = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    const result = await persistUniversalLeague(buildFixtureLeague());
    expect(result.failures).toHaveLength(0);
    const after = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(after).toEqual(before);
  }, 30_000);

  it("upsert updates a changed field without duplicating rows", async () => {
    if (!dbAvailable) return;
    const before = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);

    await persistUniversalLeague(buildFixtureLeague({ team1Wins: 99 }));

    const db = await getDb();
    expect(db).not.toBeNull();
    const [team] = await db!
      .select({ wins: gmTeams.wins })
      .from(gmTeams)
      .where(
        and(
          eq(gmTeams.leagueId, TEST_LEAGUE_ID),
          eq(gmTeams.season, TEST_SEASON),
          eq(gmTeams.teamId, 1),
        ),
      )
      .limit(1);
    expect(team?.wins).toBe(99);

    const after = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(after).toEqual(before);
  }, 30_000);

  it("persists owner IDs on teams", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    expect(db).not.toBeNull();
    const rows = await db!
      .select({ teamId: gmTeams.teamId, ownerId: gmTeams.ownerId })
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, TEST_LEAGUE_ID), eq(gmTeams.season, TEST_SEASON)))
      .orderBy(gmTeams.teamId);

    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.ownerId)).toEqual([
      "owner_alpha",
      "owner_beta",
      "owner_gamma",
      "owner_delta",
    ]);
  });

  it("persists matchup completion and winner fields correctly", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    expect(db).not.toBeNull();
    const rows = await db!
      .select({
        week: gmMatchups.week,
        winnerTeamId: gmMatchups.winnerTeamId,
        isCompleted: gmMatchups.isCompleted,
        isPlayoff: gmMatchups.isPlayoff,
      })
      .from(gmMatchups)
      .where(and(eq(gmMatchups.leagueId, TEST_LEAGUE_ID), eq(gmMatchups.season, TEST_SEASON)))
      .orderBy(gmMatchups.week);

    const byWeek = new Map(rows.map((r) => [r.week, r]));
    expect(byWeek.get(1)).toMatchObject({ winnerTeamId: 1, isCompleted: 1, isPlayoff: 0 });
    expect(byWeek.get(2)).toMatchObject({ winnerTeamId: 4, isCompleted: 1, isPlayoff: 0 });
    expect(byWeek.get(3)).toMatchObject({ winnerTeamId: null, isCompleted: 1, isPlayoff: 0 });
    expect(byWeek.get(5)).toMatchObject({ winnerTeamId: null, isCompleted: 0, isPlayoff: 0 });
    expect(byWeek.get(15)).toMatchObject({ winnerTeamId: 1, isCompleted: 1, isPlayoff: 1 });
  });

  it("multi-leg transactions produce stable unique rows", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    expect(db).not.toBeNull();
    const tradeRows = await db!
      .select({
        transactionId: gmTransactions.transactionId,
        playerKey: gmTransactions.playerKey,
        legIndex: gmTransactions.legIndex,
        playerId: gmTransactions.playerId,
      })
      .from(gmTransactions)
      .where(
        and(
          eq(gmTransactions.leagueId, TEST_LEAGUE_ID),
          eq(gmTransactions.season, TEST_SEASON),
          eq(gmTransactions.transactionId, "trade_multi_001"),
        ),
      )
      .orderBy(gmTransactions.legIndex);

    expect(tradeRows).toHaveLength(2);
    expect(tradeRows[0]!.legIndex).toBe(1);
    expect(tradeRows[1]!.legIndex).toBe(2);
    expect(tradeRows[0]!.playerKey).toBe(txPlayerKey("trade_multi_001", 1));
    expect(tradeRows[1]!.playerKey).toBe(txPlayerKey("trade_multi_001", 2));
    expect(new Set(tradeRows.map((r) => r.playerKey)).size).toBe(2);
  });

  it("draft picks remain unique by overall pick", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    expect(db).not.toBeNull();
    const picks = await db!
      .select({ overallPick: gmDraftPicks.overallPick, isKeeper: gmDraftPicks.isKeeper })
      .from(gmDraftPicks)
      .where(and(eq(gmDraftPicks.leagueId, TEST_LEAGUE_ID), eq(gmDraftPicks.season, TEST_SEASON)))
      .orderBy(gmDraftPicks.overallPick);

    expect(picks).toHaveLength(2);
    expect(picks.map((p) => p.overallPick)).toEqual([1, 2]);
    expect(picks[1]!.isKeeper).toBe(1);

    await persistUniversalLeague(buildFixtureLeague());
    const picksAgain = await db!
      .select({ overallPick: gmDraftPicks.overallPick })
      .from(gmDraftPicks)
      .where(and(eq(gmDraftPicks.leagueId, TEST_LEAGUE_ID), eq(gmDraftPicks.season, TEST_SEASON)));
    expect(picksAgain).toHaveLength(2);
  }, 30_000);

  it("roster entries remain unique by season snapshot key", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    expect(db).not.toBeNull();
    const entries = await db!
      .select({ teamId: gmRosterEntries.teamId, playerId: gmRosterEntries.playerId, week: gmRosterEntries.week })
      .from(gmRosterEntries)
      .where(and(eq(gmRosterEntries.leagueId, TEST_LEAGUE_ID), eq(gmRosterEntries.season, TEST_SEASON)))
      .orderBy(gmRosterEntries.teamId, gmRosterEntries.playerId);

    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.week === 0)).toBe(true);

    await persistUniversalLeague(buildFixtureLeague());
    const entriesAgain = await db!
      .select({ teamId: gmRosterEntries.teamId, playerId: gmRosterEntries.playerId })
      .from(gmRosterEntries)
      .where(and(eq(gmRosterEntries.leagueId, TEST_LEAGUE_ID), eq(gmRosterEntries.season, TEST_SEASON)));
    expect(entriesAgain).toHaveLength(3);
  }, 30_000);
});
