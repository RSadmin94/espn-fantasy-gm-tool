// @vitest-environment jsdom
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { STORY_COLLECTIONS } from "@shared/matchupStoryCollections";
import type { StoryCollectionSummary } from "../../../../server/matchupStoryCollections";
import { StoryCollectionHome } from "./StoryCollectionHome";
import { StoryCollectionHeader } from "./StoryCollectionHeader";
import { HistoricalMatchupViewer } from "./HistoricalMatchupViewer";
import type { GalleryMatchup } from "../../../../server/matchupGalleryQuery";

(globalThis as { React?: typeof ReactNamespace }).React = ReactNamespace;

const mounts: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

function summary(
  over: Partial<StoryCollectionSummary> & Pick<StoryCollectionSummary, "id">,
): StoryCollectionSummary {
  const def = STORY_COLLECTIONS.find((c) => c.id === over.id)!;
  return {
    ...def,
    filters: {},
    count: 4,
    empty: false,
    emptyReason: null,
    summary: `${def.title} · 4 games`,
    href: `/league/history/matchups/c/${def.id}`,
    ...over,
  };
}

afterEach(() => {
  for (const m of mounts.splice(0)) {
    m.root.unmount();
    m.el.remove();
  }
});

describe("RFSN-053E Story Collection UI", () => {
  it("renders every collection card with badge, theme, count, and href", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    flushSync(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(StoryCollectionHome, {
            collections: STORY_COLLECTIONS.map((c) =>
              summary({
                id: c.id,
                count: c.id === "championship" ? 0 : 3,
                empty: c.id === "championship",
                emptyReason: c.id === "championship" ? "insufficient_playoff_tier" : null,
              }),
            ),
          }),
        ),
      );
    });
    expect(el.querySelector("[data-story-collections]")).toBeTruthy();
    for (const c of STORY_COLLECTIONS) {
      const card = el.querySelector(`[data-story-collection-card='${c.id}']`) as HTMLAnchorElement | null;
      expect(card, c.id).toBeTruthy();
      expect(card?.getAttribute("href")).toContain(`/league/history/matchups/c/${c.id}`);
      expect(card?.textContent).toContain(c.title);
      expect(card?.textContent).toContain(c.badge);
    }
    expect(el.querySelector("[data-story-collection-card='championship']")?.textContent).toMatch(
      /cannot be proven/i,
    );
  });

  it("viewer shows collection badge and theme without inventing narrative", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    mounts.push({ root, el });
    const matchup: GalleryMatchup = {
      matchupId: 11,
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
    };
    const collection = STORY_COLLECTIONS.find((c) => c.id === "no-mercy")!;
    flushSync(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement("div", null, [
            createElement(StoryCollectionHeader, { key: "h", collection }),
            createElement(HistoricalMatchupViewer, {
              key: "v",
              matchup,
              home: null,
              away: null,
              collection,
            }),
          ]),
        ),
      );
    });
    expect(el.querySelector("[data-story-collection='no-mercy']")).toBeTruthy();
    expect(el.querySelector("[data-collection-badge]")?.textContent).toMatch(/NO MERCY/i);
    expect(el.querySelector("[data-collection-theme='no-mercy']")).toBeTruthy();
    expect(el.querySelector("[data-matchup-viewer]")).toBeTruthy();
    expect(el.textContent?.toLowerCase()).not.toContain("ai narrative");
  });
});
