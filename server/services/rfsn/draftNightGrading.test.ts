/**
 * Shared draft-night grading unit checks.
 */
import { describe, expect, it } from "vitest";
import {
  computeOwnerDraftMetrics,
  type DraftNightPickInput,
} from "../../../shared/draftNightGrading";

describe("draftNightGrading", () => {
  it("ranks owners and exposes reach / value picks", () => {
    const picks: DraftNightPickInput[] = [
      { teamId: "1", ownerName: "A", playerName: "Steal", position: "WR", overallPick: 40, round: 3, adp: 10 },
      { teamId: "1", ownerName: "A", playerName: "RB", position: "RB", overallPick: 12, round: 1, adp: 14 },
      { teamId: "1", ownerName: "A", playerName: "TE", position: "TE", overallPick: 55, round: 4, adp: 60 },
      { teamId: "2", ownerName: "B", playerName: "Reach", position: "TE", overallPick: 5, round: 1, adp: 40 },
      { teamId: "2", ownerName: "B", playerName: "WR", position: "WR", overallPick: 20, round: 2, adp: 22 },
      { teamId: "2", ownerName: "B", playerName: "RB", position: "RB", overallPick: 33, round: 3, adp: 35 },
    ];
    const owners = computeOwnerDraftMetrics(picks);
    expect(owners).toHaveLength(2);
    expect(owners[0]!.rank).toBe(0);
    const b = owners.find((o) => o.ownerName === "B")!;
    expect(b.worstReach?.playerName).toBe("Reach");
    const a = owners.find((o) => o.ownerName === "A")!;
    expect(a.bestValuePick?.playerName).toBe("Steal");
  });
});
