/**
 * Playback terminal-state policy for RFSN audio.
 * Every started clip must reach exactly one: ended | error | abort | timed_out.
 */

export type PlaybackTerminalReason = "ended" | "error" | "abort" | "timed_out";

/** Grace after known clip duration before declaring timed_out. */
export const PLAYBACK_DURATION_GRACE_MS = 4_000;

/**
 * Hard ceiling for any commentary hold.
 * Also used as the unknown-duration fallback.
 * Prevents a bad/inflated metadata duration from holding the booth (~66s).
 */
export const PLAYBACK_MAX_WATCHDOG_MS = 30_000;

/** Fallback when HTMLMediaElement.duration is unavailable/NaN. */
export const PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS = PLAYBACK_MAX_WATCHDOG_MS;

/** Stalled/waiting without progress — terminate before unknown-duration max. */
export const PLAYBACK_STALL_GRACE_MS = 12_000;

/** Raw media duration above this is treated as untrustworthy metadata. */
export const PLAYBACK_MAX_REASONABLE_DURATION_SEC =
  (PLAYBACK_MAX_WATCHDOG_MS - PLAYBACK_DURATION_GRACE_MS) / 1000;

export function isReasonablePlaybackDurationSec(
  durationSec: number | null | undefined,
): boolean {
  return (
    typeof durationSec === "number" &&
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    durationSec <= PLAYBACK_MAX_REASONABLE_DURATION_SEC
  );
}

/**
 * Watchdog delay after playback starts:
 * - reasonable duration → min(duration + 4s, 30s)
 * - missing/invalid/unreasonable → 30s bounded fallback
 */
export function computePlaybackWatchdogMs(durationSec: number | null | undefined): number {
  if (isReasonablePlaybackDurationSec(durationSec)) {
    const based = Math.ceil((durationSec as number) * 1000) + PLAYBACK_DURATION_GRACE_MS;
    return Math.min(based, PLAYBACK_MAX_WATCHDOG_MS);
  }
  return PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS;
}

export type PlaybackCompletionRecord = {
  cardId: string;
  reason: PlaybackTerminalReason;
  at: number;
};

/** Idempotent: returns true only for the first completion for this card attempt. */
export function tryMarkPlaybackComplete(
  completedForCardId: string | null,
  cardId: string,
): { alreadyComplete: boolean; next: string } {
  if (completedForCardId === cardId) {
    return { alreadyComplete: true, next: completedForCardId };
  }
  return { alreadyComplete: false, next: cardId };
}
