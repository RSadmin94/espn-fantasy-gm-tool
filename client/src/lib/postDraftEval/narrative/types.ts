export const EVALUATOR_VERSION = "post-draft-eval-04";
export const NARRATIVE_VERSION = "post-draft-eval-06";

export type NarrativeConfidence = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";
export type NarrativeKind = "same" | "preferred" | "alternative" | "none";
export type CommentaryWeight = "major" | "normal" | "same" | "keeper" | "skip";
export type PickImportance = "MAJOR" | "NOTABLE" | "ROUTINE";
export type ConsequenceStrength = "hard" | "soft" | "none";
export type StorytellingSource = "llm" | "fallback" | "unavailable";

export type NarrativeKeeper = {
  overallPick: number;
  name: string;
  pos: string;
};

export type NarrativeRedraftPick = {
  overallPick: number;
  name: string;
  pos: string;
  isKeeper: boolean;
};

export type NarrativePickFact = {
  overallPick: number;
  round: number;
  roundPick: number;
  isKeeper: boolean;
  actualName: string;
  actualPos: string;
  /** Independent pick-card recommendation (board actually faced). */
  rivalsName: string;
  rivalsPos: string;
  independentRivalsName: string;
  independentRivalsPos: string;
  /** Sequential Rivals Redraft selection after earlier replacements. */
  sequentialRedraftName: string;
  sequentialRedraftPos: string;
  sequentialSameAsOriginal: boolean;
  kind: NarrativeKind;
  sameAsRivals: boolean;
  grade: string;
  confidence: NarrativeConfidence;
  availabilityConfidence: NarrativeConfidence | "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  why: string;
  impact: string[];
  otherOptions: string[];
  availableTop: string[];
  rosterBefore: string[];
  openNeeds: string[];
  survivesUntilNextPick: boolean | null;
  commentaryWeight: CommentaryWeight;
  importance: PickImportance;
  laterChase: {
    pos: string;
    strength: ConsequenceStrength;
    picks: Array<{ overallPick: number; round: number; actualName: string }>;
  } | null;
  passedNeedsEarlier: string[];
};

export type NarrativeFacts = {
  evaluatorVersion: string;
  narrativeVersion: string;
  leagueId: string;
  season: number;
  teamId: number;
  teamName: string;
  overallGrade: string;
  rivalsRedraftGrade: string;
  overallConfidence: NarrativeConfidence;
  rankingTier: string;
  historicalDisclosure: string | null;
  evidenceDisclosure: string;
  supportStatus: "FULL" | "LIMITED" | "UNSUPPORTED";
  recommendationCeiling: NarrativeConfidence;
  strongestPosition: string | null;
  weakestPosition: string | null;
  bestPick: {
    round: number;
    overallPick: number;
    actualName: string;
    why: string;
  } | null;
  biggestMiss: {
    round: number;
    overallPick: number;
    actualName: string;
    altName: string | null;
    why: string;
  } | null;
  turningPoint: {
    round: number;
    overallPick: number;
    actualName: string;
    altName: string | null;
    why: string;
  } | null;
  actualStarters: Array<{ slot: string; name: string | null; pos: string | null }>;
  rivalsStarters: Array<{ slot: string; name: string | null; pos: string | null }>;
  /** Keepers retained before live selections. Storytelling must treat these as already on the roster. */
  retainedKeepers: NarrativeKeeper[];
  rosterEnteringLiveDraft: string[];
  positionsFilledBeforeLive: string[];
  sequentialRivalsRoster: Array<{ slot: string; name: string | null; pos: string | null }>;
  sequentialRedraftPicks: NarrativeRedraftPick[];
  picks: NarrativePickFact[];
};

export type PickTake = {
  overallPick: number;
  headline: string;
  explanation: string;
};

export type GroundedNarrative = {
  source: StorytellingSource;
  cached: boolean;
  unavailableReason: string | null;
  /** Short hook. Must not replace the deterministic overall grade in the UI. */
  openingHeadline: string;
  /** Draft-level story (120–220 words target). */
  draftStory: string;
  /** @deprecated alias of draftStory for older call sites */
  openingBody: string;
  rivalsSays: string;
  bestPickStory: string | null;
  biggestMissStory: string | null;
  turningPointStory: string | null;
  actualVsRivals: string;
  pickTakes: PickTake[];
  /** Combined headline + explanation for older call sites */
  pickComments: Array<{ overallPick: number; text: string; headline: string; explanation: string }>;
};
