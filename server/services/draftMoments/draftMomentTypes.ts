/**
 * Draft Moment Engine — types + tunable configuration.
 *
 * A DraftMoment is a deterministic, auditable, grounded description of a completed mock-draft pick.
 * It is a PURE post-processor over an already-finished mock: it never influences player selection.
 * Every substantive claim traces to a receipt; the LLM (a later phase) may only use `permittedClaims`.
 */

export type MomentLevel = "routine" | "notable" | "major" | "historic";
export type ReceiptStatus = "available" | "unsupported" | "not_applicable" | "conflicting";
export type IdentityScope = "person" | "franchise";

export interface DraftMomentReceipt {
  id: string;
  type: string;
  status: ReceiptStatus;
  source: string;      // service or table the value came from
  authority: string;   // which subsystem is the source of truth
  confidence: number;  // 0..1
  value?: unknown;
  supportedClaim?: string; // exact claim this receipt licenses (only when status === "available")
  notes?: string;
}

export interface DraftMoment {
  eventId: string;
  leagueId: string;
  draftId: string;
  seed?: string;
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
  receipts: DraftMomentReceipt[];
  signals: string[];
  level: MomentLevel;
  permittedClaims: string[];
  forbiddenClaimCategories: string[];
  primaryStoryline: string | null;
  secondaryStoryline: string | null;
  commentaryBudget: { enabled: boolean; maxSentences: number; maxWords: number };
  validation: { valid: boolean; errors: string[]; warnings: string[] };
}

/** A detected significance signal (internal to the classifier). */
export interface MomentSignal {
  name: "REACH" | "STEAL" | "TIER_CLIFF" | "PATTERN_BREAK" | "CONSEQUENTIAL_RUN" | "DP_TIMING";
  strong: boolean;
  why: string;
}

/**
 * Tunable thresholds — validated against the harness recalibration on league 457622
 * (routine 62% / notable 32% / major 5% / historic 2%). Change here, never in the classifier body.
 */
export interface MomentConfig {
  adp: { moderateDelta: number; strongDelta: number; maxRound: number; strongMaxRound: number };
  tierCliff: { moderateGap: number; strongGap: number; maxRound: number };
  patternBreak: { minSeasons: number; minRoundBreak: number };
  consequentialRun: { minRunInWindow: number; window: number; requiresTierCliff: boolean };
  dpTiming: { moderateDeviation: number; strongDeviation: number };
  positionRunWindow: number;
  commentary: {
    routine: { enabled: boolean; maxSentences: number; maxWords: number };
    notable: { enabled: boolean; maxSentences: number; maxWords: number };
    major: { enabled: boolean; maxSentences: number; maxWords: number };
    historic: { enabled: boolean; maxSentences: number; maxWords: number };
  };
}

export const DEFAULT_MOMENT_CONFIG: MomentConfig = {
  adp: { moderateDelta: 8, strongDelta: 25, maxRound: 10, strongMaxRound: 7 },
  tierCliff: { moderateGap: 12, strongGap: 25, maxRound: 12 },
  patternBreak: { minSeasons: 3, minRoundBreak: 3 },
  consequentialRun: { minRunInWindow: 4, window: 6, requiresTierCliff: true },
  dpTiming: { moderateDeviation: 3, strongDeviation: 5 },
  positionRunWindow: 6,
  commentary: {
    routine: { enabled: false, maxSentences: 0, maxWords: 0 },
    notable: { enabled: true, maxSentences: 1, maxWords: 20 },
    major: { enabled: true, maxSentences: 2, maxWords: 35 },
    historic: { enabled: true, maxSentences: 2, maxWords: 45 },
  },
};

/** Claim categories the validator forbids unless a receipt explicitly supports them. */
export const FORBIDDEN_CLAIM_CATEGORIES = [
  "owner_emotion", "owner_motivation", "panic_or_desperation", "certainty", "future_outcome",
  "player_award", "player_injury", "player_biography", "prior_season_result",
  "nfl_team_unless_receipt", "rivalry_impact_unless_receipt", "person_identity_unless_resolved",
];

export const IDP_POSITIONS = new Set(["DP", "DEF", "DST"]);
export const FLEX_ELIGIBLE = new Set(["RB", "WR", "TE"]);
