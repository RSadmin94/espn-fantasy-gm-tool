export type {
  CandidateScore,
  DataIntegrity,
  DecisionGrade,
  DraftHeadline,
  HistoricalPick,
  PickReview,
  PostDraftEvaluation,
  RankedPlayer,
  RankingSource,
  StarterRow,
} from "./types";
export { normalizePlayerName, normalizePos, playerIdentitiesOverlap, playerIdentityKeys } from "./names";
export {
  addPlayerIdentityKeys,
  availableBoardPlayers,
  auditDraftIntegrity,
  buildTakenBefore,
  getAvailablePlayersAtPick,
  isPlayerTaken,
  leagueKeeperPicks,
  pickToRankedPlayer,
  playerAvailabilityAtPick,
  type AvailabilityReason,
  type PlayerAvailability,
} from "./availability";
export { decisionGradeFromScores, scoreCandidate, SAME_PICK_SCORE_EPS, BIGGEST_MISS_MIN_GAP, isNearTie } from "./score";
export { evaluatePostDraft } from "./evaluate";
export { explainPick, rivalsPickLabel } from "./whyCopy";
export { resolveDraftPhase } from "./draftPhase";
export { computeVacancies } from "./need";
export { playerSurvivesUntilNextPick } from "./survival";
export { detectTierCliff } from "./tierCliff";
export { parseEspnLineupSlots } from "./espnLineup";
export {
  classifySeasonIntegrity,
  continuousRanges,
  rankingTierFromStoredEvidence,
  pdeUnsupportedCopy,
  pdeLimitedRankingCopy,
  pdeLimitedRankingTitle,
  pdeSeasonPolicy,
  pdeMayEvaluate,
  pdeMayStorytell,
  resolvePdeSeason,
  pdeLiveBoardForSeason,
  pdeLeagueOrderProxyRank,
  capRecommendationConfidence,
  rankingTierToEvalTier,
  rankingQualityForPolicy,
  applyPdeSupportGate,
  PDE_EVAL_FROM,
  PDE_EVAL_THROUGH,
  type SeasonIntegrityInput,
  type SeasonIntegrityResult,
  type SupportStatus,
  type PdeSeasonPolicy,
} from "./historicalIntegrity";
export { UNAVAILABLE_PLAYER_LABEL, pickIsIdentifiable, resolvePickDisplayIdentity } from "./playerDisplay";
export {
  EVALUATOR_VERSION,
  NARRATIVE_VERSION,
  buildNarrativeFacts,
  buildFallbackNarrative,
  emptyUnavailableNarrative,
  groundNarrative,
  awardCardBody,
  buildShareCardText,
  storytellingAllowed,
  type GroundedNarrative,
  type NarrativeFacts,
  type PickTake,
} from "./narrative";
