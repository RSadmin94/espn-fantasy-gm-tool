import { describe, expect, it } from "vitest";
import {
  applyEarlyRoundWrittenFloor,
  applyLiveDraftWrittenEligibility,
  hasAnalyticalEvidenceBeyondSelection,
  isBareSelectionClaim,
} from "./liveDraftWrittenFloor";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

describe("live draft written eligibility (no round floor)", () => {
  const base = {
    eventId: "e1",
    leagueId: "L",
    draftId: "D",
    seed: 1,
    overallPick: 2,
    round: 1,
    roundPick: 2,
    owner: {
      teamId: "1",
      ownerId: "o1",
      ownerName: "Alice",
      identityScope: "person" as const,
      identitySource: "test",
    },
    player: {
      playerId: "p1",
      playerName: "CeeDee Lamb",
      position: "WR",
      nflTeam: "DAL",
      adp: 5,
    },
    rosterBeforePick: {},
    signals: [] as string[],
    level: "routine" as const,
    permittedClaims: ["Alice selected CeeDee Lamb (WR) at pick 2, round 1."],
    forbiddenClaimCategories: [] as string[],
    primaryStoryline: null,
    secondaryStoryline: null,
    commentaryBudget: { enabled: false, maxSentences: 0, maxWords: 0 },
    validation: { valid: true, errors: [] as string[], warnings: [] as string[] },
    receipts: [],
  } satisfies DraftMoment;

  it("does NOT elevate routine rounds 1–3 to notable", () => {
    const out = applyEarlyRoundWrittenFloor(base);
    expect(out.level).toBe("routine");
    expect(out.commentaryBudget.enabled).toBe(false);
  });

  it("leaves round 4+ routine silence alone", () => {
    const out = applyEarlyRoundWrittenFloor({ ...base, round: 4, overallPick: 40 });
    expect(out.level).toBe("routine");
    expect(out.commentaryBudget.enabled).toBe(false);
  });

  it("force-silences notable moments that only have the bare selection claim", () => {
    const out = applyLiveDraftWrittenEligibility({
      ...base,
      level: "notable",
      commentaryBudget: { enabled: true, maxSentences: 1, maxWords: 22 },
      permittedClaims: ["Alice selected CeeDee Lamb (WR) at pick 2, round 1."],
      signals: [],
    });
    expect(out.level).toBe("routine");
    expect(out.commentaryBudget.enabled).toBe(false);
    expect(hasAnalyticalEvidenceBeyondSelection(out)).toBe(false);
  });

  it("force-silences EARLY_ROUND_FLOOR-only signals with bare selection", () => {
    const out = applyLiveDraftWrittenEligibility({
      ...base,
      level: "notable",
      commentaryBudget: { enabled: true, maxSentences: 1, maxWords: 22 },
      signals: ["EARLY_ROUND_FLOOR"],
      permittedClaims: ["Alice selected CeeDee Lamb (WR) at pick 2, round 1."],
    });
    expect(out.level).toBe("routine");
    expect(out.signals).not.toContain("EARLY_ROUND_FLOOR");
    expect(out.commentaryBudget.enabled).toBe(false);
  });

  it("preserves evidence-backed notable commentary", () => {
    const out = applyLiveDraftWrittenEligibility({
      ...base,
      level: "notable",
      commentaryBudget: { enabled: true, maxSentences: 1, maxWords: 22 },
      signals: ["STEAL"],
      permittedClaims: [
        "Alice selected CeeDee Lamb (WR) at pick 2, round 1.",
        "CeeDee Lamb fell 8 picks past ADP.",
      ],
    });
    expect(out.level).toBe("notable");
    expect(out.commentaryBudget.enabled).toBe(true);
    expect(hasAnalyticalEvidenceBeyondSelection(out)).toBe(true);
  });

  it("does not downgrade already-enabled major commentary with evidence", () => {
    const out = applyEarlyRoundWrittenFloor({
      ...base,
      level: "major",
      signals: ["REACH:strong"],
      permittedClaims: [
        "Alice selected CeeDee Lamb (WR) at pick 2, round 1.",
        "CeeDee Lamb went 15 picks ahead of ADP — a major reach.",
      ],
      commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    });
    expect(out.level).toBe("major");
    expect(out.commentaryBudget.maxWords).toBe(40);
  });

  it("detects bare selection claims", () => {
    expect(
      isBareSelectionClaim("Alice selected CeeDee Lamb (WR) at pick 2, round 1.", base),
    ).toBe(true);
    expect(isBareSelectionClaim("CeeDee Lamb fell 8 picks past ADP.", base)).toBe(false);
  });
});
