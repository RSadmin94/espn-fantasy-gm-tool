/**
 * @vitest-environment node
 * Phase 3 — ESPN bookmarklet bridge parse + normalize.
 */
import { describe, expect, it } from "vitest";
import {
  espnBmBatchToNormalized,
  parseEspnBookmarkletBridgeMessage,
  type EspnBmBridgePickBatch,
} from "./espnBookmarkletBridge";
import { parseFantasyProsBridgeMessage } from "./fantasyProsMockBridge";

function pickRow(over = 1) {
  return {
    eventKey: `ek-${over}`,
    overallPick: over,
    round: 1,
    pickInRound: over,
    teamId: "7",
    teamName: "Team 7",
    ownerName: "Owner 7",
    playerId: `pid-${over}`,
    playerName: `Player ${over}`,
    position: "RB",
    nflTeam: "ATL",
    isKeeper: false,
    isTradedPick: false,
    playerIdSource: "espn" as const,
  };
}

function batch(
  partial: Partial<EspnBmBridgePickBatch> & { picks?: ReturnType<typeof pickRow>[] } = {},
): EspnBmBridgePickBatch {
  const { picks, ...rest } = partial;
  return {
    type: "GMWR_ESPN_BM_PICK_BATCH",
    provider: "espn-live",
    draftType: "live",
    draftId: "espn-live-12345-2026",
    leagueId: "12345",
    season: 2026,
    sessionNonce: "nonce-abc",
    teamCount: 12,
    draftComplete: false,
    baselineOnly: false,
    liveNotify: true,
    observedAt: "2026-07-19T12:00:00.000Z",
    picks: picks ?? [pickRow(1)],
    ...rest,
  };
}

describe("espnBookmarkletBridge", () => {
  it("accepts a valid ESPN pick batch", () => {
    const parsed = parseEspnBookmarkletBridgeMessage({
      source: "gmwarroom-extension",
      channel: "GMWR_ESPN_BM",
      type: "GMWR_ESPN_BM_PICK_BATCH",
      provider: "espn-live",
      draftId: "espn-live-12345-2026",
      leagueId: "12345",
      season: 2026,
      sessionNonce: "nonce-abc",
      teamCount: 12,
      draftComplete: false,
      baselineOnly: false,
      liveNotify: true,
      observedAt: "2026-07-19T12:00:00.000Z",
      picks: [pickRow(1)],
    });
    expect(parsed?.type).toBe("GMWR_ESPN_BM_PICK_BATCH");
    if (parsed?.type === "GMWR_ESPN_BM_PICK_BATCH") {
      expect(parsed.picks).toHaveLength(1);
      expect(parsed.picks[0]!.playerName).toBe("Player 1");
    }
  });

  it("accepts empty completion batch", () => {
    const parsed = parseEspnBookmarkletBridgeMessage({
      type: "GMWR_ESPN_BM_PICK_BATCH",
      provider: "espn-live",
      draftId: "espn-live-12345-2026",
      leagueId: "12345",
      season: 2026,
      sessionNonce: "n",
      teamCount: 12,
      draftComplete: true,
      baselineOnly: false,
      liveNotify: false,
      observedAt: "2026-07-19T12:00:00.000Z",
      picks: [],
    });
    expect(parsed?.type).toBe("GMWR_ESPN_BM_PICK_BATCH");
    if (parsed?.type === "GMWR_ESPN_BM_PICK_BATCH") {
      expect(parsed.draftComplete).toBe(true);
      expect(parsed.picks).toHaveLength(0);
    }
  });

  it("rejects unknown draftId shape / -na", () => {
    expect(
      parseEspnBookmarkletBridgeMessage({
        type: "GMWR_ESPN_BM_PICK_BATCH",
        provider: "espn-live",
        draftId: "espn-live-12345-na",
        leagueId: "12345",
        season: 2026,
        sessionNonce: "n",
        teamCount: 12,
        draftComplete: false,
        picks: [pickRow(1)],
      }),
    ).toBeNull();
  });

  it("does not parse FantasyPros messages", () => {
    expect(
      parseEspnBookmarkletBridgeMessage({
        source: "gmwarroom-extension",
        type: "GMWR_FP_MOCK_PICK_BATCH",
        provider: "fantasypros",
        draftId: "fp-mock-abc",
        providerDraftId: "abc",
        picks: [{ id: "1", pick: 1, round: 1, posInRound: 1, ownerPos: 0, owner: "A" }],
      }),
    ).toBeNull();
  });

  it("FantasyPros parser still ignores ESPN BM messages", () => {
    expect(
      parseFantasyProsBridgeMessage({
        source: "gmwarroom-extension",
        channel: "GMWR_ESPN_BM",
        type: "GMWR_ESPN_BM_PICK_BATCH",
        provider: "espn-live",
        draftId: "espn-live-12345-2026",
        leagueId: "12345",
        season: 2026,
        sessionNonce: "n",
        picks: [pickRow(1)],
      }),
    ).toBeNull();
  });

  it("maps transport batch into NormalizedPickBatch (espn-live)", () => {
    const converted = espnBmBatchToNormalized(batch({}));
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.batch.provider).toBe("espn-live");
    expect(converted.batch.picks[0]!.pick).toBe(1);
    expect(converted.batch.picks[0]!.overallPick).toBe(1);
    expect(converted.batch.picks[0]!.metadata?.adapter).toBe("espn-bookmarklet");
  });

  it("rejects draftId that does not match league+season", () => {
    const converted = espnBmBatchToNormalized(
      batch({ draftId: "espn-live-999-2026" }),
      { expectedLeagueId: "12345", expectedSeason: 2026 },
    );
    expect(converted.ok).toBe(false);
    if (converted.ok) return;
    expect(converted.error).toBe("unknown_draft_id");
  });
});
