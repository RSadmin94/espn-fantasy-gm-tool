/**
 * Trade Finder data contract (RFSN-061).
 * Player identity is ESPN playerId — the same canonical id Trade Analyzer uses.
 */

export type SkillPosition = "QB" | "RB" | "WR" | "TE";
export type TradePosition = SkillPosition | "K" | "DST" | "DP";
export type RiskPreference = "conservative" | "balanced" | "aggressive";
export type NeedLabel = "NEED" | "SURPLUS" | "NEUTRAL";
export type TradeFitLabel = "STRONG FIT" | "GOOD FIT" | "BALANCED" | "AGGRESSIVE" | "LONG SHOT";
export type FairnessBand =
  | "BALANCED"
  | "SLIGHT EDGE YOU"
  | "SLIGHT EDGE THEM"
  | "AGGRESSIVE ASK"
  | "UNREALISTIC";
export type BehaviorFit = "NONE" | "WEAK" | "MODERATE" | "STRONG";
export type PartnerRationality = "STRONG" | "GOOD" | "MARGINAL" | "POOR";
export type TradeShape = "1-for-1" | "2-for-1" | "1-for-2" | "2-for-2";
export type TargetPositionFilter = "ANY" | "QB" | "RB" | "WR" | "TE" | "FLEX" | "K" | "DST";
export type EmptyReason =
  | "no_league"
  | "no_roster"
  | "preseason_empty"
  | "unsupported_season"
  | "no_viable_partners"
  | "insufficient_values"
  | "injury_heavy"
  | "team_mismatch"
  | "none";

export interface TradeFinderRosterSlots {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  FLEX: number;
  SUPERFLEX: number;
  DST: number;
  K: number;
  DP: number;
  BENCH: number;
  IR: number;
}

export interface TradeFinderPick {
  pickId: string;
  round: number;
  pickInRound: number;
  label: string;
  tradeValue: number;
}

export interface TradeFinderAsset {
  kind: "player" | "pick";
  /** ESPN playerId for players; pickId for picks. */
  assetId: string;
  playerId: number | null;
  name: string;
  position: TradePosition | "PICK";
  nflTeam: string;
  tradeValue: number;
  /** Weekly projection when ESPN appliedAverage or season projection exists. */
  weeklyProjection: number | null;
  starter: boolean;
  bench: boolean;
  ir: boolean;
  injuryStatus: string;
  unavailable: boolean;
}

export interface PositionNeedSurplus {
  position: TradePosition;
  needScore: number;
  surplusScore: number;
  label: NeedLabel;
}

/** Roster need plus discovery multiplier. needScore is unchanged. */
export interface TradePriorityNeed extends PositionNeedSurplus {
  tradePriorityScore: number;
}

export interface TradeFinderTeam {
  teamId: number;
  displayName: string;
  ownerName: string;
  roster: TradeFinderAsset[];
  picks: TradeFinderPick[];
  needs: PositionNeedSurplus[];
}

export interface ManagerBehaviorEvidence {
  completedTrades: number;
  mostAcquiredPos: string | null;
  mostTradedAwayPos: string | null;
  twoForOneCount: number;
  pickReceiptCount: number;
}

export interface TradeFinderLeague {
  leagueId: string;
  provider: string;
  season: number;
  userTeamId: number;
  format: "redraft" | "keeper" | "dynasty" | "unknown";
  slots: TradeFinderRosterSlots;
  teamCount: number;
  teams: TradeFinderTeam[];
  behaviorByTeam: Record<number, ManagerBehaviorEvidence>;
  disclaimers: string[];
}

export interface TradeFinderFilters {
  targetPosition: TargetPositionFilter;
  partnerTeamId: number | null;
  maxAssets: 1 | 2;
  includeDraftPicks: boolean;
  risk: RiskPreference;
  topN: number;
}

export interface TradeSideAsset {
  kind: "player" | "pick";
  assetId: string;
  playerId: number | null;
  name: string;
  position: string;
  tradeValue: number;
}

export interface LineupSnapshot {
  starterIds: string[];
  starterPoints: number | null;
  usesRealProjections: boolean;
  unfilledDedicated: Partial<Record<TradePosition, number>>;
}

export interface TradeFinderCandidate {
  partnerTeamId: number;
  partnerName: string;
  youGive: TradeSideAsset[];
  youReceive: TradeSideAsset[];
  shape: TradeShape;
  tradeScore: number;
  tradeFit: TradeFitLabel;
  fairness: FairnessBand;
  fairnessGrade: string;
  gainRatioUser: number;
  userLineupDelta: number | null;
  partnerLineupDelta: number | null;
  userNeedFit: number;
  partnerNeedFit: number;
  userDepthDamage: number;
  partnerDepthDamage: number;
  partnerRationality: PartnerRationality;
  behaviorFit: BehaviorFit;
  behaviorNote: string | null;
  whyThisWorks: string;
  riskWatchout: string;
  yourImpact: string;
  theirImpact: string;
  whyAi: string | null;
  riskAi: string | null;
}

export interface TradeFinderMetrics {
  teams: number;
  assetsEvaluated: number;
  partnersRanked: number;
  candidatesGenerated: number;
  candidatesScored: number;
  candidatesRejectedByRationality: number;
  candidatesReturned: number;
  elapsedMs: number;
  wantNeedPositions: string[];
  streamerDeprioritized: boolean;
}

export interface TradeFinderResult {
  ok: boolean;
  gated: boolean;
  entitled: boolean;
  emptyReason: EmptyReason;
  emptyExplanation: string | null;
  userNeeds: PositionNeedSurplus[];
  userSurplus: PositionNeedSurplus[];
  tradePriority: TradePriorityNeed[];
  trades: TradeFinderCandidate[];
  disclaimers: string[];
  picksSupported: boolean;
  metrics: TradeFinderMetrics;
  narrativeApplied: boolean;
}

export const DEFAULT_TRADE_FINDER_FILTERS: TradeFinderFilters = {
  targetPosition: "ANY",
  partnerTeamId: null,
  maxAssets: 2,
  includeDraftPicks: false,
  risk: "balanced",
  topN: 5,
};

export const DEFAULT_ROSTER_SLOTS: TradeFinderRosterSlots = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  SUPERFLEX: 0,
  DST: 1,
  K: 1,
  DP: 0,
  BENCH: 7,
  IR: 1,
};
