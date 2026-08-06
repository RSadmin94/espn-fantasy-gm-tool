/**
 * Default rivalry UI: current-season managers plus recent or titled alumni.
 * Historical view bypasses this filter ("Include Historical Owners").
 */
export type RivalryOwnerEligibilityRow = {
  ownerKey: string;
  seasons: number[];
  championships: number;
};

/** Seasons since last team row must be ≤3 (covers the last 4 seasons, anchor inclusive). */
const RECENT_SEASON_SPAN = 3;

/**
 * Eligible for default rivalry surfaces if any:
 * - has a team in `currentSeason`, or
 * - last `gmTeams` season year ≥ `currentSeason - 3` (active in last 4 seasons), or
 * - at least one league championship on record.
 */
export function buildDefaultRivalryEligibleOwnerKeys(
  owners: RivalryOwnerEligibilityRow[],
  currentSeason: number,
): string[] {
  const anchor = Math.floor(Number(currentSeason));
  if (!Number.isFinite(anchor) || anchor <= 0) return [];
  const minLastSeason = anchor - RECENT_SEASON_SPAN;
  const out = new Set<string>();

  for (const o of owners) {
    const key = String(o.ownerKey ?? "").trim();
    if (!key) continue;
    const seasons = Array.isArray(o.seasons) ? o.seasons.map((s) => Math.floor(Number(s))).filter((n) => n > 0) : [];
    const titles = Math.max(0, Math.floor(Number(o.championships ?? 0)));
    const last = seasons.length > 0 ? Math.max(...seasons) : Number.NEGATIVE_INFINITY;
    const inCurrent = seasons.includes(anchor);
    const recentEnough = Number.isFinite(last) && last >= minLastSeason;
    if (inCurrent || recentEnough || titles >= 1) out.add(key);
  }
  return [...out];
}

/**
 * Owners with a franchise in the current season only (strict active roster).
 * Used for Current Rival / Biggest Threat — not the looser Rivalry Center default set.
 */
export function buildCurrentSeasonOwnerKeys(
  owners: RivalryOwnerEligibilityRow[],
  currentSeason: number,
): string[] {
  const anchor = Math.floor(Number(currentSeason));
  if (!Number.isFinite(anchor) || anchor <= 0) return [];
  const out: string[] = [];
  for (const o of owners) {
    const key = String(o.ownerKey ?? "").trim();
    if (!key) continue;
    const seasons = Array.isArray(o.seasons)
      ? o.seasons.map((s) => Math.floor(Number(s))).filter((n) => n > 0)
      : [];
    if (seasons.includes(anchor)) out.push(key);
  }
  return out;
}

/** Lowercased display names for owners with a team in `currentSeason`. */
export function buildCurrentSeasonOwnerNames(
  owners: Array<{ ownerName?: string; seasons?: number[] }>,
  currentSeason: number,
): string[] {
  const anchor = Math.floor(Number(currentSeason));
  if (!Number.isFinite(anchor) || anchor <= 0) return [];
  const out: string[] = [];
  for (const o of owners) {
    const name = String(o.ownerName ?? "").trim();
    if (!name) continue;
    const seasons = Array.isArray(o.seasons)
      ? o.seasons.map((s) => Math.floor(Number(s))).filter((n) => n > 0)
      : [];
    if (seasons.includes(anchor)) out.push(name.toLowerCase());
  }
  return out;
}
