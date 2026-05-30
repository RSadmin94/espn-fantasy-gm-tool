/**
 * Owner profile payload for Owner Profiles + side-by-side comparison.
 * W/L/T and career records come from deduped completed *regular-season* matchups
 * (DB + ESPN combined cache), not from gmTeams.wins/losses (which may be wrong).
 * Medals follow Ring of Honor: team labels in league_medals → owner via gmTeams name match.
 */
import { gmDraftPicks, gmMatchups, gmTeams, leagueMedals } from "../drizzle/schema";
import { and as andDrizzle, asc as ascDrizzle, eq as eqDrizzle } from "drizzle-orm";
import { getCachedViewWithTier } from "./db";
import { normalizeMatchups } from "./espnService";
import {
  buildTeamsBySeason,
  parseDraftPickTeamNameFromRawPick,
  resolveDraftPickOwner,
  type TeamSeasonRow,
} from "./resolveDraftPickOwner";

/** Seasons we expect owner timelines / diagnostics to cover (inclusive). */
export const OWNER_PROFILE_HIST_SEASONS: readonly number[] = Object.freeze(
  Array.from({ length: 2026 - 2010 + 1 }, (_, i) => 2010 + i),
);

export type FlatRegularSeasonMatchup = {
  season: number;
  matchupPeriodId: number;
  week: number;
  homeTeamId: number;
  awayTeamId: number;
  winnerTeamId: number | null;
  isCompleted: number;
  homeScore: number;
  awayScore: number;
};

/** Per-profile canonical owner / merge diagnostics (DB-only, no draft history). */
export type OwnerIdentityMergeDiagnostics = {
  canonicalOwnerName: string;
  ownerDisplayName: string;
  linkedTeamIds: Array<{ season: number; teamId: number }>;
  linkedTeamNames: string[];
  activeSeasons: number[];
  resolvedBy: "teamId" | "seasonTeamName" | "crossSeasonTeamName" | "canonicalMerge" | "unknown";
  sourceTeamIds: string[];
  sourceTeamNames: string[];
  unresolvedRecordCount: number;
  mergeAudit: string[];
};

export type OwnerProfileResolutionDiagnostics = {
  unresolvedTeamNames: string[];
  unresolvedSeasonTeams: Array<{ season: number; reason: string }>;
  missingRecordSeasons: number[];
  missingMedalJoinSeasons: Array<{ season: number; slot: "champion" | "runnerUp" | "third"; raw: string }>;
  /** V1 identity merge audit (Owner Profiles canonical person). */
  identityMerge?: OwnerIdentityMergeDiagnostics;
};

export type OwnerProfileRecordBundle = {
  /** season:teamId → display label for matchup intel / H2H */
  l1TeamOwnerDisplay: Map<string, string>;
  diagnostics: OwnerProfileResolutionDiagnostics;
  /** Snapshot fields derived from matchups + medals (not gmTeams W/L). */
  snapshotFromRecords: Pick<
    OwnerProfilePayload["snapshot"],
    | "seasons"
    | "totalWins"
    | "totalLosses"
    | "totalTies"
    | "winPct"
    | "championships"
    | "runnerUps"
    | "thirdPlace"
    | "champSeasons"
    | "runnerUpSeasons"
    | "thirdSeasons"
    | "bestSeason"
    | "worstSeason"
    | "seasonRecords"
  >;
};

export type OwnerProfilePayload = {
  ownerName: string;
  snapshot: {
    seasons: number[];
    currentTeam: string;
    totalWins: number;
    totalLosses: number;
    totalTies: number;
    winPct: number;
    championships: number;
    runnerUps: number;
    thirdPlace: number;
    champSeasons: number[];
    runnerUpSeasons: number[];
    thirdSeasons: number[];
    bestSeason: {
      season: number;
      teamName: string;
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
      playoffSeed: number | null;
      finalStanding: number | null;
      isChampion: boolean;
      isRunnerUp: boolean;
      isThirdPlace: boolean;
    };
    worstSeason: {
      season: number;
      teamName: string;
      wins: number;
      losses: number;
      ties: number;
      pointsFor: number;
      pointsAgainst: number;
      playoffSeed: number | null;
      finalStanding: number | null;
      isChampion: boolean;
      isRunnerUp: boolean;
      isThirdPlace: boolean;
    };
    seasonRecords: Array<{
      season: number;
      teamName: string;
      wins: number;
      losses: number;
      ties: number;
      matchupGames: number;
      pointsFor: number;
      pointsAgainst: number;
      playoffSeed: number | null;
      finalStanding: number | null;
      isChampion: boolean;
      isRunnerUp: boolean;
      isThirdPlace: boolean;
    }>;
  };
  draftDNA: {
    totalPicks: number;
    posShare: Record<string, number>;
    earlyPos: Record<string, number>;
    avgRoundByPos: Record<string, number>;
    mostDraftedPos: string[];
  };
  keeperDNA: {
    totalKeepers: number;
    keeperRate: number;
    keeperPosDist: Record<string, number>;
    avgKeeperRound: number | null;
    lastYearKeepers: Array<{ playerName: string; position: string; round: number }>;
  };
  activityDNA: {
    totalAcq: number;
    totalDrops: number;
    totalTrades: number;
    totalIR: number;
    avgTxnPerSeason: number;
    mostActiveSeason: {
      season: number;
      acquisitions: number;
      drops: number;
      trades: number;
      moveToActive: number;
      moveToIR: number;
      total: number;
    } | null;
    txnSeasons: Array<{
      season: number;
      acquisitions: number;
      drops: number;
      trades: number;
      moveToActive: number;
      moveToIR: number;
      total: number;
    }>;
  };
  scoutingSummary: string;
  ownerResolutionDiagnostics: OwnerProfileResolutionDiagnostics;
  matchupIntel: Array<{
    opponentOwner: string;
    games: number;
    wins: number;
    losses: number;
    ties: number;
    winPct: number;
    tag: string;
    recentGames: Array<{
      season: number;
      week: number;
      ownerScore?: number;
      opponentScore?: number;
      result: "W" | "L" | "T";
      margin?: number;
    }>;
  }>;
  matchupIntelDiagnostics: {
    unresolvedMatchups: number;
    recentGamesOmittedScores: number;
  };
  /** Canonical pipeline diagnostics (owner key + matchup-derived records). */
  dataSourceDiagnostics: {
    recordSource: string;
    medalSource: string;
    serviceVersion: string;
    ownerKey: string;
    displayName: string;
    mergedOwnerAliases: string[];
    mergedTeamNames: string[];
    totalResolvedMatchups: number;
    missingRecordSeasons: number[];
    /** Mirrors identityMerge.resolvedBy for quick UI scan. */
    identityResolvedBy?: OwnerIdentityMergeDiagnostics["resolvedBy"];
  };
};

type DraftRowIn = {
  playerName: string | null;
  position: string | null;
  roundId: number;
  isKeeper: number;
  season: number;
  teamId: number;
  rawPick: string | null;
};

export type MatchupRowIn = {
  homeTeamId: number;
  awayTeamId: number;
  winnerTeamId: number | null;
  season: number;
  week: number;
  homeScore: unknown;
  awayScore: unknown;
};

export type GmTeamRow = typeof gmTeams.$inferSelect;

// ── Owner identity (aligned with owners.ownerAllTimeRecords / Ring of Honor) ──

export function normalizeOwnerStr(raw: string): string {
  if (!raw) return "";
  return raw.trim().replace(/^\(+|\)+$/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable person key for cross-season identity: trim/lowercase via {@link normalizeOwnerStr},
 * then strip punctuation and collapse spaces so "Jan", "Jan.", and "JAN" match.
 */
export function personMergeKey(raw: string): string {
  const n = normalizeOwnerStr(raw);
  if (!n) return "";
  return n.replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
}

class OwnerKeyUnionFind {
  private readonly parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (ra.localeCompare(rb) < 0) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }
}

function pickCanonicalOwnerKeyFromSet(members: Set<string>): string {
  const arr = [...members];
  const ids = arr.filter((k) => k.startsWith("id:")).sort((a, b) => a.localeCompare(b));
  if (ids.length > 0) return ids[0]!;
  return arr.sort((a, b) => a.localeCompare(b))[0] ?? "name:unknown";
}

/**
 * Maps raw {@link resolveOwnerKey} values to one canonical profile key per human
 * (same non-empty owner display person key, or same ownerId, unions).
 */
export function buildRawKeyToCanonicalProfileKey(allRows: GmTeamRow[]): Map<string, string> {
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const rowKey = (t: GmTeamRow) =>
    resolveOwnerKey(String(t.ownerId || "").trim(), t.ownerName || "", t.name || "", nameToOwnerId);

  const uf = new OwnerKeyUnionFind();
  const allKeys = new Set<string>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    allKeys.add(rowKey(t));
  }

  const personKeyToKeys = new Map<string, Set<string>>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    const k = rowKey(t);
    const o = (t.ownerName || "").trim();
    if (!o) continue;
    const pk = personMergeKey(o);
    if (!pk) continue;
    if (!personKeyToKeys.has(pk)) personKeyToKeys.set(pk, new Set());
    personKeyToKeys.get(pk)!.add(k);
  }
  for (const set of personKeyToKeys.values()) {
    const arr = [...set];
    for (let i = 1; i < arr.length; i++) uf.union(arr[0]!, arr[i]!);
  }

  const ownerIdToKeys = new Map<string, Set<string>>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    const id = String(t.ownerId || "").trim();
    if (!id) continue;
    const k = rowKey(t);
    if (!ownerIdToKeys.has(id)) ownerIdToKeys.set(id, new Set());
    ownerIdToKeys.get(id)!.add(k);
  }
  for (const set of ownerIdToKeys.values()) {
    const arr = [...set];
    for (let i = 1; i < arr.length; i++) uf.union(arr[0]!, arr[i]!);
  }

  const rootToMembers = new Map<string, Set<string>>();
  for (const k of allKeys) {
    const r = uf.find(k);
    if (!rootToMembers.has(r)) rootToMembers.set(r, new Set());
    rootToMembers.get(r)!.add(k);
  }

  const remap = new Map<string, string>();
  for (const members of rootToMembers.values()) {
    const canon = pickCanonicalOwnerKeyFromSet(members);
    for (const m of members) remap.set(m, canon);
  }
  return remap;
}

/** `season:teamId` → canonical profile owner key (for matchup / list aggregation). */
export function buildTeamToCanonicalProfileKey(allRows: GmTeamRow[]): Map<string, string> {
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const remap = buildRawKeyToCanonicalProfileKey(allRows);
  const m = new Map<string, string>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    const raw = resolveOwnerKey(String(t.ownerId || "").trim(), t.ownerName || "", t.name || "", nameToOwnerId);
    m.set(`${t.season}:${t.teamId}`, remap.get(raw) ?? raw);
  }
  return m;
}

export function cleanOwnerDisplay(raw: string): string {
  if (!raw) return "";
  return raw.trim().replace(/^\(+|\)+$/g, "").trim();
}

export function buildNameToOwnerId(allRows: GmTeamRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of allRows) {
    const id = (t.ownerId || "").trim();
    if (!id) continue;
    const disp = (t.ownerName || "").trim() || (t.name || "").trim();
    const pk = personMergeKey(disp);
    if (pk && !m.has(pk)) m.set(pk, id);
  }
  return m;
}

export function resolveOwnerKey(
  ownerId: string,
  ownerName: string,
  fallback: string,
  nameToOwnerId: ReadonlyMap<string, string>,
): string {
  const id = (ownerId || "").trim();
  if (id) return `id:${id}`;
  const pk = personMergeKey(ownerName || fallback);
  const bridged = nameToOwnerId.get(pk);
  return bridged ? `id:${bridged}` : `name:${pk || "unknown"}`;
}

/** All team rows for this human owner (cross-season ownerId / person key / name bridge). */
export function resolveOwnerTeamsForProfile(
  allRows: GmTeamRow[],
  ownerDisplayName: string,
  opts?: { season?: number; teamId?: number },
): {
  profileOwnerKey: string;
  ownerTeamRows: GmTeamRow[];
  identityMerge: OwnerIdentityMergeDiagnostics;
} | null {
  const trimmed = ownerDisplayName.trim();
  if (!trimmed) return null;
  const normIn = normalizeOwnerStr(trimmed);
  const pkWant = personMergeKey(trimmed);
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const remap = buildRawKeyToCanonicalProfileKey(allRows);
  const rowKey = (t: GmTeamRow) =>
    resolveOwnerKey(String(t.ownerId || "").trim(), t.ownerName || "", t.name || "", nameToOwnerId);

  let seedCanonical: string | null = null;

  if (opts?.season != null && opts?.teamId != null) {
    const hit = allRows.find((t) => t.season === opts.season && t.teamId === opts.teamId);
    if (!hit) return null;
    const raw = rowKey(hit);
    seedCanonical = remap.get(raw) ?? raw;
  } else {
    const seeds = allRows.filter((t) => {
      if (t.teamId <= 0) return false;
      const o = (t.ownerName || "").trim();
      if (o) {
        return o === trimmed || normalizeOwnerStr(o) === normIn || personMergeKey(o) === pkWant;
      }
      const tn = (t.name || "").trim();
      return Boolean(tn && personMergeKey(tn) === pkWant);
    });
    if (seeds.length === 0) return null;
    const raw0 = rowKey(seeds[0]!);
    seedCanonical = remap.get(raw0) ?? raw0;
  }

  const ownerTeamRows = allRows
    .filter((t) => {
      if (t.teamId <= 0) return false;
      const raw = rowKey(t);
      return (remap.get(raw) ?? raw) === seedCanonical;
    })
    .sort((a, b) => a.season - b.season || a.teamId - b.teamId);

  if (ownerTeamRows.length === 0) return null;

  const profileOwnerKey = seedCanonical;
  const rawKeysInCluster = new Set(ownerTeamRows.map((t) => rowKey(t)));
  const distinctOwnerIds = new Set(ownerTeamRows.map((t) => String(t.ownerId || "").trim()).filter(Boolean));

  let resolvedBy: OwnerIdentityMergeDiagnostics["resolvedBy"] = "unknown";
  if (opts?.season != null && opts?.teamId != null) {
    resolvedBy = "teamId";
  } else if (rawKeysInCluster.size > 1 || distinctOwnerIds.size > 1) {
    resolvedBy = "canonicalMerge";
  } else {
    const seasonSet = new Set(ownerTeamRows.map((t) => t.season));
    resolvedBy = seasonSet.size <= 1 ? "seasonTeamName" : "crossSeasonTeamName";
  }

  const linkedTeamIds = ownerTeamRows.map((t) => ({ season: t.season, teamId: t.teamId }));
  const linkedTeamNames = [...new Set(ownerTeamRows.map((t) => (t.name || "").trim()).filter(Boolean))].sort();
  const activeSeasons = [...new Set(ownerTeamRows.map((t) => t.season))].sort((a, b) => a - b);
  const sourceTeamIds = [...new Set(ownerTeamRows.map((t) => `${t.season}:${t.teamId}`))].sort();
  const sourceTeamNames = [...new Set(ownerTeamRows.map((t) => (t.name || "").trim()).filter(Boolean))].sort();
  const ownerAliases = [...new Set(ownerTeamRows.map((t) => (t.ownerName || "").trim()).filter(Boolean))].sort();
  const canonicalOwnerName =
    cleanOwnerDisplay(ownerTeamRows[ownerTeamRows.length - 1]?.ownerName?.trim() || trimmed) || trimmed;

  const mergeAudit: string[] = [];
  if (rawKeysInCluster.size > 1) {
    mergeAudit.push(`Merged ${rawKeysInCluster.size} raw owner keys into canonical ${profileOwnerKey}.`);
  }
  if (distinctOwnerIds.size > 1) {
    mergeAudit.push(`Linked ${distinctOwnerIds.size} ESPN ownerId values under person key "${pkWant}".`);
  }
  for (const r of rawKeysInCluster) {
    if (r !== profileOwnerKey) mergeAudit.push(`Remapped ${r} → ${profileOwnerKey}.`);
  }

  const identityMerge: OwnerIdentityMergeDiagnostics = {
    canonicalOwnerName,
    ownerDisplayName: canonicalOwnerName,
    linkedTeamIds,
    linkedTeamNames,
    activeSeasons,
    resolvedBy,
    sourceTeamIds,
    sourceTeamNames,
    unresolvedRecordCount: 0,
    mergeAudit: mergeAudit.slice(0, 24),
  };

  return { profileOwnerKey, ownerTeamRows, identityMerge };
}

function buildL1TeamOwnerDisplay(allRows: GmTeamRow[]): Map<string, string> {
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const l1 = new Map<string, string>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    const key = resolveOwnerKey(t.ownerId || "", t.ownerName || "", t.name || "", nameToOwnerId);
    const raw = (t.ownerName || "").trim() || (t.name || "").trim();
    const display =
      key.startsWith("id:")
        ? cleanOwnerDisplay(raw) || cleanOwnerDisplay(t.name || "") || `Team ${t.teamId}`
        : cleanOwnerDisplay(raw) || cleanOwnerDisplay(t.name || "") || `Team ${t.teamId}`;
    l1.set(`${t.season}:${t.teamId}`, display);
  }
  return l1;
}

export function buildTeamToOwnerKey(allRows: GmTeamRow[]): Map<string, string> {
  const nameToOwnerId = buildNameToOwnerId(allRows);
  const m = new Map<string, string>();
  for (const t of allRows) {
    if (t.teamId <= 0) continue;
    const k = resolveOwnerKey(t.ownerId || "", t.ownerName || "", t.name || "", nameToOwnerId);
    m.set(`${t.season}:${t.teamId}`, k);
  }
  return m;
}

/** Ring-of-Honor style: medal fields are usually fantasy team names; fallback to ownerName match. */
export function resolveMedalTeamToOwnerKey(
  season: number,
  teamLabel: string | null,
  allRows: GmTeamRow[],
  nameToOwnerId: ReadonlyMap<string, string>,
): string | null {
  if (!teamLabel?.trim()) return null;
  const norm = normalizeOwnerStr(teamLabel);
  const inSeason = allRows.filter((r) => r.season === season);
  const matchTeamName = inSeason.find((r) => normalizeOwnerStr(r.name) === norm);
  if (matchTeamName) {
    return resolveOwnerKey(
      matchTeamName.ownerId || "",
      matchTeamName.ownerName || "",
      matchTeamName.name || "",
      nameToOwnerId,
    );
  }
  const matchOwnerName = inSeason.find((r) => normalizeOwnerStr(r.ownerName) === norm);
  if (matchOwnerName) {
    return resolveOwnerKey(
      matchOwnerName.ownerId || "",
      matchOwnerName.ownerName || "",
      matchOwnerName.name || "",
      nameToOwnerId,
    );
  }
  return null;
}

/**
 * Regular-season completed matchups: gmMatchups + cache fallback per season
 * (same strategy as owners.ownerAllTimeRecords), deduped, playoff excluded.
 */
export async function loadFlatRegularSeasonMatchups(args: {
  db: import("./db").AppDb;
  leagueId: string;
  userId: number;
}): Promise<FlatRegularSeasonMatchup[]> {
  const { db, leagueId: lid, userId } = args;
  const out: FlatRegularSeasonMatchup[] = [];
  const seen = new Set<string>();

  const dbRows = await db
    .select({
      homeTeamId: gmMatchups.homeTeamId,
      awayTeamId: gmMatchups.awayTeamId,
      winnerTeamId: gmMatchups.winnerTeamId,
      season: gmMatchups.season,
      week: gmMatchups.week,
      matchupPeriodId: gmMatchups.matchupPeriodId,
      homeScore: gmMatchups.homeScore,
      awayScore: gmMatchups.awayScore,
      isCompleted: gmMatchups.isCompleted,
    })
    .from(gmMatchups)
    .where(
      andDrizzle(
        eqDrizzle(gmMatchups.leagueId, lid),
        eqDrizzle(gmMatchups.isPlayoff, 0),
        eqDrizzle(gmMatchups.isCompleted, 1),
      ),
    );

  const covered = new Set<number>();
  for (const r of dbRows) {
    covered.add(r.season);
    const hid = Number(r.homeTeamId);
    const aid = Number(r.awayTeamId);
    if (!hid || !aid) continue;
    const mk = `${r.season}|${r.matchupPeriodId}|${hid}|${aid}`;
    if (seen.has(mk)) continue;
    seen.add(mk);
    out.push({
      season: r.season,
      matchupPeriodId: r.matchupPeriodId,
      week: r.week,
      homeTeamId: hid,
      awayTeamId: aid,
      winnerTeamId: r.winnerTeamId != null ? Number(r.winnerTeamId) : null,
      isCompleted: r.isCompleted,
      homeScore: Number(r.homeScore),
      awayScore: Number(r.awayScore),
    });
  }

  for (const s of OWNER_PROFILE_HIST_SEASONS) {
    if (covered.has(s)) continue;
    const hit = await getCachedViewWithTier(s, "combined", lid, { userId });
    const payload = hit?.row?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    try {
      const norm = normalizeMatchups(payload as Record<string, unknown>);
      for (const m of norm) {
        const tier = String(m.playoffTierType || "");
        if (tier && tier !== "NONE") continue;
        const hid = Number(m.homeTeamId);
        const aid = Number(m.awayTeamId);
        if (!hid || !aid || !Number.isFinite(hid) || !Number.isFinite(aid)) continue;
        const winnerStr = String(m.winner ?? "UNDECIDED");
        const winnerTeamId = winnerStr === "HOME" ? hid : winnerStr === "AWAY" ? aid : null;
        const mpid = Number(m.matchupPeriodId) || 0;
        const week = Number(m.scoringPeriodId) || 0;
        const mk = `${s}|${mpid}|${hid}|${aid}`;
        if (seen.has(mk)) continue;
        seen.add(mk);
        const hs = Number(m.homeTotalPoints ?? 0) || 0;
        const ascr = Number(m.awayTotalPoints ?? 0) || 0;
        out.push({
          season: s,
          matchupPeriodId: mpid,
          week,
          homeTeamId: hid,
          awayTeamId: aid,
          winnerTeamId,
          isCompleted: winnerTeamId != null ? 1 : 0,
          homeScore: hs,
          awayScore: ascr,
        });
      }
    } catch {
      /* skip malformed */
    }
  }

  return out;
}

function bumpWL(
  map: Map<string, { wins: number; losses: number; ties: number; games: number }>,
  sk: string,
  field: "wins" | "losses" | "ties",
) {
  if (!map.has(sk)) map.set(sk, { wins: 0, losses: 0, ties: 0, games: 0 });
  const o = map.get(sk)!;
  o[field]++;
  o.games = o.wins + o.losses + o.ties;
}

/** Aggregate regular-season W/L/T per ownerKey per season from flat matchups. */
export function aggregateMatchupWLByOwnerSeason(
  flat: FlatRegularSeasonMatchup[],
  teamToOwnerKey: Map<string, string>,
): Map<string, { wins: number; losses: number; ties: number; games: number }> {
  const byKey = new Map<string, { wins: number; losses: number; ties: number; games: number }>();
  const seen = new Set<string>();

  for (const m of flat) {
    if (m.isCompleted !== 1) continue;
    const hid = m.homeTeamId;
    const aid = m.awayTeamId;
    if (!hid || !aid || hid === aid) continue;
    const mk = `${m.season}|${m.matchupPeriodId}|${hid}|${aid}`;
    if (seen.has(mk)) continue;
    seen.add(mk);

    const homeKey = teamToOwnerKey.get(`${m.season}:${hid}`);
    const awayKey = teamToOwnerKey.get(`${m.season}:${aid}`);
    if (!homeKey || !awayKey || homeKey === awayKey) continue;

    const wtid = m.winnerTeamId != null && Number.isFinite(m.winnerTeamId) ? m.winnerTeamId : null;
    const hk = `${m.season}##${homeKey}`;
    const ak = `${m.season}##${awayKey}`;
    if (wtid === hid) {
      bumpWL(byKey, hk, "wins");
      bumpWL(byKey, ak, "losses");
    } else if (wtid === aid) {
      bumpWL(byKey, ak, "wins");
      bumpWL(byKey, hk, "losses");
    } else {
      bumpWL(byKey, hk, "ties");
      bumpWL(byKey, ak, "ties");
    }
  }
  return byKey;
}

function seasonRowForOwner(
  season: number,
  profileOwnerKey: string,
  wlMap: Map<string, { wins: number; losses: number; ties: number; games: number }>,
): { wins: number; losses: number; ties: number; games: number } {
  const k = `${season}##${profileOwnerKey}`;
  return wlMap.get(k) ?? { wins: 0, losses: 0, ties: 0, games: 0 };
}

function standingSortVal(s: number | null | undefined): number {
  return s == null || !Number.isFinite(Number(s)) ? 999 : Number(s);
}

export function computeOwnerProfileRecordBundle(args: {
  profileOwnerKey: string;
  ownerTeamRows: GmTeamRow[];
  allLeagueGmRows: GmTeamRow[];
  medalRows: (typeof leagueMedals.$inferSelect)[];
  flatRegularSeason: FlatRegularSeasonMatchup[];
}): OwnerProfileRecordBundle {
  const { profileOwnerKey: profileOwnerKeyIn, ownerTeamRows, allLeagueGmRows, medalRows, flatRegularSeason } = args;
  const nameToOwnerId = buildNameToOwnerId(allLeagueGmRows);
  const keyRemap = buildRawKeyToCanonicalProfileKey(allLeagueGmRows);
  const profileOwnerKey = keyRemap.get(profileOwnerKeyIn) ?? profileOwnerKeyIn;
  const rawTeamToOwner = buildTeamToOwnerKey(allLeagueGmRows);
  const teamToOwnerKey = new Map<string, string>();
  for (const [sk, rk] of rawTeamToOwner) {
    teamToOwnerKey.set(sk, keyRemap.get(rk) ?? rk);
  }
  const l1TeamOwnerDisplay = buildL1TeamOwnerDisplay(allLeagueGmRows);
  const wlByOwnerSeason = aggregateMatchupWLByOwnerSeason(flatRegularSeason, teamToOwnerKey);

  const missingMedalJoinSeasons: OwnerProfileResolutionDiagnostics["missingMedalJoinSeasons"] = [];
  const champSeasons: number[] = [];
  const runnerUpSeasons: number[] = [];
  const thirdSeasons: number[] = [];

  const canonMedalKey = (k: string | null) => (k == null ? null : keyRemap.get(k) ?? k);

  for (const m of medalRows) {
    const ck = canonMedalKey(resolveMedalTeamToOwnerKey(m.season, m.championOwner, allLeagueGmRows, nameToOwnerId));
    if (m.championOwner?.trim() && !ck) {
      missingMedalJoinSeasons.push({ season: m.season, slot: "champion", raw: m.championOwner });
    } else if (ck === profileOwnerKey) {
      champSeasons.push(m.season);
    }

    const rk = canonMedalKey(resolveMedalTeamToOwnerKey(m.season, m.runnerUpOwner, allLeagueGmRows, nameToOwnerId));
    if (m.runnerUpOwner?.trim() && !rk) {
      missingMedalJoinSeasons.push({ season: m.season, slot: "runnerUp", raw: m.runnerUpOwner });
    } else if (rk === profileOwnerKey) {
      runnerUpSeasons.push(m.season);
    }

    const tk = canonMedalKey(resolveMedalTeamToOwnerKey(m.season, m.thirdPlaceOwner, allLeagueGmRows, nameToOwnerId));
    if (m.thirdPlaceOwner?.trim() && !tk) {
      missingMedalJoinSeasons.push({ season: m.season, slot: "third", raw: m.thirdPlaceOwner });
    } else if (tk === profileOwnerKey) {
      thirdSeasons.push(m.season);
    }
  }

  const uniq = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);
  const champS = uniq(champSeasons);
  const runS = uniq(runnerUpSeasons);
  const thirdS = uniq(thirdSeasons);

  const leagueSeasonsWithTeams = new Set(allLeagueGmRows.map((r) => r.season));
  const ownerSeasonsWithRow = new Set(ownerTeamRows.map((r) => r.season));
  const unresolvedSeasonTeams: OwnerProfileResolutionDiagnostics["unresolvedSeasonTeams"] = [];
  for (const s of OWNER_PROFILE_HIST_SEASONS) {
    if (!leagueSeasonsWithTeams.has(s)) continue;
    if (!ownerSeasonsWithRow.has(s)) {
      unresolvedSeasonTeams.push({
        season: s,
        reason: "League has gmTeams rows for this season but none for this owner key — team/owner link may be missing or renamed.",
      });
    }
  }

  const missingRecordSeasons: number[] = [];
  const seasonSet = new Set<number>([...ownerSeasonsWithRow]);
  for (const [k] of wlByOwnerSeason) {
    if (!k.endsWith(`##${profileOwnerKey}`)) continue;
    const ix = k.indexOf("##");
    if (ix < 0) continue;
    const se = Number(k.slice(0, ix));
    if (Number.isFinite(se)) seasonSet.add(se);
  }
  const seasonsSorted = [...seasonSet].sort((a, b) => a - b);

  let totalWins = 0;
  let totalLosses = 0;
  let totalTies = 0;
  for (const s of seasonsSorted) {
    const wl = seasonRowForOwner(s, profileOwnerKey, wlByOwnerSeason);
    totalWins += wl.wins;
    totalLosses += wl.losses;
    totalTies += wl.ties;
    const gmForSeason = [...ownerTeamRows].filter((r) => r.season === s).sort((a, b) => b.teamId - a.teamId)[0];
    if (gmForSeason && wl.games === 0 && flatRegularSeason.some((m) => m.season === s)) {
      missingRecordSeasons.push(s);
    }
  }

  const totalGames = totalWins + totalLosses + totalTies;
  const winPct = totalGames > 0 ? Number((((totalWins + 0.5 * totalTies) / totalGames) * 100).toFixed(1)) : 0;

  const seasonRecords = seasonsSorted.map((s) => {
    const wl = seasonRowForOwner(s, profileOwnerKey, wlByOwnerSeason);
    const gmForSeason = [...ownerTeamRows].filter((r) => r.season === s).sort((a, b) => b.teamId - a.teamId)[0];
    return {
      season: s,
      teamName: gmForSeason?.name ?? "—",
      wins: wl.wins,
      losses: wl.losses,
      ties: wl.ties,
      matchupGames: wl.games,
      pointsFor: gmForSeason ? Number(gmForSeason.pointsFor) : 0,
      pointsAgainst: gmForSeason ? Number(gmForSeason.pointsAgainst) : 0,
      playoffSeed: gmForSeason?.playoffSeed ?? null,
      finalStanding: gmForSeason?.finalStanding ?? null,
      isChampion: champS.includes(s),
      isRunnerUp: runS.includes(s),
      isThirdPlace: thirdS.includes(s),
    };
  });

  const withPct = seasonRecords.map((sr) => {
    const g = sr.wins + sr.losses + sr.ties;
    const pct = g > 0 ? ((sr.wins + 0.5 * sr.ties) / g) * 100 : 0;
    return { ...sr, winPct: pct };
  });

  const emptyPick = {
    season: 0,
    teamName: "—",
    wins: 0,
    losses: 0,
    ties: 0,
    matchupGames: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    playoffSeed: null as number | null,
    finalStanding: null as number | null,
    isChampion: false,
    isRunnerUp: false,
    isThirdPlace: false,
    winPct: 0,
  };

  const bestSeason =
    withPct.length > 0
      ? [...withPct].sort((a, b) => {
          if (b.winPct !== a.winPct) return b.winPct - a.winPct;
          if (b.wins !== a.wins) return b.wins - a.wins;
          return standingSortVal(a.finalStanding) - standingSortVal(b.finalStanding);
        })[0]!
      : emptyPick;
  const worstSeason =
    withPct.length > 0
      ? [...withPct].sort((a, b) => {
          if (a.winPct !== b.winPct) return a.winPct - b.winPct;
          if (a.wins !== b.wins) return a.wins - b.wins;
          return standingSortVal(b.finalStanding) - standingSortVal(a.finalStanding);
        })[0]!
      : emptyPick;

  const snapshotFromRecords = {
    seasons: seasonsSorted,
    totalWins,
    totalLosses,
    totalTies,
    winPct,
    championships: champS.length,
    runnerUps: runS.length,
    thirdPlace: thirdS.length,
    champSeasons: champS,
    runnerUpSeasons: runS,
    thirdSeasons: thirdS,
    bestSeason: {
      season: bestSeason.season,
      teamName: bestSeason.teamName,
      wins: bestSeason.wins,
      losses: bestSeason.losses,
      ties: bestSeason.ties,
      pointsFor: bestSeason.pointsFor,
      pointsAgainst: bestSeason.pointsAgainst,
      playoffSeed: bestSeason.playoffSeed,
      finalStanding: bestSeason.finalStanding,
      isChampion: bestSeason.isChampion,
      isRunnerUp: bestSeason.isRunnerUp,
      isThirdPlace: bestSeason.isThirdPlace,
    },
    worstSeason: {
      season: worstSeason.season,
      teamName: worstSeason.teamName,
      wins: worstSeason.wins,
      losses: worstSeason.losses,
      ties: worstSeason.ties,
      pointsFor: worstSeason.pointsFor,
      pointsAgainst: worstSeason.pointsAgainst,
      playoffSeed: worstSeason.playoffSeed,
      finalStanding: worstSeason.finalStanding,
      isChampion: worstSeason.isChampion,
      isRunnerUp: worstSeason.isRunnerUp,
      isThirdPlace: worstSeason.isThirdPlace,
    },
    seasonRecords,
  };

  return {
    l1TeamOwnerDisplay,
    diagnostics: {
      unresolvedTeamNames: [],
      unresolvedSeasonTeams,
      missingRecordSeasons: [...new Set(missingRecordSeasons)].sort((a, b) => a - b),
      missingMedalJoinSeasons,
    },
    snapshotFromRecords,
  };
}

export async function buildOwnerProfilePayload(args: {
  db: import("./db").AppDb;
  ownerName: string;
  profileOwnerKey: string;
  /** Full league gmTeams rows — required for draft pick → ownerKey bridging (ownerId / name map). */
  allLeagueGmRows?: GmTeamRow[];
  teamRows: GmTeamRow[];
  teamsBySeason: ReturnType<typeof buildTeamsBySeason>;
  draftRows: DraftRowIn[];
  medalRows: (typeof leagueMedals.$inferSelect)[];
  allMatchupRows: MatchupRowIn[] | null;
  recordBundle: OwnerProfileRecordBundle;
  identityMerge?: OwnerIdentityMergeDiagnostics;
}): Promise<OwnerProfilePayload> {
  const {
    ownerName,
    profileOwnerKey,
    allLeagueGmRows,
    teamRows,
    teamsBySeason,
    draftRows,
    allMatchupRows,
    recordBundle,
    identityMerge: identityMergeIn,
  } = args;
  const snapR = recordBundle.snapshotFromRecords;

  const leagueCanonRows = allLeagueGmRows?.length ? allLeagueGmRows : teamRows;
  const nameToOwnerIdFull = buildNameToOwnerId(leagueCanonRows);
  const keyRemapFull = buildRawKeyToCanonicalProfileKey(leagueCanonRows);

  const ownerTeamIds = teamRows.map((t) => t.teamId).filter((id): id is number => id > 0);
  const l1 = recordBundle.l1TeamOwnerDisplay;
  const profilePersonKey = personMergeKey(cleanOwnerDisplay(ownerName) || ownerName);

  const mergedOwnerAliases = [
    ...new Set(teamRows.map((t) => (t.ownerName || "").trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const mergedTeamNames = [...new Set(teamRows.map((t) => (t.name || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const totalResolvedMatchups = snapR.seasonRecords.reduce((s, r) => s + (r.matchupGames || 0), 0);

  const unresolvedDiag = new Set<string>();
  const ownedPicks: Array<{
    playerName: string | null;
    position: string | null;
    roundId: number;
    isKeeper: number;
    season: number;
    teamId: number;
  }> = [];
  for (const row of draftRows) {
    const teamNameFromPick = parseDraftPickTeamNameFromRawPick(row.rawPick);
    const res = resolveDraftPickOwner(
      { season: row.season, teamId: row.teamId, teamName: teamNameFromPick },
      teamsBySeason,
    );
    if (res.source === "unknown") {
      const label =
        teamNameFromPick && teamNameFromPick.trim().length > 0
          ? teamNameFromPick.trim()
          : `(teamId ${row.teamId}, season ${row.season})`;
      unresolvedDiag.add(label);
    }
    const seasonList = teamsBySeason.get(row.season) ?? [];
    const rowById = seasonList.find((t) => t.teamId === row.teamId);
    const pickOwnerKeyRaw = rowById
      ? resolveOwnerKey(
          String(rowById.ownerId ?? "").trim(),
          rowById.ownerName,
          rowById.name,
          nameToOwnerIdFull,
        )
      : resolveOwnerKey("", res.ownerName, teamNameFromPick ?? "", nameToOwnerIdFull);
    const pickOwnerKey = keyRemapFull.get(pickOwnerKeyRaw) ?? pickOwnerKeyRaw;
    if (pickOwnerKey === profileOwnerKey) {
      ownedPicks.push({
        playerName: row.playerName,
        position: row.position,
        roundId: row.roundId,
        isKeeper: row.isKeeper,
        season: row.season,
        teamId: row.teamId,
      });
    }
  }

  const unresolvedTeamNamesSorted = [...unresolvedDiag].sort((a, b) => a.localeCompare(b));
  const unresolvedRecordCount =
    unresolvedTeamNamesSorted.length +
    recordBundle.diagnostics.missingRecordSeasons.length +
    recordBundle.diagnostics.missingMedalJoinSeasons.length;

  const identityMerge: OwnerIdentityMergeDiagnostics | undefined = identityMergeIn
    ? { ...identityMergeIn, unresolvedRecordCount }
    : undefined;

  const ownerResolutionDiagnostics: OwnerProfileResolutionDiagnostics = {
    ...recordBundle.diagnostics,
    unresolvedTeamNames: unresolvedTeamNamesSorted,
    identityMerge,
  };

  const seasons = snapR.seasons;
  const currentTeam = teamRows[teamRows.length - 1]?.name ?? ownerName;

  const totalPicks = ownedPicks.length;
  const posDist: Record<string, number> = {};
  const earlyPos: Record<string, number> = {};
  const posRoundSum: Record<string, number> = {};
  const posRoundCount: Record<string, number> = {};
  for (const p of ownedPicks) {
    const pos = p.position || "UNK";
    posDist[pos] = (posDist[pos] ?? 0) + 1;
    if (p.roundId <= 3) earlyPos[pos] = (earlyPos[pos] ?? 0) + 1;
    posRoundSum[pos] = (posRoundSum[pos] ?? 0) + p.roundId;
    posRoundCount[pos] = (posRoundCount[pos] ?? 0) + 1;
  }
  const posShare: Record<string, number> = {};
  for (const [pos, cnt] of Object.entries(posDist)) {
    posShare[pos] = totalPicks > 0 ? Number(((cnt / totalPicks) * 100).toFixed(1)) : 0;
  }
  const avgRoundByPos: Record<string, number> = {};
  for (const [pos, sum] of Object.entries(posRoundSum)) {
    avgRoundByPos[pos] = Number((sum / posRoundCount[pos]!).toFixed(1));
  }
  const mostDraftedPos = Object.entries(posDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pos]) => pos);

  const keeperPicks = ownedPicks.filter((p) => p.isKeeper === 1);
  const totalKeepers = keeperPicks.length;
  const keeperRate = totalPicks > 0 ? Number(((totalKeepers / totalPicks) * 100).toFixed(1)) : 0;
  const keeperPosDist: Record<string, number> = {};
  let keeperRoundSum = 0;
  for (const p of keeperPicks) {
    const pos = p.position || "UNK";
    keeperPosDist[pos] = (keeperPosDist[pos] ?? 0) + 1;
    keeperRoundSum += p.roundId;
  }
  const avgKeeperRound = totalKeepers > 0 ? Number((keeperRoundSum / totalKeepers).toFixed(1)) : null;
  const lastYearKeepers =
    seasons.length > 0
      ? keeperPicks
          .filter((p) => p.season === Math.max(...seasons))
          .map((p) => ({
            playerName: p.playerName ?? "",
            position: p.position ?? "",
            round: p.roundId,
          }))
      : [];

  type TxnSeason = {
    season: number;
    acquisitions: number;
    drops: number;
    trades: number;
    moveToActive: number;
    moveToIR: number;
    total: number;
  };
  const txnSeasons: TxnSeason[] = [];
  for (const t of teamRows) {
    try {
      const raw = JSON.parse(t.rawTeam || "{}") as Record<string, unknown>;
      const tc = (raw.transactionCounter ?? {}) as Record<string, number>;
      const acq = Number(tc.acquisitions ?? 0);
      const drp = Number(tc.drops ?? 0);
      const trd = Number(tc.trades ?? 0);
      const mta = Number(tc.moveToActive ?? 0);
      const mir = Number(tc.moveToIR ?? 0);
      txnSeasons.push({
        season: t.season,
        acquisitions: acq,
        drops: drp,
        trades: trd,
        moveToActive: mta,
        moveToIR: mir,
        total: acq + drp + trd + mta + mir,
      });
    } catch {
      txnSeasons.push({
        season: t.season,
        acquisitions: 0,
        drops: 0,
        trades: 0,
        moveToActive: 0,
        moveToIR: 0,
        total: 0,
      });
    }
  }
  const txnSeasonsWithData = txnSeasons.filter((s) => s.total > 0);
  const totalAcq = txnSeasons.reduce((s, t) => s + t.acquisitions, 0);
  const totalDrops = txnSeasons.reduce((s, t) => s + t.drops, 0);
  const totalTrades = txnSeasons.reduce((s, t) => s + t.trades, 0);
  const totalIR = txnSeasons.reduce((s, t) => s + t.moveToIR, 0);
  const avgTxnPerSeason =
    txnSeasonsWithData.length > 0
      ? Number((txnSeasonsWithData.reduce((s, t) => s + t.total, 0) / txnSeasonsWithData.length).toFixed(1))
      : 0;
  const mostActiveSeason =
    txnSeasons.length > 0 ? txnSeasons.reduce((best, cur) => (cur.total > best.total ? cur : best)) : null;

  const topPos = mostDraftedPos[0] ?? "unknown";
  const champStr =
    snapR.champSeasons.length > 0
      ? `${snapR.champSeasons.length}-time champion (${snapR.champSeasons.join(", ")})`
      : "no championships yet";
  const keeperStr =
    keeperRate > 20
      ? `heavy keeper user (${keeperRate}% keeper rate)`
      : keeperRate > 10
        ? "moderate keeper user"
        : "rarely uses keepers";
  const txnStyle =
    avgTxnPerSeason > 60
      ? "high-activity manager — frequent FA and waiver moves"
      : avgTxnPerSeason > 30
        ? "moderate transaction volume"
        : avgTxnPerSeason > 0
          ? "low transaction volume — set-and-forget style"
          : "transaction data not available";
  const draftStyle =
    (earlyPos["RB"] ?? 0) > (earlyPos["WR"] ?? 0)
      ? "RB-heavy early drafter"
      : (earlyPos["WR"] ?? 0) > (earlyPos["RB"] ?? 0)
        ? "WR-heavy early drafter"
        : "balanced early-round approach";

  const tw = snapR.totalWins;
  const tl = snapR.totalLosses;
  const tt = snapR.totalTies;
  const scoutingSummary = [
    `${ownerName} has been active for ${seasons.length} season${seasons.length !== 1 ? "s" : ""}${
      seasons.length > 0 ? ` (${seasons[0]}–${seasons[seasons.length - 1]})` : ""
    } with a ${tw}–${tl}${tt ? `–${tt}` : ""} regular-season record from completed matchups (${snapR.winPct}% win rate).`,
    `They are ${champStr}.`,
    `Draft profile: ${draftStyle}, with ${topPos} as their most drafted position (${posShare[topPos] ?? 0}% of picks).`,
    `Keeper profile: ${keeperStr}${avgKeeperRound != null ? `, averaging keeper round ${avgKeeperRound}` : ""}.`,
    `Activity profile: ${txnStyle}.`,
  ].join(" ");

  const ownerTeamIdSet = new Set(ownerTeamIds);
  let matchupIntel: OwnerProfilePayload["matchupIntel"] = [];
  let unresolvedMatchupCount = 0;
  let recentGamesOmittedScores = 0;

  if (ownerTeamIds.length > 0 && allMatchupRows && allMatchupRows.length > 0) {
    const ownerMatchups = allMatchupRows.filter(
      (m) => ownerTeamIdSet.has(m.homeTeamId) || ownerTeamIdSet.has(m.awayTeamId),
    );

    const h2h = new Map<string, { games: number; wins: number; losses: number; ties: number }>();
    const gamesByOpp = new Map<
      string,
      Array<{
        season: number;
        week: number;
        ownerScore?: number;
        opponentScore?: number;
        result: "W" | "L" | "T";
        margin?: number;
      }>
    >();

    for (const m of ownerMatchups) {
      const isHome = ownerTeamIdSet.has(m.homeTeamId);
      const myId = isHome ? m.homeTeamId : m.awayTeamId;
      const oppId = isHome ? m.awayTeamId : m.homeTeamId;
      const oppOwner = l1.get(`${m.season}:${oppId}`) ?? "";
      if (!oppOwner || personMergeKey(oppOwner) === profilePersonKey) {
        unresolvedMatchupCount++;
        continue;
      }
      if (!h2h.has(oppOwner)) h2h.set(oppOwner, { games: 0, wins: 0, losses: 0, ties: 0 });
      const rec = h2h.get(oppOwner)!;
      rec.games++;
      if (!m.winnerTeamId) rec.ties++;
      else if (m.winnerTeamId === myId) rec.wins++;
      else rec.losses++;

      const hs = Number(m.homeScore);
      const ascr = Number(m.awayScore);
      const myScore = isHome ? hs : ascr;
      const oppScore = isHome ? ascr : hs;

      let result: "W" | "L" | "T";
      if (!m.winnerTeamId) result = "T";
      else if (m.winnerTeamId === myId) result = "W";
      else result = "L";

      const bothScoresZero = hs === 0 && ascr === 0;
      const omitScores = bothScoresZero;

      const gameRow: {
        season: number;
        week: number;
        ownerScore?: number;
        opponentScore?: number;
        result: "W" | "L" | "T";
        margin?: number;
      } = { season: m.season, week: m.week, result };

      if (!omitScores) {
        gameRow.ownerScore = myScore;
        gameRow.opponentScore = oppScore;
        gameRow.margin = Number((myScore - oppScore).toFixed(2));
      }

      if (!gamesByOpp.has(oppOwner)) gamesByOpp.set(oppOwner, []);
      gamesByOpp.get(oppOwner)!.push(gameRow);
    }

    matchupIntel = [...h2h.entries()]
      .map(([opponentOwner, agg]) => {
        const wp = agg.games > 0 ? Number(((agg.wins / agg.games) * 100).toFixed(1)) : 0;
        let tag = "Normal";
        if (agg.games >= 3) {
          if (wp >= 75) tag = "Punching Bag";
          else if (wp <= 25) tag = "Nemesis";
          else if (agg.games >= 5 && Math.abs(wp - 50) <= 12) tag = "Rival";
          else if (wp > 55) tag = "Favorable";
          else if (wp < 45) tag = "Difficult";
        }
        const allGames = gamesByOpp.get(opponentOwner) ?? [];
        const recentGames = [...allGames]
          .sort((a, b) => b.season - a.season || b.week - a.week)
          .slice(0, 5);
        return { opponentOwner, ...agg, winPct: wp, tag, recentGames };
      })
      .sort((a, b) => b.games - a.games);
  }

  for (const row of matchupIntel) {
    for (const g of row.recentGames) {
      if (g.ownerScore === undefined) recentGamesOmittedScores++;
    }
  }

  return {
    ownerName,
    snapshot: {
      currentTeam,
      ...snapR,
    },
    draftDNA: {
      totalPicks,
      posShare,
      earlyPos,
      avgRoundByPos,
      mostDraftedPos,
    },
    keeperDNA: {
      totalKeepers,
      keeperRate,
      keeperPosDist,
      avgKeeperRound,
      lastYearKeepers,
    },
    activityDNA: {
      totalAcq,
      totalDrops,
      totalTrades,
      totalIR,
      avgTxnPerSeason,
      mostActiveSeason,
      txnSeasons,
    },
    scoutingSummary,
    ownerResolutionDiagnostics,
    matchupIntel,
    matchupIntelDiagnostics: {
      unresolvedMatchups: unresolvedMatchupCount,
      recentGamesOmittedScores,
    },
    dataSourceDiagnostics: {
      recordSource: "gmMatchupsCompletedRegularSeason",
      medalSource: "league_medals_resolved_by_team_name",
      serviceVersion: "owner-canon-v4",
      ownerKey: profileOwnerKey,
      displayName: cleanOwnerDisplay(ownerName) || ownerName,
      mergedOwnerAliases,
      mergedTeamNames,
      totalResolvedMatchups,
      missingRecordSeasons: [...recordBundle.diagnostics.missingRecordSeasons],
      identityResolvedBy: identityMerge?.resolvedBy,
    },
  };
}

export async function loadOwnerProfileSharedData(args: { db: import("./db").AppDb; leagueId: string }) {
  const { db, leagueId: lid } = args;

  const allLeagueTeams = await db
    .select({
      leagueId: gmTeams.leagueId,
      season: gmTeams.season,
      teamId: gmTeams.teamId,
      teamName: gmTeams.name,
      ownerName: gmTeams.ownerName,
      ownerId: gmTeams.ownerId,
    })
    .from(gmTeams)
    .where(eqDrizzle(gmTeams.leagueId, lid));

  const teamsBySeason = buildTeamsBySeason(
    allLeagueTeams.map((r) => ({
      season: r.season,
      teamId: r.teamId,
      name: r.teamName ?? "",
      ownerName: r.ownerName ?? "",
      ownerId: r.ownerId?.trim() ? r.ownerId.trim() : undefined,
    })),
  );

  const draftRows = await db
    .select({
      playerName: gmDraftPicks.playerName,
      position: gmDraftPicks.position,
      roundId: gmDraftPicks.roundId,
      isKeeper: gmDraftPicks.isKeeper,
      season: gmDraftPicks.season,
      teamId: gmDraftPicks.teamId,
      rawPick: gmDraftPicks.rawPick,
    })
    .from(gmDraftPicks)
    .where(eqDrizzle(gmDraftPicks.leagueId, lid))
    .orderBy(ascDrizzle(gmDraftPicks.season), ascDrizzle(gmDraftPicks.roundId));

  const medalRows = await db.select().from(leagueMedals).where(eqDrizzle(leagueMedals.leagueId, lid));

  return { allLeagueTeams, teamsBySeason, draftRows, medalRows };
}

/** @deprecated Prefer flat matchups + {@link flatMatchupsToIntelRows} for full-season intel. */
export async function loadLeagueMatchupRowsForOwnerProfile(args: { db: import("./db").AppDb; leagueId: string }) {
  const { db, leagueId: lid } = args;
  return db
    .select({
      homeTeamId: gmMatchups.homeTeamId,
      awayTeamId: gmMatchups.awayTeamId,
      winnerTeamId: gmMatchups.winnerTeamId,
      season: gmMatchups.season,
      week: gmMatchups.week,
      homeScore: gmMatchups.homeScore,
      awayScore: gmMatchups.awayScore,
    })
    .from(gmMatchups)
    .where(
      andDrizzle(
        eqDrizzle(gmMatchups.leagueId, lid),
        eqDrizzle(gmMatchups.isPlayoff, 0),
        eqDrizzle(gmMatchups.isCompleted, 1),
      ),
    );
}

export function flatMatchupsToIntelRows(flat: FlatRegularSeasonMatchup[]): MatchupRowIn[] {
  return flat.map((m) => ({
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    winnerTeamId: m.winnerTeamId,
    season: m.season,
    week: m.week,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  }));
}
