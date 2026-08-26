export type DatePreset =
  | "today"
  | "last_7"
  | "last_30"
  | "mtd"
  | "previous_month"
  | "custom";

export type ResolvedDateRange = {
  preset: DatePreset;
  start: Date;
  end: Date;
  /** Inclusive calendar day count in the selected range. */
  dayCount: number;
  label: string;
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function addUtcDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function inclusiveDayCount(start: Date, end: Date): number {
  const a = startOfUtcDay(start).getTime();
  const b = startOfUtcDay(end).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function resolveDateRange(opts: {
  preset: DatePreset;
  start?: string | Date | null;
  end?: string | Date | null;
  now?: Date;
}): ResolvedDateRange {
  const now = opts.now ?? new Date();
  const todayStart = startOfUtcDay(now);
  const todayEnd = endOfUtcDay(now);

  if (opts.preset === "today") {
    return { preset: "today", start: todayStart, end: todayEnd, dayCount: 1, label: "Today" };
  }
  if (opts.preset === "last_7") {
    const start = addUtcDays(todayStart, -6);
    return { preset: "last_7", start, end: todayEnd, dayCount: 7, label: "Last 7 Days" };
  }
  if (opts.preset === "last_30") {
    const start = addUtcDays(todayStart, -29);
    return { preset: "last_30", start, end: todayEnd, dayCount: 30, label: "Last 30 Days" };
  }
  if (opts.preset === "mtd") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    return {
      preset: "mtd",
      start,
      end: todayEnd,
      dayCount: inclusiveDayCount(start, todayEnd),
      label: "Month to Date",
    };
  }
  if (opts.preset === "previous_month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
    return {
      preset: "previous_month",
      start,
      end,
      dayCount: inclusiveDayCount(start, end),
      label: "Previous Month",
    };
  }

  const startRaw = opts.start ? new Date(opts.start) : addUtcDays(todayStart, -29);
  const endRaw = opts.end ? new Date(opts.end) : now;
  const start = startOfUtcDay(Number.isNaN(startRaw.getTime()) ? todayStart : startRaw);
  let end = endOfUtcDay(Number.isNaN(endRaw.getTime()) ? now : endRaw);
  if (end < start) end = endOfUtcDay(start);
  return {
    preset: "custom",
    start,
    end,
    dayCount: inclusiveDayCount(start, end),
    label: "Custom Range",
  };
}

/** Equivalent previous window of the same length, ending the day before `range.start`. */
export function previousEquivalentRange(range: ResolvedDateRange): { start: Date; end: Date } {
  const prevEnd = new Date(range.start.getTime() - 1);
  const prevStart = addUtcDays(startOfUtcDay(prevEnd), -(range.dayCount - 1));
  return { start: startOfUtcDay(prevStart), end: endOfUtcDay(prevEnd) };
}

export function monthBounds(now = new Date()): { start: Date; end: Date; daysElapsed: number; daysInMonth: number } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const daysInMonth = lastDay.getUTCDate();
  const today = startOfUtcDay(now);
  const daysElapsed = Math.min(daysInMonth, inclusiveDayCount(start, today));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end, daysElapsed, daysInMonth };
}
