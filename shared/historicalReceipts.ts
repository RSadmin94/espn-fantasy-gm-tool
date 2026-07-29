/**
 * Historical Receipts — build + format helpers for Rivalry Center evidence tiles
 * and shareable public snapshots. Pure / deterministic — no invented calendar dates.
 */

export type HistoricalReceiptKind =
  | "playoff_elimination"
  | "painful_loss"
  | "revenge";

export type HistoricalReceiptTone = "bad" | "good";

export type HistoricalReceiptPairInput = {
  rivalId?: string | null;
  rivalName?: string | null;
  rivalryScore?: number | null;
  h2hWins?: number | null;
  h2hLosses?: number | null;
  h2hTies?: number | null;
  playoffEliminations?: number | null;
  painfulLossSeason?: number | null;
  painfulLossWeek?: number | null;
  painfulLossMargin?: number | null;
  painfulLossOpponentScore?: number | null;
  painfulLossFocalScore?: number | null;
  revengeAchieved?: boolean | null;
  revengeSeason?: number | null;
  revengeWeek?: number | null;
  revengeFocalScore?: number | null;
  revengeRivalScore?: number | null;
  lastMatchupSeason?: number | null;
  lastPlayoffEliminationSeason?: number | null;
  lastPlayoffEliminationWeek?: number | null;
  lastPlayoffEliminationFocalScore?: number | null;
  lastPlayoffEliminationRivalScore?: number | null;
};

export type HistoricalReceiptView = {
  kind: HistoricalReceiptKind;
  typeLabel: string;
  season: number | null;
  week: number | null;
  /** "Season 2018 · Week 15" or "Season 2018" — never invents a calendar date. */
  whenLabel: string;
  headline: string;
  evidence: string;
  whyMatters: string;
  tone: HistoricalReceiptTone;
  focalName: string;
  rivalName: string;
  rivalId: string;
  focalScore: number | null;
  rivalScore: number | null;
  margin: number | null;
  matchupType: string | null;
  seriesRecord: string | null;
  elimCount: number | null;
  centralResult: string;
};

export function formatSeasonWeekLabel(season: number | null | undefined, week?: number | null): string {
  if (season == null || !Number.isFinite(Number(season)) || Number(season) <= 0) return "Season unknown";
  const s = Math.trunc(Number(season));
  const w = week != null && Number.isFinite(Number(week)) && Number(week) > 0 ? Math.trunc(Number(week)) : null;
  return w != null ? `Season ${s} · Week ${w}` : `Season ${s}`;
}

function seriesRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/** Build in-app / shareable Historical Receipts from a rivalry pair (live-computed fields preferred). */
export function buildHistoricalReceiptsForPair(args: {
  pair: HistoricalReceiptPairInput;
  focalName: string;
}): HistoricalReceiptView[] {
  const p = args.pair;
  const rivalName = String(p.rivalName ?? "Rival").trim() || "Rival";
  const rivalId = String(p.rivalId ?? "").trim();
  const focalName = String(args.focalName || "You").trim() || "You";
  const wins = n(p.h2hWins);
  const losses = n(p.h2hLosses);
  const ties = n(p.h2hTies);
  const record = seriesRecord(wins, losses, ties);
  const elims = n(p.playoffEliminations);
  const out: HistoricalReceiptView[] = [];

  if (elims > 0) {
    const season = p.lastPlayoffEliminationSeason ?? null;
    const week = p.lastPlayoffEliminationWeek ?? null;
    const focalScore = p.lastPlayoffEliminationFocalScore ?? null;
    const rivalScore = p.lastPlayoffEliminationRivalScore ?? null;
    const margin =
      focalScore != null && rivalScore != null
        ? Math.round(Math.abs(rivalScore - focalScore) * 10) / 10
        : null;
    const scoreLine =
      focalScore != null && rivalScore != null
        ? `${focalName} ${focalScore.toFixed(1)} – ${rivalScore.toFixed(1)} ${rivalName}`
        : null;
    out.push({
      kind: "playoff_elimination",
      typeLabel: "Playoff Elimination",
      season,
      week,
      whenLabel: formatSeasonWeekLabel(season, week),
      headline: `${rivalName} ended ${focalName}'s season`,
      evidence:
        elims > 1
          ? `${rivalName} eliminated ${focalName} from the playoffs ${elims} times. Latest: ${formatSeasonWeekLabel(season, week)}${scoreLine ? ` (${scoreLine})` : ""}.`
          : `${rivalName} eliminated ${focalName} from the playoffs${scoreLine ? `: ${scoreLine}` : ""}.`,
      whyMatters:
        elims > 1
          ? `This rivalry carries ${elims} playoff eliminations — a recurring scar on the all-time ledger (${record} regular-season H2H).`
          : `Playoff elimination is the sharpest rivalry scar — the series sits at ${record} in the regular season.`,
      tone: "bad",
      focalName,
      rivalName,
      rivalId,
      focalScore,
      rivalScore,
      margin,
      matchupType: "Playoff",
      seriesRecord: record,
      elimCount: elims,
      centralResult: scoreLine ?? `${rivalName} eliminated ${focalName}`,
    });
  }

  if (p.painfulLossMargin != null && Number.isFinite(Number(p.painfulLossMargin))) {
    const season = p.painfulLossSeason ?? null;
    const week = p.painfulLossWeek ?? null;
    const focalScore = p.painfulLossFocalScore ?? null;
    const rivalScore = p.painfulLossOpponentScore ?? null;
    const margin = Math.round(Number(p.painfulLossMargin) * 10) / 10;
    const scoreLine =
      focalScore != null && rivalScore != null
        ? `${focalName} ${Number(focalScore).toFixed(1)} – ${Number(rivalScore).toFixed(1)} ${rivalName}`
        : null;
    out.push({
      kind: "painful_loss",
      typeLabel: "Painful Loss",
      season,
      week,
      whenLabel: formatSeasonWeekLabel(season, week),
      headline: `Lost to ${rivalName} by ${margin.toFixed(1)}`,
      evidence: `Lost to ${rivalName} by ${margin.toFixed(1)} pts${scoreLine ? ` (${scoreLine})` : rivalScore != null ? ` (rival scored ${Number(rivalScore).toFixed(1)})` : ""}.`,
      whyMatters: `This is the loudest regular-season defeat in the series — a defining low against ${rivalName} (${record} H2H).`,
      tone: "bad",
      focalName,
      rivalName,
      rivalId,
      focalScore,
      rivalScore,
      margin,
      matchupType: "Regular season",
      seriesRecord: record,
      elimCount: null,
      centralResult: scoreLine ?? `Lost by ${margin.toFixed(1)} pts`,
    });
  }

  if (p.revengeAchieved && elims > 0) {
    const season = p.revengeSeason ?? p.lastMatchupSeason ?? null;
    const week = p.revengeWeek ?? null;
    const focalScore = p.revengeFocalScore ?? null;
    const rivalScore = p.revengeRivalScore ?? null;
    const margin =
      focalScore != null && rivalScore != null
        ? Math.round(Math.abs(focalScore - rivalScore) * 10) / 10
        : null;
    const scoreLine =
      focalScore != null && rivalScore != null
        ? `${focalName} ${focalScore.toFixed(1)} – ${rivalScore.toFixed(1)} ${rivalName}`
        : null;
    out.push({
      kind: "revenge",
      typeLabel: "Revenge Collected",
      season,
      week,
      whenLabel: formatSeasonWeekLabel(season, week),
      headline: `${focalName} struck back at ${rivalName}`,
      evidence: `Revenge served — ${focalName} beat ${rivalName} after prior playoff damage${scoreLine ? `: ${scoreLine}` : ""}.`,
      whyMatters: `This win closes an open playoff debt and flips the latest chapter of a ${record} regular-season series.`,
      tone: "good",
      focalName,
      rivalName,
      rivalId,
      focalScore,
      rivalScore,
      margin,
      matchupType: null,
      seriesRecord: record,
      elimCount: elims,
      centralResult: scoreLine ?? `${focalName} beat ${rivalName}`,
    });
  }

  return out;
}

export function buildHistoricalReceiptsFromPairs(args: {
  pairs: HistoricalReceiptPairInput[];
  focalName: string;
  limit?: number;
}): HistoricalReceiptView[] {
  const all: HistoricalReceiptView[] = [];
  for (const pair of args.pairs) {
    all.push(...buildHistoricalReceiptsForPair({ pair, focalName: args.focalName }));
  }
  all.sort((a, b) => (b.season ?? 0) - (a.season ?? 0) || (b.week ?? 0) - (a.week ?? 0));
  const limit = args.limit ?? 8;
  return all.slice(0, limit);
}

/** Never default historical season labels to the calendar/current year. */
export function assertHistoricalSeasonNotCurrentFallback(
  season: number | null,
  currentYear: number = new Date().getFullYear(),
): boolean {
  // Valid: null (unknown) or a real event season. Invalid pattern for callers that
  // previously stuffed lastMatchupSeason / Date.getFullYear() into event labels.
  if (season == null) return true;
  return Number.isFinite(season) && season > 1990 && season <= currentYear + 1;
}
