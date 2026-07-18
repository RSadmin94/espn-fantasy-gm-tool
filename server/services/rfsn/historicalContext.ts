/**
 * RFSN-005 — HistoricalContext contract (Sprint 9 Phase 1).
 * Structured evidence only — never commentary, emotion, or finished lines.
 */

export type NarrativeType =
  | "championship"
  | "draft_dna"
  | "breaking_tendency"
  | "repeat_behavior"
  | "player_connection"
  | "rivalry"
  | "major_reach"
  | "major_steal";

export type EvidenceSource = {
  /** Service or table authority (e.g. espn.hallOfFame, choiceLedger). */
  source: string;
  /** Stable reference within that authority. */
  ref: string;
};

export type HistoricalContext = {
  /** Observable & true — injected into factPacket.verifiedFacts when aired. */
  fact: string;
  evidence: EvidenceSource[];
  /** 0..1 — is it TRUE. */
  confidence: number;
  /** Existing moment-weight gate (0..1). */
  significance: number;
  narrativeType: NarrativeType;
  /** 0..100 — airtime worthiness (interesting ≠ true). */
  narrativeHeat: number;
};

/** Default air-rule thresholds (tune with data). */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_HEAT_THRESHOLD = 50;

/**
 * Air rule: offered to editorial only if confidence ≥ Tc AND narrativeHeat ≥ Th.
 * Below Th → true-but-silent (notes only, not broadcast).
 */
export function passesAirRule(
  ctx: HistoricalContext,
  thresholds: { confidence?: number; heat?: number } = {},
): boolean {
  const Tc = thresholds.confidence ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const Th = thresholds.heat ?? DEFAULT_HEAT_THRESHOLD;
  return ctx.confidence >= Tc && ctx.narrativeHeat >= Th;
}

export function significanceWeight(
  level: "routine" | "notable" | "major" | "historic" | string,
): number {
  switch (level) {
    case "historic":
      return 1;
    case "major":
      return 0.75;
    case "notable":
      return 0.5;
    case "routine":
      return 0.25;
    default:
      return 0.25;
  }
}
