import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import { runSleeperLeagueImport, runSelectSleeperTeam } from "./providerRouter";
import { getDb, getAllCachedSeasons } from "./db";
import { leagueConnections, gmTeams } from "../drizzle/schema";
import { countUniversalPersistRows } from "./universalPersistence";
import type { UniversalLeague } from "./providers/types";
import * as sleeperAdapter from "./providers/sleeperAdapter";
import * as universalPersistence from "./universalPersistence";
import { computeCareerReport } from "./careerReportService";
import { computeRivalryScores } from "./rivalryService";
import { memCache } from "./memCache";
import { gmTeamOwnerOverrides, gmTeamOwnerResolution } from "../drizzle/schema";
import {
  prepareSleeperIntegrationTest,
  registerSleeperIntegrationTeardown,
} from "./testing/sleeperIntegrationHarness";

function sleeperSnapshot(
  league: UniversalLeague,
  opts?: { warnings?: string[]; previousLeagueId?: string | null },
): sleeperAdapter.SleeperLeagueSnapshot {
  const knownUserIds = league.teams
    .map((t) => (t.ownerId || "").trim())
    .filter((id) => id.length > 0);
  return {
    league,
    warnings: opts?.warnings ?? [],
    previousLeagueId: opts?.previousLeagueId ?? null,
    knownUserIds,
  };
}

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

registerSleeperIntegrationTeardown("import", () => dbAvailable);

beforeEach(async () => {
  dbAvailable = await prepareSleeperIntegrationTest("import");

  vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
    current: sleeperSnapshot(fixtureLeague),
    history: [],
    previous: null,
    warnings: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
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
const CHAIN_S3_API_ID = "sleeper_chain_s3_api";
const CHAIN_S4_API_ID = "sleeper_chain_s4_api";
const CHAIN_S5_API_ID = "sleeper_chain_s5_api";
const CHAIN_OLDER_API_ID = "sleeper_chain_older_api";
const CHAIN_CURRENT_SEASON = 2098;
const CHAIN_PREV_SEASON = 2097;
const CHAIN_S3_SEASON = 2096;
const CHAIN_S4_SEASON = 2095;
const CHAIN_S5_SEASON = 2094;
const CHAIN_USER_ID = 99_003;
const ALL_CHAIN_SEASONS = [
  CHAIN_CURRENT_SEASON,
  CHAIN_PREV_SEASON,
  CHAIN_S3_SEASON,
  CHAIN_S4_SEASON,
  CHAIN_S5_SEASON,
] as const;

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
        homeScore: 90,
        awayScore: 100,
        winner: "away",
        isPlayoff: false,
      },
    ],
    transactions: [],
    draftPicks: [],
  };
}

const chainCurrentFixture = chainFixture(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON, 0);
const chainPrevFixture = chainFixture(CHAIN_PREV_API_ID, CHAIN_PREV_SEASON, 10);
const chainS3Fixture = chainFixture(CHAIN_S3_API_ID, CHAIN_S3_SEASON, 20);
const chainS4Fixture = chainFixture(CHAIN_S4_API_ID, CHAIN_S4_SEASON, 30);
const chainS5Fixture = chainFixture(CHAIN_S5_API_ID, CHAIN_S5_SEASON, 40);


function fullHistorySnapshots(): sleeperAdapter.SleeperLeagueSnapshot[] {
  return [
    sleeperSnapshot(chainPrevFixture, { previousLeagueId: CHAIN_S3_API_ID }),
    sleeperSnapshot(chainS3Fixture, { previousLeagueId: CHAIN_S4_API_ID }),
    sleeperSnapshot(chainS4Fixture, { previousLeagueId: CHAIN_S5_API_ID }),
    sleeperSnapshot(chainS5Fixture, { previousLeagueId: null }),
  ];
}

function mockChainSnapshots(options?: {
  previousFetchFails?: boolean;
  missingPreviousLink?: boolean;
  loopAt?: string;
  history?: sleeperAdapter.SleeperLeagueSnapshot[];
}): void {
  vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockImplementation(
    async (_leagueId: string, opts?: { includePreviousSeason?: boolean }) => {
      const warnings: string[] = [];
      const current = sleeperSnapshot(chainCurrentFixture, {
        previousLeagueId: options?.missingPreviousLink ? null : CHAIN_PREV_API_ID,
      });
      if (opts?.includePreviousSeason !== true) {
        return { current, history: [], previous: null, warnings };
      }
      if (options?.missingPreviousLink) {
        warnings.push("previous season: no previous_league_id on current league");
        return { current, history: [], previous: null, warnings };
      }
      if (options?.previousFetchFails) {
        warnings.push("season history: fetch failed for league sleeper_chain_prev_api — previous league unavailable");
        return { current, history: [], previous: null, warnings };
      }
      if (options?.loopAt) {
        warnings.push(`league history: stopped at repeated league id ${options.loopAt}`);
        return {
          current,
          history: [sleeperSnapshot(chainPrevFixture, { previousLeagueId: options.loopAt })],
          previous: sleeperSnapshot(chainPrevFixture, { previousLeagueId: options.loopAt }),
          warnings,
        };
      }
      const history = options?.history ?? fullHistorySnapshots();
      return {
        current,
        history,
        previous: history[0] ?? null,
        warnings,
      };
    },
  );
}

describe("runSleeperLeagueImport league history", { timeout: 30_000 }, () => {
  registerSleeperIntegrationTeardown("chain", () => dbAvailable);

  beforeEach(async () => {
    dbAvailable = await prepareSleeperIntegrationTest("chain");
    mockChainSnapshots();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports current league and the full linked history chain", async () => {
    if (!dbAvailable) return;
    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.success).toBe(true);
    expect(result.importedSeasons).toEqual([...ALL_CHAIN_SEASONS]);
    expect(result.importedLeagueIds).toEqual([
      CHAIN_CURRENT_ID,
      CHAIN_PREV_API_ID,
      CHAIN_S3_API_ID,
      CHAIN_S4_API_ID,
      CHAIN_S5_API_ID,
    ]);
    expect(result.previousSeason).toBe(CHAIN_PREV_SEASON);
    expect(result.historyPersist).toHaveLength(4);

    for (const season of ALL_CHAIN_SEASONS) {
      const rows = await countUniversalPersistRows(CHAIN_CURRENT_ID, season);
      expect(rows.teams).toBe(2);
    }
  });

  it("stops when previous_league_id is null at the end of the chain", async () => {
    if (!dbAvailable) return;
    mockChainSnapshots({ history: fullHistorySnapshots() });

    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.importedSeasons).toEqual([...ALL_CHAIN_SEASONS]);
    expect(result.importedLeagueIds).toHaveLength(5);
  });

  it("stops when a league id repeats in the chain", async () => {
    if (!dbAvailable) return;
    mockChainSnapshots({ loopAt: CHAIN_CURRENT_ID });

    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.adapterWarnings.some((w) => w.includes("repeated league id"))).toBe(true);
    expect(result.importedSeasons).toEqual([CHAIN_CURRENT_SEASON, CHAIN_PREV_SEASON]);
    const db = await getDb();
    const seasons = await db!
      .select({ season: gmTeams.season })
      .from(gmTeams)
      .where(eq(gmTeams.leagueId, CHAIN_CURRENT_ID));
    const uniqueSeasons = [...new Set(seasons.map((r) => r.season))].sort((a, b) => a - b);
    expect(uniqueSeasons).toEqual([CHAIN_PREV_SEASON, CHAIN_CURRENT_SEASON]);
  });

  it("warns but succeeds when a historical league fetch fails", async () => {
    if (!dbAvailable) return;
    mockChainSnapshots({ previousFetchFails: true });

    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });

    expect(result.success).toBe(true);
    expect(result.previousSeason).toBeNull();
    expect(result.adapterWarnings.some((w) => w.includes("season history: fetch failed"))).toBe(true);
    const currentRows = await countUniversalPersistRows(CHAIN_CURRENT_ID, CHAIN_CURRENT_SEASON);
    expect(currentRows.teams).toBe(2);
    expect(result.importedSeasons).toEqual([CHAIN_CURRENT_SEASON]);
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

  it("re-import with full history remains idempotent", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    const beforeCounts = await Promise.all(
      ALL_CHAIN_SEASONS.map((s) => countUniversalPersistRows(CHAIN_CURRENT_ID, s)),
    );

    const second = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    expect(second.success).toBe(true);

    const afterCounts = await Promise.all(
      ALL_CHAIN_SEASONS.map((s) => countUniversalPersistRows(CHAIN_CURRENT_ID, s)),
    );
    expect(afterCounts).toEqual(beforeCounts);
  });

  it("returns imported seasons newest to oldest", async () => {
    if (!dbAvailable) return;
    const result = await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    expect(result.importedSeasons).toEqual([...ALL_CHAIN_SEASONS]);
    for (let i = 1; i < result.importedSeasons.length; i++) {
      expect(result.importedSeasons[i - 1]).toBeGreaterThan(result.importedSeasons[i]!);
    }
  });

  it("exposes every imported season via getAllCachedSeasons", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    await runSelectSleeperTeam({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      teamId: 1,
      ownerId: "owner_x",
      ownerName: "Owner X",
    });

    const seasons = await getAllCachedSeasons(CHAIN_CURRENT_ID, CHAIN_USER_ID);
    for (const season of ALL_CHAIN_SEASONS) {
      expect(seasons).toContain(season);
    }
  });

  it("career timeline includes every imported season", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    await runSelectSleeperTeam({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      teamId: 1,
      ownerId: "owner_x",
      ownerName: "Owner X",
    });

    const report = await computeCareerReport(CHAIN_USER_ID, "id:owner_x");
    const timelineSeasons = report.timeline.map((t) => t.season).sort((a, b) => b - a);
    expect(timelineSeasons).toEqual([...ALL_CHAIN_SEASONS]);
  });

  it("rivalry data spans all imported seasons without code changes", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      includePreviousSeason: true,
    });
    await runSelectSleeperTeam({
      userId: CHAIN_USER_ID,
      leagueId: CHAIN_CURRENT_ID,
      teamId: 1,
      ownerId: "owner_x",
      ownerName: "Owner X",
    });
    memCache.invalidateAll();

    const scores = await computeRivalryScores(CHAIN_USER_ID, CHAIN_CURRENT_ID);
    expect(scores.length).toBeGreaterThan(0);
    const rival = scores.find((s) => s.rivalName === "Owner Y");
    expect(rival).toBeDefined();
    const h2hMeetings = (rival?.h2hWins ?? 0) + (rival?.h2hLosses ?? 0) + (rival?.h2hTies ?? 0);
    expect(h2hMeetings).toBeGreaterThanOrEqual(ALL_CHAIN_SEASONS.length);
  }, 60_000);
});
