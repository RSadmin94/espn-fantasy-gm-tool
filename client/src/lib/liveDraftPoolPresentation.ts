/**
 * RFSN-016 — Live Draft IDP presentation (client-only).
 * Does not change eligibility (RFSN-014). DP remains draftable.
 * Default OFFENSE tab avoids a wall of DP; ALL lists every eligible player in ADP order.
 */

const OFFENSE_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DEF", "DST", "D/ST"]);

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

export function normalizeLiveDraftPos(pos: unknown): string {
  return String(pos ?? "").toUpperCase();
}

export function isLiveDraftOffensePosition(pos: unknown): boolean {
  return OFFENSE_POSITIONS.has(normalizeLiveDraftPos(pos));
}

export function isLiveDraftDpPosition(pos: unknown): boolean {
  return normalizeLiveDraftPos(pos) === "DP";
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
  a: { position?: unknown; adp?: unknown; rank?: unknown; projectedPoints?: unknown; marketValue?: unknown; name?: string },
  b: { position?: unknown; adp?: unknown; rank?: unknown; projectedPoints?: unknown; marketValue?: unknown; name?: string },
  sort: "adp" | "proj" | "value" | "pos" | "name",
  opts?: { prioritizeOffenseInAll?: boolean },
): number {
  if (opts?.prioritizeOffenseInAll) {
    const g = liveDraftPresentationGroup(a.position) - liveDraftPresentationGroup(b.position);
    if (g !== 0) return g;
  }

  const byAdp = (p: typeof a) =>
    p.adp != null && Number.isFinite(Number(p.adp)) ? Number(p.adp) : Number(p.rank ?? 9999);

  if (sort === "adp") return byAdp(a) - byAdp(b);
  if (sort === "proj") return (Number(b.projectedPoints) || 0) - (Number(a.projectedPoints) || 0);
  if (sort === "value") return (Number(b.marketValue) ?? -1) - (Number(a.marketValue) ?? -1);
  if (sort === "pos") {
    const pc = normalizeLiveDraftPos(a.position).localeCompare(normalizeLiveDraftPos(b.position));
    return pc !== 0 ? pc : byAdp(a) - byAdp(b);
  }
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}
