import type { GradeConfig, GradeLetter } from "./gradeConfig";
import type { FormatProfile, GradeChangeEvent, GradePos, PillarScores } from "./types";

export function buildGradeChangeReasons(args: {
  teamId: number;
  atOverallPick: number;
  gradeBefore: GradeLetter;
  gradeAfter: GradeLetter;
  scoreBefore: number;
  scoreAfter: number;
  before: PillarScores & { opportunityCost: number; rawScore: number; smoothedScore: number };
  after: PillarScores & { opportunityCost: number; rawScore: number; smoothedScore: number };
  lastPickOc: number;
  lastPickPos: GradePos | null;
  openNeedBeforeLast: GradePos | null;
  profile: FormatProfile;
  cfg: GradeConfig;
  floorApplied: boolean;
}): GradeChangeEvent | null {
  const {
    gradeBefore,
    gradeAfter,
    scoreBefore,
    scoreAfter,
    before,
    after,
    cfg,
  } = args;
  const letterChanged = gradeBefore !== gradeAfter;
  const scoreDelta = scoreAfter - scoreBefore;
  if (!letterChanged && Math.abs(scoreDelta) < cfg.reasons.minScoreDeltaForEvent) {
    return null;
  }

  const reasons: string[] = [];

  if (args.lastPickOc > 0 && args.lastPickPos && args.openNeedBeforeLast) {
    if (args.lastPickPos === "QB" && args.profile.qbMode === "one_qb") {
      reasons.push(
        `Added quarterback while ${args.openNeedBeforeLast} need remained open`,
      );
    } else {
      reasons.push(
        `Passed on ${args.openNeedBeforeLast} need — drafted ${args.lastPickPos}`,
      );
    }
  }

  if (
    args.profile.qbMode === "one_qb" &&
    args.lastPickPos === "QB" &&
    // callers can pass via open need + OC
    args.lastPickOc >= cfg.reasons.ocSpikeHighlight
  ) {
    if (!reasons.some((r) => r.includes("quarterback"))) {
      reasons.push("Added third QB in 1QB league");
    }
  }

  const dC = after.construction - before.construction;
  if (dC <= -cfg.reasons.constructionDropHighlight) {
    reasons.push(`Construction score ${dC.toFixed(0)}`);
  } else if (dC >= cfg.reasons.constructionDropHighlight) {
    reasons.push(`Construction score +${dC.toFixed(0)}`);
  }

  const dOc = after.opportunityCost - before.opportunityCost;
  if (dOc >= cfg.reasons.ocSpikeHighlight) {
    reasons.push(`Opportunity Cost +${dOc.toFixed(0)}`);
  }

  const dL = after.lineupDepth - before.lineupDepth;
  if (dL <= -cfg.reasons.constructionDropHighlight) {
    reasons.push(`Lineup & Depth ${dL.toFixed(0)}`);
  }

  const dV = after.pickValue - before.pickValue;
  if (Math.abs(dV) >= cfg.reasons.constructionDropHighlight) {
    reasons.push(`Pick Value ${dV >= 0 ? "+" : ""}${dV.toFixed(0)}`);
  }

  if (args.floorApplied && scoreAfter < scoreBefore) {
    reasons.push("Late-draft floor capped score for incomplete roster");
  }

  if (reasons.length === 0) {
    if (letterChanged) {
      reasons.push(
        scoreDelta < 0
          ? "Peer curve and draft management score declined"
          : "Peer curve and draft management score improved",
      );
    } else {
      reasons.push(
        `Smoothed score ${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(1)}`,
      );
    }
  }

  return {
    teamId: args.teamId,
    atOverallPick: args.atOverallPick,
    gradeBefore,
    gradeAfter,
    scoreBefore,
    scoreAfter,
    reasons,
    components: {
      pickValue: after.pickValue,
      talent: after.talent,
      construction: after.construction,
      lineupDepth: after.lineupDepth,
      opportunityCost: after.opportunityCost,
      rawScore: after.rawScore,
      smoothedScore: after.smoothedScore,
    },
  };
}
