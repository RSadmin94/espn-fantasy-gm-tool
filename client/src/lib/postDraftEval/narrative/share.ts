import type { GroundedNarrative, NarrativeFacts } from "./types";

/** Prefer grounded section copy so overlapping award identities still read as distinct purposes. */
export function awardCardBody(args: {
  storyReady: boolean;
  narrativeStory?: string | null;
  evaluatorWhy?: string | null;
  empty: string;
}): string {
  if (args.storyReady) {
    const story = args.narrativeStory?.trim();
    if (story) return story;
  }
  return args.evaluatorWhy?.trim() || args.empty;
}

export function buildShareCardText(facts: NarrativeFacts, narrative: GroundedNarrative): string {
  const best = facts.bestPick
    ? `${facts.bestPick.actualName} (Rd ${facts.bestPick.round}, pick ${facts.bestPick.overallPick})`
    : "—";
  const miss = facts.biggestMiss
    ? `${facts.biggestMiss.actualName} over ${facts.biggestMiss.altName ?? "the alternative"} (Rd ${facts.biggestMiss.round})`
    : "No major miss identified";
  const turn = facts.turningPoint
    ? `${facts.turningPoint.actualName} (Rd ${facts.turningPoint.round})`
    : "No major turning point identified";
  return [
    "Fantasy Football Rivals — Post-Draft Evaluation",
    `${facts.teamName} · ${facts.season}`,
    `Draft Grade: ${facts.overallGrade}`,
    `Rivals Redraft Grade: ${facts.rivalsRedraftGrade}`,
    `Best Pick: ${best}`,
    `Biggest Miss: ${miss}`,
    `Turning Point: ${turn}`,
    narrative.rivalsSays || "Rivals analysis unavailable.",
  ].join("\n");
}
