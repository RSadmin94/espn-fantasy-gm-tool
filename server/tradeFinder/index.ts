export { TRADE_FINDER_WEIGHTS, TRADE_FINDER_BOUNDS, TRADE_FINDER_VALUE_BANDS } from "./weights";
export { findTrades } from "./find";
export { attachNeeds, analyzeTeamNeeds, leagueReplacementByPosition } from "./needSurplus";
export { bestLegalLineup, applyTradeToRoster } from "./lineup";
export { rankPartners, generateCandidates } from "./generate";
export { scoreCandidate, fairnessBandFromGrade } from "./score";
export { applyNarratives, parseNarrativePayload } from "./narrative";
export { behaviorFitForTrade, evidenceFromCompleted } from "./behavior";
export { rosterSlotsFromLineupSlotCounts } from "./positions";
export { DEFAULT_TRADE_FINDER_FILTERS, DEFAULT_ROSTER_SLOTS } from "./types";
export type {
  TradeFinderLeague,
  TradeFinderFilters,
  TradeFinderResult,
  TradeFinderCandidate,
  TradeFinderAsset,
  PositionNeedSurplus,
  FairnessBand,
  TradeFitLabel,
  BehaviorFit,
  EmptyReason,
} from "./types";
