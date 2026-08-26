import type { FormatProfile, GradePos } from "@/lib/liveDraftGrade";

export type RankingSource =
  | "fantasypros_current"
  | "espn_season_adp"
  | "historical_draft_order_proxy"
  | "mixed";

export type HistoricalPick = {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: number;
  playerId: number | null;
  playerName: string;
  position: string | null;
  isKeeper: boolean;
};

export type RankedPlayer = {
  playerId: number | null;
  fpId: number | null;
  name: string;
  position: string;
  ecrRank: number | null;
  adp: number | null;
  tier: number | null;
  projectedPoints: number | null;
  marketValue: number | null;
};

export type DataIntegrity = {
  pickCount: number;
  uniqueOverallPicks: number;
  missingPlayerIdCount: number;
  missingPlayerNameCount: number;
  duplicateOverallPicks: number;
  rankingCoveragePct: number;
  rankingSource: RankingSource;
  rankingSourceNote: string;
  canProveAvailability: boolean;
  warnings: string[];
};

export type DecisionGrade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D"
  | "F"
  | "—";

export type AvailabilityConfidence = "HIGH" | "MEDIUM" | "LOW";
export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type RankingTier =
  | "TIER_1_CONTEMPORANEOUS"
  | "TIER_2_SEASON_CACHE"
  | "TIER_3_LEAGUE_ORDER"
  | "TIER_4_INSUFFICIENT";
export type RankingEvidenceQuality = "archived" | "season_cache" | "current_cache" | "league_order" | "none";
export type SuperflexStatus = "none" | "present" | "unknown";
export type RecommendationKind = "same" | "preferred" | "alternative" | "none";
export type DraftPhaseName = "FOUNDATION" | "CORE_BUILD" | "ROSTER_BUILD" | "DEPTH_UPSIDE";

export type CandidateScore = {
  player: RankedPlayer;
  total: number;
  talent: number;
  value: number;
  need: number;
  scarcity: number;
  opportunityCost: number;
  capPenalty: number;
  fillsNeed: GradePos | null;
  reasons?: string[];
  counterpoints?: string[];
  phase?: DraftPhaseName;
  survivesUntilNextPick?: boolean | null;
  needDifferentiationActive?: boolean;
};

export type PickReview = {
  overallPick: number;
  round: number;
  roundPick: number;
  isKeeper: boolean;
  sameAsRivals: boolean;
  decisionGrade: DecisionGrade;
  actual: RankedPlayer;
  rivals: RankedPlayer | null;
  otherOptions: RankedPlayer[];
  why: string;
  impact: string[];
  rosterBefore: Array<{ name: string; position: string }>;
  openNeedsBefore: GradePos[];
  availableTop: RankedPlayer[];
  actualScore: number | null;
  rivalsScore: number | null;
  scoreGap: number;
  recommendationConfidence: RecommendationConfidence;
  availabilityConfidence: AvailabilityConfidence;
  rankingTier: RankingTier;
  recommendationKind: RecommendationKind;
  rivalsLabel: string;
  reasons: string[];
  counterpoints: string[];
  draftPhase: DraftPhaseName;
  survivesUntilNextPick: boolean | null;
};

export type StarterRow = {
  slot: string;
  actual: RankedPlayer | null;
  redraft: RankedPlayer | null;
};

export type DraftHeadline = {
  label: string;
  round: number;
  overallPick: number;
  actualName: string;
  altName: string | null;
  why: string;
};

export type PostDraftEvaluation = {
  leagueId: string;
  season: number;
  userTeamId: number;
  integrity: DataIntegrity;
  format: FormatProfile;
  overallLetter: string;
  redraftLetter: string;
  bestPick: DraftHeadline | null;
  biggestMiss: DraftHeadline | null;
  turningPoint: DraftHeadline | null;
  strongestPosition: string | null;
  weakestPosition: string | null;
  valueCaptured: number | null;
  valueLeftOnBoard: number | null;
  picks: PickReview[];
  starterRows: StarterRow[];
  benchActual: RankedPlayer[];
  benchRedraft: RankedPlayer[];
  redraftPicks: Array<{
    overallPick: number;
    round: number;
    player: RankedPlayer;
    sameAsOriginal: boolean;
    isKeeper: boolean;
  }>;
  overallConfidence: RecommendationConfidence;
  rankingTier: RankingTier;
  superflexStatus: SuperflexStatus;
  historicalDisclosure: string | null;
  evidenceDisclosure: string;
};
