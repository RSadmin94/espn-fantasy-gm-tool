import { describe, expect, it } from "vitest";
import {
  getLiveAudioStatus,
  getStoredAudioClip,
  initDraftAudioStatus,
  resetRfsnVoiceAudioCacheForTests,
  storeVoiceAudioClip,
} from "./rfsnVoiceAudioCache";

describe("rfsnVoiceAudioCache", () => {
  it("issues opaque ids and serves stored clip", () => {
    resetRfsnVoiceAudioCacheForTests();
    initDraftAudioStatus("L", "D", "pick-1", 1, [
      { commentaryId: "pick-1:sofia:primary", voice: "sofia" },
    ]);
    const ref = storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      commentaryId: "pick-1:sofia:primary",
      voice: "sofia",
      bytes: Buffer.from("RIFFxxxxWAVE"),
      epoch: 1,
    });
    expect(ref?.audioId).toBeTruthy();
    expect(getStoredAudioClip(ref!.audioId)?.bytes.toString()).toContain("RIFF");
    const status = getLiveAudioStatus("L", "D");
    expect(status?.clips[0]?.status).toBe("ready");
    expect(status?.clips[0]?.audioId).not.toContain("/");
  });

  it("discards stale epoch clips", () => {
    resetRfsnVoiceAudioCacheForTests();
    initDraftAudioStatus("L", "D", "pick-1", 2, [
      { commentaryId: "pick-1:coach:secondary", voice: "coach" },
    ]);
    const ref = storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      commentaryId: "pick-1:coach:secondary",
      voice: "coach",
      bytes: Buffer.from("RIFF"),
      epoch: 1,
    });
    expect(ref).toBeNull();
  });

  it("returns null for missing clip", () => {
    resetRfsnVoiceAudioCacheForTests();
    expect(getStoredAudioClip("missing")).toBeNull();
  });
});
