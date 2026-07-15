import { normalizeGradePos } from "./formatProfile";
import type { FormatProfile, GradePick, GradePos } from "./types";

export function emptyCounts(): Record<GradePos, number> {
  return { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0, DP: 0 };
}

export function countRoster(
  picks: readonly GradePick[],
  profile: FormatProfile,
): Record<GradePos, number> {
  const counts = emptyCounts();
  for (const p of picks) {
    if (p.isKeeper && !profile.keepersOccupySlots) continue;
    const pos = normalizeGradePos(p.position);
    if (!pos || pos === "FLEX") continue;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts;
}

export type StarterFillReport = {
  required: number;
  filled: number;
  coreVacancies: number;
  kVacant: boolean;
  defenseVacant: boolean;
  vacantCoreLabels: string[];
};

/**
 * Greedy assign drafted skill players into required starter slots.
 */
export function evaluateStarterFill(
  counts: Record<GradePos, number>,
  profile: FormatProfile,
  opts: { kDue: boolean; dstDue: boolean },
): StarterFillReport {
  const avail = { ...counts };
  let filled = 0;
  let required = 0;
  let coreVacancies = 0;
  const vacantCoreLabels: string[] = [];

  const take = (pos: GradePos, n: number, core: boolean) => {
    for (let i = 0; i < n; i++) {
      required += 1;
      if ((avail[pos] ?? 0) > 0) {
        avail[pos]! -= 1;
        filled += 1;
      } else if (core) {
        coreVacancies += 1;
        vacantCoreLabels.push(pos);
      } else {
        // non-core shortfall still counts as unfilled required
      }
    }
  };

  const qbNeeded =
    profile.qbMode === "one_qb"
      ? profile.starters.QB
      : Math.max(profile.starters.QB, profile.starters.QB + profile.superflexSlots);

  take("QB", qbNeeded, true);
  take("RB", profile.starters.RB, true);
  take("WR", profile.starters.WR, true);
  take("TE", profile.starters.TE, true);

  // FLEX from remaining eligible
  for (let i = 0; i < profile.starters.FLEX; i++) {
    required += 1;
    const elig = profile.flexEligibility;
    let got = false;
    for (const pos of elig) {
      if ((avail[pos] ?? 0) > 0) {
        avail[pos]! -= 1;
        filled += 1;
        got = true;
        break;
      }
    }
    if (!got) {
      coreVacancies += 1;
      vacantCoreLabels.push("FLEX");
    }
  }

  let kVacant = false;
  if (profile.starters.K > 0) {
    if (opts.kDue) {
      take("K", profile.starters.K, false);
      kVacant = (counts.K ?? 0) < profile.starters.K;
      if (kVacant) {
        // take() already counted required; adjust filled if short
      }
    } else {
      // treat as filled for StarterFill before due
      required += profile.starters.K;
      filled += profile.starters.K;
    }
  }

  let defenseVacant = false;
  if (profile.defenseKey === "DEF" && profile.starters.DEF > 0) {
    if (opts.dstDue) {
      const need = profile.starters.DEF;
      required += need;
      const have = counts.DEF ?? 0;
      const use = Math.min(need, have);
      filled += use;
      defenseVacant = have < need;
    } else {
      required += profile.starters.DEF;
      filled += profile.starters.DEF;
    }
  }
  if (profile.defenseKey === "DP" && profile.starters.DP > 0) {
    if (opts.dstDue) {
      const need = profile.starters.DP;
      required += need;
      const have = counts.DP ?? 0;
      const use = Math.min(need, have);
      filled += use;
      defenseVacant = have < need;
    } else {
      required += profile.starters.DP;
      filled += profile.starters.DP;
    }
  }

  return {
    required: Math.max(1, required),
    filled: Math.min(filled, Math.max(1, required)),
    coreVacancies,
    kVacant,
    defenseVacant,
    vacantCoreLabels,
  };
}

export function openStarterNeeds(
  counts: Record<GradePos, number>,
  profile: FormatProfile,
  opts: { kDue: boolean; dstDue: boolean },
): GradePos[] {
  const fill = evaluateStarterFill(counts, profile, opts);
  const open: GradePos[] = [];
  // Recompute by simulating shortages against needPriority
  const sim = { ...counts };
  const needLeft: Partial<Record<GradePos, number>> = {
    QB:
      profile.qbMode === "one_qb"
        ? profile.starters.QB
        : Math.max(profile.starters.QB, 1 + profile.superflexSlots),
    RB: profile.starters.RB,
    WR: profile.starters.WR,
    TE: profile.starters.TE,
    FLEX: profile.starters.FLEX,
    K: opts.kDue ? profile.starters.K : 0,
    DEF: opts.dstDue && profile.defenseKey === "DEF" ? profile.starters.DEF : 0,
    DP: opts.dstDue && profile.defenseKey === "DP" ? profile.starters.DP : 0,
  };

  for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF", "DP"] as GradePos[]) {
    const need = needLeft[pos] ?? 0;
    const have = sim[pos] ?? 0;
    const use = Math.min(need, have);
    sim[pos] = have - use;
    needLeft[pos] = need - use;
  }
  // FLEX
  let flexNeed = needLeft.FLEX ?? 0;
  for (const pos of profile.flexEligibility) {
    while (flexNeed > 0 && (sim[pos] ?? 0) > 0) {
      sim[pos]! -= 1;
      flexNeed -= 1;
    }
  }
  needLeft.FLEX = flexNeed;

  for (const pos of profile.needPriority) {
    if ((needLeft[pos] ?? 0) > 0) open.push(pos);
  }
  void fill;
  return open;
}

export function priorityDistance(
  pickPos: GradePos,
  top: GradePos,
  priority: readonly GradePos[],
): number {
  const a = priority.indexOf(pickPos);
  const b = priority.indexOf(top);
  if (b < 0) return 0;
  if (a < 0) return Math.max(1, priority.length - b);
  return Math.abs(a - b);
}
