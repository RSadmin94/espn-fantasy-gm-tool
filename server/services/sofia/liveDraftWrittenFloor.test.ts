import { describe, expect, it } from "vitest";
import { applyEarlyRoundWrittenFloor } from "./liveDraftWrittenFloor";
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

describe("applyEarlyRoundWrittenFloor", () => {
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

  it("elevates routine rounds 1–3 to written notable", () => {
    const out = applyEarlyRoundWrittenFloor(base);
    expect(out.level).toBe("notable");
    expect(out.commentaryBudget.enabled).toBe(true);
    expect(out.permittedClaims[0]).toContain("CeeDee Lamb");
  });

  it("leaves round 4+ routine silence alone", () => {
    const out = applyEarlyRoundWrittenFloor({ ...base, round: 4, overallPick: 40 });
    expect(out.level).toBe("routine");
    expect(out.commentaryBudget.enabled).toBe(false);
  });

  it("does not downgrade already-enabled commentary", () => {
    const out = applyEarlyRoundWrittenFloor({
      ...base,
      level: "major",
      commentaryBudget: { enabled: true, maxSentences: 2, maxWords: 40 },
    });
    expect(out.level).toBe("major");
    expect(out.commentaryBudget.maxWords).toBe(40);
  });
});
