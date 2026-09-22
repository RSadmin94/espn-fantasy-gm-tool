/**
 * League-specific season clock for the weekly-season engine.
 *
 * Season and week come from ESPN provider state already stored in the combined
 * cache (status.currentMatchupPeriod / latestScoringPeriod / seasonId) plus
 * normalized matchup completion. Finality is never inferred from wall-clock time.
 */

export type WeekStatus = "UPCOMING" | "SCORING" | "FINAL";

export type ClockMatchup = {
  matchupPeriodId?: number | null;
  week?: number | null;
  isCompleted?: boolean | number | null;
  winnerTeamId?: number | null;
  winner?: string | number | null;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  homeTotalPoints?: number | null;
  awayTotalPoints?: number | null;
};

export type SeasonClock = {
  leagueId: string;
  season: number;
  currentMatchupPeriod: number;
  latestScoringPeriod: number | null;
  requestedWeek: number;
  weekStatus: WeekStatus;
  providerFreshness: {
    cachedAt: string | null;
    source: "espn_combined_cache" | "provided_payload";
  };
};

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function seasonFromProviderPayload(payload: Record<string, unknown>): number | null {
  const settings = (payload.settings as Record<string, unknown> | undefined) ?? {};
  const seasonId = num(payload.seasonId) ?? num(settings.seasonId);
  if (seasonId != null && seasonId >= 2009 && seasonId <= 2100) return Math.floor(seasonId);
  return null;
}

export function currentMatchupPeriodFromPayload(payload: Record<string, unknown>): number | null {
  const status = (payload.status as Record<string, unknown> | undefined) ?? {};
  const settings = (payload.settings as Record<string, unknown> | undefined) ?? {};
  return (
    num(status.currentMatchupPeriod) ??
    num(settings.currentMatchupPeriod) ??
    null
  );
}

export function latestScoringPeriodFromPayload(payload: Record<string, unknown>): number | null {
  const status = (payload.status as Record<string, unknown> | undefined) ?? {};
  return num(status.latestScoringPeriod);
}

export function matchupPeriodCountFromPayload(payload: Record<string, unknown>): number {
  const settings = (payload.settings as Record<string, unknown> | undefined) ?? {};
  const sched = (settings.scheduleSettings as Record<string, unknown> | undefined) ?? {};
  return num(sched.matchupPeriodCount) ?? 18;
}

function matchupWeek(m: ClockMatchup): number {
  return Number(m.matchupPeriodId ?? m.week ?? 0) || 0;
}

/**
 * ESPN combined schedule can leave stale 0-0 pairings alongside the real
 * completed slate for the same matchupPeriodId. Prefer scored/completed games.
 */
export function authoritativeMatchupsForWeek(matchups: ClockMatchup[], week: number): ClockMatchup[] {
  const weekMs = matchups.filter((m) => matchupWeek(m) === week);
  const live = weekMs.filter((m) => {
    const s = matchupScores(m);
    const done = m.isCompleted === true || m.isCompleted === 1 || matchupWinnerTeamId(m) != null;
    return done && (s.home > 0 || s.away > 0);
  });
  return live.length > 0 ? live : weekMs;
}

function matchupScores(m: ClockMatchup): { home: number; away: number } {
  return {
    home: Number(m.homeScore ?? m.homeTotalPoints) || 0,
    away: Number(m.awayScore ?? m.awayTotalPoints) || 0,
  };
}

function matchupWinnerTeamId(m: ClockMatchup): number | null {
  const explicit = Number(m.winnerTeamId);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const homeId = Number(m.homeTeamId);
  const awayId = Number(m.awayTeamId);
  if (m.winner === "HOME" && Number.isFinite(homeId)) return homeId;
  if (m.winner === "AWAY" && Number.isFinite(awayId)) return awayId;
  const n = Number(m.winner);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

export function clockMatchupsFromLeagueReads(rows: Array<Record<string, unknown>>): ClockMatchup[] {
  return rows.map((m) => {
    const matchupPeriodId = Number(m.matchupPeriodId ?? m.week) || 0;
    const scoringPeriod = Number(m.scoringPeriodId ?? m.week) || 0;
    const mapped: ClockMatchup = {
      matchupPeriodId,
      week: scoringPeriod || matchupPeriodId,
      homeTeamId: Number(m.homeTeamId) || 0,
      awayTeamId: Number(m.awayTeamId) || 0,
      homeScore: Number(m.homeTotalPoints ?? m.homeScore) || 0,
      awayScore: Number(m.awayTotalPoints ?? m.awayScore) || 0,
      winner: m.winner as string | number | null,
      winnerTeamId: m.winnerTeamId != null ? Number(m.winnerTeamId) : null,
      isCompleted: m.isCompleted === true || m.isCompleted === 1,
    };
    if (mapped.winnerTeamId == null) mapped.winnerTeamId = matchupWinnerTeamId(mapped);
    if (!mapped.isCompleted && mapped.winnerTeamId != null) mapped.isCompleted = true;
    return mapped;
  });
}

export function resolveWeekStatus(opts: {
  requestedWeek: number;
  currentMatchupPeriod: number | null;
  latestScoringPeriod: number | null;
  matchups: ClockMatchup[];
}): WeekStatus {
  const week = opts.requestedWeek;
  const weekMatchups = authoritativeMatchupsForWeek(opts.matchups, week);

  if (weekMatchups.length === 0) {
    if (opts.currentMatchupPeriod != null && week > opts.currentMatchupPeriod) return "UPCOMING";
    if (opts.latestScoringPeriod != null && week > opts.latestScoringPeriod) return "UPCOMING";
    return "UPCOMING";
  }

  const completedCount = weekMatchups.filter((m) => {
    if (m.isCompleted === true || m.isCompleted === 1) return true;
    return matchupWinnerTeamId(m) != null;
  }).length;

  const anyScore = weekMatchups.some((m) => {
    const s = matchupScores(m);
    return s.home > 0 || s.away > 0;
  });

  if (completedCount === weekMatchups.length) return "FINAL";
  if (anyScore) return "SCORING";
  if (opts.latestScoringPeriod != null && week <= opts.latestScoringPeriod && week === opts.currentMatchupPeriod) {
    return "SCORING";
  }
  if (opts.currentMatchupPeriod != null && week > opts.currentMatchupPeriod) return "UPCOMING";
  return "UPCOMING";
}

export function buildSeasonClock(opts: {
  leagueId: string;
  payload: Record<string, unknown>;
  matchups?: ClockMatchup[];
  requestedWeek?: number;
  cachedAt?: Date | string | null;
  source?: SeasonClock["providerFreshness"]["source"];
}): SeasonClock {
  const season = seasonFromProviderPayload(opts.payload);
  if (season == null) {
    throw new Error(`Cannot resolve season from provider state for league ${opts.leagueId}`);
  }

  const currentMatchupPeriod = Math.max(1, currentMatchupPeriodFromPayload(opts.payload) ?? 1);
  const latestScoringPeriod = latestScoringPeriodFromPayload(opts.payload);
  const maxWeek = matchupPeriodCountFromPayload(opts.payload);
  const requestedWeek = Math.max(
    1,
    Math.min(maxWeek, Math.floor(Number(opts.requestedWeek ?? currentMatchupPeriod)) || currentMatchupPeriod),
  );

  const weekStatus = resolveWeekStatus({
    requestedWeek,
    currentMatchupPeriod,
    latestScoringPeriod,
    matchups: opts.matchups ?? [],
  });

  const cachedAt =
    opts.cachedAt instanceof Date
      ? opts.cachedAt.toISOString()
      : opts.cachedAt ?? null;

  return {
    leagueId: opts.leagueId,
    season,
    currentMatchupPeriod,
    latestScoringPeriod,
    requestedWeek,
    weekStatus,
    providerFreshness: {
      cachedAt,
      source: opts.source ?? (opts.cachedAt ? "espn_combined_cache" : "provided_payload"),
    },
  };
}
