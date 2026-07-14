import { describe, expect, it } from "vitest";
import {
  PLAYBACK_DURATION_GRACE_MS,
  PLAYBACK_MAX_WATCHDOG_MS,
  PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS,
  computePlaybackWatchdogMs,
  isReasonablePlaybackDurationSec,
  tryMarkPlaybackComplete,
} from "@/lib/rfsnPlaybackTerminal";

describe("rfsnPlaybackTerminal — watchdog policy", () => {
  it("uses duration + grace when duration is known and reasonable", () => {
    expect(computePlaybackWatchdogMs(10)).toBe(10_000 + PLAYBACK_DURATION_GRACE_MS);
    expect(computePlaybackWatchdogMs(2.5)).toBe(Math.ceil(2.5 * 1000) + PLAYBACK_DURATION_GRACE_MS);
  });

  it("caps watchdog at PLAYBACK_MAX_WATCHDOG_MS (never trusts ~66s metadata holds)", () => {
    expect(computePlaybackWatchdogMs(40)).toBe(PLAYBACK_MAX_WATCHDOG_MS);
    expect(computePlaybackWatchdogMs(62)).toBe(PLAYBACK_MAX_WATCHDOG_MS);
    expect(computePlaybackWatchdogMs(100)).toBe(PLAYBACK_MAX_WATCHDOG_MS);
    expect(isReasonablePlaybackDurationSec(62)).toBe(false);
    expect(isReasonablePlaybackDurationSec(10)).toBe(true);
  });

  it("uses bounded fallback when duration is unknown/invalid", () => {
    expect(computePlaybackWatchdogMs(undefined)).toBe(PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS);
    expect(computePlaybackWatchdogMs(null)).toBe(PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS);
    expect(computePlaybackWatchdogMs(NaN)).toBe(PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS);
    expect(computePlaybackWatchdogMs(0)).toBe(PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS);
    expect(computePlaybackWatchdogMs(-1)).toBe(PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS);
    expect(PLAYBACK_UNKNOWN_DURATION_WATCHDOG_MS).toBe(PLAYBACK_MAX_WATCHDOG_MS);
  });

  it("marks completion once per card attempt", () => {
    const first = tryMarkPlaybackComplete(null, "card-a");
    expect(first.alreadyComplete).toBe(false);
    const dup = tryMarkPlaybackComplete(first.next, "card-a");
    expect(dup.alreadyComplete).toBe(true);
    const other = tryMarkPlaybackComplete(first.next, "card-b");
    expect(other.alreadyComplete).toBe(false);
  });
});
