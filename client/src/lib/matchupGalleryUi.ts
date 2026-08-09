/**
 * RFSN-053C — Gallery UI helpers.
 * Display-only. Championship / playoff claims come from matchupGallery.query fields.
 */
import type { StoryCollectionId } from "@shared/matchupStoryCollections";
import { isStoryCollectionId } from "@shared/matchupStoryCollections";
import type {
  GalleryEmptyReason,
  GalleryFilter,
  GalleryMatchup,
  GallerySort,
  ScoringPrecision,
} from "../../../server/matchupGalleryQuery";

export const NO_MERCY_MARGIN_UI = 50;

export type GalleryUiFilter = {
  ownerName?: string;
  opponentName?: string;
  /** Single season convenience — maps to seasonFrom = seasonTo. */
  season?: number;
  seasonFrom?: number;
  seasonTo?: number;
  week?: number;
  phase?: "regular" | "playoffs" | "all";
  result?: "win" | "loss" | "tie" | "any";
  onePoint?: boolean;
  marginMin?: number;
  marginMax?: number;
  scoreMin?: number;
  scoreMax?: number;
  noMercy?: boolean;
  sort?: GallerySort;
  championshipGames?: boolean;
  /** RFSN-053E — Story Collection id when browsing a branded theme. */
  collection?: StoryCollectionId;
};

export type GalleryPresetId =
  | "all"
  | "no-mercy"
  | "one-point"
  | "closest"
  | "championship"
  | "playoffs"
  | "highest"
  | "lowest"
  | "blowouts";

export const GALLERY_PRESETS: Array<{ id: GalleryPresetId; label: string }> = [
  { id: "all", label: "All Games" },
  { id: "no-mercy", label: "No Mercy Rule" },
  { id: "one-point", label: "One-Point Games" },
  { id: "closest", label: "Closest Games" },
  { id: "championship", label: "Championship Games" },
  { id: "playoffs", label: "Playoff Games" },
  { id: "highest", label: "Highest Scores" },
  { id: "lowest", label: "Lowest Scores" },
  { id: "blowouts", label: "Biggest Blowouts" },
];

export type GalleryBadgeKind = "NO MERCY" | "ONE POINT" | "PLAYOFF" | "CHAMPIONSHIP" | "CLOSEST";

export type GalleryEmptyCopy = {
  reason: GalleryEmptyReason;
  title: string;
  description: string;
};

export type GalleryFilterChip = { id: string; label: string };

export function noMercyPresetFilter(activeOwnerName?: string | null): GalleryUiFilter {
  const owner = activeOwnerName?.trim();
  return {
    ownerName: owner || undefined,
    marginMin: NO_MERCY_MARGIN_UI,
    result: "win",
    noMercy: true,
    phase: "all",
  };
}

export function gallerySeasonBounds(filter: GalleryUiFilter): { from?: number; to?: number } {
  if (filter.season != null) return { from: filter.season, to: filter.season };
  return { from: filter.seasonFrom, to: filter.seasonTo };
}

/** RFSN-053D — Advisor visual.filters → 053C UI filter. */
export function visualFiltersToGalleryUi(filters: {
  owner?: string;
  opponent?: string;
  ownerName?: string;
  opponentName?: string;
  season?: number;
  seasonFrom?: number;
  seasonTo?: number;
  week?: number;
  phase?: "regular" | "playoffs" | "all";
  result?: "win" | "loss" | "tie" | "any";
  winsOnly?: boolean;
  onePoint?: boolean;
  marginMin?: number;
  marginMax?: number;
  scoreMin?: number;
  scoreMax?: number;
  noMercy?: boolean;
  sort?: GallerySort;
  championshipGames?: boolean;
}): GalleryUiFilter {
  const ownerName = filters.ownerName?.trim() || filters.owner?.trim() || undefined;
  const opponentName = filters.opponentName?.trim() || filters.opponent?.trim() || undefined;
  const result = filters.winsOnly ? "win" : filters.result;
  return {
    ownerName,
    opponentName,
    season: filters.season,
    seasonFrom: filters.seasonFrom,
    seasonTo: filters.seasonTo,
    week: filters.week,
    phase: filters.phase ?? "all",
    result,
    onePoint: filters.onePoint,
    marginMin: filters.marginMin,
    marginMax: filters.marginMax,
    scoreMin: filters.scoreMin,
    scoreMax: filters.scoreMax,
    noMercy: filters.noMercy,
    sort: filters.sort,
    championshipGames: filters.championshipGames,
  };
}

export function galleryFilterToQueryInput(filter: GalleryUiFilter): GalleryFilter {
  const seasons = gallerySeasonBounds(filter);
  return {
    ownerName: filter.ownerName?.trim() || undefined,
    opponentName: filter.opponentName?.trim() || undefined,
    seasonFrom: seasons.from,
    seasonTo: seasons.to,
    week: filter.week,
    phase: filter.phase ?? "all",
    result: filter.result && filter.result !== "any" ? filter.result : undefined,
    onePoint: filter.onePoint || undefined,
    marginMin: filter.marginMin,
    marginMax: filter.marginMax,
    scoreMin: filter.scoreMin,
    scoreMax: filter.scoreMax,
    noMercy: filter.noMercy || undefined,
    sort: filter.sort,
    championshipGames: filter.championshipGames || undefined,
  };
}

export function applyGalleryPreset(
  id: GalleryPresetId,
  current: GalleryUiFilter = {},
  activeOwnerName?: string | null,
): GalleryUiFilter {
  const owner = id === "all" ? undefined : current.ownerName?.trim() || activeOwnerName?.trim() || undefined;
  switch (id) {
    case "all":
      return {};
    case "no-mercy":
      return noMercyPresetFilter(owner);
    case "one-point":
      return { ownerName: owner, onePoint: true, phase: "all" };
    case "closest":
      return { ownerName: owner, sort: "closest", phase: "all" };
    case "championship":
      return { ownerName: owner, championshipGames: true, phase: "all" };
    case "playoffs":
      return { ownerName: owner, phase: "playoffs" };
    case "highest":
      return { ownerName: owner, sort: "highest_score", phase: "all" };
    case "lowest":
      return { ownerName: owner, sort: "lowest_score", phase: "all" };
    case "blowouts":
      return { ownerName: owner, sort: "margin_desc", phase: "all" };
  }
}

export function activeGalleryPreset(
  filter: GalleryUiFilter,
  isNoMercyRoute?: boolean,
): GalleryPresetId | null {
  if (isNoMercyRoute || filter.noMercy) return "no-mercy";
  if (filter.championshipGames) return "championship";
  if (filter.onePoint) return "one-point";
  if (filter.sort === "closest") return "closest";
  if (filter.sort === "highest_score") return "highest";
  if (filter.sort === "lowest_score") return "lowest";
  if (filter.sort === "margin_desc") return "blowouts";
  if (filter.phase === "playoffs") return "playoffs";
  const hasConstraint = Boolean(
    filter.ownerName ||
      filter.opponentName ||
      filter.season != null ||
      filter.seasonFrom != null ||
      filter.seasonTo != null ||
      filter.week != null ||
      (filter.phase && filter.phase !== "all") ||
      (filter.result && filter.result !== "any") ||
      filter.marginMin != null ||
      filter.marginMax != null ||
      filter.scoreMin != null ||
      filter.scoreMax != null ||
      filter.sort ||
      filter.championshipGames ||
      filter.noMercy ||
      filter.onePoint,
  );
  return hasConstraint ? null : "all";
}

export function parseGallerySearchParams(search: string, preset?: "no-mercy"): GalleryUiFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const num = (key: string): number | undefined => {
    const raw = params.get(key);
    if (raw == null || raw.trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const phaseRaw = params.get("phase");
  const phase =
    phaseRaw === "regular" || phaseRaw === "playoffs" || phaseRaw === "all" ? phaseRaw : undefined;
  const resultRaw = params.get("result");
  const result =
    resultRaw === "win" || resultRaw === "loss" || resultRaw === "tie" || resultRaw === "any"
      ? resultRaw
      : undefined;
  const sortRaw = params.get("sort");
  const sort: GallerySort | undefined =
    sortRaw === "newest" ||
    sortRaw === "oldest" ||
    sortRaw === "closest" ||
    sortRaw === "margin_desc" ||
    sortRaw === "highest_score" ||
    sortRaw === "lowest_score"
      ? sortRaw
      : undefined;

  const season = num("season");
  const fromUrl: GalleryUiFilter = {
    ownerName: params.get("ownerName")?.trim() || undefined,
    opponentName: params.get("opponentName")?.trim() || undefined,
    season,
    seasonFrom: season ?? num("seasonFrom"),
    seasonTo: season ?? num("seasonTo"),
    week: num("week"),
    phase,
    result,
    onePoint: params.get("onePoint") === "1" || params.get("onePoint") === "true",
    marginMin: num("marginMin"),
    marginMax: num("marginMax"),
    scoreMin: num("scoreMin"),
    scoreMax: num("scoreMax"),
    noMercy: params.get("noMercy") === "1" || params.get("noMercy") === "true",
    sort,
    championshipGames: params.get("championship") === "1",
    collection: (() => {
      const raw = params.get("collection");
      return isStoryCollectionId(raw) ? raw : undefined;
    })(),
  };

  if (preset === "no-mercy") {
    const base = noMercyPresetFilter(fromUrl.ownerName);
    return {
      ...base,
      ...fromUrl,
      noMercy: true,
      marginMin: fromUrl.marginMin ?? NO_MERCY_MARGIN_UI,
      result: fromUrl.result && fromUrl.result !== "any" ? fromUrl.result : "win",
      phase: fromUrl.phase ?? "all",
    };
  }
  return fromUrl;
}

export function serializeGallerySearchParams(filter: GalleryUiFilter): string {
  const q = new URLSearchParams();
  const seasons = gallerySeasonBounds(filter);
  if (filter.ownerName?.trim()) q.set("ownerName", filter.ownerName.trim());
  if (filter.opponentName?.trim()) q.set("opponentName", filter.opponentName.trim());
  if (seasons.from != null && seasons.to != null && seasons.from === seasons.to) {
    q.set("season", String(seasons.from));
  } else {
    if (seasons.from != null) q.set("seasonFrom", String(seasons.from));
    if (seasons.to != null) q.set("seasonTo", String(seasons.to));
  }
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
  if (filter.collection) q.set("collection", filter.collection);
  return q.toString();
}

export function galleryEmptyCopy(
  reason: GalleryEmptyReason | null | undefined,
  serverSummary?: string | null,
): GalleryEmptyCopy {
  switch (reason) {
    case "missing_dataset":
      return {
        reason: "missing_dataset",
        title: "No recorded matchups yet",
        description:
          serverSummary?.trim() ||
          "This league has no completed historical matchups to browse. Sync league history, then return here.",
      };
    case "unresolved_owner":
      return {
        reason: "unresolved_owner",
        title: "Owner not found",
        description:
          serverSummary?.trim() ||
          "No owner in this league matched that name. Pick an owner from the list or clear the filter.",
      };
    case "unresolved_opponent":
      return {
        reason: "unresolved_opponent",
        title: "Opponent not found",
        description:
          serverSummary?.trim() ||
          "No opponent in this league matched that name. Pick an opponent from the list or clear the filter.",
      };
    case "insufficient_playoff_tier":
      return {
        reason: "insufficient_playoff_tier",
        title: "Championship games cannot be proven",
        description:
          serverSummary?.trim() ||
          "ESPN playoff-tier coverage is not strong enough to label title games. Playoff flags alone are not enough.",
      };
    case "no_matching_games":
      return {
        reason: "no_matching_games",
        title: "No matching games",
        description:
          serverSummary?.trim() ||
          "No recorded games match these filters. Broaden the season, phase, or margin and try again.",
      };
    default:
      return {
        reason: "no_matching_games",
        title: "No matching games",
        description: serverSummary?.trim() || "No recorded games match these filters.",
      };
  }
}

export function isOnePointMargin(margin: number, precision?: ScoringPrecision | null): boolean {
  if (!Number.isFinite(margin) || margin <= 0) return false;
  if (precision === "integer") return margin === 1;
  return margin >= 0.5 - 1e-9 && margin <= 1.49 + 1e-9;
}

/**
 * Badges from contract fields only.
 * CHAMPIONSHIP requires isChampionshipGame. PLAYOFF requires phase === "playoffs".
 */
export function galleryCardBadges(
  matchup: Pick<GalleryMatchup, "phase" | "isChampionshipGame" | "margin" | "gameType">,
  opts: { sort?: GallerySort; scoringPrecision?: ScoringPrecision | null } = {},
): GalleryBadgeKind[] {
  const badges: GalleryBadgeKind[] = [];
  if (matchup.isChampionshipGame === true) badges.push("CHAMPIONSHIP");
  if (matchup.phase === "playoffs") badges.push("PLAYOFF");
  if (matchup.gameType === "blowout" || matchup.margin >= NO_MERCY_MARGIN_UI - 1e-9) {
    badges.push("NO MERCY");
  }
  if (isOnePointMargin(matchup.margin, opts.scoringPrecision ?? undefined)) {
    badges.push("ONE POINT");
  }
  if (opts.sort === "closest") badges.push("CLOSEST");
  return badges;
}

export function galleryFilterChips(filter: GalleryUiFilter): GalleryFilterChip[] {
  const chips: GalleryFilterChip[] = [];
  if (filter.noMercy) chips.push({ id: "noMercy", label: "NO MERCY RULE" });
  if (filter.ownerName?.trim()) chips.push({ id: "owner", label: `Owner: ${filter.ownerName.trim()}` });
  if (filter.opponentName?.trim()) {
    chips.push({ id: "opponent", label: `Opponent: ${filter.opponentName.trim()}` });
  }
  const seasons = gallerySeasonBounds(filter);
  if (seasons.from != null && seasons.to != null) {
    chips.push({
      id: "seasons",
      label: seasons.from === seasons.to ? `Season ${seasons.from}` : `${seasons.from}–${seasons.to}`,
    });
  } else if (seasons.from != null) {
    chips.push({ id: "seasonFrom", label: `From ${seasons.from}` });
  } else if (seasons.to != null) {
    chips.push({ id: "seasonTo", label: `Through ${seasons.to}` });
  }
  if (filter.week != null) chips.push({ id: "week", label: `Week ${filter.week}` });
  if (filter.phase === "regular") chips.push({ id: "phase", label: "Regular season" });
  if (filter.phase === "playoffs") chips.push({ id: "phase", label: "Playoffs" });
  if (filter.result === "win") chips.push({ id: "result", label: "Wins only" });
  if (filter.result === "loss") chips.push({ id: "result", label: "Losses only" });
  if (filter.onePoint) chips.push({ id: "onePoint", label: "One-point games" });
  if (filter.marginMin != null && !filter.noMercy) {
    chips.push({ id: "marginMin", label: `Margin ≥ ${filter.marginMin}` });
  }
  if (filter.marginMax != null) chips.push({ id: "marginMax", label: `Margin ≤ ${filter.marginMax}` });
  if (filter.scoreMin != null) chips.push({ id: "scoreMin", label: `Score ≥ ${filter.scoreMin}` });
  if (filter.scoreMax != null) chips.push({ id: "scoreMax", label: `Score ≤ ${filter.scoreMax}` });
  if (filter.sort === "closest") chips.push({ id: "sort", label: "Closest" });
  if (filter.sort === "highest_score") chips.push({ id: "sort", label: "Highest score" });
  if (filter.sort === "lowest_score") chips.push({ id: "sort", label: "Lowest score" });
  if (filter.sort === "margin_desc") chips.push({ id: "sort", label: "Biggest blowouts" });
  if (filter.championshipGames) chips.push({ id: "championship", label: "Championship games" });
  return chips;
}

export function formatGalleryScore(n: number, precision?: ScoringPrecision | null): string {
  if (!Number.isFinite(n)) return "—";
  if (precision === "integer") return String(Math.round(n));
  if (precision === "one_decimal") return n.toFixed(1);
  return n.toFixed(2);
}

export function formatCoverageRange(from: number | null | undefined, to: number | null | undefined): string | null {
  if (from == null || to == null) return null;
  if (from === to) return String(from);
  return `${from}–${to}`;
}

export function matchupViewHref(
  matchup: Pick<GalleryMatchup, "matchupId" | "season" | "week" | "viewerHref">,
  opts?: { collection?: StoryCollectionId | null },
): string {
  const base = matchup.viewerHref || `/league/history/matchups/${matchup.matchupId}`;
  const q = new URLSearchParams({ season: String(matchup.season), week: String(matchup.week) });
  if (opts?.collection) q.set("collection", opts.collection);
  return `${base}?${q.toString()}`;
}

export function winnerLoserLabels(matchup: GalleryMatchup): {
  winner: string | null;
  loser: string | null;
  isTie: boolean;
} {
  if (!matchup.winnerPersonId) {
    const tied = matchup.homeScore === matchup.awayScore || matchup.gameType === "tie";
    return { winner: null, loser: null, isTie: tied };
  }
  const homeIsWinner = matchup.winnerPersonId === matchup.homePersonId;
  const awayIsWinner = matchup.winnerPersonId === matchup.awayPersonId;
  if (homeIsWinner) {
    return { winner: matchup.homeDisplayName, loser: matchup.awayDisplayName, isTie: false };
  }
  if (awayIsWinner) {
    return { winner: matchup.awayDisplayName, loser: matchup.homeDisplayName, isTie: false };
  }
  return {
    winner: matchup.winnerDisplayName,
    loser: null,
    isTie: false,
  };
}
