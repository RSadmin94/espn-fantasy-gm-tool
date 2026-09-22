import { createHash } from "node:crypto";
import {
  authoritativeMatchupsForWeek,
  resolveWeekStatus,
  type ClockMatchup,
  type SeasonClock,
  type WeekStatus,
} from "./weeklySeasonClock";

export type WeeklySeasonMode = "scheduled" | "manual" | "regenerate" | "replay" | "certify";

export const CRON_CATCHUP_CAP = 4;

export type WeeklyWorkPlan = {
  refreshProvider: boolean;
  weeklyStats: boolean;
  rosterSnapshot: boolean;
  /** Frozen through-week standings. FINAL only. */
  standingsSnapshot: boolean;
  liveStorylines: boolean;
  liveFear: boolean;
  storyEngine: boolean;
  lineupFacts: boolean;
  editionNarratives: boolean;
  persistPack: boolean;
};

export function weeklyWorkForStatus(status: WeekStatus, mode: WeeklySeasonMode): WeeklyWorkPlan {
  if (status === "UPCOMING") {
    return {
      refreshProvider: mode !== "replay",
      weeklyStats: false,
      rosterSnapshot: false,
      standingsSnapshot: false,
      liveStorylines: false,
      liveFear: false,
      storyEngine: false,
      lineupFacts: false,
      editionNarratives: false,
      persistPack: false,
    };
  }
  if (status === "SCORING") {
    return {
      refreshProvider: mode !== "replay",
      weeklyStats: true,
      rosterSnapshot: true,
      standingsSnapshot: false,
      liveStorylines: true,
      liveFear: true,
      storyEngine: true,
      lineupFacts: true,
      editionNarratives: false,
      persistPack: true,
    };
  }
  return {
    refreshProvider: mode !== "replay",
    weeklyStats: true,
    rosterSnapshot: true,
    standingsSnapshot: true,
    liveStorylines: true,
    liveFear: true,
    storyEngine: true,
    lineupFacts: true,
    editionNarratives: mode !== "replay",
    persistPack: true,
  };
}

function matchupWeek(m: ClockMatchup): number {
  return Number(m.matchupPeriodId ?? m.week ?? 0) || 0;
}

export function providerWeekStatuses(opts: {
  matchups: ClockMatchup[];
  currentMatchupPeriod: number | null;
  latestScoringPeriod: number | null;
  maxWeek: number;
}): Array<{ week: number; status: WeekStatus }> {
  const maxWeek = Math.max(1, opts.maxWeek);
  const out: Array<{ week: number; status: WeekStatus }> = [];
  for (let week = 1; week <= maxWeek; week++) {
    out.push({
      week,
      status: resolveWeekStatus({
        requestedWeek: week,
        currentMatchupPeriod: opts.currentMatchupPeriod,
        latestScoringPeriod: opts.latestScoringPeriod,
        matchups: opts.matchups,
      }),
    });
  }
  return out;
}

export function finalizedProviderWeeks(statuses: Array<{ week: number; status: WeekStatus }>): number[] {
  return statuses.filter((s) => s.status === "FINAL").map((s) => s.week);
}

export function weekResultFingerprint(matchups: ClockMatchup[], week: number): string {
  const rows = authoritativeMatchupsForWeek(matchups, week)
    .map((m) => {
      const home = Number(m.homeTeamId) || 0;
      const away = Number(m.awayTeamId) || 0;
      const hs = Math.round((Number(m.homeScore ?? m.homeTotalPoints) || 0) * 100) / 100;
      const as = Math.round((Number(m.awayScore ?? m.awayTotalPoints) || 0) * 100) / 100;
      const winner = Number(m.winnerTeamId) || 0;
      return `${home}-${away}:${hs}-${as}:${winner}`;
    })
    .sort();
  return createHash("sha256").update(rows.join("|")).digest("hex").slice(0, 16);
}

export function detectFinalWeekCorrection(opts: {
  previousStatus: WeekStatus | null;
  previousFingerprint: string | null | undefined;
  nextStatus: WeekStatus;
  nextFingerprint: string;
}): boolean {
  if (opts.nextStatus !== "FINAL") return false;
  if (opts.previousStatus !== "FINAL") return false;
  if (!opts.previousFingerprint) return false;
  return opts.previousFingerprint !== opts.nextFingerprint;
}

export function correctionWeeksFromPacks(opts: {
  matchups: ClockMatchup[];
  packs: Array<{ week: number; resultFingerprint?: string | null }>;
}): number[] {
  return opts.packs
    .filter((p) => {
      if (!p.resultFingerprint) return false;
      return weekResultFingerprint(opts.matchups, p.week) !== p.resultFingerprint;
    })
    .map((p) => p.week)
    .sort((a, b) => a - b);
}

/**
 * Compare finalized provider weeks to persisted FINAL packs.
 * Process unprocessed (and corrected) finals in order, then the live SCORING
 * week, with a cap. Never derives the work list solely from currentMatchupPeriod.
 */
export function cronWeeksToProcess(opts: {
  clock: SeasonClock;
  matchups: ClockMatchup[];
  processedFinalWeeks: number[];
  explicitWeek?: number;
  cap?: number;
  correctionWeeks?: number[];
}): number[] {
  if (opts.explicitWeek != null) return [opts.clock.requestedWeek];

  const cap = Math.max(1, opts.cap ?? CRON_CATCHUP_CAP);
  const maxWeek = Math.max(
    opts.clock.currentMatchupPeriod,
    opts.clock.requestedWeek,
    ...opts.matchups.map(matchupWeek).filter((w) => w > 0),
    1,
  );
  const statuses = providerWeekStatuses({
    matchups: opts.matchups,
    currentMatchupPeriod: opts.clock.currentMatchupPeriod,
    latestScoringPeriod: opts.clock.latestScoringPeriod,
    maxWeek,
  });
  const finalized = finalizedProviderWeeks(statuses);
  const processed = new Set(opts.processedFinalWeeks.filter((w) => w > 0));
  const unprocessedFinals = finalized.filter((w) => !processed.has(w));
  const corrections = (opts.correctionWeeks ?? []).filter((w) => finalized.includes(w));
  const finalsToProcess = [...new Set([...corrections, ...unprocessedFinals])].sort((a, b) => a - b);

  const current = opts.clock.requestedWeek;
  const currentStatus = statuses.find((s) => s.week === current)?.status ?? opts.clock.weekStatus;
  const liveScoring = currentStatus === "SCORING";

  const weeks: number[] = [];
  const budget = liveScoring && !finalsToProcess.includes(current) ? cap - 1 : cap;
  for (const week of finalsToProcess) {
    if (weeks.length >= budget) break;
    weeks.push(week);
  }
  if (liveScoring && !weeks.includes(current) && weeks.length < cap) {
    weeks.push(current);
  }
  return [...new Set(weeks)].sort((a, b) => a - b);
}
