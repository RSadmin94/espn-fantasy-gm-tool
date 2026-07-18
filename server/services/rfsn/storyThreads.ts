/**
 * RFSN-002 — Story threads (Phase 1).
 * Persist aired narrative threads across picks within a draft session.
 */

import type { HistoricalContext, NarrativeType } from "./historicalContext";

export type StoryThread = {
  id: string;
  narrativeType: NarrativeType;
  ownerName: string;
  fact: string;
  firstPickNumber: number | null;
  lastPickNumber: number | null;
  airCount: number;
};

type DraftThreadStore = {
  threads: Map<string, StoryThread>;
};

const byDraft = new Map<string, DraftThreadStore>();

function key(leagueId: string, draftId: string): string {
  return `${leagueId}:${draftId}`;
}

function threadId(ctx: HistoricalContext, ownerName: string): string {
  return `${ctx.narrativeType}:${ownerName.trim().toLowerCase()}:${ctx.evidence[0]?.ref ?? ctx.fact.slice(0, 40)}`;
}

export function resetStoryThreadsForTests(): void {
  byDraft.clear();
}

export function clearStoryThreads(leagueId: string, draftId: string): void {
  byDraft.delete(key(leagueId, draftId));
}

function storeFor(leagueId: string, draftId: string): DraftThreadStore {
  const k = key(leagueId, draftId);
  let s = byDraft.get(k);
  if (!s) {
    s = { threads: new Map() };
    byDraft.set(k, s);
  }
  return s;
}

/** Record contexts that actually aired (injected into verifiedFacts). */
export function recordAiredStoryThreads(args: {
  leagueId: string;
  draftId: string;
  ownerName: string;
  pickNumber: number | null;
  contexts: HistoricalContext[];
}): StoryThread[] {
  const store = storeFor(args.leagueId, args.draftId);
  const updated: StoryThread[] = [];
  for (const ctx of args.contexts) {
    const id = threadId(ctx, args.ownerName);
    const prev = store.threads.get(id);
    const next: StoryThread = prev
      ? {
          ...prev,
          fact: ctx.fact,
          lastPickNumber: args.pickNumber,
          airCount: prev.airCount + 1,
        }
      : {
          id,
          narrativeType: ctx.narrativeType,
          ownerName: args.ownerName,
          fact: ctx.fact,
          firstPickNumber: args.pickNumber,
          lastPickNumber: args.pickNumber,
          airCount: 1,
        };
    store.threads.set(id, next);
    updated.push(next);
  }
  return updated;
}

export function listStoryThreads(leagueId: string, draftId: string): StoryThread[] {
  const store = byDraft.get(key(leagueId, draftId));
  if (!store) return [];
  return [...store.threads.values()];
}

/** Prior thread for same owner+type, if any — for persistence tests / later polish. */
export function findStoryThread(
  leagueId: string,
  draftId: string,
  ownerName: string,
  narrativeType: NarrativeType,
): StoryThread | null {
  const store = byDraft.get(key(leagueId, draftId));
  if (!store) return null;
  const owner = ownerName.trim().toLowerCase();
  for (const t of store.threads.values()) {
    if (t.narrativeType === narrativeType && t.ownerName.trim().toLowerCase() === owner) {
      return t;
    }
  }
  return null;
}
