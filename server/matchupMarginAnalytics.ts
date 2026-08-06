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
  | "average_margin"
  | "ties";

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
  /** Exact margin target (e.g. 1 for one-point). Used with wins/losses_by_margin. */
  marginExact?: number;
  /** Inclusive max abs margin for decided_by_at_most. */
  marginMax?: number;
  seasonFrom?: number;
  seasonTo?: number;
  phase?: MatchupPhaseFilter;
  /** Optional owner filter (display name or canonical person id). */
  ownerName?: string;
  ownerPersonId?: string;
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

function ownerMatches(
  game: MarginGameRecord,
  side: "home" | "away",
  query: MatchupMarginQuery,
): boolean {
  const personId = side === "home" ? game.homePersonId : game.awayPersonId;
  const name = side === "home" ? game.homePersonName : game.awayPersonName;
  if (query.ownerPersonId) {
    return personId === query.ownerPersonId;
  }
  if (!query.ownerName?.trim()) return true;
  const want = normalizeOwnerKey(query.ownerName);
  if (personId && normalizeOwnerKey(personId) === want) return true;
  if (name && normalizeOwnerKey(name) === want) return true;
  if (name && normalizeOwnerKey(name).includes(want)) return true;
  return false;
}

export function filterMarginGames(
  games: MarginGameRecord[],
  query: MatchupMarginQuery,
): MarginGameRecord[] {
  const phase = query.phase ?? "regular";
  return games.filter((g) => {
    if (phase === "regular" && g.isPlayoff) return false;
    if (phase === "playoffs" && !g.isPlayoff) return false;
    if (query.seasonFrom != null && g.season < query.seasonFrom) return false;
    if (query.seasonTo != null && g.season > query.seasonTo) return false;
    if (query.ownerName || query.ownerPersonId) {
      return ownerMatches(g, "home", query) || ownerMatches(g, "away", query);
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

  if (query.metric === "largest_comeback") {
    return {
      query,
      scoringPrecision: precision,
      appliedBand: null,
      coverage: baseCoverage,
      unsupported: true,
      unsupportedReason:
        "Largest comeback requires in-game score timeline snapshots, which are not stored — only final scores (and optional pre-game projections) are available.",
      noData: filtered.length === 0,
      missingDataset:
        filtered.length === 0
          ? "completed historical matchups (gmMatchups)"
          : "in-game score timeline / live scoreboard snapshots",
      ties: 0,
      averageAbsMargin: null,
      closestGame: null,
      matchingGames: 0,
      byOwner: [],
      byTeam: [],
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
      ties: 0,
      averageAbsMargin: null,
      closestGame: null,
      matchingGames: 0,
      byOwner: [],
      byTeam: [],
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
    query.marginExact == null;

  const band =
    (query.metric === "losses_by_margin" || query.metric === "wins_by_margin") && !useMarginAtMost
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
        return !isTie(g);
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
    const atMost = result.query.marginMax != null && result.query.marginExact == null;
    const exact = result.query.marginExact ?? 1;
    const max = result.query.marginMax ?? exact;
    const onePoint = !atMost && exact === 1;
    const noun = atMost
      ? `${side} by ≤ ${max} point${max === 1 ? "" : "s"}`
      : onePoint
        ? `one-point ${side}`
        : `${exact}-point ${side}`;
    const meaning = atMost
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
