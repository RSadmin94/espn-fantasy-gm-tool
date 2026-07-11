import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { runSleeperLeagueImport } from "./providerRouter";
import { getDb } from "./db";
import { leagueConnections, gmTeams } from "../drizzle/schema";
import { countUniversalPersistRows } from "./universalPersistence";
import type { UniversalLeague } from "./providers/types";
import * as sleeperAdapter from "./providers/sleeperAdapter";
import * as universalPersistence from "./universalPersistence";

const TEST_LEAGUE_ID = "sleeper_import_test";
const TEST_SEASON = 2098;
const TEST_USER_ID = 99_001;

const fixtureLeague: UniversalLeague = {
  settings: {
    leagueId: TEST_LEAGUE_ID,
    provider: "sleeper",
    season: TEST_SEASON,
    leagueName: "Import Test League",
    teamCount: 2,
    scoringType: "ppr",
    playoffTeamCount: 2,
    regularSeasonWeeks: 14,
    currentWeek: 5,
    isActive: true,
    draftType: "snake",
  },
  teams: [
    {
      teamId: "1",
      ownerId: "owner_x",
      ownerName: "Owner X",
      ownerNames: ["Owner X"],
      teamName: "Team X",
      abbreviation: "TEAX",
      wins: 1,
      losses: 0,
      ties: 0,
      pointsFor: 100,
      pointsAgainst: 90,
      winPct: 1,
      standingRank: 1,
    },
    {
      teamId: "2",
      ownerId: "owner_y",
      ownerName: "Owner Y",
      ownerNames: ["Owner Y"],
      teamName: "Team Y",
      abbreviation: "TEAY",
      wins: 0,
      losses: 1,
      ties: 0,
      pointsFor: 90,
      pointsAgainst: 100,
      winPct: 0,
      standingRank: 2,
    },
  ],
  rosters: [
    {
      teamId: "1",
      season: TEST_SEASON,
      slots: [
        {
          player: { playerId: "101", playerName: "Player A", position: "QB", nflTeam: "KC" },
          slotType: "starter",
          lineupSlot: "QB",
        },
      ],
    },
  ],
  matchups: [
    {
      season: TEST_SEASON,
      week: 1,
      homeTeamId: "1",
      awayTeamId: "2",
      homeScore: 100,
      awayScore: 90,
      winner: "home",
      isPlayoff: false,
    },
  ],
  transactions: [
    {
      transactionId: "tx1",
      season: TEST_SEASON,
      type: "WAIVER",
      status: "EXECUTED",
      timestampMs: 1_700_000_000_000,
      teamId: "1",
      playerId: "101",
      playerName: "Player A",
      playerPosition: "QB",
      faabBid: 5,
    },
  ],
  draftPicks: [
    {
      season: TEST_SEASON,
      round: 1,
      pickInRound: 1,
      overallPick: 1,
      teamId: "1",
      playerId: "101",
      playerName: "Player A",
      position: "QB",
    },
  ],
};

let dbAvailable = false;

async function cleanupImportTestData(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, TEST_USER_ID),
        eq(leagueConnections.leagueId, TEST_LEAGUE_ID),
      ),
    );
  await db.delete(gmTeams).where(and(eq(gmTeams.leagueId, TEST_LEAGUE_ID), eq(gmTeams.season, TEST_SEASON)));
  const { gmMatchups, gmTransactions, gmDraftPicks, gmRosterEntries, gmLeagueSettings } = await import(
    "../drizzle/schema"
  );
  await db.delete(gmRosterEntries).where(and(eq(gmRosterEntries.leagueId, TEST_LEAGUE_ID), eq(gmRosterEntries.season, TEST_SEASON)));
  await db.delete(gmDraftPicks).where(and(eq(gmDraftPicks.leagueId, TEST_LEAGUE_ID), eq(gmDraftPicks.season, TEST_SEASON)));
  await db.delete(gmTransactions).where(and(eq(gmTransactions.leagueId, TEST_LEAGUE_ID), eq(gmTransactions.season, TEST_SEASON)));
  await db.delete(gmMatchups).where(and(eq(gmMatchups.leagueId, TEST_LEAGUE_ID), eq(gmMatchups.season, TEST_SEASON)));
  await db.delete(gmLeagueSettings).where(and(eq(gmLeagueSettings.leagueId, TEST_LEAGUE_ID), eq(gmLeagueSettings.season, TEST_SEASON)));
}

beforeEach(async () => {
  const db = await getDb();
  dbAvailable = db != null;
  if (dbAvailable) await cleanupImportTestData();

  vi.spyOn(sleeperAdapter, "fetchSleeperLeagueSnapshot").mockResolvedValue({
    league: fixtureLeague,
    warnings: [],
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (dbAvailable) await cleanupImportTestData();
});

describe("runSleeperLeagueImport", () => {
  it("dry run calls persistUniversalLeague with dryRun and writes nothing", async () => {
    if (!dbAvailable) return;
    const persistSpy = vi.spyOn(universalPersistence, "persistUniversalLeague");

    const before = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    const result = await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      dryRun: true,
    });

    expect(persistSpy).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.any(Object) }), {
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.success).toBe(true);
    expect(result.persist.counts.teams.persisted).toBe(2);
    const after = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(after).toEqual(before);

    const db = await getDb();
    const conn = await db!
      .select()
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.userId, TEST_USER_ID),
          eq(leagueConnections.leagueId, TEST_LEAGUE_ID),
        ),
      );
    expect(conn).toHaveLength(0);
  });

  it("real import calls persistUniversalLeague and creates league_connections", async () => {
    if (!dbAvailable) return;
    const persistSpy = vi.spyOn(universalPersistence, "persistUniversalLeague");

    const result = await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });

    expect(persistSpy).toHaveBeenCalled();
    expect(result.dryRun).toBe(false);
    expect(result.success).toBe(true);
    expect(result.teams).toHaveLength(2);
    expect(result.teams[0]).toMatchObject({
      teamId: 1,
      ownerId: "owner_x",
      ownerKey: "id:owner_x",
      ownerName: "Owner X",
    });

    const rows = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(rows.teams).toBe(2);
    expect(rows.matchups).toBe(1);
    expect(rows.transactions).toBe(1);
    expect(rows.draftPicks).toBe(1);

    const db = await getDb();
    const [conn] = await db!
      .select()
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.userId, TEST_USER_ID),
          eq(leagueConnections.leagueId, TEST_LEAGUE_ID),
          eq(leagueConnections.season, TEST_SEASON),
        ),
      )
      .limit(1);
    expect(conn?.provider).toBe("sleeper");
    expect(conn?.syncStatus).toBe("ok");
    expect(conn?.leagueName).toBe("Import Test League");
  });

  it("re-import is idempotent for normalized row counts", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });
    const before = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);

    const second = await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });
    expect(second.success).toBe(true);
    const after = await countUniversalPersistRows(TEST_LEAGUE_ID, TEST_SEASON);
    expect(after).toEqual(before);
  });
});
