// @vitest-environment jsdom
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { GalleryMatchup, GalleryQueryResult } from "../../../../server/matchupGalleryQuery";
import { MatchupGallery } from "./MatchupGallery";
import { MatchupGalleryCard } from "./MatchupGalleryCard";
import { MatchupGalleryEmpty } from "./MatchupGalleryEmpty";
import type { GalleryUiFilter } from "@/lib/matchupGalleryUi";

(globalThis as { React?: typeof ReactNamespace }).React = ReactNamespace;

const mounts: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

function card(over: Partial<GalleryMatchup> = {}): GalleryMatchup {
  return {
    matchupId: over.matchupId ?? 11,
    season: 2011,
    week: 1,
    matchupPeriodId: 1,
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
    homeScore: 180,
    awayScore: 120,
    margin: 60,
    winnerPersonId: "id:rod",
    winnerDisplayName: "Rod Sellers",
    gameType: "blowout",
    viewerHref: "/league/history/matchups/11",
    ...over,
  };
}

function result(over: Partial<GalleryQueryResult> = {}): GalleryQueryResult {
  const matchups = over.matchups ?? [card()];
  return {
    filter: {},
    matchups,
    total: matchups.length,
    summary: "Rod Sellers has 1 No Mercy Rule victory (recorded regular-season and playoff matchups from 2011–2011).",
    coverage: {
      recordedGames: 20,
      seasonFrom: 2010,
      seasonTo: 2025,
      phase: "all",
      scoringPrecision: "two_decimals",
      championshipScope: "not_requested",
      championshipNote: null,
    },
    empty: false,
    emptyReason: null,
    seeAllHref: "/league/history/matchups",
    ...over,
  };
}

function renderGallery(props: Partial<Parameters<typeof MatchupGallery>[0]> = {}, filter: GalleryUiFilter = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounts.push({ root, el });
  flushSync(() => {
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(MatchupGallery, {
          title: "Matchup gallery",
          leagueName: "ATLANTAS FINEST FF",
          filter,
          result: result(),
          owners: [
            { value: "Rod Sellers", label: "Rod Sellers" },
            { value: "Bruce Edwards", label: "Bruce Edwards" },
          ],
          onFilterChange: () => undefined,
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

describe("MatchupGallery render", () => {
  it("renders default gallery header, league name, coverage, count, and cards", () => {
    const el = renderGallery();
    expect(el.querySelector("[data-matchup-gallery]")).toBeTruthy();
    expect(el.querySelector("[data-gallery-header]")?.textContent).toContain("Matchup gallery");
    expect(el.textContent).toContain("ATLANTAS FINEST FF");
    expect(el.querySelector("[data-gallery-coverage]")?.textContent).toContain("2010–2025");
    expect(el.querySelector("[data-gallery-count]")?.textContent).toMatch(/1 games/);
    expect(el.querySelector("[data-matchup-card]")?.textContent).toContain("Rod Sellers");
    expect(el.querySelector("[data-matchup-card]")?.textContent).toContain("Bruce Edwards");
    expect(el.querySelector("[data-matchup-card]")?.textContent).toContain("2011");
    expect(el.querySelector("[data-matchup-card]")?.textContent).toContain("Week 1");
    expect(el.querySelector("[data-matchup-card]")?.textContent).toContain("Rod FC");
    expect(el.querySelector("[data-badge='NO MERCY']")).toBeTruthy();
    expect(el.textContent).toContain("View Matchup");
    expect(el.querySelector("[data-share-placeholder]")).toBeTruthy();
    expect(el.querySelector("[data-screenshot-placeholder]")).toBeTruthy();
    expect((el.querySelector("[data-screenshot-placeholder]") as HTMLButtonElement | null)?.disabled).toBe(true);
    expect(el.querySelector("[data-gallery-presets]")).toBeTruthy();
    expect(el.querySelector("[data-preset='all']")).toBeTruthy();
    expect(el.querySelector("[data-preset='no-mercy']")).toBeTruthy();
    expect(el.querySelector("[data-preset='one-point']")).toBeTruthy();
    expect(el.querySelector("[data-preset='closest']")).toBeTruthy();
    expect(el.querySelector("[data-preset='championship']")).toBeTruthy();
    expect(el.querySelector("[data-preset='playoffs']")).toBeTruthy();
    expect(el.querySelector("[data-preset='highest']")).toBeTruthy();
    expect(el.querySelector("[data-preset='lowest']")).toBeTruthy();
    expect(el.querySelector("[data-preset='blowouts']")).toBeTruthy();
  });

  it("renders No Mercy preset chips and does not invent extra games", () => {
    const el = renderGallery(
      {
        title: "No Mercy Rule gallery",
        noMercyActive: true,
        result: result({
          matchups: [card(), card({ matchupId: 12, season: 2012, week: 3, awayPersonId: "id:demetri", awayDisplayName: "Demetri Clark", awayTeamName: "Demetri FC" })],
          total: 2,
        }),
      },
      { noMercy: true, ownerName: "Rod Sellers", marginMin: 50, result: "win" },
    );
    expect(el.querySelector("[data-gallery-active-filters]")?.textContent).toMatch(/NO MERCY RULE/);
    expect(el.querySelector("[data-gallery-active-filters]")?.textContent).toMatch(/Rod Sellers/);
    expect(el.querySelectorAll("[data-matchup-card]").length).toBe(2);
    expect(el.querySelector("[data-preset='no-mercy']")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders owner/opponent and phase chips from the filter contract", () => {
    const el = renderGallery(
      {},
      { ownerName: "Rod Sellers", opponentName: "Bruce Edwards", phase: "playoffs", seasonFrom: 2011, seasonTo: 2018 },
    );
    const chips = el.querySelector("[data-gallery-active-filters]")?.textContent ?? "";
    expect(chips).toContain("Owner: Rod Sellers");
    expect(chips).toContain("Opponent: Bruce Edwards");
    expect(chips).toContain("Playoffs");
    expect(chips).toContain("2011–2018");
  });

  it("renders week and championship chips from the filter contract", () => {
    const el = renderGallery({}, { week: 14, championshipGames: true, seasonFrom: 2016, seasonTo: 2016 });
    const chips = el.querySelector("[data-gallery-active-filters]")?.textContent ?? "";
    expect(chips).toContain("Week 14");
    expect(chips).toContain("Championship games");
    expect(chips).toContain("Season 2016");
    expect(el.querySelector("[data-preset='championship']")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("maps each empty state distinctly", () => {
    for (const reason of [
      "missing_dataset",
      "unresolved_owner",
      "unresolved_opponent",
      "no_matching_games",
      "insufficient_playoff_tier",
    ] as const) {
      const el = renderGallery({
        result: result({
          empty: true,
          emptyReason: reason,
          matchups: [],
          total: 0,
          summary: `server:${reason}`,
        }),
      });
      expect(el.querySelector(`[data-gallery-empty='${reason}']`)).toBeTruthy();
      expect(el.textContent).toContain(`server:${reason}`);
      expect(el.textContent?.toLowerCase()).not.toContain("no results.");
    }
  });

  it("championship badge appears only when contract isChampionshipGame is true", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    flushSync(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(MatchupGalleryCard, {
            matchup: card({
              isChampionshipGame: true,
              phase: "playoffs",
              margin: 8,
              gameType: "close",
              homeScore: 140,
              awayScore: 132,
            }),
          }),
        ),
      );
    });
    expect(el.querySelector("[data-championship='true']")).toBeTruthy();
    expect(el.querySelector("[data-badge='CHAMPIONSHIP']")).toBeTruthy();
    expect(el.querySelector("[data-badge='PLAYOFF']")).toBeTruthy();
    expect(el.querySelector("[data-badge='NO MERCY']")).toBeFalsy();
  });

  it("one-point badge uses returned margin only", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    flushSync(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(MatchupGalleryCard, {
            matchup: card({
              margin: 0.8,
              gameType: "nailbiter",
              homeScore: 100.8,
              awayScore: 100,
              isChampionshipGame: false,
            }),
            scoringPrecision: "two_decimals",
          }),
        ),
      );
    });
    expect(el.querySelector("[data-badge='ONE POINT']")).toBeTruthy();
    expect(el.querySelector("[data-badge='CHAMPIONSHIP']")).toBeFalsy();
  });

  it("closest ordering is displayed in the given contract order", () => {
    const el = renderGallery(
      {
        result: result({
          matchups: [
            card({ matchupId: 1, margin: 0.4, gameType: "nailbiter", homeScore: 100.2, awayScore: 99.8, season: 2020, week: 12 }),
            card({ matchupId: 2, margin: 0.8, gameType: "nailbiter", homeScore: 100.8, awayScore: 100, season: 2014, week: 2 }),
          ],
          total: 2,
        }),
      },
      { sort: "closest" },
    );
    const ids = [...el.querySelectorAll("[data-matchup-id]")].map((n) => n.getAttribute("data-matchup-id"));
    expect(ids).toEqual(["1", "2"]);
    expect(el.querySelector("[data-badge='CLOSEST']")).toBeTruthy();
  });

  it("does not render fake results when the contract is empty", () => {
    const el = renderGallery({
      result: result({ empty: true, emptyReason: "no_matching_games", matchups: [], total: 0, summary: "No recorded games match that filter." }),
    });
    expect(el.querySelectorAll("[data-matchup-card]").length).toBe(0);
    expect(el.querySelector("[data-gallery-empty='no_matching_games']")).toBeTruthy();
  });

  it("empty component keeps insufficient playoff tier distinct", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    flushSync(() => {
      root.render(
        createElement(MatchupGalleryEmpty, {
          reason: "insufficient_playoff_tier",
          summary: "Championship-game candidates need ESPN playoffTierType coverage.",
        }),
      );
    });
    expect(el.querySelector("[data-gallery-empty='insufficient_playoff_tier']")?.textContent).toMatch(
      /playoffTierType/i,
    );
  });
});
