export { PRIMARY_BEHAVIORAL_LEAGUE_ID, COLD_START_LEAGUE_ID } from "./constants";
export {
  BEHAVIORAL_LEAGUE_ID,
  chooserRoleFor,
  isEligibleForPersonalityFit,
  type ChooserRole,
} from "./rules";
export {
  CONFIRMED_ACTIVE_OWNERS,
  DEPARTED_BOARD_CONTEXT_OWNERS,
  BRUCE_PROFILE_OWNER_KEY,
  confirmedActiveProfileKeySet,
  proposedActiveProfileKeySet,
  personalityFitTierFor,
  shrinkageColdOwners,
  type ActiveOwnerEntry,
  type PersonalityFitTier,
} from "./activeOwners";
export { buildDraftEngineOwnerKeyRemap, STEVEN_HIBBARD_CANONICAL_KEY, EXPLICIT_NAME_ALIASES } from "./personMerge";
export { buildSeasonTerrain, formatTerrainTable, topTerrainCards } from "./phase2/buildSeasonTerrain";
export { loadSeasonTerrainInputs } from "./phase2/loadSeasonTerrainInputs";
export type { PlayerTerrainCard, SeasonTerrain, ValueSource } from "./phase2/types";

export {
  buildLeagueReadinessReport,
  formatReadinessTable,
  type LeagueReadinessReport,
  type OwnerReadinessRow,
  type ReadinessTier,
} from "./phase0/readiness";
export {
  buildChoiceLedger,
  choiceRecordsForOwner,
  formatChoiceRecordPlain,
  pickHeadlineAlternatives,
  type ChoiceLedgerInputs,
} from "./phase1/choiceLedger";
export { loadChoiceLedgerInputs } from "./phase1/loadChoiceLedgerInputs";
export type { ChoiceLedger, ChoiceRecord, ChoicePlayer, RoomState } from "./phase1/types";
export { buildTerrainLookup, buildChoiceEventsForFit, computeDriveFeatures, DRIVE_NAMES } from "./phase3/driveFeatures";
export { fitMultinomialLogit, SOUL_FIT_OPTIONS, type PersonalityFitResult, type PersonalityCoefficients, type FitMultinomialOptions, centerDrivesWithinChoices } from "./phase3/discreteChoiceModel";
export { formatPersonalityReadout } from "./phase3/personalityReadout";
export { fitAllActiveSouls, type OwnerSoulProfile, type LeagueSoulRegistry } from "./phase4/fitAllSouls";
export { formatGate4Readouts, soulParagraph, formatBeforeAfterSpread } from "./phase4/soulReadout";
export {
  hierarchicalShrink,
  clusterBehavioralSouls,
  averageCoefficients,
  type BehavioralCluster,
} from "./phase4/shrinkage";
export {
  deviationFromLeague,
  distinctiveDriveRankings,
  archetypeFromDeviation,
  spreadScore,
  TABLE_STAKES_DRIVES,
  DISTINCTIVE_DRIVES,
} from "./phase4/personalityDeviations";
export { buildOwnerDecisionProfile, buildAllDecisionProfiles, type OwnerDecisionProfile, type DecisionRule, type DecisionException } from "./phase4_5/decisionRules";
export { formatGate45Readouts, formatSingleProfile } from "./phase4_5/formatGate45";
export { detectBehavioralEras, type BehavioralEra } from "./phase4_5/behavioralEras";
export { mineLedgerEvidence, type EvidenceBundle } from "./phase4_5/evidenceMining";
export { traitConfidencePct, exposedStability, type StabilityBand } from "./phase4_5/traitConfidence";
export { simulateDraft, type DraftSimulationResult, type SimPickRecord } from "./phase5/simulateDraft";
export { formatBrucePartialGate, formatBrucePickOneLine } from "./phase5/formatBruceGate5";
export { createInitialWeather, mutateWeatherAfterPick, type DraftWeather, type SimPlayer } from "./phase5/weather";
export { resolveMoment, buildConsiderationSet, type MomentDecision } from "./phase5/moment";
export { resolveDraftOrderFromLedger, resolveDraftOrderFromSeason, chooserAtPick, poolFromTerrain, type DraftSlot } from "./phase5/loadSimDraftSetup";
export { mulberry32, type Rng } from "./phase5/rng";
export { computeUtility, computeDriveContributions, softmaxProbs } from "./phase3/discreteChoiceModel";
