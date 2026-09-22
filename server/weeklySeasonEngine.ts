/**
 * Weekly Season Intelligence Engine
 *
 * Canonical (leagueId, season, week) orchestrator. Reuses existing ESPN refresh,
 * weekly stats fetch, storylines, fear index, League Wire facts, and RFSN story
 * detection. Does not introduce a parallel data plane.
 */

import { and, eq } from "drizzle-orm";
import { weeklySeasonPacks } from "../drizzle/schema";
import {
  getDb,
  getDefaultEspnLeagueId,
  getEspnRawCacheCombinedPayload,
  getLatestEspnRawCacheCombined,
} from "./db";
import { refreshSingleSeason } from "./espnSeasonRefresh";
import {
  upsertRosterEntries,
  upsertDerivedStandingsSnapshots,
} from "./espnPersistence";
import { fetchAndCacheWeeklyStats } from "./weeklyStatsService";
import { refreshWeeklyStorylines } from "./weeklyStorylinesService";
import { refreshFearIndex } from "./fearIndexService";
import { getSeasonMatchups, getSeasonTeams } from "./leagueDataReads";
import { resolveEspnCreds, type EspnCreds } from "./espnService";
import { memCache } from "./memCache";
import { requireAttributedLeagueId } from "./weeklySeasonIdentity";
import { ensureWeeklySeasonSchema } from "./weeklySeasonSchemaEnsure";
import {
  weeklyWorkForStatus,
  weekResultFingerprint,
  detectFinalWeekCorrection,
  cronWeeksToProcess,
  correctionWeeksFromPacks,
  CRON_CATCHUP_CAP,
  type WeeklySeasonMode,
} from "./weeklySeasonSchedule";
import {
  buildSeasonClock,
  clockMatchupsFromLeagueReads,
  authoritativeMatchupsForWeek,
  type SeasonClock,
  type WeekStatus,
  type ClockMatchup,
} from "./weeklySeasonClock";
import { buildStandingsThroughWeek } from "./weeklyStandingsThroughWeek";
import {
  benchRegretForTeam,
  loadLineupPlayersForWeek,
  playerOfGameForTeams,
} from "./weeklyLineupOutcomes";

export type { WeeklySeasonMode };
export {
  cronWeeksToProcess,
  weeklyWorkForStatus,
  CRON_CATCHUP_CAP,
  weekResultFingerprint,
  detectFinalWeekCorrection,
  correctionWeeksFromPacks,
};

export function shouldGenerateEditionNarratives(mode: WeeklySeasonMode, weekStatus: WeekStatus): boolean {
  return weeklyWorkForStatus(weekStatus, mode).editionNarratives;
}

export type ProcessLeagueWeekInput = {
  leagueId: string;
  season?: number;
  week?: number;
  mode?: WeeklySeasonMode;
  userId?: number;
  creds?: EspnCreds;
  skipProviderRefresh?: boolean;
};

export type WeeklySeasonReceipts = {
  espnRefreshed: boolean;
  usedRawCache: boolean;
  weeklyStatsStatus: "cached" | "ok" | "error" | "skipped";
  weeklyStatsRows: number;
  rosterSnapshotCount: number;
  standingsSnapshotCount: number;
  storylineCount: number;
  fearCount: number;
  storyEngineCount: number;
  playerOfGameCount: number;
  benchRegretCount: number;
  editionNarrativeCount: number;
  correctionApplied: boolean;
  errors: string[];
};

export type WeeklySeasonPackResult = {
  clock: SeasonClock;
  facts: {
    teamCount: number;
    matchupCount: number;
    completedMatchupCount: number;
    weekStatus: WeekStatus;
    resultFingerprint?: string;
    correctionApplied?: boolean;
  };
  receipts: WeeklySeasonReceipts;
};

async function loadCombined(
  leagueId: string,
  season?: number,
): Promise<{ season: number; payload: Record<string, unknown>; updatedAt: Date | null } | null> {
  if (season) {
    const payload = await getEspnRawCacheCombinedPayload(leagueId, season);
    if (payload) return { season, payload, updatedAt: null };
  }
  return getLatestEspnRawCacheCombined(leagueId);
}

async function persistPack(pack: WeeklySeasonPackResult): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { clock, facts, receipts } = pack;
  await db
    .insert(weeklySeasonPacks)
    .values({
      leagueId: clock.leagueId,
      season: clock.season,
      week: clock.requestedWeek,
      weekStatus: clock.weekStatus,
      currentMatchupPeriod: clock.currentMatchupPeriod,
      factsJson: JSON.stringify(facts),
      receiptsJson: JSON.stringify(receipts),
    })
    .onDuplicateKeyUpdate({
      set: {
        weekStatus: clock.weekStatus,
        currentMatchupPeriod: clock.currentMatchupPeriod,
        factsJson: JSON.stringify(facts),
        receiptsJson: JSON.stringify(receipts),
        generatedAt: new Date(),
      },
    });
}

export async function getWeeklySeasonPack(
  leagueId: string,
  season: number,
  week: number,
): Promise<WeeklySeasonPackResult | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(weeklySeasonPacks)
    .where(
      and(
        eq(weeklySeasonPacks.leagueId, leagueId),
        eq(weeklySeasonPacks.season, season),
        eq(weeklySeasonPacks.week, week),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  try {
    return {
      clock: {
        leagueId: row.leagueId,
        season: row.season,
        currentMatchupPeriod: row.currentMatchupPeriod,
        latestScoringPeriod: null,
        requestedWeek: row.week,
        weekStatus: row.weekStatus as WeekStatus,
        providerFreshness: {
          cachedAt: row.generatedAt?.toISOString() ?? null,
          source: "espn_combined_cache",
        },
      },
      facts: JSON.parse(row.factsJson) as WeeklySeasonPackResult["facts"],
      receipts: JSON.parse(row.receiptsJson) as WeeklySeasonReceipts,
    };
  } catch {
    return null;
  }
}

export async function resolveSeasonClockForLeague(opts: {
  leagueId: string;
  season?: number;
  week?: number;
}): Promise<SeasonClock> {
  const leagueId = requireAttributedLeagueId(opts.leagueId);
  const cached = await loadCombined(leagueId, opts.season);
  if (!cached) {
    throw new Error(`No ESPN combined cache for league ${leagueId}; refresh before resolving the season clock`);
  }
  const matchRes = await getSeasonMatchups({ leagueId, season: cached.season });
  return buildSeasonClock({
    leagueId,
    payload: cached.payload,
    matchups: clockMatchupsFromLeagueReads(matchRes.rows as Array<Record<string, unknown>>),
    requestedWeek: opts.week,
    cachedAt: cached.updatedAt,
    source: "espn_combined_cache",
  });
}

/**
 * Process one league-week. Every step after league resolution uses the explicit
 * (leagueId, season, week) triple — never an implicit default league.
 */
export async function processLeagueWeek(input: ProcessLeagueWeekInput): Promise<WeeklySeasonPackResult> {
  const leagueId = requireAttributedLeagueId(input.leagueId);
  const mode: WeeklySeasonMode = input.mode ?? "manual";
  const errors: string[] = [];
  const generateLLM = mode === "manual" || mode === "regenerate";
  const replaceExisting = mode !== "scheduled" && mode !== "replay";

  try {
    const schemaNotes = await ensureWeeklySeasonSchema();
    for (const n of schemaNotes) {
      if (n.includes("failed")) errors.push(`schema:${n}`);
    }
  } catch (e) {
    errors.push(`schema:${e instanceof Error ? e.message : String(e)}`);
  }

  const creds: EspnCreds = {
    ...(await resolveEspnCreds(input.creds, input.userId)),
    leagueId,
  };

  let espnRefreshed = false;
  if (mode !== "replay" && !input.skipProviderRefresh) {
    const seasonHint = input.season ?? (await loadCombined(leagueId))?.season;
    if (seasonHint) {
      try {
        const result = await refreshSingleSeason({
          season: seasonHint,
          leagueId,
          creds,
          userId: input.userId,
        });
        if (result.status === "failed") errors.push(result.error ?? "espn refresh failed");
        else espnRefreshed = true;
      } catch (e) {
        errors.push(`espn-refresh:${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const cached = await loadCombined(leagueId, input.season);
  if (!cached) {
    throw new Error(`No ESPN combined payload for league ${leagueId}`);
  }

  const teamsRes = await getSeasonTeams({ leagueId, season: cached.season });
  const matchRes = await getSeasonMatchups({ leagueId, season: cached.season });
  const clockMatchups = clockMatchupsFromLeagueReads(matchRes.rows as Array<Record<string, unknown>>);
  const clock = buildSeasonClock({
    leagueId,
    payload: cached.payload,
    matchups: clockMatchups,
    requestedWeek: input.week,
    cachedAt: cached.updatedAt,
    source: "espn_combined_cache",
  });
  const season = clock.season;
  const week = clock.requestedWeek;
  const work = weeklyWorkForStatus(clock.weekStatus, mode);
  const previousPack = await getWeeklySeasonPack(leagueId, season, week);
  const resultFingerprint = weekResultFingerprint(clockMatchups, week);
  const correctionApplied = detectFinalWeekCorrection({
    previousStatus: previousPack?.clock.weekStatus ?? null,
    previousFingerprint: previousPack?.facts.resultFingerprint,
    nextStatus: clock.weekStatus,
    nextFingerprint: resultFingerprint,
  });
  const previousFinal = previousPack?.clock.weekStatus === "FINAL";
  const skipDerived =
    mode === "scheduled" &&
    clock.weekStatus === "FINAL" &&
    previousFinal &&
    !correctionApplied;

  const matchups = clockMatchups.map((m) => ({
    matchupPeriodId: m.matchupPeriodId ?? undefined,
    week: m.week ?? undefined,
    isCompleted: m.isCompleted === true || m.isCompleted === 1 ? 1 : 0,
    winnerTeamId: m.winnerTeamId ?? null,
    homeTeamId: Number(m.homeTeamId) || 0,
    awayTeamId: Number(m.awayTeamId) || 0,
    homeScore: Number(m.homeScore) || 0,
    awayScore: Number(m.awayScore) || 0,
  }));

  const receipts: WeeklySeasonReceipts = {
    espnRefreshed,
    usedRawCache: true,
    weeklyStatsStatus: "skipped",
    weeklyStatsRows: 0,
    rosterSnapshotCount: 0,
    standingsSnapshotCount: 0,
    storylineCount: 0,
    fearCount: 0,
    storyEngineCount: 0,
    playerOfGameCount: 0,
    benchRegretCount: 0,
    editionNarrativeCount: 0,
    correctionApplied: false,
    errors,
  };

  const db = await getDb();

  if (work.weeklyStats && !skipDerived) {
    try {
      const stats = await fetchAndCacheWeeklyStats({
        leagueId,
        season,
        week,
        creds,
        forceRefresh: mode === "certify" || mode === "regenerate" || mode === "manual" || correctionApplied,
      });
      receipts.weeklyStatsStatus = stats.status;
      receipts.weeklyStatsRows = stats.rowCount;
      if (stats.error) errors.push(`weekly-stats:${stats.error}`);
      if (work.rosterSnapshot && stats.payload && db) {
        receipts.rosterSnapshotCount = await upsertRosterEntries(db, leagueId, season, stats.payload, week);
      }
    } catch (e) {
      receipts.weeklyStatsStatus = "error";
      errors.push(`weekly-stats:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (work.standingsSnapshot && (!skipDerived || correctionApplied)) {
    try {
      if (db) {
        const derived = buildStandingsThroughWeek(
          (teamsRes.rows as Array<{ teamId: number }>).map((t) => ({ teamId: Number(t.teamId) })),
          matchups,
          week,
        );
        receipts.standingsSnapshotCount = await upsertDerivedStandingsSnapshots(db, leagueId, season, week, derived);
      }
    } catch (e) {
      errors.push(`standings-snapshot:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (work.liveStorylines && !skipDerived) {
    try {
      const rows = await refreshWeeklyStorylines(season, input.userId, {
        leagueId,
        week,
        generateLLM,
        replaceExisting: replaceExisting || correctionApplied,
      });
      receipts.storylineCount = rows.length;
    } catch (e) {
      errors.push(`storylines:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (work.liveFear && !skipDerived) {
    try {
      const entries = await refreshFearIndex(season, undefined, input.userId, { leagueId, week });
      receipts.fearCount = entries.length;
    } catch (e) {
      errors.push(`fear:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (work.storyEngine && !skipDerived) {
    try {
      const { refreshLeagueStories } = await import("./storyEngine");
      const stories = await refreshLeagueStories(leagueId);
      receipts.storyEngineCount = stories.length;
    } catch (e) {
      errors.push(`story-engine:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (work.lineupFacts && !skipDerived) {
    try {
      const players = await loadLineupPlayersForWeek(leagueId, season, week);
      const weekMatchups = authoritativeMatchupsForWeek(clockMatchups, week);
      for (const m of weekMatchups) {
        const homeId = Number(m.homeTeamId) || 0;
        const awayId = Number(m.awayTeamId) || 0;
        const homeScore = Number(m.homeScore) || 0;
        const awayScore = Number(m.awayScore) || 0;
        if (playerOfGameForTeams(players, [homeId, awayId], {
          [homeId]: homeScore,
          [awayId]: awayScore,
        })) receipts.playerOfGameCount += 1;
        const homeRegret = benchRegretForTeam(players, homeId, {
          teamScore: homeScore,
          opponentScore: awayScore,
        });
        const awayRegret = benchRegretForTeam(players, awayId, {
          teamScore: awayScore,
          opponentScore: homeScore,
        });
        if (homeRegret || awayRegret) {
          receipts.benchRegretCount += 1;
        }
      }
    } catch (e) {
      errors.push(`lineups:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (work.editionNarratives && !skipDerived) {
    try {
      const { ensureEditionNarratives } = await import("./weeklyEditionService");
      const edition = await ensureEditionNarratives({ leagueId, season, week });
      receipts.editionNarrativeCount = edition.results.length;
    } catch (e) {
      errors.push(`edition:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  receipts.correctionApplied = correctionApplied;
  memCache.invalidateAll();

  const weekMatchupsForPack = authoritativeMatchupsForWeek(clockMatchups, week);
  const pack: WeeklySeasonPackResult = {
    clock,
    facts: {
      teamCount: teamsRes.count,
      matchupCount: weekMatchupsForPack.length,
      completedMatchupCount: weekMatchupsForPack.filter(
        (m) => m.isCompleted === true || m.isCompleted === 1 || (m.winnerTeamId != null && Number(m.winnerTeamId) > 0),
      ).length,
      weekStatus: clock.weekStatus,
      resultFingerprint,
      correctionApplied,
    },
    receipts,
  };
  if (work.persistPack) {
    try {
      await persistPack(pack);
    } catch (e) {
      errors.push(`pack:${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return pack;
}

export async function listProcessedFinalWeekMeta(
  leagueId: string,
  season: number,
): Promise<Array<{ week: number; resultFingerprint: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      week: weeklySeasonPacks.week,
      weekStatus: weeklySeasonPacks.weekStatus,
      factsJson: weeklySeasonPacks.factsJson,
    })
    .from(weeklySeasonPacks)
    .where(and(eq(weeklySeasonPacks.leagueId, leagueId), eq(weeklySeasonPacks.season, season)));
  return rows
    .filter((r) => r.weekStatus === "FINAL")
    .map((r) => {
      let resultFingerprint: string | null = null;
      try {
        const facts = JSON.parse(r.factsJson) as { resultFingerprint?: string };
        resultFingerprint = facts.resultFingerprint ?? null;
      } catch {
        resultFingerprint = null;
      }
      return { week: r.week, resultFingerprint };
    })
    .sort((a, b) => a.week - b.week);
}

export async function listProcessedFinalWeeks(leagueId: string, season: number): Promise<number[]> {
  return (await listProcessedFinalWeekMeta(leagueId, season)).map((r) => r.week);
}

export async function planScheduledWeeks(opts: {
  leagueId: string;
  season?: number;
  week?: number;
}): Promise<{ clock: SeasonClock; weeks: number[]; matchups: ClockMatchup[] }> {
  const clock = await resolveSeasonClockForLeague(opts);
  const cached = await loadCombined(clock.leagueId, clock.season);
  const matchRes = cached
    ? await getSeasonMatchups({ leagueId: clock.leagueId, season: cached.season })
    : { rows: [] as Array<Record<string, unknown>> };
  const matchups = clockMatchupsFromLeagueReads(matchRes.rows as Array<Record<string, unknown>>);
  const processedMeta = await listProcessedFinalWeekMeta(clock.leagueId, clock.season);
  const weeks = cronWeeksToProcess({
    clock,
    matchups,
    processedFinalWeeks: processedMeta.map((p) => p.week),
    explicitWeek: opts.week,
    correctionWeeks: [
      ...correctionWeeksFromPacks({ matchups, packs: processedMeta }),
      ...processedMeta.filter((p) => !p.resultFingerprint).map((p) => p.week),
    ],
  });
  return { clock, weeks, matchups };
}

export async function refreshWeeklyProviderForLeague(
  leagueId: string,
  season?: number,
  userId?: number,
): Promise<{ refreshed: boolean; error?: string }> {
  const lid = requireAttributedLeagueId(leagueId);
  const creds: EspnCreds = {
    ...(await resolveEspnCreds(undefined, userId)),
    leagueId: lid,
  };
  const seasonHint = season ?? (await loadCombined(lid))?.season;
  if (!seasonHint) return { refreshed: false, error: "no combined cache season" };
  try {
    const result = await refreshSingleSeason({
      season: seasonHint,
      leagueId: lid,
      creds,
      userId,
    });
    if (result.status === "failed") return { refreshed: false, error: result.error ?? "espn refresh failed" };
    return { refreshed: true };
  } catch (e) {
    return { refreshed: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveCronLeagueIds(explicitLeagueId?: string): Promise<string[]> {
  if (explicitLeagueId && explicitLeagueId.trim()) {
    return [requireAttributedLeagueId(explicitLeagueId)];
  }
  const fallback = await getDefaultEspnLeagueId();
  if (fallback) return [requireAttributedLeagueId(fallback)];
  throw new Error("weekly intel cron could not resolve a leagueId");
}
