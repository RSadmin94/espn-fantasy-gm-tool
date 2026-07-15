import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDraftAudioStatus,
  getLiveAudioStatus,
  getStoredAudioClip,
  initDraftAudioStatus,
  resetRfsnVoiceAudioCacheForTests,
  storeVoiceAudioClip,
} from "./rfsnVoiceAudioCache";
import {
  createTestAudioStorePair,
  resetRfsnAudioSharedStoreForTests,
  setRfsnAudioStoreDriverForTests,
} from "./rfsnAudioSharedStore";

describe("rfsnVoiceAudioCache", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetRfsnVoiceAudioCacheForTests();
    resetRfsnAudioSharedStoreForTests();
    const pair = createTestAudioStorePair();
    setRfsnAudioStoreDriverForTests(pair.driverA);
    resetStore = pair.reset;
  });

  afterEach(() => {
    resetStore();
    resetRfsnAudioSharedStoreForTests();
  });

  it("issues opaque ids and serves stored clip", async () => {
    await initDraftAudioStatus("L", "D", "pick-1", 1, 1, [
      { commentaryId: "pick-1:sofia:primary", voice: "sofia" },
    ]);
    const ref = await storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      commentaryId: "pick-1:sofia:primary",
      voice: "sofia",
      bytes: Buffer.from("RIFFxxxxWAVE"),
      epoch: 1,
    });
    expect(ref?.audioId).toBeTruthy();
    const clip = await getStoredAudioClip(ref!.audioId!, {
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      voice: "sofia",
    });
    expect(clip?.bytes.toString()).toContain("RIFF");
    const status = await getLiveAudioStatus("L", "D");
    expect(status?.clips[0]?.status).toBe("ready");
    expect(status?.clips[0]?.audioId).not.toContain("/");
  });

  it("does not expose audioId while pending", async () => {
    const status = await initDraftAudioStatus("L", "D", "pick-1", 2, 1, [
      { commentaryId: "pick-1:coach:secondary", voice: "coach" },
    ]);
    expect(status.clips[0]?.status).toBe("pending");
    expect(status.clips[0]?.audioId).toBeUndefined();
  });

  it("discards stale epoch clips", async () => {
    await initDraftAudioStatus("L", "D", "pick-1", 1, 2, [
      { commentaryId: "pick-1:coach:secondary", voice: "coach" },
    ]);
    const ref = await storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      commentaryId: "pick-1:coach:secondary",
      voice: "coach",
      bytes: Buffer.from("RIFF"),
      epoch: 1,
    });
    expect(ref).toBeNull();
  });

  it("clears prior clips on routine silence", async () => {
    await initDraftAudioStatus("L", "D", "pick-1", 1, 1, [
      { commentaryId: "pick-1:sofia:primary", voice: "sofia" },
    ]);
    const cleared = await clearDraftAudioStatus("L", "D");
    expect(cleared.clips).toEqual([]);
    const status = await getLiveAudioStatus("L", "D");
    expect(status?.clips).toEqual([]);
  });

  it("returns null for missing clip", async () => {
    expect(
      await getStoredAudioClip("missing", {
        draftId: "D",
        pickId: "pick-1",
        pickNumber: 1,
        voice: "sofia",
      }),
    ).toBeNull();
  });

  it("rejects identity mismatch on fetch", async () => {
    await initDraftAudioStatus("L", "D", "pick-1", 1, 1, [
      { commentaryId: "pick-1:sofia:primary", voice: "sofia" },
    ]);
    const ref = await storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      commentaryId: "pick-1:sofia:primary",
      voice: "sofia",
      bytes: Buffer.from("RIFF"),
      epoch: 1,
    });
    const clip = await getStoredAudioClip(ref!.audioId!, {
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 2,
      voice: "sofia",
    });
    expect(clip).toBeNull();
  });
});
