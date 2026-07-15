import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestAudioStorePair,
  readAudioClip,
  resetRfsnAudioSharedStoreForTests,
  setRfsnAudioStoreDriverForTests,
  writeAudioClip,
  type StoredAudioClipRecord,
} from "./rfsnAudioSharedStore";
import {
  getLiveAudioStatus,
  getStoredAudioClip,
  initDraftAudioStatus,
  storeVoiceAudioClip,
} from "./rfsnVoiceAudioCache";

describe("rfsn audio cross-instance delivery", () => {
  let resetStore: () => void;

  beforeEach(() => {
    resetRfsnAudioSharedStoreForTests();
    const pair = createTestAudioStorePair();
    resetStore = pair.reset;
    setRfsnAudioStoreDriverForTests(pair.driverA);
  });

  afterEach(() => {
    resetStore();
    resetRfsnAudioSharedStoreForTests();
  });

  it("stores on instance A and fetches through instance B", async () => {
    const pair = createTestAudioStorePair();
    setRfsnAudioStoreDriverForTests(pair.driverA);

    await initDraftAudioStatus("L", "D", "pick-1", 1, 1, [
      { commentaryId: "pick-1:coach:primary", voice: "coach" },
    ]);
    const ref = await storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      commentaryId: "pick-1:coach:primary",
      voice: "coach",
      bytes: Buffer.from("RIFFxxxxWAVE"),
      epoch: 1,
    });

    setRfsnAudioStoreDriverForTests(pair.driverB);
    const clip = await getStoredAudioClip(ref!.audioId!, {
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      voice: "coach",
    });
    expect(clip?.bytes.toString()).toContain("RIFF");

    const status = await getLiveAudioStatus("L", "D");
    expect(status?.clips[0]?.status).toBe("ready");
    expect(status?.clips[0]?.audioId).toBe(ref?.audioId);
  });

  it("returns null for expired clip", async () => {
    const record: StoredAudioClipRecord = {
      audioId: "expired-clip",
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      commentaryId: "pick-1:sofia:primary",
      voice: "sofia",
      contentType: "audio/wav",
      expiresAtMs: Date.now() - 1000,
      epoch: 1,
      bytesBase64: Buffer.from("RIFF").toString("base64"),
      createdAtMs: Date.now() - 2000,
    };
    await writeAudioClip(record);

    const clip = await getStoredAudioClip("expired-clip", {
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      voice: "sofia",
    });
    expect(clip).toBeNull();
    expect(await readAudioClip("expired-clip")).toBeNull();
  });

  it("quick pick invalidates old epoch audio", async () => {
    await initDraftAudioStatus("L", "D", "pick-1", 1, 1, [
      { commentaryId: "pick-1:coach:primary", voice: "coach" },
    ]);
    await initDraftAudioStatus("L", "D", "pick-2", 2, 2, [
      { commentaryId: "pick-2:coach:primary", voice: "coach" },
    ]);
    const stale = await storeVoiceAudioClip({
      leagueId: "L",
      draftId: "D",
      pickId: "pick-1",
      pickNumber: 1,
      commentaryId: "pick-1:coach:primary",
      voice: "coach",
      bytes: Buffer.from("RIFF"),
      epoch: 1,
    });
    expect(stale).toBeNull();
    const status = await getLiveAudioStatus("L", "D");
    expect(status?.pickId).toBe("pick-2");
    expect(status?.clips[0]?.status).toBe("pending");
  });
});
