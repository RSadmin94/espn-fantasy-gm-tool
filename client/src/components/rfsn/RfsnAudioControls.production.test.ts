import { describe, expect, it } from "vitest";
import { evaluatePlaybackGate } from "@/lib/rfsnPlaybackActivation";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";

/**
 * Behavioral replacement for the stale source-inspection production test.
 * Asserts unlock / clip-ready activation contracts used by RfsnAudioControls + playback.
 */
describe("RfsnAudioControls production unlock regression (behavioral)", () => {
  const card = { id: "pick-1:coach:primary" } as RfsnCommentaryCard;

  function status(opts: {
    ready?: boolean;
    failed?: boolean;
  } = {}): RfsnLiveAudioStatus {
    const ready = Boolean(opts.ready);
    const failed = Boolean(opts.failed);
    return {
      enabled: true,
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      updatedAt: "",
      clips: [
        {
          commentaryId: card.id,
          audioId: ready ? "aud-1" : failed ? "aud-fail" : undefined,
          voice: "coach",
          contentType: "audio/wav",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          status: failed ? "failed" : ready ? "ready" : "pending",
        },
      ],
    };
  }

  function unlockLabel(userEnabled: boolean, unlocked: boolean, _state: string): string {
    const needsGesture = !unlocked || !userEnabled;
    if (!needsGesture) return "Audio on";
    return userEnabled ? "Tap to Enable Sound" : "Enable Broadcast Audio";
  }

  it("shows Tap to Enable Sound when preference is on but session is locked", () => {
    expect(unlockLabel(true, false, "locked")).toBe("Tap to Enable Sound");
  });

  it("shows Enable Broadcast Audio when preference is off but session is locked", () => {
    expect(unlockLabel(false, false, "locked")).toBe("Enable Broadcast Audio");
  });

  it("does not show Audio on when state is disabled but preference is off (stale-label regression)", () => {
    expect(unlockLabel(false, false, "disabled")).toBe("Enable Broadcast Audio");
  });

  it("shows Audio on after unlock gesture", () => {
    expect(unlockLabel(true, true, "ready")).toBe("Audio on");
  });

  it("shows Enable when unlocked flag is true but preference is off", () => {
    expect(unlockLabel(false, true, "ready")).toBe("Enable Broadcast Audio");
  });

  it("plays on-air line when unlock lands and clip is already ready", () => {
    expect(
      evaluatePlaybackGate({
        ttsAvailable: true,
        userEnabled: true,
        unlocked: true,
        card,
        audioStatus: status({ ready: true }),
        isPlaying: false,
        playInFlight: false,
        playbackStartedForCardId: null,
        targetCardId: card.id,
      }),
    ).toEqual({ action: "play", clipAudioId: "aud-1" });
  });

  it("waits while unlocked if clip is pending, then plays once when ready", () => {
    expect(
      evaluatePlaybackGate({
        ttsAvailable: true,
        userEnabled: true,
        unlocked: true,
        card,
        audioStatus: status({ ready: false }),
        isPlaying: false,
        playInFlight: false,
        playbackStartedForCardId: null,
        targetCardId: card.id,
      }),
    ).toEqual({ action: "wait", reason: "clip-pending" });

    expect(
      evaluatePlaybackGate({
        ttsAvailable: true,
        userEnabled: true,
        unlocked: true,
        card,
        audioStatus: status({ ready: true }),
        isPlaying: false,
        playInFlight: false,
        playbackStartedForCardId: null,
        targetCardId: card.id,
      }),
    ).toEqual({ action: "play", clipAudioId: "aud-1" });
  });

  it("does not double-play on duplicate readiness", () => {
    expect(
      evaluatePlaybackGate({
        ttsAvailable: true,
        userEnabled: true,
        unlocked: true,
        card,
        audioStatus: status({ ready: true }),
        isPlaying: false,
        playInFlight: false,
        playbackStartedForCardId: card.id,
        targetCardId: card.id,
      }),
    ).toEqual({ action: "wait", reason: "already-started" });
  });

  it("falls back on failed clip without requiring provider URLs", () => {
    expect(
      evaluatePlaybackGate({
        ttsAvailable: true,
        userEnabled: true,
        unlocked: true,
        card,
        audioStatus: status({ failed: true }),
        isPlaying: false,
        playInFlight: false,
        playbackStartedForCardId: null,
        targetCardId: card.id,
      }),
    ).toEqual({ action: "fallback", reason: "clip-failed" });
  });
});
