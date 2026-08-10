import { afterEach, describe, expect, it } from "vitest";
import { collectionToStoryPackage, matchupToStoryPackage } from "@shared/historicalStoryPackage";
import { NARRATION_EXPORT_ERROR, narrationCorpus } from "@shared/historicalNarration";
import {
  clearHistoricalNarrationCacheForTests,
  narrateHistoricalStory,
  narrationCacheKey,
  setHistoricalNarrationLlmForTests,
} from "./historicalNarration";
import type { ShareMatchupInput } from "@shared/historicalShareCard";

function matchup(): ShareMatchupInput {
  return {
    matchupId: 44,
    season: 2025,
    week: 12,
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
  };
}

afterEach(() => {
  setHistoricalNarrationLlmForTests(null);
  clearHistoricalNarrationCacheForTests();
});

describe("RFSN-053H narration cache", () => {
  it("does not regenerate identical package+voice", async () => {
    let calls = 0;
    setHistoricalNarrationLlmForTests(async (pkg, voice) => {
      calls += 1;
      return {
        headline: `${pkg.collectionTitle || "Matchup"}`,
        subheadline: `${pkg.count ?? 1} games`,
        intro: `${pkg.winner ?? pkg.owners[0]} scored ${pkg.winnerScore ?? 180}.`,
        story: `Rod Sellers beat Bruce Edwards 180 to 120 by 60 in 2025 week 12.`,
        closing: "That is the recorded result.",
        voice,
      };
    });
    const pkg = matchupToStoryPackage({ ...matchup(), collectionId: "no-mercy", leagueName: "ATLANTAS FINEST FF" });
    const first = await narrateHistoricalStory(pkg, "sofia");
    const second = await narrateHistoricalStory(pkg, "sofia");
    expect(calls).toBe(1);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(first.key).toBe(second.key);
    expect(narrationCacheKey(pkg, "roxanne")).not.toBe(first.key);
  });

  it("rejects hallucinated LLM copy and does not cache it", async () => {
    setHistoricalNarrationLlmForTests(async (_pkg, voice) => ({
      headline: "Ancient history",
      subheadline: "1999",
      intro: "In 1999 Tom Brady arrived.",
      story: "The 1999 season invented this rivalry.",
      closing: "Never forget 1999.",
      voice,
    }));
    const pkg = collectionToStoryPackage("cashier", { count: 70, leagueName: "ATLANTAS FINEST FF" });
    await expect(narrateHistoricalStory(pkg, "cashier")).rejects.toThrow(NARRATION_EXPORT_ERROR);
    const retryCalls = { n: 0 };
    setHistoricalNarrationLlmForTests(async (p, voice) => {
      retryCalls.n += 1;
      return {
        headline: "The Cashier",
        subheadline: `${p.count} games`,
        intro: "Seventy receipt-worthy games.",
        story: `ATLANTAS FINEST FF has ${p.count} Cashier games.`,
        closing: "The receipt is closed.",
        voice,
      };
    });
    const ok = await narrateHistoricalStory(pkg, "cashier");
    expect(retryCalls.n).toBe(1);
    expect(ok.cacheHit).toBe(false);
    expect(ok.narration.headline).toBe("The Cashier");
  });

  it("keeps 58.4 / 2025 / week 12 identical across voices and caches the same voice", async () => {
    let calls = 0;
    setHistoricalNarrationLlmForTests(async (pkg, voice) => {
      calls += 1;
      const facts = `Season ${pkg.season}. Week ${pkg.week}. Margin: ${pkg.margin}. Score ${pkg.winnerScore}–${pkg.loserScore}.`;
      if (voice === "historian") {
        return { headline: "Decisive chapter", subheadline: "Week 12", intro: "Week 12 marked one of the most decisive victories in league history.", story: facts, closing: "The record stands.", voice };
      }
      if (voice === "cashier") {
        return { headline: "Receipt", subheadline: "58.4", intro: "Receipt printed. Margin: 58.4. Payment collected.", story: facts, closing: "Closed.", voice };
      }
      return { headline: "Finish", subheadline: "Week 12", intro: "That's how you finish a football game.", story: facts, closing: "That's the tape.", voice };
    });
    const pkg = matchupToStoryPackage({
      ...matchup(),
      homeScore: 162.8,
      awayScore: 104.4,
      margin: 58.4,
      collectionId: "no-mercy",
      leagueName: "ATLANTAS FINEST FF",
    });
    const historian = await narrateHistoricalStory(pkg, "historian");
    const cashier = await narrateHistoricalStory(pkg, "cashier");
    const coach = await narrateHistoricalStory(pkg, "coach");
    const historianAgain = await narrateHistoricalStory(pkg, "historian");
    expect(calls).toBe(3);
    expect(historianAgain.cacheHit).toBe(true);
    expect(historian.narration.intro).not.toBe(cashier.narration.intro);
    expect(cashier.narration.intro).not.toBe(coach.narration.intro);
    for (const n of [historian, cashier, coach]) {
      const corpus = narrationCorpus(n.narration);
      expect(corpus).toMatch(/2025/);
      expect(corpus).toMatch(/\b12\b/);
      expect(corpus).toMatch(/58\.4/);
      expect(corpus).not.toMatch(/\b1999\b/);
    }
  });
});
