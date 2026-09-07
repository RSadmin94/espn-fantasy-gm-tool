/**
 * Trade-priority authority (RFSN-061A).
 *
 * Roster needScore stays canonical in needSurplus.ts.
 * Discovery, generation, and need-fit ranking use:
 *   tradePriorityScore = needScore * tradePriorityMultiplier(position)
 *
 * This does not change player values or fairness grades.
 */
import type { TargetPositionFilter, TradeFinderFilters, TradeFinderRosterSlots, TradePosition } from "./types";
import { TRADE_FINDER_PRIORITY_MULTIPLIER } from "./weights";
import { flexEligible } from "./positions";

export function tradePriorityMultiplier(
  position: TradePosition | "PICK",
  filters: Pick<TradeFinderFilters, "targetPosition">,
  slots?: TradeFinderRosterSlots,
): number {
  if (position === "PICK") return 1;
  if (explicitTargetOverride(position, filters.targetPosition)) return 1;
  if (position === "DP") {
    // IDP: never blindly 0.20. Starting IDP slots keep full priority.
    return (slots?.DP ?? 0) > 0 ? TRADE_FINDER_PRIORITY_MULTIPLIER.DP : 0.2;
  }
  return TRADE_FINDER_PRIORITY_MULTIPLIER[position];
}

export function explicitTargetOverride(
  position: TradePosition | "PICK",
  target: TargetPositionFilter,
): boolean {
  if (position === "PICK") return false;
  if (target === position) return true;
  if (target === "FLEX" && flexEligible(position)) return true;
  return false;
}

export function tradePriorityScore(
  needScore: number,
  position: TradePosition | "PICK",
  filters: Pick<TradeFinderFilters, "targetPosition">,
  slots?: TradeFinderRosterSlots,
): number {
  return needScore * tradePriorityMultiplier(position, filters, slots);
}

export function isSkillOffense(position: string): boolean {
  return position === "QB" || position === "RB" || position === "WR" || position === "TE";
}

/** K/DST are streamers unless the user explicitly targets them. */
export function isDeprioritizedStreamer(
  position: string,
  filters: Pick<TradeFinderFilters, "targetPosition">,
): boolean {
  if (position !== "K" && position !== "DST") return false;
  return !explicitTargetOverride(position as TradePosition, filters.targetPosition);
}

export function skillOffensePositions(): TradePosition[] {
  return ["QB", "RB", "WR", "TE"];
}
