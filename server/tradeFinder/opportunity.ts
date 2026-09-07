/**
 * Opportunity classification + quality tier (RFSN-061C).
 *
 * Fairness remains the canonical value-split authority.
 * Opportunity answers: does this trade make sense given these rosters?
 */
import type {
  FairnessBand,
  OpportunityLabel,
  PartnerRationality,
  QualityTier,
  TradeFinderFilters,
  TradeResultGroup,
} from "./types";
import { TRADE_FINDER_RATIONALITY } from "./weights";
import { partnerRationalityRank } from "./partnerRationality";

export interface OpportunityInput {
  userDelta: number;
  partnerDelta: number;
  fairness: FairnessBand;
  rationality: PartnerRationality;
  userNeedFit: number;
  partnerNeedFit: number;
  gainRatioUser: number;
  userDepthDamage: number;
  targetHit: boolean;
  solvesSevereNeed: boolean;
  twoForOneClutter: boolean;
}

export function classifyOpportunity(a: OpportunityInput): OpportunityLabel {
  const userUp = a.userDelta > 0;
  const partnerNonNeg = a.partnerDelta >= 0;
  const ratGood = a.rationality === "STRONG" || a.rationality === "GOOD";
  const fairOk =
    a.fairness === "BALANCED" || a.fairness === "SLIGHT EDGE YOU" || a.fairness === "SLIGHT EDGE THEM";
  const solves = a.targetHit || a.solvesSevereNeed || a.userNeedFit >= TRADE_FINDER_RATIONALITY.needFloor;
  const overpay = a.gainRatioUser < 0.92;
  const userHurt = a.userDelta <= -TRADE_FINDER_RATIONALITY.materialDropPpg;
  const partnerWeak = a.rationality === "POOR" || (a.rationality === "MARGINAL" && a.partnerDelta < 0);

  if (userHurt && !solves) return "BAD DEAL FOR YOU";
  if (!userUp && overpay && !solves && a.userNeedFit < 25) return "BAD DEAL FOR YOU";

  if (solves && (overpay || a.userDelta <= 0 || a.userDepthDamage >= 0.4)) {
    return "NECESSITY TRADE";
  }

  if (userUp && partnerNonNeg && ratGood && fairOk && !a.twoForOneClutter) {
    if (a.rationality === "STRONG" && a.userDelta >= 1) return "STRONG FIT";
    return "GOOD FIT";
  }
  if (userUp && (ratGood || partnerNonNeg) && a.partnerDelta >= -1.5 && !partnerWeak) {
    return "GOOD FIT";
  }

  if (userUp && (a.fairness === "AGGRESSIVE ASK" || a.fairness === "SLIGHT EDGE YOU") && (partnerWeak || a.partnerDelta < 0)) {
    return "AGGRESSIVE ASK";
  }
  if (userUp && a.partnerDelta < 0 && a.partnerDelta >= -1.5) return "AGGRESSIVE ASK";

  if (userUp && partnerWeak) return "LONG SHOT";
  if (a.fairness === "UNREALISTIC" && userUp) return "LONG SHOT";
  if (!userUp && solves) return "NECESSITY TRADE";
  if (!userUp) return "BAD DEAL FOR YOU";
  return "LONG SHOT";
}

export function qualityTier(args: OpportunityInput & { opportunity: OpportunityLabel }): QualityTier {
  const { opportunity: opp, partnerDelta, rationality, twoForOneClutter } = args;
  if (opp === "STRONG FIT") return 1;
  if (opp === "GOOD FIT") {
    if (partnerDelta >= 0 && (rationality === "STRONG" || rationality === "GOOD") && !twoForOneClutter) return 1;
    return 2;
  }
  if (opp === "NECESSITY TRADE") return 3;
  if (opp === "AGGRESSIVE ASK") {
    if (partnerDelta >= -1.5 && rationality !== "POOR") return 2;
    return 4;
  }
  return 4;
}

export function resultGroup(tier: QualityTier): TradeResultGroup {
  return tier <= 2 ? "BEST AVAILABLE" : "MORE AGGRESSIVE OPTIONS";
}

export function opportunityCopy(args: {
  opportunity: OpportunityLabel;
  userDelta: number;
  partnerDelta: number;
  fairness: FairnessBand;
  giveNames: string;
  receiveNames: string;
  givePos: string;
  receivePos: string;
  partnerName: string;
  twoForOneClutter: boolean;
  targetHit: boolean;
}): {
  whyYouWouldDoIt: string;
  whyTheydConsider: string;
  theCost: string;
  rivalsVerdict: string;
} {
  const yourPts = `${args.userDelta >= 0 ? "+" : ""}${args.userDelta.toFixed(1)}`;
  const theirPts = `${args.partnerDelta >= 0 ? "+" : ""}${args.partnerDelta.toFixed(1)}`;
  const whyYouWouldDoIt = args.targetHit
    ? `You move ${args.giveNames} (${args.givePos}) for ${args.receiveNames} (${args.receivePos}) to address your target position. Lineup ${yourPts} PPG.`
    : `You move ${args.giveNames} (${args.givePos}) for ${args.receiveNames} (${args.receivePos}). Your lineup ${yourPts} PPG. Fairness: ${args.fairness}.`;

  const whyTheydConsider = args.twoForOneClutter
    ? `${args.partnerName} receives ${args.giveNames}, but at least one piece looks like bench clutter. Their lineup ${theirPts} PPG.`
    : `${args.partnerName} receives ${args.giveNames} (${args.givePos}). Their lineup ${theirPts} PPG.`;

  const theCost =
    args.userDelta < 0
      ? `You are sacrificing ${Math.abs(args.userDelta).toFixed(1)} starter PPG and may be thinning ${args.givePos} depth.`
      : args.fairness === "SLIGHT EDGE THEM" || args.fairness === "AGGRESSIVE ASK"
        ? `You may be giving more total trade value than you get back (${args.fairness}).`
        : `Watch remaining ${args.givePos} depth after moving ${args.giveNames}.`;

  let rivalsVerdict: string;
  switch (args.opportunity) {
    case "STRONG FIT":
      rivalsVerdict = "Both sides have a clear roster reason. This is a Rivals recommendation.";
      break;
    case "GOOD FIT":
      rivalsVerdict = "You improve, and the other manager has a credible roster reason to talk.";
      break;
    case "AGGRESSIVE ASK":
      rivalsVerdict = "This asks the other manager to give up more immediate lineup value.";
      break;
    case "NECESSITY TRADE":
      rivalsVerdict = "You are paying a premium because this solves a larger problem in your starting lineup.";
      break;
    case "LONG SHOT":
      rivalsVerdict =
        "This deal works much better for you than for them. It is a valid offer, but Rivals sees limited roster incentive for the other manager.";
      break;
    case "BAD DEAL FOR YOU":
      rivalsVerdict =
        "Rivals would not recommend this under normal circumstances. You are giving up more value than the roster improvement justifies.";
      break;
  }

  return { whyYouWouldDoIt, whyTheydConsider, theCost, rivalsVerdict };
}

export function compareCandidates(
  a: {
    qualityTier: QualityTier;
    targetSatisfied: boolean;
    userLineupDelta: number | null;
    partnerLineupDelta: number | null;
    partnerRationality: PartnerRationality;
    gainRatioUser: number;
    userDepthDamage: number;
    tradeScore: number;
    youGive: Array<{ assetId: string }>;
    youReceive: Array<{ assetId: string }>;
    opportunity: OpportunityLabel;
  },
  b: typeof a,
  filters: TradeFinderFilters,
): number {
  if (b.qualityTier !== a.qualityTier) return a.qualityTier - b.qualityTier;

  const approachBoost = (c: typeof a) => {
    if (filters.risk === "balanced") {
      if (c.targetSatisfied && (c.userLineupDelta ?? 0) > 0) return 2;
      if (c.opportunity === "NECESSITY TRADE") return 1;
    }
    if (filters.risk === "conservative" && c.qualityTier <= 2) return 1;
    return 0;
  };
  const boost = approachBoost(b) - approachBoost(a);
  if (boost !== 0) return boost;

  const tHit = Number(b.targetSatisfied) - Number(a.targetSatisfied);
  if (tHit !== 0) return tHit;

  const userD = (b.userLineupDelta ?? 0) - (a.userLineupDelta ?? 0);
  if (Math.abs(userD) > 0.05) return userD;

  const rat = partnerRationalityRank(b.partnerRationality) - partnerRationalityRank(a.partnerRationality);
  if (rat !== 0) return rat;

  const fair = Math.abs((a.gainRatioUser ?? 1) - 1) - Math.abs((b.gainRatioUser ?? 1) - 1);
  if (Math.abs(fair) > 0.01) return fair;

  const depth = a.userDepthDamage - b.userDepthDamage;
  if (Math.abs(depth) > 0.01) return depth;

  if (b.tradeScore !== a.tradeScore) return b.tradeScore - a.tradeScore;

  const aIds = a.youGive.map((x) => x.assetId).join(",") + a.youReceive.map((x) => x.assetId).join(",");
  const bIds = b.youGive.map((x) => x.assetId).join(",") + b.youReceive.map((x) => x.assetId).join(",");
  return aIds.localeCompare(bIds);
}

export function selectByTier<T extends { qualityTier: QualityTier; youGive: Array<{ assetId: string }>; youReceive: Array<{ assetId: string }>; partnerTeamId: number }>(
  ranked: T[],
  topN: number,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const keyOf = (t: T) =>
    `${t.partnerTeamId}|${t.youGive.map((x) => x.assetId).sort().join(",")}|${t.youReceive.map((x) => x.assetId).sort().join(",")}`;
  for (const tier of [1, 2, 3, 4] as QualityTier[]) {
    if (out.length >= topN) break;
    for (const c of ranked) {
      if (out.length >= topN) break;
      if (c.qualityTier !== tier) continue;
      const k = keyOf(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}
