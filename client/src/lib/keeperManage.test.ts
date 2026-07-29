import { describe, expect, it } from "vitest";
import {
  countKeepersForOwner,
  formatKeeperRoundPick,
  headerKeeperPickerIntent,
  isPlayerAlreadyKept,
  keeperAddBlockReason,
  keeperSlotsLabel,
  planKeeperReplace,
  resolveMyOwnerKey,
  type ManualKeeperRow,
} from "./keeperManage";

describe("keeperManage helpers", () => {
  const sels = [
    { ownerKey: "a", playerId: 1 },
    { ownerKey: "a", playerId: 2 },
    { ownerKey: "b", playerId: 3 },
  ];

  it("counts keepers per owner", () => {
    expect(countKeepersForOwner(sels, "a")).toBe(2);
    expect(countKeepersForOwner(sels, "b")).toBe(1);
    expect(countKeepersForOwner(sels, "c")).toBe(0);
  });

  it("detects duplicate players", () => {
    expect(isPlayerAlreadyKept(sels, 2)).toBe(true);
    expect(isPlayerAlreadyKept(sels, 99)).toBe(false);
  });

  it("blocks add when duplicate or at multi-slot limit", () => {
    expect(
      keeperAddBlockReason({ selections: sels, ownerKey: "a", playerId: 1, keeperLimit: 3 }),
    ).toMatch(/already a keeper/i);
    expect(
      keeperAddBlockReason({ selections: sels, ownerKey: "a", playerId: 9, keeperLimit: 2 }),
    ).toMatch(/limit reached/i);
    expect(
      keeperAddBlockReason({ selections: sels, ownerKey: "a", playerId: 9, keeperLimit: 3 }),
    ).toBeNull();
    expect(
      keeperAddBlockReason({ selections: sels, ownerKey: "a", playerId: 9, keeperLimit: 1 }),
    ).toBeNull(); // server replaces when limit is 1
  });

  it("formats round pick and slots label", () => {
    expect(formatKeeperRoundPick(0)).toMatch(/auto/i);
    expect(formatKeeperRoundPick(1)).toMatch(/1st/i);
    expect(keeperSlotsLabel(2, 3)).toBe("2 of 3 keeper slots used");
    expect(keeperSlotsLabel(1, null)).toBe("1 keeper selected");
  });
});

describe("Keeper Center fix regressions", () => {
  const teams = [
    { ownerKey: "id:aaa" },
    { ownerKey: "id:bbb" },
  ];

  it("unmatched owner key returns no My Team context", () => {
    expect(resolveMyOwnerKey(teams, "id:zzz")).toBeNull();
    expect(resolveMyOwnerKey(teams, "")).toBeNull();
    expect(resolveMyOwnerKey(teams, null)).toBeNull();
    expect(resolveMyOwnerKey(teams, "id:AAA")).toBe("id:aaa"); // fuzzy
    expect(resolveMyOwnerKey(teams, "id:bbb")).toBe("id:bbb");
  });

  it("limit=1 header CTA opens change mode with the existing selection", () => {
    const existing: ManualKeeperRow = {
      ownerKey: "id:aaa",
      playerId: 42,
      playerName: "Trey McBride",
      position: "TE",
      keeperRoundPick: 0,
    };
    const withKeeper = headerKeeperPickerIntent([existing]);
    expect(withKeeper.mode).toBe("change");
    expect(withKeeper.replace).toEqual(existing);

    const empty = headerKeeperPickerIntent([]);
    expect(empty.mode).toBe("add");
    expect(empty.replace).toBeUndefined();
  });

  it("failed replacement does not leave the keeper slot empty", () => {
    const prior: ManualKeeperRow = {
      ownerKey: "owner-a",
      playerId: 1,
      playerName: "Old Keeper",
      position: "RB",
      keeperRoundPick: 1,
    };

    // Single-keeper: server atomically replaces — never delete-first.
    const single = planKeeperReplace({
      keeperLimit: 1,
      replace: prior,
      nextPlayerId: 99,
    });
    expect(single.removeFirst).toBe(false);
    expect(single.restoreOnAddFailure).toBe(false);
    expect(single.strategy).toBe("atomic_keep");

    // Multi-slot swap: remove-then-add must restore prior if add fails.
    const multi = planKeeperReplace({
      keeperLimit: 3,
      replace: prior,
      nextPlayerId: 99,
    });
    expect(multi.removeFirst).toBe(true);
    expect(multi.restoreOnAddFailure).toBe(true);

    // Simulate multi-slot failure path: after remove, slot empty; restore puts prior back.
    let workspace = [prior];
    if (multi.removeFirst) {
      workspace = workspace.filter((s) => s.playerId !== prior.playerId);
    }
    expect(workspace).toHaveLength(0);
    const addSucceeded = false;
    if (!addSucceeded && multi.restoreOnAddFailure) {
      workspace = [...workspace, prior];
    }
    expect(workspace).toEqual([prior]);
  });
});
