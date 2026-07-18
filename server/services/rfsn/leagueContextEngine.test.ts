/**
 * Sprint 9 Phase 1 — League Context Engine tests.
 * Proves evidence-backed facts only; no invented history.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { normalizePlayerKey } from "../../draftEngine/phase1/types";
import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";
import { shareContextForVoices } from "./analystExchange";
import { passesAirRule } from "./historicalContext";
import { shouldTriggerHistoricalContext } from "./historicalTrigger";
import { scoreNarrativeHeat } from "./narrativeHeat";
import {
  type LeagueContextSnapshot,
  resetLeagueContextCacheForTests,
  seedLeagueContextCache,
} from "./leagueContextCache";
import { enrichMomentWithSnapshot } from "./leagueContextEngine";
import {
  collectChampionshipContext,
  collectHistoricalContexts,
  collectPlayerConnectionContext,
  collectRivalryContext,
} from "./historicalPatterns";
import { findStoryThread, listStoryThreads, resetStoryThreadsForTests } from "./storyThreads";

function baseMoment(over: Partial<BroadcastMoment> & { ownerName?: string; playerName?: string; position?: string } = {}): BroadcastMoment {
  const ownerName = over.ownerName ?? "Rod Sellers";
  const playerName = over.playerName ?? "Lamar Jackson";
  const position = over.position ?? "QB";
  return {
    identity: {
      kind: "draft_pick",
      draftId: "draft-1",
      pickNumber: 12,
      pickId: "evt-12",
    },
    momentType: "draft_pick",
    significance: over.significance ?? "notable",
    headline: null,
    context: { kind: "none" },
    factPacket: {
      subject: {
        ownerName,
        playerName,
        position,
        overallPick: 12,
        round: 1,
        roundPick: 12,
      },
      verifiedFacts: [`${ownerName} selected ${playerName} (${position}) at pick 12, round 1.`],
      storylines: [],
      entities: [ownerName, playerName],
    },
    commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    signals: over.signals ?? [],
    storylines: [],
    receipts: [],
    primaryStoryline: null,
    reachClassification: over.reachClassification ?? null,
    ...over,
  };
}

function fixtureSnapshot(over: Partial<LeagueContextSnapshot> = {}): LeagueContextSnapshot {
  return {
    leagueId: "457622",
    draftId: "draft-1",
    loadedAt: Date.now(),
    championships: [
      {
        ownerKey: "guid:rod",
        displayName: "Rod Sellers",
        titles: 2,
        titleSeasons: [2019, 2023],
      },
    ],
    choices: [
      {
        season: 2022,
        round: 2,
        overallPick: 18,
        ownerKey: "guid:rod",
        ownerDisplayName: "Rod Sellers",
        playerKey: normalizePlayerKey("Lamar Jackson"),
        playerName: "Lamar Jackson",
        position: "QB",
      },
      {
        season: 2023,
        round: 1,
        overallPick: 8,
        ownerKey: "guid:rod",
        ownerDisplayName: "Rod Sellers",
        playerKey: normalizePlayerKey("Josh Allen"),
        playerName: "Josh Allen",
        position: "QB",
      },
      {
        season: 2024,
        round: 1,
        overallPick: 5,
        ownerKey: "guid:rod",
        ownerDisplayName: "Rod Sellers",
        playerKey: normalizePlayerKey("Jalen Hurts"),
        playerName: "Jalen Hurts",
        position: "QB",
      },
      {
        season: 2021,
        round: 3,
        overallPick: 30,
        ownerKey: "guid:rod",
        ownerDisplayName: "Rod Sellers",
        playerKey: normalizePlayerKey("Mark Andrews"),
        playerName: "Mark Andrews",
        position: "TE",
      },
    ],
    rivalries: [
      {
        focalOwnerName: "Rod Sellers",
        rivalOwnerName: "Bruce Wayne",
        h2hRecord: "14-7",
        rivalWins: 14,
        rivalLosses: 7,
        playoffEliminations: 3,
        heatLabel: "Inferno",
      },
    ],
    ...over,
  };
}

describe("leagueContextEngine Phase 1", () => {
  beforeEach(() => {
    resetLeagueContextCacheForTests();
    resetStoryThreadsForTests();
  });

  it("1. retrieves owner championship history from HoF leaderboard (GUID-keyed)", () => {
    const snap = fixtureSnapshot();
    const ctx = collectChampionshipContext(baseMoment({ ownerName: "Rod Sellers" }), snap);
    expect(ctx).not.toBeNull();
    expect(ctx!.narrativeType).toBe("championship");
    expect(ctx!.evidence[0]?.source).toBe("espn.hallOfFame");
    expect(ctx!.evidence[0]?.ref).toContain("guid:rod");
    expect(ctx!.fact).toMatch(/2 championship/);
    expect(ctx!.confidence).toBeGreaterThanOrEqual(0.98);
  });

  it("2. retrieves rival H2H + aggregate playoff eliminations", () => {
    const snap = fixtureSnapshot();
    const ctx = collectRivalryContext(baseMoment({ ownerName: "Bruce Wayne" }), snap);
    expect(ctx).not.toBeNull();
    expect(ctx!.narrativeType).toBe("rivalry");
    expect(ctx!.fact).toMatch(/14-7/);
    expect(ctx!.fact).toMatch(/3 times/);
    expect(ctx!.fact).not.toMatch(/last playoffs/i);
  });

  it("3. championship refs stay GUID/ownerKey-backed", () => {
    const snap = fixtureSnapshot();
    const ctx = collectChampionshipContext(baseMoment(), snap)!;
    expect(ctx.evidence.every((e) => e.ref.includes("guid:rod"))).toBe(true);
  });

  it("4. no invented history — empty evidence yields no verifiedFact inject", () => {
    const empty = fixtureSnapshot({ championships: [], choices: [], rivalries: [] });
    const moment = baseMoment({
      significance: "major",
      reachClassification: null,
      signals: [],
    });
    const { moment: enriched, aired, all } = enrichMomentWithSnapshot(moment, empty, {
      leagueId: "457622",
      draftId: "draft-1",
    });
    expect(all).toEqual([]);
    expect(aired).toEqual([]);
    expect(enriched.factPacket.verifiedFacts).toEqual(moment.factPacket.verifiedFacts);
    expect(enriched.leagueContext ?? []).toEqual([]);
  });

  it("5. historical trigger skips routine picks", () => {
    expect(shouldTriggerHistoricalContext("routine")).toBe(false);
    expect(shouldTriggerHistoricalContext("notable")).toBe(true);
    const snap = fixtureSnapshot();
    const { aired, all } = enrichMomentWithSnapshot(baseMoment({ significance: "routine" }), snap, {
      leagueId: "457622",
      draftId: "draft-1",
    });
    expect(all).toEqual([]);
    expect(aired).toEqual([]);
  });

  it("6. routine picks stay quiet even with rich history", () => {
    const snap = fixtureSnapshot();
    seedLeagueContextCache(snap);
    const before = baseMoment({ significance: "routine" }).factPacket.verifiedFacts.length;
    const { moment } = enrichMomentWithSnapshot(baseMoment({ significance: "routine" }), snap, {
      leagueId: "457622",
      draftId: "draft-1",
    });
    expect(moment.factPacket.verifiedFacts).toHaveLength(before);
  });

  it("7. story threads persist across picks", () => {
    const snap = fixtureSnapshot();
    const m1 = baseMoment({
      identity: { kind: "draft_pick", draftId: "draft-1", pickNumber: 12, pickId: "e12" },
      significance: "major",
    });
    enrichMomentWithSnapshot(m1, snap, { leagueId: "457622", draftId: "draft-1" });
    const m2 = baseMoment({
      identity: { kind: "draft_pick", draftId: "draft-1", pickNumber: 25, pickId: "e25" },
      significance: "major",
      playerName: "Josh Allen",
      position: "QB",
    });
    enrichMomentWithSnapshot(m2, snap, { leagueId: "457622", draftId: "draft-1" });
    const threads = listStoryThreads("457622", "draft-1");
    expect(threads.length).toBeGreaterThan(0);
    const champ = findStoryThread("457622", "draft-1", "Rod Sellers", "championship");
    expect(champ).not.toBeNull();
    expect(champ!.airCount).toBeGreaterThanOrEqual(2);
  });

  it("8. analyst exchange hands ONE shared context to all voices", () => {
    const snap = fixtureSnapshot();
    const all = collectHistoricalContexts(baseMoment({ significance: "major" }), snap);
    const aired = all.filter((c) => passesAirRule(c));
    const shared = shareContextForVoices({ aired, benched: all.filter((c) => !passesAirRule(c)) });
    const forSofia = shared.aired;
    const forCoach = shared.aired;
    const forRoxanne = shared.aired;
    expect(forSofia).toBe(forCoach);
    expect(forCoach).toBe(forRoxanne);
    expect(forSofia.map((c) => c.fact)).toEqual(aired.map((c) => c.fact));
  });

  it("9. heat gate benches low-heat true facts", () => {
    const lowHeatTrue = {
      fact: "Rod selected a random TE in 2018 round 9.",
      evidence: [{ source: "choiceLedger", ref: "x" }],
      confidence: 0.85,
      significance: 0.5,
      narrativeType: "player_connection" as const,
      narrativeHeat: 20,
    };
    expect(passesAirRule(lowHeatTrue)).toBe(false);
  });

  it("10. high-heat championship fires", () => {
    const heat = scoreNarrativeHeat("championship", { titleCount: 2 });
    expect(heat).toBeGreaterThanOrEqual(85);
    const snap = fixtureSnapshot();
    const ctx = collectChampionshipContext(baseMoment({ significance: "major" }), snap)!;
    expect(passesAirRule(ctx)).toBe(true);
    const { aired } = enrichMomentWithSnapshot(baseMoment({ significance: "major" }), snap, {
      leagueId: "457622",
      draftId: "draft-1",
    });
    expect(aired.some((c) => c.narrativeType === "championship")).toBe(true);
  });

  it("player_connection is evidence-backed via normalizePlayerKey", () => {
    const snap = fixtureSnapshot();
    const ctx = collectPlayerConnectionContext(
      baseMoment({ playerName: "Lamar Jackson", significance: "notable" }),
      snap,
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.narrativeType).toBe("player_connection");
    expect(ctx!.fact).toMatch(/previously selected Lamar Jackson/);
    expect(ctx!.evidence[0]?.source).toBe("choiceLedger");
  });

  it("enrich injects aired facts into verifiedFacts without commentary", () => {
    const snap = fixtureSnapshot();
    const { moment, aired } = enrichMomentWithSnapshot(baseMoment({ significance: "major" }), snap, {
      leagueId: "457622",
      draftId: "draft-1",
    });
    expect(aired.length).toBeGreaterThan(0);
    for (const c of aired) {
      expect(moment.factPacket.verifiedFacts).toContain(c.fact);
      // Engine must not emit interpretive personality lines
      expect(c.fact).not.toMatch(/refuses to let go|being Rod|waiting for the ending/i);
    }
  });
});
