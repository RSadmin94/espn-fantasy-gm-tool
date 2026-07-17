/** Client-only RFSN editorial helpers — no server renames. */

export type NewsroomArticle = {
  id: number;
  season: number;
  articleType: string;
  slug: string;
  category: string;
  headline: string;
  subheadline?: string;
  body: string;
  byline?: string;
  isPredicted: boolean;
  createdAt: string;
};

export const RFSN_ROUTES = {
  home: "/rfsn",
  news: "/rfsn/news",
  live: "/rfsn/live",
  wire: "/rfsn/wire",
  breaking: "/rfsn/breaking",
  stories: "/rfsn/stories",
  recaps: "/rfsn/recaps",
  analysts: "/rfsn/analysts",
  wireArticle: (id: number | string) => `/rfsn/wire/article/${id}`,
  storiesArticle: (id: number | string) => `/rfsn/stories/article/${id}`,
  /** Legacy deep-link alias — redirects to canonical wire article route. */
  newsArticle: (id: number | string) => `/rfsn/wire/article/${id}`,
  legacyWire: "/league-wire",
  legacyWireArticle: (id: number | string) => `/league-wire/article/${id}`,
} as const;

export const ARTICLE_TYPE_LABELS: Record<string, string> = {
  championship_march: "Championship March",
  keeper_preview: "Keeper Preview",
  roster_construction: "Roster Report",
  season_archive: "Season Archive",
};

export function articleTypeLabel(articleType: string): string {
  return ARTICLE_TYPE_LABELS[articleType] ?? "League Story";
}

/** Prefer championship march, else newest article in feed order. */
export function selectFeaturedArticle(articles: NewsroomArticle[]): NewsroomArticle | null {
  if (!articles.length) return null;
  const champ = articles.find((a) => a.articleType === "championship_march");
  return champ ?? articles[0] ?? null;
}

export function articleExcerpt(body: string, maxLen = 220): string {
  const text = body
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("Evidence"))
    .join(" ")
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export function normalizeRfsnByline(byline: string | undefined, fallback = "RFSN"): string {
  if (!byline?.trim()) return fallback;
  return byline
    .replace(/League Wire Draft Desk/gi, "RFSN Draft Desk")
    .replace(/League Wire Historical Staff/gi, "RFSN Historical Staff")
    .replace(/League Wire Staff/gi, "RFSN");
}

/** Prior-season stories for the home archive rail (excludes featured). */
export function selectArchiveRailArticles(
  articles: NewsroomArticle[],
  featuredId: number | null,
  max = 3,
): NewsroomArticle[] {
  if (!articles.length) return [];
  const latestSeason = Math.max(...articles.map((a) => a.season));
  return articles
    .filter((a) => a.id !== featuredId && a.season < latestSeason)
    .slice(0, max);
}
