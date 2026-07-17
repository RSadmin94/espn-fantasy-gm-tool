/**
 * Shared mount for League History archive routes backed by HallOfFame.
 * Keeps one archive instance so focused History destinations don't remount queries.
 */
import { Outlet, useLocation } from "react-router";
import { HallOfFame } from "@/pages/HallOfFame";

const SCROLL_BY_PATH: Record<string, string | undefined> = {
  "/league/history": undefined,
  "/league/history/champions": "archive-championships",
  "/league/history/hall-of-fame": "archive-hof",
  "/league/history/records": "archive-records",
  "/league/history/dynasties": "archive-dynasty",
  "/league/history/timeline": "archive-milestones",
};

export function LeagueArchiveLayout() {
  const { pathname } = useLocation();
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const scrollToSection = SCROLL_BY_PATH[normalized];

  return (
    <div data-v2-league-history data-v2-league-archive-focus={scrollToSection ?? "overview"}>
      <HallOfFame scrollToSection={scrollToSection} />
      <Outlet />
    </div>
  );
}

export function LeagueArchiveFocus() {
  return null;
}
