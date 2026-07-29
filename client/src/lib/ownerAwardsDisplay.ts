/**
 * Display helpers for Owner Awards V1 (owners.ownerList.ownerAwards).
 * Pure presentation — does not recompute award winners.
 */

export type OwnerAwardLike = {
  awardName?: string | null;
  ownerKey?: string | null;
  ownerName?: string | null;
  value?: string | number | null;
  reason?: string | null;
};

/** Stable display order matching server push order. */
export const OWNER_AWARD_ORDER: readonly string[] = [
  "Best Drafter",
  "Worst Drafter",
  "Keeper King",
  "Transaction Addict",
  "Trade Shark",
  "Regular Season Bully",
  "Playoff Merchant",
  "Rivalry Killer",
  "One-Year Wonder",
  "Graveyard Legend",
] as const;

/** Short “how it’s won” copy for tooltips. */
export const OWNER_AWARD_HOWTO: Readonly<Record<string, string>> = {
  "Best Drafter": "Most RB/WR picks in rounds 1–3 among multi-season owners with enough draft history.",
  "Worst Drafter": "Fewest RB/WR picks in rounds 1–3 among eligible multi-season owners (cannot match Best Drafter).",
  "Keeper King": "Highest keeper rate (keepers ÷ resolved picks) among multi-season owners with enough keepers.",
  "Transaction Addict": "Most lifetime acquisitions among multi-season owners.",
  "Trade Shark": "Most completed trades among multi-season owners.",
  "Regular Season Bully": "Highest career regular-season win % (≥14 games) among multi-season owners.",
  "Playoff Merchant": "Most runner-up + 3rd-place finishes; fewer titles preferred when tied.",
  "Rivalry Killer": "Best regular-season head-to-head net record (≥10 H2H games) among multi-season owners.",
  "One-Year Wonder": "Highest win % among one-season (graveyard) owners with games played.",
  "Graveyard Legend": "Highest points for among one-season (graveyard) owners.",
};

export function ownerAwardHowto(awardName: string): string {
  return OWNER_AWARD_HOWTO[awardName] ?? "League award from historical owner stats.";
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
  const key = String(ownerKey ?? "").trim();
  const name = String(ownerName ?? "").trim();
  if (!key && !name) return 0;
  return awards.filter((a) => {
    const ak = String(a.ownerKey ?? "").trim();
    if (key && ak && ak === key) return true;
    if (!key && name && String(a.ownerName ?? "").trim() === name) return true;
    if (key && !ak && name && String(a.ownerName ?? "").trim() === name) return true;
    return false;
  }).length;
}
