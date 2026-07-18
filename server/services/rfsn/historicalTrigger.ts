/**
 * historicalTrigger — when league history may enter the airtime pipeline.
 * Does not invent facts; only gates whether the engine should evaluate patterns.
 */

import type { BroadcastSignificance } from "../sofia/broadcastFrameContract";
import { passesAirRule, type HistoricalContext } from "./historicalContext";

/**
 * Routine picks stay quiet — historical context is not offered on routine moments.
 * Matches existing moment commentary budget (routine often disabled).
 */
export function shouldTriggerHistoricalContext(significance: BroadcastSignificance): boolean {
  return significance !== "routine";
}

/**
 * Final gate before injecting into verifiedFacts.
 * Requires trigger + air rule (confidence ∧ heat).
 */
export function shouldOfferHistoricalContext(
  ctx: HistoricalContext,
  significance: BroadcastSignificance,
  thresholds?: { confidence?: number; heat?: number },
): boolean {
  if (!shouldTriggerHistoricalContext(significance)) return false;
  return passesAirRule(ctx, thresholds);
}
