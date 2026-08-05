/**
 * Cross-source draft-run identity for booth / wrap-up / Draft Night Show.
 *
 * Provider base ids (espn-live-L-S, war-room-live-YEAR, fp-mock-KEY) may repeat
 * across separate draft runs. A run suffix makes each completed wrap-up unique
 * while staying stable for reconnect/refresh of the same active board.
 *
 * Rotation rules (high level):
 * - Empty / prefix-undercount snapshots are transient → never rotate.
 * - Continuing boards (prefix growth) keep the same runId.
 * - Conflicting non-empty boards rotate exactly once (e.g. ESPN Mock B).
 * - forceNewRun always rotates (local New Draft / FP epoch).
 */

export type DraftRunStoredState = {
  runId: string;
  /** Ordered pick signatures at last save: `${overall}:${playerKey}` */
  boardSig: string[];
  draftComplete: boolean;
  updatedAt: string;
};

export type ResolveDraftRunRotationArgs = {
  stored: DraftRunStoredState | null;
  boardSig: string[];
  draftComplete: boolean;
  /** Explicit new-draft actions (local reset, FP epoch bump, etc.). */
  forceNewRun?: boolean;
  /** Inject clock / id for tests. */
  nowIso?: () => string;
  newRunId?: () => string;
};

export type ResolveDraftRunRotationResult = {
  runId: string;
  rotated: boolean;
  next: DraftRunStoredState;
};

const RUN_SEP = ":run:";

export function newDraftRunId(now: Date = new Date()): string {
  const t = now.getTime().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  return `${t}${r}`.slice(0, 24);
}

/** Append a run suffix once. Idempotent if already present. */
export function buildDraftRunId(baseDraftId: string, runId: string): string {
  const base = String(baseDraftId ?? "").trim();
  const run = String(runId ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .slice(0, 48);
  if (!base) return run ? `unknown${RUN_SEP}${run}` : "unknown";
  if (!run) return base;
  if (base.includes(RUN_SEP)) return base;
  return `${base}${RUN_SEP}${run}`;
}

export function parseDraftRunId(draftId: string): {
  baseDraftId: string;
  runId: string | null;
} {
  const raw = String(draftId ?? "").trim();
  const idx = raw.lastIndexOf(RUN_SEP);
  if (idx <= 0) return { baseDraftId: raw, runId: null };
  return {
    baseDraftId: raw.slice(0, idx),
    runId: raw.slice(idx + RUN_SEP.length) || null,
  };
}

function normPlayerKey(playerId?: string | null, playerName?: string | null): string {
  const id = String(playerId ?? "").trim();
  if (id) return id;
  return String(playerName ?? "")
    .toLowerCase()
    .replace(/[.'’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ordered board signature used for continuation + wrap-up fingerprint checks. */
export function buildBoardPickSignatures(
  picks: ReadonlyArray<{
    overallPick: number;
    playerId?: string | null;
    playerName?: string | null;
  }>,
): string[] {
  return picks
    .filter((p) => Number.isFinite(p.overallPick) && p.overallPick > 0)
    .map((p) => {
      const overall = Math.floor(Number(p.overallPick));
      return `${overall}:${normPlayerKey(p.playerId, p.playerName)}`;
    })
    .sort((a, b) => Number(a.split(":")[0]) - Number(b.split(":")[0]));
}

/** Compact fingerprint string for server wrap-up storage. */
export function fingerprintBoardSignatures(boardSig: readonly string[]): string {
  if (boardSig.length === 0) return "empty";
  let h = 2166136261;
  const joined = boardSig.join("|");
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${boardSig.length}:${(h >>> 0).toString(36)}`;
}

export function fingerprintLockedBoard(
  picks: ReadonlyArray<{
    overallPick: number;
    playerId?: string | null;
    playerName?: string | null;
  }>,
): string {
  return fingerprintBoardSignatures(buildBoardPickSignatures(picks));
}

/**
 * True when `next` is the same draft progressed (or equal), not a replaced board.
 * Requires `next` to be at least as long as `previous` and share the same prefix.
 */
export function isBoardContinuation(
  previous: readonly string[],
  next: readonly string[],
): boolean {
  if (previous.length === 0) return true;
  if (next.length < previous.length) return false;
  for (let i = 0; i < previous.length; i++) {
    if (previous[i] !== next[i]) return false;
  }
  return true;
}

/**
 * Empty boards and prefix undercounts are treated as loading/reconnect noise —
 * not a new draft. Conflicting early picks are NOT transient.
 */
export function isTransientBoardObservation(
  previous: readonly string[],
  next: readonly string[],
): boolean {
  if (next.length === 0) return true;
  if (previous.length === 0) return false;
  if (next.length >= previous.length) return false;
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== previous[i]) return false;
  }
  return true;
}

/**
 * Decide whether to keep or rotate the run id for a draft session.
 * Reconnect/refresh with a continuing (or transiently empty/partial) board
 * keeps the same runId.
 */
export function resolveDraftRunRotation(
  args: ResolveDraftRunRotationArgs,
): ResolveDraftRunRotationResult {
  const nowIso = args.nowIso ?? (() => new Date().toISOString());
  const mint = args.newRunId ?? (() => newDraftRunId());
  const boardSig = [...args.boardSig];
  const draftComplete = Boolean(args.draftComplete);

  const stamp = (
    runId: string,
    rotated: boolean,
    nextBoard: string[],
    nextComplete: boolean,
  ): ResolveDraftRunRotationResult => ({
    runId,
    rotated,
    next: {
      runId,
      boardSig: nextBoard,
      draftComplete: nextComplete,
      updatedAt: nowIso(),
    },
  });

  if (args.forceNewRun) {
    return stamp(mint(), true, boardSig, draftComplete);
  }

  const stored = args.stored;
  if (!stored?.runId) {
    return stamp(mint(), true, boardSig, draftComplete);
  }

  // Refresh / reopen / extension race: empty or prefix-undercount must not rotate.
  if (isTransientBoardObservation(stored.boardSig, boardSig)) {
    return stamp(
      stored.runId,
      false,
      stored.boardSig,
      stored.draftComplete || draftComplete,
    );
  }

  // Same draft progressed (or equal), including reconnect to a completed board.
  if (isBoardContinuation(stored.boardSig, boardSig)) {
    return stamp(
      stored.runId,
      false,
      boardSig.length >= stored.boardSig.length ? boardSig : stored.boardSig,
      stored.draftComplete || draftComplete,
    );
  }

  // Non-empty conflicting board ⇒ genuinely new draft run (e.g. ESPN Mock B).
  return stamp(mint(), true, boardSig, draftComplete);
}

export function draftRunStorageKey(baseDraftId: string): string {
  return `rfsn.draftRun.v1:${String(baseDraftId ?? "").trim() || "unknown"}`;
}
