/**
 * @vitest-environment node
 * Phase 3 — ESPN bookmarklet ingest planner (dedupe / nonce / notify once).
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyNormalizedPickBatch,
  createDraftSessionState,
  toNotifyLockedPickRequest,
} from "@shared/draftSource";
import type { EspnBmBridgePickBatch } from "./espnBookmarkletBridge";
import {
  createEspnBmIngestState,
  planEspnBookmarkletBatchIngest,
} from "./espnBookmarkletIngest";

function pickRow(over: number, name = `Player ${over}`) {
  return {
    eventKey: `ek-${over}`,
    overallPick: over,
    round: 1,
    pickInRound: over,
    teamId: String(over),
    teamName: `Team ${over}`,
    ownerName: `Owner ${over}`,
    playerId: `pid-${over}`,
    playerName: name,
    position: "RB",
    nflTeam: "ATL",
    isKeeper: false,
    isTradedPick: false,
    playerIdSource: "espn" as const,
  };
}

function makeBatch(
  overrides: Partial<EspnBmBridgePickBatch> & {
    picks?: ReturnType<typeof pickRow>[];
  } = {},
): EspnBmBridgePickBatch {
  const { picks, ...rest } = overrides;
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

describe("planEspnBookmarkletBatchIngest", () => {
  it("accepts ESPN live batch and plans notify once", () => {
    const plan = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ liveNotify: true, baselineOnly: false }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.projectionBatch?.picks).toHaveLength(1);
    expect(plan.notifyEvents).toHaveLength(1);
    expect(plan.notifyEvents[0]!.provider).toBe("espn-live");
  });

  it("baseline projects without notify", () => {
    const plan = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1), pickRow(2)],
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.projectionBatch?.picks).toHaveLength(2);
    expect(plan.notifyEvents).toHaveLength(0);
    expect(plan.next.alreadyNotified.size).toBe(2);
  });

  it("rejects wrong sessionNonce", () => {
    const plan = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ sessionNonce: "other" }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe("wrong_session_nonce");
  });

  it("rejects unknown draftId", () => {
    const plan = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ draftId: "espn-live-99999-2026" }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.error).toBe("unknown_draft_id");
  });

  it("ignores duplicate batch", () => {
    let state = createEspnBmIngestState();
    const batch = makeBatch();
    const first = planEspnBookmarkletBatchIngest({
      batch,
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.next;
    const second = planEspnBookmarkletBatchIngest({
      batch,
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe("duplicate_batch");
  });

  it("does not re-notify already-processed picks on overlapping live batch", () => {
    let state = createEspnBmIngestState();
    const first = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ picks: [pickRow(1)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.next;
    const second = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        picks: [pickRow(1), pickRow(2)],
        // different fingerprint (extra pick)
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.notifyEvents).toHaveLength(1);
    expect(second.notifyEvents[0]!.overallPick).toBe(2);
  });

  it("rejects out-of-order replay", () => {
    let state = createEspnBmIngestState();
    const first = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ picks: [pickRow(2)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.next;
    const replay = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ picks: [pickRow(1)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) return;
    expect(replay.error).toBe("out_of_order_replay");
  });

  it("applyNormalizedPickBatch + notifyLockedPick once per new pick (integration path)", () => {
    const notify = vi.fn();
    let session = createDraftSessionState({
      sessionKey: "t",
      draftId: "espn-live-12345-2026",
      provider: "espn-live",
    });
    let state = createEspnBmIngestState();

    const baseline = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1, "Bijan Robinson")],
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    state = baseline.next;
    if (baseline.projectionBatch) {
      session = applyNormalizedPickBatch(session, baseline.projectionBatch).state;
    }
    expect(baseline.notifyEvents).toHaveLength(0);
    expect(Object.keys(session.results)).toHaveLength(1);

    const live = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        picks: [pickRow(2, "CeeDee Lamb")],
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(live.ok).toBe(true);
    if (!live.ok) return;
    if (live.projectionBatch) {
      session = applyNormalizedPickBatch(session, live.projectionBatch).state;
    }
    for (const event of live.notifyEvents) {
      notify(
        toNotifyLockedPickRequest(event, {
          teamCount: 12,
          draftComplete: false,
        }),
      );
    }
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0].pick.playerName).toBe("CeeDee Lamb");
    expect(Object.keys(session.results)).toHaveLength(2);

    // Replay live batch fingerprint → rejected; no second notify
    const dup = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        picks: [pickRow(2, "CeeDee Lamb")],
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: live.next,
    });
    expect(dup.ok).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
