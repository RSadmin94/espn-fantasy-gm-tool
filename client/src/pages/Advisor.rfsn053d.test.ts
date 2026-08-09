/**
 * RFSN-053D — Advisor visual gallery embed wiring (layout only).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const advisor = readFileSync(join(process.cwd(), "client/src/pages/Advisor.tsx"), "utf8");
const embed = readFileSync(
  join(process.cwd(), "client/src/components/matchup-gallery/AdvisorMatchupGalleryEmbed.tsx"),
  "utf8",
);
const stream = readFileSync(join(process.cwd(), "server/advisorStreamHandler.ts"), "utf8");

describe("RFSN-053D Advisor gallery visual wiring", () => {
  it("embeds the existing MatchupGallery under chat text", () => {
    expect(advisor).toContain("AdvisorMatchupGalleryEmbed");
    expect(advisor).toContain("resp.visual");
    expect(advisor).toContain('visual?.type === "matchup_gallery"');
    expect(embed).toContain("MatchupGallery");
    expect(embed).toContain("data-advisor-visual");
    expect(embed).toContain("data-open-full-gallery");
    expect(embed).toContain("/league/history/matchups");
    expect(embed).toContain("Open Full Gallery");
    expect(embed).toContain("serializeGallerySearchParams");
    expect(embed).toContain("trpc.matchupGallery.query");
    expect(embed).toContain("enabled: ready && filterChanged");
  });

  it("streams visual on deterministic done.meta without navigating away", () => {
    expect(stream).toContain("visual");
    expect(stream).toContain("done: true");
    expect(advisor).not.toContain('navigate("/league/history/matchups")');
  });

  it("Clear still resets the Advisor session chrome", () => {
    expect(advisor).toContain("resetAdvisorConversationUi");
    expect(advisor).toContain("data-rfsn-052l");
  });
});
