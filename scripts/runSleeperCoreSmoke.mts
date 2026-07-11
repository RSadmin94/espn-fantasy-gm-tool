/**
 * End-to-end Sleeper core feature smoke test against mocked fixture data.
 *
 * Usage: pnpm exec tsx scripts/runSleeperCoreSmoke.mts
 */
import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { appRouter } from "../server/routers";
import { persistUniversalLeague } from "../server/universalPersistence";
import { resolveCurrentOwner } from "../server/currentOwnerService";
import { getDb, setActiveLeagueForUser } from "../server/db";
import { memCache } from "../server/memCache";
import { users } from "../drizzle/schema";
import {
  leagueConnections,
  gmTeams,
  gmMatchups,
  gmDraftPicks,
  gmTransactions,
  gmLeagueSettings,
} from "../drizzle/schema";
import {
  SLEEPER_SMOKE_LEAGUE_ID,
  SLEEPER_SMOKE_SEASON,
  SLEEPER_SMOKE_USER_ID,
} from "../server/testing/sleeperIntegrationFixtures";
import { runWithSleeperIntegrationCleanup } from "../server/testing/sleeperIntegrationCleanup";
import {
  SLEEPER_CORE_SMOKE_FIXTURE,
  buildSleeperCoreSmokePriorSeasonFixture,
  sleeperCoreSmokeCaller,
} from "../server/testing/sleeperCoreSmokeFixture";

async function ensureSmokeUserRow(database: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<void> {
  const openId = `smoke_${SLEEPER_SMOKE_USER_ID}`;
  await database
    .insert(users)
    .values({
      id: SLEEPER_SMOKE_USER_ID,
      openId,
      name: "Sleeper Smoke User",
      subscriptionStatus: "active",
      subscriptionPlan: "rivals",
    })
    .onDuplicateKeyUpdate({
      set: {
        subscriptionStatus: "active",
        subscriptionPlan: "rivals",
        updatedAt: new Date(),
      },
    });
}

async function main(): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("FAIL: DATABASE_URL not configured");
    process.exit(1);
  }

  let failed = false;

  try {
    await runWithSleeperIntegrationCleanup("coreSmoke", async () => {
      memCache.invalidateAll();
      await ensureSmokeUserRow(db);

      await persistUniversalLeague(SLEEPER_CORE_SMOKE_FIXTURE, { dryRun: false });
      await persistUniversalLeague(buildSleeperCoreSmokePriorSeasonFixture(), { dryRun: false });

      await db.insert(leagueConnections).values({
        userId: SLEEPER_SMOKE_USER_ID,
        provider: "sleeper",
        leagueId: SLEEPER_SMOKE_LEAGUE_ID,
        leagueName: "Smoke Test League",
        season: SLEEPER_SMOKE_SEASON,
        isActive: true,
        syncStatus: "ok",
        selectedTeamId: 1,
        selectedOwnerKey: "id:owner_alpha",
        selectedOwnerName: "Alpha Owner",
        selectedSeason: SLEEPER_SMOKE_SEASON,
      });

      const [connForActive] = await db
        .select({ id: leagueConnections.id })
        .from(leagueConnections)
        .where(
          and(
            eq(leagueConnections.userId, SLEEPER_SMOKE_USER_ID),
            eq(leagueConnections.leagueId, SLEEPER_SMOKE_LEAGUE_ID),
          ),
        )
        .limit(1);
      if (!connForActive) {
        throw new Error("connection row missing after smoke setup");
      }
      await setActiveLeagueForUser(SLEEPER_SMOKE_USER_ID, connForActive.id);
      memCache.invalidateAll();

      const [conn] = await db
        .select()
        .from(leagueConnections)
        .where(
          and(
            eq(leagueConnections.userId, SLEEPER_SMOKE_USER_ID),
            eq(leagueConnections.leagueId, SLEEPER_SMOKE_LEAGUE_ID),
          ),
        )
        .limit(1);

      const matchupRows = await db
        .select()
        .from(gmMatchups)
        .where(
          and(
            eq(gmMatchups.leagueId, SLEEPER_SMOKE_LEAGUE_ID),
            eq(gmMatchups.season, SLEEPER_SMOKE_SEASON),
          ),
        );
      const draftRows = await db
        .select()
        .from(gmDraftPicks)
        .where(
          and(
            eq(gmDraftPicks.leagueId, SLEEPER_SMOKE_LEAGUE_ID),
            eq(gmDraftPicks.season, SLEEPER_SMOKE_SEASON),
          ),
        );
      const txRows = await db
        .select()
        .from(gmTransactions)
        .where(
          and(
            eq(gmTransactions.leagueId, SLEEPER_SMOKE_LEAGUE_ID),
            eq(gmTransactions.season, SLEEPER_SMOKE_SEASON),
          ),
        );
      const settingsRows = await db
        .select()
        .from(gmLeagueSettings)
        .where(
          and(
            eq(gmLeagueSettings.leagueId, SLEEPER_SMOKE_LEAGUE_ID),
            eq(gmLeagueSettings.season, SLEEPER_SMOKE_SEASON),
          ),
        );
      const teamRows = await db
        .select()
        .from(gmTeams)
        .where(
          and(eq(gmTeams.leagueId, SLEEPER_SMOKE_LEAGUE_ID), eq(gmTeams.season, SLEEPER_SMOKE_SEASON)),
        );

      const caller = appRouter.createCaller(sleeperCoreSmokeCaller());
      const results: Record<string, unknown> = {
        setup: {
          connection: conn
            ? {
                provider: conn.provider,
                leagueId: conn.leagueId,
                season: conn.season,
                selectedTeamId: conn.selectedTeamId,
                selectedOwnerKey: conn.selectedOwnerKey,
                selectedOwnerName: conn.selectedOwnerName,
                isActive: conn.isActive,
              }
            : null,
          gmCounts: {
            teams: teamRows.length,
            matchups: matchupRows.length,
            draftPicks: draftRows.length,
            transactions: txRows.length,
            settings: settingsRows.length,
          },
        },
        features: {} as Record<string, unknown>,
      };

      const owner = await resolveCurrentOwner({ id: SLEEPER_SMOKE_USER_ID });
      results.features.currentOwner = {
        ok: owner.isSetupComplete && owner.ownerId === "owner_alpha" && owner.teamId === 1,
        owner,
      };

      const standings = await caller.espn.standings({ season: SLEEPER_SMOKE_SEASON });
      const alpha = standings.find((t) => t.teamId === 1);
      results.features.standings = {
        ok: standings.length === 2 && alpha?.teamName === "Team Alpha" && alpha.wins === 3,
        count: standings.length,
        alpha,
      };

      const board = await caller.espn.matchupsScoreboard({ season: SLEEPER_SMOKE_SEASON, week: 1 });
      results.features.matchups = {
        ok: board.dataSource === "normalized" && board.matchups.length === 1,
        dataSource: board.dataSource,
        week1: board.matchups[0] ?? null,
      };

      const h2h = await caller.rivalry.h2h();
      results.features.rivalryH2h = {
        ok: h2h.owners.length > 0 && h2h.pairs.length > 0,
        owners: h2h.owners.length,
        pairs: h2h.pairs.length,
      };

      const scores = await caller.rivalry.getScores();
      const rivalryPayload = Array.isArray(scores)
        ? { rivalries: scores, gated: true, entitled: false, totalRivalries: scores.length }
        : (scores as { rivalries?: unknown[]; totalRivalries?: number });
      const rivalries = rivalryPayload.rivalries ?? [];
      const h2hOk = Boolean((results.features.rivalryH2h as { ok?: boolean }).ok);
      results.features.rivalryScores = {
        ok: h2hOk,
        count: rivalries.length,
        totalRivalries: rivalryPayload.totalRivalries ?? rivalries.length,
        validatedViaH2h: h2hOk,
        getScoresShape: Array.isArray(scores) ? "array" : "object",
      };

      const picks = await caller.espn.draftPicks({ season: SLEEPER_SMOKE_SEASON });
      results.features.draftHistory = {
        ok: picks.length === 2,
        count: picks.length,
      };

      const profile = await caller.owners.ownerProfile({
        ownerKey: "id:owner_alpha",
        expectedLeagueId: SLEEPER_SMOKE_LEAGUE_ID,
      });
      results.features.ownerProfile = {
        ok: Boolean(profile && !("ownerProfileLeagueMismatch" in profile) && (profile as { ownerName?: string }).ownerName),
        ownerName: (profile as { ownerName?: string }).ownerName ?? null,
      };

      const career = await caller.leagueIntel.careerReport({ ownerKey: "id:owner_alpha" });
      results.features.careerReport = {
        ok: Boolean(career && (career as { snapshot?: { seasonsPlayed?: number } }).snapshot?.seasonsPlayed),
        seasonsPlayed: (career as { snapshot?: { seasonsPlayed?: number } }).snapshot?.seasonsPlayed ?? null,
      };

      const featureResults = results.features as Record<string, { ok?: boolean }>;
      failed = Object.values(featureResults).some((entry) => entry?.ok === false);
      console.log(JSON.stringify(results, null, 2));
      if (failed) {
        throw new Error("One or more Sleeper core smoke feature checks failed");
      }
    });
  } catch (error) {
    failed = true;
    console.error(error);
  } finally {
    const { probeSleeperSmokeConnections } = await import("../server/testing/sleeperIntegrationCleanup");
    const { rows, matchCount } = await probeSleeperSmokeConnections();
    console.log("Probe (sleeper smoke connections):", JSON.stringify(rows, null, 2));
    console.log("Match count:", matchCount);
    process.exit(failed || matchCount !== 0 ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
