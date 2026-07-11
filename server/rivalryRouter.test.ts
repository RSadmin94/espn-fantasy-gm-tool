import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, setActiveLeagueForUser } from "./db";
import { memCache } from "./memCache";
import { espnSeasonCache, gmMatchups, gmTeams, leagueConnections } from "../drizzle/schema";

const SLEEPER_LEAGUE_ID = "rivalry_sleeper_test";
const ESPN_LEAGUE_ID = "rivalry_espn_test";
const OTHER_LEAGUE_ID = "rivalry_other_test";
const SLEEPER_USER_ID = 99_030;
const ESPN_USER_ID = 99_031;
const OTHER_USER_ID = 99_032;
const PRIOR_SEASON = 2095;
const CURRENT_SEASON = 2096;
const ESPN_SEASON = 2024;

function entitledCaller(userId: number) {
  return appRouter.createCaller({
    user: {
      id: userId,
      openId: `rivalry_${userId}`,
      role: "user" as const,
      subscriptionStatus: "active" as const,
    },
    req: {} as never,
    res: {} as never,
  });
}

let dbAvailable = false;

async function cleanup(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const userId of [SLEEPER_USER_ID, ESPN_USER_ID, OTHER_USER_ID]) {
    await db.delete(leagueConnections).where(eq(leagueConnections.userId, userId));
  }
  for (const leagueId of [SLEEPER_LEAGUE_ID, ESPN_LEAGUE_ID, OTHER_LEAGUE_ID]) {
    await db.delete(espnSeasonCache).where(eq(espnSeasonCache.leagueId, leagueId));
    await db.delete(gmMatchups).where(eq(gmMatchups.leagueId, leagueId));
    await db.delete(gmTeams).where(eq(gmTeams.leagueId, leagueId));
  }
}

async function seedConnection(
  userId: number,
  leagueId: string,
  provider: "espn" | "sleeper",
  owner?: { teamId: number; ownerId: string; ownerName: string },
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(leagueConnections).values({
    userId,
    provider,
    leagueId,
    leagueName: `League ${leagueId}`,
    season: CURRENT_SEASON,
    isActive: true,
    syncStatus: "ok",
    selectedTeamId: owner?.teamId ?? null,
    selectedOwnerKey: owner ? `id:${owner.ownerId}` : null,
    selectedOwnerName: owner?.ownerName ?? null,
  });
  const [conn] = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, userId), eq(leagueConnections.leagueId, leagueId)))
    .limit(1);
  await setActiveLeagueForUser(userId, conn!.id);
  memCache.invalidateAll();
}

async function seedTeam(args: {
  leagueId: string;
  season: number;
  teamId: number;
  name: string;
  ownerName: string;
  ownerId: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(gmTeams).values({
    leagueId: args.leagueId,
    season: args.season,
    teamId: args.teamId,
    name: args.name,
    ownerName: args.ownerName,
    ownerId: args.ownerId,
    rawTeam: "{}",
  });
}

async function seedMatchup(args: {
  leagueId: string;
  season: number;
  week: number;
  matchupPeriodId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId: number;
  isPlayoff?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(gmMatchups).values({
    leagueId: args.leagueId,
    season: args.season,
    week: args.week,
    matchupPeriodId: args.matchupPeriodId,
    homeTeamId: args.homeTeamId,
    awayTeamId: args.awayTeamId,
    homeScore: args.homeScore,
    awayScore: args.awayScore,
    winnerTeamId: args.winnerTeamId,
    isPlayoff: args.isPlayoff ? 1 : 0,
    isCompleted: 1,
    rawMatchup: JSON.stringify({
      playoffTierType: args.isPlayoff ? "WINNERS_BRACKET" : "NONE",
    }),
  });
}

async function seedEspnCombinedCache(leagueId: string, season: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  const payload = {
    id: leagueId,
    seasonId: season,
    members: [
      { id: "espn_owner_1", firstName: "Alice", lastName: "Alpha" },
      { id: "espn_owner_2", firstName: "Bob", lastName: "Beta" },
    ],
    teams: [
      {
        id: 1,
        abbrev: "ALP",
        location: "Team",
        nickname: "Alpha",
        owners: ["espn_owner_1"],
        record: { overall: { wins: 1, losses: 0, ties: 0 } },
      },
      {
        id: 2,
        abbrev: "BET",
        location: "Team",
        nickname: "Beta",
        owners: ["espn_owner_2"],
        record: { overall: { wins: 0, losses: 1, ties: 0 } },
      },
    ],
    schedule: [
      {
        matchupPeriodId: 1,
        scoringPeriodId: 1,
        winner: "HOME",
        playoffTierType: "NONE",
        home: { teamId: 1, totalPoints: 110.5 },
        away: { teamId: 2, totalPoints: 95.2 },
      },
    ],
  };
  await db.insert(espnSeasonCache).values({
    leagueId,
    season,
    viewName: "combined",
    payload: JSON.stringify(payload),
  });
}

async function seedSleeperRivalryFixture(leagueId: string): Promise<void> {
  for (const season of [PRIOR_SEASON, CURRENT_SEASON]) {
    await seedTeam({
      leagueId,
      season,
      teamId: 1,
      name: "Team Alpha",
      ownerName: "Alpha Owner",
      ownerId: "owner_alpha",
    });
    await seedTeam({
      leagueId,
      season,
      teamId: 2,
      name: "Team Beta",
      ownerName: "Beta Owner",
      ownerId: "owner_beta",
    });
  }
  await seedMatchup({
    leagueId,
    season: CURRENT_SEASON,
    week: 1,
    matchupPeriodId: 1,
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 112.4,
    awayScore: 98.7,
    winnerTeamId: 1,
  });
  await seedMatchup({
    leagueId,
    season: CURRENT_SEASON,
    week: 2,
    matchupPeriodId: 2,
    homeTeamId: 2,
    awayTeamId: 1,
    homeScore: 105.0,
    awayScore: 99.5,
    winnerTeamId: 2,
  });
}

beforeEach(async () => {
  const db = await getDb();
  dbAvailable = db != null;
  memCache.invalidateAll();
  if (dbAvailable) await cleanup();
});

afterEach(async () => {
  memCache.invalidateAll();
  if (dbAvailable) await cleanup();
});

describe("rivalry.h2h", { timeout: 30_000 }, () => {
  it("builds an H2H pair from Sleeper normalized teams and matchups", async () => {
    if (!dbAvailable) return;
    await seedSleeperRivalryFixture(SLEEPER_LEAGUE_ID);
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.h2h();
    expect(result.owners).toHaveLength(2);
    expect(result.pairs).toHaveLength(1);
    const pair = result.pairs[0] as Record<string, unknown>;
    expect(pair.a).toBe("Alpha Owner");
    expect(pair.b).toBe("Beta Owner");
    expect(pair.meetings).toBe(2);
  });

  it("records wins, losses, and meetings correctly for the focal owner", async () => {
    if (!dbAvailable) return;
    await seedSleeperRivalryFixture(SLEEPER_LEAGUE_ID);
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.h2h();
    const pair = result.pairs[0] as Record<string, unknown>;
    expect(pair.aWins).toBe(1);
    expect(pair.aLosses).toBe(1);
    expect(pair.ties).toBe(0);
    expect(pair.meetings).toBe(2);
    expect(pair.firstSeason).toBe(CURRENT_SEASON);
    expect(pair.lastSeason).toBe(CURRENT_SEASON);
  });

  it("maps canonical owner keys from persisted Sleeper owner IDs", async () => {
    if (!dbAvailable) return;
    await seedSleeperRivalryFixture(SLEEPER_LEAGUE_ID);
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.h2h();
    const alpha = result.owners.find((o) => o.name === "Alpha Owner");
    const beta = result.owners.find((o) => o.name === "Beta Owner");
    expect(alpha?.ownerKey).toBe("id:owner_alpha");
    expect(beta?.ownerKey).toBe("id:owner_beta");
    const pair = result.pairs[0] as Record<string, unknown>;
    expect(pair.aKey).toBe("id:owner_alpha");
    expect(pair.bKey).toBe("id:owner_beta");
  });

  it("isolates H2H results by leagueId", async () => {
    if (!dbAvailable) return;
    await seedSleeperRivalryFixture(SLEEPER_LEAGUE_ID);
    await seedTeam({
      leagueId: OTHER_LEAGUE_ID,
      season: CURRENT_SEASON,
      teamId: 1,
      name: "Other Team",
      ownerName: "Other Owner",
      ownerId: "owner_other",
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });
    await seedConnection(OTHER_USER_ID, OTHER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_other",
      ownerName: "Other Owner",
    });

    const sleeperH2h = await entitledCaller(SLEEPER_USER_ID).rivalry.h2h();
    const otherH2h = await entitledCaller(OTHER_USER_ID).rivalry.h2h();

    expect(sleeperH2h.pairs).toHaveLength(1);
    expect(otherH2h.pairs).toHaveLength(0);
    expect(otherH2h.owners).toHaveLength(0);
  });

  it("falls back to ESPN cache when normalized rows are absent", async () => {
    if (!dbAvailable) return;
    await seedEspnCombinedCache(ESPN_LEAGUE_ID, ESPN_SEASON);
    await seedConnection(ESPN_USER_ID, ESPN_LEAGUE_ID, "espn", {
      teamId: 1,
      ownerId: "espn_owner_1",
      ownerName: "Alice Alpha",
    });

    const result = await entitledCaller(ESPN_USER_ID).rivalry.h2h();
    expect(result.pairs).toHaveLength(1);
    const pair = result.pairs[0] as Record<string, unknown>;
    expect(pair.meetings).toBe(1);
    expect(pair.aWins).toBe(1);
    expect(pair.aLosses).toBe(0);
  });

  it("returns empty owners and pairs when normalized and cache data are absent", async () => {
    if (!dbAvailable) return;
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.h2h();
    expect(result).toMatchObject({ owners: [], pairs: [] });
  });
});

describe("rivalry.getScores", { timeout: 30_000 }, () => {
  it("returns rivalry scores for the Sleeper fixture with focal owner resolution", async () => {
    if (!dbAvailable) return;
    await seedSleeperRivalryFixture(SLEEPER_LEAGUE_ID);
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.getScores();
    expect(result).toMatchObject({
      gated: false,
      entitled: true,
      totalRivalries: 1,
    });
    const rivalries = (result as { rivalries: Array<Record<string, unknown>> }).rivalries;
    expect(rivalries).toHaveLength(1);
    expect(rivalries[0]?.rivalName).toBe("Beta Owner");
    expect(rivalries[0]?.focalKey).toBe("id:owner_alpha");
    expect(rivalries[0]?.rivalKey).toBe("id:owner_beta");
    expect(Number(rivalries[0]?.h2hLosses)).toBeGreaterThan(0);
    expect(Number(rivalries[0]?.rivalryScore)).toBeGreaterThan(0);
  });

  it("returns empty rivalries when normalized and cache data are absent", async () => {
    if (!dbAvailable) return;
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.getScores();
    expect(result).toEqual([]);
  });

  it("preserves the gated rivalry response shape", async () => {
    if (!dbAvailable) return;
    await seedSleeperRivalryFixture(SLEEPER_LEAGUE_ID);
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper", {
      teamId: 1,
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
    });

    const result = await entitledCaller(SLEEPER_USER_ID).rivalry.getScores();
    expect(result).toHaveProperty("rivalries");
    expect(result).toHaveProperty("gated");
    expect(result).toHaveProperty("entitled");
    expect(result).toHaveProperty("totalRivalries");
    expect(result).toHaveProperty("lockedRivalries");
    expect(Array.isArray((result as { rivalries: unknown[] }).rivalries)).toBe(true);
  });
});
