import type { GradePos } from "@/lib/liveDraftGrade";
import type { RecommendationConfidence, RecommendationKind } from "./confidence";
import type { CandidateScore, RankedPlayer } from "./types";

function posWord(pos: string | null | undefined): string {
  const p = String(pos || "").toUpperCase();
  if (p === "QB") return "quarterback";
  if (p === "RB") return "running back";
  if (p === "WR") return "receiver";
  if (p === "TE") return "tight end";
  if (p === "K") return "kicker";
  if (p === "DEF" || p === "DP") return "defense";
  return "player";
}

export function rivalsPickLabel(kind: RecommendationKind): string {
  switch (kind) {
    case "same":
      return "Rivals Pick";
    case "preferred":
      return "Rivals Preferred";
    case "alternative":
      return "Strong Alternative";
    case "none":
      return "No definitive Rivals replacement";
  }
}

export function explainPick(args: {
  actualName: string;
  actualPos: string;
  rivalsName: string | null;
  rivalsPos: string | null;
  sameAsRivals: boolean;
  kind: RecommendationKind;
  confidence: RecommendationConfidence;
  openNeeds: GradePos[];
  rosterBefore: Array<{ name: string; position: string }>;
  actualScore: CandidateScore | null;
  rivalsScore: CandidateScore | null;
  scarcityOnRivals: boolean;
  needDifferentiationActive: boolean;
  rankingNote?: string | null;
}): string {
  if (args.kind === "none" || args.confidence === "INSUFFICIENT") {
    return `No definitive Rivals replacement. ${args.rankingNote ?? "The historical ranking evidence is not strong enough to claim a better pick than yours."}`;
  }

  if (args.sameAsRivals || args.kind === "same") {
    return `You made the right pick. ${args.actualName} was the best available decision at this slot given what was knowable at draft time.`;
  }

  const alt = args.rivalsName ?? "the alternative";
  if (args.kind === "preferred" || args.confidence === "MEDIUM") {
    const extra = args.needDifferentiationActive && args.rivalsPos
      ? ` ${alt} also fit the roster that had already been built.`
      : "";
    return `${alt} appears to have been the stronger roster-building option based on the available draft evidence.${extra}`;
  }

  // LOW confidence — alternative, not a verdict.
  const empty = args.rosterBefore.length === 0 || !args.needDifferentiationActive;
  if (empty) {
    return `${alt} was available and would have given you a different roster foundation, but the historical ranking evidence is not strong enough for Rivals to claim he was definitively better than ${args.actualName}.`;
  }

  const bits: string[] = [];
  if (
    args.needDifferentiationActive &&
    args.openNeeds[0] &&
    args.actualPos !== args.openNeeds[0] &&
    !(args.openNeeds[0] === "FLEX" && ["RB", "WR", "TE"].includes(args.actualPos))
  ) {
    bits.push(
      `By this point the roster was already shaped, and ${alt} (${posWord(args.rivalsPos)}) addressed a more informative construction gap than another ${posWord(args.actualPos)}.`,
    );
  } else if (args.actualPos === args.rivalsPos) {
    bits.push(
      `${alt} was available at this exact pick and grades as a stronger ${posWord(args.rivalsPos)} on the draft-time evidence we do have.`,
    );
  } else {
    bits.push(`${alt} was available and would have built the roster differently than ${args.actualName}.`);
  }
  bits.push("That is not a definitive claim that your pick was wrong.");
  return bits.join(" ");
}

export function impactTags(args: {
  openNeeds: GradePos[];
  actualPos: string;
  rivalsPos: string | null;
  sameAsRivals: boolean;
  scarcityOnRivals: boolean;
  kind: RecommendationKind;
  confidence: RecommendationConfidence;
  reasons: string[];
}): string[] {
  const tags: string[] = [];
  tags.push(`Confidence: ${args.confidence}`);
  if (args.kind === "same" || args.sameAsRivals) tags.push("Rivals pick: same as yours");
  else if (args.kind === "none") tags.push("No definitive replacement");
  else if (args.rivalsPos && args.actualPos !== args.rivalsPos) tags.push(`Took ${args.actualPos} over ${args.rivalsPos}`);
  if (args.scarcityOnRivals && !args.sameAsRivals) tags.push(`Passed positional cliff ${args.rivalsPos}`);
  for (const r of args.reasons.slice(0, 3)) tags.push(r.replace(/_/g, " ").toLowerCase());
  return tags.slice(0, 6);
}

export function headlineWhy(player: RankedPlayer, context: string): string {
  return `${player.name} ${context}`;
}

export function recommendationKindFor(args: {
  same: boolean;
  confidence: RecommendationConfidence;
  nearTie: boolean;
}): RecommendationKind {
  if (args.confidence === "INSUFFICIENT") return "none";
  if (args.same || args.nearTie) return "same";
  if (args.confidence === "HIGH") return "preferred";
  if (args.confidence === "MEDIUM") return "preferred";
  return "alternative";
}
