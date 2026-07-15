import { describe, expect, it, vi } from "vitest";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";
import {
  buildSofiaFactPacket,
  presentExclusivityDimensions,
  scoreExclusivity,
} from "./sofiaFactPacketBuilder";
import { GROUNDING_CONNECTIVE_ALLOWLIST, assertCommentaryGrounded } from "./sofiaGrounding";
import * as sofiaGrounding from "./sofiaGrounding";
import { renderTemplateCommentary } from "./sofiaTemplateRenderer";

function baseMoment(overrides: Partial<DraftMoment> = {}): DraftMoment {
  return {
    eventId: "457622:mock-457622-2026:42",
    leagueId: "457622",
    draftId: "mock-457622-2026",
    overallPick: 42,
    round: 3,
    roundPick: 14,
    owner: {
      teamId: "3",
      ownerId: "user_a",
      ownerName: "Alice Owner",
      identityScope: "person",
      identitySource: "gmTeams.ownerId",
    },
    player: {
      playerId: "p1",
      playerName: "Test Player",
      position: "WR",
      nflTeam: "KC",
      adp: 50,
    },
    rosterBeforePick: { WR: 1 },
    receipts: [
      {
        id: "identity",
        type: "identity",
        status: "available",
        source: "gmTeams.ownerId",
        authority: "ownerIdentity",
        confidence: 0.9,
        supportedClaim: "Alice Owner selected Test Player (WR) at pick 42, round 3.",
      },
      {
        id: "rosterNeed",
        type: "rosterNeed",
        status: "available",
        source: "leagueRosterRules",
        authority: "leagueRosterRules",
        confidence: 0.8,
        value: { have: 1, need: 2, needsStarter: true },
        supportedClaim: "Alice Owner still needed a starting WR.",
      },
    ],
    signals: [],
    level: "routine",
    permittedClaims: [
      "Alice Owner selected Test Player (WR) at pick 42, round 3.",
      "Alice Owner still needed a starting WR.",
    ],
    forbiddenClaimCategories: ["owner_emotion"],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: true, maxSentences: 1, maxWords: 20 },
    validation: { valid: true, errors: [], warnings: [] },
    ...overrides,
  };
}

describe("buildSofiaFactPacket", () => {
  it("maps eventId to momentId and copies permittedClaims unchanged", () => {
    const moment = baseMoment();
    const packet = buildSofiaFactPacket(moment);
    expect(packet.momentId).toBe(moment.eventId);
    expect(packet.permittedClaims).toEqual(moment.permittedClaims);
    expect(packet.draftId).toBe("mock-457622-2026");
    expect(packet.season).toBe(2026);
  });
});

describe("scoreExclusivity", () => {
  it("scores rivalry/owner-history moments higher than bare ADP reach", () => {
    const rich = baseMoment({
      level: "major",
      signals: ["PATTERN_BREAK(strong)", "REACH"],
      receipts: [
        ...baseMoment().receipts,
        {
          id: "ownerTiming",
          type: "ownerTiming",
          status: "available",
          source: "draft_picks/person",
          authority: "draft_picks",
          confidence: 0.9,
          value: { patternBreak: true },
        },
        {
          id: "rivalry",
          type: "rivalry",
          status: "available",
          source: "rivalryService",
          authority: "rivalryService",
          confidence: 0.9,
        },
        {
          id: "adpDelta",
          type: "adpDelta",
          status: "available",
          source: "derived",
          authority: "derived",
          confidence: 0.9,
          value: -12,
        },
      ],
    });
    const bare = baseMoment({
      signals: ["REACH"],
      receipts: [
        {
          id: "identity",
          type: "identity",
          status: "available",
          source: "gmTeams.ownerId",
          authority: "ownerIdentity",
          confidence: 0.9,
          supportedClaim: "Alice Owner selected Test Player (WR) at pick 42, round 3.",
        },
        {
          id: "adpDelta",
          type: "adpDelta",
          status: "available",
          source: "derived",
          authority: "derived",
          confidence: 0.9,
          value: -8,
        },
      ],
    });

    const richScore = scoreExclusivity(rich);
    const bareScore = scoreExclusivity(bare);
    expect(richScore.score).toBeGreaterThan(bareScore.score);
    expect(presentExclusivityDimensions(rich)).toEqual(
      expect.arrayContaining(["ownerHistory", "rivalry", "patternBreak", "adp"]),
    );
    // Tied high-class dimensions sort alphabetically by dim name
    expect(richScore.drivers[0]).toBe("ownerHistory");
    expect(bareScore.drivers).toEqual(["adp"]);
  });
});

describe("renderTemplateCommentary", () => {
  it("renders routine as selection line only", () => {
    const packet = buildSofiaFactPacket(baseMoment({ level: "routine" }));
    const commentary = renderTemplateCommentary(packet);
    expect(commentary.text).toContain("Alice Owner selected Test Player");
    expect(commentary.text).not.toContain("still needed");
    expect(commentary.budget.actualWords).toBeLessThanOrEqual(commentary.budget.maxWords);
  });

  it("renders major with storyline supporting claims", () => {
    const packet = buildSofiaFactPacket(
      baseMoment({
        level: "major",
        commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 60 },
        primaryStoryline: "REACH",
        permittedClaims: [
          "Alice Owner selected Test Player (WR) at pick 42, round 3.",
          "Alice Owner took Test Player 12 picks ahead of ADP.",
          "Alice Owner still needed a starting WR.",
        ],
      }),
    );
    const commentary = renderTemplateCommentary(packet);
    expect(commentary.text).toContain("selected Test Player");
    expect(commentary.text).toMatch(/ahead of ADP|still needed/);
  });

  it("is deterministic for the same fact packet", () => {
    const packet = buildSofiaFactPacket(baseMoment({ level: "notable" }));
    expect(renderTemplateCommentary(packet)).toEqual(renderTemplateCommentary(packet));
  });

  it("sets template source and grounded validation", () => {
    const commentary = renderTemplateCommentary(buildSofiaFactPacket(baseMoment()));
    expect(commentary.source).toBe("template");
    expect(commentary.validation).toEqual({ grounded: true, fabricationCount: 0 });
    expect((commentary as any).routing).toBeUndefined();
  });

  it("keeps commentary grounded to permitted claims", () => {
    const packet = buildSofiaFactPacket(
      baseMoment({
        level: "major",
        commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 80 },
        primaryStoryline: "REACH",
        permittedClaims: [
          "Alice Owner selected Test Player (WR) at pick 42, round 3.",
          "Alice Owner took Test Player 12 picks ahead of ADP.",
        ],
      }),
    );
    const commentary = renderTemplateCommentary(packet);
    assertCommentaryGrounded(commentary.text, packet.permittedClaims, commentary.subject);
  });

  it("passes runtime grounding for valid full template commentary", () => {
    const packet = buildSofiaFactPacket(
      baseMoment({
        level: "major",
        commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 60 },
        primaryStoryline: "REACH",
        permittedClaims: [
          "Alice Owner selected Test Player (WR) at pick 42, round 3.",
          "Alice Owner took Test Player 12 picks ahead of ADP.",
        ],
      }),
    );
    const commentary = renderTemplateCommentary(packet);
    expect(commentary.text).toMatch(/ahead of ADP/);
    expect(commentary.validation).toEqual({ grounded: true, fabricationCount: 0 });
    assertCommentaryGrounded(commentary.text, packet.permittedClaims, commentary.subject);
  });

  it("falls back to the selection claim when supporting content is unlicensed", () => {
    const selection =
      "Alice Owner selected Test Player (WR) at pick 42, round 3.";
    const packet = buildSofiaFactPacket(
      baseMoment({
        level: "notable",
        commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 60 },
        permittedClaims: [selection, "Leaked unlicensed token xyzzyzz in supporting claim."],
      }),
    );
    const real = sofiaGrounding.assertCommentaryGrounded;
    const spy = vi
      .spyOn(sofiaGrounding, "assertCommentaryGrounded")
      .mockImplementationOnce(() => {
        throw new Error("Unlicensed factual tokens in commentary: xyzzyzz");
      })
      .mockImplementation((text, claims, subject) => real(text, claims, subject));
    const commentary = renderTemplateCommentary(packet);
    expect(commentary.text).toBe(selection);
    expect(commentary.validation).toEqual({ grounded: true, fabricationCount: 0 });
    spy.mockRestore();
  });

  it("falls back to the subject-only line when the selection claim is unlicensed", () => {
    const packet = buildSofiaFactPacket(
      baseMoment({
        level: "routine",
        permittedClaims: ["Alice Owner selected Test Player (WR) at pick 42, round 3. [mock]"],
      }),
    );
    const real = sofiaGrounding.assertCommentaryGrounded;
    const spy = vi
      .spyOn(sofiaGrounding, "assertCommentaryGrounded")
      .mockImplementationOnce(() => {
        throw new Error("full template failed grounding");
      })
      .mockImplementationOnce(() => {
        throw new Error("selection claim failed grounding");
      })
      .mockImplementation((text, claims, subject) => real(text, claims, subject));
    const commentary = renderTemplateCommentary(packet);
    expect(commentary.text).toBe(
      "Alice Owner — Test Player (WR) at pick 42, in round 3.",
    );
    expect(commentary.validation).toEqual({ grounded: true, fabricationCount: 0 });
    spy.mockRestore();
  });

  it("throws when no fallback can be grounded", () => {
    const packet = buildSofiaFactPacket(baseMoment());
    const spy = vi
      .spyOn(sofiaGrounding, "assertCommentaryGrounded")
      .mockImplementation(() => {
        throw new Error("forced grounding failure");
      });
    expect(() => renderTemplateCommentary(packet)).toThrow(
      /could not produce grounded commentary for moment/,
    );
    spy.mockRestore();
  });

  it("always returns grounded validation flags", () => {
    const packets = [
      buildSofiaFactPacket(baseMoment({ level: "routine" })),
      buildSofiaFactPacket(
        baseMoment({
          level: "major",
          commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 60 },
          primaryStoryline: "REACH",
          permittedClaims: [
            "Alice Owner selected Test Player (WR) at pick 42, round 3.",
            "Alice Owner took Test Player 12 picks ahead of ADP.",
          ],
        }),
      ),
      buildSofiaFactPacket(
        baseMoment({
          level: "routine",
          permittedClaims: ["Alice Owner selected Test Player (WR) at pick 42, round 3. [mock]"],
        }),
      ),
    ];
    for (const packet of packets) {
      const commentary = renderTemplateCommentary(packet);
      expect(commentary.validation.grounded).toBe(true);
      expect(commentary.validation.fabricationCount).toBe(0);
    }
  });
});

describe("GROUNDING_CONNECTIVE_ALLOWLIST", () => {
  it("contains only approved non-factual connective language", () => {
    expect([...GROUNDING_CONNECTIVE_ALLOWLIST].sort()).toEqual(
      [
        "a",
        "an",
        "and",
        "at",
        "at pick",
        "but",
        "by",
        "for",
        "from",
        "in",
        "in round",
        "of",
        "or",
        "the",
        "to",
        "with",
        "—",
      ].sort(),
    );
  });
});
