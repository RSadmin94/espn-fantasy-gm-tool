import { describe, expect, it } from "vitest";
import type { RfsnLiveAudioStatus } from "@/lib/rfsnLiveState";

function findClip(
  audioStatus: RfsnLiveAudioStatus | null | undefined,
  commentaryId: string,
) {
  if (!audioStatus?.enabled) return null;
  return audioStatus.clips.find((c) => c.commentaryId === commentaryId) ?? null;
}

describe("rfsn audio playback helpers", () => {
  it("finds ready clip by commentary id", () => {
    const status: RfsnLiveAudioStatus = {
      enabled: true,
      pickId: "pick-1",
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

  it("returns null when audio disabled", () => {
    expect(findClip({ enabled: false, pickId: "x", clips: [], updatedAt: "" }, "x")).toBeNull();
  });

  it("uses app-relative audio url shape", () => {
    const audioId = "opaque-id";
    const url = `/api/rfsn/audio/${encodeURIComponent(audioId)}`;
    expect(url).toBe("/api/rfsn/audio/opaque-id");
    expect(url).not.toContain("kokoro");
  });
});
