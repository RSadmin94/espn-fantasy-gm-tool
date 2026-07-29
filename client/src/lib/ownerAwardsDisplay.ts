/**
 * Display helpers for Owner Awards V1 (owners.ownerList.ownerAwards).
 * Pure presentation — does not recompute award winners.
 */
import {
  getOwnerAwardMetaByName,
  OWNER_AWARD_ORDER as META_ORDER,
} from "@shared/ownerAwardMeta";
import {
  buildOwnerAwardComparisonStats,
  type OwnerAwardRowLike,
} from "@shared/ownerAwardGallery";

// Re-export gallery builders for client consumers
export {
  buildAwardCatalog,
  buildAwardDetail,
  buildOwnerAwardComparisonStats,
  buildOwnerEarnedAwards,
  filterAndSortCatalog,
  type AwardCatalogRow,
  type AwardDetailView,
  type CatalogSort,
  type OwnerAwardComparisonStats,
  type OwnerAwardRowLike,
  type OwnerEarnedAwardView,
} from "@shared/ownerAwardGallery";
export {
  buildAwardDnaSummary,
  buildAwardQuickStats,
  buildAwardsInProgress,
  buildMissingAwards,
  buildYourAwardsModel,
  type AwardDnaLine,
  type AwardProgressRow,
  type AwardQuickStats,
  type MissingAwardView,
  type OwnerAwardProgressStats,
  type YourAwardsModel,
} from "@shared/ownerAwardMyGm";
export {
  getOwnerAwardMetaById,
  getOwnerAwardMetaByName,
  listOwnerAwardMeta,
  OWNER_AWARD_CATEGORIES,
  OWNER_AWARD_META,
  OWNER_AWARD_RARITIES,
  rarityRank,
  type OwnerAwardCategory,
  type OwnerAwardMeta,
  type OwnerAwardRarity,
} from "@shared/ownerAwardMeta";

export type OwnerAwardLike = OwnerAwardRowLike;

/** Stable display order matching server push order. */
export const OWNER_AWARD_ORDER: readonly string[] = META_ORDER;

/** Short “how it’s won” copy for tooltips — sourced from shared metadata. */
export function ownerAwardHowto(awardName: string): string {
  const meta = getOwnerAwardMetaByName(awardName);
  return meta?.howEarned ?? "League award from historical owner stats.";
}

export function ownerAwardShortDescription(awardName: string): string {
  return getOwnerAwardMetaByName(awardName)?.shortDescription ?? "League award.";
}

/** Format the award statistic for cards — never blank when value is present. */
export function formatOwnerAwardStat(awardName: string, value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  switch (awardName) {
    case "Best Drafter":
    case "Worst Drafter":
      return `${value} early RB/WR`;
    case "Keeper King":
      return String(value).includes("%") ? `${value} keepers` : `${value}% keepers`;
    case "Transaction Addict":
      return `${value} acquisitions`;
    case "Trade Shark":
      return `${value} trades`;
    case "Regular Season Bully":
    case "One-Year Wonder":
      return String(value).includes("%") ? `${value} win rate` : `${value}% win rate`;
    case "Playoff Merchant":
      return String(value);
    case "Rivalry Killer":
      return `${value} H2H`;
    case "Graveyard Legend":
      return `${value} PF`;
    default:
      return String(value);
  }
}

export function sortOwnerAwardsForDisplay<T extends OwnerAwardLike>(awards: T[]): T[] {
  const order = new Map(OWNER_AWARD_ORDER.map((n, i) => [n, i]));
  return [...awards].sort((a, b) => {
    const ia = order.get(String(a.awardName ?? "")) ?? 999;
    const ib = order.get(String(b.awardName ?? "")) ?? 999;
    if (ia !== ib) return ia - ib;
    return String(a.awardName ?? "").localeCompare(String(b.awardName ?? ""));
  });
}

export function countAwardsForOwner(
  awards: OwnerAwardLike[],
  ownerKey: string | null | undefined,
  ownerName?: string | null,
): number {
  return buildOwnerAwardComparisonStats(awards, ownerKey, ownerName).totalAwards;
}
