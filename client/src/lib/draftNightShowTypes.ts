/**
 * Client-facing Draft Night Show contracts (mirrors server award payload).
 * Presentation only — no commentary generation.
 */

export type DraftNightAwardType =
  | "winner_of_the_night"
  | "biggest_mistake"
  | "sleeper_value"
  | "under_intense_pressure";

export type DraftNightPersona = "sofia" | "coach" | "roxanne";

export type DraftNightEvidence = {
  fact: string;
  narrativeType?: string;
  confidence?: number;
  narrativeHeat?: number;
};

export type DraftNightAward = {
  awardType: DraftNightAwardType;
  ownerKey: string;
  ownerName: string;
  title: string;
  fact: string;
  decision?: string;
  impact?: string;
  playerName?: string;
  metrics: {
    draftGrade: string;
    valueScore: number;
    constructionScore: number;
    lineupScore: number;
  };
  evidence: DraftNightEvidence[];
  confidence: number;
  narrativeHeat: number;
  persona: DraftNightPersona;
};

export type DraftNightShowPayload = {
  awards: DraftNightAward[];
  suppressed: Array<{ awardType: DraftNightAwardType; reason: string }>;
  summaryFacts: string[];
  generatedAt: string;
  totalPicks: number;
  teamCount: number;
};
