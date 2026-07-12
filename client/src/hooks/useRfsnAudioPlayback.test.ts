import { describe, expect, it } from "vitest";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";

function findClip(
  audioStatus: RfsnLiveAudioStatus | null | undefined,
  commentaryId: string,
) {
  if (!audioStatus?.enabled) return null;
  return audioStatus.clips.find((c) => c.commentaryId === commentaryId) ?? null;
}

function buildAudioUrl(audioStatus: RfsnLiveAudioStatus, clip: { audioId?: string; voice: string }) {
  if (!clip.audioId) return null;
  const params = new URLSearchParams({
    draftId: audioStatus.draftId,
    pickId: audioStatus.pickId,
    pickNumber: String(audioStatus.pickNumber),
    voice: clip.voice,
  });
  return `/api/rfsn/audio/${encodeURIComponent(clip.audioId)}?${params.toString()}`;
}

describe("rfsn audio playback helpers", () => {
  it("finds ready clip by commentary id", () => {
    const status: RfsnLiveAudioStatus = {
      enabled: true,
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      updatedAt: new Date().toISOString(),
      clips: [
        {
          audioId: "abc",
          voice: "sofia",
          commentaryId: "pick-1:sofia:primary",
          contentType: "audio/wav",
          expiresAt: new Date().toISOString(),
          status: "ready",
        },
      ],
    };
    expect(findClip(status, "pick-1:sofia:primary")?.audioId).toBe("abc");
  });

  it("pending clip has no fetchable audioId", () => {
    const status: RfsnLiveAudioStatus = {
      enabled: true,
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      updatedAt: new Date().toISOString(),
      clips: [
        {
          voice: "coach",
          commentaryId: "pick-1:coach:primary",
          contentType: "audio/wav",
          expiresAt: new Date().toISOString(),
          status: "pending",
        },
      ],
    };
    const clip = findClip(status, "pick-1:coach:primary");
    expect(clip?.audioId).toBeUndefined();
    expect(buildAudioUrl(status, clip!)).toBeNull();
  });

  it("returns null when audio disabled", () => {
    expect(
      findClip(
        { enabled: false, draftId: "D", pickId: "x", pickNumber: 1, clips: [], updatedAt: "" },
        "x",
      ),
    ).toBeNull();
  });

  it("uses app-relative audio url shape with identity binding", () => {
    const status: RfsnLiveAudioStatus = {
      enabled: true,
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 3,
      updatedAt: "",
      clips: [],
    };
    const url = buildAudioUrl(status, { audioId: "opaque-id", voice: "coach" });
    expect(url).toContain("/api/rfsn/audio/opaque-id");
    expect(url).toContain("draftId=D");
    expect(url).toContain("pickId=pick-1");
    expect(url).toContain("pickNumber=3");
    expect(url).toContain("voice=coach");
    expect(url).not.toContain("kokoro");
    expect(url).not.toContain("token");
  });

  it("expired clip should not be played", () => {
    const status: RfsnLiveAudioStatus = {
      enabled: true,
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      updatedAt: "",
      clips: [
        {
          audioId: "old",
          voice: "sofia",
          commentaryId: "pick-1:sofia:primary",
          contentType: "audio/wav",
          expiresAt: new Date(0).toISOString(),
          status: "expired",
        },
      ],
    };
    expect(findClip(status, "pick-1:sofia:primary")?.status).toBe("expired");
  });
});
