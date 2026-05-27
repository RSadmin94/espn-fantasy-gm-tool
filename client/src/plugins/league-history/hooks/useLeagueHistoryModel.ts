import { useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  mergeMedalsIntoOwners,
  type MedalRow,
  type OwnerWithMedalTitles,
  type StandingsOwnerRow,
  getMedalSpotlightsForSeason,
} from "../utils/mergeMedalsIntoOwners";

export type LeagueHistoryTab = "dynasty" | "seasons" | "rivalries";
export type SortKey = "titles" | "wins" | "winpct";

type MatrixRow = {
  owner: string;
  vs: Record<string, { wins: number; losses: number; ties: number; gamesPlayed?: number }>;
};

function h2hGamesFromMatrix(matrix: MatrixRow[], displayName: string): number {
  const row = matrix.find((r) => r.owner === displayName);
  if (!row) return 0;
  let g = 0;
  for (const rec of Object.values(row.vs)) {
    g += rec.gamesPlayed ?? rec.wins + rec.losses + rec.ties;
  }
  return g;
}

export function useLeagueHistoryModel() {
  const standingsQ = trpc.espn.leagueHistoryStandings.useQuery(undefined, { staleTime: 60_000 });
  const medalsQ = trpc.espn.leagueMedals.useQuery(undefined, { staleTime: 60_000 });
  const h2hQ = trpc.espn.leagueHistoryH2H.useQuery(undefined, { staleTime: 60_000 });

  const allSeasons = standingsQ.data?.seasons ?? [];
  const rawOwners = (standingsQ.data?.owners ?? []) as StandingsOwnerRow[];
  const medals = (medalsQ.data ?? []) as MedalRow[];

  const mergedOwners = useMemo(
    () => mergeMedalsIntoOwners(rawOwners, medals),
    [standingsQ.data?.owners, medalsQ.data],
  );

  const standingsLoading = standingsQ.isLoading || medalsQ.isLoading;
  const matrix = (h2hQ.data?.matrix ?? []) as MatrixRow[];

  useEffect(() => {
    if (standingsLoading || h2hQ.isLoading) return;
    const rows = mergedOwners.map((o) => ({
      owner: o.displayName,
      titleSeasons: o.titleSeasons.join(", "),
      titleCount: o.titleCount,
      h2hGames: h2hGamesFromMatrix(matrix, o.displayName),
    }));
    console.info("[league-history-aggregation]", rows);
  }, [standingsLoading, h2hQ.isLoading, mergedOwners, matrix]);

  function sortOwners(sortBy: SortKey): OwnerWithMedalTitles[] {
    return [...mergedOwners].sort((a, b) => {
      const wA = a.seasons.reduce((s, r) => s + r.entry.wins, 0);
      const lA = a.seasons.reduce((s, r) => s + r.entry.losses, 0);
      const tA = a.seasons.reduce((s, r) => s + r.entry.ties, 0);
      const wB = b.seasons.reduce((s, r) => s + r.entry.wins, 0);
      const lB = b.seasons.reduce((s, r) => s + r.entry.losses, 0);
      const tB = b.seasons.reduce((s, r) => s + r.entry.ties, 0);
      if (sortBy === "titles") {
        if (b.titleCount !== a.titleCount) return b.titleCount - a.titleCount;
        return wB - wA;
      }
      if (sortBy === "wins") return wB - wA;
      const pA = wA + lA + tA === 0 ? 0 : wA / (wA + lA + tA);
      const pB = wB + lB + tB === 0 ? 0 : wB / (wB + lB + tB);
      return pB - pA;
    });
  }

  function seasonExplorerRows(activeSeason: number | null) {
    if (activeSeason == null) return [];
    return rawOwners
      .flatMap((o) => {
        const s = o.seasons.find((r) => r.season === activeSeason);
        return s ? [{ owner: o.displayName, ...s.entry }] : [];
      })
      .sort((a, b) => (a.finalStanding ?? 99) - (b.finalStanding ?? 99));
  }

  function medalSpotlights(activeSeason: number | null) {
    if (activeSeason == null)
      return { champion: null as string | null, runnerUp: null as string | null, third: null as string | null };
    return getMedalSpotlightsForSeason(medals, activeSeason);
  }

  return {
    standingsQ,
    medalsQ,
    h2hQ,
    allSeasons,
    rawOwners,
    mergedOwners,
    medals,
    sortOwners,
    seasonExplorerRows,
    medalSpotlights,
  };
}
