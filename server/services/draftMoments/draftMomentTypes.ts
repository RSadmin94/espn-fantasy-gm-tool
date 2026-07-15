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
  name:
    | "REACH"
    | "STEAL"
    | "TIER_CLIFF"
    | "PATTERN_BREAK"
    | "CONSEQUENTIAL_RUN"
    | "DP_TIMING"
    | "POSITION_RUN"
    | "STARTER_NEED"
    | "NFL_STACK"
    | "ZERO_RB"
    | "HERO_RB"
    | "LATE_PATTERN"
    | "SPECIALIST_EARLY"
    | "QB_WAITING"
    | "TE_WAITING";
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
  /** Positional run without requiring a tier cliff (run "begins / accelerates"). */
  positionRunAlone: { minRunInWindow: number };
  dpTiming: { moderateDeviation: number; strongDeviation: number };
  positionRunWindow: number;
  /**
   * Closing an open starter slot after the position's typical early window —
   * Coach construction lane (not every first starter fill).
   */
  starterNeed: { maxRound: number; minRoundByPos: Record<string, number> };
  /** Same-NFL-team stack (QB with WR/TE or WR/TE with QB). */
  nflStack: { enabled: boolean };
  /** Strategy-shape milestones (landmark rounds only — not continuous spam). */
  strategyShape: {
    zeroRbLandmarks: readonly number[];
    heroRbMaxRound: number;
    qbWaitingLandmarks: readonly number[];
    teWaitingLandmarks: readonly number[];
  };
  /** First K / DST meaningfully earlier than league norms. */
  specialistEarly: { kMaxRound: number; dstMaxRound: number };
  /** Latest-ever positional timing (mirror of earliest pattern break). */
  latePattern: { minSeasons: number; minRoundBreak: number };
  commentary: {
    routine: { enabled: boolean; maxSentences: number; maxWords: number };
    notable: { enabled: boolean; maxSentences: number; maxWords: number };
    major: { enabled: boolean; maxSentences: number; maxWords: number };
    historic: { enabled: boolean; maxSentences: number; maxWords: number };
  };
}

const EDITORIAL_INTELLIGENCE = {
  positionRunAlone: { minRunInWindow: 4 },
  starterNeed: {
    maxRound: 10,
    minRoundByPos: { QB: 5, RB: 4, WR: 4, TE: 6 },
  },
  nflStack: { enabled: true },
  strategyShape: {
    zeroRbLandmarks: [4, 6, 8],
    heroRbMaxRound: 3,
    qbWaitingLandmarks: [6, 8],
    teWaitingLandmarks: [7, 9],
  },
  specialistEarly: { kMaxRound: 8, dstMaxRound: 9 },
  latePattern: { minSeasons: 3, minRoundBreak: 2 },
} as const;

/** Pre–pace-tuning thresholds — baseline for editorial rate comparison tests. */
export const LEGACY_MOMENT_CONFIG: MomentConfig = {
  adp: { moderateDelta: 9, strongDelta: 24, maxRound: 9, strongMaxRound: 6 },
  tierCliff: { moderateGap: 13, strongGap: 24, maxRound: 11 },
  patternBreak: { minSeasons: 4, minRoundBreak: 4 },
  consequentialRun: { minRunInWindow: 5, window: 5, requiresTierCliff: true },
  dpTiming: { moderateDeviation: 3, strongDeviation: 5 },
  positionRunWindow: 6,
  ...EDITORIAL_INTELLIGENCE,
  commentary: {
    routine: { enabled: false, maxSentences: 0, maxWords: 0 },
    notable: { enabled: true, maxSentences: 1, maxWords: 20 },
    major: { enabled: true, maxSentences: 2, maxWords: 35 },
    historic: { enabled: true, maxSentences: 2, maxWords: 45 },
  },
};

export const DEFAULT_MOMENT_CONFIG: MomentConfig = {
  adp: { moderateDelta: 6, strongDelta: 22, maxRound: 10, strongMaxRound: 7 },
  tierCliff: { moderateGap: 10, strongGap: 22, maxRound: 12 },
  patternBreak: { minSeasons: 3, minRoundBreak: 2 },
  consequentialRun: { minRunInWindow: 3, window: 6, requiresTierCliff: true },
  dpTiming: { moderateDeviation: 3, strongDeviation: 5 },
  positionRunWindow: 6,
  ...EDITORIAL_INTELLIGENCE,
  commentary: {
    routine: { enabled: false, maxSentences: 0, maxWords: 0 },
    notable: { enabled: true, maxSentences: 1, maxWords: 20 },
    major: { enabled: true, maxSentences: 2, maxWords: 35 },
    historic: { enabled: true, maxSentences: 2, maxWords: 45 },
  },
};

/** Broadcast-pace live draft — more sensitive classification; Brisk/Turbo use DEFAULT/LEGACY. */
export const BROADCAST_PACE_MOMENT_CONFIG: MomentConfig = {
  adp: { moderateDelta: 3, strongDelta: 14, maxRound: 12, strongMaxRound: 9 },
  tierCliff: { moderateGap: 7, strongGap: 16, maxRound: 12 },
  patternBreak: { minSeasons: 3, minRoundBreak: 2 },
  consequentialRun: { minRunInWindow: 3, window: 6, requiresTierCliff: true },
  dpTiming: { moderateDeviation: 2, strongDeviation: 4 },
  positionRunWindow: 6,
  ...EDITORIAL_INTELLIGENCE,
  latePattern: { minSeasons: 3, minRoundBreak: 2 },
  commentary: {
    routine: { enabled: false, maxSentences: 0, maxWords: 0 },
    notable: { enabled: true, maxSentences: 1, maxWords: 22 },
    major: { enabled: true, maxSentences: 2, maxWords: 38 },
    historic: { enabled: true, maxSentences: 2, maxWords: 45 },
  },
};

export type DraftPace = "broadcast" | "brisk" | "turbo";

export function momentConfigForDraftPace(pace?: DraftPace): MomentConfig {
  if (pace === "broadcast") return BROADCAST_PACE_MOMENT_CONFIG;
  if (pace === "turbo") return LEGACY_MOMENT_CONFIG;
  return DEFAULT_MOMENT_CONFIG;
}

/** Map Live Draft UI pace timer to server classification profile. */
export function draftPaceFromTimerMs(paceMs: number): DraftPace {
  if (paceMs >= 8000) return "broadcast";
  if (paceMs >= 2000) return "brisk";
  return "turbo";
}

/** Claim categories the validator forbids unless a receipt explicitly supports them. */
export const FORBIDDEN_CLAIM_CATEGORIES = [
  "owner_emotion", "owner_motivation", "panic_or_desperation", "certainty", "future_outcome",
  "player_award", "player_injury", "player_biography", "prior_season_result",
  "nfl_team_unless_receipt", "rivalry_impact_unless_receipt", "person_identity_unless_resolved",
];

export const IDP_POSITIONS = new Set(["DP", "DEF", "DST"]);
export const FLEX_ELIGIBLE = new Set(["RB", "WR", "TE"]);
