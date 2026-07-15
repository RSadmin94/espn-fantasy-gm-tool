import { describe, expect, it } from "vitest";
import { clipReadiness, evaluatePlaybackGate } from "@/lib/rfsnPlaybackActivation";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";
import type { RfsnCommentaryCard } from "@/lib/rfsnPresentation";

const CARD_ID = "pick-1:coach:primary";
const card = { id: CARD_ID } as RfsnCommentaryCard;

function audioStatus(
  clips: Array<{
    commentaryId: string;
    audioId?: string;
    status: "ready" | "pending" | "failed" | "expired";
  }>,
): RfsnLiveAudioStatus {
  return {
    enabled: true,
    draftId: "D",
    pickId: "pick-1",
    pickNumber: 1,
    updatedAt: "",
    clips: clips.map((c) => ({
      commentaryId: c.commentaryId,
      audioId: c.audioId,
      voice: "coach" as const,
      contentType: "audio/wav",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      status: c.status,
    })),
  };
}

function gate(overrides: Partial<Parameters<typeof evaluatePlaybackGate>[0]> = {}) {
  return evaluatePlaybackGate({
    ttsAvailable: true,
    userEnabled: true,
    unlocked: true,
    card,
    audioStatus: audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "ready" }]),
    isPlaying: false,
    playInFlight: false,
    playbackStartedForCardId: null,
    targetCardId: CARD_ID,
    ...overrides,
  });
}

describe("rfsnPlaybackActivation — race matrix", () => {
  it("clip ready before unlock waits until unlocked", () => {
    expect(gate({ unlocked: false })).toEqual({ action: "wait", reason: "locked" });
    expect(gate({ unlocked: true })).toEqual({ action: "play", clipAudioId: "aud-1" });
  });

  it("unlock before clip ready waits until clip is ready", () => {
    const pending = audioStatus([{ commentaryId: CARD_ID, status: "pending" }]);
    expect(gate({ audioStatus: pending })).toEqual({ action: "wait", reason: "clip-pending" });
    const ready = audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "ready" }]);
    expect(gate({ audioStatus: ready })).toEqual({ action: "play", clipAudioId: "aud-1" });
  });

  it("card registered before unlock waits, then plays once unlocked", () => {
    expect(gate({ unlocked: false, card })).toEqual({ action: "wait", reason: "locked" });
    expect(gate({ unlocked: true, card })).toEqual({ action: "play", clipAudioId: "aud-1" });
  });

  it("unlock while card already active plays when clip ready", () => {
    const ready = audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "ready" }]);
    expect(gate({ unlocked: true, audioStatus: ready, card })).toEqual({
      action: "play",
      clipAudioId: "aud-1",
    });
  });

  it("pending → ready transition allows exactly one play attempt", () => {
    const pending = audioStatus([{ commentaryId: CARD_ID, status: "pending" }]);
    expect(gate({ audioStatus: pending })).toEqual({ action: "wait", reason: "clip-pending" });
    const ready = audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "ready" }]);
    expect(gate({ audioStatus: ready })).toEqual({ action: "play", clipAudioId: "aud-1" });
    expect(
      gate({ audioStatus: ready, playbackStartedForCardId: CARD_ID }),
    ).toEqual({ action: "wait", reason: "already-started" });
  });

  it("duplicate readiness notifications do not double-play", () => {
    const ready = audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "ready" }]);
    expect(gate({ audioStatus: ready, isPlaying: true })).toEqual({
      action: "wait",
      reason: "already-playing",
    });
    expect(gate({ audioStatus: ready, playInFlight: true })).toEqual({
      action: "wait",
      reason: "already-playing",
    });
    expect(gate({ audioStatus: ready, playbackStartedForCardId: CARD_ID })).toEqual({
      action: "wait",
      reason: "already-started",
    });
  });

  it("failed clip releases via fallback and does not leave booth waiting on pending", () => {
    const failed = audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "failed" }]);
    expect(gate({ audioStatus: failed })).toEqual({ action: "fallback", reason: "clip-failed" });
    expect(clipReadiness(failed, CARD_ID)).toBe("failed");
  });

  it("expired clip falls back without play", () => {
    const expired = audioStatus([{ commentaryId: CARD_ID, audioId: "aud-1", status: "expired" }]);
    expect(gate({ audioStatus: expired })).toEqual({ action: "fallback", reason: "clip-expired" });
  });
});
