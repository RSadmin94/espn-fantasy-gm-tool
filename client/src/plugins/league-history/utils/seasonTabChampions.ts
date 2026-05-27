/**
 * Per-season standings rows from leagueHistoryStandings (stats + finalStanding).
 * Not used to derive championships — see medalTitles.ts.
 */

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
  championships: number;
  seasons: Array<{ season: number; entry: StandingsSeasonEntry }>;
};

export type SeasonTabRow = {
  owner: string;
  ownerKey: string;
} & StandingsSeasonEntry;

export function buildSeasonTabRows(rawOwners: StandingsOwnerRow[], season: number): SeasonTabRow[] {
  return rawOwners
    .flatMap((o) => {
      const s = o.seasons.find((r) => r.season === season);
      return s ? [{ owner: o.displayName, ownerKey: o.ownerKey, ...s.entry }] : [];
    })
    .sort((a, b) => (a.finalStanding ?? 99) - (b.finalStanding ?? 99));
}

export function pickSeasonTabRowByPlace(rows: SeasonTabRow[], place: number): SeasonTabRow | null {
  const byRank = rows.find((r) => r.finalStanding === place);
  if (byRank) return byRank;
  if (place >= 1 && place <= rows.length) return rows[place - 1] ?? null;
  return null;
}
