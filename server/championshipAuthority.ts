/**
 * championshipAuthority.ts — single source of championship truth (PR1 / R3 / RFSN-052J).
 *
 * Medals (`league_medals`) are PRIMARY for champion identity. `teams.finalStanding === 1`
 * is a FALLBACK used only when a season has no resolvable medal champion; every such
 * season is recorded in `fallbackSeasons` and surfaced with `CHAMPIONSHIP_FALLBACK_LABEL`
 * so the UI never presents the fallback as equal to medals.
 *
 * Podium-only / partial-legacy seasons (verified league_medals, no usable matchup history)
 * are included in title totals via the same approved-alias path as Hall of Fame / History.
 * They do not invent matchup, playoff, or score facts.
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
import { and, eq, asc } from "drizzle-orm";
import { gmMatchups, gmTeams, leagueMedals, ownerAliases } from "../drizzle/schema";
import type { AppDb } from "./db";
import {
  buildApprovedAliasLabelToOwnerKey,
  buildNameToOwnerId,
  buildTeamToCanonicalProfileKey,
  normalizeOwnerStr,
  resolveMedalTeamToOwnerKey,
  resolveOwnerKey,
  type GmTeamRow,
} from "./ownerProfileService";

export const CHAMPIONSHIP_FALLBACK_LABEL =
  "Championship source: ESPN standings fallback — League medals not imported for this season.";

export type ChampionSource = "medal" | "finalStanding-fallback" | "unresolved";

/** FULL = matchups present. PARTIAL_LEGACY = verified podium only. NONE = unusable. */
export type SeasonCoverageKind = "full" | "partial_legacy" | "none";

export type MedalRowLite = {
  season: number;
  championOwner: string | null;
  runnerUpOwner?: string | null;
  thirdPlaceOwner?: string | null;
};

export type ResolveChampionsOptions = {
  /** Same approved-alias map as Hall of Fame / League History. */
  aliasLabelToKey?: ReadonlyMap<string, string>;
  /** Seasons with completed matchup history (gmMatchups). */
  matchupSeasons?: ReadonlySet<number>;
};

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
  runnerUpKeyBySeason: Map<number, string | null>;
  runnerUpNameBySeason: Map<number, string | null>;
  thirdPlaceKeyBySeason: Map<number, string | null>;
  thirdPlaceNameBySeason: Map<number, string | null>;
  coverageBySeason: Map<number, SeasonCoverageKind>;
  partialLegacySeasons: number[];
  fullSeasons: number[];
  championshipCoverageStart: number | null;
  championshipCoverageEnd: number | null;
  matchupCoverageStart: number | null;
  matchupCoverageEnd: number | null;
  runnerUpSeasonsByKey: Map<string, number[]>;
  thirdPlaceSeasonsByKey: Map<string, number[]>;
};

export function formatPartialLegacyUnavailable(season: number): string {
  return `${season} is preserved as a partial legacy season. The recorded data includes final podium placement, but detailed matchup history is unavailable.`;
}

/** True when the ask needs matchup/record/score detail for a partial-legacy season. */
export function isPartialLegacyUnsupportedAsk(
  message: string,
  scope: { startSeason?: number | null; endSeason?: number | null },
  partialLegacySeasons: readonly number[],
): number | null {
  if (!partialLegacySeasons.length) return null;
  const t = (message ?? "").toLowerCase();
  const years = new Set<number>();
  if (scope.startSeason != null && Number.isFinite(scope.startSeason)) years.add(Math.floor(scope.startSeason));
  if (scope.endSeason != null && Number.isFinite(scope.endSeason)) years.add(Math.floor(scope.endSeason));
  for (const m of (message ?? "").matchAll(/\b(?:19|20)\d{2}\b/g)) {
    const y = Number(m[0]);
    if (Number.isFinite(y)) years.add(y);
  }
  const hit = [...years].find((y) => partialLegacySeasons.includes(y));
  if (hit == null) return null;
  if (
    /how many\s+(?:championships|rings|titles)|championship totals|who has more championship|leaderboard/i.test(
      t,
    )
  ) {
    return null;
  }
  const needsMatchup = isSeasonMatchupDetailAsk(t);
  return needsMatchup ? hit : null;
}

/** Named-year ask that needs matchup / record / score detail (not podium). */
export function isSeasonMatchupDetailAsk(t: string): boolean {
  if (!/\b(?:19|20)\d{2}\b/.test(t)) return false;
  return /regular[-\s]?season\s+record|win[-\s]?loss|\brecord\b|championship score|final score|week\s*\d+|who did .{2,80} (?:beat|play)|matchup|playoff game|points scored/i.test(
    t,
  );
}

function latestDisplayByKey(
  allRows: GmTeamRow[],
  teamToCanon: Map<string, string>,
  nameToOwnerId: Map<string, string>,
): Map<string, string> {
  const latest = new Map<string, { season: number; label: string }>();
  for (const t of allRows) {
    if ((t.teamId ?? 0) <= 0) continue;
    const k =
      teamToCanon.get(`${t.season}:${t.teamId}`) ||
      resolveOwnerKey(t.ownerId || "", t.ownerName || "", t.name || "", nameToOwnerId);
    const label = String(t.ownerName || "").trim() || String(t.name || "").trim();
    if (!k || !label) continue;
    const prev = latest.get(k);
    if (!prev || t.season >= prev.season) latest.set(k, { season: t.season, label });
  }
  const out = new Map<string, string>();
  for (const [k, v] of latest) out.set(k, v.label);
  return out;
}

function pushSeason(map: Map<string, number[]>, key: string | null | undefined, season: number): void {
  if (!key) return;
  const arr = map.get(key) ?? [];
  if (!arr.includes(season)) arr.push(season);
  map.set(key, arr);
}

/** PURE core: resolve champions from already-loaded team + medal rows. */
export function resolveChampionsFromRows(
  allRows: GmTeamRow[],
  medalRows: MedalRowLite[],
  opts: ResolveChampionsOptions = {},
): ChampionshipAuthority {
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const teamToCanon = buildTeamToCanonicalProfileKey(allRows);
  const aliasLabelToKey = opts.aliasLabelToKey;
  /** Omit matchupSeasons → treat gm_teams seasons as full (legacy callers). Explicit set wins. */
  const matchupSeasons =
    opts.matchupSeasons ?? new Set(allRows.map((t) => Number(t.season)).filter((s) => Number.isFinite(s) && s > 0));
  const displayByKey = latestDisplayByKey(allRows, teamToCanon, nameToOwnerId);

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

  const resolveMedalKey = (season: number, label: string | null | undefined): string | null => {
    if (!label?.trim()) return null;
    const viaGm = resolveMedalTeamToOwnerKey(season, label, allRows, nameToOwnerId);
    if (viaGm) return viaGm;
    if (!aliasLabelToKey) return null;
    return aliasLabelToKey.get(normalizeOwnerStr(label)) ?? null;
  };

  const rowsBySeason = new Map<number, GmTeamRow[]>();
  for (const t of allRows) {
    const s = Number(t.season);
    if (!rowsBySeason.has(s)) rowsBySeason.set(s, []);
    rowsBySeason.get(s)!.push(t);
  }
  const medalBySeason = new Map<number, MedalRowLite>();
  for (const m of medalRows) medalBySeason.set(Number(m.season), m);

  const seasons = [
    ...new Set([
      ...allRows.map((t) => Number(t.season)),
      ...medalRows.map((m) => Number(m.season)),
      ...matchupSeasons,
    ]),
  ]
    .filter((s) => Number.isFinite(s) && s > 0)
    .sort((a, b) => a - b);

  const championKeyBySeason = new Map<number, string | null>();
  const championOwnerIdBySeason = new Map<number, string | null>();
  const championTeamIdBySeason = new Map<number, number | null>();
  const championNameBySeason = new Map<number, string | null>();
  const sourceBySeason = new Map<number, ChampionSource>();
  const runnerUpKeyBySeason = new Map<number, string | null>();
  const runnerUpNameBySeason = new Map<number, string | null>();
  const thirdPlaceKeyBySeason = new Map<number, string | null>();
  const thirdPlaceNameBySeason = new Map<number, string | null>();
  const coverageBySeason = new Map<number, SeasonCoverageKind>();
  const fallbackSeasons: number[] = [];
  const unresolvedSeasons: number[] = [];

  const displayName = (t: GmTeamRow | undefined): string | null =>
    t ? String(t.ownerName || "").trim() || String(t.name || "").trim() || null : null;

  const nameForKey = (key: string | null, fallbackLabel: string | null | undefined): string | null => {
    if (key && displayByKey.has(key)) return displayByKey.get(key) ?? null;
    const label = fallbackLabel?.trim();
    return label || null;
  };

  for (const s of seasons) {
    const seasonRows = rowsBySeason.get(s) ?? [];
    const medal = medalBySeason.get(s);
    const hasMatchups = matchupSeasons.has(s);
    const hasPodium = Boolean(
      medal?.championOwner?.trim() || medal?.runnerUpOwner?.trim() || medal?.thirdPlaceOwner?.trim(),
    );

    let champTeam: GmTeamRow | undefined;
    let champKey: string | null = null;
    let source: ChampionSource = "unresolved";

    const medalLabel = medal?.championOwner ?? null;
    if (medalLabel?.trim()) {
      champKey = resolveMedalKey(s, medalLabel);
      if (champKey) {
        champTeam = seasonRows.find((t) => (teamToCanon.get(`${s}:${Number(t.teamId)}`) ?? "") === champKey);
        source = "medal";
      }
    }

    if (!champKey) {
      const fsChamp = seasonRows.find((t) => Number(t.finalStanding) === 1);
      if (fsChamp) {
        champTeam = fsChamp;
        champKey =
          teamToCanon.get(`${s}:${Number(fsChamp.teamId)}`) || canonicalKeyForOwnerId(fsChamp.ownerId) || null;
        source = "finalStanding-fallback";
        fallbackSeasons.push(s);
      }
    }

    const ruKey = resolveMedalKey(s, medal?.runnerUpOwner ?? null);
    const thirdKey = resolveMedalKey(s, medal?.thirdPlaceOwner ?? null);
    runnerUpKeyBySeason.set(s, ruKey);
    runnerUpNameBySeason.set(s, nameForKey(ruKey, medal?.runnerUpOwner ?? null));
    thirdPlaceKeyBySeason.set(s, thirdKey);
    thirdPlaceNameBySeason.set(s, nameForKey(thirdKey, medal?.thirdPlaceOwner ?? null));

    if (!champKey) {
      unresolvedSeasons.push(s);
      championKeyBySeason.set(s, null);
      championOwnerIdBySeason.set(s, null);
      championTeamIdBySeason.set(s, null);
      championNameBySeason.set(s, null);
      sourceBySeason.set(s, "unresolved");
      coverageBySeason.set(
        s,
        hasMatchups ? "full" : hasPodium ? "partial_legacy" : "none",
      );
      continue;
    }

    if (champTeam) {
      championOwnerIdBySeason.set(s, String(champTeam.ownerId || "") || null);
      championTeamIdBySeason.set(s, Number(champTeam.teamId));
      championNameBySeason.set(s, displayName(champTeam) || nameForKey(champKey, medalLabel));
    } else {
      championOwnerIdBySeason.set(s, null);
      championTeamIdBySeason.set(s, null);
      championNameBySeason.set(s, nameForKey(champKey, medalLabel));
    }
    championKeyBySeason.set(s, champKey);
    sourceBySeason.set(s, source);
    coverageBySeason.set(s, hasMatchups ? "full" : "partial_legacy");
  }

  const titlesByKey = new Map<string, number>();
  const championSeasonsByKey = new Map<string, number[]>();
  for (const [s, key] of championKeyBySeason) {
    if (!key) continue;
    pushSeason(championSeasonsByKey, key, s);
  }
  for (const [key, arr] of championSeasonsByKey) {
    arr.sort((a, b) => a - b);
    titlesByKey.set(key, arr.length);
  }

  const runnerUpSeasonsByKey = new Map<string, number[]>();
  const thirdPlaceSeasonsByKey = new Map<string, number[]>();
  for (const [s, key] of runnerUpKeyBySeason) pushSeason(runnerUpSeasonsByKey, key, s);
  for (const [s, key] of thirdPlaceKeyBySeason) pushSeason(thirdPlaceSeasonsByKey, key, s);
  for (const arr of runnerUpSeasonsByKey.values()) arr.sort((a, b) => a - b);
  for (const arr of thirdPlaceSeasonsByKey.values()) arr.sort((a, b) => a - b);

  const partialLegacySeasons = seasons.filter((s) => coverageBySeason.get(s) === "partial_legacy");
  const fullSeasons = seasons.filter((s) => coverageBySeason.get(s) === "full");

  const resolvedSeasons = [...championKeyBySeason.entries()].filter(([, k]) => !!k).map(([s]) => s);
  const latestCompletedSeason = resolvedSeasons.length ? Math.max(...resolvedSeasons) : null;
  const reigningKey =
    latestCompletedSeason != null ? championKeyBySeason.get(latestCompletedSeason) ?? null : null;

  const championshipYears = resolvedSeasons.length ? resolvedSeasons : [];
  const matchupYears = [...matchupSeasons].sort((a, b) => a - b);

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
    runnerUpKeyBySeason,
    runnerUpNameBySeason,
    thirdPlaceKeyBySeason,
    thirdPlaceNameBySeason,
    coverageBySeason,
    partialLegacySeasons,
    fullSeasons,
    championshipCoverageStart: championshipYears.length ? Math.min(...championshipYears) : null,
    championshipCoverageEnd: championshipYears.length ? Math.max(...championshipYears) : null,
    matchupCoverageStart: matchupYears.length ? matchupYears[0]! : null,
    matchupCoverageEnd: matchupYears.length ? matchupYears[matchupYears.length - 1]! : null,
    runnerUpSeasonsByKey,
    thirdPlaceSeasonsByKey,
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
    .select({
      season: leagueMedals.season,
      championOwner: leagueMedals.championOwner,
      runnerUpOwner: leagueMedals.runnerUpOwner,
      thirdPlaceOwner: leagueMedals.thirdPlaceOwner,
    })
    .from(leagueMedals)
    .where(eq(leagueMedals.leagueId, leagueId))
    .orderBy(asc(leagueMedals.season))) as MedalRowLite[];

  const aliasRows = await db
    .select({
      legacyTeamName: ownerAliases.legacyTeamName,
      resolvedOwnerName: ownerAliases.resolvedOwnerName,
      status: ownerAliases.status,
    })
    .from(ownerAliases)
    .where(eq(ownerAliases.leagueId, leagueId));

  const matchupRows = await db
    .select({ season: gmMatchups.season })
    .from(gmMatchups)
    .where(and(eq(gmMatchups.leagueId, leagueId), eq(gmMatchups.isCompleted, 1)));
  const matchupSeasons = new Set(
    matchupRows.map((r) => Number(r.season)).filter((s) => Number.isFinite(s) && s > 0),
  );

  return resolveChampionsFromRows(allRows, medalRows, {
    aliasLabelToKey: buildApprovedAliasLabelToOwnerKey(allRows, aliasRows),
    matchupSeasons,
  });
}
