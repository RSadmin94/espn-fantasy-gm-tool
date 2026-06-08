/**
 * championshipAuthority.ts — single source of championship truth (PR1 / R3).
 *
 * Medals (`league_medals`) are PRIMARY for champion identity. `teams.finalStanding === 1`
 * is a FALLBACK used only when a season has no resolvable medal champion; every such
 * season is recorded in `fallbackSeasons` and surfaced with `CHAMPIONSHIP_FALLBACK_LABEL`
 * so the UI never presents the fallback as equal to medals.
 *
 * Resolution reuses the same ownerProfileService medal helpers as the Hall of Fame, so
 * champion-by-season is identical across HoF, Why Haven't I Won, and Championship Path.
 *
 * NOTE: resolves champion IDENTITY only. Legitimate rank/seed uses of finalStanding
 * (bestFinish, playoff cutoffs) intentionally stay in their callers.
 *
 * `resolveChampionsFromRows` is a PURE function (no DB) for unit testing;
 * `buildChampionshipAuthority` loads the rows and delegates to it.
 */
import { eq, asc } from "drizzle-orm";
import { gmTeams, leagueMedals } from "../drizzle/schema";
import type { AppDb } from "./db";
import {
  buildNameToOwnerId,
  resolveOwnerKey,
  resolveMedalTeamToOwnerKey,
  buildTeamToCanonicalProfileKey,
  type GmTeamRow,
} from "./ownerProfileService";

export const CHAMPIONSHIP_FALLBACK_LABEL =
  "Championship source: ESPN standings fallback — League medals not imported for this season.";

export type ChampionSource = "medal" | "finalStanding-fallback" | "unresolved";

export type MedalRowLite = { season: number; championOwner: string | null };

export type ChampionshipAuthority = {
  championKeyBySeason: Map<number, string | null>;
  championOwnerIdBySeason: Map<number, string | null>;
  championTeamIdBySeason: Map<number, number | null>;
  championNameBySeason: Map<number, string | null>;
  sourceBySeason: Map<number, ChampionSource>;
  titlesByKey: Map<string, number>;
  championSeasonsByKey: Map<string, number[]>;
  latestCompletedSeason: number | null;
  reigningKey: string | null;
  fallbackSeasons: number[];
  unresolvedSeasons: number[];
  fallbackLabel: string;
  canonicalKeyForOwnerId: (ownerId: string | null | undefined) => string;
};

/** PURE core: resolve champions from already-loaded team + medal rows. */
export function resolveChampionsFromRows(
  allRows: GmTeamRow[],
  medalRows: MedalRowLite[],
): ChampionshipAuthority {
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const teamToCanon = buildTeamToCanonicalProfileKey(allRows); // `${season}:${teamId}` -> canon key

  const ownerIdToCanon = new Map<string, string>();
  for (const t of allRows) {
    const oid = String(t.ownerId || "").trim();
    if (oid && !ownerIdToCanon.has(oid)) {
      ownerIdToCanon.set(oid, resolveOwnerKey(oid, t.ownerName || "", t.name || "", nameToOwnerId));
    }
  }
  const canonicalKeyForOwnerId = (ownerId: string | null | undefined): string => {
    const oid = String(ownerId || "").trim();
    if (!oid) return "";
    return ownerIdToCanon.get(oid) ?? resolveOwnerKey(oid, "", "", nameToOwnerId);
  };

  const seasons = [...new Set(allRows.map((t) => Number(t.season)))].sort((a, b) => a - b);
  const rowsBySeason = new Map<number, GmTeamRow[]>();
  for (const t of allRows) {
    const s = Number(t.season);
    if (!rowsBySeason.has(s)) rowsBySeason.set(s, []);
    rowsBySeason.get(s)!.push(t);
  }
  const medalBySeason = new Map<number, string | null>();
  for (const m of medalRows) medalBySeason.set(Number(m.season), m.championOwner ?? null);

  const championKeyBySeason = new Map<number, string | null>();
  const championOwnerIdBySeason = new Map<number, string | null>();
  const championTeamIdBySeason = new Map<number, number | null>();
  const championNameBySeason = new Map<number, string | null>();
  const sourceBySeason = new Map<number, ChampionSource>();
  const fallbackSeasons: number[] = [];
  const unresolvedSeasons: number[] = [];

  const displayName = (t: GmTeamRow | undefined): string | null =>
    t ? (String(t.ownerName || "").trim() || String(t.name || "").trim() || null) : null;

  for (const s of seasons) {
    const seasonRows = rowsBySeason.get(s) ?? [];
    let champTeam: GmTeamRow | undefined;
    let source: ChampionSource = "unresolved";

    // PRIMARY: medal-resolved champion
    const medalLabel = medalBySeason.get(s);
    if (medalLabel && medalLabel.trim()) {
      const ck = resolveMedalTeamToOwnerKey(s, medalLabel, allRows, nameToOwnerId);
      if (ck) {
        champTeam = seasonRows.find((t) => (teamToCanon.get(`${s}:${Number(t.teamId)}`) ?? "") === ck);
      }
      if (champTeam) source = "medal";
    }

    // FALLBACK: finalStanding === 1 (only when no resolvable medal champion)
    if (!champTeam) {
      const fsChamp = seasonRows.find((t) => Number(t.finalStanding) === 1);
      if (fsChamp) {
        champTeam = fsChamp;
        source = "finalStanding-fallback";
        fallbackSeasons.push(s);
      }
    }

    if (!champTeam) {
      unresolvedSeasons.push(s);
      championKeyBySeason.set(s, null);
      championOwnerIdBySeason.set(s, null);
      championTeamIdBySeason.set(s, null);
      championNameBySeason.set(s, null);
      sourceBySeason.set(s, "unresolved");
      continue;
    }

    const canon =
      teamToCanon.get(`${s}:${Number(champTeam.teamId)}`) || canonicalKeyForOwnerId(champTeam.ownerId);
    championKeyBySeason.set(s, canon || null);
    championOwnerIdBySeason.set(s, String(champTeam.ownerId || "") || null);
    championTeamIdBySeason.set(s, Number(champTeam.teamId));
    championNameBySeason.set(s, displayName(champTeam));
    sourceBySeason.set(s, source);
  }

  const titlesByKey = new Map<string, number>();
  const championSeasonsByKey = new Map<string, number[]>();
  for (const [s, key] of championKeyBySeason) {
    if (!key) continue;
    titlesByKey.set(key, (titlesByKey.get(key) ?? 0) + 1);
    if (!championSeasonsByKey.has(key)) championSeasonsByKey.set(key, []);
    championSeasonsByKey.get(key)!.push(s);
  }
  for (const arr of championSeasonsByKey.values()) arr.sort((a, b) => a - b);

  const resolvedSeasons = [...championKeyBySeason.entries()].filter(([, k]) => !!k).map(([s]) => s);
  const latestCompletedSeason = resolvedSeasons.length ? Math.max(...resolvedSeasons) : null;
  const reigningKey =
    latestCompletedSeason != null ? championKeyBySeason.get(latestCompletedSeason) ?? null : null;

  return {
    championKeyBySeason,
    championOwnerIdBySeason,
    championTeamIdBySeason,
    championNameBySeason,
    sourceBySeason,
    titlesByKey,
    championSeasonsByKey,
    latestCompletedSeason,
    reigningKey,
    fallbackSeasons,
    unresolvedSeasons,
    fallbackLabel: CHAMPIONSHIP_FALLBACK_LABEL,
    canonicalKeyForOwnerId,
  };
}

export async function buildChampionshipAuthority(args: {
  db: AppDb;
  leagueId: string;
}): Promise<ChampionshipAuthority> {
  const { db, leagueId } = args;

  const allRows = (await db
    .select()
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, leagueId))
    .orderBy(asc(gmTeams.season), asc(gmTeams.teamId))) as GmTeamRow[];

  const medalRows = (await db
    .select({ season: leagueMedals.season, championOwner: leagueMedals.championOwner })
    .from(leagueMedals)
    .where(eq(leagueMedals.leagueId, leagueId))
    .orderBy(asc(leagueMedals.season))) as MedalRowLite[];

  return resolveChampionsFromRows(allRows, medalRows);
}
