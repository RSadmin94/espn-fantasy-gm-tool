/**
 * Shared Draft Session projector — provider-agnostic board state.
 * All sources apply NormalizedPickEvent here; UI derives rosters/grades/wrap-up.
 */
import type { DraftProviderId, NormalizedPickBatch, NormalizedPickEvent } from "./types";

export type DraftSessionLockedPick = {
  id: string;
  name: string;
  position: string;
  adp: number | null;
  marketValue: number | null;
  projectedPoints?: number;
  nflTeam?: string | null;
  isKeeper?: boolean;
  byAI?: boolean;
  byUser?: boolean;
};

export type DraftSessionState = {
  sessionKey: string;
  draftId: string;
  provider: DraftProviderId | null;
  results: Record<number, DraftSessionLockedPick>;
  appliedKeys: ReadonlySet<string>;
  draftComplete: boolean;
};

export type DraftSessionEnrichment = Partial<
  Pick<DraftSessionLockedPick, "adp" | "marketValue" | "projectedPoints" | "nflTeam" | "byAI" | "byUser" | "isKeeper">
>;

export function draftEventIdempotencyKey(event: NormalizedPickEvent): string {
  return `${event.draftId}:${event.overallPick}:${event.playerId}:${event.playerName.trim().toLowerCase()}`;
}

export function createDraftSessionState(args: {
  sessionKey: string;
  draftId: string;
  provider?: DraftProviderId | null;
  baselineResults?: Record<number, DraftSessionLockedPick>;
}): DraftSessionState {
  const results: Record<number, DraftSessionLockedPick> = {
    ...(args.baselineResults ?? {}),
  };
  const appliedKeys = new Set<string>();
  for (const [pickNum, pick] of Object.entries(results)) {
    if (!pick?.name) continue;
    appliedKeys.add(
      `${args.draftId}:${pickNum}:${pick.id}:${pick.name.trim().toLowerCase()}`,
    );
  }
  return {
    sessionKey: args.sessionKey,
    draftId: args.draftId,
    provider: args.provider ?? null,
    results,
    appliedKeys,
    draftComplete: false,
  };
}

export function applyNormalizedPickEvent(
  state: DraftSessionState,
  event: NormalizedPickEvent,
  opts?: {
    enrich?: DraftSessionEnrichment | null;
    forceComplete?: boolean;
  },
): { state: DraftSessionState; applied: boolean } {
  const key = draftEventIdempotencyKey(event);
  if (state.appliedKeys.has(key)) {
    const draftComplete =
      state.draftComplete ||
      Boolean(opts?.forceComplete) ||
      Boolean(event.metadata?.draftCompletePick);
    if (draftComplete === state.draftComplete) return { state, applied: false };
    return { state: { ...state, draftComplete }, applied: false };
  }

  const existing = state.results[event.overallPick];
  if (
    existing?.name &&
    existing.name.trim().toLowerCase() === event.playerName.trim().toLowerCase()
  ) {
    const nextKeys = new Set(state.appliedKeys);
    nextKeys.add(key);
    return {
      state: {
        ...state,
        appliedKeys: nextKeys,
        draftComplete:
          state.draftComplete ||
          Boolean(opts?.forceComplete) ||
          Boolean(event.metadata?.draftCompletePick),
      },
      applied: false,
    };
  }

  const enrich = opts?.enrich ?? {};
  const locked: DraftSessionLockedPick = {
    id: event.playerId,
    name: event.playerName,
    position: event.position || "?",
    adp: event.adp ?? enrich.adp ?? null,
    marketValue: enrich.marketValue ?? null,
    projectedPoints: enrich.projectedPoints,
    nflTeam: event.nflTeam ?? enrich.nflTeam ?? null,
    isKeeper: enrich.isKeeper,
    byAI: enrich.byAI,
    byUser: enrich.byUser,
  };

  const nextKeys = new Set(state.appliedKeys);
  nextKeys.add(key);

  return {
    state: {
      ...state,
      provider: event.provider,
      draftId: event.draftId,
      results: { ...state.results, [event.overallPick]: locked },
      appliedKeys: nextKeys,
      draftComplete:
        state.draftComplete ||
        Boolean(opts?.forceComplete) ||
        Boolean(event.metadata?.draftCompletePick),
    },
    applied: true,
  };
}

export function applyNormalizedPickBatch(
  state: DraftSessionState,
  batch: NormalizedPickBatch,
  enrichFn?: (event: NormalizedPickEvent) => DraftSessionEnrichment | null,
): { state: DraftSessionState; appliedCount: number } {
  let next = state;
  let appliedCount = 0;
  const lastOverall =
    batch.picks.length > 0
      ? Math.max(...batch.picks.map((p) => p.overallPick))
      : -1;

  for (const event of batch.picks) {
    const forceComplete =
      batch.draftComplete && event.overallPick === lastOverall;
    const result = applyNormalizedPickEvent(next, event, {
      enrich: enrichFn?.(event) ?? null,
      forceComplete,
    });
    next = result.state;
    if (result.applied) appliedCount += 1;
  }

  if (batch.draftComplete) {
    next = { ...next, draftComplete: true };
  }

  return { state: next, appliedCount };
}

/** First schedule index whose pickNumber is not yet locked (by name). */
export function computeScheduleCursor(
  schedule: readonly { pickNumber: number }[],
  results: Record<number, { name?: string } | undefined>,
): number {
  for (let i = 0; i < schedule.length; i++) {
    const pn = schedule[i]!.pickNumber;
    if (!results[pn]?.name) return i;
  }
  return schedule.length;
}

export function isDraftSessionComplete(args: {
  draftCompleteFlag: boolean;
  scheduleLength: number;
  cursor: number;
}): boolean {
  if (args.draftCompleteFlag) return true;
  if (args.scheduleLength <= 0) return false;
  return args.cursor >= args.scheduleLength;
}

/** Same letter-grade algorithm LiveDraftEngine used inline (provider-agnostic). */
export function computeDraftGradesFromRosters(
  rostersByTeam: Map<
    number,
    Array<{
      pickNumber: number;
      adp?: number | null;
      marketValue?: number | null;
      isKeeper?: boolean;
    }>
  >,
): Map<number, { letter: string; avgDelta: number; strength: number }> {
  const raw = new Map<
    number,
    { score: number; avgDelta: number; strength: number; n: number }
  >();
  for (const [tid, roster] of rostersByTeam) {
    const drafted = roster.filter((r) => !r.isKeeper && r.marketValue != null);
    const withAdp = drafted.filter((r) => r.adp != null);
    const avgDelta = withAdp.length
      ? withAdp.reduce(
          (s, r) => s + (Number(r.pickNumber) - Number(r.adp)),
          0,
        ) / withAdp.length
      : 0;
    const strength = drafted.length
      ? drafted.reduce((s, r) => s + Number(r.marketValue || 0), 0) /
        drafted.length
      : 0;
    const valueScore = Math.max(0, Math.min(1, 0.5 + avgDelta / 50));
    const strengthScore = Math.max(0, Math.min(1, strength / 100));
    raw.set(tid, {
      score: 0.5 * valueScore + 0.5 * strengthScore,
      avgDelta,
      strength,
      n: drafted.length,
    });
  }
  const ranked = [...raw.entries()].sort((a, b) => b[1].score - a[1].score);
  const total = ranked.length || 1;
  const out = new Map<number, { letter: string; avgDelta: number; strength: number }>();
  ranked.forEach(([tid, v], i) => {
    const p = i / total;
    const letter =
      v.n < 3 ? "—" : p < 0.14 ? "A" : p < 0.36 ? "B" : p < 0.68 ? "C" : p < 0.90 ? "D" : "F";
    out.set(tid, { letter, avgDelta: v.avgDelta, strength: v.strength });
  });
  return out;
}

export function buildRostersByTeam(
  schedule: readonly { pickNumber: number; teamId: string | number; round: number }[],
  results: Record<number, DraftSessionLockedPick | undefined>,
): Map<number, Array<DraftSessionLockedPick & { round: number; pickNumber: number }>> {
  const m = new Map<number, Array<DraftSessionLockedPick & { round: number; pickNumber: number }>>();
  for (const s of schedule) {
    const res = results[s.pickNumber];
    if (!res?.name) continue;
    const tid = Number(s.teamId);
    if (!m.has(tid)) m.set(tid, []);
    m.get(tid)!.push({ ...res, round: s.round, pickNumber: s.pickNumber });
  }
  return m;
}
