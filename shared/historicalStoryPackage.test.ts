import { describe, expect, it } from "vitest";
import { STORY_COLLECTION_IDS } from "./matchupStoryCollections";
import { collectionToShareCard, matchupToShareCard, type ShareMatchupInput } from "./historicalShareCard";
import {
  NARRATION_PROMPT_VERSION,
  NARRATION_VOICES,
  collectPackageNumbers,
  collectionToStoryPackage,
  matchupToStoryPackage,
  narrationUsesOnlyPackageFacts,
  parseHistoricalStoryPackage,
  shareCardToStoryPackage,
  storyPackageHashInput,
} from "./historicalStoryPackage";
import { buildNarrationPrompt, inferNarrationVoice, parseHistoricalNarration } from "./historicalNarration";

function matchup(over: Partial<ShareMatchupInput> = {}): ShareMatchupInput {
  return {
    matchupId: 11,
    season: 2018,
    week: 9,
    phase: "regular",
    isChampionshipGame: false,
    homeDisplayName: "Rod Sellers",
    awayDisplayName: "Bruce Edwards",
    homeScore: 112.4,
    awayScore: 111.5,
    margin: 0.9,
    winnerPersonId: "id:rod",
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    winnerDisplayName: "Rod Sellers",
    viewerHref: "/league/history/matchups/11",
    ...over,
  };
}

describe("RFSN-053H HistoricalStoryPackage", () => {
  it("builds matchup and collection packages for every Story Collection", () => {
    for (const id of STORY_COLLECTION_IDS) {
      const m = matchupToStoryPackage({ ...matchup(), collectionId: id, leagueName: "ATLANTAS FINEST FF" });
      expect(parseHistoricalStoryPackage(m)?.collection).toBe(id);
      expect(m.provenance.join(" ")).toContain(`storyCollection:${id}`);
      const c = collectionToStoryPackage(id, {
        count: id === "championship" ? 0 : 4,
        summary: "Recorded collection summary.",
        emptyReason: id === "championship" ? "insufficient_playoff_tier" : null,
        ownerName: "Rod Sellers",
        opponentName: id === "blood-rival" ? "Bruce Edwards" : null,
        leagueName: "ATLANTAS FINEST FF",
        featured: id === "championship" ? [] : [matchup()],
        coverageYears: { from: 2008, to: 2025 },
      });
      expect(c.storyType).toBe("collection");
      expect(c.collection).toBe(id);
      expect(c.collectionTitle).toBeTruthy();
    }
  });

  it("share card round-trips into the same fact package family", () => {
    const fromMatchup = shareCardToStoryPackage(matchupToShareCard(matchup(), { collectionId: "heartbreak" }));
    expect(fromMatchup?.winner).toBe("Rod Sellers");
    expect(fromMatchup?.season).toBe(2018);
    const fromCollection = shareCardToStoryPackage(collectionToShareCard("cashier", { count: 70 }));
    expect(fromCollection?.collection).toBe("cashier");
    expect(fromCollection?.count).toBe(70);
  });

  it("rejects hallucinated years and unknown owners", () => {
    const pkg = matchupToStoryPackage({ ...matchup(), collectionId: "heartbreak" });
    const grounded = narrationUsesOnlyPackageFacts(
      pkg,
      "In 2018 week 9 Rod Sellers edged Bruce Edwards 112.4–111.5 by 0.9.",
    );
    expect(grounded.ok).toBe(true);
    const fakeYear = narrationUsesOnlyPackageFacts(pkg, "Back in 1999 Rod Sellers invented a dynasty.");
    expect(fakeYear.ok).toBe(false);
    expect(fakeYear.invented.join(" ")).toMatch(/1999/);
    const fakeOwner = narrationUsesOnlyPackageFacts(pkg, "Tom Brady also played in this league game.");
    expect(fakeOwner.ok).toBe(false);
    const titleCase = narrationUsesOnlyPackageFacts(
      pkg,
      "The Battle Continues\nNo Mercy Rule dominance in ATLANTAS FINEST FF.",
    );
    expect(titleCase.ok).toBe(true);
  });

  it("hash input ignores provenance wording differences that are not facts", () => {
    const a = matchupToStoryPackage({ ...matchup(), provenance: ["viewer"] });
    const b = matchupToStoryPackage({ ...matchup(), provenance: ["advisor"] });
    expect(JSON.stringify(storyPackageHashInput(a))).toBe(JSON.stringify(storyPackageHashInput(b)));
    expect(collectPackageNumbers(a)).toEqual(expect.arrayContaining([2018, 9, 112.4, 111.5, 0.9]));
  });
});

describe("RFSN-053H narration prompt integrity", () => {
  it("every voice prompt forbids new facts and embeds FACTS_JSON", () => {
    const pkg = collectionToStoryPackage("no-mercy", { count: 22, leagueName: "ATLANTAS FINEST FF" });
    for (const voice of NARRATION_VOICES) {
      const prompt = buildNarrationPrompt(pkg, voice);
      expect(prompt.promptVersion).toBe(NARRATION_PROMPT_VERSION);
      expect(prompt.system).toMatch(/NEVER compute statistics/i);
      expect(prompt.system).toMatch(/Never invent/i);
      expect(prompt.user).toContain("FACTS_JSON");
      expect(prompt.user).toContain("\"no-mercy\"");
      expect(prompt.user).toContain("22");
    }
  });

  it("infers voices from user wording and defaults to Sofia", () => {
    expect(inferNarrationVoice("Explain this rivalry as Roxanne")).toBe("roxanne");
    expect(inferNarrationVoice("Narrate this like an old-school coach")).toBe("coach");
    expect(inferNarrationVoice("Cashier receipt voice please")).toBe("cashier");
    expect(inferNarrationVoice("NFL Films historian")).toBe("historian");
    expect(inferNarrationVoice("Why is this No Mercy?")).toBe("sofia");
  });

  it("parses JSON narration and ignores extra prose wrapping", () => {
    const parsed = parseHistoricalNarration(
      'Here you go\n{"headline":"No Mercy","subheadline":"Blowout","intro":"The margin was 60.","story":"Rod Sellers beat Bruce Edwards 180 to 120.","closing":"That is the record.","quote":"60 points"}\n',
      "sofia",
    );
    expect(parsed?.headline).toBe("No Mercy");
    expect(parsed?.voice).toBe("sofia");
    expect(parsed?.quote).toBe("60 points");
  });
});
