/**
 * @vitest-environment node
 * Phase 3 — ESPN bookmarklet ingest planner (dedupe / nonce / notify once).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

let batchRevisionSeq = 0;

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
    revision?: number;
  } = {},
): EspnBmBridgePickBatch {
  const { picks, revision = ++batchRevisionSeq, ...rest } = overrides;
  return {
    type: "GMWR_ESPN_BM_PICK_BATCH",
    protocolVersion: 1 as const,
    revision,
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
  beforeEach(() => {
    batchRevisionSeq = 0;
  });

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

describe("Phase 4 reload / replay ingest", () => {
  it("reload before first batch: empty state accepts baseline reconcile", () => {
    const plan = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1), pickRow(2)],
        diagnostics: { replay: true, replayRequestId: "r0" },
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.notifyEvents).toHaveLength(0);
    expect(plan.projectionBatch?.picks).toHaveLength(2);
  });

  it("reload after baseline: delta replay notifies only unseen live picks", () => {
    let state = createEspnBmIngestState();
    const baseline = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1), pickRow(2)],
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    state = baseline.next;

    const replay = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: false,
        liveNotify: true,
        picks: [pickRow(2), pickRow(3)],
        diagnostics: { replay: true, replayRequestId: "after-base" },
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.notifyEvents.map((e) => e.overallPick)).toEqual([3]);
  });

  it("reload during live draft: full remount baseline does not re-notify", () => {
    const plan = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1), pickRow(2), pickRow(3)],
        diagnostics: { replay: true, replayRequestId: "remount" },
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.notifyEvents).toHaveLength(0);
    expect(plan.next.maxOverallSeen).toBe(3);
  });

  it("replay with duplicate batches is ignored", () => {
    let state = createEspnBmIngestState();
    const batch = makeBatch({
      picks: [pickRow(4)],
      diagnostics: { replay: true, replayRequestId: "dup" },
    });
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

  it("replay after reconnect delay still applies once (fresh fingerprint per requestId)", () => {
    let state = createEspnBmIngestState();
    const a = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1)],
        diagnostics: { replay: true, replayRequestId: "delay-a" },
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    state = a.next;
    const b = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        baselineOnly: true,
        liveNotify: false,
        picks: [pickRow(1)],
        diagnostics: { replay: true, replayRequestId: "delay-b" },
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    // Different requestId → not duplicate_batch; still no notify (baseline + already seeded).
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.notifyEvents).toHaveLength(0);
  });

  it("rejects wrong sessionNonce and unknown draftId on replay-shaped batches", () => {
    expect(
      planEspnBookmarkletBatchIngest({
        batch: makeBatch({
          sessionNonce: "nope",
          diagnostics: { replay: true, replayRequestId: "x" },
        }),
        expectedLeagueId: "12345",
        expectedSeason: 2026,
        expectedSessionNonce: "nonce-abc",
        state: createEspnBmIngestState(),
      }).ok,
    ).toBe(false);

    const badDraft = planEspnBookmarkletBatchIngest({
      batch: makeBatch({
        draftId: "espn-live-99999-2026",
        diagnostics: { replay: true, replayRequestId: "y" },
      }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state: createEspnBmIngestState(),
    });
    expect(badDraft.ok).toBe(false);
    if (badDraft.ok) return;
    expect(badDraft.error).toBe("unknown_draft_id");
  });

  it("rejects regressive and repeated revisions", () => {
    let state = createEspnBmIngestState();
    const first = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ revision: 3, picks: [pickRow(1)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.next;

    const repeated = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ revision: 3, picks: [pickRow(2)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(repeated.ok).toBe(false);
    if (repeated.ok) return;
    expect(repeated.error).toBe("duplicate_batch");

    const regressive = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ revision: 2, picks: [pickRow(2)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(regressive.ok).toBe(false);
    if (regressive.ok) return;
    expect(regressive.error).toBe("regressive_revision");

    const next = planEspnBookmarkletBatchIngest({
      batch: makeBatch({ revision: 4, picks: [pickRow(2)] }),
      expectedLeagueId: "12345",
      expectedSeason: 2026,
      expectedSessionNonce: "nonce-abc",
      state,
    });
    expect(next.ok).toBe(true);
  });
});
