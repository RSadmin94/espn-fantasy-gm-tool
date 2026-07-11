/**
 * Sofia v1 — frozen fact-packet + commentary contract.
 *
 * Types-only module shared by the UI track and Sofia backend. No builder, prompts,
 * model routing, persistence, or endpoints — implementers fill these shapes in later phases.
 */

export const SOFIA_FACT_PACKET_CONTRACT_VERSION = "sofia.fact_packet.v1" as const;
export const SOFIA_COMMENTARY_CONTRACT_VERSION = "sofia.commentary.v1" as const;

/** League Exclusivity — storyline-angle weights (frozen v1; sum = 1). */
export const EXCLUSIVITY_WEIGHTS = {
  ownerHistory: 0.3,
  rivalry: 0.25,
  patternBreak: 0.2,
  positionRun: 0.1,
  adp: 0.05,
  rosterNeed: 0.1,
} as const;

export type ExclusivityDimension = keyof typeof EXCLUSIVITY_WEIGHTS;

export type CommentaryLevel = "routine" | "notable" | "major" | "historic";

export type CommentaryRoutingStrategy = "template" | "grounded" | "show";

export type IdentityScope = "person" | "franchise";

export type CommentarySource = "fact_packet" | "template" | "grounded" | "show" | "cache";

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

export interface SofiaLeagueExclusivity {
  scores: Record<ExclusivityDimension, number>;
  weightedScore: number;
  primaryAngle: ExclusivityDimension;
}

export interface SofiaFactPacket {
  contractVersion: typeof SOFIA_FACT_PACKET_CONTRACT_VERSION;
  eventId: string;
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
  exclusivity: SofiaLeagueExclusivity;
  commentaryBudget: SofiaCommentaryBudget;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface SofiaCommentaryRouting {
  strategy: CommentaryRoutingStrategy;
  level: CommentaryLevel;
  reason: string;
}

export interface SofiaCommentary {
  contractVersion: typeof SOFIA_COMMENTARY_CONTRACT_VERSION;
  eventId: string;
  leagueId: string;
  draftId: string;
  level: CommentaryLevel;
  routing: SofiaCommentaryRouting;
  source: CommentarySource;
  headline: string | null;
  body: string | null;
  permittedClaims: string[];
  validation: {
    grounded: boolean;
    fabricationCount: number;
  };
}
