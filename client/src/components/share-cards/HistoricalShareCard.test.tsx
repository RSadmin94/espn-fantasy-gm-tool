// @vitest-environment jsdom
import { createElement } from "react";
import * as ReactNamespace from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { STORY_COLLECTION_IDS } from "@shared/matchupStoryCollections";
import {
  SHARE_CARD_LAYOUTS,
  collectionToShareCard,
  matchupToShareCard,
  recordToShareCard,
  withShareCardPresentation,
  type ShareMatchupInput,
} from "@shared/historicalShareCard";
import { ShareCardRenderer } from "./HistoricalShareCard";
import { HistoricalShareCardModal } from "./HistoricalShareCardModal";

(globalThis as { React?: typeof ReactNamespace }).React = ReactNamespace;

const mounts: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

function matchup(): ShareMatchupInput {
  return {
    matchupId: 11,
    season: 2011,
    week: 1,
    phase: "regular",
    isChampionshipGame: false,
    homeDisplayName: "Rod Sellers",
    awayDisplayName: "Bruce Edwards",
    homeScore: 180,
    awayScore: 120,
    margin: 60,
    winnerPersonId: "id:rod",
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    winnerDisplayName: "Rod Sellers",
    homeLogoUrl: null,
    awayLogoUrl: null,
    gameType: "blowout",
    viewerHref: "/league/history/matchups/11",
  };
}

function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  mounts.push({ root, el });
  flushSync(() => {
    root.render(node);
  });
  return el;
}

afterEach(() => {
  for (const m of mounts.splice(0)) {
    m.root.unmount();
    m.el.remove();
  }
});

describe("ShareCardRenderer", () => {
  it("renders matchup, collection, and record from the same engine", () => {
    const matchupModel = matchupToShareCard(matchup(), { collectionId: "no-mercy", leagueName: "ATLANTAS FINEST FF" });
    const collectionModel = collectionToShareCard("heartbreak", { count: 4 });
    const recordModel = recordToShareCard({
      title: "Largest blowout",
      label: "Largest Margin",
      value: "60 pt",
      owner: "Rod Sellers",
      badges: ["LEAGUE RECORD", "NO MERCY"],
      theme: "no-mercy",
    });

    const el = render(
      createElement("div", null, [
        createElement(ShareCardRenderer, { key: "m", model: matchupModel }),
        createElement(ShareCardRenderer, { key: "c", model: collectionModel }),
        createElement(ShareCardRenderer, { key: "r", model: recordModel }),
      ]),
    );

    const cards = el.querySelectorAll("[data-share-card-root]");
    expect(cards.length).toBe(3);
    expect(el.querySelector("[data-share-card-type='matchup']")?.textContent).toContain("Rod Sellers");
    expect(el.querySelector("[data-share-card-type='matchup']")?.textContent).toContain("180");
    expect(el.querySelector("[data-share-card-type='collection']")?.textContent).toContain("Heartbreak");
    expect(el.querySelector("[data-share-card-count]")?.textContent).toMatch(/4/);
    expect(el.querySelector("[data-share-card-metric]")?.textContent).toContain("60 pt");
    expect(el.querySelector("[data-share-record-badge='NO MERCY']")).toBeTruthy();
    expect(el.querySelector("[data-share-card-theme='no-mercy']")).toBeTruthy();
    expect(el.querySelector("[data-share-card-theme='heartbreak']")).toBeTruthy();
  });

  it("renders every collection theme without extra JSX trees", () => {
    const el = render(
      createElement(
        "div",
        null,
        STORY_COLLECTION_IDS.map((id) =>
          createElement(ShareCardRenderer, { key: id, model: collectionToShareCard(id, { count: 1 }) }),
        ),
      ),
    );
    for (const id of STORY_COLLECTION_IDS) {
      expect(el.querySelector(`[data-share-card-theme='${id}']`)).toBeTruthy();
    }
  });

  it("switches layouts as renderer variants", () => {
    const base = matchupToShareCard(matchup(), { collectionId: "no-mercy" });
    const el = render(
      createElement(
        "div",
        null,
        SHARE_CARD_LAYOUTS.map((layout) =>
          createElement(ShareCardRenderer, { key: layout, model: withShareCardPresentation(base, { layout }) }),
        ),
      ),
    );
    expect(el.querySelector("[data-share-card-layout='landscape']")).toBeTruthy();
    expect(el.querySelector("[data-share-card-layout='portrait']")).toBeTruthy();
    expect(el.querySelector("[data-share-card-layout='square']")).toBeTruthy();
  });

  it("modal preview can switch theme and layout; download is enabled", () => {
    const model = matchupToShareCard(matchup(), { collectionId: "no-mercy" });
    render(createElement(HistoricalShareCardModal, { open: true, onOpenChange: () => undefined, model }));
    const root = document.body;
    expect(root.querySelector("[data-share-card-modal]")).toBeTruthy();
    expect(root.querySelector("[data-share-card-preview] [data-share-card-theme='no-mercy']")).toBeTruthy();
    expect((root.querySelector("[data-share-download]") as HTMLButtonElement | null)?.disabled).toBe(false);
    expect(root.querySelector("[data-share-copy-link]")).toBeTruthy();
    expect(root.querySelector("[data-share-scale='2']")?.getAttribute("aria-pressed")).toBe("true");

    flushSync(() => {
      (root.querySelector("[data-share-theme='cashier']") as HTMLButtonElement).click();
      (root.querySelector("[data-share-layout='square']") as HTMLButtonElement).click();
    });
    expect(root.querySelector("[data-share-card-preview] [data-share-card-theme='cashier']")).toBeTruthy();
    expect(root.querySelector("[data-share-card-preview] [data-share-card-layout='square']")).toBeTruthy();
    expect(root.querySelector("[data-share-card-preview] [data-share-card-type='matchup']")?.textContent).toContain("Rod Sellers");
  });
});
