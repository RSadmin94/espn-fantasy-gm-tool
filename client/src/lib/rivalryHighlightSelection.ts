/**
 * RFSN-047 — Active vs historical rivalry highlight selection for Owner Dossier.
 * Historical rivals may include alumni; current rival / threat use current-season owners only.
 */

export type MatchupIntelHighlightRow = {
  opponentOwner: string;
  wins?: number;
  losses?: number;
  ties?: number;
  games?: number;
  winPct?: number;
  tag?: string;
  [key: string]: unknown;
};

function gamesOf(row: MatchupIntelHighlightRow): number {
  const n = Number(row.games);
  return Number.isFinite(n) ? n : 0;
}

function winPctOf(row: MatchupIntelHighlightRow): number {
  const n = Number(row.winPct);
  return Number.isFinite(n) ? n : 0;
}

/** Same ranking used historically for Top Rival / Biggest Threat (all opponents). */
export function pickRivalryHighlights(intel: MatchupIntelHighlightRow[]) {
  if (!intel.length) {
    return {
      topRival: null as MatchupIntelHighlightRow | null,
      biggestThreat: null as MatchupIntelHighlightRow | null,
    };
  }
  const byGames = [...intel].sort((a, b) => gamesOf(b) - gamesOf(a));
  const nemesis = intel
    .filter((r) => r.tag === "Nemesis")
    .sort((a, b) => gamesOf(b) - gamesOf(a))[0];
  const rival = intel.find((r) => r.tag === "Rival");
  const topRival = nemesis ?? rival ?? byGames[0] ?? null;
  const biggestThreat =
    nemesis ??
    [...intel].filter((r) => gamesOf(r) >= 3).sort((a, b) => winPctOf(a) - winPctOf(b))[0] ??
    null;
  return { topRival, biggestThreat };
}

export function filterMatchupIntelToActiveOwners(
  intel: MatchupIntelHighlightRow[],
  opts: {
    currentSeasonOwnerKeys: ReadonlySet<string>;
    resolveOwnerKey: (opponentName: string) => string;
    /** Lowercased display names for owners with a team in the current season. */
    currentSeasonOwnerNames?: ReadonlySet<string>;
  },
): MatchupIntelHighlightRow[] {
  const keys = opts.currentSeasonOwnerKeys;
  const names = opts.currentSeasonOwnerNames;
  if (keys.size === 0 && (!names || names.size === 0)) return [];

  return intel.filter((row) => {
    const name = String(row.opponentOwner ?? "").trim();
    if (!name) return false;
    const key = String(opts.resolveOwnerKey(name) ?? "").trim();
    if (key && keys.has(key)) return true;
    if (names?.has(name.toLowerCase())) return true;
    return false;
  });
}

export function separateActiveHistoricalRivalHighlights(args: {
  intel: MatchupIntelHighlightRow[];
  currentSeasonOwnerKeys: ReadonlySet<string>;
  resolveOwnerKey: (opponentName: string) => string;
  currentSeasonOwnerNames?: ReadonlySet<string>;
}) {
  const historical = pickRivalryHighlights(args.intel);
  const activeIntel = filterMatchupIntelToActiveOwners(args.intel, {
    currentSeasonOwnerKeys: args.currentSeasonOwnerKeys,
    resolveOwnerKey: args.resolveOwnerKey,
    currentSeasonOwnerNames: args.currentSeasonOwnerNames,
  });
  const active = pickRivalryHighlights(activeIntel);

  const historicalRival = historical.topRival;
  let historicalIsActive = false;
  if (historicalRival) {
    const name = String(historicalRival.opponentOwner ?? "").trim();
    const key = String(args.resolveOwnerKey(name) ?? "").trim();
    historicalIsActive =
      (Boolean(key) && args.currentSeasonOwnerKeys.has(key)) ||
      Boolean(args.currentSeasonOwnerNames?.has(name.toLowerCase()));
  }

  return {
    historicalRival,
    currentRival: active.topRival,
    biggestThreat: active.biggestThreat,
    historicalIsActive,
  };
}
