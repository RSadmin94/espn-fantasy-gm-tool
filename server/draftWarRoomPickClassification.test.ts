import { describe, it, expect } from "vitest";
import { enrichDraftPickDbRow, summarizeDraftBoardCounts } from "./draftWarRoomPickClassification";

describe("draftWarRoomPickClassification", () => {
  it("treats ESPN keeper rawPick as keeperSlot, not open-draft", () => {
    const row = enrichDraftPickDbRow({
      teamId: 1,
      roundId: 3,
      roundPick: 5,
      overallPick: 29,
      playerName: "Josh Allen",
      position: "QB",
      isKeeper: 0,
      rawPick: JSON.stringify({ keeper: true, reservedForKeeper: false }),
    });
    expect(row.keeperSlot).toBe(true);
    expect(row.draftedForAnalytics).toBe(false);
  });

  it("treats retained rawPick as keeperSlot, not open-draft", () => {
    const row = enrichDraftPickDbRow({
      teamId: 2,
      roundId: 2,
      roundPick: 1,
      overallPick: 13,
      playerName: "Dynasty Stash",
      position: "RB",
      isKeeper: 0,
      rawPick: JSON.stringify({ keeper: false, reservedForKeeper: true }),
    });
    expect(row.keeperSlot).toBe(true);
    expect(row.retained).toBe(true);
    expect(row.draftedForAnalytics).toBe(false);
  });

  it("treats normal draft selection as open-draft", () => {
    const row = enrichDraftPickDbRow({
      teamId: 3,
      roundId: 5,
      roundPick: 3,
      overallPick: 55,
      playerName: "Rookie WR",
      position: "WR",
      isKeeper: 0,
      rawPick: JSON.stringify({ keeper: false, reservedForKeeper: false }),
    });
    expect(row.keeperSlot).toBe(false);
    expect(row.draftedForAnalytics).toBe(true);
  });

  it("480452315-style regression: 276 slots = 36 open + 240 keeper rows", () => {
    const rows = [
      ...Array.from({ length: 36 }, () =>
        enrichDraftPickDbRow({
          teamId: 1,
          roundId: 1,
          roundPick: 1,
          overallPick: 1,
          playerName: "Open",
          position: "RB",
          isKeeper: 0,
          rawPick: JSON.stringify({ keeper: false, reservedForKeeper: false }),
        }),
      ),
      ...Array.from({ length: 240 }, () =>
        enrichDraftPickDbRow({
          teamId: 1,
          roundId: 1,
          roundPick: 1,
          overallPick: 1,
          playerName: "K",
          position: "RB",
          isKeeper: 0,
          rawPick: JSON.stringify({ keeper: true, reservedForKeeper: false }),
        }),
      ),
    ];
    const s = summarizeDraftBoardCounts(rows);
    expect(s.boardSlotCount).toBe(276);
    expect(s.openDraftPickCount).toBe(36);
    expect(s.keeperSlotCount).toBe(240);
  });

  it("457622-style regression: 196 = 192 open + 4 keeper/retained", () => {
    const rows = [
      ...Array.from({ length: 192 }, () =>
        enrichDraftPickDbRow({
          teamId: 1,
          roundId: 1,
          roundPick: 1,
          overallPick: 1,
          playerName: "Open",
          position: "WR",
          isKeeper: 0,
          rawPick: JSON.stringify({ keeper: false, reservedForKeeper: false }),
        }),
      ),
      ...Array.from({ length: 2 }, () =>
        enrichDraftPickDbRow({
          teamId: 1,
          roundId: 1,
          roundPick: 1,
          overallPick: 1,
          playerName: "K1",
          position: "RB",
          isKeeper: 0,
          rawPick: JSON.stringify({ keeper: true, reservedForKeeper: false }),
        }),
      ),
      ...Array.from({ length: 2 }, () =>
        enrichDraftPickDbRow({
          teamId: 1,
          roundId: 1,
          roundPick: 1,
          overallPick: 1,
          playerName: "R1",
          position: "TE",
          isKeeper: 0,
          rawPick: JSON.stringify({ keeper: false, reservedForKeeper: true }),
        }),
      ),
    ];
    const s = summarizeDraftBoardCounts(rows);
    expect(s.boardSlotCount).toBe(196);
    expect(s.openDraftPickCount).toBe(192);
    expect(s.keeperSlotCount).toBe(4);
    expect(s.retainedSlotCount).toBe(2);
  });
});
