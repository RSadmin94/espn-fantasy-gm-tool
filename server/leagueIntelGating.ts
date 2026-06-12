import type { CareerReport } from "./careerReportService";

/**
 * Freemium gating for the Why Haven't I Won / Career Report.
 *
 * Doctrine (see docs/FREEMIUM_GATING_SPEC.md):
 *   Free  = identity  -> WHO you are in your league (snapshot, timeline, arc).
 *   Paid  = transformation -> HOW to change your future (all reasons, patterns,
 *           Championship Readiness, positional gaps, title plan).
 *
 * SECURITY (spec s.11.3 - non-negotiable): redaction happens HERE, server-side,
 * before serialization. The free payload must NOT contain the withheld reasons,
 * patterns, readiness, or full story. "Different payloads, not different
 * rendering." Entitled users get the report unchanged.
 */
export type GatedCareerReport = CareerReport & {
  /** True when the viewer is entitled to the full report. */
  entitled: boolean;
  /** True when this payload has been redacted to a free teaser. */
  gated: boolean;
  /** Total reasons the engine found (shown + locked). */
  totalReasons: number;
  /** Reasons withheld from this payload (0 when entitled). */
  lockedReasons: number;
};

export function gateCareerReport(report: CareerReport, entitled: boolean): GatedCareerReport {
  const totalReasons = report.topReasons.length;

  // Entitled, or nothing worth gating -> full payload, no lock.
  if (entitled || totalReasons <= 1) {
    return { ...report, entitled, gated: false, totalReasons, lockedReasons: 0 };
  }

  // FREE TEASER: keep identity, withhold transformation. Only the #1 reason
  // (the Proof) crosses the wire; everything else is removed from the payload.
  const primary = report.topReasons.slice(0, 1);
  const lockedReasons = totalReasons - primary.length;

  const teaser: GatedCareerReport = {
    ...report,
    topReasons: primary,
    patterns: [],
    readiness: null,
    titlePath: { ...report.titlePath, currentScore: 0, moves: [] },
    careerStory: buildTeaserStory(report, lockedReasons),
    entitled: false,
    gated: true,
    totalReasons,
    lockedReasons,
  };
  // Champion-mode detail must not leak in a teaser either.
  delete (teaser as Partial<CareerReport>).obstaclesOvercome;
  return teaser;
}

function buildTeaserStory(report: CareerReport, lockedReasons: number): string {
  const primary = report.topReasons[0];
  if (!primary) return report.careerStory;
  const more =
    lockedReasons > 0
      ? ` We found ${lockedReasons} more factor${lockedReasons === 1 ? "" : "s"} working against your title - unlock the full Championship Report to see them, plus your championship readiness plan.`
      : "";
  return `Your biggest championship blocker: ${primary.headline}. ${primary.detail}${more}`;
}

// ─── Rivalry Center gating ───────────────────────────────────────────────────
// Free = identity: you HAVE a biggest rival + the headline (intensity, total
// meetings, playoff eliminations). Paid = the record and the depth: full H2H
// W-L, heartbreaks/close losses, painful-loss detail, lore, every other rival,
// and the league-wide all-pairs dossier. Redaction is server-side (whitelist).

export type GatedRivalries = {
  rivalries: unknown[];
  gated: boolean;
  entitled: boolean;
  totalRivalries: number;
  lockedRivalries: number;
};

/** Whitelist the free "headline" for a single rivalry - no record fields cross the wire. */
function rivalryHeadline(p: Record<string, unknown>): Record<string, unknown> {
  const meetings =
    (Number(p.h2hWins) || 0) + (Number(p.h2hLosses) || 0) + (Number(p.h2hTies) || 0);
  return {
    rivalId: p.rivalId,
    rivalName: p.rivalName,
    rivalryScore: p.rivalryScore,
    heatLabel: p.heatLabel,
    playoffEliminations: p.playoffEliminations,
    lastMatchupSeason: p.lastMatchupSeason ?? null,
    meetings,
    focalKey: p.focalKey,
    rivalKey: p.rivalKey,
    locked: true,
  };
}

export function gateRivalryScores(scores: Record<string, unknown>[], entitled: boolean): GatedRivalries {
  const total = scores.length;
  if (entitled || total <= 1) {
    return { rivalries: scores, gated: false, entitled, totalRivalries: total, lockedRivalries: 0 };
  }
  const sorted = [...scores].sort(
    (a, b) => (Number(b.rivalryScore) || 0) - (Number(a.rivalryScore) || 0),
  );
  return {
    rivalries: [rivalryHeadline(sorted[0])],
    gated: true,
    entitled: false,
    totalRivalries: total,
    lockedRivalries: total - 1,
  };
}

/** League-wide all-pairs matrix is paid-only; free users get an empty set + the flag. */
export function gateH2H<T extends { pairs: unknown[] }>(h2h: T, entitled: boolean): T & { gated: boolean } {
  if (entitled) return { ...h2h, gated: false };
  return { ...h2h, pairs: [], gated: true } as T & { gated: boolean };
}

/**
 * Rivalry Dossier gating. The dossier carries the deep records - per-opponent
 * W-L, heartbreaks, points, largest win / worst loss, head-to-head timeline,
 * chart series, insights - in `opponents[]` and `pairDetail`. Free users get
 * those two emptied (no wrong numbers, just locked) + the flag. Identity stays
 * on the lighter rivalry.getScores teaser; this is the paid depth layer.
 */
export function gateRivalryDossier<T extends { opponents: unknown[]; pairDetail: unknown }>(
  dossier: T,
  entitled: boolean,
): T & { gated: boolean } {
  if (entitled) return { ...dossier, gated: false };
  return { ...dossier, opponents: [], pairDetail: null, gated: true } as T & { gated: boolean };
}
