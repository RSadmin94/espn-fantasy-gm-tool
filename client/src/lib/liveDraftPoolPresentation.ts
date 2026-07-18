/**
 * RFSN-016 — Live Draft IDP presentation (client-only).
 * RFSN-017B — Available-pool ADP ordering (real ADP before synthetic/null).
 * Does not change eligibility (RFSN-014) or pool ownership (RFSN-017).
 * Default OFFENSE tab avoids a wall of DP; ALL lists every eligible player in ADP order.
 */

const OFFENSE_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF", "DST", "D/ST"]);

/**
 * Soft-include / fallback ADP band — must stay aligned with
 * `server/mockDraftPoolResilience.ts` `FALLBACK_ADP_FLOOR`.
 * Values at or above this are treated as synthetic for Live Draft ordering.
 */
export const LIVE_DRAFT_SYNTHETIC_ADP_FLOOR = 200;

export type LiveDraftPosView =
  | "ALL"
  | "OFFENSE"
  | "DP"
  | "QB"
  | "RB"
  | "WR"
  | "TE"
  | "K"
  | "DEF"
  | string;

export type LiveDraftSortablePlayer = {
  position?: unknown;
  adp?: unknown;
  rank?: unknown;
  projectedPoints?: unknown;
  marketValue?: unknown;
  name?: string;
};

export function normalizeLiveDraftPos(pos: unknown): string {
  return String(pos ?? "").toUpperCase();
}

export function isLiveDraftOffensePosition(pos: unknown): boolean {
  return OFFENSE_POSITIONS.has(normalizeLiveDraftPos(pos));
}

export function isLiveDraftDpPosition(pos: unknown): boolean {
  return normalizeLiveDraftPos(pos) === "DP";
}

/** Finite ADP from ESPN (or equivalent) — not null and below the soft-include floor. */
export function isLiveDraftRealAdp(adp: unknown): boolean {
  if (adp == null) return false;
  const n = Number(adp);
  return Number.isFinite(n) && n > 0 && n < LIVE_DRAFT_SYNTHETIC_ADP_FLOOR;
}

/** Soft-include / fallback ADP (≥ floor). */
export function isLiveDraftSyntheticAdp(adp: unknown): boolean {
  if (adp == null) return false;
  const n = Number(adp);
  return Number.isFinite(n) && n >= LIVE_DRAFT_SYNTHETIC_ADP_FLOOR;
}

function liveDraftMarketValueDesc(a: LiveDraftSortablePlayer, b: LiveDraftSortablePlayer): number {
  return (Number(b.marketValue) || 0) - (Number(a.marketValue) || 0);
}

/**
 * RFSN-017B sorting contract (ADP mode):
 * 1. Real ADP ascending
 * 2. Market value descending (tie-break)
 * 3. Synthetic / null ADP last (never use `rank` as a fake ADP)
 */
export function compareLiveDraftAdpOrdering(
  a: LiveDraftSortablePlayer,
  b: LiveDraftSortablePlayer,
): number {
  const aReal = isLiveDraftRealAdp(a.adp);
  const bReal = isLiveDraftRealAdp(b.adp);

  if (aReal && !bReal) return -1;
  if (!aReal && bReal) return 1;

  if (aReal && bReal) {
    const d = Number(a.adp) - Number(b.adp);
    if (d !== 0) return d;
    const mv = liveDraftMarketValueDesc(a, b);
    if (mv !== 0) return mv;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  }

  // Both synthetic or null — never promote via rank.
  const mv = liveDraftMarketValueDesc(a, b);
  if (mv !== 0) return mv;

  const aSyn = isLiveDraftSyntheticAdp(a.adp) ? Number(a.adp) : Number.POSITIVE_INFINITY;
  const bSyn = isLiveDraftSyntheticAdp(b.adp) ? Number(b.adp) : Number.POSITIVE_INFINITY;
  if (aSyn !== bSyn) return aSyn - bSyn;

  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

/** Tabs for Available Players. IDP leagues get OFFENSE + DP before ALL. */
export function buildLiveDraftPosTabs(args: {
  hasDef: boolean;
  hasDp: boolean;
}): string[] {
  const skill = ["QB", "RB", "WR", "TE", "K"] as const;
  const def = args.hasDef ? (["DEF"] as const) : [];
  if (args.hasDp) {
    return ["OFFENSE", "DP", "ALL", ...skill, ...def];
  }
  return ["ALL", ...skill, ...def];
}

/** Default tab when opening Live Draft — OFFENSE when IDP pool is present. */
export function defaultLiveDraftPosFilter(hasDp: boolean): string {
  return hasDp ? "OFFENSE" : "ALL";
}

export function matchesLiveDraftPosFilter(
  playerPos: unknown,
  posFilter: string,
): boolean {
  const want = posFilter.toUpperCase();
  const pos = normalizeLiveDraftPos(playerPos);
  const defVariants = new Set(["DEF", "DST", "D/ST"]);

  if (want === "ALL") return true;
  if (want === "OFFENSE") return isLiveDraftOffensePosition(pos);
  if (want === "DP") return pos === "DP";
  if (want === "DEF") return defVariants.has(pos);
  return pos === want;
}

/** Sort key: offense before DP when prioritizeOffenseInAll (OFFENSE view only). */
export function liveDraftPresentationGroup(pos: unknown): number {
  if (isLiveDraftDpPosition(pos)) return 1;
  if (isLiveDraftOffensePosition(pos)) return 0;
  return 2;
}

export function compareLiveDraftAvailableRows(
  a: LiveDraftSortablePlayer,
  b: LiveDraftSortablePlayer,
  sort: "adp" | "proj" | "value" | "pos" | "name",
  opts?: { prioritizeOffenseInAll?: boolean },
): number {
  if (opts?.prioritizeOffenseInAll) {
    const g = liveDraftPresentationGroup(a.position) - liveDraftPresentationGroup(b.position);
    if (g !== 0) return g;
  }

  if (sort === "adp") return compareLiveDraftAdpOrdering(a, b);
  if (sort === "proj") return (Number(b.projectedPoints) || 0) - (Number(a.projectedPoints) || 0);
  if (sort === "value") return (Number(b.marketValue) ?? -1) - (Number(a.marketValue) ?? -1);
  if (sort === "pos") {
    const pc = normalizeLiveDraftPos(a.position).localeCompare(normalizeLiveDraftPos(b.position));
    return pc !== 0 ? pc : compareLiveDraftAdpOrdering(a, b);
  }
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

/**
 * Live Available = eligible − consumed, then ADP presentation order.
 * Does not own eligibility — only filter + sort for the Live Draft list.
 */
export function orderLiveDraftAvailablePool<T extends LiveDraftSortablePlayer & { name?: string }>(
  eligiblePool: readonly T[],
  consumedNames: ReadonlySet<string>,
  sort: "adp" | "proj" | "value" | "pos" | "name" = "adp",
): T[] {
  const consumed = new Set([...consumedNames].map((n) => n.toLowerCase().trim()));
  return eligiblePool
    .filter((p) => !consumed.has(String(p.name ?? "").toLowerCase().trim()))
    .slice()
    .sort((a, b) => compareLiveDraftAvailableRows(a, b, sort));
}
