import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb, setActiveLeagueForUser } from "./db";
import { espnSeasonCache, gmDraftPicks, gmTeams, leagueConnections } from "../drizzle/schema";
import {
  prepareSleeperIntegrationTest,
  registerSleeperIntegrationTeardown,
} from "./testing/sleeperIntegrationHarness";

const SLEEPER_LEAGUE_ID = "draft_picks_sleeper";
const ESPN_LEAGUE_ID = "draft_picks_espn";
const OTHER_LEAGUE_ID = "draft_picks_other";
const SLEEPER_USER_ID = 99_020;
const ESPN_USER_ID = 99_021;
const OTHER_USER_ID = 99_022;
const SLEEPER_SEASON = 2096;
const ESPN_SEASON = 2024;

function caller(userId: number) {
  return appRouter.createCaller({
    user: { id: userId, openId: `draft_${userId}`, role: "user" as const },
    req: {} as never,
    res: {} as never,
  });
}

let dbAvailable = false;

registerSleeperIntegrationTeardown("draftPicks", () => dbAvailable);

beforeEach(async () => {
  dbAvailable = await prepareSleeperIntegrationTest("draftPicks");
});

async function seedConnection(userId: number, leagueId: string, provider: "espn" | "sleeper"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(leagueConnections).values({
    userId,
    provider,
    leagueId,
    leagueName: `League ${leagueId}`,
    season: SLEEPER_SEASON,
    isActive: true,
    syncStatus: "ok",
  });
  const [conn] = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, userId), eq(leagueConnections.leagueId, leagueId)))
    .limit(1);
  await setActiveLeagueForUser(userId, conn!.id);
}

async function seedTeam(
  leagueId: string,
  season: number,
  teamId: number,
  name: string,
  ownerName: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(gmTeams).values({
    leagueId,
    season,
    teamId,
    name,
    ownerName,
    ownerId: `owner_${teamId}`,
    rawTeam: "{}",
  });
}

async function seedDraftPick(args: {
  leagueId: string;
  season: number;
  overallPick: number;
  roundId: number;
  roundPick: number;
  teamId: number;
  playerName: string;
  position: string;
  playerId?: number;
  isKeeper?: boolean;
  teamName?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  await db.insert(gmDraftPicks).values({
    leagueId: args.leagueId,
    season: args.season,
    overallPick: args.overallPick,
    roundId: args.roundId,
    roundPick: args.roundPick,
    teamId: args.teamId,
    playerId: args.playerId ?? args.overallPick,
    playerName: args.playerName,
    position: args.position,
    isKeeper: args.isKeeper ? 1 : 0,
    rawPick: JSON.stringify({ teamName: args.teamName ?? `Team ${args.teamId}` }),
  });
}

async function seedEspnCombinedCache(leagueId: string, season: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("no db");
  const payload = {
    id: leagueId,
    seasonId: season,
    teams: {
      "1": { id: 1, location: "Test", nickname: "Alpha", abbrev: "ALP" },
      "2": { id: 2, location: "Test", nickname: "Beta", abbrev: "BET" },
    },
    settings: { size: 2 },
    draftDetail: {
      picks: [
        {
          roundId: 1,
          roundPickNumber: 1,
          overallPickNumber: 1,
          teamId: 1,
          playerId: 0,
          playerPoolEntry: {
            player: { fullName: "Cache Player One", defaultPositionId: 1, proTeam: "KC" },
          },
        },
      ],
    },
  };
  await db.insert(espnSeasonCache).values({
    leagueId,
    season,
    viewName: "combined",
    payload: JSON.stringify(payload),
  });
}

describe("espn.draftPicks", () => {
  it("returns Sleeper normalized draft picks", async () => {
    if (!dbAvailable) return;
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 2, "Team Beta", "Beta Owner");
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerName: "Player A",
      position: "QB",
      playerId: 101,
    });
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 2,
      roundId: 1,
      roundPick: 2,
      teamId: 2,
      playerName: "Player B",
      position: "RB",
      playerId: 102,
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const picks = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    expect(picks).toHaveLength(2);
    expect(picks[0]?.playerName).toBe("Player A");
    expect(picks[1]?.playerName).toBe("Player B");
  });

  it("orders picks by overall pick ascending", async () => {
    if (!dbAvailable) return;
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 2, "Team Beta", "Beta Owner");
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 2,
      roundId: 1,
      roundPick: 2,
      teamId: 2,
      playerName: "Second",
      position: "RB",
    });
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerName: "First",
      position: "QB",
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const picks = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    expect(picks.map((p) => p.overallPick)).toEqual([1, 2]);
  });

  it("preserves team and player fields", async () => {
    if (!dbAvailable) return;
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerName: "Player A",
      position: "QB",
      teamName: "Team Alpha",
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const [pick] = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    expect(pick).toMatchObject({
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      teamName: "Team Alpha",
      playerName: "Player A",
      position: "QB",
      ownerName: "Alpha Owner",
    });
  });

  it("preserves keeper flags", async () => {
    if (!dbAvailable) return;
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerName: "Keeper Pick",
      position: "RB",
      isKeeper: true,
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const [pick] = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    expect(pick?.isKeeper).toBe(true);
  });

  it("falls back to ESPN cache when normalized rows are absent", async () => {
    if (!dbAvailable) return;
    await seedEspnCombinedCache(ESPN_LEAGUE_ID, ESPN_SEASON);
    await seedConnection(ESPN_USER_ID, ESPN_LEAGUE_ID, "espn");

    const picks = await caller(ESPN_USER_ID).espn.draftPicks({ season: ESPN_SEASON });
    expect(picks).toHaveLength(1);
    expect(picks[0]?.playerName).toContain("Cache Player One");
    expect(picks[0]?.teamId).toBe(1);
  });

  it("does not return another league's draft picks", async () => {
    if (!dbAvailable) return;
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
    await seedTeam(OTHER_LEAGUE_ID, SLEEPER_SEASON, 1, "Other Team", "Other Owner");
    await seedDraftPick({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerName: "Sleeper Only",
      position: "QB",
    });
    await seedDraftPick({
      leagueId: OTHER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerName: "Foreign",
      position: "QB",
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");
    await seedConnection(OTHER_USER_ID, OTHER_LEAGUE_ID, "sleeper");

    const sleeperPicks = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    const otherPicks = await caller(OTHER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });

    expect(sleeperPicks).toHaveLength(1);
    expect(sleeperPicks[0]?.playerName).toBe("Sleeper Only");
    expect(otherPicks).toHaveLength(1);
    expect(otherPicks[0]?.playerName).toBe("Foreign");
  });

  it("returns empty array when normalized and cache data are absent", async () => {
    if (!dbAvailable) return;
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const picks = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    expect(picks).toEqual([]);
  });

  it("restores blank player names from gm_player_registry without dropping the pick", async () => {
    if (!dbAvailable) return;
    const db = await getDb();
    if (!db) return;
    const espnPlayerId = "980055201";
    await db.execute(sql`DELETE FROM gm_player_registry WHERE espnPlayerId = ${espnPlayerId}`);
    try {
      await db.execute(sql`
        INSERT INTO gm_player_registry (espnPlayerId, fullName, normalizedName, position)
        VALUES (${espnPlayerId}, ${"RFSN055B Registry Player"}, ${"rfsn055bregistryplayer"}, ${"RB"})
      `);
      await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
      await seedDraftPick({
        leagueId: SLEEPER_LEAGUE_ID,
        season: SLEEPER_SEASON,
        overallPick: 8,
        roundId: 4,
        roundPick: 2,
        teamId: 1,
        playerName: "",
        position: "?",
        playerId: 980055201,
      });
      await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");
      const picks = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
      expect(picks).toHaveLength(1);
      expect(picks[0]?.playerName).toBe("RFSN055B Registry Player");
      expect(picks[0]?.position).toBe("RB");
      expect(picks[0]?.overallPick).toBe(8);
    } finally {
      await db.execute(sql`DELETE FROM gm_player_registry WHERE espnPlayerId = ${espnPlayerId}`);
    }
  });

  it("returns null playerId for unassigned draft slots without inventing a name", async () => {
    if (!dbAvailable) return;
    await seedTeam(SLEEPER_LEAGUE_ID, SLEEPER_SEASON, 1, "Team Alpha", "Alpha Owner");
    const db = await getDb();
    if (!db) return;
    await db.insert(gmDraftPicks).values({
      leagueId: SLEEPER_LEAGUE_ID,
      season: SLEEPER_SEASON,
      overallPick: 1,
      roundId: 1,
      roundPick: 1,
      teamId: 1,
      playerId: null,
      playerName: "",
      position: "?",
      isKeeper: 0,
      rawPick: JSON.stringify({ teamName: "Team Alpha", draftedForAnalytics: true }),
    });
    await seedConnection(SLEEPER_USER_ID, SLEEPER_LEAGUE_ID, "sleeper");

    const [pick] = await caller(SLEEPER_USER_ID).espn.draftPicks({ season: SLEEPER_SEASON });
    expect(pick).toMatchObject({
      overallPick: 1,
      playerId: null,
      playerName: "",
      position: "?",
    });
  });
});
