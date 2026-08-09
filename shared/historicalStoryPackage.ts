/**
 * RFSN-053H — HistoricalStoryPackage.
 * Deterministic facts only. LLM narrates this package and never computes stats.
 */
import {
  getStoryCollection,
  isStoryCollectionId,
  STORY_COLLECTION_IDS,
  type StoryCollectionId,
} from "./matchupStoryCollections";
import {
  shareBadgesFromMatchup,
  shareCardWinnerLoser,
  type ShareCardModel,
  type ShareMatchupInput,
} from "./historicalShareCard";

export const NARRATION_PROMPT_VERSION = "rfsn-053h-1";

export const NARRATION_VOICES = ["sofia", "coach", "roxanne", "cashier", "historian"] as const;
export type NarrationVoice = (typeof NARRATION_VOICES)[number];

export const HISTORICAL_STORY_TYPES = ["matchup", "collection"] as const;
export type HistoricalStoryType = (typeof HISTORICAL_STORY_TYPES)[number];

export type HistoricalStoryFactMatchup = {
  season: number;
  week: number;
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
  margin: number;
  playoff: boolean;
  championship: boolean;
  badges: string[];
};

export type HistoricalStoryPackage = {
  storyType: HistoricalStoryType;
  collection: StoryCollectionId | null;
  collectionTitle: string | null;
  collectionSubtitle: string | null;
  leagueName: string;
  owners: string[];
  season: number | null;
  week: number | null;
  winner: string | null;
  loser: string | null;
  winnerScore: number | null;
  loserScore: number | null;
  margin: number | null;
  playoff: boolean;
  championship: boolean;
  badges: string[];
  records: string[];
  historicalFacts: string[];
  featuredMatchups: HistoricalStoryFactMatchup[];
  coverageYears: { from: number | null; to: number | null };
  count: number | null;
  emptyReason: string | null;
  provenance: string[];
};

export function isNarrationVoice(raw: string | null | undefined): raw is NarrationVoice {
  return !!raw && (NARRATION_VOICES as readonly string[]).includes(raw);
}

export function parseHistoricalStoryPackage(raw: unknown): HistoricalStoryPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as HistoricalStoryPackage;
  if (!(HISTORICAL_STORY_TYPES as readonly string[]).includes(p.storyType)) return null;
  if (p.collection != null && !isStoryCollectionId(p.collection)) return null;
  if (typeof p.leagueName !== "string") return null;
  if (!Array.isArray(p.owners) || !Array.isArray(p.badges) || !Array.isArray(p.historicalFacts)) return null;
  if (!Array.isArray(p.records) || !Array.isArray(p.featuredMatchups) || !Array.isArray(p.provenance)) return null;
  if (!p.coverageYears || typeof p.coverageYears !== "object") return null;
  return p;
}

export type StoryMatchupInput = ShareMatchupInput & {
  leagueName?: string | null;
  collectionId?: StoryCollectionId | null;
  coverageYears?: { from: number | null; to: number | null };
  coverageNote?: string | null;
  records?: string[];
  provenance?: string[];
};

function uniq(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function factMatchup(m: ShareMatchupInput): HistoricalStoryFactMatchup {
  const wl = shareCardWinnerLoser(m);
  return {
    season: m.season,
    week: m.week,
    winner: wl.winner.name,
    loser: wl.loser.name,
    winnerScore: wl.winner.score,
    loserScore: wl.loser.score,
    margin: m.margin,
    playoff: m.phase === "playoffs",
    championship: m.isChampionshipGame === true,
    badges: shareBadgesFromMatchup(m),
  };
}

export function matchupToStoryPackage(input: StoryMatchupInput): HistoricalStoryPackage {
  const wl = shareCardWinnerLoser(input);
  const badges = shareBadgesFromMatchup(input);
  const collection = input.collectionId && isStoryCollectionId(input.collectionId) ? getStoryCollection(input.collectionId) : null;
  const facts = [
    `${wl.winner.name} ${wl.isTie ? "tied" : "defeated"} ${wl.loser.name}`,
    `Score ${wl.winner.score}–${wl.loser.score}`,
    `Margin ${input.margin}`,
    `${input.season} week ${input.week}`,
    input.phase === "playoffs" ? "Playoff game" : "Regular season game",
    input.isChampionshipGame ? "Proven championship game" : null,
    input.coverageNote?.trim() || null,
  ].filter((x): x is string => Boolean(x));
  return {
    storyType: "matchup",
    collection: collection?.id ?? null,
    collectionTitle: collection?.title ?? null,
    collectionSubtitle: collection?.subtitle ?? null,
    leagueName: input.leagueName?.trim() || "",
    owners: uniq([input.homeDisplayName, input.awayDisplayName, wl.winner.name, wl.loser.name]),
    season: input.season,
    week: input.week,
    winner: wl.isTie ? null : wl.winner.name,
    loser: wl.isTie ? null : wl.loser.name,
    winnerScore: wl.winner.score,
    loserScore: wl.loser.score,
    margin: input.margin,
    playoff: input.phase === "playoffs",
    championship: input.isChampionshipGame === true,
    badges,
    records: input.records ?? [],
    historicalFacts: facts,
    featuredMatchups: [factMatchup(input)],
    coverageYears: input.coverageYears ?? { from: input.season, to: input.season },
    count: 1,
    emptyReason: null,
    provenance: [
      "queryMatchupGallery",
      `matchupId:${input.matchupId}`,
      ...(collection ? [`storyCollection:${collection.id}`] : []),
      ...(input.provenance ?? []),
    ],
  };
}

export function collectionToStoryPackage(
  collectionId: StoryCollectionId,
  input: {
    count?: number | null;
    summary?: string | null;
    emptyReason?: string | null;
    coverageYears?: { from: number | null; to: number | null };
    coverageNote?: string | null;
    ownerName?: string | null;
    opponentName?: string | null;
    leagueName?: string | null;
    featured?: ShareMatchupInput[];
    records?: string[];
    provenance?: string[];
  } = {},
): HistoricalStoryPackage {
  const def = getStoryCollection(collectionId);
  const featured = (input.featured ?? []).slice(0, 5).map(factMatchup);
  const count = input.count ?? featured.length;
  const facts = [
    `${def.title}: ${def.subtitle}`,
    def.description,
    input.summary?.trim() || null,
    count != null ? `${count} recorded games` : null,
    input.emptyReason ? `Empty reason: ${input.emptyReason}` : null,
    input.coverageNote?.trim() || null,
    input.ownerName?.trim() ? `Owner ${input.ownerName.trim()}` : null,
    input.opponentName?.trim() ? `Opponent ${input.opponentName.trim()}` : null,
  ].filter((x): x is string => Boolean(x));
  return {
    storyType: "collection",
    collection: def.id,
    collectionTitle: def.title,
    collectionSubtitle: def.subtitle,
    leagueName: input.leagueName?.trim() || "",
    owners: uniq([input.ownerName, input.opponentName, ...featured.flatMap((f) => [f.winner, f.loser])]),
    season: null,
    week: null,
    winner: null,
    loser: null,
    winnerScore: null,
    loserScore: null,
    margin: null,
    playoff: featured.some((f) => f.playoff),
    championship: featured.some((f) => f.championship) || collectionId === "championship",
    badges: uniq([def.badge, ...featured.flatMap((f) => f.badges)]),
    records: input.records ?? [],
    historicalFacts: facts,
    featuredMatchups: featured,
    coverageYears: input.coverageYears ?? { from: null, to: null },
    count,
    emptyReason: input.emptyReason ?? null,
    provenance: ["queryMatchupGallery", `storyCollection:${def.id}`, ...(input.provenance ?? [])],
  };
}

export function shareCardToStoryPackage(model: ShareCardModel): HistoricalStoryPackage | null {
  if (model.type === "matchup" && model.matchup) {
    const home = model.matchup.home;
    const away = model.matchup.away;
    if (!home || !away || model.league.season == null || model.matchup.week == null) return null;
    return matchupToStoryPackage({
      matchupId: model.matchup.matchupId ?? 0,
      season: model.league.season,
      week: model.matchup.week,
      phase: model.matchup.phase === "playoffs" ? "playoffs" : "regular",
      isChampionshipGame: model.badges.includes("CHAMPIONSHIP"),
      homeDisplayName: home.name,
      awayDisplayName: away.name,
      homeScore: home.score,
      awayScore: away.score,
      margin: model.matchup.margin,
      winnerPersonId: model.matchup.winner.personId ?? null,
      homePersonId: home.personId ?? null,
      awayPersonId: away.personId ?? null,
      winnerDisplayName: model.matchup.winner.name,
      homeLogoUrl: home.logoUrl,
      awayLogoUrl: away.logoUrl,
      leagueName: model.league.name,
      collectionId: isStoryCollectionId(model.theme) ? model.theme : isStoryCollectionId(model.collection?.id) ? model.collection.id : null,
      records: model.type === "matchup" ? [] : [],
      provenance: model.provenance,
    });
  }
  if (model.type === "collection" && model.collection && isStoryCollectionId(model.collection.id)) {
    return collectionToStoryPackage(model.collection.id, {
      count: model.collection.count,
      summary: model.subtitle,
      ownerName: model.collection.ownerName,
      opponentName: model.collection.opponentName,
      leagueName: model.league.name,
      coverageYears: { from: model.league.season ?? null, to: model.league.season ?? null },
      provenance: model.provenance,
    });
  }
  return null;
}

/** Cache/hash input: facts only (no href). */
export function storyPackageHashInput(pkg: HistoricalStoryPackage): unknown {
  return {
    storyType: pkg.storyType,
    collection: pkg.collection,
    leagueName: pkg.leagueName,
    owners: pkg.owners,
    season: pkg.season,
    week: pkg.week,
    winner: pkg.winner,
    loser: pkg.loser,
    winnerScore: pkg.winnerScore,
    loserScore: pkg.loserScore,
    margin: pkg.margin,
    playoff: pkg.playoff,
    championship: pkg.championship,
    badges: pkg.badges,
    records: pkg.records,
    historicalFacts: pkg.historicalFacts,
    featuredMatchups: pkg.featuredMatchups,
    coverageYears: pkg.coverageYears,
    count: pkg.count,
    emptyReason: pkg.emptyReason,
  };
}

function numbersFromText(text: string, into: number[]): void {
  const hits = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const raw of hits) {
    const v = Number(raw);
    if (Number.isFinite(v)) into.push(v);
  }
}

export function collectPackageNumbers(pkg: HistoricalStoryPackage): number[] {
  const nums: number[] = [];
  const push = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    nums.push(n);
  };
  push(pkg.season);
  push(pkg.week);
  push(pkg.winnerScore);
  push(pkg.loserScore);
  push(pkg.margin);
  push(pkg.count);
  push(pkg.coverageYears.from);
  push(pkg.coverageYears.to);
  for (const f of pkg.featuredMatchups) {
    push(f.season);
    push(f.week);
    push(f.winnerScore);
    push(f.loserScore);
    push(f.margin);
  }
  numbersFromText(pkg.leagueName, nums);
  numbersFromText(pkg.collectionTitle ?? "", nums);
  numbersFromText(pkg.collectionSubtitle ?? "", nums);
  numbersFromText(pkg.emptyReason ?? "", nums);
  for (const b of pkg.badges) numbersFromText(b, nums);
  for (const r of pkg.records) numbersFromText(r, nums);
  for (const fact of pkg.historicalFacts) numbersFromText(fact, nums);
  return nums;
}

const ALLOWED_STORY_WORDS = new Set(
  [
    "week",
    "weeks",
    "game",
    "games",
    "matchup",
    "playoff",
    "playoffs",
    "championship",
    "regular",
    "season",
    "point",
    "points",
    "margin",
    "score",
    "victory",
    "loss",
    "tie",
    "record",
    "league",
    "fantasy",
    "football",
    "rivals",
    "no",
    "mercy",
    "heartbreak",
    "kids",
    "blood",
    "rival",
    "cashier",
    "closest",
    "calls",
    "statement",
    "wins",
    "biggest",
    "collapses",
    "glory",
    "title",
    "sofia",
    "coach",
    "roxanne",
    "historian",
    ...STORY_COLLECTION_IDS.flatMap((id) => id.split("-")),
  ].map((w) => w.toLowerCase()),
);

export function narrationAllowedNames(pkg: HistoricalStoryPackage): Set<string> {
  const names = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = (raw ?? "").trim();
    if (!t) return;
    names.add(t.toLowerCase());
    for (const part of t.split(/[\s/&,]+/)) {
      if (part.length >= 2) names.add(part.toLowerCase());
    }
  };
  add(pkg.leagueName);
  add(pkg.collectionTitle);
  add(pkg.collectionSubtitle);
  add(pkg.winner);
  add(pkg.loser);
  for (const o of pkg.owners) add(o);
  for (const b of pkg.badges) add(b);
  for (const r of pkg.records) add(r);
  for (const f of pkg.featuredMatchups) {
    add(f.winner);
    add(f.loser);
  }
  for (const fact of pkg.historicalFacts) add(fact);
  return names;
}

export function narrationUsesOnlyPackageFacts(
  pkg: HistoricalStoryPackage,
  text: string,
): { ok: boolean; invented: string[] } {
  const invented: string[] = [];
  const allowedNums = collectPackageNumbers(pkg);
  const numberHits = text.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const raw of numberHits) {
    const v = Number(raw);
    if (!Number.isFinite(v)) continue;
    if (allowedNums.some((n) => Math.abs(n - v) < 1e-9)) continue;
    invented.push(raw);
  }
  const allowedNames = narrationAllowedNames(pkg);
  const nameHits = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) ?? [];
  for (const hit of nameHits) {
    const lower = hit.toLowerCase();
    if (allowedNames.has(lower)) continue;
    const parts = lower.split(/\s+/);
    if (parts.every((p) => allowedNames.has(p) || ALLOWED_STORY_WORDS.has(p))) continue;
    invented.push(hit);
  }
  return { ok: invented.length === 0, invented };
}

