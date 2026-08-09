/**
 * RFSN-052H — Advisor conversation entity continuity.
 *
 * In-memory last-resolved owner pair, scoped by user + active league.
 * League switch uses a different key, so prior owners cannot leak.
 */

import type { AdvisorPlannerIntent, AdvisorResolvedOwner } from "./advisorEvidencePlanner";
import type { AdvisorQuestionScope } from "./advisorScopeResolver";

export type AdvisorConversationContext = {
  lastResolvedOwners: AdvisorResolvedOwner[];
  lastIntent: AdvisorPlannerIntent | string | null;
  lastScope: AdvisorQuestionScope | null;
  lastLeagueId: string;
  updatedAt: number;
};

const store = new Map<string, AdvisorConversationContext>();

export function advisorConversationKey(userId: number, leagueId: string): string {
  return `${userId}::${String(leagueId).slice(0, 32)}`;
}

export function getAdvisorConversationContext(
  userId: number,
  leagueId: string,
): AdvisorConversationContext | null {
  return store.get(advisorConversationKey(userId, leagueId)) ?? null;
}

export function setAdvisorConversationContext(
  userId: number,
  leagueId: string,
  patch: Omit<AdvisorConversationContext, "updatedAt" | "lastLeagueId"> & {
    lastLeagueId?: string;
  },
): AdvisorConversationContext {
  const key = advisorConversationKey(userId, leagueId);
  const next: AdvisorConversationContext = {
    lastResolvedOwners: patch.lastResolvedOwners.map((o) => ({ ...o })),
    lastIntent: patch.lastIntent,
    lastScope: patch.lastScope,
    lastLeagueId: patch.lastLeagueId ?? String(leagueId),
    updatedAt: Date.now(),
  };
  store.set(key, next);
  return next;
}

export function clearAdvisorConversationContext(userId: number, leagueId: string): void {
  store.delete(advisorConversationKey(userId, leagueId));
}

/** Test helper. */
export function clearAllAdvisorConversationContext(): void {
  store.clear();
}

/** Follow-up cues that should reuse the prior resolved pair. */
export function isAdvisorFollowUpPairAsk(message: string): boolean {
  const t = (message ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\b(those two|these two|compare them|check their|show their|what(?:'s| is) their)\b/.test(t)) {
    return true;
  }
  if (/\bwho leads\b/.test(t) && !/\bvs\.?\b|\bversus\b/.test(t)) return true;
  if (
    /\b(their|them)\b/.test(t) &&
    /\b(h2h|head[-\s]?to[-\s]?head|playoff record|record|stats?|matchup|series)\b/.test(t)
  ) {
    return true;
  }
  if (
    /\b(head[-\s]?to[-\s]?head|h2h)\b/.test(t) &&
    !/\bvs\.?\b|\bversus\b/.test(t) &&
    !/\band\b/.test(t)
  ) {
    return true;
  }
  return false;
}
