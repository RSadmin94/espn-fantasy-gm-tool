/**
 * RFSN-047 / RFSN-048 — Owner Dossier rivalry highlight selection.
 *
 * Historical rival may include alumni (legacy pick).
 * Current rival / biggest threat ("Active matchup threat") use current-season
 * owners only, with independent rivalry-strength and threat scores.
 *
 * Threat definitions (do not unify — RFSN-048B):
 * - Advisor/Home: computeBiggestThreat composite (H2H + elims + titles + form + DNA)
 * - Rivalry Center: often max playoffEliminations
 * - Owner Dossier: this module's active H2H threat score (Active matchup threat)
 */

export type MatchupIntelHighlightRow = {
  opponentOwner: string;
  wins?: number;
  losses?: number;
  ties?: number;
  games?: number;
  winPct?: number;
  tag?: string;
  recentGames?: Array<{
    season?: number;
    week?: number;
    result?: "W" | "L" | "T" | string;
  }>;
  [key: string]: unknown;
};

/** Minimum H2H sample for an active rivalry claim. */
export const MIN_ACTIVE_RIVAL_GAMES = 8;
/** Minimum H2H sample for an active threat claim. */
export const MIN_ACTIVE_THREAT_GAMES = 8;
/** |effectivePct − 50| must be ≤ this for rivalry (close series). */
export const RIVAL_MAX_EFFECTIVE_DISTANCE = 15;
/** Owner effective result % must be ≤ this to count as a threat. */
export const THREAT_MAX_EFFECTIVE_PCT = 42;
export const RIVAL_MIN_SCORE = 0.5;
export const THREAT_MIN_SCORE = 0.42;
/** Stricter Nemesis for active-card display (historical tags may be broader). */
export const ACTIVE_NEMESIS_MIN_GAMES = 8;
export const ACTIVE_NEMESIS_MAX_EFFECTIVE_PCT = 35;

function gamesOf(row: MatchupIntelHighlightRow): number {
  const explicit = Number(row.games);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  const w = Math.max(0, Math.floor(Number(row.wins ?? 0)));
  const l = Math.max(0, Math.floor(Number(row.losses ?? 0)));
  const t = Math.max(0, Math.floor(Number(row.ties ?? 0)));
  return w + l + t;
}

function wlOf(row: MatchupIntelHighlightRow): { wins: number; losses: number; ties: number; games: number } {
  const wins = Math.max(0, Math.floor(Number(row.wins ?? 0)));
  const losses = Math.max(0, Math.floor(Number(row.losses ?? 0)));
  const ties = Math.max(0, Math.floor(Number(row.ties ?? 0)));
  const games = gamesOf(row);
  return { wins, losses, ties, games };
}

/**
 * Tie-aware result percentage (0–100):
 * (wins + 0.5 × ties) / games
 */
export function effectiveResultPct(row: MatchupIntelHighlightRow): number {
  const { wins, ties, games } = wlOf(row);
  if (games <= 0) return 0;
  return Number((((wins + 0.5 * ties) / games) * 100).toFixed(1));
}

/** Legacy wins/games percentage (ties ignored in numerator) — for diagnostics only. */
export function rawWinRatePct(row: MatchupIntelHighlightRow): number {
  const { wins, games } = wlOf(row);
  if (games <= 0) return 0;
  return Number(((wins / games) * 100).toFixed(1));
}

export function qualifiesAsActiveNemesis(row: MatchupIntelHighlightRow): boolean {
  const games = gamesOf(row);
  if (games < ACTIVE_NEMESIS_MIN_GAMES) return false;
  return effectiveResultPct(row) <= ACTIVE_NEMESIS_MAX_EFFECTIVE_PCT;
}

/** Display tag for active rival/threat cards — never Nemesis without advantage + sample. */
export function activeDisplayTag(row: MatchupIntelHighlightRow): string | undefined {
  const tag = String(row.tag ?? "").trim();
  if (!tag || tag === "Normal") return undefined;
  if (tag === "Nemesis") {
    return qualifiesAsActiveNemesis(row) ? "Nemesis" : undefined;
  }
  return tag;
}

function recentFormFactor(row: MatchupIntelHighlightRow): { closeness: number; danger: number } {
  const recent = Array.isArray(row.recentGames) ? row.recentGames.slice(0, 5) : [];
  if (recent.length === 0) return { closeness: 0.5, danger: 0.5 };
  let w = 0;
  let l = 0;
  let t = 0;
  for (const g of recent) {
    const r = String(g?.result ?? "").toUpperCase();
    if (r === "W") w += 1;
    else if (r === "L") l += 1;
    else if (r === "T") t += 1;
  }
  const n = w + l + t;
  if (n <= 0) return { closeness: 0.5, danger: 0.5 };
  const eff = ((w + 0.5 * t) / n) * 100;
  const closeness = 1 - Math.min(Math.abs(eff - 50), 50) / 50;
  const danger = Math.max(0, (50 - eff) / 50);
  return { closeness, danger };
}

export type ScoredActiveCandidate = {
  row: MatchupIntelHighlightRow;
  games: number;
  effectivePct: number;
  rivalryScore: number;
  threatScore: number;
  rivalryEligible: boolean;
  threatEligible: boolean;
};

export function scoreActiveRivalThreatCandidate(row: MatchupIntelHighlightRow): ScoredActiveCandidate {
  const games = gamesOf(row);
  const effectivePct = effectiveResultPct(row);
  const recent = recentFormFactor(row);

  const closeness = 1 - Math.min(Math.abs(effectivePct - 50), 50) / 50;
  const rivalVolume = Math.min(games / 40, 1);
  const rivalryScore = Number((0.5 * closeness + 0.4 * rivalVolume + 0.1 * recent.closeness).toFixed(4));
  const rivalryEligible =
    games >= MIN_ACTIVE_RIVAL_GAMES &&
    Math.abs(effectivePct - 50) <= RIVAL_MAX_EFFECTIVE_DISTANCE &&
    rivalryScore >= RIVAL_MIN_SCORE;

  const danger = Math.max(0, (50 - effectivePct) / 50);
  const threatVolume = Math.min(games / 40, 1);
  const threatScore = Number((0.55 * danger + 0.35 * threatVolume + 0.1 * recent.danger).toFixed(4));
  const threatEligible =
    games >= MIN_ACTIVE_THREAT_GAMES &&
    effectivePct <= THREAT_MAX_EFFECTIVE_PCT &&
    danger > 0 &&
    threatScore >= THREAT_MIN_SCORE;

  return {
    row,
    games,
    effectivePct,
    rivalryScore,
    threatScore,
    rivalryEligible,
    threatEligible,
  };
}

export function rankActiveRivalThreatCandidates(intel: MatchupIntelHighlightRow[]): ScoredActiveCandidate[] {
  return intel
    .map(scoreActiveRivalThreatCandidate)
    .sort((a, b) => {
      // Stable diagnostic order: rivalry score desc, then games, then name
      if (b.rivalryScore !== a.rivalryScore) return b.rivalryScore - a.rivalryScore;
      if (b.games !== a.games) return b.games - a.games;
      return String(a.row.opponentOwner).localeCompare(String(b.row.opponentOwner));
    });
}

export function pickCurrentBiggestRival(intel: MatchupIntelHighlightRow[]): MatchupIntelHighlightRow | null {
  const eligible = rankActiveRivalThreatCandidates(intel).filter((c) => c.rivalryEligible);
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    if (b.rivalryScore !== a.rivalryScore) return b.rivalryScore - a.rivalryScore;
    if (b.games !== a.games) return b.games - a.games;
    return String(a.row.opponentOwner).localeCompare(String(b.row.opponentOwner));
  });
  return eligible[0]?.row ?? null;
}

export function pickBiggestThreat(intel: MatchupIntelHighlightRow[]): MatchupIntelHighlightRow | null {
  const eligible = rankActiveRivalThreatCandidates(intel).filter((c) => c.threatEligible);
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    if (b.threatScore !== a.threatScore) return b.threatScore - a.threatScore;
    if (a.effectivePct !== b.effectivePct) return a.effectivePct - b.effectivePct;
    if (b.games !== a.games) return b.games - a.games;
    return String(a.row.opponentOwner).localeCompare(String(b.row.opponentOwner));
  });
  return eligible[0]?.row ?? null;
}

/** Historical / all-time Top Rival + Biggest Threat (alumni allowed). Unchanged preference order. */
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
    [...intel]
      .filter((r) => gamesOf(r) >= 3)
      .sort((a, b) => effectiveResultPct(a) - effectiveResultPct(b))[0] ??
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

  // Independent scores — may name the same owner only when that owner wins both.
  const currentRival = pickCurrentBiggestRival(activeIntel);
  const biggestThreat = pickBiggestThreat(activeIntel);

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
    currentRival,
    biggestThreat,
    historicalIsActive,
    activeCandidates: rankActiveRivalThreatCandidates(activeIntel),
  };
}
