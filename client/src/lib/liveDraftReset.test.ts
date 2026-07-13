import { describe, expect, it } from "vitest";
import { isAiCountdownActive } from "@/lib/draftManualTeams";
import {
  buildLiveDraftScheduleSig,
  clearAllLiveDraftSessionsForDraft,
  liveDraftSessionStorageKey,
  readLiveDraftSession,
  writeLiveDraftSession,
} from "@/lib/liveDraftSessionStorage";

/** Mirrors LiveDraftEngine pick-fire gate after reset + start. */
function wouldScheduleNextPick(input: {
  idx: number;
  scheduleLength: number;
  running: boolean;
  holding: boolean;
  onClockIsManual: boolean;
  remainingMs: number;
}): boolean {
  const done = input.idx >= input.scheduleLength;
  return (
    input.remainingMs === 0 &&
    isAiCountdownActive({
      running: input.running,
      done,
      holding: input.holding,
      onClockIsManual: input.onClockIsManual,
      isKeeperSlot: false,
    })
  );
}

describe("live draft reset after draft_complete", () => {
  it("clears completed persistence and allows the first pick to advance after start", () => {
    const schedule = [
      { pickNumber: 1, teamId: 1, isKeeperSlot: false, player: "A" },
      { pickNumber: 2, teamId: 2, isKeeperSlot: false, player: "B" },
    ];
    const sig = buildLiveDraftScheduleSig(schedule);
    const key = liveDraftSessionStorageKey("457622", "war-room-live-2026", sig);
    writeLiveDraftSession(key, {
      idx: 2,
      running: false,
      results: {
        1: { name: "Player One", position: "RB" },
        2: { name: "Player Two", position: "WR" },
      },
      manualTeamIds: [],
      pauseOnMyPicks: false,
      draftSeed: 11,
      paceMs: 500,
    });

    clearAllLiveDraftSessionsForDraft("457622", "war-room-live-2026");
    expect(readLiveDraftSession(key)).toBeNull();

    const afterResetStart = {
      idx: 0,
      scheduleLength: 2,
      running: true,
      holding: false,
      onClockIsManual: false,
      remainingMs: 0,
    };
    expect(wouldScheduleNextPick(afterResetStart)).toBe(true);
    expect(afterResetStart.idx + 1).toBe(1);
  });
});
