/**
 * RFSN-053H — narration consumes Story Package only (source).
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("RFSN-053H historical narration wiring", () => {
  it("narrates HistoricalStoryPackage and does not invent a second stats engine", () => {
    const pkg = read("shared/historicalStoryPackage.ts");
    const narration = read("shared/historicalNarration.ts");
    const server = read("server/historicalNarration.ts");
    const tool = read("server/historicalNarrationTool.ts");
    const planner = read("server/advisorEvidencePlanner.ts");
    const executor = read("server/advisorEvidenceExecutor.ts");
    const viewer = read("client/src/components/matchup-gallery/HistoricalMatchupViewer.tsx");
    const modal = read("client/src/components/share-cards/HistoricalShareCardModal.tsx");
    const panel = read("client/src/components/share-cards/HistoricalNarrationPanel.tsx");
    const router = read("server/routers.ts");

    expect(pkg).toContain("HistoricalStoryPackage");
    expect(pkg).toContain("matchupToStoryPackage");
    expect(pkg).toContain("collectionToStoryPackage");
    expect(narration).toContain("FACTS_JSON");
    expect(narration).toMatch(/Never invent/i);
    expect(server).toContain("narrationCacheKey");
    expect(server).toContain("NARRATION_PROMPT_VERSION");
    expect(server).toContain("narrationUsesOnlyPackageFacts");
    expect(tool).toContain("isHistoricalNarrationAsk");
    expect(planner).toContain("historical_narration");
    expect(executor).toContain("tryHistoricalNarrationToolAnswer");
    expect(viewer).toContain("HistoricalNarrationPanel");
    expect(viewer).toContain("ShareCardRenderer");
    expect(modal).toContain("HistoricalNarrationPanel");
    expect(panel).not.toMatch(/queryMatchupGallery|espn/i);
    expect(router).toContain("historicalNarrationRouter");
  });
});
