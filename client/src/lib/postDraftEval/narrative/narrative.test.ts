import { describe, expect, it } from "vitest";
import {
  EVALUATOR_VERSION,
  NARRATIVE_SYSTEM_PROMPT,
  NARRATIVE_VERSION,
  assertGrounded,
  buildFallbackNarrative,
  compactFactsForLlm,
  compactFactsSize,
  collapsesMissAndTurningPoint,
  groundNarrative,
  awardCardBody,
  narrativeCacheMaterial,
  storytellingAllowed,
  type NarrativeFacts,
  type NarrativePickFact,
} from "./index";

function pick(
  partial: Partial<NarrativePickFact> & Pick<NarrativePickFact, "overallPick" | "actualName" | "rivalsName">,
): NarrativePickFact {
  const rivalsName = partial.rivalsName;
  const rivalsPos = partial.rivalsPos ?? "RB";
  return {
    round: 1,
    roundPick: 1,
    isKeeper: false,
    actualPos: "WR",
    rivalsPos,
    kind: "preferred",
    sameAsRivals: false,
    grade: "C+",
    confidence: "MEDIUM",
    availabilityConfidence: "HIGH",
    reasons: ["FILLS_RB2"],
    why: "Fills RB2 before a tier cliff.",
    impact: ["NEED_RB"],
    otherOptions: ["Kenneth Walker"],
    availableTop: ["Kenneth Walker", "Deebo Samuel"],
    rosterBefore: [],
    openNeeds: ["RB"],
    survivesUntilNextPick: true,
    commentaryWeight: "major",
    importance: "MAJOR",
    laterChase: null,
    passedNeedsEarlier: [],
    sequentialSameAsOriginal: false,
    ...partial,
    independentRivalsName: partial.independentRivalsName ?? partial.rivalsName,
    independentRivalsPos: partial.independentRivalsPos ?? partial.rivalsPos ?? rivalsPos,
    sequentialRedraftName: partial.sequentialRedraftName ?? partial.rivalsName,
    sequentialRedraftPos: partial.sequentialRedraftPos ?? partial.rivalsPos ?? rivalsPos,
  };
}

function sampleFacts(overrides: Partial<NarrativeFacts> = {}): NarrativeFacts {
  const same = pick({
    overallPick: 1,
    round: 1,
    actualName: "CeeDee Lamb",
    actualPos: "WR",
    rivalsName: "CeeDee Lamb",
    rivalsPos: "WR",
    kind: "same",
    sameAsRivals: true,
    grade: "A",
    confidence: "MEDIUM",
    reasons: ["SAME_PICK"],
    why: "Best player available and it fit.",
    otherOptions: [],
    availableTop: ["CeeDee Lamb", "Bijan Robinson"],
    openNeeds: ["WR", "RB"],
    commentaryWeight: "same",
    importance: "ROUTINE",
  });
  const miss = pick({
    overallPick: 12,
    round: 2,
    actualName: "Deebo Samuel",
    actualPos: "WR",
    rivalsName: "Kenneth Walker",
    rivalsPos: "RB",
    kind: "preferred",
    confidence: "MEDIUM",
    commentaryWeight: "major",
    importance: "MAJOR",
    laterChase: {
      pos: "RB",
      strength: "hard",
      picks: [{ overallPick: 36, round: 4, actualName: "Rachaad White" }],
    },
  });
  const late = pick({
    overallPick: 36,
    round: 4,
    actualName: "Rachaad White",
    actualPos: "RB",
    rivalsName: "Rachaad White",
    rivalsPos: "RB",
    kind: "same",
    sameAsRivals: true,
    grade: "B+",
    confidence: "MEDIUM",
    commentaryWeight: "same",
    importance: "ROUTINE",
    passedNeedsEarlier: ["RB"],
  });
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    narrativeVersion: NARRATIVE_VERSION,
    leagueId: "457622",
    season: 2024,
    teamId: 11,
    teamName: "Test Squad",
    overallGrade: "B+",
    rivalsRedraftGrade: "A-",
    overallConfidence: "MEDIUM",
    rankingTier: "TIER_2_SEASON_CACHE",
    historicalDisclosure: null,
    evidenceDisclosure: "Season-cache rankings, not a draft-week archive.",
    supportStatus: "FULL",
    recommendationCeiling: "MEDIUM",
    strongestPosition: "WR",
    weakestPosition: "RB",
    bestPick: {
      round: 1,
      overallPick: 1,
      actualName: "CeeDee Lamb",
      why: "Best available receiver and it locked the WR1 chair.",
    },
    biggestMiss: {
      round: 2,
      overallPick: 12,
      actualName: "Deebo Samuel",
      altName: "Kenneth Walker",
      why: "Walker was the last RB in that tier.",
    },
    turningPoint: {
      round: 2,
      overallPick: 12,
      actualName: "Deebo Samuel",
      altName: "Kenneth Walker",
      why: "Passing on the last RB2 created a later chase.",
    },
    actualStarters: [
      { slot: "WR1", name: "CeeDee Lamb", pos: "WR" },
      { slot: "RB1", name: null, pos: "RB" },
    ],
    rivalsStarters: [
      { slot: "WR1", name: "CeeDee Lamb", pos: "WR" },
      { slot: "RB1", name: "Kenneth Walker", pos: "RB" },
    ],
    retainedKeepers: [],
    rosterEnteringLiveDraft: [],
    positionsFilledBeforeLive: [],
    sequentialRivalsRoster: [
      { slot: "WR1", name: "CeeDee Lamb", pos: "WR" },
      { slot: "RB1", name: "Kenneth Walker", pos: "RB" },
    ],
    sequentialRedraftPicks: [
      { overallPick: 1, name: "CeeDee Lamb", pos: "WR", isKeeper: false },
      { overallPick: 12, name: "Kenneth Walker", pos: "RB", isKeeper: false },
      { overallPick: 36, name: "Rachaad White", pos: "RB", isKeeper: false },
    ],
    picks: [same, miss, late],
    ...overrides,
  };
}

describe("post-draft storytelling grounding", () => {
  it("keeps deterministic facts independent of storytelling copy", () => {
    const facts = sampleFacts();
    const narrative = buildFallbackNarrative(facts);
    expect(facts.overallGrade).toBe("B+");
    expect(facts.picks[1]?.grade).toBe("C+");
    expect(facts.picks[1]?.rivalsName).toBe("Kenneth Walker");
    expect(narrative.openingHeadline).not.toMatch(/^A\+/);
    expect(assertGrounded(facts, narrative)).toEqual([]);
  });

  it("cannot replace a deterministic grade", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      openingHeadline: "A+ — Perfect draft, no notes.",
      pickTakes: [{ overallPick: 12, headline: "That was really an F.", explanation: "Rivals preferred Kenneth Walker." }],
    });
    expect(facts.picks.find((p) => p.overallPick === 12)?.grade).toBe("C+");
    const take = grounded.pickTakes.find((t) => t.overallPick === 12);
    expect(`${take?.headline} ${take?.explanation}`).not.toMatch(/really an f/i);
  });

  it("cannot replace the Rivals pick", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      pickTakes: [{ overallPick: 12, headline: "Wrong guy", explanation: "Rivals preferred Bijan Robinson." }],
    });
    const take = grounded.pickTakes.find((t) => t.overallPick === 12);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).toContain("kenneth walker");
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).not.toContain("bijan robinson");
  });

  it("rejects unavailable players", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      pickTakes: [
        { overallPick: 12, headline: "Missed star", explanation: "You should have taken Justin Jefferson here." },
      ],
    });
    const take = grounded.pickTakes.find((t) => t.overallPick === 12);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).not.toContain("justin jefferson");
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).toContain("kenneth walker");
  });

  it("does not grade keepers or invent a Rivals replacement", () => {
    const keeper = pick({
      overallPick: 27,
      round: 3,
      actualName: "Trey McBride",
      actualPos: "TE",
      rivalsName: "",
      rivalsPos: "",
      isKeeper: true,
      kind: "none",
      sameAsRivals: false,
      grade: "—",
      confidence: "INSUFFICIENT",
      commentaryWeight: "keeper",
      importance: "NOTABLE",
      otherOptions: [],
      availableTop: [],
      openNeeds: ["RB"],
      why: "Keeper — not graded.",
    });
    const facts = sampleFacts({ picks: [keeper, ...sampleFacts().picks] });
    const narrative = buildFallbackNarrative(facts);
    const take = narrative.pickTakes.find((t) => t.overallPick === 27);
    expect(take).toBeTruthy();
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).not.toMatch(/should have taken|decision grade|biggest miss/);
    const hijack = groundNarrative(facts, {
      pickTakes: [
        {
          overallPick: 27,
          headline: "You blew the keeper",
          explanation: "You should have taken Travis Kelce. Grade: F.",
        },
      ],
    });
    const groundedTake = hijack.pickTakes.find((t) => t.overallPick === 27);
    expect(`${groundedTake?.headline} ${groundedTake?.explanation}`.toLowerCase()).not.toMatch(/travis kelce|grade: f|should have taken/);
  });

  it("2019 LOW-confidence contract rejects declarative criticism", () => {
    const facts = sampleFacts({
      season: 2019,
      supportStatus: "LIMITED",
      recommendationCeiling: "LOW",
      overallConfidence: "LOW",
      picks: sampleFacts().picks.map((p) => ({ ...p, confidence: "LOW" as const })),
    });
    const narrative = buildFallbackNarrative(facts);
    expect(narrative.draftStory.toLowerCase()).toMatch(/lean|thinner|asterisk|limited/);
    const grounded = groundNarrative(facts, {
      draftStory: "You blew this pick. Player X was obviously the right selection and you unquestionably should have taken Kenneth Walker.",
      pickTakes: [
        {
          overallPick: 12,
          headline: "You blew this",
          explanation: "You unquestionably should have taken Kenneth Walker.",
        },
      ],
    });
    expect(grounded.draftStory.toLowerCase()).not.toMatch(/unquestionably|obviously the right/);
    const take = grounded.pickTakes.find((t) => t.overallPick === 12);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).toMatch(/leans toward|preferred/);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).not.toMatch(/unquestionably/);
  });

  it("2025 FULL-support contract is not limited-support copy", () => {
    const facts = sampleFacts({ season: 2025, supportStatus: "FULL", recommendationCeiling: "MEDIUM" });
    const narrative = buildFallbackNarrative(facts);
    expect(narrative.draftStory.toLowerCase()).not.toMatch(/limited historical ranking data/);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/2019 \/ LIMITED/);
    expect(compactFactsForLlm(facts).supportStatus).toBe("FULL");
    expect(compactFactsForLlm(facts).recommendationCeiling).toBe("MEDIUM");
  });

  it("does not invent Best Pick, Biggest Miss, or Turning Point", () => {
    const facts = sampleFacts({ bestPick: null, biggestMiss: null, turningPoint: null });
    const grounded = groundNarrative(facts, {
      bestPickExplanation: "Invented best pick: Justin Jefferson.",
      biggestMissExplanation: "Invented miss: you should have taken Justin Jefferson.",
      turningPointExplanation: "Invented turning point in round 2.",
    });
    expect(grounded.bestPickStory).toBeNull();
    expect(grounded.biggestMissStory).toBeNull();
    expect(grounded.turningPointStory).toBeNull();
  });

  it("strips hindsight and does not attack the person", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      draftStory: "Deebo got injured in week 12 and his ADP was a steal. You don't know how to draft.",
      pickTakes: [
        { overallPick: 12, headline: "Bust", explanation: "Rivals preferred Kenneth Walker. He finished as RB8 after the breakout." },
      ],
    });
    expect(grounded.draftStory.toLowerCase()).not.toMatch(/injur|adp|don'?t know how to draft/);
    const take = grounded.pickTakes.find((t) => t.overallPick === 12);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).not.toMatch(/finished as|breakout/);
  });

  it("missing narrative fields degrade to fallback instead of blanking the evaluation", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {});
    expect(grounded.draftStory.length).toBeGreaterThan(40);
    expect(grounded.pickTakes.length).toBeGreaterThan(0);
    expect(facts.overallGrade).toBe("B+");
  });

  it("null fields and missing pickTakes do not crash grounding", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      openingHeadline: null,
      draftStory: null,
      rivalsSays: null,
      bestPickExplanation: null,
      biggestMissExplanation: null,
      turningPointExplanation: null,
      pickTakes: null,
    } as Record<string, unknown>);
    expect(grounded.draftStory.length).toBeGreaterThan(40);
    expect(grounded.pickTakes.length).toBeGreaterThan(0);
    expect(facts.overallGrade).toBe("B+");
  });

  it("drops invented pick numbers instead of attaching them to a real pick", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      pickTakes: [{ overallPick: 999, headline: "Ghost pick", explanation: "Rivals preferred nobody." }],
    });
    expect(grounded.pickTakes.some((t) => t.overallPick === 999)).toBe(false);
    expect(
      facts.picks.every(
        (p) => p.commentaryWeight === "skip" || grounded.pickTakes.some((t) => t.overallPick === p.overallPick),
      ),
    ).toBe(true);
  });

  it("rejects a take that contradicts the deterministic pick grade", () => {
    const facts = sampleFacts();
    const grounded = groundNarrative(facts, {
      pickTakes: [
        { overallPick: 12, headline: "Disaster", explanation: "Rivals preferred Kenneth Walker. That was really an F." },
      ],
    });
    const take = grounded.pickTakes.find((t) => t.overallPick === 12);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).not.toMatch(/really an f/);
  });

  it("does not send rankings or projections to the LLM", () => {
    const compact = compactFactsForLlm(sampleFacts());
    const blob = JSON.stringify(compact);
    expect(blob.toLowerCase()).not.toMatch(/"adp"|"ecr"|projectedpoints|fantasy points/);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/EXPLAINER, NOT THE EVALUATOR/);
    expect(compactFactsSize(sampleFacts())).toBeLessThan(20_000);
  });

  it("cache material includes user-evaluation fingerprint fields and versions", () => {
    const material = narrativeCacheMaterial(sampleFacts());
    expect(material).toContain("457622");
    expect(material).toContain("2024");
    expect(material).toContain(EVALUATOR_VERSION);
    expect(material).toContain(NARRATIVE_VERSION);
    expect(material).toContain("\"teamId\":11");
    const changed = narrativeCacheMaterial(sampleFacts({ overallGrade: "C+" }));
    expect(changed).not.toEqual(material);
  });

  it("unsupported seasons never request storytelling", () => {
    expect(storytellingAllowed(2017)).toBe(false);
    expect(storytellingAllowed(2010)).toBe(false);
    expect(storytellingAllowed(2018)).toBe(true);
    expect(storytellingAllowed(2019)).toBe(true);
    expect(storytellingAllowed(2025)).toBe(true);
    expect(storytellingAllowed(2026)).toBe(true);
  });

  it("uses MEDIUM confidence language, not HIGH certainty, on full-support seasons", () => {
    const narrative = buildFallbackNarrative(sampleFacts());
    expect(narrative.biggestMissStory).toMatch(/Rivals preferred Kenneth Walker/);
    expect(narrative.biggestMissStory).not.toMatch(/You should have taken Kenneth Walker/);
  });

  it("2018 consecutive 19/20 picks stay distinct and do not invent unavailable players", () => {
    const fitz = pick({
      overallPick: 19,
      round: 2,
      actualName: "Larry Fitzgerald",
      actualPos: "WR",
      rivalsName: "Saquon Barkley",
      rivalsPos: "RB",
      grade: "B",
      otherOptions: ["Saquon Barkley", "Adam Thielen"],
      availableTop: ["Saquon Barkley", "Adam Thielen", "Larry Fitzgerald"],
    });
    const freeman = pick({
      overallPick: 20,
      round: 2,
      actualName: "Devonta Freeman",
      actualPos: "RB",
      rivalsName: "Saquon Barkley",
      rivalsPos: "RB",
      grade: "C+",
      otherOptions: ["Saquon Barkley", "Adam Thielen"],
      availableTop: ["Saquon Barkley", "Adam Thielen", "Devonta Freeman"],
    });
    const facts = sampleFacts({ season: 2018, picks: [fitz, freeman] });
    const grounded = groundNarrative(facts, {
      pickTakes: [
        { overallPick: 19, headline: "Value chase", explanation: "Rivals preferred Saquon Barkley. You should have taken Chris Johnson." },
        { overallPick: 20, headline: "Need", explanation: "Rivals preferred Saquon Barkley after Fitzgerald came off." },
      ],
    });
    const t19 = grounded.pickTakes.find((t) => t.overallPick === 19);
    const t20 = grounded.pickTakes.find((t) => t.overallPick === 20);
    expect(`${t19?.explanation}`.toLowerCase()).not.toContain("chris johnson");
    expect(`${t19?.explanation}`.toLowerCase()).toContain("saquon barkley");
    expect(t19?.overallPick).not.toBe(t20?.overallPick);
  });

  function season2026Facts(overrides: Partial<NarrativeFacts> = {}): NarrativeFacts {
    const keeper = pick({
      overallPick: 27,
      round: 3,
      actualName: "Trey McBride",
      actualPos: "TE",
      rivalsName: "",
      rivalsPos: "",
      isKeeper: true,
      kind: "none",
      grade: "—",
      confidence: "INSUFFICIENT",
      commentaryWeight: "keeper",
      importance: "NOTABLE",
      otherOptions: [],
      availableTop: [],
      rosterBefore: [],
      openNeeds: ["QB", "WR"],
    });
    const golden = pick({
      overallPick: 74,
      round: 7,
      actualName: "Matthew Golden",
      actualPos: "WR",
      rivalsName: "Mike Evans",
      independentRivalsName: "Mike Evans",
      sequentialRedraftName: "Quentin Johnston",
      sequentialRedraftPos: "WR",
      otherOptions: ["Mike Evans", "Quentin Johnston"],
      availableTop: ["Mike Evans", "Quentin Johnston"],
      rosterBefore: ["Trey McBride", "Derrick Henry"],
      openNeeds: ["WR"],
    });
    return sampleFacts({
      season: 2026,
      supportStatus: "FULL",
      overallGrade: "C+",
      rivalsRedraftGrade: "A",
      bestPick: null,
      biggestMiss: {
        round: 7,
        overallPick: 74,
        actualName: "Matthew Golden",
        altName: "Mike Evans",
        why: "Evans was the stronger receiver on the board you faced.",
      },
      turningPoint: {
        round: 7,
        overallPick: 74,
        actualName: "Matthew Golden",
        altName: "Mike Evans",
        why: "The later WR room followed from this slot.",
      },
      retainedKeepers: [{ overallPick: 27, name: "Trey McBride", pos: "TE" }],
      rosterEnteringLiveDraft: ["Trey McBride"],
      positionsFilledBeforeLive: ["TE"],
      actualStarters: [
        { slot: "TE", name: "Trey McBride", pos: "TE" },
        { slot: "WR2", name: "Matthew Golden", pos: "WR" },
      ],
      rivalsStarters: [
        { slot: "TE", name: "Brock Bowers", pos: "TE" },
        { slot: "WR2", name: "Quentin Johnston", pos: "WR" },
      ],
      sequentialRivalsRoster: [
        { slot: "TE", name: "Brock Bowers", pos: "TE" },
        { slot: "WR2", name: "Quentin Johnston", pos: "WR" },
      ],
      sequentialRedraftPicks: [
        { overallPick: 27, name: "Trey McBride", pos: "TE", isKeeper: true },
        { overallPick: 74, name: "Quentin Johnston", pos: "WR", isKeeper: false },
      ],
      picks: [keeper, golden],
      ...overrides,
    });
  }

  it("McBride keeper prevents TE empty / blind-spot language", () => {
    const facts = season2026Facts();
    const grounded = groundNarrative(facts, {
      draftStory:
        "The early TE blind spot defined this draft. Going softer on TE early left the chair empty until it was too late.",
      redraftExplanation: "Rivals took Brock Bowers because tight end was ignored.",
      pickTakes: [
        {
          overallPick: 27,
          headline: "Locked",
          explanation: "Trey McBride locked TE before live selections.",
        },
      ],
    });
    expect(grounded.draftStory.toLowerCase()).not.toMatch(/blind spot|softer on te|chair empty/);
    expect(grounded.actualVsRivals.toLowerCase()).not.toMatch(/tight end was ignored|te was ignored/);
    expect(assertGrounded(facts, grounded)).not.toContain("keeper_position_empty");
  });

  it("redraft explanation cannot say Rivals took Mike Evans when he is not sequential", () => {
    const facts = season2026Facts();
    const grounded = groundNarrative(facts, {
      redraftExplanation: "Rivals took Mike Evans and rebuilt the WR room around him.",
      actualVsRivals: "The Rivals draft added Mike Evans.",
    });
    expect(grounded.actualVsRivals.toLowerCase()).not.toContain("mike evans");
    expect(grounded.actualVsRivals.toLowerCase()).toMatch(/quentin johnston|brock bowers|restacks/);
  });

  it("independent pick-card can still mention Mike Evans", () => {
    const facts = season2026Facts();
    const grounded = groundNarrative(facts, {
      pickTakes: [
        {
          overallPick: 74,
          headline: "Board said Evans",
          explanation: "Rivals preferred Mike Evans on the board you actually faced.",
        },
      ],
    });
    const take = grounded.pickTakes.find((t) => t.overallPick === 74);
    expect(`${take?.headline} ${take?.explanation}`.toLowerCase()).toContain("mike evans");
  });

  it("Draft Story cannot collapse Miss and Turning Point into a combined purpose", () => {
    const facts = season2026Facts();
    const grounded = groundNarrative(facts, {
      draftStory:
        "Selecting Matthew Golden over Mike Evans was a double whammy, both the biggest miss and turning point of the draft.",
      biggestMissStory:
        "Rivals preferred Mike Evans. You took Matthew Golden instead. Immediate opportunity cost at this slot.",
      turningPointStory: "Round 7 is the hinge because of what it did next. That increased the pressure later.",
    });
    expect(collapsesMissAndTurningPoint(grounded.draftStory)).toBe(false);
    expect(grounded.draftStory.toLowerCase()).not.toMatch(/double whammy|both the biggest miss and turning point/);
    expect(grounded.biggestMissStory).not.toEqual(grounded.turningPointStory);
  });

  it("overlapping award identities still keep distinct Miss vs Turning Point purposes", () => {
    const facts = season2026Facts({
      biggestMiss: {
        round: 9,
        overallPick: 123,
        actualName: "Tre Tucker",
        altName: "Quentin Johnston",
        why: "Immediate opportunity cost at this slot.",
      },
      turningPoint: {
        round: 9,
        overallPick: 123,
        actualName: "Tre Tucker",
        altName: "Quentin Johnston",
        why: "Later WR depth had to be chased.",
      },
      picks: season2026Facts().picks.concat([
        pick({
          overallPick: 123,
          round: 9,
          actualName: "Tre Tucker",
          rivalsName: "Quentin Johnston",
          independentRivalsName: "Quentin Johnston",
          sequentialRedraftName: "Jakobi Meyers",
        }),
      ]),
    });
    const fallback = buildFallbackNarrative(facts);
    expect(fallback.biggestMissStory).not.toEqual(fallback.turningPointStory);
    expect(fallback.biggestMissStory?.toLowerCase()).toMatch(/opportunity|preferred|took tre tucker/);
    expect(fallback.turningPointStory?.toLowerCase()).toMatch(/hinge|later|next/);
    expect(collapsesMissAndTurningPoint(fallback.draftStory)).toBe(false);
    const grounded = groundNarrative(facts, {
      draftStory: fallback.draftStory,
      biggestMissStory: fallback.biggestMissStory,
      turningPointStory: fallback.turningPointStory,
    });
    expect(grounded.biggestMissStory).not.toEqual(grounded.turningPointStory);
    expect(collapsesMissAndTurningPoint(grounded.draftStory)).toBe(false);
  });

  it("same pick as Biggest Miss and Turning Point gets distinct section purposes", () => {
    const facts = season2026Facts();
    const sameLine =
      "Matthew Golden instead of Mike Evans was the miss that turned the draft because Evans was sitting there.";
    const grounded = groundNarrative(facts, {
      draftStory: `${sameLine} The rest of the build was ordinary.`,
      biggestMissStory: sameLine,
      turningPointStory: sameLine,
      pickTakes: [{ overallPick: 74, headline: sameLine, explanation: sameLine }],
    });
    expect(grounded.biggestMissStory).not.toEqual(grounded.turningPointStory);
    expect(grounded.biggestMissStory?.toLowerCase()).toMatch(/opportunity|preferred|took matthew golden/);
    expect(grounded.turningPointStory?.toLowerCase()).toMatch(/hinge|later|pressure|chain|follow/);
  });

  it("Golden/Evans does not repeat identical language across Draft Story / Miss / Turn / Take", () => {
    const facts = season2026Facts();
    const sameLine = "Matthew Golden over Mike Evans is the whole story of this draft.";
    const grounded = groundNarrative(facts, {
      draftStory: sameLine,
      biggestMissStory: sameLine,
      turningPointStory: sameLine,
      pickTakes: [{ overallPick: 74, headline: "Same", explanation: sameLine }],
    });
    const miss = grounded.biggestMissStory ?? "";
    const turn = grounded.turningPointStory ?? "";
    const take = grounded.pickTakes.find((t) => t.overallPick === 74);
    expect(miss).not.toEqual(turn);
    expect(take?.explanation).not.toEqual(miss);
  });

  it("2019 LOW-confidence hedging is still preserved", () => {
    const facts = sampleFacts({
      season: 2019,
      supportStatus: "LIMITED",
      recommendationCeiling: "LOW",
      overallConfidence: "LOW",
      picks: sampleFacts().picks.map((p) => ({ ...p, confidence: "LOW" as const })),
    });
    const narrative = buildFallbackNarrative(facts);
    expect(narrative.draftStory.toLowerCase()).toMatch(/lean|thinner|asterisk|limited/);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/2019 \/ LIMITED/);
  });

  it("2025 FULL behavior is unchanged", () => {
    const facts = sampleFacts({ season: 2025, supportStatus: "FULL", recommendationCeiling: "MEDIUM" });
    const narrative = buildFallbackNarrative(facts);
    expect(narrative.draftStory.toLowerCase()).not.toMatch(/limited historical ranking data/);
    expect(compactFactsForLlm(facts).supportStatus).toBe("FULL");
    expect(compactFactsForLlm(facts).recommendationCeiling).toBe("MEDIUM");
  });

  it("does not change evaluator version or narrative version", () => {
    expect(EVALUATOR_VERSION).toBe("post-draft-eval-04");
    expect(NARRATIVE_VERSION).toBe("post-draft-eval-06");
  });

  it("report-card copy prefers distinct narrative purposes over overlapping evaluator why", () => {
    const missWhy = "Quentin Johnston appears to have been the stronger roster-building option.";
    const turnWhy = "Quentin Johnston appears to have been the stronger roster-building option.";
    const missStory = "Rivals preferred Quentin Johnston. You took Tre Tucker instead. Immediate opportunity cost at this slot.";
    const turnStory = "Round 9 is the hinge because of what it did next, not the name on the card.";
    expect(awardCardBody({ storyReady: false, narrativeStory: missStory, evaluatorWhy: missWhy, empty: "empty" })).toBe(missWhy);
    expect(
      awardCardBody({ storyReady: true, narrativeStory: missStory, evaluatorWhy: missWhy, empty: "empty" }),
    ).toBe(missStory);
    expect(
      awardCardBody({ storyReady: true, narrativeStory: turnStory, evaluatorWhy: turnWhy, empty: "empty" }),
    ).toBe(turnStory);
    expect(
      awardCardBody({ storyReady: true, narrativeStory: missStory, evaluatorWhy: missWhy, empty: "empty" }),
    ).not.toBe(
      awardCardBody({ storyReady: true, narrativeStory: turnStory, evaluatorWhy: turnWhy, empty: "empty" }),
    );
  });
});
