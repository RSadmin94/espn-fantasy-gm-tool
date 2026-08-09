/**
 * RFSN-053E — Advisor Story Collection visual wiring.
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const embed = readFileSync(
  join(process.cwd(), "client/src/components/matchup-gallery/AdvisorMatchupGalleryEmbed.tsx"),
  "utf8",
);
const tool = readFileSync(join(process.cwd(), "server/matchupGalleryTool.ts"), "utf8");

describe("RFSN-053E Advisor Story Collections", () => {
  it("opens Story Collections from Advisor without a second gallery", () => {
    expect(embed).toContain("StoryCollectionHeader");
    expect(embed).toContain("storyCollectionHref");
    expect(embed).toContain("MatchupGallery");
    expect(tool).toContain("inferStoryCollection");
    expect(tool).toContain("heartbreak");
    expect(tool).toContain("storyCollectionHref");
    expect(tool).not.toContain("openai");
  });
});
