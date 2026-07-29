/**
 * My GM / dossier "Your Awards" presentation helpers.
 * Pure display — does not recompute award winners or invent history.
 */
import {
  getOwnerAwardMetaByName,
  listOwnerAwardMeta,
  rarityRank,
  type OwnerAwardCategory,
  type OwnerAwardMeta,
  type OwnerAwardRarity,
} from "./ownerAwardMeta";
import {
  buildOwnerAwardComparisonStats,
  buildOwnerEarnedAwards,
  type OwnerAwardComparisonStats,
  type OwnerAwardRowLike,
  type OwnerEarnedAwardView,
} from "./ownerAwardGallery";

export type OwnerAwardProgressStats = {
  /** Early RB/WR picks in rounds 1–3 when known from draft DNA. */
  earlyRbWr?: number | null;
  totalTrades?: number | null;
  totalAcq?: number | null;
  /** Career regular-season win % 0–100 when known. */
  winPct?: number | null;
  /** Keeper rate 0–100 when known. */
  keeperRate?: number | null;
  /** Points for when known (graveyard awards). */
  pointsFor?: number | null;
};

export type AwardProgressRow = {
  meta: OwnerAwardMeta;
  /** Honest chase vs current holder mark, or deferred. */
  kind: "vs_holder" | "coming_soon";
  label: string;
  current?: number;
  target?: number;
  holderName: string | null;
};

export type MissingAwardView = {
  meta: OwnerAwardMeta;
  currentHolderName: string | null;
  currentValue: string | number | null;
  progress: AwardProgressRow | null;
};

export type AwardDnaLine = {
  text: string;
  category: OwnerAwardCategory | "General";
};

export type AwardQuickStats = {
  highestRarity: OwnerAwardRarity | null;
  favoriteCategory: OwnerAwardCategory | null;
  currentlyHeld: number;
  awardsRemaining: number;
  collected: number;
  catalogSize: number;
  completionPct: number;
};

function parseLeadingNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const m = String(value).trim().match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Awards where a higher owner metric vs holder mark is a meaningful chase. */
const PROGRESS_CHASE_AWARDS = new Set([
  "Best Drafter",
  "Trade Shark",
  "Transaction Addict",
  "Regular Season Bully",
  "Keeper King",
]);

/** Map award → optional owner-side comparable metric (when profile provides it). */
function ownerMetricForAward(
  awardName: string,
  stats: OwnerAwardProgressStats | null | undefined,
): number | null {
  if (!stats) return null;
  if (!PROGRESS_CHASE_AWARDS.has(awardName)) return null;
  switch (awardName) {
    case "Best Drafter":
      return stats.earlyRbWr != null && Number.isFinite(stats.earlyRbWr) ? Number(stats.earlyRbWr) : null;
    case "Trade Shark":
      return stats.totalTrades != null && Number.isFinite(stats.totalTrades) ? Number(stats.totalTrades) : null;
    case "Transaction Addict":
      return stats.totalAcq != null && Number.isFinite(stats.totalAcq) ? Number(stats.totalAcq) : null;
    case "Regular Season Bully":
      return stats.winPct != null && Number.isFinite(stats.winPct) ? Number(stats.winPct) : null;
    case "Keeper King":
      return stats.keeperRate != null && Number.isFinite(stats.keeperRate) ? Number(stats.keeperRate) : null;
    default:
      return null;
  }
}

function unitLabel(awardName: string): string {
  switch (awardName) {
    case "Best Drafter":
    case "Worst Drafter":
      return "early RB/WR";
    case "Trade Shark":
      return "trades";
    case "Transaction Addict":
      return "acquisitions";
    case "Regular Season Bully":
    case "One-Year Wonder":
      return "win %";
    case "Keeper King":
      return "keeper %";
    case "Graveyard Legend":
      return "PF";
    default:
      return "mark";
  }
}

/**
 * Progress for awards not currently held.
 * Only emits vs_holder when both owner metric and holder mark are known numbers.
 */
export function buildAwardsInProgress(
  awards: OwnerAwardRowLike[],
  ownerKey: string | null | undefined,
  ownerName: string | null | undefined,
  stats?: OwnerAwardProgressStats | null,
): AwardProgressRow[] {
  const earnedIds = new Set(
    buildOwnerEarnedAwards(awards, ownerKey, ownerName).map((e) => e.meta.id),
  );
  const byName = new Map<string, OwnerAwardRowLike>();
  for (const row of awards) {
    const name = String(row.awardName ?? "").trim();
    if (name && !byName.has(name)) byName.set(name, row);
  }

  const rows: AwardProgressRow[] = [];
  for (const meta of listOwnerAwardMeta()) {
    if (earnedIds.has(meta.id)) continue;
    const holderRow = byName.get(meta.awardName);
    const holderName =
      holderRow && (holderRow.ownerKey || holderRow.ownerName)
        ? String(holderRow.ownerName ?? "").trim() || null
        : null;
    const target = parseLeadingNumber(holderRow?.value ?? null);
    const current = ownerMetricForAward(meta.awardName, stats);

    if (current != null && target != null && target > 0 && current < target) {
      rows.push({
        meta,
        kind: "vs_holder",
        label: `${formatMetric(current, meta.awardName)} of ${formatMetric(target, meta.awardName)} ${unitLabel(meta.awardName)} (current holder mark)`,
        current,
        target,
        holderName,
      });
      continue;
    }

    rows.push({
      meta,
      kind: "coming_soon",
      label: "Progress tracking coming soon.",
      holderName,
    });
  }

  // Prefer honest chase rows first, then by how close (current/target).
  return rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "vs_holder" ? -1 : 1;
    if (a.kind === "vs_holder" && b.kind === "vs_holder") {
      const ra = (a.current ?? 0) / Math.max(a.target ?? 1, 1);
      const rb = (b.current ?? 0) / Math.max(b.target ?? 1, 1);
      return rb - ra;
    }
    return a.meta.displayOrder - b.meta.displayOrder;
  });
}

function formatMetric(n: number, awardName: string): string {
  if (
    awardName === "Regular Season Bully" ||
    awardName === "One-Year Wonder" ||
    awardName === "Keeper King"
  ) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function buildMissingAwards(
  awards: OwnerAwardRowLike[],
  ownerKey: string | null | undefined,
  ownerName: string | null | undefined,
  stats?: OwnerAwardProgressStats | null,
): MissingAwardView[] {
  const earnedIds = new Set(
    buildOwnerEarnedAwards(awards, ownerKey, ownerName).map((e) => e.meta.id),
  );
  const progressById = new Map(
    buildAwardsInProgress(awards, ownerKey, ownerName, stats).map((p) => [p.meta.id, p]),
  );
  const byName = new Map<string, OwnerAwardRowLike>();
  for (const row of awards) {
    const name = String(row.awardName ?? "").trim();
    if (name && !byName.has(name)) byName.set(name, row);
  }

  return listOwnerAwardMeta()
    .filter((m) => !earnedIds.has(m.id))
    .map((meta) => {
      const row = byName.get(meta.awardName);
      const hasHolder = !!(row && (row.ownerKey || row.ownerName));
      return {
        meta,
        currentHolderName: hasHolder ? String(row?.ownerName ?? "").trim() || null : null,
        currentValue: row?.value ?? null,
        progress: progressById.get(meta.id) ?? null,
      };
    });
}

/** Deterministic personality lines from earned award categories only. */
export function buildAwardDnaSummary(earned: OwnerEarnedAwardView[]): AwardDnaLine[] {
  if (earned.length === 0) return [];
  const byCat = new Map<OwnerAwardCategory, number>();
  for (const e of earned) {
    byCat.set(e.meta.category, (byCat.get(e.meta.category) ?? 0) + 1);
  }
  const lines: AwardDnaLine[] = [];
  const has = (id: string) => earned.some((e) => e.meta.id === id);

  if (has("best_drafter")) {
    lines.push({
      text: "You're known as one of the league's strongest drafters.",
      category: "Drafting",
    });
  }
  if (has("rivalry_killer")) {
    lines.push({
      text: "You consistently dominate rivalries.",
      category: "Rivalries",
    });
  }
  if (has("keeper_king")) {
    lines.push({
      text: "You've built your legacy through long-term roster management.",
      category: "Roster Management",
    });
  }
  if (has("trade_shark")) {
    lines.push({
      text: "Trading is one of your greatest strengths.",
      category: "Trading",
    });
  }
  if (has("transaction_addict")) {
    lines.push({
      text: "You live on the waiver wire — always hunting the next edge.",
      category: "Waivers",
    });
  }
  if (has("regular_season_bully")) {
    lines.push({
      text: "Week-to-week, you set the pace in the regular season.",
      category: "Records",
    });
  }
  if (has("playoff_merchant")) {
    lines.push({
      text: "When the calendar turns to playoffs, you're still in the hunt.",
      category: "Championships",
    });
  }
  if (has("one_year_wonder") || has("graveyard_legend")) {
    lines.push({
      text: "Even a short run left a mark on this league's ledger.",
      category: "Legacy",
    });
  }
  if (has("worst_drafter") && lines.length === 0) {
    lines.push({
      text: "Your draft board has room to grow — and the awards will follow.",
      category: "Drafting",
    });
  }

  // Category-weighted fallback if specific lines didn't fire enough.
  if (lines.length === 0) {
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      lines.push({
        text: `Your trophy case leans toward ${top[0].toLowerCase()}.`,
        category: top[0],
      });
    }
  }

  return lines.slice(0, 4);
}

export function buildAwardQuickStats(
  awards: OwnerAwardRowLike[],
  ownerKey: string | null | undefined,
  ownerName: string | null | undefined,
): AwardQuickStats {
  const earned = buildOwnerEarnedAwards(awards, ownerKey, ownerName);
  const catalogSize = listOwnerAwardMeta().length;
  const collected = earned.length;
  let highestRarity: OwnerAwardRarity | null = null;
  const catCounts = new Map<OwnerAwardCategory, number>();
  for (const e of earned) {
    if (!highestRarity || rarityRank(e.meta.rarity) < rarityRank(highestRarity)) {
      highestRarity = e.meta.rarity;
    }
    catCounts.set(e.meta.category, (catCounts.get(e.meta.category) ?? 0) + 1);
  }
  const favoriteCategory =
    [...catCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  return {
    highestRarity,
    favoriteCategory,
    currentlyHeld: collected,
    awardsRemaining: Math.max(0, catalogSize - collected),
    collected,
    catalogSize,
    completionPct: catalogSize > 0 ? Math.round((collected / catalogSize) * 100) : 0,
  };
}

export type YourAwardsModel = {
  stats: OwnerAwardComparisonStats;
  earned: OwnerEarnedAwardView[];
  missing: MissingAwardView[];
  inProgress: AwardProgressRow[];
  dna: AwardDnaLine[];
  quick: AwardQuickStats;
};

export function buildYourAwardsModel(
  awards: OwnerAwardRowLike[],
  ownerKey: string | null | undefined,
  ownerName: string | null | undefined,
  progressStats?: OwnerAwardProgressStats | null,
): YourAwardsModel {
  const earned = buildOwnerEarnedAwards(awards, ownerKey, ownerName);
  return {
    stats: buildOwnerAwardComparisonStats(awards, ownerKey, ownerName),
    earned,
    missing: buildMissingAwards(awards, ownerKey, ownerName, progressStats),
    inProgress: buildAwardsInProgress(awards, ownerKey, ownerName, progressStats),
    dna: buildAwardDnaSummary(earned),
    quick: buildAwardQuickStats(awards, ownerKey, ownerName),
  };
}

/** Re-export for tests that need meta lookup without inventing. */
export { getOwnerAwardMetaByName };
