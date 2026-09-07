import {
  compareGivenSideTotals,
  fairnessGradeFromGainRatio,
  PICK_TO_MARKET_SCALE,
} from "../tradePickValueAuthority";
import type {
  TradeFinderAsset,
  TradeFinderCandidate,
  TradeFinderFilters,
  TradeFinderLeague,
  TradeFinderTeam,
  TradeFitLabel,
  TradePosition,
} from "./types";
import { TRADE_FINDER_RATIONALITY, TRADE_FINDER_WEIGHTS } from "./weights";
import { applyTradeToRoster, bestLegalLineup, playableCountAt } from "./lineup";
import { needMap } from "./needSurplus";
import type { GeneratedTrade } from "./generate";
import { matchesTarget, toSideAsset } from "./generate";
import { clamp, round1 } from "./positions";
import { behaviorFitForTrade } from "./behavior";
import { deterministicRisk, impactBlurb } from "./explain";
import { tradePriorityScore } from "./priority";
import { partnerRationality } from "./partnerRationality";
import { hardInvalid, type HardInvalidReason } from "./validity";
import {
  classifyOpportunity,
  compareCandidates,
  opportunityCopy,
  qualityTier,
  resultGroup,
  selectByTier,
  type OpportunityInput,
} from "./opportunity";

export function fairnessBandFromGrade(grade: string, gainRatioUser: number) {
  if (grade === "FAIR") return "BALANCED" as const;
  if (grade === "SLIGHT EDGE A") return "SLIGHT EDGE YOU" as const;
  if (grade === "SLIGHT EDGE B") return "SLIGHT EDGE THEM" as const;
  if (grade === "A WINS") return "AGGRESSIVE ASK" as const;
  if (grade === "B WINS") return "SLIGHT EDGE THEM" as const;
  if (grade === "LOPSIDED") return "UNREALISTIC" as const;
  if (gainRatioUser >= 0.95 && gainRatioUser <= 1.05) return "BALANCED" as const;
  return "UNREALISTIC" as const;
}

/** Compatibility wrapper — opportunity classification is the authority. */
export function tradeFitLabel(args: {
  score: number;
  fairness: ReturnType<typeof fairnessBandFromGrade>;
  partnerGain: number;
  userGain: number;
  userDelta: number;
  partnerDelta: number;
  rationality: TradeFinderCandidate["partnerRationality"];
}): TradeFitLabel {
  void args.score;
  return classifyOpportunity({
    userDelta: args.userDelta,
    partnerDelta: args.partnerDelta,
    fairness: args.fairness,
    rationality: args.rationality,
    userNeedFit: args.userGain * 100,
    partnerNeedFit: args.partnerGain * 100,
    gainRatioUser: 1,
    userDepthDamage: 0,
    targetHit: false,
    solvesSevereNeed: false,
    twoForOneClutter: false,
  });
}

function maxPriorityNeedOf(
  team: TradeFinderTeam,
  assets: TradeFinderAsset[],
  filters: TradeFinderFilters,
  slots: TradeFinderLeague["slots"],
): number {
  const m = needMap(team);
  let max = 0;
  for (const a of assets) {
    if (a.kind === "pick") continue;
    const n = m.get(a.position as TradePosition);
    if (n) max = Math.max(max, tradePriorityScore(n.needScore, n.position, filters, slots));
  }
  return max;
}

function depthDamage(
  before: TradeFinderTeam,
  afterRoster: TradeFinderAsset[],
  slots: TradeFinderLeague["slots"],
  gave: TradeFinderAsset[],
): number {
  let damage = 0;
  for (const a of gave) {
    if (a.kind !== "player" || a.position === "PICK") continue;
    const pos = a.position as TradePosition;
    const dedicated = slots[pos] ?? 0;
    if (dedicated <= 0) continue;
    const left = playableCountAt(afterRoster, pos);
    if (left < dedicated) damage = Math.max(damage, 1);
    else if (left === dedicated) damage = Math.max(damage, 0.55);
    else if (a.starter) damage = Math.max(damage, 0.25);
  }
  void before;
  return damage;
}

export interface ScoreOutcome {
  candidate: TradeFinderCandidate | null;
  rejectedByRationality: boolean;
  rejectedHard: boolean;
  hardReason: HardInvalidReason | null;
}

export function scoreCandidate(
  league: TradeFinderLeague,
  user: TradeFinderTeam,
  gen: GeneratedTrade,
  filters: TradeFinderFilters,
): TradeFinderCandidate | null {
  return evaluateCandidate(league, user, gen, filters).candidate;
}

export function evaluateCandidate(
  league: TradeFinderLeague,
  user: TradeFinderTeam,
  gen: GeneratedTrade,
  filters: TradeFinderFilters,
): ScoreOutcome {
  const invalid = hardInvalid(league, user, gen);
  if (invalid) {
    return { candidate: null, rejectedByRationality: false, rejectedHard: true, hardReason: invalid };
  }

  const giveValue = gen.give.reduce((s, a) => s + a.tradeValue, 0);
  const receiveValue = gen.receive.reduce((s, a) => s + a.tradeValue, 0);
  const cmp = compareGivenSideTotals(
    giveValue,
    receiveValue,
    Math.round(50 * PICK_TO_MARKET_SCALE),
  );
  const fairnessGrade = cmp.fairnessGrade || fairnessGradeFromGainRatio(cmp.gainRatioA);
  const fairness = fairnessBandFromGrade(fairnessGrade, cmp.gainRatioA);

  const giveIds = new Set(gen.give.map((a) => a.assetId));
  const userAfter = applyTradeToRoster(user.roster, giveIds, gen.receive);
  const partnerGiveIds = new Set(gen.receive.map((a) => a.assetId));
  const partnerAfter = applyTradeToRoster(gen.partner.roster, partnerGiveIds, gen.give);

  const userBeforeL = bestLegalLineup(user.roster, league.slots);
  const userAfterL = bestLegalLineup(userAfter, league.slots);
  const partnerBeforeL = bestLegalLineup(gen.partner.roster, league.slots);
  const partnerAfterL = bestLegalLineup(partnerAfter, league.slots);

  const partnerUnfilledAfter = Object.values(partnerAfterL.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);
  const partnerUnfilledBefore = Object.values(partnerBeforeL.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);

  const userUsesPts = userBeforeL.usesRealProjections && userAfterL.usesRealProjections;
  const partnerUsesPts = partnerBeforeL.usesRealProjections && partnerAfterL.usesRealProjections;
  const userDelta = round1((userAfterL.starterPoints ?? 0) - (userBeforeL.starterPoints ?? 0));
  const partnerDelta = round1((partnerAfterL.starterPoints ?? 0) - (partnerBeforeL.starterPoints ?? 0));

  const userDepth = depthDamage(user, userAfter, league.slots, gen.give);
  const partnerDepth = depthDamage(gen.partner, partnerAfter, league.slots, gen.receive);

  const userNeedFit = maxPriorityNeedOf(user, gen.receive, filters, league.slots) / 100;
  const partnerNeedFit = maxPriorityNeedOf(gen.partner, gen.give, filters, league.slots) / 100;

  const rationality = partnerRationality({
    partner: gen.partner,
    partnerIncoming: gen.give,
    partnerOutgoing: gen.receive,
    partnerDelta,
    partnerNeedFit: partnerNeedFit * 100,
    partnerDepthDamage: partnerDepth,
    partnerUnfilledBefore,
    partnerUnfilledAfter,
    partnerBeforeLineup: partnerBeforeL,
    partnerAfterLineup: partnerAfterL,
    partnerReceiveValue: giveValue,
    partnerGiveValue: receiveValue,
    fairness,
    shape: gen.shape,
    slots: league.slots,
  });

  const signedUser = userDelta / 8 + 0.35 * clamp((receiveValue - giveValue) / Math.max(giveValue, 1), -1, 1);
  const signedPartner = partnerDelta / 8 + 0.35 * clamp((giveValue - receiveValue) / Math.max(receiveValue, 1), -1, 1);
  const userGainNorm = clamp(signedUser, 0, 1);
  const partnerGainNorm = clamp(signedPartner, 0, 1);
  const fairnessNorm = 1 - clamp(Math.abs(cmp.gainRatioA - 1) / 0.35, 0, 1);
  const depthNorm = clamp(1 - 0.5 * userDepth - 0.5 * partnerDepth, 0, 1);

  const behavior = behaviorFitForTrade(league.behaviorByTeam[gen.partner.teamId], gen.give);
  const behaviorNorm =
    behavior.fit === "STRONG" ? 1 : behavior.fit === "MODERATE" ? 0.66 : behavior.fit === "WEAK" ? 0.33 : 0.5;

  const w = TRADE_FINDER_WEIGHTS;
  const core =
    w.userGain * userGainNorm +
    w.partnerGain * partnerGainNorm +
    w.fairness * fairnessNorm +
    w.userNeedFit * userNeedFit +
    w.partnerNeedFit * partnerNeedFit +
    w.depthStability * depthNorm;
  const tradeScore = round1(100 * (core + w.behavior * (behaviorNorm - 0.5)));

  const targetHit = matchesTarget(gen.receive, filters) && filters.targetPosition !== "ANY";
  const solvesSevereNeed = gen.receive.some((a) => {
    if (a.kind === "pick") return false;
    const n = needMap(user).get(a.position as TradePosition);
    return n != null && n.needScore >= TRADE_FINDER_RATIONALITY.severeNeedScore;
  });

  const oppInput: OpportunityInput = {
    userDelta,
    partnerDelta,
    fairness,
    rationality: rationality.label,
    userNeedFit: userNeedFit * 100,
    partnerNeedFit: partnerNeedFit * 100,
    gainRatioUser: cmp.gainRatioA,
    userDepthDamage: userDepth,
    targetHit,
    solvesSevereNeed,
    twoForOneClutter: rationality.twoForOneClutter,
  };
  const opportunity = classifyOpportunity(oppInput);
  const tier = qualityTier({ ...oppInput, opportunity });
  const copy = opportunityCopy({
    opportunity,
    userDelta,
    partnerDelta,
    fairness,
    giveNames: gen.give.filter((a) => a.kind === "player").map((a) => a.name).join(" and ") || "assets",
    receiveNames: gen.receive.filter((a) => a.kind === "player").map((a) => a.name).join(" and ") || "assets",
    givePos: gen.give.filter((a) => a.kind === "player").map((a) => a.position).join("/"),
    receivePos: gen.receive.filter((a) => a.kind === "player").map((a) => a.position).join("/"),
    partnerName: gen.partner.displayName,
    twoForOneClutter: rationality.twoForOneClutter,
    targetHit,
  });

  return {
    rejectedByRationality: rationality.label === "POOR",
    rejectedHard: false,
    hardReason: null,
    candidate: {
      partnerTeamId: gen.partner.teamId,
      partnerName: gen.partner.displayName,
      youGive: gen.give.map(toSideAsset),
      youReceive: gen.receive.map(toSideAsset),
      shape: gen.shape,
      tradeScore,
      tradeFit: opportunity,
      opportunity,
      qualityTier: tier,
      resultGroup: resultGroup(tier),
      targetSatisfied: filters.targetPosition === "ANY" ? true : targetHit,
      twoForOneClutter: rationality.twoForOneClutter,
      fairness,
      fairnessGrade,
      gainRatioUser: round1(cmp.gainRatioA),
      userLineupDelta: userDelta,
      partnerLineupDelta: partnerDelta,
      userNeedFit: round1(userNeedFit * 100),
      partnerNeedFit: round1(partnerNeedFit * 100),
      userDepthDamage: round1(userDepth),
      partnerDepthDamage: round1(partnerDepth),
      partnerRationality: rationality.label,
      behaviorFit: behavior.fit,
      behaviorNote: behavior.note,
      whyThisWorks: copy.whyYouWouldDoIt,
      whyTheydConsider: copy.whyTheydConsider,
      theCost: copy.theCost,
      rivalsVerdict: copy.rivalsVerdict,
      riskWatchout: deterministicRisk({ user, give: gen.give, userDepth, userDelta }),
      yourImpact: impactBlurb("you", userDelta, userUsesPts, gen.receive, user),
      theirImpact: impactBlurb("them", partnerDelta, partnerUsesPts, gen.give, gen.partner),
      whyAi: null,
      riskAi: null,
    },
  };
}

export function rankScored(scored: TradeFinderCandidate[], filters?: TradeFinderFilters): TradeFinderCandidate[] {
  const f: TradeFinderFilters = filters ?? {
    targetPosition: "ANY",
    partnerTeamId: null,
    maxAssets: 2,
    includeDraftPicks: false,
    risk: "balanced",
    topN: 5,
  };
  return [...scored].sort((a, b) => compareCandidates(a, b, f));
}

export function fillProgressively(
  scored: TradeFinderCandidate[],
  filters: TradeFinderFilters,
): TradeFinderCandidate[] {
  const ranked = rankScored(scored, filters);
  return selectByTier(ranked, filters.topN);
}
