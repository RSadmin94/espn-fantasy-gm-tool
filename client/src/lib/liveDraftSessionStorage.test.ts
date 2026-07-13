import { describe, expect, it } from "vitest";
import {
  buildLiveDraftScheduleSig,
  clearAllLiveDraftSessionsForDraft,
  liveDraftSessionStorageKey,
  readLiveDraftSession,
  writeLiveDraftSession,
} from "./liveDraftSessionStorage";

describe("buildLiveDraftScheduleSig", () => {
  it("ignores mock-predicted open-pick player churn", () => {
    const a = [
      { pickNumber: 1, teamId: 3, isKeeperSlot: false, player: "Ja'Marr Chase" },
      { pickNumber: 2, teamId: 7, isKeeperSlot: false, player: "Christian McCaffrey" },
    ];
    const b = [
      { pickNumber: 1, teamId: 3, isKeeperSlot: false, player: "Jahmyr Gibbs" },
      { pickNumber: 2, teamId: 7, isKeeperSlot: false, player: "Jonathan Taylor" },
    ];
    expect(buildLiveDraftScheduleSig(a)).toBe(buildLiveDraftScheduleSig(b));
  });

  it("still changes when keeper slot assignment changes", () => {
    const before = [{ pickNumber: 5, teamId: 2, isKeeperSlot: true, player: "Player A" }];
    const after = [{ pickNumber: 5, teamId: 2, isKeeperSlot: true, player: "Player B" }];
    expect(buildLiveDraftScheduleSig(before)).not.toBe(buildLiveDraftScheduleSig(after));
  });
});

describe("clearAllLiveDraftSessionsForDraft", () => {
  it("removes every persisted engine session for a draft across schedule signatures", () => {
    const scheduleA = [{ pickNumber: 1, teamId: 3, isKeeperSlot: false, player: "A" }];
    const scheduleB = [{ pickNumber: 1, teamId: 3, isKeeperSlot: false, player: "B" }];
    const keyA = liveDraftSessionStorageKey("457622", "war-room-live-2026", buildLiveDraftScheduleSig(scheduleA));
    const keyB = liveDraftSessionStorageKey("457622", "war-room-live-2026", buildLiveDraftScheduleSig(scheduleB));
    const completed = {
      idx: 196,
      running: false,
      results: { 196: { name: "Player Z" } },
      manualTeamIds: [],
      pauseOnMyPicks: false,
      draftSeed: 42,
      paceMs: 3500,
    };
    writeLiveDraftSession(keyA, completed);
    writeLiveDraftSession(keyB, completed);
    clearAllLiveDraftSessionsForDraft("457622", "war-room-live-2026");
    expect(readLiveDraftSession(keyA)).toBeNull();
    expect(readLiveDraftSession(keyB)).toBeNull();
  });
});
