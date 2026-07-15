/**
 * Live-draft written commentary eligibility.
 *
 * Does NOT promote routine picks by round alone. Suppresses commentary when the
 * only permitted claim is the bare selection fact ("Owner selected Player at pick X").
 */
import type { DraftMoment } from "../draftMoments/draftMomentTypes";

/** @deprecated Round floors are intentionally disabled — kept for call-site stability. */
export const EARLY_ROUND_WRITTEN_FLOOR = 0;

const BARE_SELECTION_RE =
  /^.+ selected .+ at pick \d+(?:, round \d+)?\.?$/i;

export function isBareSelectionClaim(claim: string, moment?: Pick<DraftMoment, "owner" | "player" | "overallPick">): boolean {
  const trimmed = claim.trim();
  if (!BARE_SELECTION_RE.test(trimmed)) return false;
  if (!moment) return true;
  // Require owner + player appear — guards against coincidental phrasing elsewhere.
  const owner = moment.owner.ownerName.trim();
  const player = moment.player.playerName.trim();
  if (owner && !trimmed.includes(owner)) return false;
  if (player && !trimmed.includes(player)) return false;
  return true;
}

export function analyticalClaimsBeyondSelection(moment: DraftMoment): string[] {
  return moment.permittedClaims.filter((c) => c?.trim() && !isBareSelectionClaim(c, moment));
}

/** Real analytical triggers — excludes the deprecated early-round floor marker. */
export function triggerEvidenceForMoment(moment: DraftMoment): string[] {
  const signals = moment.signals.filter((s) => s && s !== "EARLY_ROUND_FLOOR");
  const claims = analyticalClaimsBeyondSelection(moment);
  const receipts = moment.receipts.map((r) => `${r.type}:${r.id}`);
  return [...signals, ...claims, ...receipts];
}

export function hasAnalyticalEvidenceBeyondSelection(moment: DraftMoment): boolean {
  return triggerEvidenceForMoment(moment).length > 0;
}

/**
 * Apply eligibility for the live written path.
 * - Never force-promotes rounds 1–3 routine → notable.
 * - Strips deprecated EARLY_ROUND_FLOOR markers.
 * - Force-silences when commentary would rest on the bare selection fact alone.
 */
export function applyLiveDraftWrittenEligibility(moment: DraftMoment): DraftMoment {
  const signals = moment.signals.filter((s) => s !== "EARLY_ROUND_FLOOR");
  const cleaned: DraftMoment = signals.length === moment.signals.length ? moment : { ...moment, signals };

  if (!cleaned.commentaryBudget.enabled || cleaned.level === "routine") {
    return cleaned;
  }

  if (!hasAnalyticalEvidenceBeyondSelection(cleaned)) {
    return {
      ...cleaned,
      level: "routine",
      signals,
      commentaryBudget: { enabled: false, maxSentences: 0, maxWords: 0 },
    };
  }

  return cleaned;
}

/**
 * Compatibility export — formerly promoted rounds 1–3 to notable.
 * Now only applies written eligibility (no round floor).
 */
export function applyEarlyRoundWrittenFloor(moment: DraftMoment): DraftMoment {
  return applyLiveDraftWrittenEligibility(moment);
}
