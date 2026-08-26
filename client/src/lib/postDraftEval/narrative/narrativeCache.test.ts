import { describe, expect, it } from "vitest";
import {
  EVALUATOR_VERSION,
  NARRATIVE_VERSION,
  narrativeCacheIdentity,
  narrativeCacheMaterial,
  type NarrativeFacts,
  type NarrativePickFact,
} from "./index";

function pick(
  partial: Partial<NarrativePickFact> & Pick<NarrativePickFact, "overallPick" | "actualName" | "rivalsName">,
): NarrativePickFact {
  const rivalsName = partial.rivalsName;
  const rivalsPos = partial.rivalsPos ?? "WR";
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
    reasons: ["FILLS_WR2"],
    why: "Generated copy must not participate in the cache key.",
    impact: ["NEED_WR"],
    otherOptions: ["Mike Evans", "Quentin Johnston"],
    availableTop: ["Mike Evans", "Quentin Johnston"],
    rosterBefore: ["Trey McBride", "Derrick Henry"],
    openNeeds: ["WR", "QB"],
    survivesUntilNextPick: true,
    commentaryWeight: "major",
    importance: "MAJOR",
    laterChase: null,
    passedNeedsEarlier: [],
    sequentialSameAsOriginal: false,
    ...partial,
    independentRivalsName: partial.independentRivalsName ?? partial.rivalsName,
    independentRivalsPos: partial.independentRivalsPos ?? rivalsPos,
    sequentialRedraftName: partial.sequentialRedraftName ?? partial.rivalsName,
    sequentialRedraftPos: partial.sequentialRedraftPos ?? rivalsPos,
  };
}

function baseFacts(overrides: Partial<NarrativeFacts> = {}): NarrativeFacts {
  const golden = pick({
    overallPick: 74,
    round: 7,
    actualName: "Matthew Golden",
    actualPos: "WR",
    rivalsName: "Mike Evans",
    independentRivalsName: "Mike Evans",
    sequentialRedraftName: "Quentin Johnston",
    sequentialRedraftPos: "WR",
    otherOptions: ["Mike Evans", "Quentin Johnston", "Jalen Coker", "Malik Washington"],
  });
  return {
    evaluatorVersion: EVALUATOR_VERSION,
    narrativeVersion: NARRATIVE_VERSION,
    leagueId: "457622",
    season: 2026,
    teamId: 11,
    teamName: "Str8FrmHell, RodZilla",
    overallGrade: "C+",
    rivalsRedraftGrade: "A",
    overallConfidence: "MEDIUM",
    rankingTier: "TIER_2_SEASON_CACHE",
    historicalDisclosure: "Season-labeled ESPN ADP for 2026",
    evidenceDisclosure: "Season-cache rankings.",
    supportStatus: "FULL",
    recommendationCeiling: "MEDIUM",
    strongestPosition: "RB",
    weakestPosition: "WR",
    bestPick: null,
    biggestMiss: {
      round: 7,
      overallPick: 74,
      actualName: "Matthew Golden",
      altName: "Mike Evans",
      why: "Generated miss copy.",
    },
    turningPoint: {
      round: 7,
      overallPick: 74,
      actualName: "Matthew Golden",
      altName: "Mike Evans",
      why: "Generated turning-point copy.",
    },
    actualStarters: [{ slot: "TE", name: "Trey McBride", pos: "TE" }],
    rivalsStarters: [{ slot: "TE", name: "Brock Bowers", pos: "TE" }],
    retainedKeepers: [{ overallPick: 27, name: "Trey McBride", pos: "TE" }],
    rosterEnteringLiveDraft: ["Trey McBride"],
    positionsFilledBeforeLive: ["TE"],
    sequentialRivalsRoster: [{ slot: "TE", name: "Brock Bowers", pos: "TE" }],
    sequentialRedraftPicks: [
      { overallPick: 18, name: "Brock Bowers", pos: "TE", isKeeper: false },
      { overallPick: 27, name: "Trey McBride", pos: "TE", isKeeper: true },
      { overallPick: 74, name: "Quentin Johnston", pos: "WR", isKeeper: false },
    ],
    picks: [golden],
    ...overrides,
  };
}

function reverseKeys<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).reverse()) as T;
}

describe("narrative cache identity", () => {
  it("same deterministic facts produce the same cache key", () => {
    expect(narrativeCacheMaterial(baseFacts())).toEqual(narrativeCacheMaterial(baseFacts()));
  });

  it("object insertion order difference produces the same cache key", () => {
    const a = baseFacts();
    const b = reverseKeys(baseFacts()) as NarrativeFacts;
    const shuffledPick = reverseKeys(a.picks[0] as unknown as Record<string, unknown>) as unknown as NarrativePickFact;
    const c = { ...a, picks: [shuffledPick] };
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(b));
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(c));
  });

  it("transient timestamp / display metadata difference produces the same cache key", () => {
    const a = baseFacts();
    const b = baseFacts({
      teamName: "A different label",
      historicalDisclosure: "fetchedAt=2026-08-25T07:36:00Z",
      evidenceDisclosure: "fetchedAt=2026-08-25T14:10:00Z",
    });
    const noisy = {
      ...a,
      fetchedAt: "2026-08-25T14:10:00.000Z",
      requestId: "req_abc",
      cacheFetchedAt: Date.now(),
    } as NarrativeFacts & Record<string, unknown>;
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(b));
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(noisy as NarrativeFacts));
  });

  it("null vs omitted non-semantic field produces the same cache key", () => {
    const a = baseFacts({ historicalDisclosure: null, bestPick: null });
    const b = { ...baseFacts(), historicalDisclosure: undefined as unknown as null };
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(b));
  });

  it("otherOptions order and award why copy do not change the cache key", () => {
    const a = baseFacts();
    const b = baseFacts({
      picks: [
        pick({
          overallPick: 74,
          round: 7,
          actualName: "Matthew Golden",
          actualPos: "WR",
          rivalsName: "Mike Evans",
          independentRivalsName: "Mike Evans",
          sequentialRedraftName: "Quentin Johnston",
          otherOptions: ["Jalen Coker", "Malik Washington", "Quentin Johnston", "Mike Evans"],
          why: "A completely different generated sentence.",
        }),
      ],
      biggestMiss: {
        round: 7,
        overallPick: 74,
        actualName: "Matthew Golden",
        altName: "Mike Evans",
        why: "Different generated miss copy.",
      },
    });
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(b));
  });

  it("openNeeds order does not change the cache key", () => {
    const a = baseFacts();
    const b = baseFacts({
      picks: a.picks.map((p) => ({ ...p, openNeeds: [...p.openNeeds].reverse() })),
    });
    expect(narrativeCacheMaterial(a)).toEqual(narrativeCacheMaterial(b));
  });

  it("prompt / narrative version change produces a different cache key", () => {
    const a = narrativeCacheMaterial(baseFacts());
    const b = narrativeCacheMaterial(baseFacts({ narrativeVersion: "post-draft-eval-05" }));
    expect(a).not.toEqual(b);
  });

  it("evaluator version change produces a different cache key", () => {
    const a = narrativeCacheMaterial(baseFacts());
    const b = narrativeCacheMaterial(baseFacts({ evaluatorVersion: "post-draft-eval-03" }));
    expect(a).not.toEqual(b);
  });

  it("Rivals pick-card change produces a different cache key", () => {
    const a = narrativeCacheMaterial(baseFacts());
    const b = narrativeCacheMaterial(
      baseFacts({
        picks: baseFacts().picks.map((p) => ({
          ...p,
          rivalsName: "Jalen Coker",
          independentRivalsName: "Jalen Coker",
        })),
      }),
    );
    expect(a).not.toEqual(b);
  });

  it("sequential redraft change produces a different cache key", () => {
    const a = narrativeCacheMaterial(baseFacts());
    const b = narrativeCacheMaterial(
      baseFacts({
        sequentialRedraftPicks: [
          { overallPick: 18, name: "Lamar Jackson", pos: "QB", isKeeper: false },
          { overallPick: 27, name: "Trey McBride", pos: "TE", isKeeper: true },
          { overallPick: 74, name: "Mike Evans", pos: "WR", isKeeper: false },
        ],
        picks: baseFacts().picks.map((p) => ({ ...p, sequentialRedraftName: "Mike Evans" })),
      }),
    );
    expect(a).not.toEqual(b);
  });

  it("keeper change produces a different cache key", () => {
    const a = narrativeCacheMaterial(baseFacts());
    const b = narrativeCacheMaterial(
      baseFacts({
        retainedKeepers: [
          { overallPick: 27, name: "Trey McBride", pos: "TE" },
          { overallPick: 14, name: "Derrick Henry", pos: "RB" },
        ],
        rosterEnteringLiveDraft: ["Derrick Henry", "Trey McBride"],
        positionsFilledBeforeLive: ["RB", "TE"],
      }),
    );
    expect(a).not.toEqual(b);
  });

  it("overall grade change produces a different cache key", () => {
    expect(narrativeCacheMaterial(baseFacts({ overallGrade: "B-" }))).not.toEqual(narrativeCacheMaterial(baseFacts()));
  });

  it("identity omits generated copy and display labels", () => {
    const blob = JSON.stringify(narrativeCacheIdentity(baseFacts()));
    expect(blob).not.toMatch(/Generated miss copy|teamName|fetchedAt|requestId|Str8FrmHell/);
    expect(blob).toContain(EVALUATOR_VERSION);
    expect(blob).toContain(NARRATIVE_VERSION);
    expect(blob).toContain("457622");
  });
});
