/**
 * RFSN-053E — Historical Story Collections.
 *
 * Deterministic catalog only. Filters compile into queryMatchupGallery().
 * No AI, no screenshots, no second gallery engine.
 * 053F–I (share cards, PNG, narration, public share) consume this catalog.
 */

export const STORY_COLLECTION_IDS = [
  "no-mercy",
  "heartbreak",
  "championship",
  "blood-rival",
  "closest-calls",
  "statement-wins",
  "biggest-collapses",
  "cashier",
] as const;

export type StoryCollectionId = (typeof STORY_COLLECTION_IDS)[number];

export type StoryCollectionIconKey =
  | "flame"
  | "heart-crack"
  | "crown"
  | "swords"
  | "target"
  | "rocket"
  | "trending-down"
  | "receipt";

export type StoryCollectionAccent =
  | "amber"
  | "rose"
  | "violet"
  | "red"
  | "sky"
  | "lime"
  | "orange"
  | "gold";

export type StoryCollectionSort =
  | "newest"
  | "oldest"
  | "closest"
  | "margin_desc"
  | "highest_score"
  | "lowest_score";

/** Same shape as GalleryFilter fields Story Collections are allowed to set. */
export type StoryCollectionFilters = {
  ownerName?: string;
  opponentName?: string;
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
  sort?: StoryCollectionSort;
  championshipGames?: boolean;
};

export type StoryCollectionDefinition = {
  id: StoryCollectionId;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  theme: {
    accent: StoryCollectionAccent;
    icon: StoryCollectionIconKey;
  };
};

export type StoryCollectionCompileContext = {
  ownerName?: string | null;
  opponentName?: string | null;
  seasonFrom?: number;
  seasonTo?: number;
};

/** Same threshold as 053B/C No Mercy / League Wire blowout. */
export const STORY_NO_MERCY_MARGIN = 50;

/** Receipt-worthy scoring floor for The Cashier (deterministic, not a record engine). */
export const CASHIER_SCORE_MIN = 150;

export const STORY_COLLECTIONS: StoryCollectionDefinition[] = [
  {
    id: "no-mercy",
    title: "No Mercy Rule",
    subtitle: "Blowouts of 50+ points",
    description: "Victory margin of 50 or more. Same threshold as League Wire blowouts.",
    badge: "NO MERCY",
    theme: { accent: "amber", icon: "flame" },
  },
  {
    id: "heartbreak",
    title: "Heartbreak Kids",
    subtitle: "Margins from 0.50–1.49",
    description: "One-point band games. Decimal scoring uses 0.50–1.49; integer scoring is exact 1.",
    badge: "HEARTBREAK",
    theme: { accent: "rose", icon: "heart-crack" },
  },
  {
    id: "championship",
    title: "Championship Glory",
    subtitle: "Proven title games only",
    description:
      "Championship-game candidates from ESPN WINNERS_BRACKET coverage. Honest empty when playoff tier is insufficient.",
    badge: "CHAMPIONSHIP",
    theme: { accent: "violet", icon: "crown" },
  },
  {
    id: "blood-rival",
    title: "Blood Rival",
    subtitle: "Head-to-head meetings",
    description: "Recorded games between two named owners. Pick both sides to open the rivalry.",
    badge: "BLOOD RIVAL",
    theme: { accent: "red", icon: "swords" },
  },
  {
    id: "closest-calls",
    title: "Closest Calls",
    subtitle: "Lowest victory margins",
    description: "Recorded games sorted by the smallest winning margin. Ties are excluded.",
    badge: "CLOSEST CALL",
    theme: { accent: "sky", icon: "target" },
  },
  {
    id: "statement-wins",
    title: "Statement Wins",
    subtitle: "Highest scoring victories",
    description: "Wins sorted by the owner’s (or winning side’s) highest score.",
    badge: "STATEMENT",
    theme: { accent: "lime", icon: "rocket" },
  },
  {
    id: "biggest-collapses",
    title: "Biggest Collapses",
    subtitle: "Largest losses",
    description: "Losses sorted by the biggest defeat margin.",
    badge: "COLLAPSE",
    theme: { accent: "orange", icon: "trending-down" },
  },
  {
    id: "cashier",
    title: "The Cashier",
    subtitle: "Receipt-worthy scoring",
    description: `Record-setting and receipt-worthy performances — games where a side scored ${CASHIER_SCORE_MIN}+.`,
    badge: "CASHIER",
    theme: { accent: "gold", icon: "receipt" },
  },
];

const BY_ID = new Map(STORY_COLLECTIONS.map((c) => [c.id, c]));

export function isStoryCollectionId(raw: string | null | undefined): raw is StoryCollectionId {
  return !!raw && (STORY_COLLECTION_IDS as readonly string[]).includes(raw);
}

export function getStoryCollection(id: StoryCollectionId): StoryCollectionDefinition {
  return BY_ID.get(id)!;
}

function ownerOf(ctx: StoryCollectionCompileContext): string | undefined {
  const n = ctx.ownerName?.trim();
  return n || undefined;
}

function opponentOf(ctx: StoryCollectionCompileContext): string | undefined {
  const n = ctx.opponentName?.trim();
  return n || undefined;
}

function seasonsOf(ctx: StoryCollectionCompileContext): Pick<StoryCollectionFilters, "seasonFrom" | "seasonTo"> {
  return {
    ...(ctx.seasonFrom != null ? { seasonFrom: ctx.seasonFrom } : {}),
    ...(ctx.seasonTo != null ? { seasonTo: ctx.seasonTo } : {}),
  };
}

/**
 * Compile a collection into queryMatchupGallery filters.
 * Does not run the query. Callers must pass the result to queryMatchupGallery().
 */
export function compileStoryCollectionFilters(
  id: StoryCollectionId,
  ctx: StoryCollectionCompileContext = {},
): StoryCollectionFilters {
  const ownerName = ownerOf(ctx);
  const opponentName = opponentOf(ctx);
  const seasons = seasonsOf(ctx);

  switch (id) {
    case "no-mercy":
      if (ownerName) {
        return {
          ownerName,
          opponentName,
          ...seasons,
          noMercy: true,
          marginMin: STORY_NO_MERCY_MARGIN,
          result: "win",
          phase: "all",
        };
      }
      return {
        opponentName,
        ...seasons,
        marginMin: STORY_NO_MERCY_MARGIN,
        phase: "all",
      };
    case "heartbreak":
      return {
        ownerName,
        opponentName,
        ...seasons,
        onePoint: true,
        phase: "all",
      };
    case "championship":
      return {
        ownerName,
        opponentName,
        ...seasons,
        championshipGames: true,
        phase: "all",
      };
    case "blood-rival":
      return {
        ownerName,
        opponentName,
        ...seasons,
        phase: "all",
      };
    case "closest-calls":
      return {
        ownerName,
        opponentName,
        ...seasons,
        sort: "closest",
        phase: "all",
      };
    case "statement-wins":
      if (ownerName) {
        return {
          ownerName,
          opponentName,
          ...seasons,
          result: "win",
          sort: "highest_score",
          phase: "all",
        };
      }
      return {
        opponentName,
        ...seasons,
        sort: "highest_score",
        phase: "all",
      };
    case "biggest-collapses":
      if (ownerName) {
        return {
          ownerName,
          opponentName,
          ...seasons,
          result: "loss",
          sort: "margin_desc",
          phase: "all",
        };
      }
      return {
        opponentName,
        ...seasons,
        sort: "margin_desc",
        phase: "all",
      };
    case "cashier":
      return {
        ownerName,
        opponentName,
        ...seasons,
        scoreMin: CASHIER_SCORE_MIN,
        sort: "highest_score",
        phase: "all",
      };
  }
}

/** Infer collection from compiled/query filters. Most specific theme wins. */
export function inferStoryCollection(filters: StoryCollectionFilters): StoryCollectionId | null {
  if (
    filters.noMercy ||
    (filters.marginMin != null && filters.marginMin >= STORY_NO_MERCY_MARGIN && filters.result === "win")
  ) {
    return "no-mercy";
  }
  if (filters.championshipGames) return "championship";
  if (filters.onePoint) return "heartbreak";
  if (filters.scoreMin != null && filters.scoreMin >= CASHIER_SCORE_MIN) return "cashier";
  if (filters.sort === "closest") return "closest-calls";
  if (filters.sort === "highest_score" && filters.result === "win") return "statement-wins";
  if (filters.sort === "margin_desc" && filters.result === "loss") return "biggest-collapses";
  if (filters.ownerName?.trim() && filters.opponentName?.trim()) return "blood-rival";
  return null;
}

export function storyCollectionPath(id: StoryCollectionId): string {
  return `/league/history/matchups/c/${id}`;
}

export function serializeStoryCollectionSearch(filters: StoryCollectionFilters): string {
  const q = new URLSearchParams();
  if (filters.ownerName?.trim()) q.set("ownerName", filters.ownerName.trim());
  if (filters.opponentName?.trim()) q.set("opponentName", filters.opponentName.trim());
  if (filters.seasonFrom != null && filters.seasonTo != null && filters.seasonFrom === filters.seasonTo) {
    q.set("season", String(filters.seasonFrom));
  } else {
    if (filters.seasonFrom != null) q.set("seasonFrom", String(filters.seasonFrom));
    if (filters.seasonTo != null) q.set("seasonTo", String(filters.seasonTo));
  }
  if (filters.week != null) q.set("week", String(filters.week));
  if (filters.phase && filters.phase !== "all") q.set("phase", filters.phase);
  if (filters.result && filters.result !== "any") q.set("result", filters.result);
  if (filters.onePoint) q.set("onePoint", "1");
  if (filters.noMercy) q.set("noMercy", "1");
  if (filters.marginMin != null) q.set("marginMin", String(filters.marginMin));
  if (filters.marginMax != null) q.set("marginMax", String(filters.marginMax));
  if (filters.scoreMin != null) q.set("scoreMin", String(filters.scoreMin));
  if (filters.scoreMax != null) q.set("scoreMax", String(filters.scoreMax));
  if (filters.championshipGames) q.set("championship", "1");
  if (filters.sort && filters.sort !== "newest") q.set("sort", filters.sort);
  return q.toString();
}

export function storyCollectionHref(id: StoryCollectionId, filters?: StoryCollectionFilters): string {
  const qs = filters ? serializeStoryCollectionSearch(filters) : "";
  return qs ? `${storyCollectionPath(id)}?${qs}` : storyCollectionPath(id);
}

export function storyCollectionHomeHref(): string {
  return "/league/history/matchups";
}
