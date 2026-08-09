import { describe, expect, it } from "vitest";
import { isHistoricalNarrationAsk, inferNarrationCollection, tryHistoricalNarrationToolAnswer } from "./historicalNarrationTool";
import type { GalleryGameRecord } from "./matchupGalleryQuery";

function game(over: Partial<GalleryGameRecord> = {}): GalleryGameRecord {
  return {
    matchupId: 11,
    season: 2025,
    week: 12,
    matchupPeriodId: 12,
    isPlayoff: false,
    playoffTierType: null,
    playoffKind: "none",
    homeTeamId: 1,
    awayTeamId: 2,
    homeScore: 180,
    awayScore: 120,
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    homePersonName: "Rod Sellers",
    awayPersonName: "Bruce Edwards",
    homeTeamName: "Rod FC",
    awayTeamName: "Bruce FC",
    homeLogoUrl: null,
    awayLogoUrl: null,
    winnerPersonId: "id:rod",
    ...over,
  };
}

describe("RFSN-053H advisor narration gate", () => {
  it("detects narration asks and not gallery or leaderboard asks", () => {
    expect(isHistoricalNarrationAsk("Tell me about this game.")).toBe(true);
    expect(isHistoricalNarrationAsk("Why was this important?")).toBe(true);
    expect(isHistoricalNarrationAsk("Why is this No Mercy?")).toBe(true);
    expect(isHistoricalNarrationAsk("Explain this rivalry.")).toBe(true);
    expect(isHistoricalNarrationAsk("Show me my No Mercy wins.")).toBe(false);
    expect(isHistoricalNarrationAsk("Who has the most championships?")).toBe(false);
    expect(isHistoricalNarrationAsk("Tell me about the league")).toBe(false);
    expect(inferNarrationCollection("Why is this No Mercy?")).toBe("no-mercy");
    expect(inferNarrationCollection("Explain this rivalry")).toBe("blood-rival");
    expect(inferNarrationCollection("Narrate The Cashier")).toBe("cashier");
    expect(inferNarrationCollection("Tell the story of my biggest collapse")).toBe("biggest-collapses");
    expect(inferNarrationCollection("Narrate statement wins")).toBe("statement-wins");
  });

  it("narrates a collection package without inventing a second query engine", async () => {
    const hit = await tryHistoricalNarrationToolAnswer({
      leagueId: "457622",
      message: "Why is this No Mercy?",
      currentOwnerName: "Rod Sellers",
      leagueName: "ATLANTAS FINEST FF",
      loadGames: async () => [game(), game({ matchupId: 12, week: 13, homeScore: 160, awayScore: 100 })],
      narrate: async (pkg, voice) => ({
        narration: {
          headline: "No Mercy Rule",
          subheadline: `${pkg.count} games`,
          intro: `${pkg.owners[0]} appears in this blowout collection.`,
          story: `ATLANTAS FINEST FF recorded ${pkg.count} No Mercy games including Rod Sellers and Bruce Edwards.`,
          closing: "Those are the recorded blowouts.",
          voice,
        },
        cacheHit: false,
        key: "test",
      }),
    });
    expect(hit?.toolName).toBe("narrate_historical_story");
    expect(hit?.collection).toBe("no-mercy");
    expect(hit?.visual?.type).toBe("historical_narration");
    expect(hit?.answer).toMatch(/No Mercy Rule/);
    expect(hit?.answer).not.toMatch(/1999/);
  });
});
