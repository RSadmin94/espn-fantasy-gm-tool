export { TRADE_FINDER_WEIGHTS, TRADE_FINDER_BOUNDS, TRADE_FINDER_VALUE_BANDS, TRADE_FINDER_PRIORITY_MULTIPLIER } from "./weights";
export { findTrades } from "./find";
export { attachNeeds, analyzeTeamNeeds, leagueReplacementByPosition } from "./needSurplus";
export { bestLegalLineup, applyTradeToRoster } from "./lineup";
export { rankPartners, generateCandidates, discoveryNeedPositions } from "./generate";
export { scoreCandidate, evaluateCandidate, fairnessBandFromGrade, tradeFitLabel } from "./score";
export { applyNarratives, parseNarrativePayload } from "./narrative";
export { behaviorFitForTrade, evidenceFromCompleted } from "./behavior";
export { rosterSlotsFromLineupSlotCounts } from "./positions";
export { partnerRationality } from "./partnerRationality";
export { DEFAULT_TRADE_FINDER_FILTERS, DEFAULT_ROSTER_SLOTS } from "./types";
export type {
  TradeFinderLeague,
  TradeFinderFilters,
  TradeFinderResult,
  TradeFinderCandidate,
  TradeFinderAsset,
  PositionNeedSurplus,
  TradePriorityNeed,
  PartnerRationality,
  FairnessBand,
  TradeFitLabel,
  BehaviorFit,
  EmptyReason,
} from "./types";
