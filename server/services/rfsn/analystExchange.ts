/**
 * RFSN-001 — Analyst exchange framework (Phase 1).
 * Hands ONE shared HistoricalContext set to all voices — no per-persona history forks.
 */

import type { HistoricalContext } from "./historicalContext";

/**
 * Shared context packet for every voice on a moment.
 * Identity: same array reference / same facts for Sofia, Coach, and Roxanne.
 */
export type SharedAnalystContext = {
  /** Contexts that passed the air rule and will be injected into verifiedFacts. */
  aired: readonly HistoricalContext[];
  /** True-but-silent contexts (failed heat gate) — notes only, not on air. */
  benched: readonly HistoricalContext[];
};

/**
 * Build the one shared context all voices consume.
 * Does not generate commentary — personas interpret the same facts.
 */
export function shareContextForVoices(args: {
  aired: HistoricalContext[];
  benched?: HistoricalContext[];
}): SharedAnalystContext {
  const aired = Object.freeze([...args.aired]);
  const benched = Object.freeze([...(args.benched ?? [])]);
  return { aired, benched };
}

/** Facts to append to factPacket.verifiedFacts (aired only). */
export function sharedFactsForVerifiedPacket(shared: SharedAnalystContext): string[] {
  return shared.aired.map((c) => c.fact).filter(Boolean);
}
