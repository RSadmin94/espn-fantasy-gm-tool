import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { UniversalLeague } from "./providers/types";
import * as sleeperAdapter from "./providers/sleeperAdapter";
import {
  resolveSleeperLeagueOwners,
  saveManualOwnerOverride,
  removeManualOwnerOverride,
  loadManualOverrides,
  reapplyOwnerResolutionForTeam,
  summarizeResolutions,
  ownerKeyFromHistoricalName,
  type SleeperOwnerResolutionContext,
} from "./sleeperOwnerResolution";
import { runSleeperLeagueImport, runSelectSleeperTeam } from "./providerRouter";
import { getDb } from "./db";
import { gmTeamOwnerOverrides, gmTeamOwnerResolution, gmTeams, leagueConnections } from "../drizzle/schema";
import { buildH2HAuthority } from "./h2hAuthority";
import { memCache } from "./memCache";

const LEAGUE_A = "owner_res_league_a";
const LEAGUE_B = "owner_res_league_b";
const USER_ID = 99_010;

function team(
  teamId: string,
  ownerId: string | undefined,
  ownerName: string,
  teamName: string,
): UniversalLeague["teams"][number] {
  return {
    teamId,
    ownerId,
    ownerName,
    ownerNames: [ownerName],
    teamName,
    abbreviation: "T",
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    winPct: 0,
  };
}

function miniLeague(season: number, teams: UniversalLeague["teams"], leagueId = LEAGUE_A): UniversalLeague {
  return {
    settings: {
      leagueId,
      provider: "sleeper",
      season,
      leagueName: "Owner Res Test",
      teamCount: teams.length,
      scoringType: "ppr",
      playoffTeamCount: 2,
      regularSeasonWeeks: 14,
      currentWeek: 1,
      isActive: true,
    },
    teams,
    rosters: [],
    matchups: [],
    transactions: [],
    draftPicks: [],
  };
}

function emptyContext(leagueId: string): SleeperOwnerResolutionContext {
  return { leagueId, manualOverrides: new Map(), indexedOwners: new Map() };
}

function sleeperSnapshot(league: UniversalLeague, knownUserIds: string[]): sleeperAdapter.SleeperLeagueSnapshot {
  return { league, warnings: [], previousLeagueId: null, knownUserIds };
}

async function cleanupLeague(leagueId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(gmTeamOwnerOverrides).where(eq(gmTeamOwnerOverrides.leagueId, leagueId));
  await db.delete(gmTeamOwnerResolution).where(eq(gmTeamOwnerResolution.leagueId, leagueId));
  await db.delete(gmTeams).where(eq(gmTeams.leagueId, leagueId));
  await db
    .delete(leagueConnections)
    .where(and(eq(leagueConnections.userId, USER_ID), eq(leagueConnections.leagueId, leagueId)));
}

let dbAvailable = false;

describe("resolveSleeperLeagueOwners", () => {
  it("valid Sleeper owner_id resolves as verified", () => {
    const league = miniLeague(2023, [team("1", "user_abc", "Alpha", "Team Alpha")]);
    const { resolutions } = resolveSleeperLeagueOwners({
      league,
      connectionLeagueId: LEAGUE_A,
      knownUserIds: new Set(["user_abc"]),
      context: emptyContext(LEAGUE_A),
    });
    expect(resolutions[0]).toMatchObject({
      status: "verified",
      ownerKey: "id:user_abc",
      ownerName: "Alpha",
    });
  });

  it("missing owner_id remains unresolved when no reliable evidence exists", () => {
    const league = miniLeague(2022, [team("1", undefined, "Unknown", "Team Alpha")]);
    const { resolutions, league: resolved } = resolveSleeperLeagueOwners({
      league,
      connectionLeagueId: LEAGUE_A,
      knownUserIds: new Set(),
      context: emptyContext(LEAGUE_A),
    });
    expect(resolutions[0]?.status).toBe("unresolved");
    expect(resolutions[0]?.ownerKey).toBeNull();
    expect(resolved.teams[0]?.ownerId).toBeUndefined();
  });

  it("same roster across adjacent seasons creates a suggestion, not silent verification", () => {
    const context = emptyContext(LEAGUE_A);
    context.indexedOwners.set("2023:1", {
      season: 2023,
      teamId: 1,
      ownerId: "user_verified",
      ownerName: "Verified Owner",
      status: "verified",
    });

    const league = miniLeague(2022, [team("1", undefined, "Unknown", "Team Alpha")]);
    const { resolutions } = resolveSleeperLeagueOwners({
      league,
      connectionLeagueId: LEAGUE_A,
      knownUserIds: new Set(),
      context,
    });

    expect(resolutions[0]).toMatchObject({
      status: "suggested",
      ownerKey: null,
      suggestedOwnerKey: "id:user_verified",
      suggestedOwnerName: "Verified Owner",
    });
    expect(resolutions[0]?.suggestionReason).toContain("Same roster ID");
  });

  it("manual override takes precedence over automatic suggestion", () => {
    const context = emptyContext(LEAGUE_A);
    context.manualOverrides.set("2022:1", {
      season: 2022,
      teamId: 1,
      ownerKey: "id:manual_user",
      ownerName: "Manual Pick",
      updatedByUserId: 1,
    });
    context.indexedOwners.set("2023:1", {
      season: 2023,
      teamId: 1,
      ownerId: "user_verified",
      ownerName: "Verified Owner",
      status: "verified",
    });

    const league = miniLeague(2022, [team("1", undefined, "Unknown", "Team Alpha")]);
    const { resolutions } = resolveSleeperLeagueOwners({
      league,
      connectionLeagueId: LEAGUE_A,
      knownUserIds: new Set(),
      context,
    });

    expect(resolutions[0]).toMatchObject({
      status: "manual",
      ownerKey: "id:manual_user",
      ownerName: "Manual Pick",
    });
  });
});

describe("Sleeper owner resolution persistence", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    const db = await getDb();
    dbAvailable = db != null;
    if (dbAvailable) {
      await cleanupLeague(LEAGUE_A);
      await cleanupLeague(LEAGUE_B);
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (dbAvailable) {
      await cleanupLeague(LEAGUE_A);
      await cleanupLeague(LEAGUE_B);
    }
  });

  it("user can confirm a suggested owner", async () => {
    if (!dbAvailable) return;

    const current = miniLeague(2023, [team("1", "user_curr", "Current", "Team A")]);
    const history = miniLeague(2022, [team("1", undefined, "Ghost", "Team A")]);

    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(current, ["user_curr"]),
      history: [sleeperSnapshot(history, [])],
      previous: sleeperSnapshot(history, []),
      warnings: [],
    });

    const imported = await runSleeperLeagueImport({
      userId: USER_ID,
      leagueId: LEAGUE_A,
      includePreviousSeason: true,
    });
    const suggested = imported.ownerResolutionsNeedingAttention.find((r) => r.status === "suggested");
    expect(suggested).toBeDefined();

    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: suggested!.season,
      teamId: suggested!.teamId,
      ownerKey: suggested!.suggestedOwnerKey!,
      ownerName: suggested!.suggestedOwnerName || "Current",
      userId: USER_ID,
    });
    const updated = await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: suggested!.season,
      teamId: suggested!.teamId,
      knownUserIds: new Set(["user_curr"]),
    });
    expect(updated?.status).toBe("manual");
    expect(updated?.ownerKey).toBe("id:user_curr");
  });

  it("user can manually choose another existing owner", async () => {
    if (!dbAvailable) return;

    const league = miniLeague(2023, [
      team("1", "user_a", "Owner A", "Team A"),
      team("2", undefined, "Ghost", "Team B"),
    ]);
    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(league, ["user_a"]),
      history: [],
      previous: null,
      warnings: [],
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });

    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 2,
      ownerKey: "id:user_a",
      ownerName: "Owner A",
      userId: USER_ID,
    });
    const updated = await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 2,
      knownUserIds: new Set(["user_a"]),
    });
    expect(updated?.status).toBe("manual");
    expect(updated?.ownerKey).toBe("id:user_a");
  });

  it("user can create a historical owner not in the current users list", async () => {
    if (!dbAvailable) return;

    const league = miniLeague(2022, [team("1", undefined, "Former GM", "Team A")]);
    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(league, []),
      history: [],
      previous: null,
      warnings: [],
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A, season: 2022 });

    const historicalKey = ownerKeyFromHistoricalName("Former GM");
    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: 2022,
      teamId: 1,
      ownerKey: historicalKey,
      ownerName: "Former GM",
      userId: USER_ID,
    });
    const updated = await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2022,
      teamId: 1,
      knownUserIds: new Set(),
    });
    expect(updated?.status).toBe("manual");
    expect(updated?.ownerKey).toBe(historicalKey);

    const db = await getDb();
    const [teamRow] = await db!
      .select({ ownerId: gmTeams.ownerId })
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, LEAGUE_A), eq(gmTeams.season, 2022), eq(gmTeams.teamId, 1)))
      .limit(1);
    expect(teamRow?.ownerId).toBe("");
  });

  it("manual override survives re-import", async () => {
    if (!dbAvailable) return;

    const league = miniLeague(2023, [team("1", undefined, "Ghost", "Team A")]);
    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(league, []),
      history: [],
      previous: null,
      warnings: [],
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });
    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      ownerKey: ownerKeyFromHistoricalName("Legacy Owner"),
      ownerName: "Legacy Owner",
      userId: USER_ID,
    });
    await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      knownUserIds: new Set(),
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });
    const overrides = await loadManualOverrides(LEAGUE_A);
    expect(overrides.get("2023:1")?.ownerName).toBe("Legacy Owner");

    const db = await getDb();
    const [row] = await db!
      .select()
      .from(gmTeamOwnerResolution)
      .where(
        and(
          eq(gmTeamOwnerResolution.leagueId, LEAGUE_A),
          eq(gmTeamOwnerResolution.season, 2023),
          eq(gmTeamOwnerResolution.teamId, 1),
        ),
      )
      .limit(1);
    expect(row?.status).toBe("manual");
  });

  it("removing an override restores automatic resolution", async () => {
    if (!dbAvailable) return;

    const league = miniLeague(2023, [team("1", "user_ok", "Verified", "Team A")]);
    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(league, ["user_ok"]),
      history: [],
      previous: null,
      warnings: [],
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });
    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      ownerKey: ownerKeyFromHistoricalName("Wrong Person"),
      ownerName: "Wrong Person",
      userId: USER_ID,
    });
    await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      knownUserIds: new Set(["user_ok"]),
    });

    await removeManualOwnerOverride({ leagueId: LEAGUE_A, season: 2023, teamId: 1 });
    const restored = await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      knownUserIds: new Set(["user_ok"]),
    });
    expect(restored?.status).toBe("verified");
    expect(restored?.ownerKey).toBe("id:user_ok");
  });

  it("one league override cannot affect another league", async () => {
    if (!dbAvailable) return;

    const leagueA = miniLeague(2023, [team("1", undefined, "Ghost", "Team A")], LEAGUE_A);
    const leagueB = miniLeague(2023, [team("1", undefined, "Ghost", "Team A")], LEAGUE_B);

    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots")
      .mockResolvedValueOnce({
        current: sleeperSnapshot(leagueA, []),
        history: [],
        previous: null,
        warnings: [],
      })
      .mockResolvedValueOnce({
        current: sleeperSnapshot(leagueB, []),
        history: [],
        previous: null,
        warnings: [],
      });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });
    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      ownerKey: ownerKeyFromHistoricalName("League A Only"),
      ownerName: "League A Only",
      userId: USER_ID,
    });
    await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 1,
      knownUserIds: new Set(),
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_B });
    const db = await getDb();
    const [rowB] = await db!
      .select()
      .from(gmTeamOwnerResolution)
      .where(
        and(
          eq(gmTeamOwnerResolution.leagueId, LEAGUE_B),
          eq(gmTeamOwnerResolution.season, 2023),
          eq(gmTeamOwnerResolution.teamId, 1),
        ),
      )
      .limit(1);
    expect(rowB?.status).toBe("unresolved");
  });

  it("full-history import succeeds with unresolved owners", async () => {
    if (!dbAvailable) return;

    const current = miniLeague(2023, [team("1", "user_ok", "OK", "Team A")]);
    const history = miniLeague(2022, [team("1", undefined, "Ghost", "Team A")]);

    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(current, ["user_ok"]),
      history: [sleeperSnapshot(history, [])],
      previous: sleeperSnapshot(history, []),
      warnings: [],
    });

    const result = await runSleeperLeagueImport({
      userId: USER_ID,
      leagueId: LEAGUE_A,
      includePreviousSeason: true,
    });

    expect(result.success).toBe(true);
    expect(result.ownerResolutionSummary.unresolved + result.ownerResolutionSummary.suggested).toBeGreaterThan(0);
    expect(summarizeResolutions(result.ownerResolutionsNeedingAttention)).toBeDefined();
  });

  it("current-team selection cannot use an unresolved owner", async () => {
    if (!dbAvailable) return;

    const league = miniLeague(2023, [
      team("1", "user_ok", "OK", "Team A"),
      team("2", undefined, "Ghost", "Team B"),
    ]);
    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(league, ["user_ok"]),
      history: [],
      previous: null,
      warnings: [],
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });

    const blocked = await runSelectSleeperTeam({
      userId: USER_ID,
      leagueId: LEAGUE_A,
      teamId: 2,
      ownerId: "user_ok",
      ownerName: "Ghost",
    });
    expect(blocked.success).toBe(false);
    if (!blocked.success) expect(blocked.error).toBe("owner_unresolved");
  });

  it("rivalry attribution updates after a manual correction without formula changes", async () => {
    if (!dbAvailable) return;

    const league = miniLeague(2023, [
      team("1", "user_a", "Owner A", "Team A"),
      team("2", undefined, "Ghost", "Team B"),
    ]);
    league.matchups = [
      {
        season: 2023,
        week: 1,
        homeTeamId: "1",
        awayTeamId: "2",
        homeScore: 100,
        awayScore: 90,
        winner: "home",
        isPlayoff: false,
      },
    ];

    vi.spyOn(sleeperAdapter, "fetchSleeperLeagueImportSnapshots").mockResolvedValue({
      current: sleeperSnapshot(league, ["user_a"]),
      history: [],
      previous: null,
      warnings: [],
    });

    await runSleeperLeagueImport({ userId: USER_ID, leagueId: LEAGUE_A });
    memCache.invalidateAll();

    const h2hBefore = await buildH2HAuthority(LEAGUE_A);
    expect(h2hBefore.opponentsOf("id:user_a")).not.toContain("id:user_b");

    await saveManualOwnerOverride({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 2,
      ownerKey: "id:user_b",
      ownerName: "Owner B",
      userId: USER_ID,
    });
    await reapplyOwnerResolutionForTeam({
      leagueId: LEAGUE_A,
      season: 2023,
      teamId: 2,
      knownUserIds: new Set(["user_a"]),
    });
    memCache.invalidateAll();

    const h2hAfter = await buildH2HAuthority(LEAGUE_A);
    expect(h2hAfter.opponentsOf("id:user_a")).toContain("id:user_b");
    const pair = h2hAfter.getH2H("id:user_a", "id:user_b");
    expect(pair.career.games).toBe(1);
    expect(pair.career.wins + pair.career.losses).toBe(1);
  });
});
