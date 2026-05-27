/**
 * Title semantics: **championOwner** on `league_medals` only, **distinct seasons** per owner.
 * Ignores runner-up, third, standings, and `championships`.
 */

/** Single owner normalizer: trim, lowercase, strip punctuation → space, collapse spaces. No aliases. */
export function normalizeOwner(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MedalRow = {
  season: number;
  championOwner: string | null;
  runnerUpOwner: string | null;
  thirdPlaceOwner: string | null;
};

export type StandingsSeasonEntry = {
  finalStanding: number | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
};

export type StandingsOwnerRow = {
  ownerKey: string;
  displayName: string;
  /** Ignored for titles — use medal-derived counts only. */
  championships: number;
  seasons: Array<{ season: number; entry: StandingsSeasonEntry }>;
};

/** championOwner (normalized) → distinct seasons that owner won as champion */
export function buildChampionSeasonSetsByNormalizedName(medals: MedalRow[]): Map<string, Set<number>> {
  const map = new Map<string, Set<number>>();
  for (const m of medals) {
    const raw = m.championOwner?.trim();
    if (!raw) continue;
    const k = normalizeOwner(raw);
    if (!k) continue;
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(m.season);
  }
  return map;
}

function distinctSeasonsForOwner(
  championSets: Map<string, Set<number>>,
  ownerKey: string,
  displayName: string,
): number[] {
  const nk = normalizeOwner(ownerKey);
  const nd = normalizeOwner(displayName);
  const merged = new Set<number>();
  const a = championSets.get(nk);
  const b = championSets.get(nd);
  if (a) for (const s of a) merged.add(s);
  if (b) for (const s of b) merged.add(s);
  return [...merged].sort((x, y) => y - x);
}

/** Champion / runner-up / third display strings for one season — medals only (display, not for title counts). */
export function getMedalSpotlightsForSeason(medals: MedalRow[], season: number): {
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
} {
  const row = medals.find((m) => m.season === season);
  return {
    champion: row?.championOwner?.trim() || null,
    runnerUp: row?.runnerUpOwner?.trim() || null,
    third: row?.thirdPlaceOwner?.trim() || null,
  };
}

export type OwnerWithMedalTitles = StandingsOwnerRow & {
  titleCount: number;
  titleSeasons: number[];
};

export function mergeMedalsIntoOwners(rawOwners: StandingsOwnerRow[], medals: MedalRow[]): OwnerWithMedalTitles[] {
  const championSets = buildChampionSeasonSetsByNormalizedName(medals);
  return rawOwners.map((o) => {
    const titleSeasons = distinctSeasonsForOwner(championSets, o.ownerKey, o.displayName);
    return {
      ...o,
      titleCount: titleSeasons.length,
      titleSeasons,
    };
  });
}
