import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  buildConnectedLeagueGroups,
  disconnectConnectedLeague,
  renameConnectedLeague,
} from "./connectedLeagueService";
import {
  clearUserDisplayName,
  getUserDisplayName,
  resolveConnectedLeagueLabel,
  setUserDisplayName,
} from "./connectedLeagueDisplayName";
import { getConnectedLeagueUsage, assertCanConnectLeague, CROSS_PROVIDER_LEAGUE_ID_MESSAGE } from "./connectedLeagueLimits";
import {
  getEspnTeamSelectionContext,
  runSelectEspnTeam,
} from "./espnTeamSelection";
import { getDb } from "./db";
import {
  gmTeams,
  leagueConnectionDisplayNames,
  leagueConnections,
} from "../drizzle/schema";

const USER_A = 99_101;
const USER_B = 99_102;
const ESPN_LEAGUE = "arch_test_457622";
const SLEEPER_SAME_ID = "arch_test_457622";
const TEST_SEASON = 2096;

let dbAvailable = false;

async function ensureDisplayNameTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS league_connection_display_names (
      id int NOT NULL AUTO_INCREMENT,
      userId int NOT NULL,
      provider varchar(32) NOT NULL,
      leagueId varchar(128) NOT NULL,
      displayName varchar(256) NOT NULL,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_lcdn_user_provider_league (userId, provider, leagueId),
      KEY idx_lcdn_user (userId)
    )
  `);
}

async function cleanup(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  for (const userId of [USER_A, USER_B]) {
    await db.delete(leagueConnectionDisplayNames).where(eq(leagueConnectionDisplayNames.userId, userId));
    await db.delete(leagueConnections).where(eq(leagueConnections.userId, userId));
  }
  await db.delete(gmTeams).where(
    and(eq(gmTeams.leagueId, ESPN_LEAGUE), eq(gmTeams.season, TEST_SEASON)),
  );
}

async function insertConnection(args: {
  userId: number;
  provider: string;
  leagueId: string;
  leagueName: string;
  season: number;
  selectedTeamId?: number | null;
}): Promise<number> {
  const db = (await getDb())!;
  await db.insert(leagueConnections).values({
    userId: args.userId,
    provider: args.provider,
    leagueId: args.leagueId,
    leagueName: args.leagueName,
    season: args.season,
    isActive: true,
    syncStatus: "ok",
    selectedTeamId: args.selectedTeamId ?? null,
  });
  const [row] = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, args.userId),
        eq(leagueConnections.provider, args.provider),
        eq(leagueConnections.leagueId, args.leagueId),
        eq(leagueConnections.season, args.season),
      ),
    )
    .limit(1);
  return row!.id;
}

beforeEach(async () => {
  const db = await getDb();
  dbAvailable = db != null;
  if (!dbAvailable) return;
  await ensureDisplayNameTable();
  await cleanup();
});

afterEach(async () => {
  if (dbAvailable) await cleanup();
});

describe("resolveConnectedLeagueLabel", () => {
  it("prefers user display over canonical then fallback", () => {
    expect(resolveConnectedLeagueLabel("My Nickname", "Real League", "1")).toBe("My Nickname");
    expect(resolveConnectedLeagueLabel(null, "Real League", "1")).toBe("Real League");
    expect(resolveConnectedLeagueLabel("", "Real League", "1")).toBe("Real League");
    expect(resolveConnectedLeagueLabel(null, "", "99")).toBe("League 99");
  });
});

describe("canonical vs display name", () => {
  it("rename does not change canonical league_connections.leagueName", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Imported Canonical Name",
      season: TEST_SEASON,
    });
    await renameConnectedLeague(USER_A, "espn", ESPN_LEAGUE, "User Nickname");
    const db = await getDb();
    const [row] = await db!
      .select({ leagueName: leagueConnections.leagueName })
      .from(leagueConnections)
      .where(and(eq(leagueConnections.userId, USER_A), eq(leagueConnections.leagueId, ESPN_LEAGUE)))
      .limit(1);
    expect(row?.leagueName).toBe("Imported Canonical Name");
    expect(await getUserDisplayName(USER_A, "espn", ESPN_LEAGUE)).toBe("User Nickname");
  });

  it("re-import updates canonical but preserves custom display name", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Old Canonical",
      season: TEST_SEASON,
    });
    await setUserDisplayName(USER_A, "espn", ESPN_LEAGUE, "Still Mine");
    const db = await getDb();
    await db
      .update(leagueConnections)
      .set({ leagueName: "New Canonical From Re-import" })
      .where(and(eq(leagueConnections.userId, USER_A), eq(leagueConnections.leagueId, ESPN_LEAGUE)));

    const groups = await buildConnectedLeagueGroups(USER_A, null);
    const group = groups.find((g) => g.provider === "espn" && g.leagueId === ESPN_LEAGUE);
    expect(group?.canonicalName).toBe("New Canonical From Re-import");
    expect(group?.customDisplayName).toBe("Still Mine");
    expect(group?.displayName).toBe("Still Mine");
  });

  it("clearing custom name restores canonical display", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Canonical Only",
      season: TEST_SEASON,
    });
    await setUserDisplayName(USER_A, "espn", ESPN_LEAGUE, "Temporary");
    await clearUserDisplayName(USER_A, "espn", ESPN_LEAGUE);
    const groups = await buildConnectedLeagueGroups(USER_A, null);
    expect(groups[0]?.displayName).toBe("Canonical Only");
    expect(groups[0]?.customDisplayName).toBeNull();
  });

  it("one user's display name does not affect another user", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Shared Canonical",
      season: TEST_SEASON,
    });
    await insertConnection({
      userId: USER_B,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Shared Canonical",
      season: TEST_SEASON,
    });
    await setUserDisplayName(USER_A, "espn", ESPN_LEAGUE, "User A Label");
    const groupsB = await buildConnectedLeagueGroups(USER_B, null);
    expect(groupsB[0]?.displayName).toBe("Shared Canonical");
    expect(groupsB[0]?.customDisplayName).toBeNull();
  });

  it("same numeric league id under different providers has separate display metadata", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: SLEEPER_SAME_ID,
      leagueName: "ESPN League",
      season: TEST_SEASON,
    });
    await insertConnection({
      userId: USER_A,
      provider: "sleeper",
      leagueId: SLEEPER_SAME_ID,
      leagueName: "Sleeper League",
      season: TEST_SEASON,
    });
    await setUserDisplayName(USER_A, "espn", SLEEPER_SAME_ID, "ESPN Nick");
    await setUserDisplayName(USER_A, "sleeper", SLEEPER_SAME_ID, "Sleeper Nick");
    const groups = await buildConnectedLeagueGroups(USER_A, null);
    const espn = groups.find((g) => g.provider === "espn")!;
    const sleeper = groups.find((g) => g.provider === "sleeper")!;
    expect(espn.displayName).toBe("ESPN Nick");
    expect(sleeper.displayName).toBe("Sleeper Nick");
  });
});

describe("disconnect consolidation", () => {
  it("removes all connection rows for user/provider/league and frees slot", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Multi Season",
      season: TEST_SEASON - 1,
    });
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Multi Season",
      season: TEST_SEASON,
    });
    const before = await getConnectedLeagueUsage(USER_A);
    expect(before.used).toBe(1);

    const result = await disconnectConnectedLeague(USER_A, "espn", ESPN_LEAGUE);
    expect(result.removedRows).toBe(2);

    const db = await getDb();
    const remaining = await db!
      .select({ id: leagueConnections.id })
      .from(leagueConnections)
      .where(and(eq(leagueConnections.userId, USER_A), eq(leagueConnections.leagueId, ESPN_LEAGUE)));
    expect(remaining).toHaveLength(0);

    const after = await getConnectedLeagueUsage(USER_A);
    expect(after.used).toBe(0);
  });

  it("leaves another user's connection and gm_* data intact", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Shared",
      season: TEST_SEASON,
    });
    await insertConnection({
      userId: USER_B,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Shared",
      season: TEST_SEASON,
    });
    const db = await getDb();
    await db.insert(gmTeams).values({
      leagueId: ESPN_LEAGUE,
      season: TEST_SEASON,
      teamId: 1,
      name: "Team One",
      ownerId: "owner-1",
      ownerName: "Owner One",
      rawTeam: "{}",
    });

    await disconnectConnectedLeague(USER_A, "espn", ESPN_LEAGUE);

    const userBRows = await db
      .select({ id: leagueConnections.id })
      .from(leagueConnections)
      .where(and(eq(leagueConnections.userId, USER_B), eq(leagueConnections.leagueId, ESPN_LEAGUE)));
    expect(userBRows).toHaveLength(1);

    const teams = await db
      .select({ teamId: gmTeams.teamId })
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, ESPN_LEAGUE), eq(gmTeams.season, TEST_SEASON)));
    expect(teams).toHaveLength(1);
  });

  it("reconciles active league when disconnected league was active", async () => {
    if (!dbAvailable) return;
    const otherId = await insertConnection({
      userId: USER_A,
      provider: "sleeper",
      leagueId: "other_league",
      leagueName: "Other",
      season: TEST_SEASON,
      selectedTeamId: 1,
    });
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Active ESPN",
      season: TEST_SEASON,
    });
    const { setActiveLeagueForUser } = await import("./db");
    const espnId = (
      await (await getDb())!
        .select({ id: leagueConnections.id })
        .from(leagueConnections)
        .where(
          and(
            eq(leagueConnections.userId, USER_A),
            eq(leagueConnections.provider, "espn"),
            eq(leagueConnections.leagueId, ESPN_LEAGUE),
          ),
        )
        .limit(1)
    )[0]!.id;
    await setActiveLeagueForUser(USER_A, espnId);

    await disconnectConnectedLeague(USER_A, "espn", ESPN_LEAGUE);

    const db = await getDb();
    const remaining = await db!
      .select({ id: leagueConnections.id })
      .from(leagueConnections)
      .where(eq(leagueConnections.userId, USER_A));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(otherId);
  });
});

describe("provider + leagueId identity", () => {
  it("existing ESPN connection lookup is provider-scoped", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "sleeper",
      leagueId: SLEEPER_SAME_ID,
      leagueName: "Sleeper Only",
      season: TEST_SEASON,
    });
    const db = await getDb();
    const espnExisting = await db
      .select({ id: leagueConnections.id })
      .from(leagueConnections)
      .where(
        and(
          eq(leagueConnections.userId, USER_A),
          eq(leagueConnections.provider, "espn"),
          eq(leagueConnections.leagueId, SLEEPER_SAME_ID),
        ),
      )
      .limit(1);
    expect(espnExisting).toHaveLength(0);
  });
});

describe("cross-provider leagueId collision guard", () => {
  const COLLISION_ID = "collision_457622";

  it("rejects Sleeper connect after ESPN with same leagueId", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: COLLISION_ID,
      leagueName: "ESPN League",
      season: TEST_SEASON,
    });
    await expect(assertCanConnectLeague(USER_A, "sleeper", COLLISION_ID)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TRPCError &&
        err.code === "FORBIDDEN" &&
        err.message === CROSS_PROVIDER_LEAGUE_ID_MESSAGE,
    );
  });

  it("rejects ESPN connect after Sleeper with same leagueId", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "sleeper",
      leagueId: COLLISION_ID,
      leagueName: "Sleeper League",
      season: TEST_SEASON,
    });
    await expect(assertCanConnectLeague(USER_A, "espn", COLLISION_ID)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TRPCError &&
        err.code === "FORBIDDEN" &&
        err.message === CROSS_PROVIDER_LEAGUE_ID_MESSAGE,
    );
  });

  it("allows ESPN reconnect for same leagueId", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: COLLISION_ID,
      leagueName: "ESPN League",
      season: TEST_SEASON,
    });
    await expect(assertCanConnectLeague(USER_A, "espn", COLLISION_ID)).resolves.toBeUndefined();
  });

  it("allows Sleeper reconnect for same leagueId", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "sleeper",
      leagueId: COLLISION_ID,
      leagueName: "Sleeper League",
      season: TEST_SEASON,
    });
    await expect(assertCanConnectLeague(USER_A, "sleeper", COLLISION_ID)).resolves.toBeUndefined();
  });

  it("allows different league IDs across providers", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: "espn_only_id",
      leagueName: "ESPN League",
      season: TEST_SEASON,
    });
    await expect(assertCanConnectLeague(USER_A, "sleeper", "sleeper_only_id")).resolves.toBeUndefined();
  });
});

describe("ESPN team selection", () => {
  it("returns teams for connected ESPN user and saves selection", async () => {
    if (!dbAvailable) return;
    await insertConnection({
      userId: USER_A,
      provider: "espn",
      leagueId: ESPN_LEAGUE,
      leagueName: "Team Pick League",
      season: TEST_SEASON,
    });
    const db = await getDb();
    await db.insert(gmTeams).values([
      {
        leagueId: ESPN_LEAGUE,
        season: TEST_SEASON,
        teamId: 1,
        name: "Alpha FC",
        ownerId: "guid-1",
        ownerName: "Alice",
        rawTeam: "{}",
      },
      {
        leagueId: ESPN_LEAGUE,
        season: TEST_SEASON,
        teamId: 2,
        name: "Beta FC",
        ownerId: "guid-2",
        ownerName: "Bob",
        rawTeam: "{}",
      },
    ]);

    const ctx = await getEspnTeamSelectionContext(USER_A, ESPN_LEAGUE);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    expect(ctx.teams).toHaveLength(2);
    expect(ctx.isSetupComplete).toBe(false);

    const saved = await runSelectEspnTeam({
      userId: USER_A,
      leagueId: ESPN_LEAGUE,
      teamId: 2,
      season: TEST_SEASON,
    });
    expect(saved.success).toBe(true);

    const [conn] = await db
      .select()
      .from(leagueConnections)
      .where(and(eq(leagueConnections.userId, USER_A), eq(leagueConnections.leagueId, ESPN_LEAGUE)))
      .limit(1);
    expect(conn?.selectedTeamId).toBe(2);
    expect(conn?.selectedOwnerKey).toBe("id:guid-2");
    expect(conn?.selectedOwnerName).toBe("Bob");
    expect(conn?.selectedFranchiseName).toBe("Beta FC");
    expect(conn?.selectedSeason).toBe(TEST_SEASON);

    const reload = await getEspnTeamSelectionContext(USER_A, ESPN_LEAGUE);
    expect(reload.ok).toBe(true);
    if (reload.ok) {
      expect(reload.selectedTeamId).toBe(2);
      expect(reload.isSetupComplete).toBe(true);
    }
  });

  it("rejects team selection without ESPN connection", async () => {
    if (!dbAvailable) return;
    const result = await runSelectEspnTeam({
      userId: USER_A,
      leagueId: ESPN_LEAGUE,
      teamId: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("connection_not_found");
  });
});
