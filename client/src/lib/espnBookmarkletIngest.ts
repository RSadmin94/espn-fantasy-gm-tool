/**
 * Phase 3 — ESPN bookmarklet batch → existing NormalizedPickBatch / notify path.
 * Validation + dedupe only; no FantasyPros mapping, no grading/commentary.
 */
import { draftEventIdempotencyKey } from "@shared/draftSource";
import type { NormalizedPickBatch, NormalizedPickEvent } from "@shared/draftSource";
import {
  espnBmBatchToNormalized,
  type EspnBmBridgePickBatch,
} from "@/lib/espnBookmarkletBridge";

export function espnBmBatchFingerprint(batch: EspnBmBridgePickBatch): string {
  const keys = batch.picks.map((p) => p.eventKey).sort();
  const replayId =
    batch.diagnostics && typeof batch.diagnostics.replayRequestId === "string"
      ? batch.diagnostics.replayRequestId
      : "";
  return [
    batch.draftId,
    batch.sessionNonce,
    batch.baselineOnly ? "b1" : "b0",
    batch.liveNotify ? "n1" : "n0",
    batch.draftComplete ? "c1" : "c0",
    replayId ? `r:${replayId}` : "r0",
    keys.join(","),
  ].join("|");
}

export type EspnBmIngestState = {
  alreadyNotified: ReadonlySet<string>;
  seenBatchFingerprints: ReadonlySet<string>;
  maxOverallSeen: number;
  draftCompleteApplied: boolean;
  /** Last accepted transport revision for the active sessionNonce. */
  lastAcceptedRevision: number;
};

export type EspnBmIngestPlan = {
  ok: true;
  projectionBatch: NormalizedPickBatch | null;
  /** Events that should call notifyLockedPick exactly once each. */
  notifyEvents: NormalizedPickEvent[];
  next: EspnBmIngestState;
} | {
  ok: false;
  error:
    | "wrong_session_nonce"
    | "unknown_draft_id"
    | "league_mismatch"
    | "season_mismatch"
    | "duplicate_batch"
    | "out_of_order_replay"
    | "regressive_revision";
  next: EspnBmIngestState;
};

/**
 * Plan projection + notify for one validated transport batch.
 * Baseline (liveNotify=false): project only; seed notify keys.
 * Live delta (liveNotify=true): project + notify new picks only.
 */
export function planEspnBookmarkletBatchIngest(args: {
  batch: EspnBmBridgePickBatch;
  expectedLeagueId: string;
  expectedSeason: number;
  expectedSessionNonce: string;
  state: EspnBmIngestState;
}): EspnBmIngestPlan {
  const { batch, expectedLeagueId, expectedSeason, expectedSessionNonce, state } = args;
  const nextBase: EspnBmIngestState = {
    alreadyNotified: new Set(state.alreadyNotified),
    seenBatchFingerprints: new Set(state.seenBatchFingerprints),
    maxOverallSeen: state.maxOverallSeen,
    draftCompleteApplied: state.draftCompleteApplied,
    lastAcceptedRevision: state.lastAcceptedRevision,
  };

  if (batch.sessionNonce !== expectedSessionNonce) {
    return { ok: false, error: "wrong_session_nonce", next: nextBase };
  }

  const revision = Math.floor(Number(batch.revision));
  if (!Number.isFinite(revision) || revision < 1) {
    return { ok: false, error: "regressive_revision", next: nextBase };
  }
  if (revision < nextBase.lastAcceptedRevision) {
    return { ok: false, error: "regressive_revision", next: nextBase };
  }
  if (revision === nextBase.lastAcceptedRevision && nextBase.lastAcceptedRevision > 0) {
    return { ok: false, error: "duplicate_batch", next: nextBase };
  }

  const converted = espnBmBatchToNormalized(batch, {
    expectedLeagueId,
    expectedSeason,
  });
  if (!converted.ok) {
    return {
      ok: false,
      error: converted.error as
        | "unknown_draft_id"
        | "league_mismatch"
        | "season_mismatch",
      next: nextBase,
    };
  }

  const fingerprint = espnBmBatchFingerprint(batch);
  const seenBatches = new Set(nextBase.seenBatchFingerprints);
  if (seenBatches.has(fingerprint)) {
    return { ok: false, error: "duplicate_batch", next: nextBase };
  }
  seenBatches.add(fingerprint);
  nextBase.seenBatchFingerprints = seenBatches;

  const normalized = converted.batch;
  const liveNotify = Boolean(batch.liveNotify) && !batch.baselineOnly;

  // Out-of-order replay: any pick strictly behind the frontier on a live notify batch.
  if (liveNotify && normalized.picks.length > 0) {
    const behind = normalized.picks.some(
      (p) => p.overallPick < nextBase.maxOverallSeen,
    );
    if (behind) {
      return { ok: false, error: "out_of_order_replay", next: nextBase };
    }
  }

  const notifyEvents: NormalizedPickEvent[] = [];
  const notified = new Set(nextBase.alreadyNotified);

  for (const event of normalized.picks) {
    const key = draftEventIdempotencyKey(event);
    if (liveNotify) {
      if (!notified.has(key)) {
        notified.add(key);
        notifyEvents.push(event);
      }
    } else {
      // Baseline / completion-without-live: seed so history never re-notifies.
      notified.add(key);
    }
    if (event.overallPick > nextBase.maxOverallSeen) {
      nextBase.maxOverallSeen = event.overallPick;
    }
  }

  if (normalized.draftComplete) {
    nextBase.draftCompleteApplied = true;
  }
  nextBase.lastAcceptedRevision = revision;
  nextBase.alreadyNotified = notified;

  const projectionBatch: NormalizedPickBatch | null =
    normalized.picks.length > 0 || normalized.draftComplete ? normalized : null;

  return {
    ok: true,
    projectionBatch,
    notifyEvents,
    next: nextBase,
  };
}

export function createEspnBmIngestState(): EspnBmIngestState {
  return {
    alreadyNotified: new Set(),
    seenBatchFingerprints: new Set(),
    maxOverallSeen: 0,
    draftCompleteApplied: false,
    lastAcceptedRevision: 0,
  };
}
