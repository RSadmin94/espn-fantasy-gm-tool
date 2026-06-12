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
