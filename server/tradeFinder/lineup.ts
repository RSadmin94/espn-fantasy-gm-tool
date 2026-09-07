import type {
  LineupSnapshot,
  TradeFinderAsset,
  TradeFinderRosterSlots,
  TradePosition,
} from "./types";
import {
  assetQuality,
  flexEligible,
  superflexEligible,
  skillPositions,
} from "./positions";

function quality(a: TradeFinderAsset): number {
  return a.unavailable ? 0 : assetQuality(a.weeklyProjection, a.tradeValue);
}

function playable(roster: TradeFinderAsset[]): TradeFinderAsset[] {
  return roster.filter((a) => a.kind === "player" && !a.unavailable && !a.ir);
}

/**
 * Greedy best legal lineup: dedicated slots first, then FLEX (RB/WR/TE), then SUPERFLEX.
 * IR / OUT / SUSPENSION / DOUBTFUL players cannot start.
 */
export function bestLegalLineup(
  roster: TradeFinderAsset[],
  slots: TradeFinderRosterSlots,
): LineupSnapshot {
  const pool = [...playable(roster)].sort((a, b) => quality(b) - quality(a));
  const used = new Set<string>();
  const starterIds: string[] = [];
  const unfilledDedicated: Partial<Record<TradePosition, number>> = {};
  let starterPoints = 0;
  let projectionCount = 0;

  const take = (n: number, eligible: (p: TradeFinderAsset) => boolean) => {
    let taken = 0;
    for (const p of pool) {
      if (taken >= n) break;
      if (used.has(p.assetId)) continue;
      if (!eligible(p)) continue;
      used.add(p.assetId);
      starterIds.push(p.assetId);
      if (p.weeklyProjection != null && p.weeklyProjection > 0) {
        starterPoints += p.weeklyProjection;
        projectionCount++;
      } else {
        starterPoints += quality(p);
      }
      taken++;
    }
    return n - taken;
  };

  for (const pos of skillPositions(slots)) {
    const need = slots[pos] ?? 0;
    if (need <= 0) continue;
    const missing = take(need, (p) => p.position === pos);
    if (missing > 0) unfilledDedicated[pos] = missing;
  }
  if (slots.FLEX > 0) take(slots.FLEX, (p) => flexEligible(p.position as TradePosition));
  if (slots.SUPERFLEX > 0) take(slots.SUPERFLEX, (p) => superflexEligible(p.position as TradePosition));

  const usesRealProjections = projectionCount > 0 && projectionCount >= Math.ceil(starterIds.length * 0.5);
  return {
    starterIds,
    starterPoints: starterIds.length ? Math.round(starterPoints * 10) / 10 : 0,
    usesRealProjections,
    unfilledDedicated,
  };
}

export function applyTradeToRoster(
  roster: TradeFinderAsset[],
  giveIds: Set<string>,
  receive: TradeFinderAsset[],
): TradeFinderAsset[] {
  const kept = roster.filter((a) => !giveIds.has(a.assetId));
  const incoming = receive.map((a) => ({
    ...a,
    starter: false,
    bench: true,
    ir: false,
  }));
  return [...kept, ...incoming];
}

export function playableCountAt(
  roster: TradeFinderAsset[],
  position: TradePosition,
): number {
  return playable(roster).filter((a) => a.position === position).length;
}
