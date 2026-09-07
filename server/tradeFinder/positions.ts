import type { TradeFinderRosterSlots, TradePosition } from "./types";

const IDP = new Set(["DP", "DL", "LB", "DB", "S", "CB", "DE", "DT", "EDGE"]);

export function canonicalPosition(raw: string | null | undefined): TradePosition | null {
  const p = String(raw ?? "").toUpperCase().replace("D/ST", "DST").replace("D-ST", "DST");
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE" || p === "K") return p;
  if (p === "DST" || p === "D/ST") return "DST";
  if (IDP.has(p)) return "DP";
  return null;
}

export function isUnavailable(injuryStatus: string | null | undefined, lineupSlot?: string): boolean {
  const s = String(injuryStatus ?? "").toUpperCase();
  const slot = String(lineupSlot ?? "").toUpperCase();
  if (slot === "IR") return true;
  return (
    s === "OUT" ||
    s === "IR" ||
    s === "INJURY_RESERVE" ||
    s === "SUSPENSION" ||
    s === "SUSPENDED" ||
    s === "DOUBTFUL"
  );
}

export function isStarterSlot(lineupSlot: string | null | undefined): boolean {
  const s = String(lineupSlot ?? "");
  if (!s || s === "Bench" || s === "IR" || s === "BE") return false;
  return true;
}

/** ESPN lineupSlotId → starter/bench/IR. Slot 15 is DP (IDP), 16 is team DST. */
const SLOT_ID_TO_KIND: Record<number, keyof TradeFinderRosterSlots> = {
  0: "QB",
  1: "QB",
  2: "RB",
  3: "FLEX",
  4: "WR",
  5: "FLEX",
  6: "TE",
  7: "SUPERFLEX",
  8: "DP",
  9: "DP",
  10: "DP",
  11: "DP",
  12: "DP",
  13: "DP",
  14: "DP",
  15: "DP",
  16: "DST",
  17: "K",
  20: "BENCH",
  21: "IR",
  23: "FLEX",
  24: "IR",
};

export function emptySlots(): TradeFinderRosterSlots {
  return {
    QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, SUPERFLEX: 0,
    DST: 0, K: 0, DP: 0, BENCH: 0, IR: 0,
  };
}

export function rosterSlotsFromLineupSlotCounts(
  counts: Record<string, unknown> | null | undefined,
  fallback: TradeFinderRosterSlots,
): { slots: TradeFinderRosterSlots; source: "espn_reliable" | "inferred_default" } {
  const slots = emptySlots();
  if (!counts || typeof counts !== "object") return { slots: { ...fallback }, source: "inferred_default" };
  for (const [idStr, raw] of Object.entries(counts)) {
    const id = Number(idStr);
    const c = Number(raw);
    if (!Number.isFinite(id) || !Number.isFinite(c) || c <= 0) continue;
    const kind = SLOT_ID_TO_KIND[id];
    if (kind) slots[kind] += c;
  }
  const starters =
    slots.QB + slots.RB + slots.WR + slots.TE + slots.FLEX + slots.SUPERFLEX + slots.DST + slots.K + slots.DP;
  if (starters <= 0) return { slots: { ...fallback }, source: "inferred_default" };
  return { slots, source: "espn_reliable" };
}

export function flexEligible(pos: TradePosition): boolean {
  return pos === "RB" || pos === "WR" || pos === "TE";
}

export function superflexEligible(pos: TradePosition): boolean {
  return pos === "QB" || flexEligible(pos);
}

export function skillPositions(slots: TradeFinderRosterSlots): TradePosition[] {
  const out: TradePosition[] = ["QB", "RB", "WR", "TE"];
  if (slots.K > 0) out.push("K");
  if (slots.DST > 0) out.push("DST");
  if (slots.DP > 0) out.push("DP");
  return out;
}

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function assetQuality(weeklyProjection: number | null, tradeValue: number): number {
  if (weeklyProjection != null && Number.isFinite(weeklyProjection) && weeklyProjection > 0) {
    return weeklyProjection;
  }
  if (Number.isFinite(tradeValue) && tradeValue > 0) return tradeValue / 3;
  return 0;
}
