/**
 * Cast headliner display order — titles descending, then identity rank, then name.
 * Championship counts must come from the Cast payload (HoF-sourced on the server).
 */

export type CastHeadlinerBadge = { tier: string };
export type CastHeadlinerMember = {
  ownerName: string;
  championships: number;
  badges: CastHeadlinerBadge[];
  identityRank: { rank: number; of: number } | null;
};

const BADGE_RANK: Record<string, number> = {
  villain: 0,
  dynasty: 1,
  champion: 2,
  gatekeeper: 3,
  playoff_fixture: 4,
};

export function topBadgeRank(m: CastHeadlinerMember): number {
  if (m.badges.length === 0) return 99;
  return Math.min(99, ...m.badges.map((b) => BADGE_RANK[b.tier] ?? 98));
}

/**
 * Headliners = members with badges.
 * Order: titles desc → legacy identity rank asc → owner name.
 * (Badge tier still gates inclusion; title count drives champion ordering.)
 */
export function orderCastHeadliners<T extends CastHeadlinerMember>(cast: T[]): T[] {
  return cast
    .filter((m) => m.badges.length > 0)
    .sort((a, b) => {
      const titles = (b.championships ?? 0) - (a.championships ?? 0);
      if (titles !== 0) return titles;
      const rankA = a.identityRank?.rank ?? 999;
      const rankB = b.identityRank?.rank ?? 999;
      if (rankA !== rankB) return rankA - rankB;
      return a.ownerName.localeCompare(b.ownerName);
    });
}
