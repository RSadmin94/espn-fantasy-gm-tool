/**
 * Draft clock state machine — authoritative pacing for the Live Draft.
 *
 * Invariant: the draft engine is authoritative; the broadcast layer is observational.
 * Commentary may delay the clock briefly, but under no circumstance may booth state
 * permanently block pick advancement. After MAX_BROADCAST_HOLD_MS the draft continues
 * even if the booth remains busy — further holds from that same busy stretch are suppressed
 * until the booth returns to idle.
 *
 * States:
 *   running               — AI countdown active, time remaining
 *   urgent                — AI countdown active, at/under URGENT_MS
 *   manual_team_wait       — on-clock team is manually controlled; waiting for the user
 *   paused_for_broadcast   — a pick locked and a broadcast moment is holding the draft
 *   complete               — all picks made
 *
 * Flow:
 *   running/urgent --(countdown hits 0)--> AI pick locked --> advance immediately
 *   manual_team_wait --(user picks)------> pick locked ------> advance immediately
 *
 * Pausing is REACTIVE, not a post-pick grace: the clock pauses only while a broadcast moment
 * is actually on air (the booth reports "busy"), and resumes when it ends / is dismissed /
 * fails / hits the 20s watchdog. Routine (silent) picks are therefore never extended — they
 * run at exactly the configured pace.
 */
export type DraftClockState =
  | "running"
  | "urgent"
  | "paused_for_broadcast"
  | "manual_team_wait"
  | "complete";

/** Countdown at/under this shows the urgent state. */
export const URGENT_MS = 3000;

/** Hard cap on a broadcast hold — the draft can never freeze longer than this. */
export const MAX_BROADCAST_HOLD_MS = 20_000;

export function resolveClockState(input: {
  done: boolean;
  isManualPick: boolean;
  isHolding: boolean;
  remainingMs: number;
}): DraftClockState {
  if (input.done) return "complete";
  if (input.isHolding) return "paused_for_broadcast";
  if (input.isManualPick) return "manual_team_wait";
  return input.remainingMs <= URGENT_MS ? "urgent" : "running";
}

/**
 * Broadcast-hold reducer — keeps the draft from re-arming a pause after the watchdog.
 *
 * Without suppressUntilIdle, clearing `holding` while the booth is still busy immediately
 * starts another hold (permanent stall). After the watchdog, ignore busy until idle.
 */
export type BroadcastHoldState = {
  holding: boolean;
  /** Watchdog released this busy stretch; ignore busy until booth goes idle. */
  suppressUntilIdle: boolean;
  holdStartedAt: number | null;
};

export type BroadcastHoldEvent =
  | { type: "busy_changed"; busy: boolean; now: number }
  | { type: "watchdog"; now: number };

export const INITIAL_BROADCAST_HOLD: BroadcastHoldState = {
  holding: false,
  suppressUntilIdle: false,
  holdStartedAt: null,
};

export function reduceBroadcastHold(
  state: BroadcastHoldState,
  event: BroadcastHoldEvent,
  maxHoldMs: number = MAX_BROADCAST_HOLD_MS,
): BroadcastHoldState {
  if (event.type === "busy_changed") {
    if (!event.busy) {
      return { holding: false, suppressUntilIdle: false, holdStartedAt: null };
    }
    if (state.suppressUntilIdle || state.holding) return state;
    return { holding: true, suppressUntilIdle: false, holdStartedAt: event.now };
  }

  // watchdog
  if (!state.holding || state.holdStartedAt == null) return state;
  if (event.now - state.holdStartedAt < maxHoldMs) return state;
  return { holding: false, suppressUntilIdle: true, holdStartedAt: null };
}

/** Ms until the hold must release (0 if already expired / not holding). */
export function broadcastHoldRemainingMs(
  state: BroadcastHoldState,
  now: number,
  maxHoldMs: number = MAX_BROADCAST_HOLD_MS,
): number {
  if (!state.holding || state.holdStartedAt == null) return 0;
  return Math.max(0, maxHoldMs - (now - state.holdStartedAt));
}

/**
 * A team is manually controlled (never auto-picks; its clock waits for the user) iff it is
 * in the single source of truth `manualTeamIds`. Zero entries = full AI draft; every team =
 * fully manual draft.
 */
export function isPickManual(
  manualTeamIds: ReadonlySet<number>,
  teamId: number | null | undefined,
): boolean {
  return teamId != null && manualTeamIds.has(Number(teamId));
}

/** mm:ss for a millisecond countdown (floored, never negative). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const CLOCK_STATE_LABEL: Record<DraftClockState, string> = {
  running: "On the clock",
  urgent: "On the clock",
  paused_for_broadcast: "Paused for RFSN Broadcast",
  manual_team_wait: "Your pick",
  complete: "Draft complete",
};

export type DraftPace = "broadcast" | "brisk" | "turbo";

/** Map Live Draft pace timer to server moment-classification profile. */
export function draftPaceFromTimerMs(paceMs: number): DraftPace {
  if (paceMs >= 8000) return "broadcast";
  if (paceMs >= 2000) return "brisk";
  return "turbo";
}
