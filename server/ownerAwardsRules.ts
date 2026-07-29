/**
 * Small eligibility / comparison helpers for Owner Awards V1.
 * Award selection formulas remain inlined in `owners.ownerList` (server/routers.ts).
 */

/** Worst Drafter must not share a winner with Best Drafter (ownerKey, not display name). */
export function canAwardWorstDrafter(bestOwnerKey: string, worstOwnerKey: string): boolean {
  return Boolean(bestOwnerKey && worstOwnerKey && bestOwnerKey !== worstOwnerKey);
}

/** One-Year Wonder requires at least one completed regular-season game. */
export function isOneYearWonderEligible(wins: number, losses: number, ties: number): boolean {
  return wins + losses + ties > 0;
}

/** Graveyard Legend requires positive points for. */
export function isGraveyardLegendEligible(pointsFor: number): boolean {
  return Number.isFinite(pointsFor) && pointsFor > 0;
}

/** Final tie-break after metric ties: ownerName, then ownerKey (deterministic). */
export function ownerAwardNameKeyTie(
  a: { ownerName: string; ownerKey: string },
  b: { ownerName: string; ownerKey: string },
): number {
  return a.ownerName.localeCompare(b.ownerName) || a.ownerKey.localeCompare(b.ownerKey);
}
