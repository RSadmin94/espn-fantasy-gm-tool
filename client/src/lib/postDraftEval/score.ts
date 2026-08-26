import { DEFAULT_GRADE_CONFIG, scorePickOpportunityCost } from "@/lib/liveDraftGrade";
import { normalizeGradePos } from "@/lib/liveDraftGrade/formatProfile";
import { openStarterNeeds } from "@/lib/liveDraftGrade/rosterMath";
import type { FormatProfile, GradePos } from "@/lib/liveDraftGrade";
import type { RankingTier, RecommendationConfidence } from "./confidence";
import { resolveDraftPhase } from "./draftPhase";
import { playerIdentityKeys, normalizePos } from "./names";
import { needScoreForPosition } from "./need";
import { playerSurvivesUntilNextPick } from "./survival";
import { detectTierCliff } from "./tierCliff";
import type { CandidateScore, DecisionGrade, HistoricalPick, RankedPlayer } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function ranksAreTrustworthy(tier: RankingTier): boolean {
  return tier === "TIER_1_CONTEMPORANEOUS" || tier === "TIER_2_SEASON_CACHE";
}

function talentScore(player: RankedPlayer, tier: RankingTier): number {
  if (!ranksAreTrustworthy(tier)) return 50;
  const rank = player.ecrRank ?? player.adp;
  if (rank == null || rank <= 0) return 40;
  return clamp(100 - Number(rank) * 0.45, 8, 100);
}

function valueScore(player: RankedPlayer, overallPick: number, tier: RankingTier): number {
  if (!ranksAreTrustworthy(tier)) return 50;
  const adp = player.adp ?? player.ecrRank;
  if (adp == null || adp <= 0) return DEFAULT_GRADE_CONFIG.pickValue.emptyDefault;
  const delta = overallPick - Number(adp);
  return clamp(
    DEFAULT_GRADE_CONFIG.pickValue.neutral + DEFAULT_GRADE_CONFIG.pickValue.scalePerAdpDelta * delta,
    DEFAULT_GRADE_CONFIG.pickValue.min,
    DEFAULT_GRADE_CONFIG.pickValue.max,
  );
}

function scarcityScore(
  player: RankedPlayer,
  available: readonly RankedPlayer[],
  tier: RankingTier,
): { score: number; cliff: boolean; reasons: string[] } {
  const pos = normalizePos(player.position);
  const samePos = available.filter((p) => normalizePos(p.position) === pos);
  const reasons: string[] = [];
  if (!ranksAreTrustworthy(tier)) {
    return { score: clamp(100 - samePos.length * 4, 30, 58), cliff: false, reasons };
  }
  const cliff = detectTierCliff({ player, available, rankingTier: tier });
  if (cliff.isCliff) {
    reasons.push("TIER_CLIFF");
    return { score: clamp(78 + Math.min(22, cliff.gap), 78, 100), cliff: true, reasons };
  }
  const rank = player.ecrRank ?? player.adp;
  if (samePos.length <= 1) return { score: 100, cliff: false, reasons: ["LAST_AT_POSITION"] };
  if (rank == null) return { score: clamp(100 - samePos.length * 8, 15, 70), cliff: false, reasons };
  const cluster = samePos.filter((p) => {
    const r = p.ecrRank ?? p.adp;
    return r != null && Math.abs(Number(r) - Number(rank)) <= 12;
  });
  if (cluster.length <= 1) return { score: 92, cliff: false, reasons };
  if (cluster.length === 2) return { score: 74, cliff: false, reasons };
  if (cluster.length === 3) return { score: 55, cliff: false, reasons };
  return { score: clamp(40 - (cluster.length - 4) * 6, 10, 40), cliff: false, reasons };
}

function capPenaltyFor(
  pos: GradePos | null,
  counts: Record<GradePos, number>,
  profile: FormatProfile,
): number {
  if (!pos) return 0;
  const have = counts[pos] ?? 0;
  const hard = profile.hardCap[pos];
  const soft = profile.softCap[pos];
  if (hard != null && have >= hard) return 80;
  if (soft != null && have >= soft) return 28;
  return 0;
}

export type ScoreCandidateArgs = {
  player: RankedPlayer;
  overallPick: number;
  totalPicks: number;
  round?: number;
  totalRounds?: number;
  countsBefore: Record<GradePos, number>;
  profile: FormatProfile;
  available: readonly RankedPlayer[];
  rankingTier?: RankingTier;
  historicalPicks?: readonly HistoricalPick[];
  nextUserOverall?: number | null;
};

export function scoreCandidate(args: ScoreCandidateArgs): CandidateScore {
  const rankingTier = args.rankingTier ?? "TIER_2_SEASON_CACHE";
  const pos = normalizeGradePos(args.player.position);
  const totalRounds = Math.max(1, args.totalRounds ?? args.round ?? 1);
  const round = args.round ?? 1;
  const phaseInfo = resolveDraftPhase({
    round,
    totalRounds,
    counts: args.countsBefore,
    profile: args.profile,
  });
  const talent = talentScore(args.player, rankingTier);
  const value = valueScore(args.player, args.overallPick, rankingTier);
  const scarcity = scarcityScore(args.player, args.available, rankingTier);
  const need = needScoreForPosition({
    pos,
    counts: args.countsBefore,
    profile: args.profile,
    phase: phaseInfo.phase,
    needImportance: phaseInfo.needImportance,
    talentScore: talent,
    scarcityScore: scarcity.score,
  });
  const progress = clamp(args.overallPick / Math.max(1, args.totalPicks), 0, 1);
  const kDue = progress >= DEFAULT_GRADE_CONFIG.floors.kDueProgress;
  const dstDue = progress >= DEFAULT_GRADE_CONFIG.floors.dstDueProgress;
  const open = openStarterNeeds(args.countsBefore, args.profile, { kDue, dstDue });
  const takingWaste = scorePickOpportunityCost({
    pick: {
      pickNumber: args.overallPick,
      position: args.player.position,
      name: args.player.name,
      adp: args.player.adp,
      marketValue: args.player.marketValue,
    },
    countsBefore: args.countsBefore,
    profile: args.profile,
    progress,
    cfg: DEFAULT_GRADE_CONFIG,
    startersAlreadyFilled: open.length === 0,
  });
  const survives = ranksAreTrustworthy(rankingTier)
    ? playerSurvivesUntilNextPick({
        player: args.player,
        picks: args.historicalPicks ?? [],
        afterOverall: args.overallPick,
        untilOverall: args.nextUserOverall ?? null,
      })
    : null;
  const reasons: string[] = [...scarcity.reasons];
  const counterpoints: string[] = [];
  let survivalAdj = 0;
  if (survives === false) {
    survivalAdj = 10;
    reasons.push("UNLIKELY_TO_SURVIVE_NEXT_PICK");
  } else if (survives === true) {
    survivalAdj = -4;
    counterpoints.push("LIKELY_AVAILABLE_NEXT_PICK");
  }
  if (need.fills && need.fills !== "FLEX") reasons.push(`FILLS_${need.fills}`);
  else if (need.fills === "FLEX") reasons.push("FILLS_FLEX");
  if (value >= 70 && ranksAreTrustworthy(rankingTier)) reasons.push("BETTER_ADP_VALUE");

  const capPenalty = capPenaltyFor(pos, args.countsBefore, args.profile);
  const w = phaseInfo.weights;
  const ocComponent = clamp(50 - takingWaste * 4 + survivalAdj, 0, 100);
  const total =
    w.talent * talent +
    w.value * value +
    w.need * need.score +
    w.scarcity * scarcity.score +
    w.opportunityCost * ocComponent -
    capPenalty;

  return {
    player: args.player,
    total,
    talent,
    value,
    need: need.score,
    scarcity: scarcity.score,
    opportunityCost: takingWaste,
    capPenalty,
    fillsNeed: need.fills,
    reasons,
    counterpoints,
    phase: phaseInfo.phase,
    survivesUntilNextPick: survives,
    needDifferentiationActive: need.report.needDifferentiationActive,
  };
}

/**
 * Near-tie band: ~4 points is one modest ADP/need tick, not a "mistake."
 * League-order / weak ranking evidence uses 8 points because talent is flattened.
 */
export const SAME_PICK_ABS_GAP = 4;
export const SAME_PICK_ABS_GAP_WEAK = 8;
export const SAME_PICK_RATIO = 0.97;
export const SAME_PICK_SCORE_EPS = SAME_PICK_ABS_GAP;

export function isNearTie(
  actual: CandidateScore | null,
  best: CandidateScore | null,
  rankingTier: RankingTier = "TIER_2_SEASON_CACHE",
): boolean {
  if (!actual || !best) return false;
  if (sameAsRecommended(actual, best)) return true;
  const gap = Math.abs(best.total - actual.total);
  const ratio = best.total <= 0 ? 1 : actual.total / best.total;
  const abs = ranksAreTrustworthy(rankingTier) ? SAME_PICK_ABS_GAP : SAME_PICK_ABS_GAP_WEAK;
  return gap <= abs || ratio >= SAME_PICK_RATIO;
}

export function sameAsRecommended(actual: CandidateScore | null, best: CandidateScore | null): boolean {
  if (!actual || !best) return false;
  const a = playerIdentityKeys({
    playerId: actual.player.playerId,
    name: actual.player.name,
    position: actual.player.position,
  });
  const b = playerIdentityKeys({
    playerId: best.player.playerId,
    name: best.player.name,
    position: best.player.position,
  });
  return a.some((k) => b.includes(k));
}

function floorGrade(grade: DecisionGrade, confidence: RecommendationConfidence | undefined): DecisionGrade {
  if (!confidence || confidence === "HIGH") return grade;
  if (confidence === "INSUFFICIENT") return "—";
  const order: DecisionGrade[] = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];
  const min = confidence === "MEDIUM" ? "C" : "B-";
  const g = order.indexOf(grade);
  const m = order.indexOf(min);
  if (g < 0) return grade;
  return g > m ? min : grade;
}

export function decisionGradeFromScores(args: {
  actual: CandidateScore | null;
  best: CandidateScore | null;
  samePlayer: boolean;
  isKeeper: boolean;
  nearTie?: boolean;
  confidence?: RecommendationConfidence;
}): DecisionGrade {
  if (args.isKeeper) return "—";
  if (args.confidence === "INSUFFICIENT") return "—";
  if (!args.actual) return floorGrade("C", args.confidence);
  if (args.samePlayer || args.nearTie) {
    if (args.actual.total >= 82) return floorGrade("A+", args.confidence);
    if (args.actual.total >= 72) return floorGrade("A", args.confidence);
    return floorGrade("A-", args.confidence);
  }
  const best = args.best?.total ?? args.actual.total;
  const gap = best - args.actual.total;
  const ratio = best <= 0 ? 1 : args.actual.total / best;
  let grade: DecisionGrade;
  if (ratio >= 0.97 && gap < 5) grade = "A";
  else if (ratio >= 0.93) grade = "A-";
  else if (ratio >= 0.88) grade = "B+";
  else if (ratio >= 0.82) grade = "B";
  else if (ratio >= 0.76) grade = "B-";
  else if (ratio >= 0.68) grade = "C+";
  else if (ratio >= 0.6) grade = "C";
  else if (ratio >= 0.52) grade = "C-";
  else if (ratio >= 0.42) grade = "D";
  else grade = "F";
  if (grade === "F" && args.confidence !== "HIGH") grade = "D";
  return floorGrade(grade, args.confidence);
}

export const BIGGEST_MISS_MIN_GAP = 12;
