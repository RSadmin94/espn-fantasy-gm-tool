/**
 * RFSN-053E — Story Collection gallery + viewer wiring (source).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(
  join(process.cwd(), "client/src/pages/league/HistoricalMatchupGalleryPage.tsx"),
  "utf8",
);
const embed = readFileSync(
  join(process.cwd(), "client/src/components/matchup-gallery/AdvisorMatchupGalleryEmbed.tsx"),
  "utf8",
);
const viewer = readFileSync(
  join(process.cwd(), "client/src/components/matchup-gallery/HistoricalMatchupViewer.tsx"),
  "utf8",
);
const main = readFileSync(join(process.cwd(), "client/src/main.tsx"), "utf8");

describe("RFSN-053E Story Collection wiring", () => {
  it("shows Story Collections on gallery home and reuses MatchupGallery for a collection", () => {
    expect(page).toContain("StoryCollectionHome");
    expect(page).toContain("StoryCollectionHeader");
    expect(page).toContain("MatchupGallery");
    expect(page).toContain("matchupGallery.collections");
    expect(page).toContain("compileStoryCollectionFilters");
    expect(page).not.toContain("queryMatchupGallery(");
  });

  it("routes collection paths without a second gallery page", () => {
    expect(main).toContain('path: "/league/history/matchups/c/:collectionId"');
    expect(main).toContain("HistoricalMatchupGalleryPage");
    expect(page).toContain("storyCollectionPath");
  });

  it("viewer and Advisor embed show collection badge/theme without AI narrative", () => {
    expect(viewer).toContain("data-collection-theme");
    expect(viewer).toContain("collection?.id");
    expect(page).toContain("StoryCollectionHeader");
    expect(embed).toContain("StoryCollectionHeader");
    expect(embed).toContain("storyCollectionHref");
    expect(embed).toContain("data-advisor-collection");
    expect(page.toLowerCase()).not.toMatch(/openai|anthropic|llm narrative/);
    expect(viewer.toLowerCase()).not.toMatch(/generated story|ai narrative/);
  });
});
