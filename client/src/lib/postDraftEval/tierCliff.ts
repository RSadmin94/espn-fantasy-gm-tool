import { normalizePos } from "./names";
import type { RankedPlayer } from "./types";
import type { RankingTier } from "./confidence";

export type TierCliff = {
  isCliff: boolean;
  gap: number;
  nextRank: number | null;
};

function rankOf(p: RankedPlayer): number | null {
  const r = p.ecrRank ?? p.adp;
  if (r == null || !Number.isFinite(Number(r)) || Number(r) <= 0) return null;
  return Number(r);
}

/**
 * A tier cliff is a ranking gap, not a later-season outcome.
 * League-order and missing ranks are not treated as cliffs.
 */
export function detectTierCliff(args: {
  player: RankedPlayer;
  available: readonly RankedPlayer[];
  rankingTier: RankingTier;
}): TierCliff {
  if (args.rankingTier === "TIER_3_LEAGUE_ORDER" || args.rankingTier === "TIER_4_INSUFFICIENT") {
    return { isCliff: false, gap: 0, nextRank: null };
  }
  const rank = rankOf(args.player);
  if (rank == null) return { isCliff: false, gap: 0, nextRank: null };
  const pos = normalizePos(args.player.position);
  const samePos = args.available
    .map((p) => ({ p, r: rankOf(p) }))
    .filter((x): x is { p: RankedPlayer; r: number } => x.r != null && normalizePos(x.p.position) === pos)
    .sort((a, b) => a.r - b.r);
  const idx = samePos.findIndex(
    (x) =>
      x.p.playerId === args.player.playerId && args.player.playerId != null
        ? true
        : x.p.name === args.player.name,
  );
  const at = idx >= 0 ? idx : samePos.findIndex((x) => x.r === rank);
  if (at < 0) return { isCliff: false, gap: 0, nextRank: null };
  const next = samePos[at + 1];
  if (!next) return { isCliff: samePos.length === 1, gap: next ? 0 : 40, nextRank: null };
  const gap = next.r - rank;
  const isCliff = gap >= 12 && gap >= 0.25 * rank;
  return { isCliff, gap, nextRank: next.r };
}
