/**
 * Phase 2 — ESPN bookmarklet transport unit tests.
 */
import { describe, expect, it } from "vitest";
import {
  ESPN_BM_PAGE_CHANNEL,
  ESPN_BM_PAGE_SOURCE,
  MSG_ESPN_BM_ARM,
  MSG_ESPN_BM_PICK_BATCH,
  MSG_ESPN_BM_PING,
  MSG_ESPN_BM_REPLAY_REQUEST,
  MSG_ESPN_BM_STATUS,
  isEspnLiveDraftId,
  shouldBridgeAcceptEspnBmCommand,
  shouldBridgeForwardEspnBm,
  validateArmConfig,
  validatePageOutboundMessage,
  validateReplayRequest,
  validateTransportPick,
} from "./espnBookmarkletTransport.js";

function validPick(partial = {}) {
  return {
    eventKey: "espn:espn-live-1-2026:overall:1",
    overallPick: 1,
    round: 1,
    pickInRound: 1,
    teamId: "1",
    teamName: "Alpha",
    ownerName: "Alpha",
    playerId: "3042519",
    playerName: "Saquon Barkley",
    position: "RB",
    nflTeam: "PHI",
    isKeeper: false,
    isTradedPick: false,
    playerIdSource: "espn",
    ...partial,
  };
}

function validBatch(partial = {}) {
  return {
    type: MSG_ESPN_BM_PICK_BATCH,
    protocolVersion: 1,
    revision: 1,
    channel: ESPN_BM_PAGE_CHANNEL,
    source: ESPN_BM_PAGE_SOURCE,
    provider: "espn-live",
    draftType: "live",
    draftId: "espn-live-424242-2026",
    leagueId: "424242",
    season: 2026,
    sessionNonce: "nonce-1",
    teamCount: 12,
    draftComplete: false,
    baselineOnly: false,
    liveNotify: true,
    observedAt: "2026-07-19T20:00:00.000Z",
    picks: [validPick()],
    diagnostics: {
      picksEmitted: 1,
      duplicatesSuppressed: 0,
      rowsScanned: 1,
      baselineOnly: false,
      liveNotify: true,
    },
    ...partial,
  };
}

describe("espnBookmarkletTransport validation", () => {
  it("accepts only valid ESPN BM pick batches", () => {
    const r = validatePageOutboundMessage(validBatch());
    expect(r.ok).toBe(true);
    expect(r.message?.type).toBe(MSG_ESPN_BM_PICK_BATCH);
    expect(r.message?.picks).toHaveLength(1);
  });

  it("rejects malformed payloads", () => {
    expect(validatePageOutboundMessage(null).ok).toBe(false);
    expect(validatePageOutboundMessage({}).ok).toBe(false);
    expect(validatePageOutboundMessage(validBatch({ picks: "nope" })).ok).toBe(false);
    expect(validateTransportPick({})).toBeNull();
    expect(validateArmConfig({ leagueId: "abc", season: 2026, sessionNonce: "n" })).toBeNull();
  });

  it("rejects wrong channels", () => {
    const r = validatePageOutboundMessage(validBatch({ channel: "GMWR_FP_MOCK_PAGE" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("wrong_channel");
  });

  it("rejects wrong source", () => {
    const r = validatePageOutboundMessage(validBatch({ source: "evil-page" }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("wrong_source");
  });

  it("rejects -na draft ids and FP provider contamination", () => {
    expect(isEspnLiveDraftId("espn-live-1-na")).toBe(false);
    expect(validatePageOutboundMessage(validBatch({ draftId: "espn-live-1-na" })).ok).toBe(false);
    expect(validatePageOutboundMessage(validBatch({ provider: "fantasypros" })).ok).toBe(false);
  });

  it("enforces session nonce when required", () => {
    const r = validatePageOutboundMessage(validBatch({ sessionNonce: "a" }), {
      requireSessionNonce: "b",
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("session_nonce_mismatch");
  });

  it("allows empty picks only when draftComplete", () => {
    expect(validatePageOutboundMessage(validBatch({ picks: [], draftComplete: false })).ok).toBe(
      false,
    );
    const r = validatePageOutboundMessage(validBatch({ picks: [], draftComplete: true }));
    expect(r.ok).toBe(true);
    expect(r.message?.picks).toEqual([]);
  });

  it("rejects unsupported protocolVersion and invalid revision", () => {
    expect(validatePageOutboundMessage(validBatch({ protocolVersion: 2 })).error).toBe(
      "unsupported_protocol_version",
    );
    expect(validatePageOutboundMessage(validBatch({ revision: 0 })).error).toBe("invalid_revision");
    const ok = validatePageOutboundMessage(validBatch());
    expect(ok.ok).toBe(true);
    expect(ok.message?.protocolVersion).toBe(1);
    expect(ok.message?.revision).toBe(1);
  });
});

describe("bridge namespace isolation", () => {
  it("forwards only ESPN BM types to Rivals page", () => {
    expect(
      shouldBridgeForwardEspnBm({
        type: MSG_ESPN_BM_PICK_BATCH,
        provider: "espn-live",
        protocolVersion: 1,
      }),
    ).toBe(true);
    expect(
      shouldBridgeForwardEspnBm({
        type: MSG_ESPN_BM_STATUS,
        provider: "espn-live",
        protocolVersion: 1,
      }),
    ).toBe(true);
    expect(
      shouldBridgeForwardEspnBm({ type: MSG_ESPN_BM_PICK_BATCH, provider: "espn-live" }),
    ).toBe(false);
    expect(
      shouldBridgeForwardEspnBm({
        type: MSG_ESPN_BM_PICK_BATCH,
        provider: "espn-live",
        protocolVersion: 2,
      }),
    ).toBe(false);
    expect(
      shouldBridgeForwardEspnBm({ type: "GMWR_FP_MOCK_PICK_BATCH", provider: "fantasypros" }),
    ).toBe(false);
    expect(shouldBridgeForwardEspnBm({ type: MSG_ESPN_BM_PICK_BATCH, provider: "fantasypros" })).toBe(
      false,
    );
  });

  it("accepts only ESPN BM command types from Rivals page", () => {
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_ARM, protocolVersion: 1 })).toBe(
      true,
    );
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_PING, protocolVersion: 1 })).toBe(
      true,
    );
    expect(
      shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_REPLAY_REQUEST, protocolVersion: 1 }),
    ).toBe(true);
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_ARM })).toBe(false);
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_ARM, protocolVersion: 2 })).toBe(
      false,
    );
    expect(shouldBridgeAcceptEspnBmCommand({ type: "GMWR_FP_MOCK_ARM" })).toBe(false);
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_STATUS })).toBe(false);
  });

  it("validates REPLAY_REQUEST payloads", () => {
    expect(
      validateReplayRequest({
        draftId: "espn-live-424242-2026",
        sessionNonce: "n1",
        afterOverallPick: 0,
        requestId: "r1",
      }),
    ).toEqual({
      draftId: "espn-live-424242-2026",
      sessionNonce: "n1",
      afterOverallPick: 0,
      requestId: "r1",
    });
    expect(
      validateReplayRequest({
        draftId: "espn-live-424242-na",
        sessionNonce: "n1",
        afterOverallPick: 0,
        requestId: "r1",
      }),
    ).toBeNull();
    expect(
      validateReplayRequest({
        draftId: "espn-live-424242-2026",
        sessionNonce: "n1",
        afterOverallPick: -1,
        requestId: "r1",
      }),
    ).toBeNull();
  });
});

describe("FantasyPros regression (namespace)", () => {
  it("ESPN validators never accept FP channels/types as ESPN BM", () => {
    const fpBatch = {
      type: "GMWR_FP_MOCK_PICK_BATCH",
      channel: "GMWR_FP_MOCK_PAGE",
      source: "fantasypros-page-observer",
      provider: "fantasypros",
      draftId: "fp-mock-x",
      picks: [{ id: "1", pick: 1 }],
    };
    expect(validatePageOutboundMessage(fpBatch).ok).toBe(false);
    expect(shouldBridgeForwardEspnBm(fpBatch)).toBe(false);
    expect(shouldBridgeAcceptEspnBmCommand({ type: "GMWR_FP_MOCK_ARM" })).toBe(false);
  });
});
