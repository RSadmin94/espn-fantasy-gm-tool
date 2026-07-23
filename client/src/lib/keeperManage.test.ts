import { describe, expect, it } from "vitest";
import {
  countKeepersForOwner,
  formatKeeperRoundPick,
  isPlayerAlreadyKept,
  keeperAddBlockReason,
  keeperSlotsLabel,
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
