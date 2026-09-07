/**
 * Partner-rationality gate (RFSN-061B).
 *
 * Fair market value is not enough. A recommendation must be understandable
 * for the other manager: lineup not materially harmed without a compensating
 * roster-construction benefit, and 2-for-1 extras must actually be usable.
 *
 * Does not change player tradeValue or fairness grades.
 */
import type {
  FairnessBand,
  LineupSnapshot,
  PartnerRationality,
  TradeFinderAsset,
  TradeFinderRosterSlots,
  TradeFinderTeam,
  TradePosition,
  TradeShape,
} from "./types";
import { TRADE_FINDER_RATIONALITY } from "./weights";
import { needMap } from "./needSurplus";
import { playableCountAt } from "./lineup";

export interface PartnerRationalityInput {
  partner: TradeFinderTeam;
  partnerIncoming: TradeFinderAsset[];
  partnerOutgoing: TradeFinderAsset[];
  partnerDelta: number;
  partnerNeedFit: number;
  partnerDepthDamage: number;
  partnerUnfilledBefore: number;
  partnerUnfilledAfter: number;
  partnerBeforeLineup: LineupSnapshot;
  partnerAfterLineup: LineupSnapshot;
  partnerReceiveValue: number;
  partnerGiveValue: number;
  fairness: FairnessBand;
  shape: TradeShape;
  slots: TradeFinderRosterSlots;
}

export interface PartnerRationalityResult {
  label: PartnerRationality;
  starterHoleFilled: boolean;
  severeNeedImproved: boolean;
  injuryExposureReduced: boolean;
  depthRepaired: boolean;
  valuePremium: boolean;
  usableIncoming: number;
  incomingCount: number;
  twoForOneClutter: boolean;
  hasStrongCompensator: boolean;
}

function incomingUsable(
  args: PartnerRationalityInput,
  asset: TradeFinderAsset,
): boolean {
  if (asset.kind === "pick") return true;
  if (args.partnerAfterLineup.starterIds.includes(asset.assetId)) return true;
  const n = needMap(args.partner).get(asset.position as TradePosition);
  if (n && (n.label === "NEED" || n.needScore >= TRADE_FINDER_RATIONALITY.needFloor)) return true;
  const dedicated = args.slots[asset.position as TradePosition] ?? 0;
  if (dedicated > 0) {
    const before = playableCountAt(args.partner.roster, asset.position as TradePosition);
    if (before < dedicated + 1) return true;
  }
  return false;
}

function severeNeedImproved(args: PartnerRationalityInput): boolean {
  const m = needMap(args.partner);
  return args.partnerIncoming.some((a) => {
    if (a.kind === "pick") return false;
    const n = m.get(a.position as TradePosition);
    if (!n || n.needScore < TRADE_FINDER_RATIONALITY.severeNeedScore) return false;
    if (n.label !== "NEED" && n.needScore < TRADE_FINDER_RATIONALITY.severeNeedScore) return false;
    return args.partnerAfterLineup.starterIds.includes(a.assetId) || n.label === "NEED";
  });
}

function injuryExposureReduced(args: PartnerRationalityInput): boolean {
  return args.partnerIncoming.some((incoming) => {
    if (incoming.kind !== "player" || incoming.unavailable) return false;
    const pos = incoming.position as TradePosition;
    const exposed = args.partner.roster.some(
      (a) =>
        a.kind === "player" &&
        a.position === pos &&
        a.unavailable &&
        (a.starter || args.partnerBeforeLineup.starterIds.includes(a.assetId)),
    );
    if (!exposed) return false;
    return args.partnerAfterLineup.starterIds.includes(incoming.assetId);
  });
}

function depthRepaired(args: PartnerRationalityInput): boolean {
  const m = needMap(args.partner);
  const afterRosterIds = new Set(args.partnerOutgoing.map((a) => a.assetId));
  const afterPlayable = args.partner.roster
    .filter((a) => !afterRosterIds.has(a.assetId))
    .concat(args.partnerIncoming);
  return args.partnerIncoming.some((a) => {
    if (a.kind === "pick") return false;
    const pos = a.position as TradePosition;
    const n = m.get(pos);
    if (!n || (n.label !== "NEED" && n.needScore < TRADE_FINDER_RATIONALITY.needFloor)) return false;
    const dedicated = args.slots[pos] ?? 0;
    if (dedicated <= 0) return false;
    const before = playableCountAt(args.partner.roster, pos);
    const after = playableCountAt(afterPlayable, pos);
    return before <= dedicated && after > before;
  });
}

export function partnerRationality(args: PartnerRationalityInput): PartnerRationalityResult {
  const incomingPlayers = args.partnerIncoming.filter((a) => a.kind === "player");
  const usableIncoming = args.partnerIncoming.filter((a) => incomingUsable(args, a)).length;
  const twoForOneClutter =
    args.shape === "2-for-1" && incomingPlayers.length >= 2 && usableIncoming < incomingPlayers.length;

  const starterHoleFilled = args.partnerUnfilledAfter < args.partnerUnfilledBefore;
  const severe = severeNeedImproved(args);
  const injury = injuryExposureReduced(args);
  const depth = depthRepaired(args);
  const valuePremium =
    args.partnerGiveValue > 0 &&
    args.partnerReceiveValue / args.partnerGiveValue >= TRADE_FINDER_RATIONALITY.valuePremiumRatio;

  const hasStrongCompensator = starterHoleFilled || severe || injury || depth || valuePremium;
  const delta = args.partnerDelta;
  const materialDrop = delta < -TRADE_FINDER_RATIONALITY.materialDropPpg;

  let label: PartnerRationality;
  if (materialDrop && !hasStrongCompensator) {
    label = "POOR";
  } else if (twoForOneClutter && delta < 0 && !hasStrongCompensator) {
    label = "POOR";
  } else if (delta >= 0.5 && !twoForOneClutter && (hasStrongCompensator || args.partnerNeedFit >= TRADE_FINDER_RATIONALITY.needFloor)) {
    label = "STRONG";
  } else if (delta >= 0 && !twoForOneClutter) {
    label = "GOOD";
  } else if (delta >= 0 && twoForOneClutter && hasStrongCompensator) {
    label = "GOOD";
  } else if (!materialDrop && hasStrongCompensator) {
    label = "GOOD";
  } else if (materialDrop && hasStrongCompensator) {
    label = "MARGINAL";
  } else if (delta < 0) {
    label = "MARGINAL";
  } else {
    label = "GOOD";
  }

  return {
    label,
    starterHoleFilled,
    severeNeedImproved: severe,
    injuryExposureReduced: injury,
    depthRepaired: depth,
    valuePremium,
    usableIncoming,
    incomingCount: args.partnerIncoming.length,
    twoForOneClutter,
    hasStrongCompensator,
  };
}

const RATIONALITY_RANK: Record<PartnerRationality, number> = {
  STRONG: 3,
  GOOD: 2,
  MARGINAL: 1,
  POOR: 0,
};

export function partnerRationalityRank(label: PartnerRationality): number {
  return RATIONALITY_RANK[label];
}
