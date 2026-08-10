/**
 * RFSN-054B desktop accessibility floors. Prefer these over raw text-[8px]/[9px]/[10px]/[11px].
 *
 * 12px (`text-2xs`) — tiny metadata, uppercase badges / kickers only.
 * 13px (`text-label`) — labels, table headers, secondary stats.
 * 14px (`text-caption`) — secondary body and help text.
 * 15px (`TYPE_SECTION`) — section titles. Page titles and large metrics stay unchanged.
 */
export const TYPE_BADGE = "text-2xs font-semibold tracking-wide";
export const TYPE_KICKER = "text-2xs font-semibold uppercase tracking-wide text-ink-tertiary";
export const TYPE_META = "text-label font-medium leading-snug";
export const TYPE_CAPTION = "text-caption leading-relaxed";
export const TYPE_SECTION = "text-[15px] font-semibold leading-snug tracking-tight";
