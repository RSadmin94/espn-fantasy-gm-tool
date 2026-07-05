/**
 * leagueIdpDraftProfile.ts — READ-ONLY league IDP/DP draft-tendency summary.
 *
 * Reuses the canonical draft record (draft_picks.position) rather than a parallel
 * intelligence layer. Produces an honest, confidence-gated summary of how a league
 * has historically drafted individual defensive players (IDP → "DP"):
 *   - earliest DP pick by season, average / median first-DP pick
 *   - before-pick-50 rate, average DP round
 *   - DP discount vs ESPN ADP (when a marquee ADP list is supplied)
 *   - labeled-data coverage + High/Medium/Low confidence
 *   - plain-English interpretation
 *   - optional check: does the current mock placement conflict with league history?
 *
 * Deterministic. No fabricated signals. Emits no hard anchor when data is thin.
 */

/** All individual-defender labels that should collapse into the single "DP" bucket. */
export const IDP_DRAFT_POSITIONS = new Set([
  "DL", "DE", "DT", "NT", "EDGE", "LB", "OLB", "ILB", "MLB", "CB", "S", "FS", "SS", "DB", "IDP",
]);

/** Fold any individual-defensive label into "DP"; leave offense/K/D-ST untouched. */
export function normalizeDefensivePosition(pos: string | null | undefined): string {
  const p = String(pos ?? "").toUpperCase().trim();
  return IDP_DRAFT_POSITIONS.has(p) ? "DP" : p;
}

/** A position string counts as "unlabeled" if it is empty or the placeholder "?". */
function isUnlabeled(pos: string | null | undefined): boolean {
  const p = String(pos ?? "").trim();
  return p === "" || p === "?";
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round(((s[m - 1]! + s[m]!) / 2) * 10) / 10;
}
function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export interface MarqueeAdp {
  /** Player name as it appears in draft_picks / ESPN. */
  name: string;
  /** Real ESPN average draft position (overall pick number). */
  adp: number;
}
export interface MockPlacement {
  name: string;
  overallPick: number;
  round: number;
}

export interface LeagueIdpDraftProfile {
  leagueId: string;
  teamCount: number;
  firstDpSeason: number | null;
  seasonsAnalyzed: number;
  totalDpPicks: number;
  /** Earliest DP off the board, per season (Rod: "earliest DP pick by season"). */
  earliestDpBySeason: Array<{
    season: number; firstDpPick: number; firstDpRound: number; firstDpPlayer: string;
    dpCount: number; labeledCoveragePct: number;
  }>;
  avgFirstDpPick: number | null;
  medianFirstDpPick: number | null;
  minFirstDpPick: number | null;
  maxFirstDpPick: number | null;
  avgDpRound: number | null;
  medianFirstDpRound: number | null;
  beforePick50: {
    /** Share of ALL DP picks that landed before pick 50. */
    pickShareRate: number;
    /** Share of seasons whose FIRST DP came before pick 50. */
    seasonShareRate: number;
    seasonsWithEarlyDp: number;
  };
  labeledCoveragePct: number;
  confidence: "High" | "Medium" | "Low";
  confidenceReasons: string[];
  adpComparison: {
    available: boolean;
    note: string;
    /** How much later (picks) the league's first DP goes vs the earliest national DP ADP. */
    firstDpDiscountVsNationalPicks: number | null;
    marquee: Array<{
      name: string; espnAdp: number; espnRound: number;
      leagueMedianFirstDpRound: number | null; conflict: boolean; note: string;
    }>;
  };
  mockConflict: {
    checked: boolean;
    verdict: "CONFLICT" | "ALIGNED" | "NOT_CHECKED";
    details: Array<{ name: string; mockRound: number; leagueFirstDpRound: number | null; earlierThanHistory: boolean; note: string }>;
  };
  interpretation: string;
}

export async function computeLeagueIdpDraftProfile(opts: {
  // Accepts the app's Drizzle handle (execute takes a SQL template). Kept permissive so this
  // read-only helper can be called from routers or a standalone probe without importing AppDb.
  db: { execute: (q: any) => Promise<any> };
  sql: (strings: TemplateStringsArray, ...vals: any[]) => any;
  leagueId: string;
  marqueeAdp?: MarqueeAdp[];
  currentMockPlacement?: MockPlacement[];
}): Promise<LeagueIdpDraftProfile> {
  const { db, sql, leagueId, marqueeAdp = [], currentMockPlacement = [] } = opts;

  const [rows] = (await db.execute(sql`
    SELECT season, overallPick, roundId, roundPick, playerName, position, isKeeper
    FROM draft_picks
    WHERE leagueId = ${leagueId}
    ORDER BY season ASC, overallPick ASC
  `)) as unknown as [Array<Record<string, unknown>>];

  const teamCount = Math.max(1, ...rows.map((r) => Number(r.roundPick) || 0)) || 14;

  // Group by season
  const bySeason = new Map<number, Array<Record<string, unknown>>>();
  for (const r of rows) {
    const s = Number(r.season);
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s)!.push(r);
  }

  const earliestDpBySeason: LeagueIdpDraftProfile["earliestDpBySeason"] = [];
  const firstDpPicks: number[] = [];
  const firstDpRounds: number[] = [];
  const allDpPicks: number[] = [];
  const allDpRounds: number[] = [];
  let labeledPicksInDpEra = 0;
  let totalPicksInDpEra = 0;
  let firstDpSeason: number | null = null;

  for (const s of [...bySeason.keys()].sort((a, b) => a - b)) {
    const picks = bySeason.get(s)!;
    const dp = picks
      .filter((p) => normalizeDefensivePosition(String(p.position)) === "DP")
      .sort((a, b) => Number(a.overallPick) - Number(b.overallPick));
    if (dp.length === 0) continue;
    if (firstDpSeason === null) firstDpSeason = s;

    // coverage counts only apply once the DP era has begun (>= firstDpSeason)
    const labeled = picks.filter((p) => !isUnlabeled(String(p.position))).length;
    labeledPicksInDpEra += labeled;
    totalPicksInDpEra += picks.length;

    const first = dp[0]!;
    earliestDpBySeason.push({
      season: s,
      firstDpPick: Number(first.overallPick),
      firstDpRound: Number(first.roundId),
      firstDpPlayer: String(first.playerName ?? ""),
      dpCount: dp.length,
      labeledCoveragePct: Math.round((labeled / picks.length) * 100),
    });
    firstDpPicks.push(Number(first.overallPick));
    firstDpRounds.push(Number(first.roundId));
    for (const d of dp) { allDpPicks.push(Number(d.overallPick)); allDpRounds.push(Number(d.roundId)); }
  }

  const seasonsAnalyzed = earliestDpBySeason.length;
  const totalDpPicks = allDpPicks.length;
  const medianFirstDpRound = median(firstDpRounds);
  const labeledCoveragePct = totalPicksInDpEra > 0 ? Math.round((labeledPicksInDpEra / totalPicksInDpEra) * 100) : 0;

  // before-pick-50
  const dpBefore50 = allDpPicks.filter((p) => p < 50).length;
  const seasonsWithEarlyDp = earliestDpBySeason.filter((x) => x.firstDpPick < 50).length;
  const beforePick50 = {
    pickShareRate: totalDpPicks > 0 ? Math.round((dpBefore50 / totalDpPicks) * 1000) / 10 : 0,
    seasonShareRate: seasonsAnalyzed > 0 ? Math.round((seasonsWithEarlyDp / seasonsAnalyzed) * 1000) / 10 : 0,
    seasonsWithEarlyDp,
  };

  // confidence gate (deterministic; refuses "High" on thin/incomplete data)
  const confidenceReasons: string[] = [];
  let confidence: "High" | "Medium" | "Low";
  if (seasonsAnalyzed < 3 || totalDpPicks < 10 || labeledCoveragePct < 60) {
    confidence = "Low";
    if (seasonsAnalyzed < 3) confidenceReasons.push(`only ${seasonsAnalyzed} season(s) with IDP data`);
    if (totalDpPicks < 10) confidenceReasons.push(`only ${totalDpPicks} defender pick(s) on record`);
    if (labeledCoveragePct < 60) confidenceReasons.push(`only ${labeledCoveragePct}% of picks carry a position label`);
  } else if (seasonsAnalyzed >= 6 && totalDpPicks >= 40 && labeledCoveragePct >= 90) {
    confidence = "High";
    confidenceReasons.push(`${seasonsAnalyzed} seasons, ${totalDpPicks} defender picks, ${labeledCoveragePct}% labeled`);
  } else {
    confidence = "Medium";
    confidenceReasons.push(`${seasonsAnalyzed} seasons and ${totalDpPicks} defender picks, but only ${labeledCoveragePct}% of picks carry a position label`);
  }

  // ADP comparison (only when a marquee ADP list is supplied)
  const medFirstDpPick = median(firstDpPicks);
  const nationalEarliestAdp = marqueeAdp.length ? Math.min(...marqueeAdp.map((m) => m.adp)) : null;
  const adpComparison: LeagueIdpDraftProfile["adpComparison"] = {
    available: marqueeAdp.length > 0,
    note: marqueeAdp.length === 0
      ? "No national IDP ADP supplied — discount vs ADP not computed."
      : "Positive discount = this league drafts its first defender later than national ADP.",
    firstDpDiscountVsNationalPicks:
      medFirstDpPick != null && nationalEarliestAdp != null
        ? Math.round((medFirstDpPick - nationalEarliestAdp) * 10) / 10
        : null,
    marquee: marqueeAdp.map((m) => {
      const espnRound = Math.max(1, Math.ceil(m.adp / teamCount));
      const conflict = medianFirstDpRound != null && espnRound < medianFirstDpRound;
      return {
        name: m.name, espnAdp: m.adp, espnRound,
        leagueMedianFirstDpRound: medianFirstDpRound,
        conflict,
        note: conflict
          ? `National ADP puts ${m.name} in Round ${espnRound}, earlier than this league's typical first-DP round (${medianFirstDpRound}).`
          : `National ADP (Round ${espnRound}) is not earlier than this league's typical first-DP round (${medianFirstDpRound ?? "n/a"}).`,
      };
    }),
  };

  // Mock-vs-history conflict check (uses supplied current mock placements)
  const mockDetails = currentMockPlacement.map((mp) => {
    const earlier = medianFirstDpRound != null && mp.round < medianFirstDpRound;
    return {
      name: mp.name, mockRound: mp.round, leagueFirstDpRound: medianFirstDpRound,
      earlierThanHistory: earlier,
      note: earlier
        ? `Mock drafts ${mp.name} in Round ${mp.round} (pick ${mp.overallPick}) — earlier than this league's typical first defender (Round ${medianFirstDpRound}).`
        : `Mock places ${mp.name} in Round ${mp.round}, in line with or later than league history.`,
    };
  });
  const mockConflict: LeagueIdpDraftProfile["mockConflict"] = {
    checked: currentMockPlacement.length > 0,
    verdict: currentMockPlacement.length === 0
      ? "NOT_CHECKED"
      : mockDetails.some((d) => d.earlierThanHistory) ? "CONFLICT" : "ALIGNED",
    details: mockDetails,
  };

  // Plain-English interpretation
  let interpretation: string;
  if (seasonsAnalyzed === 0) {
    interpretation = "This league has no individual-defender picks on record, so there is no IDP draft tendency to report.";
  } else {
    const waits = medFirstDpPick != null && medFirstDpPick > teamCount * 4; // later than ~round 4
    const discountTxt =
      adpComparison.firstDpDiscountVsNationalPicks != null && adpComparison.firstDpDiscountVsNationalPicks > 0
        ? ` That is about ${adpComparison.firstDpDiscountVsNationalPicks} picks later than where national ADP starts defenders.`
        : "";
    const confTxt =
      confidence === "High" ? "This is a strong, well-supported pattern."
      : confidence === "Medium" ? `Treat this as a general lean rather than a hard rule — ${confidenceReasons[0]}.`
      : `Treat this cautiously — ${confidenceReasons.join("; ")}.`;
    interpretation =
      `Across ${seasonsAnalyzed} season(s), this league's first defender typically comes off the board around pick ${medFirstDpPick} (Round ${medianFirstDpRound}).` +
      (waits ? ` The league ${confidence === "Low" ? "appears to" : "tends to"} wait on defenders.` : "") +
      discountTxt +
      ` A defender went before pick 50 in ${seasonsWithEarlyDp} of ${seasonsAnalyzed} season(s). ${confTxt}`;
  }

  return {
    leagueId, teamCount, firstDpSeason, seasonsAnalyzed, totalDpPicks,
    earliestDpBySeason,
    avgFirstDpPick: mean(firstDpPicks),
    medianFirstDpPick: medFirstDpPick,
    minFirstDpPick: firstDpPicks.length ? Math.min(...firstDpPicks) : null,
    maxFirstDpPick: firstDpPicks.length ? Math.max(...firstDpPicks) : null,
    avgDpRound: mean(allDpRounds),
    medianFirstDpRound,
    beforePick50,
    labeledCoveragePct,
    confidence, confidenceReasons,
    adpComparison, mockConflict, interpretation,
  };
}
