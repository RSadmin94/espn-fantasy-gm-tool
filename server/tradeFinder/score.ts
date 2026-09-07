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
import { toSideAsset, isCanonicalDuplicateSafe } from "./generate";
import { clamp, round1 } from "./positions";
import { behaviorFitForTrade } from "./behavior";
import { deterministicWhy, deterministicRisk, impactBlurb } from "./explain";

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

function fitLabel(args: {
  score: number;
  fairness: FairnessBand;
  partnerGain: number;
  userGain: number;
}): TradeFitLabel {
  if (args.fairness === "UNREALISTIC") return "LONG SHOT";
  if (args.fairness === "AGGRESSIVE ASK" && args.partnerGain < 0.15) return "LONG SHOT";
  if (args.fairness === "AGGRESSIVE ASK") return "AGGRESSIVE";
  if (args.score >= 62 && args.partnerGain >= 0.25 && args.userGain >= 0.25) return "STRONG FIT";
  if (args.score >= 50 && args.partnerGain >= 0.15) return "GOOD FIT";
  if (args.fairness === "BALANCED" || args.fairness === "SLIGHT EDGE THEM") return "BALANCED";
  if (args.userGain > args.partnerGain + 0.2) return "AGGRESSIVE";
  return "LONG SHOT";
}

function maxNeedOf(team: TradeFinderTeam, assets: TradeFinderAsset[]): number {
  const m = needMap(team);
  let max = 0;
  for (const a of assets) {
    if (a.kind === "pick") continue;
    const n = m.get(a.position as TradePosition);
    if (n) max = Math.max(max, n.needScore);
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

export function scoreCandidate(
  league: TradeFinderLeague,
  user: TradeFinderTeam,
  gen: GeneratedTrade,
  filters: TradeFinderFilters,
): TradeFinderCandidate | null {
  if (!isCanonicalDuplicateSafe(gen.give, gen.receive)) return null;

  const giveValue = gen.give.reduce((s, a) => s + a.tradeValue, 0);
  const receiveValue = gen.receive.reduce((s, a) => s + a.tradeValue, 0);
  const cmp = compareGivenSideTotals(
    giveValue,
    receiveValue,
    Math.round(50 * PICK_TO_MARKET_SCALE),
  );
  const fairnessGrade = cmp.fairnessGrade || fairnessGradeFromGainRatio(cmp.gainRatioA);
  const fairness = fairnessBandFromGrade(fairnessGrade, cmp.gainRatioA);
  if (fairness === "UNREALISTIC") return null;

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

  if (userUnfilledAfter > userUnfilledBefore) return null;
  if (TRADE_FINDER_REJECT.partnerUnfilledStarter && partnerUnfilledAfter > partnerUnfilledBefore) return null;

  const userUsesPts = userBeforeL.usesRealProjections && userAfterL.usesRealProjections;
  const partnerUsesPts = partnerBeforeL.usesRealProjections && partnerAfterL.usesRealProjections;
  const userDelta = userUsesPts
    ? round1((userAfterL.starterPoints ?? 0) - (userBeforeL.starterPoints ?? 0))
    : round1((userAfterL.starterPoints ?? 0) - (userBeforeL.starterPoints ?? 0));
  const partnerDelta = partnerUsesPts
    ? round1((partnerAfterL.starterPoints ?? 0) - (partnerBeforeL.starterPoints ?? 0))
    : round1((partnerAfterL.starterPoints ?? 0) - (partnerBeforeL.starterPoints ?? 0));

  if (userDelta < -TRADE_FINDER_REJECT.userLineupDropPpg) return null;

  const userDepth = depthDamage(user, userAfter, league.slots, gen.give);
  const partnerDepth = depthDamage(gen.partner, partnerAfter, league.slots, gen.receive);
  if (userDepth >= 1) return null;
  if (partnerDepth >= 1) return null;

  const userNeedFit = maxNeedOf(user, gen.receive) / 100;
  const partnerNeedFit = maxNeedOf(gen.partner, gen.give) / 100;
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
    if (fairness === "AGGRESSIVE ASK") return null;
    if (partnerGainNorm < 0.12) return null;
  }

  const tradeFit = fitLabel({
    score: tradeScore,
    fairness,
    partnerGain: partnerGainNorm,
    userGain: userGainNorm,
  });
  if (tradeFit === "LONG SHOT" && filters.risk !== "aggressive") {
    if (fairness !== "BALANCED" && fairness !== "SLIGHT EDGE THEM" && fairness !== "SLIGHT EDGE YOU") {
      return null;
    }
  }

  return {
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
    userLineupDelta: userUsesPts ? userDelta : userDelta,
    partnerLineupDelta: partnerUsesPts ? partnerDelta : partnerDelta,
    userNeedFit: round1(userNeedFit * 100),
    partnerNeedFit: round1(partnerNeedFit * 100),
    userDepthDamage: round1(userDepth),
    partnerDepthDamage: round1(partnerDepth),
    behaviorFit: behavior.fit,
    behaviorNote: behavior.note,
    whyThisWorks: deterministicWhy({ user, partner: gen.partner, give: gen.give, receive: gen.receive, fairness, userDelta, partnerDelta }),
    riskWatchout: deterministicRisk({ user, give: gen.give, userDepth, userDelta }),
    yourImpact: impactBlurb("you", userDelta, userUsesPts, gen.receive, user),
    theirImpact: impactBlurb("them", partnerDelta, partnerUsesPts, gen.give, gen.partner),
    whyAi: null,
    riskAi: null,
  };
}

export function rankScored(scored: TradeFinderCandidate[]): TradeFinderCandidate[] {
  return [...scored].sort((a, b) => {
    if (b.tradeScore !== a.tradeScore) return b.tradeScore - a.tradeScore;
    if (b.gainRatioUser !== a.gainRatioUser) return b.gainRatioUser - a.gainRatioUser;
    const aIds = a.youGive.map((x) => x.assetId).join(",") + a.youReceive.map((x) => x.assetId).join(",");
    const bIds = b.youGive.map((x) => x.assetId).join(",") + b.youReceive.map((x) => x.assetId).join(",");
    return aIds.localeCompare(bIds);
  });
}
