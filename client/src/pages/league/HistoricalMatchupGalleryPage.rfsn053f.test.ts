/**
 * RFSN-053F — Share Card surface adapters (source).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const model = read("shared/historicalShareCard.ts");
const renderer = read("client/src/components/share-cards/HistoricalShareCard.tsx");
const modal = read("client/src/components/share-cards/HistoricalShareCardModal.tsx");
const button = read("client/src/components/share-cards/HistoricalShareCardButton.tsx");
const viewer = read("client/src/components/matchup-gallery/HistoricalMatchupViewer.tsx");
const galleryCard = read("client/src/components/matchup-gallery/MatchupGalleryCard.tsx");
const embed = read("client/src/components/matchup-gallery/AdvisorMatchupGalleryEmbed.tsx");
const home = read("client/src/components/matchup-gallery/StoryCollectionHome.tsx");
const header = read("client/src/components/matchup-gallery/StoryCollectionHeader.tsx");
const hof = read("client/src/pages/HallOfFame.tsx");
const rivalry = read("client/src/pages/RivalryCenter.tsx");
const rivalrySummary = read("client/src/components/RivalrySummaryCard.tsx");

describe("RFSN-053F Share Card wiring", () => {
  it("keeps one model and one renderer", () => {
    expect(model).toContain("export type ShareCardModel");
    expect(model).toContain('type: ShareCardType');
    expect(model).toContain("provenance?: string[]");
    expect(renderer).toContain("export function ShareCardRenderer");
    expect(renderer).toContain("data-share-card-root");
    expect(renderer).not.toMatch(/openai|anthropic|ai narration/i);
    expect(modal).toContain("withShareCardPresentation");
    expect(modal).toContain("data-share-download");
    expect(modal).toContain("/api/share-card/png");
    expect(button).toContain("data-share-card-open");
  });

  it("surfaces only adapt data — no second card engines", () => {
    for (const [name, src] of [
      ["viewer", viewer],
      ["gallery", galleryCard],
      ["advisor", embed],
      ["collections home", home],
      ["collections header", header],
      ["hof", hof],
      ["rivalry", rivalry],
      ["rivalry summary", rivalrySummary],
    ] as const) {
      expect(src, name).toContain("HistoricalShareCardButton");
      expect(src, name).not.toMatch(/html2canvas|dom-to-image|sharp\(|puppeteer/i);
    }
    expect(viewer).toContain("matchupToShareCard");
    expect(galleryCard).toContain("matchupToShareCard");
    expect(embed).toContain("collectionToShareCard");
    expect(home).toContain("collectionToShareCard");
    expect(header).toContain("collectionToShareCard");
    expect(hof).toContain("recordToShareCard");
    expect(rivalry).toContain('collectionToShareCard("blood-rival"');
    expect(rivalrySummary).toContain('collectionToShareCard("blood-rival"');
  });
});
