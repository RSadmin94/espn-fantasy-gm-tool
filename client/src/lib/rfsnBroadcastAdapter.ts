/**
 * RFSN broadcast adapter — pure, deterministic mapping from draft moments and
 * commentary results to RfsnBroadcastSnapshot. No React, network, or timers.
 */
import type { CommentaryLevel } from "../../../server/services/sofia/sofiaContract";
import type {
  RfsnBroadcastSnapshot,
  RfsnCommentaryCard,
  RfsnCommentatorId,
  RfsnDraftPickRow,
  RfsnOrderSlot,
  RfsnQueuedMoment,
  RfsnSignificance,
  RfsnTickerItem,
} from "./rfsnPresentation";

// ── Input contracts ───────────────────────────────────────────────────────────

/** Stable pick identity — pickId must be eventId / momentId when available. */
export type BroadcastPickIdentity = {
  draftId: string;
  pickNumber: number;
  pickId: string;
};

export type DraftMomentSignificance = CommentaryLevel;

export type CommentaryAcceptanceStatus =
  | "accepted"
  | "rejected"
  | "generation_failed"
  | "empty";

/** One voice result bound to a specific pick. */
export type RfsnCommentaryResult = {
  draftId: string;
  pickNumber: number;
  pickId: string;
  commentator: RfsnCommentatorId;
  label: string;
  text: string;
  status: CommentaryAcceptanceStatus;
  long?: boolean;
};

export type RfsnBroadcastMomentContext = {
  breakingNews?: { headline: string; body: string };
  positionRun?: { count: number; position: string };
  leagueStoryline?: { title: string; body: string };
};

export type RfsnDraftBoardInput = {
  round: number;
  pickInRound: number;
  overallPick: string;
  onClockTeam: string;
  clockSeconds: number;
  draftOrder: readonly RfsnOrderSlot[];
  board: readonly RfsnDraftPickRow[];
  championshipOdds: readonly { team: string; pct: number }[];
};

export type RfsnActiveBroadcastMoment = {
  identity: BroadcastPickIdentity;
  significance: DraftMomentSignificance;
  context?: RfsnBroadcastMomentContext;
  /** When true, commentary for other picks is deferred to the queue. */
  onAir: boolean;
};

/** A moment waiting to enqueue while another is on-air. */
export type RfsnPendingBroadcastMoment = {
  identity: BroadcastPickIdentity;
  significance: DraftMomentSignificance;
  context?: RfsnBroadcastMomentContext;
  commentaryResults: readonly RfsnCommentaryResult[];
};

export type RfsnBroadcastAdapterInput = {
  draft: RfsnDraftBoardInput;
  activeMoment: RfsnActiveBroadcastMoment | null;
  commentaryResults: readonly RfsnCommentaryResult[];
  queue: readonly RfsnQueuedMoment[];
  /** Moments to enqueue this frame (e.g. commentary arriving for a non-active pick). */
  pendingEnqueues?: readonly RfsnPendingBroadcastMoment[];
  existingTicker?: readonly RfsnTickerItem[];
  draftComplete?: boolean;
};

export type RfsnBroadcastAdapterOutput = {
  snapshot: RfsnBroadcastSnapshot;
  queue: RfsnQueuedMoment[];
};

// ── Voice priority (deterministic; never rely on insertion order) ───────────

export const VOICE_PRIORITY: readonly RfsnCommentatorId[] = ["sofia", "coach", "roxanne"];

const SIGNIFICANCE_METER: Record<RfsnSignificance, number> = {
  routine: 0.15,
  notable: 0.55,
  major: 0.78,
  historic: 1,
};

const LONG_TEXT_THRESHOLD = 120;

// ── Identity helpers ──────────────────────────────────────────────────────────

export function pickIdentityKey(identity: BroadcastPickIdentity): string {
  return `${identity.draftId}:${identity.pickNumber}:${identity.pickId}`;
}

export function identitiesMatch(
  a: BroadcastPickIdentity,
  b: BroadcastPickIdentity,
): boolean {
  return (
    a.draftId === b.draftId &&
    a.pickNumber === b.pickNumber &&
    a.pickId === b.pickId
  );
}

export function commentaryIdentity(result: RfsnCommentaryResult): BroadcastPickIdentity {
  return {
    draftId: result.draftId,
    pickNumber: result.pickNumber,
    pickId: result.pickId,
  };
}

// ── Significance ──────────────────────────────────────────────────────────────

export function mapDraftMomentSignificance(
  level: DraftMomentSignificance | null | undefined,
): RfsnSignificance {
  switch (level) {
    case "notable":
    case "major":
    case "historic":
      return level;
    case "routine":
      return "routine";
    default:
      return "routine";
  }
}

// ── Commentary filtering ──────────────────────────────────────────────────────

export function isAcceptedCommentary(result: RfsnCommentaryResult): boolean {
  if (result.status !== "accepted") return false;
  return result.text.trim().length > 0;
}

export function filterAcceptedCommentary(
  results: readonly RfsnCommentaryResult[],
): RfsnCommentaryResult[] {
  return results.filter(isAcceptedCommentary);
}

export function isCommentaryForActivePick(
  result: RfsnCommentaryResult,
  active: BroadcastPickIdentity,
): boolean {
  return identitiesMatch(commentaryIdentity(result), active);
}

/**
 * Stale results never attach, queue, or ticker from the active-moment path.
 * - wrong draft
 * - pick already passed (lower pick number)
 * - reused pick number with different pickId
 * - any result after draft completion
 */
export function isStaleCommentary(
  result: RfsnCommentaryResult,
  active: BroadcastPickIdentity | null,
  draftComplete: boolean,
): boolean {
  if (draftComplete) return true;
  if (!active) return false;

  const r = commentaryIdentity(result);
  if (r.draftId !== active.draftId) return true;
  if (r.pickNumber < active.pickNumber) return true;
  if (r.pickNumber === active.pickNumber && r.pickId !== active.pickId) return true;
  return false;
}

export function discardStaleCommentary(
  results: readonly RfsnCommentaryResult[],
  active: BroadcastPickIdentity | null,
  draftComplete: boolean,
): RfsnCommentaryResult[] {
  return results.filter((r) => !isStaleCommentary(r, active, draftComplete));
}

export function filterCommentaryForPick(
  results: readonly RfsnCommentaryResult[],
  identity: BroadcastPickIdentity,
): RfsnCommentaryResult[] {
  return results.filter((r) => isCommentaryForActivePick(r, identity));
}

function sortByVoicePriority(results: RfsnCommentaryResult[]): RfsnCommentaryResult[] {
  return [...results].sort(
    (a, b) => VOICE_PRIORITY.indexOf(a.commentator) - VOICE_PRIORITY.indexOf(b.commentator),
  );
}

function toCard(
  result: RfsnCommentaryResult,
  slot: "primary" | "secondary",
): RfsnCommentaryCard {
  const long =
    result.long === true || result.text.trim().length > LONG_TEXT_THRESHOLD;
  return {
    id: `${result.pickId}:${result.commentator}:${slot}`,
    commentator: result.commentator,
    label: result.label,
    text: result.text.trim(),
    ...(long ? { long: true } : {}),
  };
}

function toTickerItem(result: RfsnCommentaryResult, index: number): RfsnTickerItem {
  const text = result.text.trim();
  return {
    id: `${result.pickId}:${result.commentator}:ticker:${index}`,
    commentator: result.commentator,
    text: text.length > 80 ? `${text.slice(0, 77)}...` : text,
  };
}

export type OnAirCommentarySelection = {
  primary: RfsnCommentaryCard | null;
  secondary: RfsnCommentaryCard | null;
  /** Accepted voices beyond primary/secondary */
  overflow: RfsnCommentaryResult[];
};

/**
 * Select on-air cards from accepted commentary.
 * Rejected or failed voices are excluded before this runs.
 * Highest-priority accepted voice becomes primary; next becomes secondary.
 */
export function selectOnAirCommentary(
  accepted: readonly RfsnCommentaryResult[],
  significance: RfsnSignificance,
): OnAirCommentarySelection {
  const sorted = sortByVoicePriority([...accepted]);

  if (significance === "routine") {
    return { primary: null, secondary: null, overflow: [] };
  }

  const [first, second, ...rest] = sorted;
  return {
    primary: first ? toCard(first, "primary") : null,
    secondary: second ? toCard(second, "secondary") : null,
    overflow: rest,
  };
}

/** Non-routine overflow voices move to ticker; routine commentary is fully suppressed. */
export function resolveDeferredCommentary(
  overflow: readonly RfsnCommentaryResult[],
  significance: RfsnSignificance,
  startIndex = 0,
): RfsnTickerItem[] {
  if (overflow.length === 0 || significance === "routine") return [];
  return overflow.map((r, i) => toTickerItem(r, startIndex + i));
}

// ── Context graphics (matches approved presentation priority) ─────────────────

export type ResolvedContextFields = {
  breakingNews?: { headline: string; body: string };
  positionRun?: { count: number; position: string };
  leagueStoryline?: { title: string; body: string };
};

/**
 * Only one prominent context graphic is written to the snapshot.
 * Championship odds are always supplied separately as the quiet strip.
 */
export function resolveContextFields(
  significance: RfsnSignificance,
  context: RfsnBroadcastMomentContext | undefined,
): ResolvedContextFields {
  const ctx = context ?? {};
  if (ctx.breakingNews) {
    return { breakingNews: { ...ctx.breakingNews } };
  }
  if (significance === "historic" && !ctx.breakingNews) {
    return {};
  }
  if (ctx.positionRun) {
    return { positionRun: { ...ctx.positionRun } };
  }
  if (ctx.leagueStoryline) {
    return { leagueStoryline: { ...ctx.leagueStoryline } };
  }
  return {};
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export function buildQueuedMomentFromPending(
  pending: RfsnPendingBroadcastMoment,
): RfsnQueuedMoment | null {
  const significance = mapDraftMomentSignificance(pending.significance);
  const matching = filterCommentaryForPick(pending.commentaryResults, pending.identity);
  const accepted = filterAcceptedCommentary(matching);
  const { primary, secondary } = selectOnAirCommentary(accepted, significance);

  if (!primary && significance !== "routine") {
    const hasContext =
      pending.context?.breakingNews ||
      pending.context?.positionRun ||
      pending.context?.leagueStoryline;
    if (!hasContext) return null;
  }

  if (!primary) return null;

  const contextFields = resolveContextFields(significance, pending.context);
  return {
    id: pickIdentityKey(pending.identity),
    significance,
    primary,
    ...(secondary ? { secondary } : {}),
    ...contextFields,
  };
}

export function enqueueBroadcastMoment(
  queue: readonly RfsnQueuedMoment[],
  moment: RfsnQueuedMoment,
): RfsnQueuedMoment[] {
  const key = moment.id;
  if (queue.some((q) => q.id === key)) {
    return [...queue];
  }
  return [...queue, moment];
}

export function enqueuePendingMoments(
  queue: readonly RfsnQueuedMoment[],
  pending: readonly RfsnPendingBroadcastMoment[],
): RfsnQueuedMoment[] {
  let next = [...queue];
  for (const p of pending) {
    const built = buildQueuedMomentFromPending(p);
    if (built) {
      next = enqueueBroadcastMoment(next, built);
    }
  }
  return next;
}

export function promoteQueuedMoment(queue: readonly RfsnQueuedMoment[]): {
  promoted: RfsnQueuedMoment | null;
  remaining: RfsnQueuedMoment[];
} {
  if (queue.length === 0) {
    return { promoted: null, remaining: [] };
  }
  const [promoted, ...remaining] = queue;
  return { promoted: promoted ?? null, remaining };
}

// ── Snapshot builder ─────────────────────────────────────────────────────────

function cloneDraftInput(draft: RfsnDraftBoardInput) {
  return {
    round: draft.round,
    pickInRound: draft.pickInRound,
    overallPick: draft.overallPick,
    onClockTeam: draft.onClockTeam,
    clockSeconds: draft.clockSeconds,
    draftOrder: [...draft.draftOrder],
    board: [...draft.board],
    championshipOdds: [...draft.championshipOdds],
  };
}

function buildCompletedSnapshot(
  input: RfsnBroadcastAdapterInput,
): RfsnBroadcastAdapterOutput {
  const draft = cloneDraftInput(input.draft);
  return {
    snapshot: {
      ...draft,
      significance: "routine",
      momentMeter: SIGNIFICANCE_METER.routine,
      ticker: [...(input.existingTicker ?? [])],
      queue: [],
    },
    queue: [],
  };
}

export function buildRfsnBroadcastSnapshot(
  input: RfsnBroadcastAdapterInput,
): RfsnBroadcastAdapterOutput {
  const draft = cloneDraftInput(input.draft);

  if (input.draftComplete) {
    return buildCompletedSnapshot(input);
  }

  const active = input.activeMoment;
  let queue = [...input.queue];

  if (input.pendingEnqueues?.length) {
    queue = enqueuePendingMoments(queue, input.pendingEnqueues);
  }

  const significance = active
    ? mapDraftMomentSignificance(active.significance)
    : "routine";

  const contextFields = active
    ? resolveContextFields(significance, active.context)
    : {};

  let primary: RfsnCommentaryCard | undefined;
  let secondary: RfsnCommentaryCard | undefined;
  const ticker: RfsnTickerItem[] = [...(input.existingTicker ?? [])];

  if (active) {
    const eligible = discardStaleCommentary(
      input.commentaryResults,
      active.identity,
      false,
    );
    const forActive = filterCommentaryForPick(eligible, active.identity);
    const accepted = filterAcceptedCommentary(forActive);
    const selection = selectOnAirCommentary(accepted, significance);

    if (selection.primary) primary = selection.primary;
    if (selection.secondary) secondary = selection.secondary;

    const deferred = resolveDeferredCommentary(selection.overflow, significance, ticker.length);
    ticker.push(...deferred);
  }

  const snapshot: RfsnBroadcastSnapshot = {
    ...draft,
    significance,
    momentMeter: SIGNIFICANCE_METER[significance],
    ...contextFields,
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
    ticker,
    queue,
  };

  return { snapshot, queue };
}
