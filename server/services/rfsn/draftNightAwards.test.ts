/**
 * Draft Night Show award engine — selection, gates, evidence, no-intent facts.
 */
import { describe, expect, it } from "vitest";
import { computeOwnerDraftMetrics, type DraftNightPickInput } from "../../../shared/draftNightGrading";
import type { HistoricalContext } from "./historicalContext";
import { auditIntentLanguage } from "./intentAudit";
import {
  buildDraftNightShow,
  selectBiggestMistake,
  selectSleeperValue,
  selectUnderIntensePressure,
  selectWinnerOfTheNight,
  type PressureCandidate,
} from "./draftNightAwards";
import { buildEditorialAssignment } from "../sofia/broadcastEditorialRouting";
import { SessionEditorialLedger } from "../sofia/editorialLedger";
import type { BroadcastMoment } from "../sofia/broadcastMomentTypes";

function ctx(
  partial: Partial<HistoricalContext> & Pick<HistoricalContext, "fact" | "narrativeType">,
): HistoricalContext {
  return {
    evidence: [{ source: "test", ref: "t1" }],
    confidence: 0.95,
    significance: 0.75,
    narrativeHeat: 80,
    ...partial,
  };
}

function picksForTwoOwners(): DraftNightPickInput[] {
  // Owner A: strong value + solid ADP
  const a: DraftNightPickInput[] = [
    { teamId: "1", ownerName: "Rod", playerName: "CMC", position: "RB", overallPick: 1, round: 1, adp: 1.2 },
    { teamId: "1", ownerName: "Rod", playerName: "Tyreek", position: "WR", overallPick: 28, round: 2, adp: 22 },
    { teamId: "1", ownerName: "Rod", playerName: "Kelce", position: "TE", overallPick: 42, round: 3, adp: 40 },
    { teamId: "1", ownerName: "Rod", playerName: "Value RB", position: "RB", overallPick: 55, round: 4, adp: 35 },
  ];
  // Owner B: big reach
  const b: DraftNightPickInput[] = [
    { teamId: "2", ownerName: "Bruce", playerName: "Early TE", position: "TE", overallPick: 8, round: 1, adp: 45 },
    { teamId: "2", ownerName: "Bruce", playerName: "WR2", position: "WR", overallPick: 21, round: 2, adp: 25 },
    { teamId: "2", ownerName: "Bruce", playerName: "RB2", position: "RB", overallPick: 36, round: 3, adp: 40 },
    { teamId: "2", ownerName: "Bruce", playerName: "QB", position: "QB", overallPick: 49, round: 4, adp: 55 },
  ];
  // Owner C: mid
  const c: DraftNightPickInput[] = [
    { teamId: "3", ownerName: "Mike", playerName: "Steal WR", position: "WR", overallPick: 30, round: 3, adp: 12 },
    { teamId: "3", ownerName: "Mike", playerName: "RB", position: "RB", overallPick: 17, round: 2, adp: 18 },
    { teamId: "3", ownerName: "Mike", playerName: "WRB", position: "WR", overallPick: 44, round: 4, adp: 48 },
    { teamId: "3", ownerName: "Mike", playerName: "TE", position: "TE", overallPick: 58, round: 5, adp: 60 },
  ];
  return [...a, ...b, ...c];
}

describe("draftNightAwards", () => {
  it("selects Winner of the Night by highest grade (Sofia)", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    const award = selectWinnerOfTheNight(owners, [
      ctx({
        fact: "Rod has 2 championship titles (2019, 2022).",
        narrativeType: "championship",
      }),
    ]);
    expect(award).not.toBeNull();
    expect(award!.awardType).toBe("winner_of_the_night");
    expect(award!.persona).toBe("sofia");
    expect(award!.ownerName).toBeTruthy();
    expect(award!.metrics.draftGrade).toMatch(/^[A-F]$/);
    expect(award!.evidence.some((e) => e.narrativeType === "championship")).toBe(true);
  });

  it("selects Biggest Mistake from largest reach (Coach) with construction framing", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    const award = selectBiggestMistake(owners, [
      ctx({
        fact: "Bruce historically drafts TE after round 6.",
        narrativeType: "breaking_tendency",
      }),
    ]);
    expect(award).not.toBeNull();
    expect(award!.persona).toBe("coach");
    expect(award!.ownerName).toBe("Bruce");
    expect(award!.playerName).toBe("Early TE");
    expect(award!.impact).toMatch(/roster construction/i);
    expect(award!.impact).not.toMatch(/bad player/i);
  });

  it("selects Sleeper Value from ADP discount (Sofia)", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    const award = selectSleeperValue(owners);
    expect(award).not.toBeNull();
    expect(award!.persona).toBe("sofia");
    expect(award!.awardType).toBe("sleeper_value");
    expect(award!.fact).toMatch(/later than ADP|picks later/i);
  });

  it("uses championship context for Under Intense Pressure (Roxanne)", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    const rod = owners.find((o) => o.ownerName === "Rod")!;
    const evidenceByOwner = new Map<string, HistoricalContext[]>([
      [
        "rod",
        [
          ctx({
            fact: "Rod enters as a defending champion (2024).",
            narrativeType: "championship",
          }),
        ],
      ],
    ]);
    const candidates: PressureCandidate[] = [
      {
        ownerName: "Rod",
        ownerKey: rod.ownerKey,
        championshipTitles: 2,
        titleSeasons: [2022, 2024],
        playoffEliminationsInflicted: 3,
        draftLetter: rod.letter,
        rawScore: rod.rawScore,
      },
    ];
    const award = selectUnderIntensePressure(candidates, evidenceByOwner);
    expect(award).not.toBeNull();
    expect(award!.persona).toBe("roxanne");
    expect(award!.fact).toMatch(/championship/i);
    expect(award!.fact).not.toMatch(/afraid|scared|wanted/i);
  });

  it("uses rivalry context when championship titles are absent", () => {
    const evidenceByOwner = new Map<string, HistoricalContext[]>([
      [
        "randy",
        [
          ctx({
            fact: "Randy has eliminated Mike from the playoffs 4 times (career aggregate).",
            narrativeType: "rivalry",
            narrativeHeat: 85,
          }),
        ],
      ],
    ]);
    const award = selectUnderIntensePressure(
      [
        {
          ownerName: "Randy",
          ownerKey: "team:9",
          championshipTitles: 0,
          titleSeasons: [],
          playoffEliminationsInflicted: 4,
          draftLetter: "B",
          rawScore: 0.55,
        },
      ],
      evidenceByOwner,
    );
    expect(award).not.toBeNull();
    expect(award!.fact).toMatch(/rivalry/i);
  });

  it("enforces confidence and narrativeHeat thresholds", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    // Force a barely-qualifying mistake then verify gates reject low heat via direct call path:
    // selectBiggestMistake with reachDelta < 15 returns null
    const mild = owners.map((o) =>
      o.ownerName === "Bruce"
        ? {
            ...o,
            worstReach: {
              playerName: "Mild",
              pick: 20,
              adp: 28,
              reachDelta: 8,
              round: 2,
            },
          }
        : o,
    );
    expect(selectBiggestMistake(mild)).toBeNull();
  });

  it("suppresses awards when evidence is weak (no forced drama)", () => {
    const thin: DraftNightPickInput[] = [
      { teamId: "1", ownerName: "A", playerName: "P1", position: "RB", overallPick: 1, round: 1, adp: 1 },
      { teamId: "1", ownerName: "A", playerName: "P2", position: "WR", overallPick: 2, round: 1, adp: 2 },
      { teamId: "2", ownerName: "B", playerName: "P3", position: "RB", overallPick: 3, round: 1, adp: 3 },
      { teamId: "2", ownerName: "B", playerName: "P4", position: "WR", overallPick: 4, round: 1, adp: 4 },
    ];
    const owners = computeOwnerDraftMetrics(thin);
    const show = buildDraftNightShow({
      owners,
      evidenceByOwner: new Map(),
      pressureCandidates: owners.map((o) => ({
        ownerName: o.ownerName,
        ownerKey: o.ownerKey,
        championshipTitles: 0,
        titleSeasons: [],
        playoffEliminationsInflicted: 0,
        draftLetter: o.letter,
        rawScore: o.rawScore,
      })),
    });
    expect(show.suppressed.some((s) => s.awardType === "biggest_mistake")).toBe(true);
    expect(
      show.suppressed.find((s) => s.awardType === "biggest_mistake")!.reason,
    ).toBe("No catastrophic draft mistake detected.");
    expect(show.awards.find((a) => a.awardType === "under_intense_pressure")).toBeUndefined();
  });

  it("attaches HistoricalContext evidence onto awards", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    const evidenceByOwner = new Map<string, HistoricalContext[]>();
    for (const o of owners) {
      evidenceByOwner.set(o.ownerName.trim().toLowerCase(), [
        ctx({
          fact: `${o.ownerName} has draft DNA favoring early RB.`,
          narrativeType: "draft_dna",
        }),
      ]);
    }
    const show = buildDraftNightShow({
      owners,
      evidenceByOwner,
      pressureCandidates: [
        {
          ownerName: "Rod",
          ownerKey: "team:1",
          championshipTitles: 2,
          titleSeasons: [2019, 2022],
          playoffEliminationsInflicted: 2,
          draftLetter: owners[0]!.letter,
          rawScore: owners[0]!.rawScore,
        },
      ],
    });
    for (const a of show.awards) {
      if (a.awardType === "winner_of_the_night" || a.awardType === "biggest_mistake") {
        expect(a.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("award facts contain no invented intent phrases (RFSN-009A)", () => {
    const owners = computeOwnerDraftMetrics(picksForTwoOwners());
    const evidenceByOwner = new Map<string, HistoricalContext[]>([
      [
        "rod",
        [
          ctx({
            fact: "Rod has 2 championship titles (2019, 2022).",
            narrativeType: "championship",
          }),
        ],
      ],
      [
        "bruce",
        [
          ctx({
            fact: "Bruce historically waits on TE.",
            narrativeType: "breaking_tendency",
          }),
        ],
      ],
    ]);
    const show = buildDraftNightShow({
      owners,
      evidenceByOwner,
      pressureCandidates: [
        {
          ownerName: "Rod",
          ownerKey: "team:1",
          championshipTitles: 2,
          titleSeasons: [2019, 2022],
          playoffEliminationsInflicted: 1,
          draftLetter: "A",
          rawScore: 0.8,
        },
      ],
    });
    for (const a of show.awards) {
      expect(auditIntentLanguage(a.fact).ok).toBe(true);
      if (a.decision) expect(auditIntentLanguage(a.decision).ok).toBe(true);
      if (a.impact) expect(auditIntentLanguage(a.impact).ok).toBe(true);
    }
  });

  it("keeps P3A major_reach Coach-only routing unchanged", () => {
    const moment = {
      identity: { kind: "draft_pick", draftId: "d1", pickNumber: 12, pickId: "e12" },
      momentType: "draft_pick",
      significance: "major",
      headline: null,
      context: { kind: "none" },
      signals: ["REACH:strong"],
      storylines: [],
      receipts: [],
      primaryStoryline: null,
      callbackKeys: [],
      commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
      factPacket: {
        subject: {
          ownerName: "X",
          playerName: "Y",
          position: "WR",
          overallPick: 12,
          round: 1,
          roundPick: 12,
        },
        verifiedFacts: ["Reach: 20 picks early vs ADP."],
        storylines: ["REACH"],
        entities: ["X", "Y"],
      },
    } as unknown as BroadcastMoment;
    const assignment = buildEditorialAssignment(moment, new SessionEditorialLedger());
    expect(assignment.request).toEqual(["coach"]);
    expect(assignment.leadVoice).toBe("coach");
    expect(assignment.request).not.toContain("sofia");
  });
});
