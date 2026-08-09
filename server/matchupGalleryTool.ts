/**
 * RFSN-053D — Advisor matchup-gallery tool.
 *
 * Deterministic: classify “show me games” → queryMatchupGallery (053C contract).
 * Does not duplicate filter math. Does not invent games.
 */
import {
  CASHIER_SCORE_MIN,
  inferStoryCollection,
  storyCollectionHref,
  type StoryCollectionId,
} from "@shared/matchupStoryCollections";
import { findMentionedOwners, type AdvisorOwnerAlias } from "./advisorQuestionClassify";
import {
  type AdvisorGalleryPreset,
  type AdvisorMatchupGalleryFilters,
  type AdvisorMatchupGalleryVisual,
} from "./advisorVisual";
import {
  NO_MERCY_MARGIN,
  queryMatchupGallery,
  type GalleryFilter,
  type GalleryGameRecord,
  type GalleryQueryResult,
} from "./matchupGalleryQuery";

export const MATCHUP_GALLERY_TOOL_NAME = "query_matchup_gallery" as const;
export const ADVISOR_GALLERY_LIMIT = 50;

export type MatchupGalleryToolSelection = {
  toolName: typeof MATCHUP_GALLERY_TOOL_NAME;
  query: GalleryFilter;
  preset: AdvisorGalleryPreset;
  personal: boolean;
  collection: StoryCollectionId | null;
};

export type MatchupGalleryToolAnswer = {
  selected: true;
  toolName: typeof MATCHUP_GALLERY_TOOL_NAME;
  query: GalleryFilter;
  preset: AdvisorGalleryPreset;
  collection: StoryCollectionId | null;
  answer: string;
  visual: AdvisorMatchupGalleryVisual;
  analytics: GalleryQueryResult;
};

export type MatchupGalleryToolContext = {
  currentOwnerName?: string | null;
  resolvedOwnerNames?: string[];
  ownerAliases?: AdvisorOwnerAlias[];
  priorFilter?: GalleryFilter | null;
  priorPreset?: AdvisorGalleryPreset | string | null;
  lastIntent?: string | null;
};

const NAME_TOKEN = "[A-Za-z][A-Za-z\\-]+";

function normalize(message: string): string {
  return String(message ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleishName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/** Leaderboards stay text — never gallery. */
export function isGalleryLeaderboardAsk(t: string): boolean {
  const n = normalize(t);
  if (/\bwho has (the )?most\b/.test(n)) return true;
  if (/\bwho reaches\b/.test(n) || /\bwho (always )?reach/.test(n)) return true;
  if (/\bwho has the best record\b/.test(n)) return true;
  if (/\bwho drafts\b/.test(n) || /\bwho waits on\b/.test(n)) return true;
  if (/\bwho (always )?loves\b/.test(n) || /\bwho gambles\b/.test(n)) return true;
  if (/\bwho has more (championships|titles|rings)\b/.test(n)) return true;
  return false;
}

export function isMatchupGalleryFollowUpAsk(message: string): boolean {
  const t = normalize(message);
  if (!t || isGalleryLeaderboardAsk(t)) return false;
  if (/\bnow only\b/.test(t)) return true;
  if (/\bshow only\b/.test(t)) return true;
  if (/\bonly the\b/.test(t)) return true;
  if (/\bjust the\b/.test(t)) return true;
  if (/\bonly (20\d{2})\b/.test(t)) return true;
  if (/\bnow (just )?(20\d{2}|playoffs?|championship)\b/.test(t)) return true;
  if (/\b(playoff|championship) ones\b/.test(t)) return true;
  if (/\bfilter (to|by|for)\b/.test(t)) return true;
  if (/\bjust playoffs?\b/.test(t)) return true;
  return false;
}

function hasShowListCue(t: string): boolean {
  return (
    /\bshow me\b/.test(t) ||
    /\bshow (all|every|my|the|only)\b/.test(t) ||
    (/\bshow\b/.test(t) && /\b(vs\.?|versus)\b/.test(t)) ||
    /\bevery game\b/.test(t) ||
    /\ball (my |the )?games?\b/.test(t) ||
    /\blist (all |every |my )?/.test(t) ||
    /\bgallery\b/.test(t) ||
    /\bsee (all|every|my)\b/.test(t)
  );
}

function hasGameCue(t: string): boolean {
  return (
    /\bgames?\b/.test(t) ||
    /\bmatchups?\b/.test(t) ||
    /\bvictories\b/.test(t) ||
    /\bwins?\b/.test(t) ||
    /\blosses?\b/.test(t) ||
    /\bno mercy\b/.test(t) ||
    /\bone[-\s]?point\b/.test(t) ||
    /\bchampionship\b/.test(t) ||
    /\bplayoffs?\b/.test(t) ||
    /\bvs\.?\b/.test(t) ||
    /\bversus\b/.test(t) ||
    /\bagainst\b/.test(t) ||
    /\bclosest\b/.test(t) ||
    /\bheartbreak\b/.test(t) ||
    /\bblood rival\b/.test(t) ||
    /\bstatement wins?\b/.test(t) ||
    /\bcollapses?\b/.test(t) ||
    /\bcashier\b/.test(t) ||
    /\bbiggest\b/.test(t) ||
    /\bover \d+\s*points?\b/.test(t) ||
    /\bunder \d+\s*points?\b/.test(t) ||
    /\bfrom 20\d{2}\b/.test(t) ||
    /\bin 20\d{2}\b/.test(t) ||
    /\bgallery\b/.test(t)
  );
}

/** Planner gate: user is asking to see games, not a leaderboard. */
export function isMatchupGalleryAsk(message: string): boolean {
  const t = normalize(message);
  if (!t || isGalleryLeaderboardAsk(t)) return false;
  if (/\bwhat(?:'s| is| was)\b/.test(t) && !/\bshow\b/.test(t) && !/\bevery\b/.test(t)) {
    return false;
  }
  if (/\bwho\b/.test(t) && !/\bshow\b/.test(t)) return false;
  return hasShowListCue(t) && hasGameCue(t);
}

function parseSeasonBounds(text: string): { seasonFrom?: number; seasonTo?: number } {
  const range = text.match(/\b(20\d{2})\s*[-–—]\s*(20\d{2})\b/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return { seasonFrom: Math.min(a, b), seasonTo: Math.max(a, b) };
  }
  const from = text.match(/\b(?:from|in)\s+(20\d{2})\b/);
  if (from) {
    const y = Number(from[1]);
    return { seasonFrom: y, seasonTo: y };
  }
  const onlyYear = text.match(/\bonly\s+(20\d{2})\b/) || text.match(/\bnow only\s+(20\d{2})\b/);
  if (onlyYear) {
    const y = Number(onlyYear[1]);
    return { seasonFrom: y, seasonTo: y };
  }
  const bare = text.match(/\b(20\d{2})\b/);
  if (bare && /\b(from|in|season|only|now)\b/.test(text)) {
    const y = Number(bare[1]);
    return { seasonFrom: y, seasonTo: y };
  }
  return {};
}

function parseScoreBounds(t: string): { scoreMin?: number; scoreMax?: number } {
  const over = t.match(/\bover\s+(\d+(?:\.\d+)?)\s*points?\b/);
  const under = t.match(/\bunder\s+(\d+(?:\.\d+)?)\s*points?\b/);
  return {
    scoreMin: over ? Number(over[1]) : undefined,
    scoreMax: under ? Number(under[1]) : undefined,
  };
}

function mentionedOwnersInOrder(message: string, aliases?: AdvisorOwnerAlias[]): string[] {
  if (!aliases?.length) return [];
  const t = message.toLowerCase();
  const hits = findMentionedOwners(message, aliases);
  return hits
    .map((o) => {
      let idx = Number.POSITIVE_INFINITY;
      for (const alias of o.aliases) {
        if (alias.length < 3) continue;
        const i = t.indexOf(alias.toLowerCase());
        if (i >= 0 && i < idx) idx = i;
      }
      return { name: o.displayName, idx };
    })
    .filter((x) => Number.isFinite(x.idx))
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.name);
}

function parseOpponentName(raw: string, mentioned: string[], currentOwner?: string | null): string | undefined {
  const vs = raw.match(
    new RegExp(`\\b(?:vs\\.?|versus|against)\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)`, "i"),
  );
  const beat = raw.match(new RegExp(`\\b(?:beat|beats|beating)\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)`, "i"));
  const fromPhrase = titleishName((vs?.[1] || beat?.[1] || "").trim());
  if (fromPhrase) {
    const hit = mentioned.find((n) => n.toLowerCase().includes(fromPhrase.toLowerCase()) || fromPhrase.toLowerCase().includes(n.toLowerCase().split(" ")[0]!));
    return hit || fromPhrase;
  }
  if (mentioned.length === 1 && currentOwner && mentioned[0]!.toLowerCase() !== currentOwner.toLowerCase()) {
    return mentioned[0];
  }
  if (mentioned.length >= 2) return mentioned[1];
  return undefined;
}

function isPersonalAsk(t: string): boolean {
  return (
    /\bmy\s+(no mercy|heartbreak|closest|biggest|playoff|one[-\s]?point|statement|collapses?|cashier|wins?|losses?|games?)\b/.test(t) ||
    /\ball my\b/.test(t) ||
    /\bi beat\b/.test(t) ||
    /\bevery game i\b/.test(t) ||
    /\bgames? i\b/.test(t) ||
    /\ball games against\b/.test(t) ||
    /\bgames against\b/.test(t)
  );
}

function inferPreset(filter: GalleryFilter, personal: boolean): AdvisorGalleryPreset {
  if (filter.noMercy || (filter.marginMin != null && filter.marginMin >= NO_MERCY_MARGIN && filter.result === "win")) {
    return "no_mercy";
  }
  if (filter.championshipGames) return "championship";
  if (filter.onePoint) return "one_point";
  if (filter.sort === "closest") return "closest";
  if (filter.sort === "highest_score") return "highest";
  if (filter.sort === "lowest_score") return "lowest";
  if (filter.sort === "margin_desc" && filter.result === "win" && personal) return "biggest_wins";
  if (filter.sort === "margin_desc" && filter.result === "loss") return "biggest_losses";
  if (filter.sort === "margin_desc") return "blowouts";
  if (filter.phase === "playoffs") return "playoffs";
  if (filter.ownerName && filter.opponentName) return "h2h";
  if (filter.seasonFrom != null && filter.seasonTo === filter.seasonFrom && !filter.ownerName && !filter.opponentName) {
    return "season";
  }
  return "custom";
}

function applyThemeFromText(t: string, base: GalleryFilter): GalleryFilter {
  const next: GalleryFilter = { ...base };
  const scores = parseScoreBounds(t);
  const seasons = parseSeasonBounds(t);

  if (/\bno mercy\b/.test(t)) {
    next.noMercy = true;
    next.marginMin = NO_MERCY_MARGIN;
    if (!next.result) next.result = "win";
  }
  if (/\bheartbreak\b|\bheart break\b|\bheartbreak kids\b/.test(t)) {
    next.onePoint = true;
  }
  if (/\bone[-\s]?point\b|\b1[-\s]?point\b/.test(t)) {
    next.onePoint = true;
  }
  if (/\bstatement wins?\b|\bstatement victories\b/.test(t)) {
    next.sort = "highest_score";
    if (!next.result) next.result = "win";
  }
  if (/\bbiggest collapses?\b|\bcollapses?\b/.test(t)) {
    next.sort = "margin_desc";
    next.result = "loss";
  }
  if (/\bcashier\b|\breceipt[-\s]?worth/.test(t)) {
    next.scoreMin = CASHIER_SCORE_MIN;
    if (!next.sort) next.sort = "highest_score";
  }
  if (/\bclosest calls?\b/.test(t)) {
    next.sort = "closest";
  }
  if (/\bchampionship\b/.test(t)) {
    next.championshipGames = true;
  }
  if (/\bplayoffs?\b/.test(t) && !/\bchampionship\b/.test(t)) {
    next.phase = "playoffs";
  }
  if (/\bregular\s*season\b/.test(t)) {
    next.phase = "regular";
  }
  if (/\bclosest\b/.test(t)) {
    next.sort = "closest";
  }
  if (/\bbiggest (wins?|victories|blowouts?)\b/.test(t) || (/\bbiggest\b/.test(t) && /\bwins?\b/.test(t))) {
    next.sort = "margin_desc";
    if (!next.result && !/\bloss/.test(t)) next.result = "win";
  }
  if (/\bbiggest losses\b/.test(t) || (/\bbiggest\b/.test(t) && /\bloss/.test(t))) {
    next.sort = "margin_desc";
    next.result = "loss";
  }
  if (scores.scoreMin != null) {
    next.scoreMin = scores.scoreMin;
    if (!next.sort) next.sort = "highest_score";
  }
  if (scores.scoreMax != null) {
    next.scoreMax = scores.scoreMax;
    if (!next.sort) next.sort = "lowest_score";
  }
  if (seasons.seasonFrom != null) next.seasonFrom = seasons.seasonFrom;
  if (seasons.seasonTo != null) next.seasonTo = seasons.seasonTo;

  if (/\blosses?\b/.test(t) && !/\bwins?\b/.test(t) && !next.result) {
    next.result = "loss";
  } else if (/\b(wins?|victories|beat|beats|beating)\b/.test(t) && !/\bloss/.test(t) && !next.result) {
    if (/\bno mercy\b|\bbiggest\b|\bclosest\b|\bi beat\b/.test(t)) {
      next.result = "win";
    }
  }
  return next;
}

function mergeFollowUpFilter(prior: GalleryFilter, message: string): GalleryFilter {
  const t = normalize(message);
  return applyThemeFromText(t, { ...prior });
}

export function selectMatchupGalleryTool(
  message: string,
  ctx?: MatchupGalleryToolContext,
): MatchupGalleryToolSelection | null {
  const raw = String(message ?? "").trim();
  if (!raw) return null;
  const t = normalize(raw);
  if (isGalleryLeaderboardAsk(t)) return null;

  const prior =
    ctx?.lastIntent === "matchup_gallery" && ctx.priorFilter ? ctx.priorFilter : undefined;
  const followUp = Boolean(prior && isMatchupGalleryFollowUpAsk(raw));
  if (!followUp && !isMatchupGalleryAsk(raw)) return null;

  const fromAliases = mentionedOwnersInOrder(raw, ctx?.ownerAliases);
  const mentioned =
    fromAliases.length > 0
      ? fromAliases
      : (ctx?.resolvedOwnerNames ?? []).filter((n): n is string => Boolean(n?.trim()));
  const personal = followUp
    ? Boolean(prior?.ownerName) && (isPersonalAsk(t) || mentioned.length === 0)
    : isPersonalAsk(t);
  const current = ctx?.currentOwnerName?.trim() || undefined;

  let filter: GalleryFilter = followUp && prior ? mergeFollowUpFilter(prior, raw) : applyThemeFromText(t, {});

  if (followUp) {
    filter.limit = filter.limit ?? ADVISOR_GALLERY_LIMIT;
    const personalFollow = Boolean(
      filter.ownerName && current && filter.ownerName.toLowerCase() === current.toLowerCase(),
    );
    return {
      toolName: MATCHUP_GALLERY_TOOL_NAME,
      query: filter,
      preset: inferPreset(filter, personalFollow),
      personal: personalFollow,
      collection: inferStoryCollection(filter),
    };
  }

  const vsMatch = raw.match(
    new RegExp(`\\b(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)\\s+(?:vs\\.?|versus)\\s+(${NAME_TOKEN}(?:\\s+${NAME_TOKEN})?)`, "i"),
  );
  const vsPair = Boolean(vsMatch) || (/\bvs\.?\b|\bversus\b/.test(t) && mentioned.length >= 2);
  let ownerName = filter.ownerName;
  let opponentName = filter.opponentName;

  if (vsPair) {
    ownerName = mentioned[0] || titleishName(vsMatch?.[1] ?? "");
    opponentName = mentioned[1] || titleishName(vsMatch?.[2] ?? "");
  } else if (personal) {
    ownerName = ownerName || current || mentioned.find((n) => n !== parseOpponentName(raw, mentioned, current));
    opponentName = opponentName || parseOpponentName(raw, mentioned, current);
    if (ownerName && opponentName && ownerName.toLowerCase() === opponentName.toLowerCase()) {
      opponentName = mentioned.find((n) => n.toLowerCase() !== ownerName!.toLowerCase());
    }
  } else if (mentioned.length >= 2) {
    ownerName = mentioned[0];
    opponentName = mentioned[1];
  } else if (mentioned.length === 1 && /\bagainst\b|\bvs\.?\b|\bversus\b|\bbeat\b/.test(t)) {
    opponentName = mentioned[0];
    if (/\bme\b|\bmy\b|\bi\b/.test(t)) ownerName = current;
  } else if (mentioned.length === 1 && !/\bevery (championship|playoff|one[-\s]?point) game/.test(t)) {
    if (personal) ownerName = current || mentioned[0];
    else if (!/\bevery game\b/.test(t) || /\bmy\b/.test(t)) ownerName = mentioned[0];
  }

  if (personal && !ownerName) ownerName = current;

  filter = {
    ...filter,
    ownerName: ownerName || undefined,
    opponentName: opponentName || undefined,
    phase: filter.phase ?? "all",
    limit: ADVISOR_GALLERY_LIMIT,
  };

  const preset = inferPreset(filter, personal);
  return {
    toolName: MATCHUP_GALLERY_TOOL_NAME,
    query: filter,
    preset,
    personal,
    collection: inferStoryCollection(filter),
  };
}

export function galleryFilterToVisualFilters(filter: GalleryFilter): AdvisorMatchupGalleryFilters {
  const season =
    filter.seasonFrom != null && filter.seasonTo != null && filter.seasonFrom === filter.seasonTo
      ? filter.seasonFrom
      : undefined;
  const owner = filter.ownerName?.trim() || undefined;
  const opponent = filter.opponentName?.trim() || undefined;
  return {
    owner,
    opponent,
    ownerName: owner,
    opponentName: opponent,
    season,
    seasonFrom: filter.seasonFrom,
    seasonTo: filter.seasonTo,
    week: filter.week,
    phase: filter.phase ?? "all",
    result: filter.result,
    winsOnly: filter.result === "win" ? true : undefined,
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

export function formatGalleryAdvisorMessage(
  result: GalleryQueryResult,
  selection: MatchupGalleryToolSelection,
  currentOwnerName?: string | null,
): string {
  const summary = (result.summary ?? "").trim();
  if (!summary) {
    return result.empty
      ? "No recorded games match these filters."
      : `${result.total} recorded games.`;
  }
  const owner = selection.query.ownerName?.trim();
  const current = currentOwnerName?.trim();
  const personal =
    selection.personal &&
    owner &&
    current &&
    owner.toLowerCase() === current.toLowerCase();
  if (!personal || !owner) return summary;
  const re = new RegExp(`^${escapeRegExp(owner)}\\b`);
  if (!re.test(summary)) return summary;
  return summary.replace(re, "You").replace(/^You has\b/, "You have");
}

export async function tryMatchupGalleryToolAnswer(args: {
  leagueId: string;
  message: string;
  currentOwnerName?: string | null;
  resolvedOwnerNames?: string[];
  ownerAliases?: AdvisorOwnerAlias[];
  priorFilter?: GalleryFilter | null;
  priorPreset?: AdvisorGalleryPreset | string | null;
  lastIntent?: string | null;
  loadGames?: (leagueId: string) => Promise<GalleryGameRecord[]>;
}): Promise<MatchupGalleryToolAnswer | null> {
  const selection = selectMatchupGalleryTool(args.message, {
    currentOwnerName: args.currentOwnerName,
    resolvedOwnerNames: args.resolvedOwnerNames,
    ownerAliases: args.ownerAliases,
    priorFilter: args.priorFilter,
    priorPreset: args.priorPreset,
    lastIntent: args.lastIntent,
  });
  if (!selection) return null;

  const load =
    args.loadGames ??
    (await import("./matchupGalleryRouter")).loadGalleryGames;
  const games = await load(args.leagueId);
  const result = queryMatchupGallery(games, {
    ...selection.query,
    limit: selection.query.limit ?? ADVISOR_GALLERY_LIMIT,
  });
  const answer = formatGalleryAdvisorMessage(result, selection, args.currentOwnerName);
  const collection = inferStoryCollection(result.filter) ?? selection.collection;
  const href = collection ? storyCollectionHref(collection, result.filter) : result.seeAllHref;
  return {
    selected: true,
    toolName: MATCHUP_GALLERY_TOOL_NAME,
    query: result.filter,
    preset: selection.preset,
    collection,
    answer,
    analytics: result,
    visual: {
      type: "matchup_gallery",
      preset: selection.preset,
      filters: galleryFilterToVisualFilters(result.filter),
      result,
      href,
      ...(collection ? { collection } : {}),
    },
  };
}
