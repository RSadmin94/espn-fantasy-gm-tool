/**
 * RFSN-051C readable floors. Prefer these over raw text-[8px]/[9px]/[10px].
 *
 * 11px (`text-2xs`) — uppercase badges / kickers only, weight 600+.
 * 12px (`text-label`) — metadata, stat labels, secondary facts.
 * 13px (`text-caption`) — secondary body and help text.
 */
export const TYPE_BADGE = "text-2xs font-semibold tracking-wide";
export const TYPE_KICKER = "text-2xs font-semibold uppercase tracking-wide text-ink-tertiary";
export const TYPE_META = "text-label font-medium leading-snug";
export const TYPE_CAPTION = "text-caption leading-relaxed";
