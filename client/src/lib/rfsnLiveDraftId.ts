/**
 * Canonical draft session id shared by Draft War Room and RFSN Live.
 *
 * Season resolution: prefer the highest synced league season from cache.
 * When no seasons are synced yet, fall back to the calendar year (v1 documented fallback).
 */
export function resolveLeagueDraftSeason(
  cachedSeasons: readonly number[] | null | undefined,
  now: Date = new Date(),
): number {
  if (cachedSeasons != null && cachedSeasons.length > 0) {
    const valid = cachedSeasons.filter((s) => Number.isFinite(s) && s > 0);
    if (valid.length > 0) return Math.max(...valid);
  }
  return now.getFullYear();
}

export function buildRfsnLiveDraftId(season: number): string {
  return `war-room-live-${season}`;
}

/** Shared draft id for War Room notify + RFSN Live polling from synced league seasons. */
export function buildRfsnLiveDraftIdFromLeague(
  cachedSeasons: readonly number[] | null | undefined,
  now?: Date,
): string {
  return buildRfsnLiveDraftId(resolveLeagueDraftSeason(cachedSeasons, now));
}
