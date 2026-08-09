/**
 * RFSN-049 — Deterministic matchup margin analytics.
 *
 * Pure computation over completed historical games (scores from gmMatchups).
 * No LLM. Callers load games, then query / format here.
 */

export type ScoringPrecision = "integer" | "one_decimal" | "two_decimals";

export type MatchupPhaseFilter = "regular" | "playoffs" | "all";

export type MatchupMarginMetric =
  | "losses_by_margin"
  | "wins_by_margin"
  | "decided_by_at_most"
  | "closest_game"
  | "largest_comeback"
  | "largest_margin"
  | "highest_combined_score"
  | "lowest_combined_score"
  | "highest_losing_score"
  | "lowest_winning_score"
  | "largest_upset"
  | "largest_halftime_deficit"
  | "average_margin"
  | "ties";

/** How a margin metric is aggregated. Count metrics omit this (implicit count). */
export type MatchupMarginAggregation = "count" | "single_game" | "owner_max";

export interface MarginBand {
  minInclusive: number;
  maxInclusive: number;
  /** Human-readable definition returned in answers. */
  definition: string;
}

export interface MarginGameRecord {
  season: number;
  week: number;
  matchupPeriodId: number;
  isPlayoff: boolean;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  /** Canonical person ids; null when identity unresolved. */
  homePersonId: string | null;
  awayPersonId: string | null;
  homePersonName: string | null;
  awayPersonName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  /** Winner person id, or null for a genuine tie. */
  winnerPersonId: string | null;
}

export interface MatchupMarginQuery {
  metric: MatchupMarginMetric;
  /** single_game = one highlight; owner_max = max margin per owner. */
  aggregation?: MatchupMarginAggregation;
  /** Exact margin target (e.g. 1 for one-point). Used with wins/losses_by_margin. */
  marginExact?: number;
  /** Inclusive max abs margin for decided_by_at_most / wins-losses at most. */
  marginMax?: number;
  /** Inclusive min abs margin for blowout-style wins/losses (e.g. 50+). */
  marginMin?: number;
  seasonFrom?: number;
  seasonTo?: number;
  phase?: MatchupPhaseFilter;
  /** Optional owner filter (display name or canonical person id). */
  ownerName?: string;
  ownerPersonId?: string;
  /** Optional opponent filter (H2H biggest-win style). */
  opponentName?: string;
  opponentPersonId?: string;
  /** True when the ask is "my biggest win" and needs a resolved owner. */
  personalAsk?: boolean;
  /** Rank by owner (default) or by season-team franchise slot. */
  groupBy?: "owner" | "team";
  /** How many leaderboard rows to include in the answer. */
  topN?: number;
}

export interface OwnerMarginCount {
  personId: string;
  displayName: string;
  count: number;
  gamesPlayed: number;
}

export interface TeamMarginCount {
  season: number;
  teamId: number;
  teamName: string;
  ownerName: string | null;
  personId: string | null;
  count: number;
  gamesPlayed: number;
}

export interface ClosestGameSummary {
  season: number;
  week: number;
  isPlayoff: boolean;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  margin: number;
}

/** Winner/loser-oriented highlight for largest margin / combined / score extremes. */
export interface MarginGameHighlight {
  season: number;
  week: number;
  isPlayoff: boolean;
  winnerName: string;
  loserName: string;
  winnerScore: number;
  loserScore: number;
  winnerPersonId: string | null;
  loserPersonId: string | null;
  margin: number;
  combinedScore: number;
}

export interface OwnerMaxMargin {
  personId: string;
  displayName: string;
  maxMargin: number;
  season: number;
  week: number;
  isPlayoff: boolean;
  opponentName: string;
  winnerScore: number;
  loserScore: number;
}

export interface MatchupMarginAnalyticsResult {
  query: MatchupMarginQuery;
  scoringPrecision: ScoringPrecision;
  /** Band applied for exact-margin metrics (wins/losses by margin). */
  appliedBand: MarginBand | null;
  coverage: {
    recordedGames: number;
    seasonFrom: number | null;
    seasonTo: number | null;
    phase: MatchupPhaseFilter;
  };
  /** True when metric cannot be computed from stored final scores alone. */
  unsupported: boolean;
  unsupportedReason: string | null;
  /** True when the matchup dataset is empty after filters. */
  noData: boolean;
  missingDataset: string | null;
  ties: number;
  averageAbsMargin: number | null;
  closestGame: ClosestGameSummary | null;
  highlightGame: MarginGameHighlight | null;
  ownerMaxMargins: OwnerMaxMargin[];
  matchingGames: number;
  byOwner: OwnerMarginCount[];
  byTeam: TeamMarginCount[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scoreDecimalPlaces(score: number): number {
  const fixed = Math.abs(Number(score) || 0).toFixed(2);
  if (fixed.endsWith("00")) return 0;
  if (fixed.endsWith("0")) return 1;
  return 2;
}

/** Infer league scoring precision from observed final scores. */
export function detectScoringPrecision(scores: number[]): ScoringPrecision {
  let max = 0;
  for (const s of scores) max = Math.max(max, scoreDecimalPlaces(s));
  if (max >= 2) return "two_decimals";
  if (max === 1) return "one_decimal";
  return "integer";
}

/**
 * One-point / exact-N margin band.
 * Decimal scoring → [N-0.5, N+0.49] (for N=1 → 0.50–1.49).
 * Integer scoring → exact N.00.
 */
export function exactMarginBand(
  exactMargin: number,
  precision: ScoringPrecision,
): MarginBand {
  const n = Math.max(0, Number(exactMargin) || 0);
  if (precision === "integer") {
    return {
      minInclusive: n,
      maxInclusive: n,
      definition:
        n === 1
          ? "an exact 1-point final margin (integer scoring)"
          : `an exact ${n}-point final margin (integer scoring)`,
    };
  }
  const min = round2(n - 0.5);
  const max = round2(n + 0.49);
  return {
    minInclusive: min,
    maxInclusive: max,
    definition:
      n === 1
        ? `a final margin from ${min.toFixed(2)} to ${max.toFixed(2)} points`
        : `a final margin from ${min.toFixed(2)} to ${max.toFixed(2)} points (exact-${n} band under decimal scoring)`,
  };
}

export function absMargin(game: Pick<MarginGameRecord, "homeScore" | "awayScore">): number {
  return round2(Math.abs(Number(game.homeScore) - Number(game.awayScore)));
}

export function isTie(game: MarginGameRecord): boolean {
  if (game.winnerPersonId == null && round2(game.homeScore) === round2(game.awayScore)) return true;
  if (round2(game.homeScore) === round2(game.awayScore)) return true;
  return false;
}

function normalizeOwnerKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s:{}-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sideMatchesNameOrId(
  game: MarginGameRecord,
  side: "home" | "away",
  personId: string | undefined,
  name: string | undefined,
): boolean {
  const id = side === "home" ? game.homePersonId : game.awayPersonId;
  const display = side === "home" ? game.homePersonName : game.awayPersonName;
  if (personId) return id === personId;
  if (!name?.trim()) return true;
  const want = normalizeOwnerKey(name);
  if (id && normalizeOwnerKey(id) === want) return true;
  if (display && normalizeOwnerKey(display) === want) return true;
  if (display && normalizeOwnerKey(display).includes(want)) return true;
  return false;
}

function ownerMatches(
  game: MarginGameRecord,
  side: "home" | "away",
  query: MatchupMarginQuery,
): boolean {
  return sideMatchesNameOrId(game, side, query.ownerPersonId, query.ownerName);
}

function opponentMatches(
  game: MarginGameRecord,
  side: "home" | "away",
  query: MatchupMarginQuery,
): boolean {
  return sideMatchesNameOrId(game, side, query.opponentPersonId, query.opponentName);
}

export function filterMarginGames(
  games: MarginGameRecord[],
  query: MatchupMarginQuery,
): MarginGameRecord[] {
  const phase = query.phase ?? "regular";
  const hasOwner = Boolean(query.ownerName || query.ownerPersonId);
  const hasOpponent = Boolean(query.opponentName || query.opponentPersonId);
  return games.filter((g) => {
    if (phase === "regular" && g.isPlayoff) return false;
    if (phase === "playoffs" && !g.isPlayoff) return false;
    if (query.seasonFrom != null && g.season < query.seasonFrom) return false;
    if (query.seasonTo != null && g.season > query.seasonTo) return false;
    if (hasOwner && hasOpponent) {
      const homeOwnerAwayOpp = ownerMatches(g, "home", query) && opponentMatches(g, "away", query);
      const awayOwnerHomeOpp = ownerMatches(g, "away", query) && opponentMatches(g, "home", query);
      return homeOwnerAwayOpp || awayOwnerHomeOpp;
    }
    if (hasOwner) {
      return ownerMatches(g, "home", query) || ownerMatches(g, "away", query);
    }
    if (hasOpponent) {
      return opponentMatches(g, "home", query) || opponentMatches(g, "away", query);
    }
    return true;
  });
}

function displayForSide(game: MarginGameRecord, side: "home" | "away"): string {
  if (side === "home") {
    return game.homePersonName || game.homeTeamName || `Team ${game.homeTeamId}`;
  }
  return game.awayPersonName || game.awayTeamName || `Team ${game.awayTeamId}`;
}

function personLost(game: MarginGameRecord, personId: string): boolean {
  if (isTie(game) || !game.winnerPersonId) return false;
  if (game.homePersonId === personId) return game.winnerPersonId !== personId;
  if (game.awayPersonId === personId) return game.winnerPersonId !== personId;
  return false;
}

function personWon(game: MarginGameRecord, personId: string): boolean {
  return !isTie(game) && game.winnerPersonId === personId;
}

function marginInBand(margin: number, band: MarginBand): boolean {
  return margin >= band.minInclusive - 1e-9 && margin <= band.maxInclusive + 1e-9;
}

function sortOwnerCounts(rows: OwnerMarginCount[]): OwnerMarginCount[] {
  return [...rows].sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName));
}

function sortTeamCounts(rows: TeamMarginCount[]): TeamMarginCount[] {
  return [...rows].sort(
    (a, b) => b.count - a.count || b.season - a.season || a.teamName.localeCompare(b.teamName),
  );
}

function winnerLoserSides(game: MarginGameRecord): {
  winnerName: string;
  loserName: string;
  winnerScore: number;
  loserScore: number;
  winnerPersonId: string | null;
  loserPersonId: string | null;
} | null {
  if (isTie(game)) return null;
  const homeWon =
    game.winnerPersonId != null
      ? game.winnerPersonId === game.homePersonId
      : round2(game.homeScore) > round2(game.awayScore);
  if (homeWon) {
    return {
      winnerName: displayForSide(game, "home"),
      loserName: displayForSide(game, "away"),
      winnerScore: round2(game.homeScore),
      loserScore: round2(game.awayScore),
      winnerPersonId: game.homePersonId,
      loserPersonId: game.awayPersonId,
    };
  }
  return {
    winnerName: displayForSide(game, "away"),
    loserName: displayForSide(game, "home"),
    winnerScore: round2(game.awayScore),
    loserScore: round2(game.homeScore),
    winnerPersonId: game.awayPersonId,
    loserPersonId: game.homePersonId,
  };
}

function toHighlight(game: MarginGameRecord): MarginGameHighlight | null {
  const wl = winnerLoserSides(game);
  if (!wl) {
    return {
      season: game.season,
      week: game.week,
      isPlayoff: game.isPlayoff,
      winnerName: displayForSide(game, "home"),
      loserName: displayForSide(game, "away"),
      winnerScore: round2(game.homeScore),
      loserScore: round2(game.awayScore),
      winnerPersonId: game.homePersonId,
      loserPersonId: game.awayPersonId,
      margin: 0,
      combinedScore: round2(game.homeScore + game.awayScore),
    };
  }
  return {
    season: game.season,
    week: game.week,
    isPlayoff: game.isPlayoff,
    ...wl,
    margin: absMargin(game),
    combinedScore: round2(game.homeScore + game.awayScore),
  };
}

function ownerWonFilteredGame(game: MarginGameRecord, query: MatchupMarginQuery): boolean {
  if (!query.ownerName && !query.ownerPersonId) return true;
  const wl = winnerLoserSides(game);
  if (!wl) return false;
  if (query.ownerPersonId) return wl.winnerPersonId === query.ownerPersonId;
  const want = normalizeOwnerKey(query.ownerName || "");
  if (wl.winnerPersonId && normalizeOwnerKey(wl.winnerPersonId) === want) return true;
  return normalizeOwnerKey(wl.winnerName).includes(want);
}

function unsupportedForMetric(
  metric: MatchupMarginMetric,
): { reason: string; missing: string } | null {
  if (metric === "largest_comeback") {
    return {
      reason:
        "Largest comeback requires in-game score timeline snapshots, which are not stored — only final scores (and optional pre-game projections) are available.",
      missing: "in-game score timeline / live scoreboard snapshots",
    };
  }
  if (metric === "largest_upset") {
    return {
      reason:
        "Largest upset requires pre-game projections or implied win probability, which are not used for this margin query.",
      missing: "pre-game projections / implied win probability",
    };
  }
  if (metric === "largest_halftime_deficit") {
    return {
      reason:
        "Halftime deficit requires in-game score timeline snapshots, which are not stored — only final scores are available.",
      missing: "in-game score timeline / live scoreboard snapshots",
    };
  }
  return null;
}

function emptyAnalyticsFields(): Pick<
  MatchupMarginAnalyticsResult,
  | "ties"
  | "averageAbsMargin"
  | "closestGame"
  | "highlightGame"
  | "ownerMaxMargins"
  | "matchingGames"
  | "byOwner"
  | "byTeam"
> {
  return {
    ties: 0,
    averageAbsMargin: null,
    closestGame: null,
    highlightGame: null,
    ownerMaxMargins: [],
    matchingGames: 0,
    byOwner: [],
    byTeam: [],
  };
}

/**
 * Core analytics. Pass all completed games for the league; filters apply inside.
 */
export function computeMatchupMarginAnalytics(
  allGames: MarginGameRecord[],
  query: MatchupMarginQuery,
): MatchupMarginAnalyticsResult {
  const phase = query.phase ?? "regular";
  const precision = detectScoringPrecision(allGames.flatMap((g) => [g.homeScore, g.awayScore]));
  const filtered = filterMarginGames(allGames, query);

  const seasons = filtered.map((g) => g.season);
  const seasonFrom = seasons.length ? Math.min(...seasons) : null;
  const seasonTo = seasons.length ? Math.max(...seasons) : null;

  const baseCoverage = {
    recordedGames: filtered.length,
    seasonFrom,
    seasonTo,
    phase,
  };

  if (query.personalAsk && !query.ownerName && !query.ownerPersonId) {
    return {
      query,
      scoringPrecision: precision,
      appliedBand: null,
      coverage: baseCoverage,
      unsupported: true,
      unsupportedReason:
        "A personal biggest-win question needs a resolved owner identity (named owner or linked league profile).",
      noData: false,
      missingDataset: "resolved owner identity for a personal margin question",
      ...emptyAnalyticsFields(),
    };
  }

  const unsupported = unsupportedForMetric(query.metric);
  if (unsupported) {
    return {
      query,
      scoringPrecision: precision,
      appliedBand: null,
      coverage: baseCoverage,
      unsupported: true,
      unsupportedReason: unsupported.reason,
      noData: filtered.length === 0,
      missingDataset:
        filtered.length === 0 ? "completed historical matchups (gmMatchups)" : unsupported.missing,
      ...emptyAnalyticsFields(),
    };
  }

  if (filtered.length === 0) {
    return {
      query,
      scoringPrecision: precision,
      appliedBand:
        query.metric === "losses_by_margin" || query.metric === "wins_by_margin"
          ? exactMarginBand(query.marginExact ?? 1, precision)
          : null,
      coverage: baseCoverage,
      unsupported: false,
      unsupportedReason: null,
      noData: true,
      missingDataset: "completed historical matchups (gmMatchups)",
      ...emptyAnalyticsFields(),
    };
  }

  const ties = filtered.filter(isTie).length;
  const decisive = filtered.filter((g) => !isTie(g));
  const avgAbs =
    decisive.length > 0
      ? round2(decisive.reduce((sum, g) => sum + absMargin(g), 0) / decisive.length)
      : null;

  let closestGame: ClosestGameSummary | null = null;
  for (const g of decisive) {
    const margin = absMargin(g);
    if (!closestGame || margin < closestGame.margin) {
      closestGame = {
        season: g.season,
        week: g.week,
        isPlayoff: g.isPlayoff,
        homeName: displayForSide(g, "home"),
        awayName: displayForSide(g, "away"),
        homeScore: round2(g.homeScore),
        awayScore: round2(g.awayScore),
        margin,
      };
    }
  }

  const useMarginAtMost =
    (query.metric === "losses_by_margin" || query.metric === "wins_by_margin") &&
    query.marginMax != null &&
    query.marginMin == null &&
    query.marginExact == null;
  const useMarginAtLeast =
    (query.metric === "losses_by_margin" || query.metric === "wins_by_margin") &&
    query.marginMin != null &&
    query.marginExact == null;

  const band =
    (query.metric === "losses_by_margin" || query.metric === "wins_by_margin") &&
    !useMarginAtMost &&
    !useMarginAtLeast
      ? exactMarginBand(query.marginExact ?? 1, precision)
      : null;

  const ownerGames = new Map<string, { name: string; played: number; count: number }>();
  const teamGames = new Map<string, TeamMarginCount>();

  const bumpOwner = (personId: string | null, name: string | null, hit: boolean) => {
    if (!personId) return;
    const cur = ownerGames.get(personId) ?? {
      name: name || personId,
      played: 0,
      count: 0,
    };
    cur.played += 1;
    if (hit) cur.count += 1;
    if (name) cur.name = name;
    ownerGames.set(personId, cur);
  };

  const bumpTeam = (
    g: MarginGameRecord,
    side: "home" | "away",
    hit: boolean,
  ) => {
    const teamId = side === "home" ? g.homeTeamId : g.awayTeamId;
    const key = `${g.season}:${teamId}`;
    const cur =
      teamGames.get(key) ??
      ({
        season: g.season,
        teamId,
        teamName:
          (side === "home" ? g.homeTeamName : g.awayTeamName) || `Team ${teamId}`,
        ownerName: side === "home" ? g.homePersonName : g.awayPersonName,
        personId: side === "home" ? g.homePersonId : g.awayPersonId,
        count: 0,
        gamesPlayed: 0,
      } satisfies TeamMarginCount);
    cur.gamesPlayed += 1;
    if (hit) cur.count += 1;
    teamGames.set(key, cur);
  };

  let matchingGames = 0;

  const marginMatchesWinLoss = (margin: number): boolean => {
    if (useMarginAtLeast) {
      const min = query.marginMin ?? 0;
      return margin + 1e-9 >= min;
    }
    if (useMarginAtMost) {
      const max = query.marginMax ?? 0;
      return margin > 0 && margin <= max + 1e-9;
    }
    if (!band) return false;
    return marginInBand(margin, band);
  };

  const gameHitsMetric = (g: MarginGameRecord): boolean => {
    const margin = absMargin(g);
    switch (query.metric) {
      case "ties":
        return isTie(g);
      case "average_margin":
      case "closest_game":
      case "largest_margin":
      case "highest_losing_score":
      case "lowest_winning_score":
        return !isTie(g);
      case "highest_combined_score":
      case "lowest_combined_score":
        return true;
      case "decided_by_at_most": {
        if (isTie(g)) return false;
        const max = query.marginMax ?? 1;
        return margin > 0 && margin <= max + 1e-9;
      }
      case "losses_by_margin":
      case "wins_by_margin":
        if (isTie(g)) return false;
        return marginMatchesWinLoss(margin);
      default:
        return false;
    }
  };

  for (const g of filtered) {
    const hits = gameHitsMetric(g);
    if (hits) matchingGames += 1;

    // Per-owner / per-team attribution for win/loss margin metrics
    if (query.metric === "losses_by_margin") {
      const margin = absMargin(g);
      const inBand = !isTie(g) && marginMatchesWinLoss(margin);
      if (g.homePersonId) {
        const lost = inBand && personLost(g, g.homePersonId);
        bumpOwner(g.homePersonId, g.homePersonName, lost);
        bumpTeam(g, "home", lost);
      }
      if (g.awayPersonId) {
        const lost = inBand && personLost(g, g.awayPersonId);
        bumpOwner(g.awayPersonId, g.awayPersonName, lost);
        bumpTeam(g, "away", lost);
      }
      continue;
    }

    if (query.metric === "wins_by_margin") {
      const margin = absMargin(g);
      const inBand = !isTie(g) && marginMatchesWinLoss(margin);
      if (g.homePersonId) {
        const won = inBand && personWon(g, g.homePersonId);
        bumpOwner(g.homePersonId, g.homePersonName, won);
        bumpTeam(g, "home", won);
      }
      if (g.awayPersonId) {
        const won = inBand && personWon(g, g.awayPersonId);
        bumpOwner(g.awayPersonId, g.awayPersonName, won);
        bumpTeam(g, "away", won);
      }
      continue;
    }

    if (query.metric === "decided_by_at_most") {
      const hit = gameHitsMetric(g);
      if (g.homePersonId) {
        bumpOwner(g.homePersonId, g.homePersonName, hit);
        bumpTeam(g, "home", hit);
      }
      if (g.awayPersonId) {
        bumpOwner(g.awayPersonId, g.awayPersonName, hit);
        bumpTeam(g, "away", hit);
      }
      continue;
    }

    if (query.metric === "ties") {
      const hit = isTie(g);
      if (g.homePersonId) {
        bumpOwner(g.homePersonId, g.homePersonName, hit);
        bumpTeam(g, "home", hit);
      }
      if (g.awayPersonId) {
        bumpOwner(g.awayPersonId, g.awayPersonName, hit);
        bumpTeam(g, "away", hit);
      }
    }
  }

  if (query.metric === "closest_game" || query.metric === "average_margin") {
    matchingGames = decisive.length;
  }
  if (query.metric === "ties") {
    matchingGames = ties;
  }

  let highlightGame: MarginGameHighlight | null = null;
  let ownerMaxMargins: OwnerMaxMargin[] = [];

  if (query.metric === "largest_margin") {
    const winPool = decisive.filter((g) => ownerWonFilteredGame(g, query));
    matchingGames = winPool.length;
    if (query.aggregation === "owner_max") {
      const best = new Map<string, OwnerMaxMargin>();
      for (const g of winPool) {
        const wl = winnerLoserSides(g);
        if (!wl?.winnerPersonId) continue;
        const margin = absMargin(g);
        const cur = best.get(wl.winnerPersonId);
        const later =
          !cur ||
          margin > cur.maxMargin + 1e-9 ||
          (Math.abs(margin - cur.maxMargin) < 1e-9 &&
            (g.season > cur.season || (g.season === cur.season && g.week > cur.week)));
        if (!later) continue;
        best.set(wl.winnerPersonId, {
          personId: wl.winnerPersonId,
          displayName: wl.winnerName,
          maxMargin: margin,
          season: g.season,
          week: g.week,
          isPlayoff: g.isPlayoff,
          opponentName: wl.loserName,
          winnerScore: wl.winnerScore,
          loserScore: wl.loserScore,
        });
      }
      ownerMaxMargins = [...best.values()].sort(
        (a, b) =>
          b.maxMargin - a.maxMargin ||
          b.season - a.season ||
          a.displayName.localeCompare(b.displayName),
      );
      if (ownerMaxMargins[0]) {
        highlightGame = {
          season: ownerMaxMargins[0].season,
          week: ownerMaxMargins[0].week,
          isPlayoff: ownerMaxMargins[0].isPlayoff,
          winnerName: ownerMaxMargins[0].displayName,
          loserName: ownerMaxMargins[0].opponentName,
          winnerScore: ownerMaxMargins[0].winnerScore,
          loserScore: ownerMaxMargins[0].loserScore,
          winnerPersonId: ownerMaxMargins[0].personId,
          loserPersonId: null,
          margin: ownerMaxMargins[0].maxMargin,
          combinedScore: round2(ownerMaxMargins[0].winnerScore + ownerMaxMargins[0].loserScore),
        };
      }
    } else {
      let bestGame: MarginGameRecord | null = null;
      let bestMargin = -1;
      for (const g of winPool) {
        const margin = absMargin(g);
        if (
          !bestGame ||
          margin > bestMargin + 1e-9 ||
          (Math.abs(margin - bestMargin) < 1e-9 &&
            (g.season > bestGame.season || (g.season === bestGame.season && g.week > bestGame.week)))
        ) {
          bestGame = g;
          bestMargin = margin;
        }
      }
      highlightGame = bestGame ? toHighlight(bestGame) : null;
    }
  }

  if (
    query.metric === "highest_combined_score" ||
    query.metric === "lowest_combined_score" ||
    query.metric === "highest_losing_score" ||
    query.metric === "lowest_winning_score"
  ) {
    const pool =
      query.metric === "highest_combined_score" || query.metric === "lowest_combined_score"
        ? filtered
        : decisive;
    matchingGames = pool.length;
    let best: MarginGameRecord | null = null;
    let bestVal = query.metric.startsWith("lowest") ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    for (const g of pool) {
      const wl = winnerLoserSides(g);
      const combined = round2(g.homeScore + g.awayScore);
      const val =
        query.metric === "highest_combined_score" || query.metric === "lowest_combined_score"
          ? combined
          : query.metric === "highest_losing_score"
            ? (wl?.loserScore ?? Number.NEGATIVE_INFINITY)
            : (wl?.winnerScore ?? Number.POSITIVE_INFINITY);
      const better = query.metric.startsWith("lowest")
        ? val < bestVal - 1e-9 ||
          (Math.abs(val - bestVal) < 1e-9 &&
            !!best &&
            (g.season > best.season || (g.season === best.season && g.week > best.week)))
        : val > bestVal + 1e-9 ||
          (Math.abs(val - bestVal) < 1e-9 &&
            !!best &&
            (g.season > best.season || (g.season === best.season && g.week > best.week)));
      if (!best || better) {
        best = g;
        bestVal = val;
      }
    }
    highlightGame = best ? toHighlight(best) : null;
  }

  const byOwner = sortOwnerCounts(
    [...ownerGames.entries()].map(([personId, v]) => ({
      personId,
      displayName: v.name,
      count: v.count,
      gamesPlayed: v.played,
    })),
  ).filter((r) => r.count > 0);

  const byTeam = sortTeamCounts([...teamGames.values()]).filter((r) => r.count > 0);

  return {
    query,
    scoringPrecision: precision,
    appliedBand: band,
    coverage: baseCoverage,
    unsupported: false,
    unsupportedReason: null,
    noData: false,
    missingDataset: null,
    ties,
    averageAbsMargin: avgAbs,
    closestGame,
    highlightGame,
    ownerMaxMargins,
    matchingGames,
    byOwner,
    byTeam,
  };
}

function phaseLabel(phase: MatchupPhaseFilter): string {
  if (phase === "playoffs") return "playoff";
  if (phase === "all") return "regular-season and playoff";
  return "regular-season";
}

/** League-wide dataset scope — never implies an individual's games played. */
function coverageSentence(result: MatchupMarginAnalyticsResult): string {
  const { seasonFrom, seasonTo, recordedGames, phase } = result.coverage;
  const phaseBit = phaseLabel(phase);
  if (seasonFrom == null || seasonTo == null) {
    return `This was calculated from ${recordedGames.toLocaleString("en-US")} recorded league ${phaseBit} matchups.`;
  }
  if (seasonFrom === seasonTo) {
    return `This was calculated from ${recordedGames.toLocaleString("en-US")} recorded league ${phaseBit} matchups in ${seasonFrom}.`;
  }
  return `This was calculated from ${recordedGames.toLocaleString("en-US")} recorded league ${phaseBit} matchups from ${seasonFrom}–${seasonTo}.`;
}

function formatMarginDefinition(
  result: MatchupMarginAnalyticsResult,
  exact: number,
): string {
  const band = result.appliedBand;
  if (!band) return "";
  const onePoint = exact === 1;
  if (result.scoringPrecision === "integer") {
    return onePoint
      ? `Using an exact 1.00-point final margin because this league’s recorded scores are integers.`
      : `Using an exact ${exact}.00-point final margin because this league’s recorded scores are integers.`;
  }
  if (onePoint) {
    return `Using a one-point range of ${band.minInclusive.toFixed(2)}–${band.maxInclusive.toFixed(2)} because this league uses decimal scoring.`;
  }
  return `Using a ${exact}-point range of ${band.minInclusive.toFixed(2)}–${band.maxInclusive.toFixed(2)} because this league uses decimal scoring.`;
}

/**
 * Deterministic League AI answer text. Never invents filler.
 */
export function formatMatchupMarginAnswer(result: MatchupMarginAnalyticsResult): string {
  if (result.unsupported) {
    const missing = result.missingDataset ?? "required matchup detail";
    return `I can't answer that from stored matchups alone. Missing dataset: ${missing}.${
      result.unsupportedReason ? ` ${result.unsupportedReason}` : ""
    }`;
  }

  if (result.noData) {
    return `I don't have completed historical matchups to run that margin query. Missing dataset: ${
      result.missingDataset ?? "completed historical matchups (gmMatchups)"
    }.`;
  }

  const scope = coverageSentence(result);
  const topN = result.query.topN ?? 5;
  const groupBy = result.query.groupBy ?? "owner";

  if (result.query.metric === "closest_game" && result.closestGame) {
    const g = result.closestGame;
    const phase = g.isPlayoff ? "playoff" : "regular-season";
    return (
      `Closest recorded game: ${g.homeName} ${g.homeScore}–${g.awayScore} ${g.awayName} ` +
      `(margin ${g.margin.toFixed(2)}) in ${g.season} week ${g.week} (${phase}). ${scope}`
    );
  }

  if (result.query.metric === "largest_margin" && result.query.aggregation === "owner_max") {
    if (result.ownerMaxMargins.length === 0) {
      return `No decisive single-game victory margins found. Ties are excluded. ${scope}`;
    }
    const lines = result.ownerMaxMargins.slice(0, topN).map((row, i) => {
      return `${i + 1}. ${row.displayName} – ${row.maxMargin.toFixed(1)}`;
    });
    return `Largest single-game victory margins:\n\n${lines.join("\n")}\n\n${scope}`;
  }

  if (result.query.metric === "largest_margin" && result.highlightGame) {
    const g = result.highlightGame;
    const phase = g.isPlayoff ? "playoff" : "regular-season";
    const ownerScoped = Boolean(result.query.ownerName || result.query.ownerPersonId);
    const vsOpp = Boolean(result.query.opponentName || result.query.opponentPersonId);
    const lead = vsOpp
      ? `${g.winnerName} recorded their largest margin of victory over ${g.loserName}`
      : ownerScoped
        ? `${g.winnerName} recorded their largest margin of victory`
        : `${g.winnerName} recorded the largest margin of victory in league history`;
    const defeatBit = vsOpp
      ? `, winning by ${g.margin.toFixed(1)} points`
      : `, defeating ${g.loserName} by ${g.margin.toFixed(1)} points`;
    return (
      `${lead}${defeatBit} in Week ${g.week} of the ${g.season} season (${phase}). ${scope}`
    );
  }

  if (result.query.metric === "highest_combined_score" && result.highlightGame) {
    const g = result.highlightGame;
    const phase = g.isPlayoff ? "playoff" : "regular-season";
    return (
      `Highest combined score: ${g.winnerName} ${g.winnerScore}–${g.loserScore} ${g.loserName} ` +
      `(${g.combinedScore.toFixed(1)} combined) in ${g.season} week ${g.week} (${phase}). ${scope}`
    );
  }

  if (result.query.metric === "lowest_combined_score" && result.highlightGame) {
    const g = result.highlightGame;
    const phase = g.isPlayoff ? "playoff" : "regular-season";
    return (
      `Lowest combined score: ${g.winnerName} ${g.winnerScore}–${g.loserScore} ${g.loserName} ` +
      `(${g.combinedScore.toFixed(1)} combined) in ${g.season} week ${g.week} (${phase}). ${scope}`
    );
  }

  if (result.query.metric === "highest_losing_score" && result.highlightGame) {
    const g = result.highlightGame;
    const phase = g.isPlayoff ? "playoff" : "regular-season";
    return (
      `Highest losing score: ${g.loserName} scored ${g.loserScore.toFixed(1)} in a loss to ` +
      `${g.winnerName} ${g.winnerScore}–${g.loserScore} in ${g.season} week ${g.week} (${phase}). ${scope}`
    );
  }

  if (result.query.metric === "lowest_winning_score" && result.highlightGame) {
    const g = result.highlightGame;
    const phase = g.isPlayoff ? "playoff" : "regular-season";
    return (
      `Lowest winning score: ${g.winnerName} scored ${g.winnerScore.toFixed(1)} in a win over ` +
      `${g.loserName} ${g.winnerScore}–${g.loserScore} in ${g.season} week ${g.week} (${phase}). ${scope}`
    );
  }

  if (
    (result.query.metric === "largest_margin" ||
      result.query.metric === "highest_combined_score" ||
      result.query.metric === "lowest_combined_score" ||
      result.query.metric === "highest_losing_score" ||
      result.query.metric === "lowest_winning_score") &&
    !result.highlightGame
  ) {
    return `No matching recorded games for that margin query. Ties may be excluded. ${scope}`;
  }

  if (result.query.metric === "average_margin") {
    return (
      `Average absolute final-score margin is ${result.averageAbsMargin?.toFixed(2) ?? "n/a"} points ` +
      `(ties excluded). Recorded ties: ${result.ties}. ${scope}`
    );
  }

  if (result.query.metric === "ties") {
    const leaders = (groupBy === "team" ? result.byTeam : result.byOwner).slice(0, topN);
    if (result.ties === 0) {
      return `No ties found. ${scope}`;
    }
    if (groupBy === "team" && result.byTeam.length) {
      const top = leaders as TeamMarginCount[];
      const head = top
        .map((t) => `${t.teamName} (${t.season}): ${t.count}`)
        .join("; ");
      return `Recorded ties: ${result.ties}. Most involved teams — ${head}. ${scope}`;
    }
    const top = leaders as OwnerMarginCount[];
    const head = top.map((o) => `${o.displayName}: ${o.count}`).join("; ");
    return `Recorded ties: ${result.ties}. Most involved owners — ${head}. ${scope}`;
  }

  if (result.query.metric === "decided_by_at_most") {
    const max = result.query.marginMax ?? 1;
    const label = `games decided by ≤ ${max} point${max === 1 ? "" : "s"}`;
    if (result.matchingGames === 0) {
      return `No ${label} found. Ties are excluded. ${scope}`;
    }
    if (groupBy === "team" && result.byTeam.length) {
      const top = result.byTeam[0];
      return (
        `${top.teamName} (${top.season}) appeared in the most ${label}: ${top.count}. ` +
        `League total: ${result.matchingGames}. Ties excluded. ${scope}`
      );
    }
    if (result.byOwner.length) {
      const top = result.byOwner[0];
      const rest =
        result.byOwner.length > 1
          ? ` Next: ${result.byOwner
              .slice(1, topN)
              .map((o) => `${o.displayName} ${o.count}`)
              .join(", ")}.`
          : "";
      return (
        `${top.displayName} has been in the most ${label}: ${top.count}. ` +
        `League total: ${result.matchingGames}. Ties excluded. ${scope}${rest}`
      );
    }
    return `Found ${result.matchingGames} ${label}. Ties excluded. ${scope}`;
  }

  if (result.query.metric === "losses_by_margin" || result.query.metric === "wins_by_margin") {
    const isLoss = result.query.metric === "losses_by_margin";
    const side = isLoss ? "losses" : "wins";
    const singular = isLoss ? "loss" : "win";
    const atLeast =
      result.query.marginMin != null && result.query.marginExact == null;
    const atMost =
      result.query.marginMax != null &&
      result.query.marginExact == null &&
      !atLeast;
    const exact = result.query.marginExact ?? 1;
    const max = result.query.marginMax ?? exact;
    const min = result.query.marginMin ?? 0;
    const onePoint = !atMost && !atLeast && exact === 1;
    const noun = atLeast
      ? `${side} by ${min}+ points`
      : atMost
        ? `${side} by ≤ ${max} point${max === 1 ? "" : "s"}`
        : onePoint
          ? `one-point ${side}`
          : `${exact}-point ${side}`;
    const meaning = atLeast
      ? `Counting final-score ${singular} margins of at least ${min} points (ties excluded).`
      : atMost
        ? `Counting final-score ${singular} margins greater than 0 and at most ${max} points (ties excluded).`
        : formatMarginDefinition(result, exact);

    const ownerScoped = Boolean(result.query.ownerName || result.query.ownerPersonId);
    if (ownerScoped) {
      const want = (result.query.ownerPersonId || result.query.ownerName || "").toLowerCase();
      const row =
        result.byOwner.find(
          (o) =>
            o.personId.toLowerCase() === want ||
            o.displayName.toLowerCase() === want ||
            o.displayName.toLowerCase().includes(
              (result.query.ownerName || "").toLowerCase(),
            ),
        ) ?? null;
      const name = row?.displayName || result.query.ownerName || "That owner";
      const count = row?.count ?? 0;
      return `${name} has ${count} ${noun}. ${scope} ${meaning}`.trim();
    }

    const rows = groupBy === "team" ? result.byTeam : result.byOwner;
    if (rows.length === 0) {
      return `No ${noun} found. Ties are excluded from ${side}. ${scope} ${meaning}`.trim();
    }

    if (groupBy === "team") {
      const top = result.byTeam[0];
      return (
        `${top.teamName} (${top.season}` +
        `${top.ownerName ? `, ${top.ownerName}` : ""}) has the most ${noun}: ${top.count}. ` +
        `${scope} ${meaning}`
      ).trim();
    }

    const top = result.byOwner[0];
    const rest =
      result.byOwner.length > 1
        ? ` Next: ${result.byOwner
            .slice(1, topN)
            .map((o) => `${o.displayName} ${o.count}`)
            .join(", ")}.`
        : "";
    return (
      `${top.displayName} has the most ${noun}: ${top.count}. ${scope} ${meaning}${rest}`
    ).trim();
  }

  return `Matchup margin query completed. ${scope}`;
}
