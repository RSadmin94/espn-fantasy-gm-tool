import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { runSleeperLeagueImport, runSelectSleeperTeam } from "./providerRouter";
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

  vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
    current: { league: fixtureLeague, warnings: [], previousLeagueId: null },
    previous: null,
    warnings: [],
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (dbAvailable) await cleanupImportTestData();
});

describe("runSleeperLeagueImport", { timeout: 30_000 }, () => {
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

const CHAIN_CURRENT_ID = "sleeper_chain_curr";
const CHAIN_PREV_API_ID = "sleeper_chain_prev_api";
const CHAIN_OLDER_API_ID = "sleeper_chain_older_api";
const CHAIN_CURRENT_SEASON = 2098;
const CHAIN_PREV_SEASON = 2097;
const CHAIN_USER_ID = 99_003;

function chainFixture(leagueId: string, season: number, teamOffset: number): UniversalLeague {
  return {
    settings: {
      leagueId,
      provider: "sleeper",
      season,
      leagueName: season === CHAIN_CURRENT_SEASON ? "Chain Current" : "Chain Previous",
      teamCount: 2,
      scoringType: "ppr",
      playoffTeamCount: 2,
      regularSeasonWeeks: 14,
      currentWeek: 14,
      isActive: season === CHAIN_CURRENT_SEASON,
      draftType: "snake",
    },
    teams: [
      {
        teamId: String(1 + teamOffset),
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
        teamId: String(2 + teamOffset),
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
    rosters: [],
    matchups: [
      {
        season,
        week: 1,
        homeTeamId: String(1 + teamOffset),
        awayTeamId: String(2 + teamOffset),
        homeScore: 100,
        awayScore: 90,
        winner: "home",
        isPlayoff: false,
      },
    ],
    transactions: [],
    draftPicks: [],
  };
}

const chainCurrentFixture = chainFixture(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON, 0);
const chainPrevFixture = chainFixture(CHAIN_PREV_API_ID, CHAIN_PREV_SEASON, 10);

async function cleanupChainImportData(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(leagueConnections)
    .where(
      and(eq(leagueConnections.userId, CHAIN_USER_ID), eq(leagueConnections.leagueId, CHAIN_CURRENT_ID)),
    );
  for (const season of [CHAIN_CURRENT_SEASON, CHAIN_PREV_SEASON]) {
    await db.delete(gmTeams).where(and(eq(gmTeams.leagueId, CHAIN_CURRENT_ID), eq(gmTeams.season, season)));
    const { gmMatchups, gmTransactions, gmDraftPicks, gmRosterEntries, gmLeagueSettings } = await import(
      "../drizzle/schema"
    );
    await db.delete(gmRosterEntries).where(and(eq(gmRosterEntries.leagueId, CHAIN_CURRENT_ID), eq(gmRosterEntries.season, season)));
    await db.delete(gmDraftPicks).where(and(eq(gmDraftPicks.leagueId, CHAIN_CURRENT_ID), eq(gmDraftPicks.season, season)));
    await db.delete(gmTransactions).where(and(eq(gmTransactions.leagueId, CHAIN_CURRENT_ID), eq(gmTransactions.season, season)));
    await db.delete(gmMatchups).where(and(eq(gmMatchups.leagueId, CHAIN_CURRENT_ID), eq(gmMatchups.season, season)));
    await db.delete(gmLeagueSettings).where(and(eq(gmLeagueSettings.leagueId, CHAIN_CURRENT_ID), eq(gmLeagueSettings.season, season)));
  }
}

function mockChainSnapshots(options?: { previousFetchFails?: boolean; missingPreviousLink?: boolean }): void {
  vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockImplementation(
    async (_leagueId: string, opts?: { includePreviousSeason?: boolean }) => {
      const warnings: string[] = [];
      const current = {
        league: chainCurrentFixture,
        warnings: [] as string[],
        previousLeagueId: options?.missingPreviousLink ? null : CHAIN_PREV_API_ID,
      };
      if (opts?.includePreviousSeason !== true) {
        return { current, previous: null, warnings };
      }
      if (options?.missingPreviousLink) {
        warnings.push("previous season: no previous_league_id on current league");
        return { current, previous: null, warnings };
      }
      if (options?.previousFetchFails) {
        warnings.push("previous season: fetch failed — previous league unavailable");
        return { current, previous: null, warnings };
      }
      return {
        current,
        previous: {
          league: chainPrevFixture,
          warnings: [],
          previousLeagueId: CHAIN_OLDER_API_ID,
        },
        warnings,
      };
    },
  );
}

describe("runSleeperLeagueImport previous season", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    dbAvailable = db != null;
    if (dbAvailable) await cleanupChainImportData();
    mockChainSnapshots();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (dbAvailable) await cleanupChainImportData();
  });

  it("imports current league and one linked previous season", async () => {
    if (!dbAvailable) return;
    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.success).toBe(true);
    expect(result.previousSeason).toBe(CHAIN_PREV_SEASON);
    expect(result.previousPersist?.counts.teams.persisted).toBe(2);

    const currentRows = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON);
    const prevRows = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_PREV_SEASON);
    expect(currentRows.teams).toBe(2);
    expect(prevRows.teams).toBe(2);
    expect(prevRows.matchups).toBe(1);
  });

  it("stops after one previous season even when it has another predecessor", async () => {
    if (!dbAvailable) return;
    mockChainSnapshots();

    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    const prevRows = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_PREV_SEASON);
    expect(prevRows.teams).toBe(2);
    const db = await getDb();
    const seasons = await db!
      .select({ season: gmTeams.season })
      .from(gmTeams)
      .where(eq(gmTeams.leagueId, CHAIN_CURRENT_ID));
    const uniqueSeasons = [...new Set(seasons.map((r) => r.season))].sort((a, b) => a - b);
    expect(uniqueSeasons).toEqual([CHAIN_PREV_SEASON, CHAIN_CURRENT_SEASON]);
  });

  it("warns but succeeds when previous league fetch fails", async () => {
    if (!dbAvailable) return;
    mockChainSnapshots({ previousFetchFails: true });

    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.success).toBe(true);
    expect(result.previousSeason).toBeNull();
    expect(result.adapterWarnings.some((w) => w.includes("previous season: fetch failed"))).toBe(true);
    const currentRows = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON);
    expect(currentRows.teams).toBe(2);
  });

  it("warns when previous_league_id is missing but current import succeeds", async () => {
    if (!dbAvailable) return;
    mockChainSnapshots({ missingPreviousLink: true });

    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.success).toBe(true);
    expect(result.previousSeason).toBeNull();
    expect(result.adapterWarnings.some((w) => w.includes("no previous_league_id"))).toBe(true);
  });

  it("keeps the current league connection active with unchanged team selection", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    const selected = await runSelectSleeperTeam({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      teamId: 1,
      ownerId: "owner_x",
      ownerName: "Owner X",
    });
    expect(selected.success).toBe(true);

    const reimport = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    expect(reimport.success).toBe(true);

    const db = await getDb();
    const conns = await db!
      .select()
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.userId, CHAIN_USER_ID),
          eq(leagueConnections.leagueId, CHAIN_CURRENT_ID),
        ),
      );
    expect(conns).toHaveLength(1);
    expect(conns[0]?.leagueId).toBe(CHAIN_CURRENT_ID);
    expect(conns[0]?.season).toBe(CHAIN_CURRENT_SEASON);
    expect(conns[0]?.selectedTeamId).toBe(1);
    expect(conns[0]?.selectedOwnerKey).toBe("id:owner_x");
  });

  it("preserves stable ownerId values across seasons with season-specific teamIds", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    const db = await getDb();
    const teams = await db!
      .select()
      .from(gmTeams)
      .where(eq(gmTeams.leagueId, CHAIN_CURRENT_ID));

    const currentX = teams.find((t) => t.season === CHAIN_CURRENT_SEASON && t.ownerId === "owner_x");
    const prevX = teams.find((t) => t.season === CHAIN_PREV_SEASON && t.ownerId === "owner_x");
    const currentY = teams.find((t) => t.season === CHAIN_CURRENT_SEASON && t.ownerId === "owner_y");
    const prevY = teams.find((t) => t.season === CHAIN_PREV_SEASON && t.ownerId === "owner_y");

    expect(currentX?.teamId).toBe(1);
    expect(prevX?.teamId).toBe(11);
    expect(currentY?.teamId).toBe(2);
    expect(prevY?.teamId).toBe(12);
  });

  it("re-import with previous season remains idempotent", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    const beforeCurrent = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON);
    const beforePrev = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_PREV_SEASON);

    const second = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    expect(second.success).toBe(true);

    const afterCurrent = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON);
    const afterPrev = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_PREV_SEASON);
    expect(afterCurrent).toEqual(beforeCurrent);
    expect(afterPrev).toEqual(beforePrev);
  });
});
