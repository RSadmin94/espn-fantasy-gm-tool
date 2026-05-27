import { useMemo, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  mergeMedalsIntoOwners,
  aggregateChampionTitlesFromMedals,
  buildLeagueHistoryTeamSeasonRows,
  type MedalRow,
  type OwnerWithMedalTitles,
  type StandingsOwnerRow,
  type StandingsTeamInput,
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
  const utils = trpc.useUtils();
  const standingsQ = trpc.espn.leagueHistoryStandings.useQuery(undefined, { staleTime: 60_000 });
  const medalsQ = trpc.espn.leagueMedals.useQuery(undefined, { staleTime: 60_000 });
  const h2hQ = trpc.espn.leagueHistoryH2H.useQuery(undefined, { staleTime: 60_000 });

  const allSeasons = standingsQ.data?.seasons ?? [];
  const rawOwners = (standingsQ.data?.owners ?? []) as StandingsOwnerRow[];
  const medals = (medalsQ.data ?? []) as MedalRow[];

  const [standingsBySeason, setStandingsBySeason] = useState<Map<number, StandingsTeamInput[]>>(new Map());
  const [teamRowsLoading, setTeamRowsLoading] = useState(false);

  useEffect(() => {
    if (!allSeasons.length) {
      setStandingsBySeason(new Map());
      return;
    }
    let cancelled = false;
    setTeamRowsLoading(true);
    void (async () => {
      const next = new Map<number, StandingsTeamInput[]>();
      await Promise.all(
        allSeasons.map(async (season) => {
          try {
            const teams = await utils.espn.standings.fetch({ season });
            if (cancelled) return;
            next.set(
              season,
              teams.map((t) => ({
                teamName: t.teamName,
                owners: Array.isArray(t.owners) ? t.owners.map(String) : [],
              })),
            );
          } catch {
            if (!cancelled) next.set(season, []);
          }
        }),
      );
      if (!cancelled) {
        setStandingsBySeason(next);
        setTeamRowsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allSeasons.join(","), utils]);

  const teamSeasonRows = useMemo(
    () => buildLeagueHistoryTeamSeasonRows(standingsBySeason),
    [standingsBySeason],
  );

  const titleAggregation = useMemo(
    () => aggregateChampionTitlesFromMedals(medals, teamSeasonRows),
    [medals, teamSeasonRows],
  );

  const mergedOwners = useMemo(
    () => mergeMedalsIntoOwners(rawOwners, medals, teamSeasonRows),
    [rawOwners, medals, teamSeasonRows],
  );

  const standingsLoading = standingsQ.isLoading || medalsQ.isLoading || teamRowsLoading;
  const matrix = (h2hQ.data?.matrix ?? []) as MatrixRow[];

  useEffect(() => {
    if (standingsLoading || h2hQ.isLoading) return;

    for (const row of titleAggregation.diagnostics) {
      console.info("[league-history-title-match]", row);
    }
    if (titleAggregation.unmatchedMedalTeams.length > 0) {
      console.info("[league-history-title-match] unmatchedMedalTeams", titleAggregation.unmatchedMedalTeams);
    }

    const rows = mergedOwners.map((o) => ({
      owner: o.displayName,
      titleSeasons: o.titleSeasons.join(", "),
      titleCount: o.titleCount,
      h2hGames: h2hGamesFromMatrix(matrix, o.displayName),
    }));
    console.info("[league-history-aggregation]", rows);
  }, [standingsLoading, h2hQ.isLoading, mergedOwners, matrix, titleAggregation]);

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
    standingsLoading,
    allSeasons,
    rawOwners,
    mergedOwners,
    medals,
    sortOwners,
    seasonExplorerRows,
    medalSpotlights,
  };
}
