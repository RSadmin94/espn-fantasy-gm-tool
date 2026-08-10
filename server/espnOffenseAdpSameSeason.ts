/**
 * RFSN-055B — Same-season ESPN offense ADP for Draft Intelligence.
 *
 * Reuses the War Room leaguedefaults/3 kona_player_info feed, one season at a time.
 * Never applies season X ADP to season Y. Sentinel ~170 feeds are not persisted.
 */
import {
  loadDurableEspnOffenseAdp,
  saveDurableEspnOffenseAdp,
  type DurableEspnPlayerInfo,
} from "./espnOffenseAdpDurableStore";
import { shouldPersistEspnOffenseCache } from "./playerStatsRouter";

const ESPN_OFFENSE_FILTER = JSON.stringify({
  players: {
    limit: 1500,
    sortAdp: { sortPriority: 1, sortAsc: true },
    filterRanksForScoringPeriodIds: { value: [1] },
    filterRanksForRankTypes: { value: ["PPR"] },
    filterSlotIds: { value: [0, 2, 4, 6, 17, 16, 23] },
  },
});

type SeasonFetcher = (year: number, filterJson: string) => Promise<unknown[]>;

let _fetchForTests: SeasonFetcher | null = null;
const _unhealthySeasons = new Set<number>();

export function __setSameSeasonEspnOffenseFetchForTests(fn: SeasonFetcher | null): void {
  _fetchForTests = fn;
}

export function __resetSameSeasonEspnOffenseMemoryForTests(): void {
  _unhealthySeasons.clear();
}

async function fetchSeasonPlayers(year: number): Promise<unknown[]> {
  if (_fetchForTests) {
    try {
      return await _fetchForTests(year, ESPN_OFFENSE_FILTER);
    } catch {
      return [];
    }
  }
  try {
    const resp = await fetch(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=1`,
      { headers: { "X-Fantasy-Filter": ESPN_OFFENSE_FILTER } },
    );
    if (!resp.ok) return [];
    const d = (await resp.json()) as { players?: unknown[] };
    return Array.isArray(d?.players) ? d.players : [];
  } catch {
    return [];
  }
}

function parseAdpMap(players: unknown[]): Map<string, DurableEspnPlayerInfo> {
  const map = new Map<string, DurableEspnPlayerInfo>();
  for (const entry of players) {
    const rec = entry as { id?: unknown; player?: { ownership?: { averageDraftPosition?: unknown } } };
    const id = String(rec?.id ?? "").trim();
    if (!id) continue;
    const adpRaw = rec?.player?.ownership?.averageDraftPosition;
    const adp =
      typeof adpRaw === "number" && Number.isFinite(adpRaw) && adpRaw > 0 && adpRaw < 500
        ? Math.round(adpRaw * 100) / 100
        : null;
    map.set(id, { adp, projection: null, percentStarted: null });
  }
  return map;
}

/**
 * Load ESPN offense ADP for exactly `season`. Durable first, then that year's feed.
 * Does not fall back to another season.
 */
export async function ensureSameSeasonEspnOffenseAdp(
  season: number,
): Promise<Map<string, DurableEspnPlayerInfo> | null> {
  const yr = Math.floor(season);
  if (!Number.isFinite(yr) || yr < 1990) return null;
  if (_unhealthySeasons.has(yr)) return null;

  const durable = await loadDurableEspnOffenseAdp(yr);
  if (durable && shouldPersistEspnOffenseCache(durable)) return durable;

  const players = await fetchSeasonPlayers(yr);
  const fetched = parseAdpMap(players);
  if (shouldPersistEspnOffenseCache(fetched)) {
    await saveDurableEspnOffenseAdp(yr, fetched);
    return fetched;
  }
  _unhealthySeasons.add(yr);
  return durable && durable.size > 0 ? durable : null;
}
