import {
  compareGivenSideTotals,
  fairnessGradeFromGainRatio,
  PICK_TO_MARKET_SCALE,
} from "../tradePickValueAuthority";
import type {
  BehaviorFit,
  FairnessBand,
  TradeFinderAsset,
  TradeFinderCandidate,
  TradeFinderFilters,
  TradeFinderLeague,
  TradeFinderTeam,
  TradeFitLabel,
  TradePosition,
} from "./types";
import { TRADE_FINDER_REJECT, TRADE_FINDER_WEIGHTS } from "./weights";
import { applyTradeToRoster, bestLegalLineup, playableCountAt } from "./lineup";
import { needMap } from "./needSurplus";
import type { GeneratedTrade } from "./generate";
import { toSideAsset, isCanonicalDuplicateSafe, receiveHitsFormalNeed } from "./generate";
import { clamp, round1 } from "./positions";
import { behaviorFitForTrade } from "./behavior";
import { deterministicWhy, deterministicRisk, impactBlurb } from "./explain";
import { tradePriorityScore } from "./priority";
import { partnerRationality, partnerRationalityRank } from "./partnerRationality";
import type { PartnerRationality } from "./types";

export function fairnessBandFromGrade(grade: string, gainRatioUser: number): FairnessBand {
  if (grade === "FAIR") return "BALANCED";
  if (grade === "SLIGHT EDGE A") return "SLIGHT EDGE YOU";
  if (grade === "SLIGHT EDGE B") return "SLIGHT EDGE THEM";
  if (grade === "A WINS") return "AGGRESSIVE ASK";
  if (grade === "B WINS") return "SLIGHT EDGE THEM";
  if (grade === "LOPSIDED") return "UNREALISTIC";
  if (gainRatioUser >= 0.95 && gainRatioUser <= 1.05) return "BALANCED";
  return "UNREALISTIC";
}

export function tradeFitLabel(args: {
  score: number;
  fairness: FairnessBand;
  partnerGain: number;
  userGain: number;
  userDelta: number;
  partnerDelta: number;
  rationality: PartnerRationality;
}): TradeFitLabel {
  if (args.rationality === "POOR") return "LONG SHOT";
  if (args.fairness === "UNREALISTIC") return "LONG SHOT";
  const userUp = args.userDelta > 0;
  const partnerNonNeg = args.partnerDelta >= 0;
  if (userUp && (args.rationality === "STRONG" || args.rationality === "GOOD") && partnerNonNeg) {
    if (args.rationality === "STRONG" && args.userDelta >= 1) return "STRONG FIT";
    return "GOOD FIT";
  }
  if (userUp && args.rationality === "GOOD") {
    if (args.fairness === "SLIGHT EDGE YOU" || args.fairness === "AGGRESSIVE ASK") return "AGGRESSIVE";
    return "GOOD FIT";
  }
  if (args.rationality === "MARGINAL") {
    if (args.fairness === "SLIGHT EDGE YOU" || args.fairness === "AGGRESSIVE ASK") return "AGGRESSIVE";
    return "LONG SHOT";
  }
  if (args.fairness === "AGGRESSIVE ASK" && args.partnerGain < 0.15) return "LONG SHOT";
  if (args.fairness === "AGGRESSIVE ASK") return "AGGRESSIVE";
  if (args.score >= 62 && args.partnerGain >= 0.25 && args.userGain >= 0.25) {
    return "STRONG FIT";
  }
  if (args.fairness === "BALANCED" || args.fairness === "SLIGHT EDGE THEM") return "BALANCED";
  if (args.userGain > args.partnerGain + 0.2) return "AGGRESSIVE";
  return "LONG SHOT";
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
  if (!isCanonicalDuplicateSafe(gen.give, gen.receive)) {
    return { candidate: null, rejectedByRationality: false };
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
  if (fairness === "UNREALISTIC") return { candidate: null, rejectedByRationality: false };

  const giveIds = new Set(gen.give.map((a) => a.assetId));
  const userAfter = applyTradeToRoster(user.roster, giveIds, gen.receive);
  const partnerGiveIds = new Set(gen.receive.map((a) => a.assetId));
  const partnerAfter = applyTradeToRoster(gen.partner.roster, partnerGiveIds, gen.give);

  const userBeforeL = bestLegalLineup(user.roster, league.slots);
  const userAfterL = bestLegalLineup(userAfter, league.slots);
  const partnerBeforeL = bestLegalLineup(gen.partner.roster, league.slots);
  const partnerAfterL = bestLegalLineup(partnerAfter, league.slots);

  const userUnfilledAfter = Object.values(userAfterL.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);
  const partnerUnfilledAfter = Object.values(partnerAfterL.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);
  const userUnfilledBefore = Object.values(userBeforeL.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);
  const partnerUnfilledBefore = Object.values(partnerBeforeL.unfilledDedicated).reduce((s, n) => s + (n ?? 0), 0);

  if (userUnfilledAfter > userUnfilledBefore) return { candidate: null, rejectedByRationality: false };
  if (TRADE_FINDER_REJECT.partnerUnfilledStarter && partnerUnfilledAfter > partnerUnfilledBefore) {
    return { candidate: null, rejectedByRationality: false };
  }

  const userUsesPts = userBeforeL.usesRealProjections && userAfterL.usesRealProjections;
  const partnerUsesPts = partnerBeforeL.usesRealProjections && partnerAfterL.usesRealProjections;
  const userDelta = round1((userAfterL.starterPoints ?? 0) - (userBeforeL.starterPoints ?? 0));
  const partnerDelta = round1((partnerAfterL.starterPoints ?? 0) - (partnerBeforeL.starterPoints ?? 0));

  if (userDelta < -TRADE_FINDER_REJECT.userLineupDropPpg) {
    return { candidate: null, rejectedByRationality: false };
  }
  if (!receiveHitsFormalNeed(user, gen.receive) && userDelta <= 0) {
    return { candidate: null, rejectedByRationality: false };
  }

  const userDepth = depthDamage(user, userAfter, league.slots, gen.give);
  const partnerDepth = depthDamage(gen.partner, partnerAfter, league.slots, gen.receive);
  if (userDepth >= 1) return { candidate: null, rejectedByRationality: false };
  if (partnerDepth >= 1) return { candidate: null, rejectedByRationality: false };

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
  if (rationality.label === "POOR") {
    return { candidate: null, rejectedByRationality: true };
  }

  const userGainNorm = clamp(userDelta / 8 + 0.35 * clamp((receiveValue - giveValue) / Math.max(giveValue, 1), -1, 1), 0, 1);
  const partnerGainNorm = clamp(partnerDelta / 8 + 0.35 * clamp((giveValue - receiveValue) / Math.max(receiveValue, 1), -1, 1), 0, 1);
  const fairnessNorm = 1 - clamp(Math.abs(cmp.gainRatioA - 1) / 0.35, 0, 1);
  const depthNorm = 1 - 0.5 * userDepth - 0.5 * partnerDepth;

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

  if (filters.risk === "conservative") {
    if (fairness === "AGGRESSIVE ASK") return { candidate: null, rejectedByRationality: false };
    if (partnerGainNorm < 0.12) return { candidate: null, rejectedByRationality: false };
  }

  const tradeFit = tradeFitLabel({
    score: tradeScore,
    fairness,
    partnerGain: partnerGainNorm,
    userGain: userGainNorm,
    userDelta,
    partnerDelta,
    rationality: rationality.label,
  });
  if (tradeFit === "STRONG FIT" && rationality.label === "MARGINAL") {
    return { candidate: null, rejectedByRationality: true };
  }
  if (tradeFit === "LONG SHOT" && filters.risk !== "aggressive") {
    if (fairness !== "BALANCED" && fairness !== "SLIGHT EDGE THEM" && fairness !== "SLIGHT EDGE YOU") {
      return { candidate: null, rejectedByRationality: false };
    }
  }

  return {
    rejectedByRationality: false,
    candidate: {
      partnerTeamId: gen.partner.teamId,
      partnerName: gen.partner.displayName,
      youGive: gen.give.map(toSideAsset),
      youReceive: gen.receive.map(toSideAsset),
      shape: gen.shape,
      tradeScore,
      tradeFit,
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
      whyThisWorks: deterministicWhy({ user, partner: gen.partner, give: gen.give, receive: gen.receive, fairness, userDelta, partnerDelta }),
      riskWatchout: deterministicRisk({ user, give: gen.give, userDepth, userDelta }),
      yourImpact: impactBlurb("you", userDelta, userUsesPts, gen.receive, user),
      theirImpact: impactBlurb("them", partnerDelta, partnerUsesPts, gen.give, gen.partner),
      whyAi: null,
      riskAi: null,
    },
  };
}

export function rankScored(scored: TradeFinderCandidate[]): TradeFinderCandidate[] {
  return [...scored].sort((a, b) => {
    const aMutual = (a.userLineupDelta ?? 0) > 0 && (a.partnerLineupDelta ?? 0) >= 0 ? 1 : 0;
    const bMutual = (b.userLineupDelta ?? 0) > 0 && (b.partnerLineupDelta ?? 0) >= 0 ? 1 : 0;
    if (bMutual !== aMutual) return bMutual - aMutual;
    const aNonNeg = (a.partnerLineupDelta ?? 0) >= 0 ? 1 : 0;
    const bNonNeg = (b.partnerLineupDelta ?? 0) >= 0 ? 1 : 0;
    if (bNonNeg !== aNonNeg) return bNonNeg - aNonNeg;
    const rat = partnerRationalityRank(b.partnerRationality) - partnerRationalityRank(a.partnerRationality);
    if (rat !== 0) return rat;
    if (b.tradeScore !== a.tradeScore) return b.tradeScore - a.tradeScore;
    if (b.gainRatioUser !== a.gainRatioUser) return b.gainRatioUser - a.gainRatioUser;
    const aIds = a.youGive.map((x) => x.assetId).join(",") + a.youReceive.map((x) => x.assetId).join(",");
    const bIds = b.youGive.map((x) => x.assetId).join(",") + b.youReceive.map((x) => x.assetId).join(",");
    return aIds.localeCompare(bIds);
  });
}
