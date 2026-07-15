import { describe, expect, it } from "vitest";
import type { ReceiptContext } from "../draftMoments/draftMomentReceiptService";
import {
  applyLiveRivalryOverlay,
  liveDraftOwnerKey,
} from "./liveDraftRivalryOverlay";

function emptyCtx(): ReceiptContext {
  return {
    leagueId: "L1",
    adpByName: new Map(),
    registry: [],
    historyByKey: new Map(),
    seasonsByKey: new Map(),
    rivalById: new Map(),
    focalMemberId: "",
    dpWindow: null,
    teamCount: 14,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DP: 1 },
  };
}

describe("liveDraftRivalryOverlay", () => {
  it("keys rivals with live draft PID_* owner ids", () => {
    expect(liveDraftOwnerKey("Alice Smith")).toBe("PID_ALICE_SMITH");
  });

  it("applies grounded rivalry without inventing pairs", () => {
    const ctx = applyLiveRivalryOverlay(emptyCtx(), {
      focalOwnerName: "Rod",
      rivals: [{ ownerName: "Alice", heat: "Heated" }],
    });
    expect(ctx.focalMemberId).toBe("PID_ROD");
    expect(ctx.rivalById.get("PID_ALICE")).toEqual({ rivalName: "Alice", heat: "Heated" });
  });

  it("leaves context unchanged when rivalry is missing", () => {
    const base = emptyCtx();
    const ctx = applyLiveRivalryOverlay(base, null);
    expect(ctx.focalMemberId).toBe("");
    expect(ctx.rivalById.size).toBe(0);
  });
});
