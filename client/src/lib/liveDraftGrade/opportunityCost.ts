import type { GradeConfig } from "./gradeConfig";
import { normalizeGradePos } from "./formatProfile";
import { openStarterNeeds, priorityDistance } from "./rosterMath";
import type { FormatProfile, GradePick, GradePos } from "./types";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function opportunityUrgency(progress: number, cfg: GradeConfig): number {
  const o = cfg.opportunityCost;
  const t = clamp(
    (progress - o.urgencyStartProgress) / Math.max(1e-9, o.urgencyRampSpan),
    0,
    1,
  );
  return o.urgencyMin + (o.urgencyMax - o.urgencyMin) * t;
}

/**
 * OC for a single pick given roster counts BEFORE the pick lands.
 */
export function scorePickOpportunityCost(args: {
  pick: GradePick;
  countsBefore: Record<GradePos, number>;
  profile: FormatProfile;
  progress: number;
  cfg: GradeConfig;
  /** True when all starter-tier needs already filled before this pick */
  startersAlreadyFilled: boolean;
}): number {
  const { pick, countsBefore, profile, progress, cfg } = args;
  if (pick.isKeeper) return 0;
  const pos = normalizeGradePos(pick.position);
  if (!pos) return 0;

  const kDue = progress >= cfg.floors.kDueProgress;
  const dstDue = progress >= cfg.floors.dstDueProgress;
  const open = openStarterNeeds(countsBefore, profile, { kDue, dstDue });
  if (open.length === 0) return 0;

  const top = open[0]!;
  const band = profile.needPriority;
  const topIdx = band.indexOf(top);
  const pickIdx = band.indexOf(pos);

  // First QB in a 1QB league is a normal starter — never OC.
  if (
    profile.qbMode === "one_qb" &&
    pos === "QB" &&
    (countsBefore.QB ?? 0) === 0
  ) {
    return 0;
  }

  if (pos === top) return 0;
  // FLEX fill from eligible skill
  if (top === "FLEX" && profile.flexEligibility.includes(pos as "RB" | "WR" | "TE" | "QB")) {
    return 0;
  }
  // Adjacent-band relief only among skill needs (RB/WR/TE/FLEX) — never shields
  // QB/K/DEF while a skill starter remains open.
  const skill = new Set(["RB", "WR", "TE", "FLEX"]);
  if (
    skill.has(pos) &&
    skill.has(top) &&
    pickIdx >= 0 &&
    topIdx >= 0 &&
    Math.abs(pickIdx - topIdx) <= 1
  ) {
    return 0;
  }

  let waste =
    cfg.opportunityCost.wasteBase + priorityDistance(pos, top, band);
  const soft = profile.softCap[pos];
  const hard = profile.hardCap[pos];
  const have = countsBefore[pos] ?? 0;
  if (soft != null && have >= soft) waste += cfg.opportunityCost.softCapWasteBonus;
  if (hard != null && have >= hard) waste += cfg.opportunityCost.hardCapWasteBonus;

  if (
    profile.scoringHints.isBestBall &&
    args.startersAlreadyFilled &&
    (pos === "RB" || pos === "WR" || pos === "TE")
  ) {
    waste = Math.max(1, waste - cfg.opportunityCost.bestBallWasteRelief);
  }

  const urgency = opportunityUrgency(progress, cfg);
  const raw = Math.round(cfg.opportunityCost.wasteScale * waste * urgency);
  return Math.min(cfg.opportunityCost.maxPerPick, raw);
}

export function accumulateOpportunityCost(
  picksChronological: readonly GradePick[],
  profile: FormatProfile,
  totalNonKeeperPicks: number,
  cfg: GradeConfig,
): { sum: number; penalty: number; lastPickOc: number; perPick: number[] } {
  const counts: Record<GradePos, number> = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    FLEX: 0,
    K: 0,
    DEF: 0,
    DP: 0,
  };
  const perPick: number[] = [];
  let sum = 0;
  let lastPickOc = 0;
  const total = Math.max(1, totalNonKeeperPicks);

  for (const pick of picksChronological) {
    const progress = Number(pick.pickNumber) / total;
    const kDue = progress >= cfg.floors.kDueProgress;
    const dstDue = progress >= cfg.floors.dstDueProgress;
    const openBefore = openStarterNeeds(counts, profile, { kDue, dstDue });
    const oc = scorePickOpportunityCost({
      pick,
      countsBefore: { ...counts },
      profile,
      progress,
      cfg,
      startersAlreadyFilled: openBefore.length === 0,
    });
    perPick.push(oc);
    sum += oc;
    lastPickOc = oc;
    if (!pick.isKeeper || profile.keepersOccupySlots) {
      const pos = normalizeGradePos(pick.position);
      if (pos && pos !== "FLEX") counts[pos] = (counts[pos] ?? 0) + 1;
    }
  }

  return {
    sum,
    penalty: Math.min(cfg.opportunityCost.teamCap, sum),
    lastPickOc,
    perPick,
  };
}
