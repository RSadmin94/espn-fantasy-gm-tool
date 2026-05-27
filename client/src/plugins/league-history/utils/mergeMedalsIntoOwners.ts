/**
 * Pure helpers: title **counts** and per-season medal strings from `league_medals` only.
 * Standings `championships` and `finalStanding` must not drive title semantics.
 */

export function normalizeOwnerForMatch(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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
  /** Intentionally ignored by the plugin for titles — use medal-derived counts only. */
  championships: number;
  seasons: Array<{ season: number; entry: StandingsSeasonEntry }>;
};

export function buildMedalTitleMaps(medals: MedalRow[]) {
  const titleCounts = new Map<string, number>();
  const titleSeasons = new Map<string, number[]>();
  for (const m of medals) {
    if (!m.championOwner) continue;
    const k = normalizeOwnerForMatch(m.championOwner);
    titleCounts.set(k, (titleCounts.get(k) ?? 0) + 1);
    const arr = titleSeasons.get(k) ?? [];
    arr.push(m.season);
    titleSeasons.set(k, arr);
  }
  for (const [, arr] of titleSeasons) {
    arr.sort((a, b) => b - a);
  }
  return { titleCounts, titleSeasons };
}

export function getTitleCountForOwner(
  ownerKey: string,
  displayName: string,
  titleCounts: Map<string, number>,
): number {
  return titleCounts.get(ownerKey) ?? titleCounts.get(normalizeOwnerForMatch(displayName)) ?? 0;
}

export function getTitleSeasonsForOwner(
  ownerKey: string,
  displayName: string,
  titleSeasons: Map<string, number[]>,
): number[] {
  return (
    titleSeasons.get(ownerKey) ?? titleSeasons.get(normalizeOwnerForMatch(displayName)) ?? []
  ).slice();
}

/** Champion / runner-up / third display strings for one season — medals only. */
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
  const { titleCounts, titleSeasons } = buildMedalTitleMaps(medals);
  return rawOwners.map((o) => ({
    ...o,
    titleCount: getTitleCountForOwner(o.ownerKey, o.displayName, titleCounts),
    titleSeasons: getTitleSeasonsForOwner(o.ownerKey, o.displayName, titleSeasons),
  }));
}
