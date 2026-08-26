import { monthBounds } from "./dateRange";

export type BudgetHealth = {
  monthlyBudgetUsd: number | null;
  mtdActualUsd: number;
  remainingUsd: number | null;
  percentUsed: number | null;
  projectedMonthEndUsd: number;
  projectedOverUnderUsd: number | null;
  daysElapsed: number;
  daysInMonth: number;
};

/**
 * Month-to-date daily run rate → projected calendar-month spend.
 * Uses elapsed UTC days in the current month, including today.
 */
export function projectMonthlySpend(mtdActualUsd: number, now = new Date()): {
  projectedMonthEndUsd: number;
  daysElapsed: number;
  daysInMonth: number;
  dailyRunRate: number;
} {
  const { daysElapsed, daysInMonth } = monthBounds(now);
  const dailyRunRate = daysElapsed > 0 ? mtdActualUsd / daysElapsed : 0;
  return {
    projectedMonthEndUsd: dailyRunRate * daysInMonth,
    daysElapsed,
    daysInMonth,
    dailyRunRate,
  };
}

export function computeBudgetHealth(opts: {
  monthlyBudgetUsd: number | null;
  mtdActualUsd: number;
  now?: Date;
}): BudgetHealth {
  const now = opts.now ?? new Date();
  const proj = projectMonthlySpend(opts.mtdActualUsd, now);
  const budget = opts.monthlyBudgetUsd;
  const remaining = budget == null ? null : budget - opts.mtdActualUsd;
  const percentUsed = budget != null && budget > 0 ? (opts.mtdActualUsd / budget) * 100 : null;
  const projectedOverUnder = budget == null ? null : budget - proj.projectedMonthEndUsd;
  return {
    monthlyBudgetUsd: budget,
    mtdActualUsd: opts.mtdActualUsd,
    remainingUsd: remaining,
    percentUsed,
    projectedMonthEndUsd: proj.projectedMonthEndUsd,
    projectedOverUnderUsd: projectedOverUnder,
    daysElapsed: proj.daysElapsed,
    daysInMonth: proj.daysInMonth,
  };
}

export function periodDelta(current: number, previous: number | null): {
  previous: number | null;
  deltaPct: number | null;
} {
  if (previous == null || !Number.isFinite(previous)) {
    return { previous: null, deltaPct: null };
  }
  if (previous === 0) {
    return { previous, deltaPct: current === 0 ? 0 : null };
  }
  return { previous, deltaPct: ((current - previous) / previous) * 100 };
}
