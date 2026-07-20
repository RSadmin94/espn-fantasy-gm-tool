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
  MSG_ESPN_BM_STATUS,
  isEspnLiveDraftId,
  shouldBridgeAcceptEspnBmCommand,
  shouldBridgeForwardEspnBm,
  validateArmConfig,
  validatePageOutboundMessage,
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
});

describe("bridge namespace isolation", () => {
  it("forwards only ESPN BM types to Rivals page", () => {
    expect(
      shouldBridgeForwardEspnBm({ type: MSG_ESPN_BM_PICK_BATCH, provider: "espn-live" }),
    ).toBe(true);
    expect(shouldBridgeForwardEspnBm({ type: MSG_ESPN_BM_STATUS, provider: "espn-live" })).toBe(
      true,
    );
    expect(
      shouldBridgeForwardEspnBm({ type: "GMWR_FP_MOCK_PICK_BATCH", provider: "fantasypros" }),
    ).toBe(false);
    expect(shouldBridgeForwardEspnBm({ type: MSG_ESPN_BM_PICK_BATCH, provider: "fantasypros" })).toBe(
      false,
    );
  });

  it("accepts only ESPN BM command types from Rivals page", () => {
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_ARM })).toBe(true);
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_PING })).toBe(true);
    expect(shouldBridgeAcceptEspnBmCommand({ type: "GMWR_FP_MOCK_ARM" })).toBe(false);
    expect(shouldBridgeAcceptEspnBmCommand({ type: MSG_ESPN_BM_STATUS })).toBe(false);
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
