import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import {
  resetLiveSessionsForTests,
  getLiveSession,
} from "./services/sofia/liveBroadcastSession";
import { resetLiveBroadcastServiceForTests } from "./services/sofia/liveBroadcastService";
import { resetLiveDraftMomentSessionsForTests } from "./services/sofia/liveDraftMomentSession";
import { resetLiveBroadcastPickHookForTests } from "./services/sofia/liveBroadcastPickHook";
import { resetRfsnVoiceAudioCacheForTests } from "./services/rfsn/rfsnVoiceAudioCache";
import { resetRfsnLiveTtsServiceForTests } from "./services/rfsn/rfsnLiveTtsService";

const ENV_KEY = "RFSN_LIVE_BROADCAST_ENABLED";
const TTS_ENV = {
  ENABLED: "RFSN_TTS_ENABLED",
  URL: "RFSN_TTS_SERVICE_URL",
  TOKEN: "RFSN_TTS_SERVICE_TOKEN",
} as const;

const SAVED_TTS_ENV: Partial<Record<(typeof TTS_ENV)[keyof typeof TTS_ENV], string | undefined>> = {};

function saveTtsEnv(): void {
  for (const key of Object.values(TTS_ENV)) {
    SAVED_TTS_ENV[key] = process.env[key];
  }
}

function restoreTtsEnv(): void {
  for (const key of Object.values(TTS_ENV)) {
    const saved = SAVED_TTS_ENV[key];
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

function clearTtsEnv(): void {
  for (const key of Object.values(TTS_ENV)) {
    delete process.env[key];
  }
}

const LEAGUE = "CERT";
const DRAFT = "cert-live";

function founderCaller() {
  return appRouter.createCaller({
    user: {
      id: 1,
      openId: "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo",
      email: "flurrysports@gmail.com",
      role: "user" as const,
      subscriptionStatus: "active" as const,
    },
    auth: { userId: "user_3E8K7ihI9tYXU06UJ5BfeCsg1bo" },
    req: {} as never,
    res: {} as never,
  });
}

function regularCaller() {
  return appRouter.createCaller({
    user: {
      id: 99,
      openId: "user_regular",
      email: "regular@example.com",
      role: "user" as const,
      subscriptionStatus: "active" as const,
    },
    auth: { userId: "user_regular" },
    req: {} as never,
    res: {} as never,
  });
}

const routinePick = {
  overallPick: 1,
  round: 1,
  roundPick: 1,
  teamId: "1",
  ownerName: "Alice",
  playerId: "r1",
  playerName: "Routine WR 1",
  position: "WR",
};

describe("rfsnBroadcastRouter", () => {
  beforeEach(() => {
    saveTtsEnv();
    clearTtsEnv();
    process.env[ENV_KEY] = "true";
    resetLiveSessionsForTests();
    resetLiveBroadcastServiceForTests();
    resetLiveDraftMomentSessionsForTests();
    resetLiveBroadcastPickHookForTests();
    resetRfsnVoiceAudioCacheForTests();
    resetRfsnLiveTtsServiceForTests();
  });

  afterEach(() => {
    delete process.env[ENV_KEY];
    restoreTtsEnv();
  });

  it("getAccess reports disabled when flag off", async () => {
    process.env[ENV_KEY] = "false";
    const access = await founderCaller().rfsnBroadcast.getAccess();
    expect(access.enabled).toBe(false);
    expect(access.canAccess).toBe(false);
  });

  it("founder can access when flag on", async () => {
    const access = await founderCaller().rfsnBroadcast.getAccess();
    expect(access.enabled).toBe(true);
    expect(access.canAccess).toBe(true);
    expect(access.ttsEnabled).toBe(false);
  });

  it("reports tts disabled when flag off", async () => {
    process.env[TTS_ENV.ENABLED] = "false";
    process.env[TTS_ENV.URL] = "https://kokoro.example";
    process.env[TTS_ENV.TOKEN] = "secret-token";
    const access = await founderCaller().rfsnBroadcast.getAccess();
    expect(access.ttsEnabled).toBe(false);
  });

  it("reports tts enabled when flag on with url and token", async () => {
    process.env[TTS_ENV.ENABLED] = "true";
    process.env[TTS_ENV.URL] = "https://kokoro.example";
    process.env[TTS_ENV.TOKEN] = "secret-token";
    const access = await founderCaller().rfsnBroadcast.getAccess();
    expect(access.ttsEnabled).toBe(true);
  });

  it("reports tts disabled when enabled but not configured", async () => {
    process.env[TTS_ENV.ENABLED] = "true";
    delete process.env[TTS_ENV.URL];
    delete process.env[TTS_ENV.TOKEN];
    const access = await founderCaller().rfsnBroadcast.getAccess();
    expect(access.ttsEnabled).toBe(false);
  });

  it("regular user cannot access live", async () => {
    await expect(regularCaller().rfsnBroadcast.getLiveSnapshot({ leagueId: LEAGUE, draftId: DRAFT }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("notifyLockedPick returns immediately and builds session", async () => {
    const res = await founderCaller().rfsnBroadcast.notifyLockedPick({
      leagueId: LEAGUE,
      draftId: DRAFT,
      pick: routinePick,
      useDeterministicProvider: true,
    });
    expect(res.accepted).toBe(true);
    await new Promise((r) => setTimeout(r, 100));
    const session = getLiveSession(LEAGUE, DRAFT);
    expect(session).not.toBeNull();
  });

  it("disabled flag blocks notify for all users", async () => {
    process.env[ENV_KEY] = "false";
    await expect(
      founderCaller().rfsnBroadcast.notifyLockedPick({
        leagueId: LEAGUE,
        draftId: DRAFT,
        pick: routinePick,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("duplicate pick id does not require second build", async () => {
    const caller = founderCaller();
    await caller.rfsnBroadcast.resetLiveSession({ leagueId: LEAGUE, draftId: DRAFT });
    const first = await caller.rfsnBroadcast.notifyLockedPick({
      leagueId: LEAGUE,
      draftId: DRAFT,
      pick: routinePick,
      useDeterministicProvider: true,
    });
    expect(first.accepted).toBe(true);
    await new Promise((r) => setTimeout(r, 150));
    const session = getLiveSession(LEAGUE, DRAFT);
    const lastId = session?.lastProcessedPickId;
    const dup = await caller.rfsnBroadcast.notifyLockedPick({
      leagueId: LEAGUE,
      draftId: DRAFT,
      pick: routinePick,
      useDeterministicProvider: true,
    });
    expect(dup.accepted).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(getLiveSession(LEAGUE, DRAFT)?.lastProcessedPickId).toBe(lastId);
  });
});
