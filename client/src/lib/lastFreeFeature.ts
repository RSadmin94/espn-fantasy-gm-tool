/** Slug of the last free-gated feature the user viewed (session-scoped). No PII. */
const STORAGE_KEY = "ffr_last_free_feature";

export type LastFreeFeatureSlug =
  | "rivalry_wall"
  | "league_dna"
  | "why_havent_i_won"
  | "hall_of_fame"
  | "owner_profile"
  | "championship_path"
  | "acquisition_impact";

export function setLastFreeFeature(slug: LastFreeFeatureSlug): void {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(STORAGE_KEY, slug);
  } catch {
    /* storage blocked */
  }
}

export function getLastFreeFeature(): LastFreeFeatureSlug | null {
  try {
    if (typeof window === "undefined") return null;
    const v = sessionStorage.getItem(STORAGE_KEY);
    return v as LastFreeFeatureSlug | null;
  } catch {
    return null;
  }
}

/** One wall_viewed per browser tab session (not per React render). */
const WALL_VIEWED_KEY = "ffr_funnel_wall_viewed";

export function markWallViewedRecorded(): void {
  try {
    sessionStorage.setItem(WALL_VIEWED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasWallViewedRecorded(): boolean {
  try {
    return sessionStorage.getItem(WALL_VIEWED_KEY) === "1";
  } catch {
    return false;
  }
}
