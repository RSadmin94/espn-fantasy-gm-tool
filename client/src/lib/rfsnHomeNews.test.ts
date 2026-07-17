import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FEATURE_REGISTRY, getRouteFeatures } from "@/lib/featureRegistry";
import {
  RFSN_ROUTES,
  selectFeaturedArticle,
  selectArchiveRailArticles,
  normalizeRfsnByline,
  articleTypeLabel,
  type NewsroomArticle,
} from "@/lib/rfsnEditorial";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function article(partial: Partial<NewsroomArticle> & Pick<NewsroomArticle, "id" | "headline">): NewsroomArticle {
  return {
    season: 2025,
    articleType: "roster_construction",
    slug: "x",
    category: "news",
    body: "Body text",
    isPredicted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("rfsnHomeNews", () => {
  it("registers RFSN in production navigation", () => {
    const routes = getRouteFeatures().map((f) => f.route);
    expect(routes).toContain("/rfsn");
    const rfsn = FEATURE_REGISTRY.find((f) => f.entryType === "route" && f.id === "rfsn");
    expect(rfsn).toBeDefined();
    expect(rfsn && "navCategory" in rfsn && rfsn.navCategory).toBe("media");
  });

  it("removes League Wire nav entry", () => {
    const ids = getRouteFeatures().map((f) => f.id);
    expect(ids).not.toContain("league-wire");
    expect(getRouteFeatures().some((f) => f.route === "/league-wire")).toBe(false);
  });

  it("redirects /league-wire to canonical RFSN wire in router", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/league-wire"');
    expect(main).toContain('to="/rfsn/wire"');
  });

  it("redirects legacy article deep links preserving id", () => {
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).toContain('path: "/league-wire/article/:articleId"');
    expect(main).toContain("LegacyWireArticleRedirect");
    expect(main).toContain("/rfsn/wire/article/${articleId}");
    expect(RFSN_ROUTES.legacyWireArticle(42)).toBe("/league-wire/article/42");
    expect(RFSN_ROUTES.newsArticle(42)).toBe("/rfsn/wire/article/42");
    expect(RFSN_ROUTES.wireArticle(42)).toBe("/rfsn/wire/article/42");
    expect(RFSN_ROUTES.storiesArticle(42)).toBe("/rfsn/stories/article/42");
  });

  it("selects championship march as featured when present", () => {
    const articles = [
      article({ id: 1, headline: "Newest", articleType: "roster_construction", createdAt: "2026-02-01" }),
      article({ id: 2, headline: "Champ", articleType: "championship_march", createdAt: "2026-01-01" }),
    ];
    expect(selectFeaturedArticle(articles)?.id).toBe(2);
  });

  it("falls back to newest article when no championship march", () => {
    const articles = [
      article({ id: 1, headline: "First", createdAt: "2026-01-01" }),
      article({ id: 2, headline: "Second", createdAt: "2026-02-01" }),
    ];
    expect(selectFeaturedArticle(articles)?.id).toBe(1);
  });

  it("returns null featured story when feed is empty", () => {
    expect(selectFeaturedArticle([])).toBeNull();
  });

  it("normalizes League Wire bylines to RFSN branding", () => {
    expect(normalizeRfsnByline("League Wire Staff")).toBe("RFSN");
    expect(normalizeRfsnByline("League Wire Draft Desk")).toBe("RFSN Draft Desk");
    expect(normalizeRfsnByline(undefined)).toBe("RFSN");
  });

  it("labels article categories for home display", () => {
    expect(articleTypeLabel("championship_march")).toBe("Championship March");
    expect(articleTypeLabel("unknown_type")).toBe("League Story");
  });

  it("selects prior-season archive rail excluding featured", () => {
    const articles = [
      article({ id: 1, headline: "Current", season: 2026 }),
      article({ id: 2, headline: "Old A", season: 2024 }),
      article({ id: 3, headline: "Old B", season: 2023 }),
    ];
    const rail = selectArchiveRailArticles(articles, 1, 2);
    expect(rail.map((a) => a.id)).toEqual([2, 3]);
  });

  it("dashboard widget links to RFSN destinations", () => {
    const widget = fs.readFileSync(
      path.join(repoRoot, "client", "src", "components", "dashboard", "LeagueWireNewsFeed.tsx"),
      "utf-8",
    );
    expect(widget).toContain("RFSN");
    expect(widget).toContain('to="/rfsn"');
    expect(widget).toContain("Latest league stories and weekly coverage");
  });

  it("does not link production navigation to standalone playback", () => {
    const routes = getRouteFeatures().map((f) => f.route);
    expect(routes).not.toContain("/dev/rfsn-playback");
    const main = fs.readFileSync(path.join(repoRoot, "client", "src", "main.tsx"), "utf-8");
    expect(main).not.toContain("RfsnShadowPlayback");
    expect(main).not.toContain("/dev/rfsn-playback");
  });

  it("written News page does not render broadcast analyst booth components", () => {
    const newsroom = fs.readFileSync(
      path.join(repoRoot, "client", "src", "components", "leagueWire", "LeagueWireNewsroom.tsx"),
      "utf-8",
    );
    const rfsnNews = fs.readFileSync(path.join(repoRoot, "client", "src", "pages", "rfsn", "RfsnNews.tsx"), "utf-8");
    expect(newsroom).not.toContain("RfsnAnalystBooth");
    expect(newsroom).not.toContain("RfsnBroadcastShell");
    expect(rfsnNews).not.toContain("RfsnAnalystBooth");
    expect(rfsnNews).not.toContain("RfsnBroadcastShell");
  });

  it("RFSN internal nav always includes Home and Wire destinations", () => {
    const nav = fs.readFileSync(
      path.join(repoRoot, "client", "src", "components", "rfsn", "RfsnDestinationNav.tsx"),
      "utf-8",
    );
    expect(nav).toContain('label: "Home"');
    expect(nav).toContain('label: "Wire"');
    expect(nav).toContain('label: "Breaking"');
    expect(nav).toContain('label: "Stories"');
    expect(nav).toContain('label: "Recaps"');
    expect(nav).toContain('label: "Analysts"');
    expect(nav).toContain("RFSN_ROUTES.wire");
    expect(nav).toContain("RFSN_ROUTES.breaking");
    expect(nav).not.toContain("/rfsn/weekly");
  });

  it("RFSN internal nav omits Live by default", () => {
    const nav = fs.readFileSync(
      path.join(repoRoot, "client", "src", "components", "rfsn", "RfsnDestinationNav.tsx"),
      "utf-8",
    );
    expect(nav).toContain("showLive = false");
    expect(nav).toContain("showLive ? [...BASE_ITEMS, LIVE_ITEM] : BASE_ITEMS");
  });

  it("RFSN internal nav includes Live only when showLive is true", () => {
    const nav = fs.readFileSync(
      path.join(repoRoot, "client", "src", "components", "rfsn", "RfsnDestinationNav.tsx"),
      "utf-8",
    );
    expect(nav).toContain("RFSN_ROUTES.live");
    const home = fs.readFileSync(path.join(repoRoot, "client", "src", "pages", "rfsn", "RfsnHome.tsx"), "utf-8");
    const news = fs.readFileSync(path.join(repoRoot, "client", "src", "pages", "rfsn", "RfsnNews.tsx"), "utf-8");
    expect(home).toContain("showLive={showLiveNav}");
    expect(home).toContain("liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess");
    expect(news).toContain("showLive={showLiveNav}");
    expect(news).toContain("liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess");
  });
});
