/**
 * RFSN-053E — Story Collection query wrapper.
 * Counts and rows come only from queryMatchupGallery(). No second filter engine.
 */
import {
  compileStoryCollectionFilters,
  inferStoryCollection,
  storyCollectionHref,
  STORY_COLLECTIONS,
  type StoryCollectionCompileContext,
  type StoryCollectionDefinition,
  type StoryCollectionFilters,
  type StoryCollectionId,
} from "@shared/matchupStoryCollections";
import {
  queryMatchupGallery,
  type GalleryEmptyReason,
  type GalleryFilter,
  type GalleryGameRecord,
  type GalleryQueryResult,
} from "./matchupGalleryQuery";

export type StoryCollectionSummary = StoryCollectionDefinition & {
  filters: StoryCollectionFilters;
  count: number;
  empty: boolean;
  emptyReason: GalleryEmptyReason | null;
  summary: string;
  href: string;
};

export function storyFiltersToGalleryFilter(filters: StoryCollectionFilters): GalleryFilter {
  return { ...filters };
}

export function queryStoryCollection(
  games: GalleryGameRecord[],
  id: StoryCollectionId,
  ctx: StoryCollectionCompileContext = {},
): GalleryQueryResult {
  const filters = compileStoryCollectionFilters(id, ctx);
  if (id === "blood-rival" && !filters.opponentName?.trim()) {
    const filter = storyFiltersToGalleryFilter(filters);
    return {
      filter,
      matchups: [],
      total: 0,
      summary: "Pick an opponent to open this Blood Rival collection.",
      coverage: {
        recordedGames: games.length,
        seasonFrom: games.length ? Math.min(...games.map((g) => g.season)) : null,
        seasonTo: games.length ? Math.max(...games.map((g) => g.season)) : null,
        phase: filters.phase ?? "all",
        scoringPrecision: "two_decimals",
        championshipScope: "not_requested",
        championshipNote: null,
      },
      empty: true,
      emptyReason: "unresolved_opponent",
      seeAllHref: storyCollectionHref(id, filters),
    };
  }
  return queryMatchupGallery(games, storyFiltersToGalleryFilter(filters));
}

export function listStoryCollectionSummaries(
  games: GalleryGameRecord[],
  ctx: StoryCollectionCompileContext = {},
): StoryCollectionSummary[] {
  return STORY_COLLECTIONS.map((def) => {
    const filters = compileStoryCollectionFilters(def.id, ctx);
    const result = queryStoryCollection(games, def.id, ctx);
    return {
      ...def,
      filters,
      count: result.total,
      empty: result.empty,
      emptyReason: result.emptyReason,
      summary: result.summary,
      href: storyCollectionHref(def.id, filters),
    };
  });
}

export function galleryFilterStoryCollection(filter: GalleryFilter): StoryCollectionId | null {
  return inferStoryCollection(filter);
}
