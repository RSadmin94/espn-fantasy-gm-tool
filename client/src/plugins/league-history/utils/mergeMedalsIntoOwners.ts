/**
 * Title semantics: `league_medals.championOwner` is the **champion team name** (ESPN medal screen),
 * not an owner display name. Match medals to owners via per-season team rows, then credit distinct seasons.
 */

/** Team / medal name normalizer: trim, lowercase, punctuation → space, collapse spaces. */
export function normalizeTeamName(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mirrors server `normalizeOwnerStr` for keys on `leagueHistoryStandings` owners. */
export function standingsOwnerKey(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanOwnerDisplay(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\(+|\)+$/g, "")
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
  wins: number | null;
  losses: number | null;
  ties: number | null;
  pointsFor: number;
  pointsAgainst: number;
  recordBasis: "rs_matchups" | "pf_only";
};

export type StandingsOwnerRow = {
  ownerKey: string;
  displayName: string;
  /** Ignored for titles — use medal-derived counts only. */
  championships: number;
  seasons: Array<{ season: number; entry: StandingsSeasonEntry }>;
};

/** One team in one season — used to map medal team names → history owners. */
export type LeagueHistoryTeamSeasonRow = {
  season: number;
  teamName: string;
  ownerKey: string;
  displayName: string;
};

export type StandingsTeamInput = {
  teamName: string;
  owners: string[];
};

export function buildLeagueHistoryTeamSeasonRows(
  standingsBySeason: ReadonlyMap<number, readonly StandingsTeamInput[]>,
): LeagueHistoryTeamSeasonRow[] {
  const rows: LeagueHistoryTeamSeasonRow[] = [];
  for (const [season, teams] of standingsBySeason) {
    for (const team of teams) {
      const teamName = team.teamName.trim() || "";
      if (!teamName) continue;
      const ownerPart = team.owners.map((o) => o.trim()).filter(Boolean).join(", ").trim();
      const rawName = (ownerPart || teamName).trim();
      rows.push({
        season,
        teamName,
        ownerKey: standingsOwnerKey(rawName),
        displayName: cleanOwnerDisplay(rawName) || rawName,
      });
    }
  }
  return rows;
}

export type MedalTitleMatchDiagnostic = {
  season: number;
  championTeamName: string;
  matchedOwner: string | null;
  matchedTeamName: string | null;
  matched: boolean;
};

export type ChampionTitleAggregation = {
  titleSeasonsByOwnerKey: Map<string, Set<number>>;
  diagnostics: MedalTitleMatchDiagnostic[];
  unmatchedMedalTeams: string[];
};

/** championOwner field = champion team name from ESPN medals. */
export function aggregateChampionTitlesFromMedals(
  medals: MedalRow[],
  teamSeasonRows: readonly LeagueHistoryTeamSeasonRow[],
): ChampionTitleAggregation {
  const titleSeasonsByOwnerKey = new Map<string, Set<number>>();
  const diagnostics: MedalTitleMatchDiagnostic[] = [];
  const unmatchedMedalTeams: string[] = [];

  for (const medal of medals) {
    const championTeamName = medal.championOwner?.trim() ?? "";
    if (!championTeamName) continue;

    const normChampion = normalizeTeamName(championTeamName);
    const match = teamSeasonRows.find(
      (r) => r.season === medal.season && normalizeTeamName(r.teamName) === normChampion,
    );

    const matched = Boolean(match);
    diagnostics.push({
      season: medal.season,
      championTeamName,
      matchedOwner: match?.displayName ?? null,
      matchedTeamName: match?.teamName ?? null,
      matched,
    });

    if (match) {
      if (!titleSeasonsByOwnerKey.has(match.ownerKey)) titleSeasonsByOwnerKey.set(match.ownerKey, new Set());
      titleSeasonsByOwnerKey.get(match.ownerKey)!.add(medal.season);
    } else {
      unmatchedMedalTeams.push(championTeamName);
    }
  }

  return { titleSeasonsByOwnerKey, diagnostics, unmatchedMedalTeams };
}

function titleSeasonsForOwner(
  owner: StandingsOwnerRow,
  titleSeasonsByOwnerKey: Map<string, Set<number>>,
): number[] {
  const merged = new Set<number>();
  const byKey = titleSeasonsByOwnerKey.get(owner.ownerKey);
  const byDisplay = titleSeasonsByOwnerKey.get(standingsOwnerKey(owner.displayName));
  if (byKey) for (const s of byKey) merged.add(s);
  if (byDisplay) for (const s of byDisplay) merged.add(s);
  return [...merged].sort((a, b) => b - a);
}

/** Champion / runner-up / third display strings for one season — medals only (team names from ESPN). */
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

export function mergeMedalsIntoOwners(
  rawOwners: StandingsOwnerRow[],
  medals: MedalRow[],
  teamSeasonRows: readonly LeagueHistoryTeamSeasonRow[],
): OwnerWithMedalTitles[] {
  const { titleSeasonsByOwnerKey } = aggregateChampionTitlesFromMedals(medals, teamSeasonRows);
  return rawOwners.map((o) => {
    const titleSeasons = titleSeasonsForOwner(o, titleSeasonsByOwnerKey);
    return {
      ...o,
      titleCount: titleSeasons.length,
      titleSeasons,
    };
  });
}
