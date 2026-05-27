import { useMemo, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { buildSeasonTabRows, type StandingsOwnerRow } from "../utils/seasonTabChampions";

export type LeagueHistoryTab = "dynasty" | "seasons" | "rivalries";
export type SortKey = "titles" | "wins" | "winpct";

type MedalRow = {
  season: number;
  championOwner: string | null;
  runnerUpOwner: string | null;
  thirdPlaceOwner: string | null;
};

type SeasonTeamRow = {
  teamName: string;
  owners: string[];
};

export type OwnerWithTitles = StandingsOwnerRow & {
  titleCount: number;
  titleSeasons: number[];
  allTimeWins: number;
  allTimeLosses: number;
  allTimeTies: number;
  allTimeWinPct: number;
};

type MatrixRow = {
  owner: string;
  vs: Record<string, { wins: number; losses: number; ties: number; gamesPlayed?: number }>;
};

function normalizeTeamName(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .toLowerCase()
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamNameLoose(raw: string): string {
  return normalizeTeamName(raw).replace(/\s+/g, "");
}

function ownerKeyFromLabel(raw: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^\(+|\)+$/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function looksLikeOpaqueOwnerId(value: string): boolean {
  const s = value.trim();
  if (!s) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^\{?[0-9a-f-]{32,}\}?$/i.test(s)) return true;
  return /^[0-9]{6,}$/.test(s);
}

function parseOwnerParts(raw: string | string[] | undefined): string[] {
  if (raw == null) return [];
  const chunks = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  return chunks
    .flatMap((c) => c.split(";"))
    .map((s) => s.trim())
    .filter(Boolean);
}

function ownerLabelFromTeamRow(team: SeasonTeamRow): string {
  const human = team.owners.filter((o) => !looksLikeOpaqueOwnerId(o));
  if (human.length > 0) return human.join(", ");
  return "";
}

function findOwnerForTeamLabel(
  rawOwners: StandingsOwnerRow[],
  ownerLabel: string,
): StandingsOwnerRow | undefined {
  if (!ownerLabel) return undefined;
  const key = ownerKeyFromLabel(ownerLabel);
  return rawOwners.find((o) => o.ownerKey === key || o.displayName === ownerLabel);
}

function findTeamForChampion(
  seasonTeams: readonly SeasonTeamRow[],
  championTeamName: string,
): SeasonTeamRow | undefined {
  const norm = normalizeTeamName(championTeamName);
  const loose = normalizeTeamNameLoose(championTeamName);
  return seasonTeams.find((t) => {
    const tn = normalizeTeamName(t.teamName);
    const tl = normalizeTeamNameLoose(t.teamName);
    return tn === norm || tl === loose;
  });
}

function resolveOwnerForChampionTeam(
  season: number,
  championTeamName: string,
  matchedTeam: SeasonTeamRow,
  rawOwners: StandingsOwnerRow[],
): StandingsOwnerRow | undefined {
  const label = ownerLabelFromTeamRow(matchedTeam);
  const byLabel = findOwnerForTeamLabel(rawOwners, label);
  if (byLabel) return byLabel;

  const normChamp = normalizeTeamName(championTeamName);
  return rawOwners.find(
    (o) =>
      o.seasons.some((s) => s.season === season) &&
      (o.ownerKey === ownerKeyFromLabel(championTeamName) ||
        normalizeTeamName(o.displayName) === normChamp),
  );
}

function mapStandingsTeams(
  rows: Array<{ teamName: string; owners?: string | string[] }>,
): SeasonTeamRow[] {
  return rows.map((t) => ({
    teamName: t.teamName,
    owners: parseOwnerParts(t.owners),
  }));
}

function mergeOwnerNamesFromCache(
  base: SeasonTeamRow[],
  cacheRows: Array<{ teamName: string; owners?: string | string[] }>,
): SeasonTeamRow[] {
  if (!cacheRows.length) return base;
  return base.map((row) => {
    const cache = cacheRows.find(
      (c) =>
        normalizeTeamName(c.teamName) === normalizeTeamName(row.teamName) ||
        normalizeTeamNameLoose(c.teamName) === normalizeTeamNameLoose(row.teamName),
    );
    if (!cache) return row;
    const cacheOwners = parseOwnerParts(cache.owners).filter((o) => !looksLikeOpaqueOwnerId(o));
    if (cacheOwners.length === 0) return row;
    return { ...row, owners: cacheOwners };
  });
}

async function fetchSeasonTeamsForMapping(
  season: number,
  utils: ReturnType<typeof trpc.useUtils>,
): Promise<SeasonTeamRow[]> {
  const standingsRows = await utils.espn.standings.fetch({ season });
  let teams = mapStandingsTeams(standingsRows);
  if (teams.some((t) => ownerLabelFromTeamRow(t) === "")) {
    try {
      const cacheRows = await utils.espn.teams.fetch({ season });
      teams = mergeOwnerNamesFromCache(teams, cacheRows);
    } catch {
      // keep standings-only rows
    }
  }
  return teams;
}

function creditTitlesFromMedalTeams(
  medals: MedalRow[],
  teamsBySeason: ReadonlyMap<number, readonly SeasonTeamRow[]>,
  rawOwners: StandingsOwnerRow[],
): { titleSeasonsByOwnerKey: Map<string, Set<number>>; unmatched: UnmatchedChampionTeam[] } {
  const titleSeasonsByOwnerKey = new Map<string, Set<number>>();
  const unmatched: UnmatchedChampionTeam[] = [];

  for (const medal of medals) {
    const championTeamName = medal.championOwner?.trim() ?? "";
    if (!championTeamName) continue;

    const seasonTeams = teamsBySeason.get(medal.season) ?? [];
    const availableTeamNamesForSeason = seasonTeams.map((t) => t.teamName);
    const matchedTeam = findTeamForChampion(seasonTeams, championTeamName);

    if (!matchedTeam) {
      unmatched.push({ season: medal.season, championTeamName, availableTeamNamesForSeason });
      continue;
    }

    const owner = resolveOwnerForChampionTeam(medal.season, championTeamName, matchedTeam, rawOwners);
    if (!owner) {
      unmatched.push({ season: medal.season, championTeamName, availableTeamNamesForSeason });
      continue;
    }

    if (!titleSeasonsByOwnerKey.has(owner.ownerKey)) {
      titleSeasonsByOwnerKey.set(owner.ownerKey, new Set());
    }
    titleSeasonsByOwnerKey.get(owner.ownerKey)!.add(medal.season);
  }

  return { titleSeasonsByOwnerKey, unmatched };
}

export type UnmatchedChampionTeam = {
  season: number;
  championTeamName: string;
  availableTeamNamesForSeason: string[];
};

function spotlightsForSeason(medals: MedalRow[], season: number) {
  const row = medals.find((m) => m.season === season);
  return {
    champion: row?.championOwner?.trim() || null,
    runnerUp: row?.runnerUpOwner?.trim() || null,
    third: row?.thirdPlaceOwner?.trim() || null,
  };
}

export function useLeagueHistoryModel() {
  const utils = trpc.useUtils();
  const standingsQ = trpc.espn.leagueHistoryStandings.useQuery(undefined, { staleTime: 60_000 });
  const medalsQ = trpc.espn.leagueMedals.useQuery(undefined, { staleTime: 60_000 });
  const recordsQ = trpc.espn.ownerAllTimeRecords.useQuery(undefined, { staleTime: 60_000 });
  const h2hQ = trpc.espn.leagueHistoryH2H.useQuery(undefined, { staleTime: 60_000 });

  const historySeasons = standingsQ.data?.seasons ?? [];
  const medalSeasons = (medalsQ.data ?? []).map((m) => m.season);
  const seasonsToLoad = useMemo(
    () => [...new Set([...historySeasons, ...medalSeasons])].sort((a, b) => a - b),
    [historySeasons.join(","), medalSeasons.join(",")],
  );

  const rawOwners = (standingsQ.data?.owners ?? []) as StandingsOwnerRow[];
  const medals = (medalsQ.data ?? []) as MedalRow[];

  const [teamsBySeason, setTeamsBySeason] = useState<Map<number, SeasonTeamRow[]>>(new Map());
  const [teamsLoading, setTeamsLoading] = useState(false);

  useEffect(() => {
    if (!seasonsToLoad.length) {
      setTeamsBySeason(new Map());
      return;
    }
    let cancelled = false;
    setTeamsLoading(true);
    void (async () => {
      const next = new Map<number, SeasonTeamRow[]>();
      await Promise.all(
        seasonsToLoad.map(async (season) => {
          try {
            const teams = await fetchSeasonTeamsForMapping(season, utils);
            if (!cancelled) next.set(season, teams);
          } catch {
            if (!cancelled) next.set(season, []);
          }
        }),
      );
      if (!cancelled) {
        setTeamsBySeason(next);
        setTeamsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonsToLoad.join(","), utils]);

  const { titleSeasonsByOwnerKey, unmatched } = useMemo(
    () => creditTitlesFromMedalTeams(medals, teamsBySeason, rawOwners),
    [medals, teamsBySeason, rawOwners],
  );

  const recordByOwnerKey = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; ties: number; winPct: number }>();
    for (const row of recordsQ.data?.owners ?? []) {
      map.set(row.ownerKey, {
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        winPct: row.winPct,
      });
    }
    return map;
  }, [recordsQ.data?.owners]);

  const mergedOwners = useMemo((): OwnerWithTitles[] => {
    return rawOwners.map((o) => {
      const titleSeasons = [...(titleSeasonsByOwnerKey.get(o.ownerKey) ?? [])].sort((a, b) => b - a);
      const rec = recordByOwnerKey.get(o.ownerKey);
      return {
        ...o,
        titleCount: titleSeasons.length,
        titleSeasons,
        allTimeWins: rec?.wins ?? 0,
        allTimeLosses: rec?.losses ?? 0,
        allTimeTies: rec?.ties ?? 0,
        allTimeWinPct: rec?.winPct ?? 0,
      };
    });
  }, [rawOwners, titleSeasonsByOwnerKey, recordByOwnerKey]);

  const standingsLoading =
    standingsQ.isLoading || medalsQ.isLoading || teamsLoading || recordsQ.isLoading;
  const matrix = (h2hQ.data?.matrix ?? []) as MatrixRow[];
  const totalTitles = useMemo(
    () => [...titleSeasonsByOwnerKey.values()].reduce((sum, seasons) => sum + seasons.size, 0),
    [titleSeasonsByOwnerKey],
  );

  useEffect(() => {
    if (standingsLoading || h2hQ.isLoading) return;

    const titleCountsByOwner: Record<string, number> = {};
    for (const o of mergedOwners) {
      if (o.titleCount > 0) titleCountsByOwner[o.displayName] = o.titleCount;
    }
    console.log({
      seasonsProcessed: medals.filter((m) => m.championOwner?.trim()).length,
      championsFoundFromSeasonTabs: totalTitles,
      titleCountsByOwner,
      totalTitles: Object.values(titleCountsByOwner).reduce((sum, n) => sum + n, 0),
      expectedTitles: medals.filter((m) => m.championOwner?.trim()).length,
    });
    for (const row of unmatched) {
      console.warn("unmatchedChampionTeam:", row);
    }
  }, [standingsLoading, h2hQ.isLoading, mergedOwners, medals, unmatched, totalTitles]);

  function sortOwners(sortBy: SortKey): OwnerWithTitles[] {
    return [...mergedOwners].sort((a, b) => {
      if (sortBy === "titles") {
        if (b.titleCount !== a.titleCount) return b.titleCount - a.titleCount;
        return b.allTimeWins - a.allTimeWins;
      }
      if (sortBy === "wins") return b.allTimeWins - a.allTimeWins;
      return b.allTimeWinPct - a.allTimeWinPct;
    });
  }

  function seasonExplorerRows(activeSeason: number | null) {
    if (activeSeason == null) return [];
    return buildSeasonTabRows(rawOwners, activeSeason);
  }

  function medalSpotlights(activeSeason: number | null) {
    if (activeSeason == null)
      return { champion: null as string | null, runnerUp: null as string | null, third: null as string | null };
    return spotlightsForSeason(medals, activeSeason);
  }

  return {
    standingsQ,
    medalsQ,
    h2hQ,
    standingsLoading,
    allSeasons: historySeasons,
    rawOwners,
    mergedOwners,
    sortOwners,
    seasonExplorerRows,
    medalSpotlights,
  };
}
