import type { GradeLetter } from "./gradeConfig";

export type GradePos = "QB" | "RB" | "WR" | "TE" | "FLEX" | "K" | "DEF" | "DP";

export type QbMode = "one_qb" | "superflex" | "two_qb";

export type DefenseKey = "DEF" | "DP" | "none";

export type FormatProfile = {
  leagueId: string;
  source: "espn_reliable" | "inferred_default" | "client_inferred";
  starters: Record<GradePos, number>;
  superflexSlots: number;
  qbMode: QbMode;
  benchSlots: number;
  irSlots: number;
  defenseKey: DefenseKey;
  softCap: Partial<Record<GradePos, number>>;
  hardCap: Partial<Record<GradePos, number>>;
  targetShares: Partial<Record<"QB" | "RB" | "WR" | "TE" | "DP", number>>;
  flexEligibility: Array<"RB" | "WR" | "TE" | "QB">;
  needPriority: GradePos[];
  scoringHints: {
    receptionPoints: number;
    tePremium: boolean;
    isBestBall: boolean;
    isIdp: boolean;
  };
  keepersOccupySlots: boolean;
};

export type GradePick = {
  pickNumber: number;
  position: string;
  name?: string;
  adp?: number | null;
  marketValue?: number | null;
  projectedPoints?: number | null;
  isKeeper?: boolean;
};

export type PillarScores = {
  pickValue: number;
  talent: number;
  construction: number;
  lineupDepth: number;
};

export type TeamGradeComponents = PillarScores & {
  /** Sum of per-pick OC points before team cap */
  opportunityCostSum: number;
  /** Applied penalty after team cap (0–teamCap) */
  opportunityCost: number;
  /** Last pick's OC contribution */
  lastPickOc: number;
  avgDelta: number;
  scoredPickCount: number;
  rawScore: number;
  smoothedScore: number;
  letter: GradeLetter;
};

export type GradeChangeEvent = {
  teamId: number;
  atOverallPick: number;
  gradeBefore: GradeLetter;
  gradeAfter: GradeLetter;
  scoreBefore: number;
  scoreAfter: number;
  reasons: string[];
  components: PillarScores & {
    opportunityCost: number;
    rawScore: number;
    smoothedScore: number;
  };
};

/** Persisted snapshot after each league evaluation. */
export type TeamGradeSnapshot = TeamGradeComponents & {
  teamId: number;
  atOverallPick: number;
  weights: { value: number; talent: number; construction: number; lineup: number };
  lastChange: GradeChangeEvent | null;
};

export type LeagueGradeState = {
  byTeam: Map<number, TeamGradeSnapshot>;
  historyByTeam: Map<number, TeamGradeSnapshot[]>;
  changes: GradeChangeEvent[];
};
