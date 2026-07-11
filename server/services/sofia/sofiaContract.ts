/**
 * Sofia v1 — frozen fact-packet + commentary contract.
 *
 * Types-only module shared by the UI track and the Sofia backend. No builder, prompts,
 * model routing, persistence, or endpoints — implementers fill these shapes in later phases.
 *
 * The stable seam: the UI-facing `SofiaCommentary` NEVER exposes routing, model tier, or raw
 * permitted claims. The LLM's universe is the fact packet's `permittedClaims` only; the future
 * prompt builder must pass nothing else to the model.
 */

export const SOFIA_FACT_PACKET_CONTRACT_VERSION = "sofia.fact_packet.v1" as const;
export const SOFIA_COMMENTARY_CONTRACT_VERSION = "sofia.commentary.v1" as const;

/**
 * League Exclusivity — relative CLASS per storyline angle (frozen v1).
 * Numeric weights are deliberately NOT frozen here: they are calibrated via the 50-moment
 * Sofia benchmark and live in the later scoring implementation, not in this contract.
 */
export const EXCLUSIVITY_CLASS = {
  ownerHistory: "high",
  rivalry: "high",
  patternBreak: "high",
  positionRun: "medium",
  adp: "low",
  rosterNeed: "low",
} as const;

export type ExclusivityDimension = keyof typeof EXCLUSIVITY_CLASS;
export type ExclusivityClass = (typeof EXCLUSIVITY_CLASS)[ExclusivityDimension];

export type CommentaryLevel = "routine" | "notable" | "major" | "historic";
export type CommentaryRoutingStrategy = "template" | "grounded" | "show";
export type IdentityScope = "person" | "franchise";

/** UI-facing generation source — the model tier is intentionally invisible. */
export type CommentarySource = "template" | "llm";

export type SofiaReceiptStatus = "available" | "unsupported" | "not_applicable" | "conflicting";

export interface SofiaFactReceipt {
  id: string;
  type: string;
  status: SofiaReceiptStatus;
  source: string;
  authority: string;
  confidence: number;
  value?: unknown;
  supportedClaim?: string;
  notes?: string;
}

export interface SofiaCommentaryBudget {
  enabled: boolean;
  maxSentences: number;
  maxWords: number;
}

/** INTERNAL pipeline type — the routing decision. NEVER placed on `SofiaCommentary` (the wire). */
export interface SofiaCommentaryRouting {
  strategy: CommentaryRoutingStrategy;
  level: CommentaryLevel;
  reason: string;
}

/**
 * INTERNAL — the LLM-facing input, projected from a shipped DraftMoment
 * (DraftMoment.eventId -> momentId at the projection boundary).
 * The prompt builder must pass ONLY `permittedClaims` to the model.
 */
export interface SofiaFactPacket {
  contractVersion: typeof SOFIA_FACT_PACKET_CONTRACT_VERSION;
  momentId: string;
  leagueId: string;
  draftId: string;
  season: number;
  overallPick: number;
  round: number;
  roundPick: number;
  owner: {
    teamId: string;
    ownerId: string | null;
    ownerName: string;
    identityScope: IdentityScope;
    identitySource: string;
  };
  player: {
    playerId: string;
    playerName: string;
    position: string;
    nflTeam: string | null;
    adp: number | null;
  };
  rosterBeforePick: Record<string, number>;
  receipts: SofiaFactReceipt[];
  signals: string[];
  level: CommentaryLevel;
  permittedClaims: string[];
  forbiddenClaimCategories: string[];
  primaryStoryline: string | null;
  secondaryStoryline: string | null;
  exclusivity: {
    score: number;
    drivers: string[];
  };
  commentaryBudget: SofiaCommentaryBudget;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * UI-facing output — the smallest shape the UI needs to render a grounded moment.
 * No routing, no model tier, no raw permitted claims. One always-present `text`.
 */
export interface SofiaCommentary {
  contractVersion: typeof SOFIA_COMMENTARY_CONTRACT_VERSION;
  momentId: string;
  draftId: string;
  leagueId: string;
  subject: {
    ownerName: string;
    playerName: string;
    position: string;
    overallPick: number;
    round: number;
  };
  level: CommentaryLevel;
  primaryStoryline: string | null;
  text: string;
  source: CommentarySource;
  budget: {
    maxWords: number;
    actualWords: number;
  };
  validation: {
    grounded: boolean;
    fabricationCount: number;
  };
}
