/**
 * Owner award gallery / catalog helpers.
 * Consumes live `ownerAwards` rows — does not recompute winners.
 */
import {
  getOwnerAwardMetaById,
  getOwnerAwardMetaByName,
  listOwnerAwardMeta,
  rarityRank,
  type OwnerAwardCategory,
  type OwnerAwardMeta,
  type OwnerAwardRarity,
} from "./ownerAwardMeta";

export type OwnerAwardRowLike = {
  awardName?: string | null;
  ownerKey?: string | null;
  ownerName?: string | null;
  value?: string | number | null;
  reason?: string | null;
};

export type OwnerAwardComparisonStats = {
  totalAwards: number;
  uniqueAwards: number;
  legendaryCount: number;
  epicCount: number;
  rareCount: number;
  commonCount: number;
};

export type OwnerEarnedAwardView = {
  meta: OwnerAwardMeta;
  row: OwnerAwardRowLike;
  timesEarned: number;
  /** Season years when known. Empty when calc does not provide seasons. */
  seasonsEarned: number[];
  holdingNow: boolean;
};

export type AwardCatalogRow = {
  meta: OwnerAwardMeta;
  holdersCount: number;
  currentHolderName: string | null;
  currentHolderKey: string | null;
  currentValue: string | number | null;
  currentReason: string | null;
  hasHolder: boolean;
};

export type AwardDetailView = {
  meta: OwnerAwardMeta;
  currentHolderName: string | null;
  currentHolderKey: string | null;
  currentValue: string | number | null;
  currentReason: string | null;
  holdersCount: number;
  /** Only include supported facts — never fabricate. */
  seasonsEarned: number[];
  historicalWinners: Array<{ ownerName: string; ownerKey: string | null; seasons: number[] }>;
  related: OwnerAwardMeta[];
};

function ownerMatches(
  row: OwnerAwardRowLike,
  ownerKey: string | null | undefined,
  ownerName?: string | null,
): boolean {
  const key = String(ownerKey ?? "").trim();
  const name = String(ownerName ?? "").trim();
  if (!key && !name) return false;
  const ak = String(row.ownerKey ?? "").trim();
  if (key && ak && ak === key) return true;
  if (!key && name && String(row.ownerName ?? "").trim() === name) return true;
  if (key && !ak && name && String(row.ownerName ?? "").trim() === name) return true;
  return false;
}

export function buildOwnerAwardComparisonStats(
  awards: OwnerAwardRowLike[],
  ownerKey: string | null | undefined,
  ownerName?: string | null,
): OwnerAwardComparisonStats {
  const earned = awards.filter((a) => ownerMatches(a, ownerKey, ownerName));
  const uniqueIds = new Set<string>();
  let totalAwards = 0;
  let legendaryCount = 0;
  let epicCount = 0;
  let rareCount = 0;
  let commonCount = 0;
  for (const row of earned) {
    const meta = getOwnerAwardMetaByName(String(row.awardName ?? ""));
    if (!meta) continue;
    totalAwards += 1;
    uniqueIds.add(meta.id);
    if (meta.rarity === "Legendary") legendaryCount += 1;
    else if (meta.rarity === "Epic") epicCount += 1;
    else if (meta.rarity === "Rare") rareCount += 1;
    else commonCount += 1;
  }
  return {
    totalAwards,
    uniqueAwards: uniqueIds.size,
    legendaryCount,
    epicCount,
    rareCount,
    commonCount,
  };
}

export function buildOwnerEarnedAwards(
  awards: OwnerAwardRowLike[],
  ownerKey: string | null | undefined,
  ownerName?: string | null,
): OwnerEarnedAwardView[] {
  const earned = awards.filter((a) => ownerMatches(a, ownerKey, ownerName));
  const out: OwnerEarnedAwardView[] = [];
  for (const row of earned) {
    const meta = getOwnerAwardMetaByName(String(row.awardName ?? ""));
    if (!meta) continue;
    out.push({
      meta,
      row,
      // V1 calc assigns one current holder per award — no multi-season ledger yet.
      timesEarned: 1,
      seasonsEarned: [],
      holdingNow: true,
    });
  }
  return out.sort((a, b) => {
    const rr = rarityRank(a.meta.rarity) - rarityRank(b.meta.rarity);
    if (rr !== 0) return rr;
    return a.meta.displayOrder - b.meta.displayOrder;
  });
}

export function buildAwardCatalog(awards: OwnerAwardRowLike[]): AwardCatalogRow[] {
  const byName = new Map<string, OwnerAwardRowLike>();
  for (const row of awards) {
    const name = String(row.awardName ?? "").trim();
    if (name && !byName.has(name)) byName.set(name, row);
  }
  return listOwnerAwardMeta().map((meta) => {
    const row = byName.get(meta.awardName);
    const hasHolder = !!(row && (row.ownerKey || row.ownerName));
    return {
      meta,
      holdersCount: hasHolder ? 1 : 0,
      currentHolderName: hasHolder ? String(row?.ownerName ?? "").trim() || null : null,
      currentHolderKey: hasHolder ? String(row?.ownerKey ?? "").trim() || null : null,
      currentValue: row?.value ?? null,
      currentReason: row?.reason != null ? String(row.reason) : null,
      hasHolder,
    };
  });
}

export function buildAwardDetail(
  awardIdOrName: string,
  awards: OwnerAwardRowLike[],
): AwardDetailView | null {
  const meta =
    getOwnerAwardMetaById(awardIdOrName) ?? getOwnerAwardMetaByName(awardIdOrName);
  if (!meta) return null;
  const row = awards.find((a) => String(a.awardName ?? "").trim() === meta.awardName);
  const hasHolder = !!(row && (row.ownerKey || row.ownerName));
  const related = meta.relatedAwardIds
    .map((id) => getOwnerAwardMetaById(id))
    .filter((m): m is OwnerAwardMeta => !!m);
  return {
    meta,
    currentHolderName: hasHolder ? String(row?.ownerName ?? "").trim() || null : null,
    currentHolderKey: hasHolder ? String(row?.ownerKey ?? "").trim() || null : null,
    currentValue: row?.value ?? null,
    currentReason: row?.reason != null ? String(row.reason) : null,
    holdersCount: hasHolder ? 1 : 0,
    seasonsEarned: [],
    historicalWinners: hasHolder
      ? [
          {
            ownerName: String(row?.ownerName ?? "").trim() || "Unknown",
            ownerKey: String(row?.ownerKey ?? "").trim() || null,
            seasons: [],
          },
        ]
      : [],
    related,
  };
}

/** V1 has no award createdAt — do not offer a "newest" sort. */
export type CatalogSort = "alphabetical" | "most_earned" | "rarest" | "catalog_order";

export function filterAndSortCatalog(
  rows: AwardCatalogRow[],
  opts: {
    search?: string;
    category?: OwnerAwardCategory | "all";
    rarity?: OwnerAwardRarity | "all";
    sort?: CatalogSort;
  },
): AwardCatalogRow[] {
  const q = String(opts.search ?? "")
    .trim()
    .toLowerCase();
  let out = rows.filter((r) => {
    if (opts.category && opts.category !== "all" && r.meta.category !== opts.category) return false;
    if (opts.rarity && opts.rarity !== "all" && r.meta.rarity !== opts.rarity) return false;
    if (!q) return true;
    const hay = `${r.meta.displayName} ${r.meta.shortDescription} ${r.meta.category} ${r.meta.rarity} ${r.currentHolderName ?? ""}`.toLowerCase();
    return hay.includes(q);
  });
  const sort = opts.sort ?? "catalog_order";
  out = [...out].sort((a, b) => {
    if (sort === "alphabetical") return a.meta.displayName.localeCompare(b.meta.displayName);
    if (sort === "most_earned") return b.holdersCount - a.holdersCount || a.meta.displayOrder - b.meta.displayOrder;
    if (sort === "rarest") {
      const rr = rarityRank(a.meta.rarity) - rarityRank(b.meta.rarity);
      if (rr !== 0) return rr;
      return a.meta.displayOrder - b.meta.displayOrder;
    }
    // catalog_order = stable metadata displayOrder (not historical recency)
    return a.meta.displayOrder - b.meta.displayOrder;
  });
  return out;
}
