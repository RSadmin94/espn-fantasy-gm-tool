import { describe, it, expect } from "vitest";
import { summarizeDraftTruthBoard } from "./draftTruth/boardSummary";

function openPick() {
  return { keeper: false, reservedForKeeper: false };
}
function keeperPick() {
  return { keeper: true, reservedForKeeper: false };
}
function retainedPick() {
  return { keeper: false, reservedForKeeper: true };
}

describe("summarizeDraftTruthBoard (Phase 3E ROI / Player DB certification)", () => {
  it("480452315-style 2025: 276 board, 36 open, 240 keeper, 0 retained → roiRows = open", () => {
    const picks = [
      ...Array.from({ length: 36 }, () => openPick()),
      ...Array.from({ length: 240 }, () => keeperPick()),
    ];
    const s = summarizeDraftTruthBoard(picks);
    expect(s.boardSlots).toBe(276);
    expect(s.openDraftPicks).toBe(36);
    expect(s.keeperSlots).toBe(240);
    expect(s.retainedSlots).toBe(0);
    expect(s.roiRows).toBe(36);
    expect(s.unknownSlots).toBe(0);
  });

  it("480452315-style 2026: 276 board, 36 open, 0 keeper, 240 retained", () => {
    const picks = [
      ...Array.from({ length: 36 }, () => openPick()),
      ...Array.from({ length: 240 }, () => retainedPick()),
    ];
    const s = summarizeDraftTruthBoard(picks);
    expect(s.boardSlots).toBe(276);
    expect(s.openDraftPicks).toBe(36);
    expect(s.keeperSlots).toBe(0);
    expect(s.retainedSlots).toBe(240);
    expect(s.roiRows).toBe(36);
  });

  it("KEEPER and RETAINED rows never count as open / ROI rows", () => {
    const s = summarizeDraftTruthBoard([keeperPick(), retainedPick(), openPick()]);
    expect(s.openDraftPicks).toBe(1);
    expect(s.roiRows).toBe(1);
    expect(s.keeperSlots).toBe(1);
    expect(s.retainedSlots).toBe(1);
  });

  it("UNKNOWN rows do not increase openDraftPicks", () => {
    const s = summarizeDraftTruthBoard([null, 42, "x", openPick()]);
    expect(s.boardSlots).toBe(4);
    expect(s.unknownSlots).toBe(3);
    expect(s.openDraftPicks).toBe(1);
    expect(s.roiRows).toBe(1);
  });
});
