/**
 * Phase 2 — simulated transport integration (no Chrome runtime).
 * Bookmarklet page → content validate → background route → bridge stamp → Rivals page.
 */
import { describe, expect, it } from "vitest";
import {
  ESPN_BM_BRIDGE_CHANNEL,
  ESPN_BM_EXTENSION_SOURCE,
  ESPN_BM_PAGE_CHANNEL,
  ESPN_BM_PAGE_SOURCE,
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_DISARM,
  MSG_ESPN_BM_PICK_BATCH,
  MSG_ESPN_BM_PING,
  MSG_ESPN_BM_PONG,
  MSG_ESPN_BM_SESSION_RESET,
  MSG_ESPN_BM_STATUS,
  shouldBridgeAcceptEspnBmCommand,
  shouldBridgeForwardEspnBm,
  validateArmConfig,
  validatePageOutboundMessage,
} from "./espnBookmarkletTransport.js";

/**
 * Minimal in-memory bus mimicking content → background → bridge.
 */
function createTransportBus() {
  /** @type {any[]} */
  const rivalsInbox = [];
  /** @type {any[]} */
  const espnPageInbox = [];
  let armed = false;
  /** @type {string|null} */
  let sessionNonce = null;

  function backgroundHandle(message) {
    const t = message?.type;
    if (t === MSG_ESPN_BM_ARM) {
      const config = validateArmConfig(message.config);
      if (!config) return { ok: false, error: "invalid_arm_config" };
      armed = true;
      sessionNonce = config.sessionNonce;
      espnPageInbox.push({ type: "ARM", config });
      rivalsInbox.push(
        stamp({
          type: MSG_ESPN_BM_STATUS,
          provider: "espn-live",
          status: "armed",
          sessionNonce,
        }),
      );
      return { ok: true, sessionNonce };
    }
    if (t === MSG_ESPN_BM_DISARM) {
      armed = false;
      sessionNonce = null;
      espnPageInbox.push({ type: "DISARM" });
      rivalsInbox.push(stamp({ type: MSG_ESPN_BM_STATUS, provider: "espn-live", status: "disarmed" }));
      return { ok: true };
    }
    if (t === MSG_ESPN_BM_PING) {
      espnPageInbox.push({ type: "PING" });
      return { ok: true, armed, sessionNonce };
    }
    if (t === MSG_ESPN_BM_PICK_BATCH || t === MSG_ESPN_BM_STATUS || t === MSG_ESPN_BM_SESSION_RESET || t === MSG_ESPN_BM_PONG) {
      if (t === MSG_ESPN_BM_PICK_BATCH && !armed) return { ok: false, error: "not_armed" };
      if (
        t === MSG_ESPN_BM_PICK_BATCH &&
        sessionNonce &&
        message.sessionNonce &&
        message.sessionNonce !== sessionNonce
      ) {
        return { ok: false, error: "session_nonce_mismatch" };
      }
      if (!shouldBridgeForwardEspnBm(message)) return { ok: false, error: "bridge_reject" };
      rivalsInbox.push(stamp(message));
      return { ok: true };
    }
    return { ok: false, error: "unknown" };
  }

  function stamp(message) {
    return {
      ...message,
      channel: ESPN_BM_BRIDGE_CHANNEL,
      source: ESPN_BM_EXTENSION_SOURCE,
    };
  }

  function contentFromPage(pageMsg) {
    const validated = validatePageOutboundMessage(pageMsg, {
      requireSessionNonce: sessionNonce,
    });
    if (!validated.ok || !validated.message) return { ok: false, error: validated.error };
    if (validated.message.type === MSG_ESPN_BM_PICK_BATCH) {
      if (!sessionNonce) return { ok: false, error: "not_armed" };
    }
    return backgroundHandle(validated.message);
  }

  function rivalsCommand(cmd) {
    if (!shouldBridgeAcceptEspnBmCommand(cmd)) return { ok: false, error: "bridge_reject" };
    return backgroundHandle(cmd);
  }

  return {
    rivalsInbox,
    espnPageInbox,
    rivalsCommand,
    contentFromPage,
    get sessionNonce() {
      return sessionNonce;
    },
    get armed() {
      return armed;
    },
  };
}

describe("ESPN BM transport integration (simulated)", () => {
  it("round-trips ARM → PICK_BATCH → DISARM and PING→PONG", () => {
    const bus = createTransportBus();

    const arm = bus.rivalsCommand({
      type: MSG_ESPN_BM_ARM,
      provider: "espn-live",
      config: { leagueId: "424242", season: 2026, sessionNonce: "nonce-xyz" },
    });
    expect(arm.ok).toBe(true);
    expect(bus.espnPageInbox.some((m) => m.type === "ARM")).toBe(true);
    expect(bus.rivalsInbox.some((m) => m.type === MSG_ESPN_BM_STATUS && m.status === "armed")).toBe(
      true,
    );

    const ping = bus.rivalsCommand({ type: MSG_ESPN_BM_PING, provider: "espn-live" });
    expect(ping.ok).toBe(true);
    expect(bus.espnPageInbox.some((m) => m.type === "PING")).toBe(true);

    const pong = bus.contentFromPage({
      type: MSG_ESPN_BM_PONG,
      channel: ESPN_BM_PAGE_CHANNEL,
      source: ESPN_BM_PAGE_SOURCE,
      provider: "espn-live",
      armed: true,
      draftId: "espn-live-424242-2026",
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-xyz",
    });
    expect(pong.ok).toBe(true);
    expect(
      bus.rivalsInbox.some(
        (m) => m.type === MSG_ESPN_BM_PONG && m.source === ESPN_BM_EXTENSION_SOURCE,
      ),
    ).toBe(true);

    const status = bus.contentFromPage({
      type: MSG_ESPN_BM_STATUS,
      channel: ESPN_BM_PAGE_CHANNEL,
      source: ESPN_BM_PAGE_SOURCE,
      provider: "espn-live",
      status: "monitoring",
      draftId: "espn-live-424242-2026",
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-xyz",
    });
    expect(status.ok).toBe(true);

    const batch = bus.contentFromPage({
      type: MSG_ESPN_BM_PICK_BATCH,
      channel: ESPN_BM_PAGE_CHANNEL,
      source: ESPN_BM_PAGE_SOURCE,
      provider: "espn-live",
      draftType: "live",
      draftId: "espn-live-424242-2026",
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-xyz",
      teamCount: 12,
      draftComplete: false,
      baselineOnly: true,
      liveNotify: false,
      observedAt: "2026-07-19T20:00:00.000Z",
      picks: [
        {
          eventKey: "espn:espn-live-424242-2026:overall:1",
          overallPick: 1,
          round: 1,
          pickInRound: 1,
          teamId: "1",
          teamName: "Alpha",
          ownerName: "Alpha",
          playerId: "1",
          playerName: "Player One",
          position: "RB",
          nflTeam: "KC",
          isKeeper: false,
          isTradedPick: false,
          playerIdSource: "espn",
        },
      ],
      diagnostics: {
        picksEmitted: 0,
        duplicatesSuppressed: 0,
        rowsScanned: 1,
        baselineOnly: true,
        liveNotify: false,
      },
    });
    expect(batch.ok).toBe(true);
    const delivered = bus.rivalsInbox.filter((m) => m.type === MSG_ESPN_BM_PICK_BATCH);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].channel).toBe(ESPN_BM_BRIDGE_CHANNEL);
    expect(delivered[0].source).toBe(ESPN_BM_EXTENSION_SOURCE);
    expect(delivered[0].baselineOnly).toBe(true);

    const reset = bus.contentFromPage({
      type: MSG_ESPN_BM_SESSION_RESET,
      channel: ESPN_BM_PAGE_CHANNEL,
      source: ESPN_BM_PAGE_SOURCE,
      provider: "espn-live",
      draftId: "espn-live-424242-2026",
      leagueId: "424242",
      sessionNonce: "nonce-xyz",
    });
    expect(reset.ok).toBe(true);

    const disarm = bus.rivalsCommand({ type: MSG_ESPN_BM_DISARM, provider: "espn-live" });
    expect(disarm.ok).toBe(true);
    expect(bus.armed).toBe(false);

    const afterDisarm = bus.contentFromPage({
      type: MSG_ESPN_BM_PICK_BATCH,
      channel: ESPN_BM_PAGE_CHANNEL,
      source: ESPN_BM_PAGE_SOURCE,
      provider: "espn-live",
      draftId: "espn-live-424242-2026",
      leagueId: "424242",
      season: 2026,
      sessionNonce: "nonce-xyz",
      teamCount: 12,
      draftComplete: false,
      baselineOnly: false,
      liveNotify: true,
      observedAt: "2026-07-19T20:01:00.000Z",
      picks: [
        {
          eventKey: "espn:espn-live-424242-2026:overall:2",
          overallPick: 2,
          round: 1,
          pickInRound: 2,
          teamId: "2",
          teamName: "Bravo",
          ownerName: "Bravo",
          playerId: "2",
          playerName: "Player Two",
          position: "WR",
          nflTeam: "BUF",
          isKeeper: false,
          isTradedPick: false,
          playerIdSource: "espn",
        },
      ],
    });
    expect(afterDisarm.ok).toBe(false);
  });

  it("does not mix FantasyPros commands into ESPN transport", () => {
    const bus = createTransportBus();
    const fp = bus.rivalsCommand({ type: "GMWR_FP_MOCK_ARM", provider: "fantasypros" });
    expect(fp.ok).toBe(false);
    expect(bus.armed).toBe(false);
  });
});
