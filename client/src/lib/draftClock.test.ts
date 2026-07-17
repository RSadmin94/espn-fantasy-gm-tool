import { describe, expect, it } from "vitest";
import {
  CLOCK_STATE_LABEL,
  INITIAL_BROADCAST_HOLD,
  MAX_BROADCAST_HOLD_MS,
  URGENT_MS,
  broadcastHoldRemainingMs,
  formatClock,
  isPickManual,
  reduceBroadcastHold,
  resolveClockState,
} from "./draftClock";

describe("resolveClockState", () => {
  const base = { done: false, isManualPick: false, isHolding: false, remainingMs: 9000 };

  it("complete wins over everything", () => {
    expect(resolveClockState({ ...base, done: true, isHolding: true, isManualPick: true })).toBe("complete");
  });
  it("broadcast hold outranks manual and countdown", () => {
    expect(resolveClockState({ ...base, isHolding: true, isManualPick: true })).toBe("paused_for_broadcast");
  });
  it("manual pick waits when not holding", () => {
    expect(resolveClockState({ ...base, isManualPick: true })).toBe("manual_team_wait");
  });
  it("running with time on the clock", () => {
    expect(resolveClockState({ ...base, remainingMs: URGENT_MS + 1 })).toBe("running");
  });
  it("urgent at/under the threshold", () => {
    expect(resolveClockState({ ...base, remainingMs: URGENT_MS })).toBe("urgent");
    expect(resolveClockState({ ...base, remainingMs: 0 })).toBe("urgent");
  });
});

describe("isPickManual — manual-control selection semantics", () => {
  const T = (...ids: number[]) => new Set<number>(ids);

  it("zero selected = full AI (no team is manual)", () => {
    const m = T();
    expect(isPickManual(m, 3)).toBe(false);
    expect(isPickManual(m, 11)).toBe(false);
  });
  it("one selected = only that team is manual", () => {
    const m = T(11);
    expect(isPickManual(m, 11)).toBe(true);
    expect(isPickManual(m, 3)).toBe(false);
  });
  it("multiple selected = each selected team is manual", () => {
    const m = T(3, 7, 11);
    expect(isPickManual(m, 3)).toBe(true);
    expect(isPickManual(m, 7)).toBe(true);
    expect(isPickManual(m, 11)).toBe(true);
    expect(isPickManual(m, 5)).toBe(false);
  });
  it("all selected = fully manual draft", () => {
    const all = T(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14);
    for (let id = 1; id <= 14; id++) expect(isPickManual(all, id)).toBe(true);
  });
  it("coerces string-like team ids and ignores null", () => {
    const m = T(11);
    expect(isPickManual(m, "11" as unknown as number)).toBe(true);
    expect(isPickManual(m, null)).toBe(false);
    expect(isPickManual(m, undefined)).toBe(false);
  });
});

describe("formatClock", () => {
  it("formats mm:ss and never goes negative", () => {
    expect(formatClock(9000)).toBe("0:09");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(-500)).toBe("0:00");
  });
});

describe("labels", () => {
  it("paused state announces the broadcast pause reason", () => {
    expect(CLOCK_STATE_LABEL.paused_for_broadcast).toMatch(/RFSN Broadcast/i);
  });
});

describe("reduceBroadcastHold — draft stays authoritative over a stuck booth", () => {
  const t0 = 1_000_000;

  it("starts a hold when the booth becomes busy", () => {
    const next = reduceBroadcastHold(INITIAL_BROADCAST_HOLD, {
      type: "busy_changed",
      busy: true,
      now: t0,
    });
    expect(next).toEqual({ holding: true, suppressUntilIdle: false, holdStartedAt: t0 });
  });

  it("releases immediately when the booth goes idle", () => {
    const held = reduceBroadcastHold(INITIAL_BROADCAST_HOLD, {
      type: "busy_changed",
      busy: true,
      now: t0,
    });
    const next = reduceBroadcastHold(held, { type: "busy_changed", busy: false, now: t0 + 500 });
    expect(next).toEqual(INITIAL_BROADCAST_HOLD);
  });

  it("watchdog releases a stuck hold and suppresses re-arm until idle", () => {
    let state = reduceBroadcastHold(INITIAL_BROADCAST_HOLD, {
      type: "busy_changed",
      busy: true,
      now: t0,
    });
    state = reduceBroadcastHold(state, {
      type: "watchdog",
      now: t0 + MAX_BROADCAST_HOLD_MS,
    });
    expect(state.holding).toBe(false);
    expect(state.suppressUntilIdle).toBe(true);

    // Same busy stretch must not re-hold the draft.
    state = reduceBroadcastHold(state, {
      type: "busy_changed",
      busy: true,
      now: t0 + MAX_BROADCAST_HOLD_MS + 1,
    });
    expect(state.holding).toBe(false);
    expect(state.suppressUntilIdle).toBe(true);
  });

  it("after idle, a new busy moment may hold again", () => {
    let state = reduceBroadcastHold(INITIAL_BROADCAST_HOLD, {
      type: "busy_changed",
      busy: true,
      now: t0,
    });
    state = reduceBroadcastHold(state, {
      type: "watchdog",
      now: t0 + MAX_BROADCAST_HOLD_MS,
    });
    state = reduceBroadcastHold(state, {
      type: "busy_changed",
      busy: false,
      now: t0 + MAX_BROADCAST_HOLD_MS + 100,
    });
    state = reduceBroadcastHold(state, {
      type: "busy_changed",
      busy: true,
      now: t0 + MAX_BROADCAST_HOLD_MS + 200,
    });
    expect(state.holding).toBe(true);
    expect(state.suppressUntilIdle).toBe(false);
  });

  it("broadcastHoldRemainingMs hits 0 at the cap", () => {
    const held = reduceBroadcastHold(INITIAL_BROADCAST_HOLD, {
      type: "busy_changed",
      busy: true,
      now: t0,
    });
    expect(broadcastHoldRemainingMs(held, t0 + MAX_BROADCAST_HOLD_MS + 50)).toBe(0);
    expect(broadcastHoldRemainingMs(held, t0 + 5_000)).toBe(MAX_BROADCAST_HOLD_MS - 5_000);
  });
});
