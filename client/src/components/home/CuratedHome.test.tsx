// @vitest-environment jsdom
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getV2NavHref, V2_DESTINATIONS } from "@/lib/v2Navigation";

(globalThis as { React?: typeof ReactNamespace }).React = ReactNamespace;

vi.mock("@/components/RivalrySummaryCard", () => ({
  RivalrySummaryCard: () => createElement("div", { "data-testid": "rival-card" }, "rivalry snapshot"),
}));

vi.mock("@/components/dashboard/LeagueWireNewsFeed", () => ({
  LeagueWireNewsFeed: () => createElement("div", { "data-testid": "rfsn-feed" }, "rfsn lead"),
}));

vi.mock("@/components/dashboard/DashboardRecentLeagueEvents", () => ({
  DashboardRecentLeagueEvents: () => createElement("div", { "data-testid": "events" }, "events"),
}));

import { CuratedHome } from "@/components/home/CuratedHome";

const mounts: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

function renderHome(props: Partial<Parameters<typeof CuratedHome>[0]> = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounts.push({ root, el });
  flushSync(() => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(CuratedHome, {
          welcomeName: "Rod",
          leagueName: "Atlanta's Finest",
          weekLabel: "Season 2026 · Week 3",
          season: 2026,
          briefingParagraph: "Your league needs attention this week.",
          briefingActionLabel: "Open matchups",
          briefingActionHref: "/matchups",
          recordLine: "2-1",
          rankLine: "#4",
          nextMatchupLine: "vs Rival Owner",
          rosterAlertLine: null,
          rivalName: "Rival Owner",
          rivalInsight: "Heated rivalry",
          leagueMovementLine: "2 recent roster moves reshaped league rosters.",
          eventSeasons: [2026],
          showRecentEvents: false,
          ...props,
        }),
      ),
    );
  });
  return el;
}

afterEach(() => {
  for (const m of mounts.splice(0)) {
    m.root.unmount();
    m.el.remove();
  }
});

describe("CuratedHome", () => {
  it("renders the curated Home structure with primary action links", () => {
    const el = renderHome();
    expect(el.querySelector("[data-v2-home]")).toBeTruthy();
    expect(el.textContent).toContain("Welcome back, Rod");
    expect(el.textContent).toContain("Your league needs attention this week.");
    expect(el.textContent).toContain("Team Pulse");
    expect(el.textContent).toContain("Rival Watch");
    expect(el.textContent).toContain("Lead Story");
    expect(el.textContent).toContain("League Movement");
    expect(el.textContent).toContain("Jump Back In");
    expect(el.querySelector('[data-testid="rival-card"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="rfsn-feed"]')).toBeTruthy();

    const hrefs = Array.from(el.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/matchups");
    expect(hrefs).toContain("/my-team/roster");
    expect(hrefs).toContain("/my-team/matchup");
    expect(hrefs).toContain("/rivals/rivalries");
    expect(hrefs).toContain("/rivals/owners");
    expect(hrefs).toContain("/rfsn/wire");
    expect(hrefs).toContain("/league/standings");
    expect(hrefs).toContain("/draft/live");
  });

  it("renders safely with partial or empty pulse data", () => {
    const el = renderHome({
      recordLine: null,
      rankLine: null,
      nextMatchupLine: null,
      rosterAlertLine: null,
      rivalName: null,
      rivalInsight: null,
      leagueMovementLine: null,
      showRecentEvents: false,
      briefingParagraph: "Connect and sync to unlock league intelligence.",
      briefingActionLabel: "Sync Data",
      briefingActionHref: "/sync",
    });
    expect(el.querySelector("[data-v2-home]")).toBeTruthy();
    expect(el.textContent).toContain("Connect and sync");
    expect(el.textContent).not.toContain("Team Pulse");
    expect(el.textContent).not.toContain("League Movement");
    expect(el.textContent).toContain("Rival Watch");
    expect(el.textContent).toContain("Jump Back In");
    expect(el.querySelector('a[href="/sync"]')).toBeTruthy();
  });

  it("keeps Home nav pointed at /home", () => {
    const home = V2_DESTINATIONS.find((d) => d.id === "home")!;
    expect(getV2NavHref(home)).toBe("/home");
  });
});
