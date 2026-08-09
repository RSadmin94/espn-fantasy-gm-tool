/**
 * RFSN-053B — Historical Matchup Gallery query (pure).
 *
 * One filter → one GalleryMatchup[] contract. Reuses margin bands, playoff-tier
 * classification, and Owner Identity person ids. Does not invent championship
 * games when ESPN playoffTierType coverage is insufficient.
 */

import {
  absMargin,
  detectScoringPrecision,
  exactMarginBand,
  type MatchupPhaseFilter,
  type ScoringPrecision,
} from "./matchupMarginAnalytics";

export type { MatchupPhaseFilter, ScoringPrecision };
import {
  classifyEspnPlayoffTier,
  meetingKey,
  placementWinnersBracketKeys,
  type EspnPlayoffTierKind,
} from "./matchupPlayoffTier";

/** Same threshold as League Wire `gameType === "blowout"` and Advisor marginMin 50. */
export const NO_MERCY_MARGIN = 50;

export const CHAMPIONSHIP_TIER_UNKNOWN_MAX = 0.1;

export type GalleryResultFilter = "win" | "loss" | "tie" | "any";

export type GallerySort =
  | "newest"
  | "oldest"
  | "closest"
  | "margin_desc"
  | "highest_score"
  | "lowest_score";

export type GalleryEmptyReason =
  | "missing_dataset"
  | "no_matching_games"
  | "unresolved_owner"
  | "unresolved_opponent"
  | "insufficient_playoff_tier";

export type GalleryGameType = "blowout" | "comfortable" | "close" | "nailbiter" | "tie";

export type GalleryFilter = {
  ownerPersonId?: string;
  ownerName?: string;
  opponentPersonId?: string;
  opponentName?: string;
  seasonFrom?: number;
  seasonTo?: number;
  week?: number;
  /** Default: all (gallery lists games; RS vs PO is labeled on each card). */
  phase?: MatchupPhaseFilter;
  result?: GalleryResultFilter;
  /** Exact one-point band via matchupMarginAnalytics.exactMarginBand(1). */
  onePoint?: boolean;
  /** Inclusive min abs margin (No Mercy / blowouts use 50). */
  marginMin?: number;
  /** Inclusive max abs margin. */
  marginMax?: number;
  /** Sugar: marginMin 50 + result win (unless result is already set). */
  noMercy?: boolean;
  /** Owner (or either side if no owner) scored at least this. */
  scoreMin?: number;
  /** Owner (or either side if no owner) scored at most this. */
  scoreMax?: number;
  /**
   * Only proven WINNERS_BRACKET title-game candidates.
   * Empty + insufficient_playoff_tier when coverage cannot prove them.
   */
  championshipGames?: boolean;
  sort?: GallerySort;
  limit?: number;
  offset?: number;
};

export type GalleryGameRecord = {
  matchupId: number;
  season: number;
  week: number;
  matchupPeriodId: number;
  isPlayoff: boolean;
  playoffTierType: string | null;
  playoffKind: EspnPlayoffTierKind;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  homePersonId: string | null;
  awayPersonId: string | null;
  homePersonName: string | null;
  awayPersonName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  winnerPersonId: string | null;
};

export type GalleryMatchup = {
  matchupId: number;
  season: number;
  week: number;
  matchupPeriodId: number;
  phase: "regular" | "playoffs";
  playoffKind: EspnPlayoffTierKind;
  isChampionshipGame: boolean;
  homePersonId: string | null;
  awayPersonId: string | null;
  homeDisplayName: string;
  awayDisplayName: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  homeScore: number;
  awayScore: number;
  margin: number;
  winnerPersonId: string | null;
  winnerDisplayName: string | null;
  gameType: GalleryGameType;
  viewerHref: string;
};

export type ChampionshipGameEvidence = {
  canProve: boolean;
  playoffMeetings: number;
  winnersBracketMeetings: number;
  consolationMeetings: number;
  unknownTierMeetings: number;
  unknownRatio: number;
  titleGameKeys: string[];
  ambiguousSeasons: number[];
  note: string;
};

export type GalleryQueryResult = {
  filter: GalleryFilter;
  matchups: GalleryMatchup[];
  total: number;
  summary: string;
  coverage: {
    recordedGames: number;
    seasonFrom: number | null;
    seasonTo: number | null;
    phase: MatchupPhaseFilter;
    scoringPrecision: ScoringPrecision;
    championshipScope: "title_games" | "insufficient_playoff_tier" | "not_requested";
    championshipNote: string | null;
  };
  empty: boolean;
  emptyReason: GalleryEmptyReason | null;
  seeAllHref: string;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function galleryIsTie(g: Pick<GalleryGameRecord, "homeScore" | "awayScore" | "winnerPersonId">): boolean {
  if (g.winnerPersonId == null && round2(g.homeScore) === round2(g.awayScore)) return true;
  return round2(g.homeScore) === round2(g.awayScore);
}

function normalizeOwnerKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s:{}-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First/last token or full-name match. Does not substring-match inside tokens ("rod" ≠ Broderick). */
export function galleryOwnerNameMatches(candidateName: string | null | undefined, wantRaw: string): boolean {
  if (!candidateName?.trim() || !wantRaw.trim()) return false;
  const want = normalizeOwnerKey(wantRaw);
  const have = normalizeOwnerKey(candidateName);
  if (!want || !have) return false;
  if (have === want) return true;
  if (want.startsWith("id:") && have === want) return true;
  const tokens = have.split(" ").filter(Boolean);
  if (tokens[0] === want) return true;
  if (tokens[tokens.length - 1] === want) return true;
  if (have.startsWith(`${want} `)) return true;
  if (want.includes(" ") && (have === want || have.startsWith(`${want} `) || have.includes(` ${want}`))) {
    return true;
  }
  return false;
}

function collectPersons(games: GalleryGameRecord[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const g of games) {
    if (g.homePersonId) map.set(g.homePersonId, g.homePersonName || g.homePersonId);
    if (g.awayPersonId) map.set(g.awayPersonId, g.awayPersonName || g.awayPersonId);
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function resolvePersonIds(
  games: GalleryGameRecord[],
  personId: string | undefined,
  personName: string | undefined,
): string[] | "unresolved" | "any" {
  if (!personId && !personName?.trim()) return "any";
  if (personId) {
    const hit = collectPersons(games).some((p) => p.id === personId);
    return hit ? [personId] : "unresolved";
  }
  const ids = collectPersons(games)
    .filter((p) => galleryOwnerNameMatches(p.name, personName!) || normalizeOwnerKey(p.id) === normalizeOwnerKey(personName!))
    .map((p) => p.id);
  if (!ids.length) return "unresolved";
  return [...new Set(ids)];
}

function gameInvolves(g: GalleryGameRecord, ids: string[]): boolean {
  return (!!g.homePersonId && ids.includes(g.homePersonId)) || (!!g.awayPersonId && ids.includes(g.awayPersonId));
}

function gameIsPair(g: GalleryGameRecord, ownerIds: string[], opponentIds: string[]): boolean {
  const home = g.homePersonId;
  const away = g.awayPersonId;
  if (!home || !away) return false;
  return (
    (ownerIds.includes(home) && opponentIds.includes(away)) ||
    (ownerIds.includes(away) && opponentIds.includes(home))
  );
}

function ownerScore(g: GalleryGameRecord, ownerIds: string[] | "any"): number | null {
  if (ownerIds === "any") return null;
  if (g.homePersonId && ownerIds.includes(g.homePersonId)) return g.homeScore;
  if (g.awayPersonId && ownerIds.includes(g.awayPersonId)) return g.awayScore;
  return null;
}

function ownerWon(g: GalleryGameRecord, ownerIds: string[]): boolean {
  return !!g.winnerPersonId && ownerIds.includes(g.winnerPersonId);
}

function ownerLost(g: GalleryGameRecord, ownerIds: string[]): boolean {
  if (galleryIsTie(g) || !g.winnerPersonId) return false;
  return gameInvolves(g, ownerIds) && !ownerIds.includes(g.winnerPersonId);
}

export function galleryGameType(g: Pick<GalleryGameRecord, "homeScore" | "awayScore" | "winnerPersonId">): GalleryGameType {
  if (galleryIsTie(g)) return "tie";
  const margin = absMargin(g);
  if (margin >= NO_MERCY_MARGIN) return "blowout";
  if (margin >= 25) return "comfortable";
  if (margin >= 8) return "close";
  return "nailbiter";
}

export function assessChampionshipGameEvidence(games: GalleryGameRecord[]): ChampionshipGameEvidence {
  const playoff = games.filter((g) => g.isPlayoff);
  const winners = playoff.filter((g) => g.playoffKind === "winners");
  const consolation = playoff.filter((g) => g.playoffKind === "consolation");
  const unknown = playoff.filter((g) => g.playoffKind === "unknown");
  const unknownRatio = playoff.length ? unknown.length / playoff.length : 1;
  const canProveCoverage =
    playoff.length > 0 && winners.length > 0 && unknownRatio <= CHAMPIONSHIP_TIER_UNKNOWN_MAX;

  const placement = placementWinnersBracketKeys(
    winners.map((g) => ({
      season: g.season,
      matchupPeriodId: g.matchupPeriodId,
      homePerson: g.homePersonId ?? `team:${g.homeTeamId}`,
      awayPerson: g.awayPersonId ?? `team:${g.awayTeamId}`,
      winnerPerson: g.winnerPersonId,
      kind: g.playoffKind,
    })),
  );

  const titleGameKeys = new Set<string>();
  const ambiguousSeasons: number[] = [];
  const bySeason = new Map<number, GalleryGameRecord[]>();
  for (const g of winners) {
    if (!bySeason.has(g.season)) bySeason.set(g.season, []);
    bySeason.get(g.season)!.push(g);
  }
  for (const [season, seasonGames] of bySeason) {
    const maxP = Math.max(...seasonGames.map((g) => g.matchupPeriodId));
    const finalRound = seasonGames.filter((g) => g.matchupPeriodId === maxP);
    if (finalRound.length === 1) {
      titleGameKeys.add(galleryMeetingKey(finalRound[0]!));
      continue;
    }
    const proven = finalRound.filter((g) => {
      const key = meetingKey({
        season: g.season,
        matchupPeriodId: g.matchupPeriodId,
        homePerson: g.homePersonId ?? `team:${g.homeTeamId}`,
        awayPerson: g.awayPersonId ?? `team:${g.awayTeamId}`,
      });
      return !placement.has(key);
    });
    const excluded = finalRound.length - proven.length;
    if (excluded > 0 && proven.length > 0) {
      for (const g of proven) titleGameKeys.add(galleryMeetingKey(g));
    } else {
      ambiguousSeasons.push(season);
    }
  }

  const canProve = canProveCoverage && titleGameKeys.size > 0;
  const note = !canProveCoverage
    ? `Championship-game candidates need ESPN playoffTierType coverage. Recorded playoff flags alone are not enough (${unknown.length}/${playoff.length} unknown tier).`
    : titleGameKeys.size > 0
      ? `Championship-game candidates are ESPN WINNERS_BRACKET title games (3rd-place excluded when semi-final winners identify the final).`
      : `ESPN WINNERS_BRACKET coverage exists, but final-period games are ambiguous (could not separate title vs placement).`;

  return {
    canProve,
    playoffMeetings: playoff.length,
    winnersBracketMeetings: winners.length,
    consolationMeetings: consolation.length,
    unknownTierMeetings: unknown.length,
    unknownRatio,
    titleGameKeys: [...titleGameKeys],
    ambiguousSeasons,
    note,
  };
}

export function galleryMeetingKey(g: GalleryGameRecord): string {
  return meetingKey({
    season: g.season,
    matchupPeriodId: g.matchupPeriodId,
    homePerson: g.homePersonId ?? `team:${g.homeTeamId}`,
    awayPerson: g.awayPersonId ?? `team:${g.awayTeamId}`,
  });
}

function displayName(name: string | null, teamName: string | null, teamId: number): string {
  return name?.trim() || teamName?.trim() || `Team ${teamId}`;
}

function toCard(g: GalleryGameRecord, titleKeys: Set<string>): GalleryMatchup {
  const margin = absMargin(g);
  const winnerName =
    g.winnerPersonId === g.homePersonId
      ? displayName(g.homePersonName, g.homeTeamName, g.homeTeamId)
      : g.winnerPersonId === g.awayPersonId
        ? displayName(g.awayPersonName, g.awayTeamName, g.awayTeamId)
        : null;
  return {
    matchupId: g.matchupId,
    season: g.season,
    week: g.week,
    matchupPeriodId: g.matchupPeriodId,
    phase: g.isPlayoff ? "playoffs" : "regular",
    playoffKind: g.playoffKind,
    isChampionshipGame: titleKeys.has(galleryMeetingKey(g)),
    homePersonId: g.homePersonId,
    awayPersonId: g.awayPersonId,
    homeDisplayName: displayName(g.homePersonName, g.homeTeamName, g.homeTeamId),
    awayDisplayName: displayName(g.awayPersonName, g.awayTeamName, g.awayTeamId),
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeTeamName: g.homeTeamName,
    awayTeamName: g.awayTeamName,
    homeLogoUrl: g.homeLogoUrl,
    awayLogoUrl: g.awayLogoUrl,
    homeScore: round2(g.homeScore),
    awayScore: round2(g.awayScore),
    margin,
    winnerPersonId: g.winnerPersonId,
    winnerDisplayName: winnerName,
    gameType: galleryGameType(g),
    viewerHref: `/league/history/matchups/${g.matchupId}`,
  };
}

function phaseLabel(phase: MatchupPhaseFilter): string {
  if (phase === "playoffs") return "playoff";
  if (phase === "regular") return "regular-season";
  return "regular-season and playoff";
}

function coverageYears(games: GalleryGameRecord[]): { from: number | null; to: number | null } {
  if (!games.length) return { from: null, to: null };
  const seasons = games.map((g) => g.season);
  return { from: Math.min(...seasons), to: Math.max(...seasons) };
}

function yearSpan(from: number | null, to: number | null): string {
  if (from == null || to == null) return "";
  if (from === to) return ` in ${from}`;
  return ` from ${from}–${to}`;
}

function seeAllHref(filter: GalleryFilter): string {
  const q = new URLSearchParams();
  if (filter.ownerPersonId) q.set("owner", filter.ownerPersonId);
  else if (filter.ownerName) q.set("ownerName", filter.ownerName);
  if (filter.opponentPersonId) q.set("opponent", filter.opponentPersonId);
  else if (filter.opponentName) q.set("opponentName", filter.opponentName);
  if (filter.seasonFrom != null) q.set("seasonFrom", String(filter.seasonFrom));
  if (filter.seasonTo != null) q.set("seasonTo", String(filter.seasonTo));
  if (filter.week != null) q.set("week", String(filter.week));
  if (filter.phase && filter.phase !== "all") q.set("phase", filter.phase);
  if (filter.result && filter.result !== "any") q.set("result", filter.result);
  if (filter.onePoint) q.set("onePoint", "1");
  if (filter.noMercy) q.set("noMercy", "1");
  if (filter.marginMin != null) q.set("marginMin", String(filter.marginMin));
  if (filter.marginMax != null) q.set("marginMax", String(filter.marginMax));
  if (filter.scoreMin != null) q.set("scoreMin", String(filter.scoreMin));
  if (filter.scoreMax != null) q.set("scoreMax", String(filter.scoreMax));
  if (filter.championshipGames) q.set("championship", "1");
  if (filter.sort && filter.sort !== "newest") q.set("sort", filter.sort);
  const qs = q.toString();
  return qs ? `/league/history/matchups?${qs}` : "/league/history/matchups";
}

function emptyResult(
  filter: GalleryFilter,
  reason: GalleryEmptyReason,
  summary: string,
  coverage: GalleryQueryResult["coverage"],
): GalleryQueryResult {
  return {
    filter,
    matchups: [],
    total: 0,
    summary,
    coverage,
    empty: true,
    emptyReason: reason,
    seeAllHref: seeAllHref(filter),
  };
}

function sortGames(games: GalleryGameRecord[], sort: GallerySort, ownerIds: string[] | "any"): GalleryGameRecord[] {
  const copy = [...games];
  const ownerPts = (g: GalleryGameRecord) => {
    const s = ownerScore(g, ownerIds);
    return s != null ? s : Math.max(g.homeScore, g.awayScore);
  };
  const ownerFloor = (g: GalleryGameRecord) => {
    const s = ownerScore(g, ownerIds);
    return s != null ? s : Math.min(g.homeScore, g.awayScore);
  };
  copy.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return a.season - b.season || a.week - b.week || a.matchupId - b.matchupId;
      case "closest":
        return absMargin(a) - absMargin(b) || a.season - b.season || a.week - b.week;
      case "margin_desc":
        return absMargin(b) - absMargin(a) || a.season - b.season;
      case "highest_score":
        return ownerPts(b) - ownerPts(a) || a.season - b.season;
      case "lowest_score":
        return ownerFloor(a) - ownerFloor(b) || a.season - b.season;
      case "newest":
      default:
        return b.season - a.season || b.week - a.week || b.matchupId - a.matchupId;
    }
  });
  return copy;
}

function formatSummary(args: {
  filter: GalleryFilter;
  matched: GalleryGameRecord[];
  phase: MatchupPhaseFilter;
  coverageFrom: number | null;
  coverageTo: number | null;
  ownerLabel: string | null;
  opponentLabel: string | null;
  onePointBandDef: string | null;
}): string {
  const { filter, matched, phase, coverageFrom, coverageTo, ownerLabel, opponentLabel, onePointBandDef } =
    args;
  const n = matched.length;
  const years = yearSpan(coverageFrom, coverageTo);
  const phaseBit = phaseLabel(phase);
  const scope = `recorded ${phaseBit} matchups${years}`;

  if (filter.championshipGames) {
    return n === 1
      ? `1 championship-game candidate (${scope}).`
      : `${n} championship-game candidates (${scope}).`;
  }
  if (filter.noMercy || (filter.marginMin != null && filter.marginMin >= NO_MERCY_MARGIN && (filter.result === "win" || filter.result == null))) {
    const who = ownerLabel ?? "This league";
    return n === 1
      ? `${who} has 1 No Mercy Rule victory (${scope}).`
      : `${who} has ${n} No Mercy Rule victories (${scope}).`;
  }
  if (filter.onePoint && ownerLabel) {
    if (filter.result === "win") {
      return `${ownerLabel} has ${n} one-point win${n === 1 ? "" : "s"} (${onePointBandDef ?? "one-point band"}; ${scope}).`;
    }
    if (filter.result === "loss") {
      return `${ownerLabel} has ${n} one-point loss${n === 1 ? "" : "es"} (${onePointBandDef ?? "one-point band"}; ${scope}).`;
    }
    return `${ownerLabel} has ${n} one-point game${n === 1 ? "" : "s"} (${onePointBandDef ?? "one-point band"}; ${scope}).`;
  }
  if (ownerLabel && opponentLabel) {
    return `${ownerLabel} vs ${opponentLabel}: ${n} recorded meeting${n === 1 ? "" : "s"}${years}.`;
  }
  if (filter.phase === "playoffs") {
    return `${n} recorded playoff game${n === 1 ? "" : "s"}${ownerLabel ? ` involving ${ownerLabel}` : ""}${years}.`;
  }
  if (filter.sort === "closest") {
    return `${n} closest recorded game${n === 1 ? "" : "s"} (${scope}).`;
  }
  if (filter.sort === "highest_score") {
    return `${n} highest-scoring recorded game${n === 1 ? "" : "s"} (${scope}).`;
  }
  if (filter.sort === "lowest_score") {
    return `${n} lowest-scoring recorded game${n === 1 ? "" : "s"} (${scope}).`;
  }
  if (ownerLabel) {
    return `${n} recorded game${n === 1 ? "" : "s"} involving ${ownerLabel} (${scope}).`;
  }
  return `${n} recorded game${n === 1 ? "" : "s"} (${scope}).`;
}

/**
 * Pure gallery query. Pass already-loaded completed games (identity resolved).
 * Incomplete rows should be excluded by the loader.
 */
export function queryMatchupGallery(
  games: GalleryGameRecord[],
  filter: GalleryFilter = {},
): GalleryQueryResult {
  const phase: MatchupPhaseFilter = filter.phase ?? "all";
  const sort: GallerySort = filter.sort ?? "newest";
  const limit = Math.min(MAX_LIMIT, Math.max(1, filter.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, filter.offset ?? 0);
  const precision = detectScoringPrecision(games.flatMap((g) => [g.homeScore, g.awayScore]));
  const champEvidence = assessChampionshipGameEvidence(games);
  const titleKeySet = new Set(champEvidence.titleGameKeys);

  const baseCoverage = (): GalleryQueryResult["coverage"] => {
    const years = coverageYears(games);
    return {
      recordedGames: games.length,
      seasonFrom: years.from,
      seasonTo: years.to,
      phase,
      scoringPrecision: precision,
      championshipScope: filter.championshipGames
        ? champEvidence.canProve
          ? "title_games"
          : "insufficient_playoff_tier"
        : "not_requested",
      championshipNote: filter.championshipGames ? champEvidence.note : null,
    };
  };

  if (!games.length) {
    return emptyResult(
      filter,
      "missing_dataset",
      "No recorded completed matchups for this league yet.",
      {
        recordedGames: 0,
        seasonFrom: null,
        seasonTo: null,
        phase,
        scoringPrecision: precision,
        championshipScope: filter.championshipGames ? "insufficient_playoff_tier" : "not_requested",
        championshipNote: filter.championshipGames
          ? "No completed matchups — championship-game candidates cannot be proven."
          : null,
      },
    );
  }

  if (filter.championshipGames && !champEvidence.canProve) {
    return emptyResult(filter, "insufficient_playoff_tier", champEvidence.note, baseCoverage());
  }

  const ownerIds = resolvePersonIds(games, filter.ownerPersonId, filter.ownerName);
  if (ownerIds === "unresolved") {
    return emptyResult(
      filter,
      "unresolved_owner",
      "No owner matched that name in this league.",
      baseCoverage(),
    );
  }
  const opponentIds = resolvePersonIds(games, filter.opponentPersonId, filter.opponentName);
  if (opponentIds === "unresolved") {
    return emptyResult(
      filter,
      "unresolved_opponent",
      "No opponent matched that name in this league.",
      baseCoverage(),
    );
  }
  if (ownerIds !== "any" && opponentIds !== "any" && ownerIds.some((id) => opponentIds.includes(id))) {
    return emptyResult(
      filter,
      "no_matching_games",
      "Owner and opponent resolved to the same person.",
      baseCoverage(),
    );
  }

  const resultFilter: GalleryResultFilter =
    filter.noMercy && !filter.result ? "win" : (filter.result ?? "any");
  const marginMin =
    filter.noMercy && filter.marginMin == null ? NO_MERCY_MARGIN : filter.marginMin;
  const onePointBand = filter.onePoint ? exactMarginBand(1, precision) : null;

  let filtered = games.filter((g) => {
    if (phase === "regular" && g.isPlayoff) return false;
    if (phase === "playoffs" && !g.isPlayoff) return false;
    if (filter.seasonFrom != null && g.season < filter.seasonFrom) return false;
    if (filter.seasonTo != null && g.season > filter.seasonTo) return false;
    if (filter.week != null && g.week !== filter.week) return false;
    if (filter.championshipGames && !titleKeySet.has(galleryMeetingKey(g))) return false;

    if (ownerIds !== "any" && opponentIds !== "any") {
      if (!gameIsPair(g, ownerIds, opponentIds)) return false;
    } else if (ownerIds !== "any") {
      if (!gameInvolves(g, ownerIds)) return false;
    } else if (opponentIds !== "any") {
      if (!gameInvolves(g, opponentIds)) return false;
    }

    if (resultFilter !== "any") {
      if (ownerIds === "any") return false;
      if (resultFilter === "win" && !ownerWon(g, ownerIds)) return false;
      if (resultFilter === "loss" && !ownerLost(g, ownerIds)) return false;
      if (resultFilter === "tie" && !galleryIsTie(g)) return false;
    }

    const margin = absMargin(g);
    if (onePointBand) {
      if (galleryIsTie(g)) return false;
      if (margin < onePointBand.minInclusive - 1e-9 || margin > onePointBand.maxInclusive + 1e-9) {
        return false;
      }
    }
    if (marginMin != null && (galleryIsTie(g) || margin + 1e-9 < marginMin)) return false;
    if (filter.marginMax != null && (galleryIsTie(g) || margin - 1e-9 > filter.marginMax)) return false;

    if (filter.scoreMin != null || filter.scoreMax != null) {
      if (ownerIds !== "any") {
        const pts = ownerScore(g, ownerIds);
        if (pts == null) return false;
        if (filter.scoreMin != null && pts + 1e-9 < filter.scoreMin) return false;
        if (filter.scoreMax != null && pts - 1e-9 > filter.scoreMax) return false;
      } else {
        const hi = Math.max(g.homeScore, g.awayScore);
        const lo = Math.min(g.homeScore, g.awayScore);
        if (filter.scoreMin != null && hi + 1e-9 < filter.scoreMin) return false;
        if (filter.scoreMax != null && lo - 1e-9 > filter.scoreMax) return false;
      }
    }

    if (sort === "closest" && galleryIsTie(g)) return false;

    return true;
  });

  if (resultFilter !== "any" && ownerIds === "any") {
    return emptyResult(
      filter,
      "unresolved_owner",
      "Win/loss filters need a named owner.",
      baseCoverage(),
    );
  }

  filtered = sortGames(filtered, sort, ownerIds);
  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  if (!total) {
    const years = coverageYears(games);
    let summary = `No recorded games match that filter${yearSpan(years.from, years.to)}.`;
    if (filter.onePoint && onePointBand) {
      summary = `No recorded one-point games match that filter (${onePointBand.definition}${yearSpan(years.from, years.to)}).`;
    }
    if (filter.noMercy || (marginMin != null && marginMin >= NO_MERCY_MARGIN)) {
      summary = `No recorded No Mercy Rule victories match that filter${yearSpan(years.from, years.to)}.`;
    }
    if (filter.championshipGames) {
      summary = champEvidence.note;
    }
    return emptyResult(filter, "no_matching_games", summary, baseCoverage());
  }

  const ownerLabel =
    ownerIds === "any"
      ? null
      : games.find((g) => g.homePersonId && ownerIds.includes(g.homePersonId))?.homePersonName ||
        games.find((g) => g.awayPersonId && ownerIds.includes(g.awayPersonId))?.awayPersonName ||
        filter.ownerName ||
        ownerIds[0] ||
        null;
  const opponentLabel =
    opponentIds === "any"
      ? null
      : games.find((g) => g.homePersonId && opponentIds.includes(g.homePersonId))?.homePersonName ||
        games.find((g) => g.awayPersonId && opponentIds.includes(g.awayPersonId))?.awayPersonName ||
        filter.opponentName ||
        opponentIds[0] ||
        null;

  const years = coverageYears(filtered);
  const summary = formatSummary({
    filter: { ...filter, phase, result: resultFilter, marginMin },
    matched: filtered,
    phase,
    coverageFrom: years.from,
    coverageTo: years.to,
    ownerLabel,
    opponentLabel,
    onePointBandDef: onePointBand?.definition ?? null,
  });

  return {
    filter: { ...filter, phase, sort, limit, offset },
    matchups: page.map((g) => toCard(g, titleKeySet)),
    total,
    summary,
    coverage: baseCoverage(),
    empty: false,
    emptyReason: null,
    seeAllHref: seeAllHref(filter),
  };
}

export function playoffKindFromRaw(
  playoffTierType: string | null | undefined,
  isPlayoff: boolean,
): EspnPlayoffTierKind {
  return classifyEspnPlayoffTier(playoffTierType, isPlayoff);
}
