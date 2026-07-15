import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  espnSeasonCache,
  gmDraftPicks,
  gmLeagueSettings,
  gmMatchups,
  gmRosterEntries,
  gmTeamOwnerOverrides,
  gmTeamOwnerResolution,
  gmTeams,
  gmTransactions,
  leagueConnectionDisplayNames,
  leagueConnections,
  users,
} from "../../drizzle/schema";
import {
  ALL_SLEEPER_TEST_LEAGUE_IDS,
  ALL_SLEEPER_TEST_USER_IDS,
  type SleeperIntegrationFixture,
  type SleeperIntegrationScope,
  fixturesForScope,
} from "./sleeperIntegrationFixtures";

export type SleeperSmokeProbeRow = {
  leagueId: string;
  leagueName: string;
  season: number;
  userId: number;
  provider: string;
};

export async function isSleeperIntegrationDbAvailable(): Promise<boolean> {
  return (await getDb()) != null;
}

async function purgeLeagueArtifacts(leagueIds: readonly string[]): Promise<void> {
  if (leagueIds.length === 0) return;
  const db = await getDb();
  if (!db) return;

  await db.delete(gmRosterEntries).where(inArray(gmRosterEntries.leagueId, [...leagueIds]));
  await db.delete(gmDraftPicks).where(inArray(gmDraftPicks.leagueId, [...leagueIds]));
  await db.delete(gmTransactions).where(inArray(gmTransactions.leagueId, [...leagueIds]));
  await db.delete(gmMatchups).where(inArray(gmMatchups.leagueId, [...leagueIds]));
  await db.delete(gmTeams).where(inArray(gmTeams.leagueId, [...leagueIds]));
  await db.delete(gmLeagueSettings).where(inArray(gmLeagueSettings.leagueId, [...leagueIds]));
  await db.delete(gmTeamOwnerOverrides).where(inArray(gmTeamOwnerOverrides.leagueId, [...leagueIds]));
  await db.delete(gmTeamOwnerResolution).where(inArray(gmTeamOwnerResolution.leagueId, [...leagueIds]));
  await db.delete(espnSeasonCache).where(inArray(espnSeasonCache.leagueId, [...leagueIds]));
}

async function purgeUserArtifacts(userIds: readonly number[]): Promise<void> {
  if (userIds.length === 0) return;
  const db = await getDb();
  if (!db) return;

  await db
    .delete(leagueConnectionDisplayNames)
    .where(inArray(leagueConnectionDisplayNames.userId, [...userIds]));
  await db.delete(leagueConnections).where(inArray(leagueConnections.userId, [...userIds]));
  await db.update(users).set({ activeLeagueId: null }).where(inArray(users.id, [...userIds]));
}

export async function cleanupSleeperIntegrationFixture(
  fixture: SleeperIntegrationFixture,
): Promise<void> {
  await purgeLeagueArtifacts(fixture.leagueIds);
  await purgeUserArtifacts(fixture.userIds);
}

export async function cleanupSleeperIntegrationScope(scope: SleeperIntegrationScope): Promise<void> {
  await cleanupSleeperIntegrationFixture(fixturesForScope(scope));
}

/** Remove every known Sleeper integration / smoke artifact. */
export async function cleanupAllSleeperIntegrationArtifacts(): Promise<void> {
  await purgeLeagueArtifacts(ALL_SLEEPER_TEST_LEAGUE_IDS);
  await purgeUserArtifacts(ALL_SLEEPER_TEST_USER_IDS);
}

export async function probeSleeperSmokeConnections(): Promise<{
  rows: SleeperSmokeProbeRow[];
  matchCount: number;
}> {
  const db = await getDb();
  if (!db) {
    return { rows: [], matchCount: 0 };
  }

  const rows = await db
    .select({
      leagueId: leagueConnections.leagueId,
      leagueName: leagueConnections.leagueName,
      season: leagueConnections.season,
      userId: leagueConnections.userId,
      provider: leagueConnections.provider,
    })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.provider, "sleeper"),
        or(
          inArray(leagueConnections.leagueId, [...ALL_SLEEPER_TEST_LEAGUE_IDS]),
          inArray(leagueConnections.userId, [...ALL_SLEEPER_TEST_USER_IDS]),
        ),
      ),
    );

  return { rows, matchCount: rows.length };
}

export async function assertSleeperSmokeProbeClean(): Promise<void> {
  const { rows, matchCount } = await probeSleeperSmokeConnections();
  if (matchCount !== 0) {
    throw new Error(
      `Expected zero Sleeper smoke connections, found ${matchCount}: ${JSON.stringify(rows)}`,
    );
  }
}

/** try/finally wrapper for scripts and ad-hoc smoke runs. */
export async function runWithSleeperIntegrationCleanup<T>(
  scope: SleeperIntegrationScope,
  fn: () => Promise<T>,
): Promise<T> {
  await cleanupSleeperIntegrationScope(scope);
  try {
    return await fn();
  } finally {
    await cleanupSleeperIntegrationScope(scope);
  }
}
