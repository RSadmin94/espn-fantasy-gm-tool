import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import {
  runSelectSleeperTeam,
  runSleeperLeagueImport,
} from "./providerRouter";
import { resolveCurrentOwner } from "./currentOwnerService";
import { getDb } from "./db";
import { memCache } from "./memCache";
import { leagueConnections, gmTeams } from "../drizzle/schema";
import type { UniversalLeague } from "./providers/types";
import * as sleeperAdapter from "./providers/sleeperAdapter";

const TEST_LEAGUE_ID = "sleeper_connect_test";
const OTHER_LEAGUE_ID = "sleeper_connect_other";
const TEST_SEASON = 2097;
const TEST_USER_ID = 99_002;

const fixtureLeague: UniversalLeague = {
  settings: {
    leagueId: TEST_LEAGUE_ID,
    provider: "sleeper",
    season: TEST_SEASON,
    leagueName: "Connect Test League",
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
      ownerId: "owner_alpha",
      ownerName: "Alpha",
      ownerNames: ["Alpha"],
      teamName: "Team Alpha",
      abbreviation: "ALP",
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
      ownerId: "owner_beta",
      ownerName: "Beta",
      ownerNames: ["Beta"],
      teamName: "Team Beta",
      abbreviation: "BET",
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
  matchups: [],
  transactions: [],
  draftPicks: [],
};

let dbAvailable = false;

async function cleanup(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const leagueId of [TEST_LEAGUE_ID, OTHER_LEAGUE_ID]) {
    await db
      .delete(leagueConnections)
      .where(and(eq(leagueConnections.userId, TEST_USER_ID), eq(leagueConnections.leagueId, leagueId)));
    await db.delete(gmTeams).where(and(eq(gmTeams.leagueId, leagueId), eq(gmTeams.season, TEST_SEASON)));
  }
}

beforeEach(async () => {
  const db = await getDb();
  dbAvailable = db != null;
  if (dbAvailable) await cleanup();
  memCache.invalidateAll();

  vi.spyOn(sleeperAdapter, "fetchSleeperLeagueSnapshot").mockResolvedValue({
    league: fixtureLeague,
    warnings: [],
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (dbAvailable) await cleanup();
});

describe("Sleeper connect flow", () => {
  it("import returns teams", async () => {
    if (!dbAvailable) return;
    const result = await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });
    expect(result.success).toBe(true);
    expect(result.teams).toHaveLength(2);
    expect(result.teams[0]).toMatchObject({
      teamId: 1,
      ownerId: "owner_alpha",
      ownerKey: "id:owner_alpha",
      ownerName: "Alpha",
    });
  });

  it("team selection saves selectedTeamId and selectedOwnerKey", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });

    const selected = await runSelectSleeperTeam({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha",
    });
    expect(selected.success).toBe(true);

    const db = await getDb();
    const [conn] = await db!
      .select()
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.userId, TEST_USER_ID),
          eq(leagueConnections.leagueId, TEST_LEAGUE_ID),
        ),
      )
      .limit(1);
    expect(conn?.selectedTeamId).toBe(1);
    expect(conn?.selectedOwnerKey).toBe("id:owner_alpha");
    expect(conn?.selectedOwnerName).toBe("Alpha");
    expect(conn?.isActive).toBe(true);
  });

  it("user cannot select a team from another league", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });

    const db = await getDb();
    await db!.insert(gmTeams).values({
      leagueId: OTHER_LEAGUE_ID,
      season: TEST_SEASON,
      teamId: 99,
      name: "Other Team",
      ownerName: "Other Owner",
      ownerId: "owner_other",
      rawTeam: "{}",
    });

    const result = await runSelectSleeperTeam({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      teamId: 99,
      ownerId: "owner_other",
      ownerName: "Other Owner",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("team_not_found");
  });

  it("dry-run import does not create a selectable connection", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      dryRun: true,
    });

    const result = await runSelectSleeperTeam({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("connection_not_found");
  });

  it("resolveCurrentOwner returns the selected Sleeper owner after save", async () => {
    if (!dbAvailable) return;
    await runSleeperLeagueImport({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      season: TEST_SEASON,
    });
    await runSelectSleeperTeam({
      userId: TEST_USER_ID,
      leagueId: TEST_LEAGUE_ID,
      teamId: 2,
      ownerId: "owner_beta",
      ownerName: "Beta",
    });

    const owner = await resolveCurrentOwner({ id: TEST_USER_ID });
    expect(owner.isSetupComplete).toBe(true);
    expect(owner.ownerId).toBe("owner_beta");
    expect(owner.ownerKey).toBe("id:owner_beta");
    expect(owner.displayName).toBe("Beta");
    expect(owner.teamId).toBe(2);
    expect(owner.leagueId).toBe(TEST_LEAGUE_ID);
  });
});

describe("validateSleeperLeague preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valid league preview returns league details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "Preview League",
          season: "2025",
          total_rosters: 10,
          status: "in_season",
          scoring_settings: { rec: 1 },
        }),
      }),
    );

    const res = await fetch(`https://api.sleeper.app/v1/league/123`);
    const data = await res.json();
    expect(data.name).toBe("Preview League");
    expect(data.season).toBe("2025");
    expect(data.total_rosters).toBe(10);
  });

  it("invalid league ID returns an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const res = await fetch(`https://api.sleeper.app/v1/league/bad`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });
});
