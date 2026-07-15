import { describe, it, expect } from "vitest";
import { classifyDraftPickRawPick, SlotClass } from "./draftTruth";

/** Mirrors owner profile aggregation: board vs drafted vs keeper-slot counts. */
function summarizeBoard(rows: Array<{ raw: string }>) {
  let board = 0;
  let drafted = 0;
  let keeperSlot = 0;
  let retained = 0;
  let strictKeeper = 0;
  for (const { raw } of rows) {
    const t = classifyDraftPickRawPick(JSON.parse(raw));
    board++;
    if (t.draftedForAnalytics) drafted++;
    if (t.keeperSlot) keeperSlot++;
    if (t.slotClass === SlotClass.RETAINED) retained++;
    if (t.slotClass === SlotClass.KEEPER) strictKeeper++;
  }
  return { board, drafted, keeperSlot, retained, strictKeeper };
}

describe("Owner profile Draft DNA — Phase 3B slot aggregation", () => {
  it("480452315-style 2026 early board: reserved only → drafted count excludes those rows", () => {
    const early = Array.from({ length: 10 }, () =>
      JSON.stringify({ keeper: false, reservedForKeeper: true }),
    ).map((raw) => ({ raw }));
    const tail = Array.from({ length: 4 }, () =>
      JSON.stringify({ keeper: false, reservedForKeeper: false }),
    ).map((raw) => ({ raw }));
    const s = summarizeBoard([...early, ...tail]);
    expect(s.board).toBe(14);
    expect(s.drafted).toBe(4);
    expect(s.keeperSlot).toBe(10);
    expect(s.retained).toBe(10);
    expect(s.strictKeeper).toBe(0);
  });

  it("480452315-style 2024 early board: both true → keeper slot, not drafted", () => {
    const early = Array.from({ length: 10 }, () =>
      JSON.stringify({ keeper: true, reservedForKeeper: true }),
    ).map((raw) => ({ raw }));
    const tail = [{ raw: JSON.stringify({ keeper: false, reservedForKeeper: false }) }];
    const s = summarizeBoard([...early, ...tail]);
    expect(s.drafted).toBe(1);
    expect(s.strictKeeper).toBe(10);
    expect(s.retained).toBe(0);
  });

  it("457622-style 2026: four retained-only rows", () => {
    const rows = [
      { raw: JSON.stringify({ keeper: false, reservedForKeeper: true }) },
      { raw: JSON.stringify({ keeper: false, reservedForKeeper: true }) },
      { raw: JSON.stringify({ keeper: false, reservedForKeeper: true }) },
      { raw: JSON.stringify({ keeper: false, reservedForKeeper: true }) },
      { raw: JSON.stringify({ keeper: false, reservedForKeeper: false }) },
    ];
    const s = summarizeBoard(rows);
    expect(s.board).toBe(5);
    expect(s.drafted).toBe(1);
    expect(s.retained).toBe(4);
    expect(s.keeperSlot).toBe(4);
  });
});
