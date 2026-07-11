import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { getAllCachedSeasons, getDb, setActiveLeagueForUser } from "./db";
import { espnSeasonCache, gmTeams, leagueConnections } from "../drizzle/schema";

const ESPN_LEAGUE_ID = "season_disc_espn";
const SLEEPER_LEAGUE_ID = "season_disc_sleeper";
const OTHER_LEAGUE_ID = "season_disc_other";
const ESPN_USER_ID = 99_010;
const SLEEPER_USER_ID = 99_011;
const OTHER_USER_ID = 99_012;
const ESPN_SEASON = 2024;
const SLEEPER_SEASON = 2096;
const MIXED_ESPN_SEASON = 2023;
const OTHER_SEASON = 2095;

let dbAvailable = false;

async function cleanup(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  for (const userId of [ESPN_USER_ID, SLEEPER_USER_ID, OTHER_USER_ID]) {
    await db.delete(leagueConnections).where(eq(leagueConnections.userId, userId));
  }

  for (const leagueId of [ESPN_LEAGUE_ID, SLEEPER_LEAGUE_ID, OTHER_LEAGUE_ID]) {
    await db.delete(espnSeasonCache).where(eq(espnSeasonCache.leagueId, leagueId));
    await db.delete(gmTeams).where(eq(gmTeams.leagueId, leagueId));
  }
}

async function seedConnection(userId: number, leagueId: string, provider: "espn" | "sleeper"): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(leagueConnections).values({
    userId,
    provider,
    leagueId,
    leagueName: `League ${leagueId}`,
    season: ESPN_SEASON,
    isActive: true,
    syncStatus: "ok",
  });
  const [conn] = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, userId), eq(leagueConnections.leagueId, leagueId)))
    .limit(1);
  const connId = conn!.id;
  await setActiveLeagueForUser(userId, connId);
  return connId;
}

async function seedEspnSeason(leagueId: string, season: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(espnSeasonCache).values({
    leagueId,
    season,
    viewName: "combined",
    payload: "{}",
  });
}

async function seedGmTeam(
  leagueId: string,
  season: number,
  teamId: number,
  ownerId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(gmTeams).values({
    leagueId,
    season,
    teamId,
    name: `Team ${teamId}`,
    ownerName: `Owner ${teamId}`,
    ownerId,
    rawTeam: "{}",
  });
}

beforeEach(async () => {
  const db = await getDb();
  dbAvailable = db != null;
  if (dbAvailable) await cleanup();
});

afterEach(async () => {
  if (dbAvailable) await cleanup();
});

describe("getAllCachedSeasons", () => {
  it("returns ESPN-only seasons unchanged when no normalized rows exist", async () => {
    if (!dbAvailable) return;
    await seedEspnSeason(ESPN_LEAGUE_ID, ESPN_SEASON);
    await seedConnection(ESPN_USER_ID, ESPN_LEAGUE_ID, "espn");

    const seasons = await getAllCachedSeasons(undefined, ESPN_USER_ID);
    expect(seasons).toEqual([ESPN_SEASON]);
  });

  it("returns Sleeper normalized seasons from gm_teams", async () => {
    if (!dbAvailable) return;
    await seedGmTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "owner_a");
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const seasons = await getAllCachedSeasons(undefined, SLEEPER_USER_ID);
    expect(seasons).toEqual([SLEEPER_SEASON]);
  });

  it("deduplicates ESPN cache seasons and normalized gm_teams seasons", async () => {
    if (!dbAvailable) return;
    await seedEspnSeason(ESPN_LEAGUE_ID, MIXED_ESPN_SEASON);
    await seedGmTeam(ESPN_LEAGUE_ID, MIXED_ESPN_SEASON, 1, "owner_dup");
    await seedGmTeam(ESPN_LEAGUE_ID, SLEEPER_SEASON, 2, "owner_b");
    await seedConnection(ESPN_USER_ID, ESPN_LEAGUE_ID, "espn");

    const seasons = await getAllCachedSeasons(undefined, ESPN_USER_ID);
    expect(seasons).toEqual([SLEEPER_SEASON, MIXED_ESPN_SEASON]);
  });

  it("sorts seasons newest first", async () => {
    if (!dbAvailable) return;
    await seedGmTeam(SLEEPER_LEAGUE_ID, 2020, 1, "o1");
    await seedGmTeam(SLEEPER_LEAGUE_ID, 2025, 2, "o2");
    await seedGmTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 3, "o3");
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const seasons = await getAllCachedSeasons(undefined, SLEEPER_USER_ID);
    expect(seasons).toEqual([SLEEPER_SEASON, 2025, 2020]);
  });

  it("does not return another league's normalized seasons", async () => {
    if (!dbAvailable) return;
    await seedGmTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "owner_a");
    await seedGmTeam(OTHER_LEAGUE_ID, OTHER_SEASON, 1, "owner_x");
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");
    await seedConnection(OTHER_USER_ID, OTHER_LEAGUE_ID, "sleeper");

    const sleeperSeasons = await getAllCachedSeasons(undefined, SLEEPER_USER_ID);
    const otherSeasons = await getAllCachedSeasons(undefined, OTHER_USER_ID);

    expect(sleeperSeasons).toEqual([SLEEPER_SEASON]);
    expect(otherSeasons).toEqual([OTHER_SEASON]);
  });

  it("preserves ESPN-only behavior when normalized tables are empty", async () => {
    if (!dbAvailable) return;
    await seedEspnSeason(ESPN_LEAGUE_ID, ESPN_SEASON);
    await seedConnection(ESPN_USER_ID, ESPN_LEAGUE_ID, "espn");

    const before = await getAllCachedSeasons(undefined, ESPN_USER_ID);
    await seedGmTeam(OTHER_LEAGUE_ID, OTHER_SEASON, 1, "foreign");
    const after = await getAllCachedSeasons(undefined, ESPN_USER_ID);

    expect(before).toEqual([ESPN_SEASON]);
    expect(after).toEqual([ESPN_SEASON]);
  });
});
