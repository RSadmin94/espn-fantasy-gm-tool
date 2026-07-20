/**
 * ARM handoff: content caches ARM and re-posts on Board Mirror STATUS ready.
 */
import { describe, expect, it } from "vitest";
import {
  ESPN_BM_PAGE_CHANNEL,
  ESPN_BM_PAGE_SOURCE,
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_STATUS,
  shouldRepostArmOnPageStatus,
  validateArmConfig,
  validatePageOutboundMessage,
} from "./espnBookmarkletTransport.js";

/**
 * Simulate content-script ARM cache + STATUS-ready repost (the missing handoff).
 */
function createContentArmHandoff() {
  /** @type {any[]} */
  const pagePosts = [];
  /** @type {any|null} */
  let lastArmConfig = null;
  /** @type {string|null} */
  let armedSessionNonce = null;
  /** @type {any|null} */
  let backgroundState = null;

  function applyArmConfig(config) {
    armedSessionNonce = config.sessionNonce;
    lastArmConfig = config;
    pagePosts.push({
      type: "ARM",
      channel: ESPN_BM_PAGE_CHANNEL,
      source: "espn-live-content",
      protocolVersion: 1,
      config,
    });
    pagePosts.push({
      type: MSG_ESPN_BM_ARM,
      channel: ESPN_BM_PAGE_CHANNEL,
      source: "espn-live-content",
      protocolVersion: 1,
      config,
    });
  }

  function receiveBackgroundArm(rawConfig) {
    const config = validateArmConfig(rawConfig);
    if (!config) return { ok: false, error: "invalid_arm_config" };
    backgroundState = { armed: true, config };
    applyArmConfig(config);
    return { ok: true, sessionNonce: config.sessionNonce };
  }

  function receiveBackgroundDisarm() {
    armedSessionNonce = null;
    lastArmConfig = null;
    backgroundState = { armed: false, config: null };
    pagePosts.push({ type: "DISARM", channel: ESPN_BM_PAGE_CHANNEL });
  }

  /** Seed background armed state without posting (GET_STATE path). */
  function seedBackgroundArm(rawConfig) {
    const config = validateArmConfig(rawConfig);
    if (!config) return { ok: false, error: "invalid_arm_config" };
    backgroundState = { armed: true, config };
    return { ok: true, sessionNonce: config.sessionNonce };
  }

  function onPageOutbound(pageMsg) {
    const validated = validatePageOutboundMessage(pageMsg, {
      requireSessionNonce: armedSessionNonce,
    });
    if (!validated.ok || !validated.message) return { ok: false, error: validated.error };
    if (
      validated.message.type === MSG_ESPN_BM_STATUS &&
      shouldRepostArmOnPageStatus(validated.message.status)
    ) {
      if (lastArmConfig) {
        applyArmConfig(lastArmConfig);
      } else if (backgroundState?.armed && backgroundState.config) {
        const config = validateArmConfig(backgroundState.config);
        if (config) applyArmConfig(config);
      }
    }
    return { ok: true, message: validated.message };
  }

  return {
    pagePosts,
    receiveBackgroundArm,
    receiveBackgroundDisarm,
    seedBackgroundArm,
    onPageOutbound,
    get armedSessionNonce() {
      return armedSessionNonce;
    },
    get lastArmConfig() {
      return lastArmConfig;
    },
  };
}

function readyStatus() {
  return {
    type: MSG_ESPN_BM_STATUS,
    channel: ESPN_BM_PAGE_CHANNEL,
    source: ESPN_BM_PAGE_SOURCE,
    provider: "espn-live",
    protocolVersion: 1,
    status: "ready",
  };
}

describe("shouldRepostArmOnPageStatus", () => {
  it("reposts only on Board Mirror STATUS ready", () => {
    expect(shouldRepostArmOnPageStatus("ready")).toBe(true);
    expect(shouldRepostArmOnPageStatus("armed")).toBe(false);
    expect(shouldRepostArmOnPageStatus("monitoring")).toBe(false);
  });
});

describe("ARM handoff (Rivals → content → page)", () => {
  it("Rivals ARM reaches content and posts ARM to page", () => {
    const content = createContentArmHandoff();
    const arm = content.receiveBackgroundArm({
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-a",
    });
    expect(arm.ok).toBe(true);
    expect(content.pagePosts.filter((m) => m.type === "ARM" || m.type === MSG_ESPN_BM_ARM)).toHaveLength(
      2,
    );
    expect(content.lastArmConfig?.sessionNonce).toBe("nonce-a");
    expect(content.armedSessionNonce).toBe("nonce-a");
  });

  it("rejects stale/invalid ARM config (empty nonce)", () => {
    const content = createContentArmHandoff();
    const arm = content.receiveBackgroundArm({
      leagueId: "424242",
      season: 2026,
      sessionNonce: "",
    });
    expect(arm.ok).toBe(false);
    expect(content.pagePosts).toHaveLength(0);
  });

  it("STATUS ready re-posts cached ARM after late Board Mirror listener", () => {
    const content = createContentArmHandoff();
    content.receiveBackgroundArm({
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-race",
    });
    const before = content.pagePosts.length;
    const ready = content.onPageOutbound(readyStatus());
    expect(ready.ok).toBe(true);
    expect(content.pagePosts.length).toBe(before + 2);
    const lastArm = content.pagePosts.at(-1);
    expect(lastArm.type).toBe(MSG_ESPN_BM_ARM);
    expect(lastArm.config.sessionNonce).toBe("nonce-race");
  });

  it("STATUS ready re-posts via background state when content cache is empty", () => {
    const content = createContentArmHandoff();
    content.seedBackgroundArm({
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-get-state",
    });
    expect(content.lastArmConfig).toBeNull();
    expect(content.pagePosts).toHaveLength(0);
    content.onPageOutbound(readyStatus());
    expect(content.pagePosts).toHaveLength(2);
    expect(content.lastArmConfig?.sessionNonce).toBe("nonce-get-state");
  });

  it("DISARM clears ARM cache so ready cannot re-arm with stale nonce", () => {
    const content = createContentArmHandoff();
    content.receiveBackgroundArm({
      leagueId: "424242",
      season: 2026,
      sessionNonce: "stale",
    });
    content.receiveBackgroundDisarm();
    expect(content.lastArmConfig).toBeNull();
    const before = content.pagePosts.length;
    content.onPageOutbound(readyStatus());
    expect(content.pagePosts.length).toBe(before);
  });
});
