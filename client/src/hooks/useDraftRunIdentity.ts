/**
 * Client persistence for draft-run identity.
 * Uses localStorage so close/reopen of War Room keeps the same active ESPN run.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildBoardPickSignatures,
  buildDraftRunId,
  draftRunStorageKey,
  resolveDraftRunRotation,
  type DraftRunStoredState,
} from "@shared/draftRunIdentity";

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readStored(baseDraftId: string): DraftRunStoredState | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(draftRunStorageKey(baseDraftId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftRunStoredState;
    if (!parsed?.runId || !Array.isArray(parsed.boardSig)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(baseDraftId: string, state: DraftRunStoredState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(draftRunStorageKey(baseDraftId), JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

export type UseDraftRunIdentityArgs = {
  /** Provider base id (may repeat across runs). */
  baseDraftId: string;
  enabled?: boolean;
  /** Locked board rows for continuation detection. */
  lockedPicks: ReadonlyArray<{
    overallPick: number;
    playerId?: string | null;
    playerName?: string | null;
  }>;
  draftComplete: boolean;
  /**
   * Bump when the user starts a genuinely new draft
   * (local resetCounter, FP epoch, etc.).
   */
  newDraftEpoch: number;
};

export type DraftRunIdentity = {
  baseDraftId: string;
  runId: string;
  /** Booth / notify / wrap-up / snapshot id. */
  boothDraftId: string;
  rotated: boolean;
};

export function useDraftRunIdentity(args: UseDraftRunIdentityArgs): DraftRunIdentity {
  const enabled = args.enabled !== false;
  const baseDraftId = String(args.baseDraftId ?? "").trim() || "unknown";
  const boardSig = useMemo(
    () => buildBoardPickSignatures(args.lockedPicks),
    [args.lockedPicks],
  );
  const forceEpochRef = useRef(args.newDraftEpoch);
  const [runId, setRunId] = useState(() => {
    if (!enabled) return "idle";
    const resolved = resolveDraftRunRotation({
      stored: readStored(baseDraftId),
      boardSig,
      draftComplete: args.draftComplete,
      forceNewRun: false,
    });
    writeStored(baseDraftId, resolved.next);
    return resolved.runId;
  });
  const [rotated, setRotated] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const forceNewRun = args.newDraftEpoch !== forceEpochRef.current;
    if (forceNewRun) forceEpochRef.current = args.newDraftEpoch;

    const resolved = resolveDraftRunRotation({
      stored: readStored(baseDraftId),
      boardSig,
      draftComplete: args.draftComplete,
      forceNewRun,
    });
    writeStored(baseDraftId, resolved.next);
    setRunId(resolved.runId);
    setRotated(resolved.rotated);
  }, [
    enabled,
    baseDraftId,
    boardSig,
    args.draftComplete,
    args.newDraftEpoch,
  ]);

  const boothDraftId = enabled ? buildDraftRunId(baseDraftId, runId) : baseDraftId;

  return {
    baseDraftId,
    runId,
    boothDraftId,
    rotated,
  };
}
