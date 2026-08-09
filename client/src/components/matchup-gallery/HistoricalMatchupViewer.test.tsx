// @vitest-environment jsdom
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { GalleryMatchup } from "../../../../server/matchupGalleryQuery";
import type { ViewerSideLineup } from "../../../../server/matchupGalleryViewer";
import { HistoricalMatchupViewer } from "./HistoricalMatchupViewer";

(globalThis as { React?: typeof ReactNamespace }).React = ReactNamespace;

const mounts: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

function matchup(): GalleryMatchup {
  return {
    matchupId: 77,
    season: 2014,
    week: 2,
    matchupPeriodId: 2,
    phase: "regular",
    playoffKind: "none",
    isChampionshipGame: false,
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    homeDisplayName: "Rod Sellers",
    awayDisplayName: "Bruce Edwards",
    homeTeamId: 1,
    awayTeamId: 2,
    homeTeamName: "Rod FC",
    awayTeamName: "Bruce FC",
    homeLogoUrl: null,
    awayLogoUrl: null,
    homeScore: 100.8,
    awayScore: 100,
    margin: 0.8,
    winnerPersonId: "id:rod",
    winnerDisplayName: "Rod Sellers",
    gameType: "nailbiter",
    viewerHref: "/league/history/matchups/77",
  };
}

function side(over: Partial<ViewerSideLineup> = {}): ViewerSideLineup {
  return {
    teamId: 1,
    ownerName: "Rod Sellers",
    teamName: "Rod FC",
    score: 100.8,
    starters: [
      { playerId: 10, playerName: "Matt Ryan", position: "QB", slotLabel: "QB", points: 22.4, isStarter: true, isBench: false },
    ],
    bench: [
      { playerId: 11, playerName: "Bench WR", position: "WR", slotLabel: "BN", points: 3.1, isStarter: false, isBench: true },
    ],
    roster: [],
    source: "gm_weekly_player_stats",
    ...over,
  };
}

afterEach(() => {
  for (const m of mounts.splice(0)) {
    m.root.unmount();
    m.el.remove();
  }
});

describe("HistoricalMatchupViewer", () => {
  it("renders score, owners, lineups, and bench without inventing a timeline", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    flushSync(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(HistoricalMatchupViewer, {
            matchup: matchup(),
            scoringPrecision: "two_decimals",
            leagueName: "ATLANTAS FINEST FF",
            home: side(),
            away: side({
              teamId: 2,
              ownerName: "Bruce Edwards",
              teamName: "Bruce FC",
              score: 100,
              starters: [
                {
                  playerId: 20,
                  playerName: "Aaron Rodgers",
                  position: "QB",
                  slotLabel: "QB",
                  points: 18,
                  isStarter: true,
                  isBench: false,
                },
              ],
              bench: [],
            }),
          }),
        ),
      );
    });
    expect(el.querySelector("[data-matchup-viewer]")).toBeTruthy();
    expect(el.querySelector("[data-share-card-open]")).toBeTruthy();
    expect(el.textContent).toContain("Rod Sellers");
    expect(el.textContent).toContain("Bruce Edwards");
    expect(el.textContent).toContain("Matt Ryan");
    expect(el.textContent).toContain("Bench WR");
    expect(el.textContent).toContain("Aaron Rodgers");
    expect(el.textContent).toContain("Starters");
    expect(el.textContent).toContain("Bench");
    expect(el.textContent).toContain("ATLANTAS FINEST FF");
    expect(el.textContent?.toLowerCase()).not.toContain("timeline");
    expect(el.textContent?.toLowerCase()).not.toContain("playback");
  });

  it("shows an honest lineup note when starter/bench slots were not recorded", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    flushSync(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(HistoricalMatchupViewer, {
            matchup: matchup(),
            lineupNote: "Player lineups were not recorded for this week.",
            home: side({ starters: [], bench: [], roster: [], source: "none" }),
            away: side({ teamId: 2, ownerName: "Bruce Edwards", starters: [], bench: [], roster: [], source: "none" }),
          }),
        ),
      );
    });
    expect(el.querySelector("[data-lineup-note]")?.textContent).toMatch(/not recorded/i);
  });
});
