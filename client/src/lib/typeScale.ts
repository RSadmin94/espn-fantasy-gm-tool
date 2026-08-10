/**
 * RFSN-054B/054C type scale. Prefer these over raw text-[8px]/[9px]/[10px]/[11px].
 *
 * 054C classifies each element — not a token bump:
 * 1. Already readable → leave alone.
 * 2. Too small (<12px, or 12px used as body) → increase size.
 * 3. Readable size but low contrast → keep size, raise contrast (ink-secondary).
 *
 * 12px (`text-2xs`) — badges / kickers.
 * 13px (`text-label`) — labels, table headers, secondary stats.
 * 14px (`text-caption`) — secondary body and help text.
 * 15px (`TYPE_SECTION`) — section titles. Page titles and large metrics stay unchanged.
 */
export const TYPE_BADGE = "text-2xs font-semibold tracking-wide";
export const TYPE_KICKER = "text-2xs font-semibold uppercase tracking-wide text-ink-secondary";
export const TYPE_META = "text-label font-medium leading-snug";
export const TYPE_CAPTION = "text-caption leading-relaxed";
export const TYPE_SECTION = "text-[15px] font-semibold leading-snug tracking-tight";
