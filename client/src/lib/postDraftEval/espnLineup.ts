/**
 * ESPN lineupSlotId mapping used only when the league payload actually
 * includes lineupSlotCounts. Slot 7 is OP / Superflex. We never infer it.
 */
export type ParsedEspnLineup = {
  known: boolean;
  superflexSlots: number;
  starters: {
    QB: number;
    RB: number;
    WR: number;
    TE: number;
    FLEX: number;
    K: number;
    DEF: number;
    DP: number;
  };
};

const EMPTY_STARTERS = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0, DP: 0 };

export function parseEspnLineupSlots(
  counts: Record<string, unknown> | null | undefined,
): ParsedEspnLineup {
  if (!counts || typeof counts !== "object" || Object.keys(counts).length === 0) {
    return { known: false, superflexSlots: 0, starters: { ...EMPTY_STARTERS } };
  }
  const starters = { ...EMPTY_STARTERS };
  let superflexSlots = 0;
  for (const [idStr, raw] of Object.entries(counts)) {
    const id = Number(idStr);
    const n = Number(raw);
    if (!Number.isFinite(id) || !Number.isFinite(n) || n <= 0) continue;
    if (id === 0 || id === 1) starters.QB += n;
    else if (id === 2) starters.RB += n;
    else if (id === 4) starters.WR += n;
    else if (id === 6) starters.TE += n;
    else if (id === 7) superflexSlots += n;
    else if (id === 3 || id === 5 || id === 23) starters.FLEX += n;
    else if (id === 17) starters.K += n;
    else if (id === 16) starters.DEF += n;
    else if (id === 15) starters.DP += n;
  }
  const starterSum =
    starters.QB + starters.RB + starters.WR + starters.TE + starters.FLEX + starters.K + starters.DEF + starters.DP + superflexSlots;
  if (starterSum <= 0) {
    return { known: false, superflexSlots: 0, starters: { ...EMPTY_STARTERS } };
  }
  return { known: true, superflexSlots, starters };
}
