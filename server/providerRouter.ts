/**
 * Provider Router
 *
 * tRPC procedures for multi-provider league management.
 * Handles: provider listing, league connection, Sleeper league lookup,
 * and the DNA generation onboarding flow.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getSupportedProviders, PROVIDER_INFO, getAdapter } from "./providers/registry";
import { fetchSleeperLeagueImportSnapshots } from "./providers/sleeperAdapter";
import type { UniversalLeague } from "./providers/types";
import { getYahooLeaguesForUser } from "./providers/yahooAdapter";
import { isYahooConfigured } from "./providers/yahooOAuth";
import { getDb, reconcileActiveLeague, setActiveLeagueForUser } from "./db";
import { gmTeams, leagueConnections, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { fetchEspnViewsHardened, normalizeTeams, normalizeSettings, type EspnCreds } from "./espnService";
import { encryptCredentialsForDb } from "./_core/crypto";
import {
  readYahooPendingCredentials,
  runSelectYahooTeam,
  runYahooLeagueImport,
  yahooDiscoveryCustomerError,
} from "./yahooLeagueImport";
import {
  persistUniversalLeague,
  type PersistUniversalLeagueResult,
} from "./universalPersistence";
import {
  type OwnerResolutionSummary,
  type TeamOwnerResolution,
  type SleeperOwnerResolutionContext,
  loadManualOverrides,
  loadIndexedOwnersFromDb,
  resolveSleeperLeagueOwners,
  persistOwnerResolutions,
  summarizeResolutions,
  isSelectableOwnerStatus,
  saveManualOwnerOverride,
  removeManualOwnerOverride,
  listOwnerResolutions,
  listKnownLeagueOwners,
  reapplyOwnerResolutionForTeam,
  ownerIdFromOwnerKey,
  ownerKeyFromHistoricalName,
} from "./sleeperOwnerResolution";
import { gmTeamOwnerResolution } from "../drizzle/schema";
import type { SleeperLeagueSnapshot } from "./providers/sleeperAdapter";
import {
  previewSleeperWorkbookFile,
  runSelectSleeperWorkbookTeam,
  runSleeperWorkbookImport,
} from "./sleeperWorkbookImport";

// ─── Sleeper import orchestration ─────────────────────────────────────────────

export type SleeperLeagueImportResult = {
  success: boolean;
  dryRun: boolean;
  steps: string[];
  league: {
    leagueId: string;
    leagueName: string;
    season: number;
    teamCount: number;
    scoringType: string;
    currentWeek: number;
    provider: "sleeper";
  };
  persist: PersistUniversalLeagueResult;
  teams: Array<{
    teamId: number;
    ownerId: string | null;
    ownerKey: string | null;
    ownerName: string;
    teamName: string;
    resolutionStatus: TeamOwnerResolution["status"];
    suggestedOwnerKey: string | null;
    suggestedOwnerName: string | null;
    suggestionReason: string | null;
    selectable: boolean;
  }>;
  adapterWarnings: string[];
  matchupCount: number;
  transactionCount: number;
  draftPickCount: number;
  previousSeason: number | null;
  previousPersist: PersistUniversalLeagueResult | null;
  importedSeasons: number[];
  importedLeagueIds: string[];
  historyPersist: PersistUniversalLeagueResult[];
  ownerResolutionSummary: OwnerResolutionSummary;
  ownerResolutionsNeedingAttention: TeamOwnerResolution[];
};

function remapUniversalLeagueToLeagueId(league: UniversalLeague, leagueId: string): UniversalLeague {
  return {
    ...league,
    settings: {
      ...league.settings,
      leagueId,
    },
  };
}

async function importSleeperSnapshotWithOwnerResolution(args: {
  snap: SleeperLeagueSnapshot;
  connectionLeagueId: string;
  seasonOverride?: number;
  dryRun: boolean;
  context: SleeperOwnerResolutionContext;
}): Promise<{
  persist: PersistUniversalLeagueResult;
  resolutions: TeamOwnerResolution[];
}> {
  const remapped = remapUniversalLeagueToLeagueId(args.snap.league, args.connectionLeagueId);
  const season = args.seasonOverride ?? remapped.settings.season;
  const knownUserIds = new Set(args.snap.knownUserIds);

  const { league: resolvedLeague, resolutions } = resolveSleeperLeagueOwners({
    league: { ...remapped, settings: { ...remapped.settings, season } },
    connectionLeagueId: args.connectionLeagueId,
    knownUserIds,
    context: args.context,
  });

  const persist = await persistUniversalLeague(resolvedLeague, { dryRun: args.dryRun });
  await persistOwnerResolutions(args.connectionLeagueId, resolutions, args.dryRun);

  const unresolved = resolutions.filter((r) => r.status === "unresolved").length;
  if (unresolved > 0) {
    persist.warnings.push(
      `owner resolution: ${unresolved} team(s) unresolved in season ${season}`,
    );
  }

  return { persist, resolutions };
}

function buildSelectableTeams(
  leagueTeams: UniversalLeague["teams"],
  currentSeasonResolutions: TeamOwnerResolution[],
): SleeperLeagueImportResult["teams"] {
  const resolutionByTeam = new Map(currentSeasonResolutions.map((r) => [r.teamId, r]));

  return leagueTeams.map((t) => {
    const tid = Number(t.teamId);
    const resolution = resolutionByTeam.get(Number.isFinite(tid) ? tid : -1);
    const status = resolution?.status ?? "unresolved";
    const ownerKey = resolution?.ownerKey ?? null;
    const ownerId = ownerKey ? ownerIdFromOwnerKey(ownerKey) : (t.ownerId || null);
    return {
      teamId: Number.isFinite(tid) ? tid : 0,
      ownerId: ownerId?.trim() || null,
      ownerKey,
      ownerName: resolution?.ownerName ?? t.ownerName,
      teamName: t.teamName,
      resolutionStatus: status,
      suggestedOwnerKey: resolution?.suggestedOwnerKey ?? null,
      suggestedOwnerName: resolution?.suggestedOwnerName ?? null,
      suggestionReason: resolution?.suggestionReason ?? null,
      selectable: isSelectableOwnerStatus(status),
    };
  });
}

export async function runSleeperLeagueImport(args: {
  userId: number;
  leagueId: string;
  season?: number;
  dryRun?: boolean;
  includePreviousSeason?: boolean;
}): Promise<SleeperLeagueImportResult> {
  const steps: string[] = [];
  const dryRun = args.dryRun === true;

  const { assertCanConnectLeague } = await import("./connectedLeagueLimits");
  await assertCanConnectLeague(args.userId, "sleeper", args.leagueId);

  steps.push("Connecting to Sleeper API...");
  const { current, history, warnings: adapterWarnings } = await fetchSleeperLeagueImportSnapshots(
    args.leagueId,
    { includePreviousSeason: args.includePreviousSeason === true },
  );
  const league = current.league;
  const season = args.season ?? league.settings.season;

  steps.push(`Found league: ${league.settings.leagueName} (${league.teams.length} teams)`);
  steps.push(
    dryRun ? "Dry run — validating persistence mapping..." : "Persisting normalized league data...",
  );

  const manualOverrides = dryRun ? new Map() : await loadManualOverrides(args.leagueId);
  const indexedOwners = dryRun ? new Map() : await loadIndexedOwnersFromDb(args.leagueId);
  const resolutionContext: SleeperOwnerResolutionContext = {
    leagueId: args.leagueId,
    manualOverrides,
    indexedOwners,
  };

  const importedSeasons: number[] = [];
  const importedLeagueIds: string[] = [];
  const historyPersist: PersistUniversalLeagueResult[] = [];
  const allResolutions: TeamOwnerResolution[] = [];

  console.log(`Importing season ${season}...`);
  const { persist, resolutions: currentResolutions } = await importSleeperSnapshotWithOwnerResolution({
    snap: current,
    connectionLeagueId: args.leagueId,
    seasonOverride: season,
    dryRun,
    context: resolutionContext,
  });
  allResolutions.push(...currentResolutions);
  if (persist.failures.length === 0) {
    importedSeasons.push(season);
    importedLeagueIds.push(args.leagueId);
    console.log(`✓ Complete`);
  } else {
    adapterWarnings.push(
      `season ${season}: persist had failures — ${persist.failures.map((f) => f.message).join("; ")}`,
    );
    console.log(`⚠ season ${season} persist warnings`);
  }

  let previousSeason: number | null = null;
  let previousPersist: PersistUniversalLeagueResult | null = null;
  for (const snap of history) {
    const histSeason = snap.league.settings.season;
    const sourceLeagueId = String(snap.league.settings.leagueId);
    steps.push(`Importing linked season ${histSeason}...`);
    console.log(`Importing season ${histSeason}...`);
    const { persist: histPersist, resolutions: histResolutions } =
      await importSleeperSnapshotWithOwnerResolution({
        snap,
        connectionLeagueId: args.leagueId,
        dryRun,
        context: resolutionContext,
      });
    historyPersist.push(histPersist);
    allResolutions.push(...histResolutions);

    if (histPersist.failures.length > 0) {
      adapterWarnings.push(
        `season ${histSeason}: persist had failures — ${histPersist.failures.map((f) => f.message).join("; ")}`,
      );
      console.log(`⚠ season ${histSeason} persist warnings`);
    } else {
      importedSeasons.push(histSeason);
      importedLeagueIds.push(sourceLeagueId);
      console.log(`✓ Complete`);
      const pc = histPersist.counts;
      steps.push(
        dryRun
          ? `Season ${histSeason} dry run (teams=${pc.teams.persisted}, matchups=${pc.matchups.persisted})`
          : `Season ${histSeason} persisted (teams=${pc.teams.persisted}, matchups=${pc.matchups.persisted})`,
      );
      if (previousSeason === null) {
        previousSeason = histSeason;
        previousPersist = histPersist;
      }
    }
  }

  const ownerResolutionSummary = summarizeResolutions(allResolutions);
  steps.push(
    `Owner resolution — Verified: ${ownerResolutionSummary.verified}, Suggested: ${ownerResolutionSummary.suggested}, Unresolved: ${ownerResolutionSummary.unresolved}, Manual: ${ownerResolutionSummary.manual}`,
  );

  const c = persist.counts;
  steps.push(
    dryRun
      ? `Dry run complete (settings=${c.settings.persisted}, teams=${c.teams.persisted}, matchups=${c.matchups.persisted}, transactions=${c.transactions.persisted}, draftPicks=${c.draftPicks.persisted}, rosterEntries=${c.rosterEntries.persisted})`
      : `Persisted (teams=${c.teams.persisted}, matchups=${c.matchups.persisted}, transactions=${c.transactions.persisted}, draftPicks=${c.draftPicks.persisted})`,
  );

  const currentSeasonResolutions = allResolutions.filter((r) => r.season === season);
  const selectableTeams = buildSelectableTeams(league.teams, currentSeasonResolutions);
  const ownerResolutionsNeedingAttention = allResolutions.filter(
    (r) => r.status === "suggested" || r.status === "unresolved" || r.status === "manual",
  );

  const hardFailure =
    persist.failures.length > 0 ||
    (!dryRun && persist.counts.teams.persisted === 0);
  const historyIssues = historyPersist.some(
    (hp) => hp.warnings.length > 0 || hp.failures.length > 0 || hp.teamsMissingOwnerId.length > 0,
  );
  const partial =
    !dryRun &&
    !hardFailure &&
    (adapterWarnings.length > 0 ||
      persist.warnings.length > 0 ||
      persist.teamsMissingOwnerId.length > 0 ||
      historyIssues);

  if (!dryRun && !hardFailure) {
    const db = await getDb();
    if (!db) {
      throw new Error("Database unavailable");
    }

    const issueNotes = [
      ...adapterWarnings,
      ...persist.warnings,
      ...historyPersist.flatMap((hp) => hp.warnings),
      ...persist.failures.map((f) => `${f.entity}: ${f.message}`),
      ...historyPersist.flatMap((hp) => hp.failures.map((f) => `${f.entity}: ${f.message}`)),
    ];
    const syncStatus = partial ? "error" as const : "ok" as const;
    const syncError = partial && issueNotes.length > 0 ? issueNotes.join("; ").slice(0, 2000) : null;

    await db
      .insert(leagueConnections)
      .values({
        userId: args.userId,
        provider: "sleeper",
        leagueId: args.leagueId,
        leagueName: league.settings.leagueName,
        season,
        isActive: true,
        syncStatus,
        syncError,
        lastSyncedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          leagueName: league.settings.leagueName,
          isActive: true,
          syncStatus,
          syncError,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await reconcileActiveLeague(args.userId);
    steps.push("League connection saved.");
  } else if (!dryRun && hardFailure) {
    steps.push("Persistence failed — league connection not updated.");
  }

  return {
    success: dryRun || !hardFailure,
    dryRun,
    steps,
    league: {
      leagueId: args.leagueId,
      leagueName: league.settings.leagueName,
      season,
      teamCount: league.teams.length,
      scoringType: league.settings.scoringType,
      currentWeek: league.settings.currentWeek,
      provider: "sleeper",
    },
    persist,
    teams: selectableTeams,
    adapterWarnings,
    matchupCount: league.matchups.length,
    transactionCount: league.transactions.length,
    draftPickCount: league.draftPicks.length,
    previousSeason,
    previousPersist,
    importedSeasons,
    importedLeagueIds,
    historyPersist,
    ownerResolutionSummary,
    ownerResolutionsNeedingAttention,
  };
}

export type SelectSleeperTeamResult =
  | { success: true; leagueConnectionId: number; isSetupComplete: true }
  | { success: false; error: string };

export async function runSelectSleeperTeam(args: {
  userId: number;
  leagueId: string;
  teamId: number;
  ownerId?: string;
  ownerKey?: string;
  ownerName: string;
}): Promise<SelectSleeperTeamResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "no_db" };

  const leagueId = args.leagueId.trim();
  const providedOwnerKey =
    args.ownerKey?.trim() ||
    (args.ownerId?.trim() ? `id:${args.ownerId.trim()}` : "");
  if (!providedOwnerKey) return { success: false, error: "owner_required" };

  const [conn] = await db
    .select()
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, args.userId),
        eq(leagueConnections.provider, "sleeper"),
        eq(leagueConnections.leagueId, leagueId),
      ),
    )
    .limit(1);

  if (!conn) return { success: false, error: "connection_not_found" };

  const season = conn.season;
  if (season == null) return { success: false, error: "connection_season_missing" };

  const [team] = await db
    .select({
      teamId: gmTeams.teamId,
      name: gmTeams.name,
      ownerName: gmTeams.ownerName,
      ownerId: gmTeams.ownerId,
    })
    .from(gmTeams)
    .where(
      and(
        eq(gmTeams.leagueId, leagueId),
        eq(gmTeams.season, season),
        eq(gmTeams.teamId, args.teamId),
      ),
    )
    .limit(1);

  if (!team) return { success: false, error: "team_not_found" };

  const [resolution] = await db
    .select({
      status: gmTeamOwnerResolution.status,
      ownerKey: gmTeamOwnerResolution.ownerKey,
    })
    .from(gmTeamOwnerResolution)
    .where(
      and(
        eq(gmTeamOwnerResolution.leagueId, leagueId),
        eq(gmTeamOwnerResolution.season, season),
        eq(gmTeamOwnerResolution.teamId, args.teamId),
      ),
    )
    .limit(1);

  if (!resolution || !isSelectableOwnerStatus(resolution.status as TeamOwnerResolution["status"])) {
    return { success: false, error: "owner_unresolved" };
  }

  const resolvedKey = (resolution.ownerKey ?? "").trim();
  if (!resolvedKey || resolvedKey !== providedOwnerKey) {
    return { success: false, error: "owner_mismatch" };
  }

  const resolvedOwnerId = ownerIdFromOwnerKey(resolvedKey);
  if (resolvedOwnerId && team.ownerId !== resolvedOwnerId) {
    return { success: false, error: "owner_mismatch" };
  }

  await db
    .update(leagueConnections)
    .set({
      selectedTeamId: args.teamId,
      selectedOwnerKey: resolvedKey,
      selectedOwnerName: args.ownerName || team.ownerName || null,
      selectedFranchiseName: team.name || null,
      selectedSeason: season,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(leagueConnections.id, conn.id));

  await setActiveLeagueForUser(args.userId, conn.id);
  await reconcileActiveLeague(args.userId);

  return { success: true, leagueConnectionId: conn.id, isSetupComplete: true };
}

// ─── Provider info ────────────────────────────────────────────────────────────

export const providerRouter = router({
  /**
   * List all providers with their status (live / coming_soon).
   */
  listProviders: publicProcedure.query(() => {
    return PROVIDER_INFO;
  }),

  /**
   * Validate a Sleeper league ID and return basic league info.
   * No auth required — Sleeper API is public.
   */
  validateSleeperLeague: publicProcedure
    .input(z.object({ leagueId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(
          `https://api.sleeper.app/v1/league/${input.leagueId}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) {
          return { valid: false, error: `Sleeper returned ${res.status}` };
        }
        const data = await res.json() as {
          name: string;
          season: string;
          total_rosters: number;
          status: string;
          scoring_settings?: Record<string, number>;
        };
        const rec = data.scoring_settings?.["rec"] ?? 0;
        const scoringType = rec >= 1 ? "PPR" : rec >= 0.5 ? "Half PPR" : "Standard";
        return {
          valid: true,
          leagueName: data.name,
          season: data.season,
          teamCount: data.total_rosters,
          status: data.status,
          scoringType,
        };
      } catch (err) {
        return { valid: false, error: err instanceof Error ? err.message : "Network error" };
      }
    }),

  /**
   * Look up all Sleeper leagues for a given username.
   */
  getSleeperLeaguesForUser: publicProcedure
    .input(z.object({ username: z.string().min(1), season: z.number().default(2025) }))
    .query(async ({ input }) => {
      try {
        // First get user ID from username
        const userRes = await fetch(
          `https://api.sleeper.app/v1/user/${input.username}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!userRes.ok) {
          return { found: false, error: `User "${input.username}" not found on Sleeper` };
        }
        const user = await userRes.json() as { user_id: string; display_name: string };

        // Then get their leagues
        const leaguesRes = await fetch(
          `https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${input.season}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!leaguesRes.ok) {
          return { found: false, error: "Could not fetch leagues" };
        }
        const leagues = await leaguesRes.json() as Array<{
          league_id: string;
          name: string;
          season: string;
          total_rosters: number;
          status: string;
        }>;

        return {
          found: true,
          userId: user.user_id,
          displayName: user.display_name,
          leagues: leagues.map(l => ({
            leagueId: l.league_id,
            name: l.name,
            season: l.season,
            teamCount: l.total_rosters,
            status: l.status,
          })),
        };
      } catch (err) {
        return { found: false, error: err instanceof Error ? err.message : "Network error" };
      }
    }),

  /**
   * Import a Sleeper league: fetch snapshot → persist gm_* → save league_connections.
   */
  importSleeperLeague: protectedProcedure
    .input(z.object({
      leagueId: z.string().min(1),
      season: z.number().optional(),
      dryRun: z.boolean().optional(),
      includePreviousSeason: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return runSleeperLeagueImport({
        userId: ctx.user.id,
        leagueId: input.leagueId,
        season: input.season,
        dryRun: input.dryRun,
        includePreviousSeason: input.includePreviousSeason ?? true,
      });
    }),

  previewSleeperWorkbook: protectedProcedure
    .input(z.object({ fileBase64: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return previewSleeperWorkbookFile(input.fileBase64);
      } catch (err) {
        return {
          valid: false,
          version: "unknown",
          errors: [err instanceof Error ? err.message : "workbook_preview_failed"],
          warnings: [],
          leagueName: "",
          season: 0,
          leagueId: "",
          teamCount: 0,
          ownerCount: 0,
          draftPickCount: 0,
          matchupCount: 0,
          transactionCount: 0,
          rosterEntryCount: 0,
        };
      }
    }),

  importSleeperWorkbook: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        dryRun: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return runSleeperWorkbookImport({
        userId: ctx.user.id,
        fileBase64: input.fileBase64,
        dryRun: input.dryRun,
      });
    }),

  selectSleeperWorkbookTeam: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        teamId: z.number().int().positive(),
        ownerName: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runSelectSleeperWorkbookTeam({
        userId: ctx.user.id,
        leagueId: input.leagueId,
        teamId: input.teamId,
        ownerName: input.ownerName,
      });
      if (!result.success) {
        throw new TRPCError({
          code: result.error === "no_db" ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST",
          message: result.message,
        });
      }
      return result;
    }),

  listSleeperOwnerResolutions: protectedProcedure
    .input(z.object({ leagueId: z.string().min(1) }))
    .query(async ({ input }) => {
      const resolutions = await listOwnerResolutions(input.leagueId);
      const knownOwners = await listKnownLeagueOwners(input.leagueId);
      return {
        resolutions,
        knownOwners,
        summary: summarizeResolutions(resolutions),
      };
    }),

  confirmSleeperOwnerSuggestion: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        season: z.number().int(),
        teamId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const resolutions = await listOwnerResolutions(input.leagueId);
      const row = resolutions.find(
        (r) => r.season === input.season && r.teamId === input.teamId,
      );
      if (!row || row.status !== "suggested" || !row.suggestedOwnerKey) {
        return { success: false as const, error: "suggestion_not_found" };
      }
      await saveManualOwnerOverride({
        leagueId: input.leagueId,
        season: input.season,
        teamId: input.teamId,
        ownerKey: row.suggestedOwnerKey,
        ownerName: row.suggestedOwnerName || "",
        userId: ctx.user.id,
      });
      const updated = await reapplyOwnerResolutionForTeam({
        leagueId: input.leagueId,
        season: input.season,
        teamId: input.teamId,
        knownUserIds: new Set(),
      });
      return { success: true as const, resolution: updated };
    }),

  setSleeperOwnerOverride: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        season: z.number().int(),
        teamId: z.number().int().positive(),
        ownerKey: z.string().min(1).optional(),
        ownerId: z.string().min(1).optional(),
        ownerName: z.string().min(1),
        applyToSeasons: z.array(z.number().int()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const ownerKey =
        input.ownerKey?.trim() ||
        (input.ownerId ? `id:${input.ownerId.trim()}` : ownerKeyFromHistoricalName(input.ownerName));
      const seasons = input.applyToSeasons?.length
        ? input.applyToSeasons
        : [input.season];

      for (const season of seasons) {
        await saveManualOwnerOverride({
          leagueId: input.leagueId,
          season,
          teamId: input.teamId,
          ownerKey,
          ownerName: input.ownerName,
          userId: ctx.user.id,
        });
        await reapplyOwnerResolutionForTeam({
          leagueId: input.leagueId,
          season,
          teamId: input.teamId,
          knownUserIds: new Set(),
        });
      }
      return { success: true as const, seasons };
    }),

  removeSleeperOwnerOverride: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        season: z.number().int(),
        teamId: z.number().int().positive(),
        applyToSeasons: z.array(z.number().int()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const seasons = input.applyToSeasons?.length
        ? input.applyToSeasons
        : [input.season];
      for (const season of seasons) {
        await removeManualOwnerOverride({
          leagueId: input.leagueId,
          season,
          teamId: input.teamId,
        });
        await reapplyOwnerResolutionForTeam({
          leagueId: input.leagueId,
          season,
          teamId: input.teamId,
          knownUserIds: new Set(),
        });
      }
      return { success: true as const, seasons };
    }),

  /**
   * Save the user's team selection for an imported Sleeper league.
   */
  selectSleeperTeam: protectedProcedure
    .input(
      z
        .object({
          leagueId: z.string().min(1),
          teamId: z.number().int().positive(),
          ownerId: z.string().min(1).optional(),
          ownerKey: z.string().min(1).optional(),
          ownerName: z.string().min(1),
        })
        .refine((d) => Boolean(d.ownerId?.trim() || d.ownerKey?.trim()), {
          message: "owner_required",
        }),
    )
    .mutation(async ({ input, ctx }) => {
      return runSelectSleeperTeam({
        userId: ctx.user.id,
        leagueId: input.leagueId,
        teamId: input.teamId,
        ownerId: input.ownerId,
        ownerKey: input.ownerKey,
        ownerName: input.ownerName,
      });
    }),

  /**
   * Get the current user's connected leagues.
   */
  getMyLeagues: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) return [];
    const rows = await database
      .select()
      .from(leagueConnections)
      .where(eq(leagueConnections.userId, ctx.user.id));
    return rows;
  }),

  // ─── Yahoo procedures ────────────────────────────────────────────────────────────────

  /**
   * Check if Yahoo OAuth is configured on this server.
   * Returns { configured: boolean } so the frontend can show/hide the OAuth button.
   */
  isYahooConfigured: publicProcedure.query(() => {
    return { configured: isYahooConfigured() };
  }),

  /**
   * Get the Yahoo OAuth authorization URL for the current user.
   * The frontend redirects the user to this URL to grant access.
   */
  getYahooAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .query(({ input, ctx }) => {
      if (!isYahooConfigured()) {
        return { url: null, reason: "Yahoo OAuth is not configured on this server." };
      }
      const url = `${input.origin}/api/yahoo/oauth/start?origin=${encodeURIComponent(input.origin)}&userId=${ctx.user.id}`;
      return { url, reason: null };
    }),

  /**
   * Check if the current user has a pending Yahoo OAuth token (post-callback).
   * Returns the token expiry and whether the user needs to pick a league.
   */
  getYahooPendingAuth: protectedProcedure.query(async ({ ctx }) => {
    const creds = await readYahooPendingCredentials(ctx.user.id);
    if (!creds) return { hasPendingAuth: false as const };
    return {
      hasPendingAuth: true as const,
      expiresAt: creds.expiresAt,
    };
  }),

  /**
   * List all Yahoo Fantasy leagues for the authenticated user.
   * Requires a pending Yahoo auth token stored in leagueConnections.
   */
  getYahooLeagues: protectedProcedure
    .input(z.object({ season: z.number().default(2025) }))
    .query(async ({ input, ctx }) => {
      const creds = await readYahooPendingCredentials(ctx.user.id);
      if (!creds) {
        return {
          leagues: [] as Array<{
            leagueKey: string;
            leagueId: string;
            name: string;
            season: string;
            teamCount: number;
          }>,
          error: "no_pending_auth" as const,
          message: yahooDiscoveryCustomerError("authorization"),
        };
      }

      try {
        const leagues = await getYahooLeaguesForUser(
          creds.accessToken,
          creds.refreshToken,
          creds.expiresAt,
          input.season,
        );
        if (leagues.length === 0) {
          return {
            leagues,
            error: "no_leagues" as const,
            message: "No Yahoo Fantasy football leagues were found for this account.",
          };
        }
        return { leagues, error: null, message: null };
      } catch (err) {
        console.error("[Yahoo] getYahooLeagues failed:", err);
        return {
          leagues: [] as Array<{
            leagueKey: string;
            leagueId: string;
            name: string;
            season: string;
            teamCount: number;
          }>,
          error: "discovery_failed" as const,
          message: yahooDiscoveryCustomerError("fetch failed"),
        };
      }
    }),

  /**
   * Import a Yahoo league through UniversalLeague → persistUniversalLeague → gm_*.
   * Requires a pending Yahoo auth token stored in leagueConnections.
   */
  importYahooLeague: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        leagueName: z.string().default(""),
        season: z.number().default(2025),
        dryRun: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runYahooLeagueImport({
        userId: ctx.user.id,
        leagueId: input.leagueId,
        leagueName: input.leagueName,
        season: input.season,
        dryRun: input.dryRun,
      });
      if (!result.success) {
        throw new TRPCError({
          code:
            result.code === "no_pending_auth" || result.code === "invalid_credentials"
              ? "UNAUTHORIZED"
              : result.code === "no_db"
                ? "INTERNAL_SERVER_ERROR"
                : "BAD_REQUEST",
          message: result.message,
        });
      }
      return result;
    }),

  selectYahooTeam: protectedProcedure
    .input(
      z.object({
        leagueId: z.string().min(1),
        teamId: z.number().int().positive(),
        ownerName: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runSelectYahooTeam({
        userId: ctx.user.id,
        leagueId: input.leagueId,
        teamId: input.teamId,
        ownerName: input.ownerName,
      });
      if (!result.success) {
        throw new TRPCError({
          code: result.code === "no_db" ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST",
          message: result.message,
        });
      }
      return result;
    }),

  // ─── ESPN import ────────────────────────────────────────────────────────────────────────────────
  /**
   * Validate and import an ESPN league using per-user SWID + espn_s2 cookies.
   * Stores credentials in league_connections.credentials (JSON) so all subsequent
   * ESPN fetches for this user use their own cookies instead of the global env vars.
   */
  /**
   * Preview an ESPN league before connecting — fetches the real league name and team count.
   * Used by the LeagueConnect form to show a confirmation card before the user clicks Connect.
   */
  previewEspnLeague: protectedProcedure
    .input(z.object({
      leagueId: z.string().min(1),
      swid: z.string().min(1),
      espnS2: z.string().min(1),
      season: z.number().default(2025),
    }))
    .query(async ({ input }) => {
      try {
        const creds: EspnCreds = {
          leagueId: input.leagueId,
          swid: input.swid,
          espnS2: input.espnS2,
        };
        const result = await fetchEspnViewsHardened(input.season, ["mSettings", "mTeam"], creds);
        if (result.authError) {
          return { valid: false, error: "ESPN auth failed — check your SWID and espn_s2 cookies." };
        }
        const rawSettings = normalizeSettings(result.merged);
        const rawTeams = normalizeTeams(result.merged);
        const leagueName = (rawSettings.leagueName as string) || `ESPN League ${input.leagueId}`;
        const teamCount = rawTeams.length;
        return { valid: true, leagueName, teamCount };
      } catch (err) {
        return {
          valid: false,
          error: err instanceof Error ? err.message : "Could not reach ESPN — check your credentials.",
        };
      }
    }),

  importEspnLeague: protectedProcedure
    .input(z.object({
      leagueId: z.string().min(1, "League ID is required"),
      swid: z.string().min(1, "SWID cookie is required"),
      espnS2: z.string().min(1, "espn_s2 cookie is required"),
      season: z.number().default(2025),
    }))
    .mutation(async ({ input, ctx }) => {
      const steps: string[] = [];
      steps.push("Validating ESPN credentials...");

      const creds: EspnCreds = {
        leagueId: input.leagueId,
        swid: input.swid,
        espnS2: input.espnS2,
      };

      // Validate by fetching mSettings + mTeam
      let fetchResult;
      try {
        fetchResult = await fetchEspnViewsHardened(input.season, ["mSettings", "mTeam"], creds);
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? `ESPN auth failed: ${err.message}`
            : "ESPN auth failed — check your SWID and espn_s2 cookies."
        );
      }

      if (fetchResult.authError) {
        throw new Error("ESPN returned an auth error — your SWID or espn_s2 may be expired.");
      }

      const rawSettings = normalizeSettings(fetchResult.merged);
      const rawTeams = normalizeTeams(fetchResult.merged);
      const leagueName = (rawSettings.leagueName as string) || `ESPN League ${input.leagueId}`;
      const teamCount = rawTeams.length;

      steps.push(`Connected to "${leagueName}" (${teamCount} teams, ${input.season} season)`);
      steps.push("Saving credentials...");

      // Persist to league_connections (credentials encrypted at rest)
      const db = await getDb();
      if (db) {
        const encryptedCreds = encryptCredentialsForDb({
          leagueId: input.leagueId,
          swid: input.swid,
          espnS2: input.espnS2,
        });
        await db.insert(leagueConnections)
          .values({
            userId: ctx.user.id,
            provider: "espn",
            leagueId: input.leagueId,
            leagueName,
            season: input.season,
            isActive: true,
            credentials: encryptedCreds,
            syncStatus: "ok",
          })
          .onDuplicateKeyUpdate({
            set: {
              leagueName,
              isActive: true,
              credentials: encryptedCreds,
              syncStatus: "ok",
              syncError: null,
              updatedAt: new Date(),
            },
          });
      }

      steps.push("ESPN league connected successfully.");

      // Active-league safety (ARCHITECTURE.md S9): do not let this freshly-connected
      // (owner-not-yet-selected) league stay active over one the user has already set up.
      await reconcileActiveLeague(ctx.user.id);

      // Activate 7-day trial if user is still on 'free' plan
      if (db) {
        const [userRow] = await db
          .select({ subscriptionStatus: users.subscriptionStatus, trialStartedAt: users.trialStartedAt })
          .from(users)
          .where(eq(users.id, ctx.user.id))
          .limit(1);
        if (userRow && userRow.subscriptionStatus === 'free' && !userRow.trialStartedAt) {
          await db
            .update(users)
            .set({ subscriptionStatus: 'trialing', trialStartedAt: new Date() })
            .where(eq(users.id, ctx.user.id));
          steps.push("7-day free trial activated.");
        }
      }

      return {
        success: true,
        steps,
        league: {
          leagueId: input.leagueId,
          leagueName,
          season: input.season,
          teamCount,
          provider: "espn" as const,
        },
      };
    }),
});
