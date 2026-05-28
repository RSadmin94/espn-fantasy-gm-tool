/**
 * Shared team-count / team-map helpers for canonical draft board (not gmTeams-inflated geometry).
 */
import { sql } from "drizzle-orm";
import { gmLeagueSettings, gmTeams } from "../drizzle/schema";
import { getDb } from "./db";
import { and as andDrizzle, eq as eqDrizzle } from "drizzle-orm";
import { getCachedViewWithTier } from "./db";
import { getSeasonTeams } from "./historicalDataService";
import { normalizeSettings, normalizeTeams } from "./espnService";

export const FALLBACK_TEAM_NAME_RE = /^Team\s+\d+$/i;

export function nflTeamFromDraftRawPick(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const t = o.proTeam ?? o.nflTeam;
    return typeof t === "string" ? t.trim() : "";
  } catch {
    return "";
  }
}

export type RawPickJson = {
  source?: string;
  teamName?: string;
  ownerName?: string;
  overallPickNumber?: number;
};

export function parseDraftRawPick(raw: string | null | undefined): RawPickJson {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RawPickJson;
  } catch {
    return {};
  }
}

/**
 * Resolve canonical team count for a season.
 * Priority: league settings / combined cache → gmTeams (capped when settings prove smaller).
 */
export async function resolveSeasonTeamCount(
  leagueId: string,
  season: number,
  userId?: number,
): Promise<number> {
  const db = await getDb();
  let fromTeams = 0;
  let fromSettings = 0;

  if (db) {
    const [teamRow] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${gmTeams.teamId})` })
      .from(gmTeams)
      .where(andDrizzle(eqDrizzle(gmTeams.leagueId, leagueId), eqDrizzle(gmTeams.season, season)));
    fromTeams = Number(teamRow?.count ?? 0);

    const [settingsRow] = await db
      .select({ teamCount: gmLeagueSettings.teamCount })
      .from(gmLeagueSettings)
      .where(
        andDrizzle(eqDrizzle(gmLeagueSettings.leagueId, leagueId), eqDrizzle(gmLeagueSettings.season, season)),
      );
    fromSettings = Number(settingsRow?.teamCount ?? 0);
  }

  let fromCache = 0;
  const hit = await getCachedViewWithTier(season, "combined", leagueId, { userId });
  if (hit?.row?.payload && typeof hit.row.payload === "object" && !Array.isArray(hit.row.payload)) {
    const settingsMapped = normalizeSettings(hit.row.payload as Record<string, unknown>);
    fromCache = Number(settingsMapped.size ?? 0);
  }

  const leagueSize = fromSettings > 0 ? fromSettings : fromCache > 0 ? fromCache : 0;
  if (fromTeams > 0) {
    if (leagueSize > 0 && fromTeams > leagueSize) return leagueSize;
    return fromTeams;
  }
  if (fromSettings > 0) return fromSettings;
  if (fromCache > 0) return fromCache;
  return 0;
}

function mergeTeamRowIntoMap(
  map: Map<number, { name: string; ownerName: string }>,
  t: Record<string, unknown>,
  overwriteFallbackOnly: boolean,
): void {
  const tid = Number(t.teamId ?? t.id ?? 0);
  if (tid <= 0) return;
  const name = String(t.teamName ?? t.name ?? "").trim();
  const ownerName = String(t.ownerDisplay ?? t.owners ?? t.ownerName ?? "").trim();
  if (!name && !ownerName) return;
  const existing = map.get(tid);
  if (!existing) {
    map.set(tid, { name, ownerName });
    return;
  }
  if (!overwriteFallbackOnly) {
    const betterName = name && !FALLBACK_TEAM_NAME_RE.test(name) ? name : existing.name;
    const betterOwner = ownerName || existing.ownerName;
    map.set(tid, { name: betterName, ownerName: betterOwner });
    return;
  }
  if (name && !FALLBACK_TEAM_NAME_RE.test(name) && (!existing.name || FALLBACK_TEAM_NAME_RE.test(existing.name))) {
    existing.name = name;
  }
  if (ownerName && !existing.ownerName) existing.ownerName = ownerName;
}

/** teamId → display names; gmTeams never overwrites recap/scrape teamName on picks. */
export async function buildSeasonTeamMap(
  leagueId: string,
  season: number,
  userId?: number,
): Promise<Map<number, { name: string; ownerName: string }>> {
  const map = new Map<number, { name: string; ownerName: string }>();
  const teamsRes = await getSeasonTeams(season, leagueId, userId);
  for (const t of teamsRes.rows as Record<string, unknown>[]) {
    mergeTeamRowIntoMap(map, t, false);
  }

  const hit = await getCachedViewWithTier(season, "combined", leagueId, { userId });
  if (hit?.row?.payload && typeof hit.row.payload === "object" && !Array.isArray(hit.row.payload)) {
    try {
      const norm = normalizeTeams(hit.row.payload as Record<string, unknown>) as unknown as Record<
        string,
        unknown
      >[];
      for (const t of norm) mergeTeamRowIntoMap(map, t, true);
    } catch {
      /* ignore */
    }
  }
  return map;
}

export function roundFromOverall(overallPick: number, teamCount: number): number {
  if (teamCount <= 0 || overallPick <= 0) return 0;
  return Math.ceil(overallPick / teamCount);
}

/** Chronological pick index within round (1..teamCount), never snake slot. */
export function pickInRoundFromOverall(overallPick: number, teamCount: number): number {
  if (teamCount <= 0 || overallPick <= 0) return 0;
  const round = roundFromOverall(overallPick, teamCount);
  return overallPick - (round - 1) * teamCount;
}
