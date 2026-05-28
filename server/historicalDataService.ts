/**
 * Cache-first historical reads: normalized MySQL → combined raw cache → legacy caches.
 * Does not invent stats; only surfaces data ESPN / prior syncs already stored.
 */
import { and, desc, eq } from "drizzle-orm";
import { gmDraftPicks, gmMatchups, gmTeams, gmTransactions, syncRuns } from "../drizzle/schema";
import type { CachedViewStorageTier } from "./db";
import { getDb, getCachedViewWithTier, resolveActiveLeagueId, getAllCachedSeasons } from "./db";
import { memCache } from "./memCache";
import {
  normalizeDraftPicks,
  normalizeMatchups,
  normalizeTeams,
  normalizeTransactions,
} from "./espnService";
export type HistoricalDataSource =
  | "verified_manual"
  | "manual_h2h_matrix"
  | "normalized"
  | "raw_cache"
  | "legacy_cache"
  | "empty";

export type HistoricalReadResult<T = unknown> = {
  rows: T[];
  source: HistoricalDataSource;
  season: number;
  leagueId: string;
  count: number;
  /** Total DB rows before in-memory dedup (normalized path only). */
  rawCount?: number;
  /** Why `empty` or extra context (never fabricated numbers). */
  debugReason?: string;
};

const COVERAGE_SEASONS = [
  2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
];

function tierToHistoricalSource(tier: CachedViewStorageTier): HistoricalDataSource {
  return tier === "espn_raw_cache" ? "raw_cache" : "legacy_cache";
}

async function resolveLeagueKey(season: number, leagueId?: string | null, userId?: number): Promise<string> {
  const r = await resolveActiveLeagueId(
    { user: userId != null ? { id: userId } : undefined },
    leagueId ?? null,
    season
  );
  return String(r.leagueId).slice(0, 32);
}

function emptyResult<T>(season: number, leagueId: string, reason: string): HistoricalReadResult<T> {
  return { rows: [], source: "empty", season, leagueId, count: 0, debugReason: reason };
}

/** Distinct seasons that appear in normalized GM tables for this league. */
export async function distinctNormalizedSeasons(leagueId: string): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const lid = String(leagueId).slice(0, 32);
  const s = new Set<number>();
  const teamSeasons = await db
    .selectDistinct({ season: gmTeams.season })
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, lid));
  for (const r of teamSeasons) {
    if (r.season > 1999) s.add(r.season);
  }
  const m = await db.selectDistinct({ season: gmMatchups.season }).from(gmMatchups).where(eq(gmMatchups.leagueId, lid));
  for (const r of m) {
    if (r.season > 1999) s.add(r.season);
  }
  const d = await db.selectDistinct({ season: gmDraftPicks.season }).from(gmDraftPicks).where(eq(gmDraftPicks.leagueId, lid));
  for (const r of d) {
    if (r.season > 1999) s.add(r.season);
  }
  const t = await db.selectDistinct({ season: gmTransactions.season }).from(gmTransactions).where(eq(gmTransactions.leagueId, lid));
  for (const r of t) {
    if (r.season > 1999) s.add(r.season);
  }
  return Array.from(s).sort((a, b) => a - b);
}

export async function listSeasonsForLeagueHistorical(leagueId?: string, userId?: number): Promise<number[]> {
  const lid = await resolveLeagueKey(new Date().getFullYear(), leagueId ?? null, userId);
  const fromCache = await getAllCachedSeasons(lid, userId);
  const fromDb = await distinctNormalizedSeasons(lid);
  const merged = new Set<number>([...fromCache, ...fromDb]);
  return Array.from(merged).sort((a, b) => a - b);
}

function winnerLabel(homeId: number, awayId: number, winnerTeamId: number | null): string {
  if (winnerTeamId == null) return "UNDECIDED";
  if (winnerTeamId === homeId) return "HOME";
  if (winnerTeamId === awayId) return "AWAY";
  return "UNDECIDED";
}

function parseRawMatchup(raw: string | null): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function teamRowFromGmTeam(row: typeof gmTeams.$inferSelect, season: number): Record<string, unknown> {
  let rawParsed: Record<string, unknown> | null = null;
  try {
    rawParsed = JSON.parse(String(row.rawTeam || "{}")) as Record<string, unknown>;
  } catch {
    rawParsed = null;
  }
  const fromRaw = (rawParsed?.record as Record<string, unknown>)?.overall as Record<string, unknown> | undefined;
  const wins = fromRaw?.wins != null ? Number(fromRaw.wins) : Number(row.wins) || 0;
  const losses = fromRaw?.losses != null ? Number(fromRaw.losses) : Number(row.losses) || 0;
  const ties = fromRaw?.ties != null ? Number(fromRaw.ties) : Number(row.ties) || 0;
  const pa = fromRaw?.pointsAgainst != null ? Number(fromRaw.pointsAgainst) : Number(row.pointsAgainst) || 0;
  const pf = Number(row.pointsFor) || 0;
  const ownerId = String(row.ownerId || "").trim();
  const memberIds = ownerId ? [ownerId] : [];
  const ownerDisplay = String(row.ownerName || "").trim();
  const ownersStr = ownerDisplay || ownerId;
  const tc =
    (rawParsed?.transactionCounter as Record<string, unknown>) ||
    ({} as Record<string, unknown>);
  return {
    season,
    teamId: row.teamId,
    id: row.teamId,
    name: row.name,
    abbrev: row.abbreviation,
    location: "",
    nickname: row.name,
    owners: ownersStr,
    ownerDisplay,
    primaryOwner: ownerId || (memberIds[0] as string) || "",
    memberIds,
    wins,
    losses,
    ties,
    pointsFor: pf,
    pointsAgainst: pa,
    percentage: fromRaw?.percentage,
    rankFinal: row.finalStanding ?? undefined,
    rankCalculatedFinal: row.finalStanding ?? undefined,
    playoffSeed: row.playoffSeed ?? undefined,
    record: { overall: { wins, losses, ties, pointsAgainst: pa, pointsFor: pf } },
    points: pf,
    transactionCounter: tc,
  };
}

export async function getSeasonTeams(
  season: number,
  leagueId?: string,
  userId?: number
): Promise<HistoricalReadResult<Record<string, unknown>>> {
  const yr = Math.floor(Number(season));
  const lid = await resolveLeagueKey(yr, leagueId ?? null, userId);

  const db = await getDb();
  if (db) {
    const rows = await db
      .select()
      .from(gmTeams)
      .where(and(eq(gmTeams.leagueId, lid), eq(gmTeams.season, yr)))
      .orderBy(gmTeams.teamId);
    if (rows.length > 0) {
      const shaped = rows.map((r) => teamRowFromGmTeam(r, yr));
      return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
    }
  }

  const hit = await getCachedViewWithTier(yr, "combined", lid, { userId });
  if (hit?.row?.payload && typeof hit.row.payload === "object" && !Array.isArray(hit.row.payload)) {
    const payload = hit.row.payload as Record<string, unknown>;
    try {
      const norm = normalizeTeams(payload) as unknown as Record<string, unknown>[];
      if (norm.length > 0) {
        return {
          rows: norm,
          source: tierToHistoricalSource(hit.tier),
          season: yr,
          leagueId: lid,
          count: norm.length,
        };
      }
    } catch (e) {
      console.warn("[historicalDataService] getSeasonTeams normalizeTeams failed:", yr, e);
    }
  }

  return emptyResult(yr, lid, "no_teams_in_normalized_or_combined_cache");
}

export async function getSeasonMatchups(
  season: number,
  leagueId?: string,
  userId?: number
): Promise<HistoricalReadResult<Record<string, unknown>>> {
  const yr = Math.floor(Number(season));
  const lid = await resolveLeagueKey(yr, leagueId ?? null, userId);

  const db = await getDb();
  if (db) {
    const rows = await db
      .select()
      .from(gmMatchups)
      .where(and(eq(gmMatchups.leagueId, lid), eq(gmMatchups.season, yr)))
      .orderBy(gmMatchups.week, gmMatchups.matchupPeriodId, gmMatchups.id);
    if (rows.length > 0) {
      const shaped: Record<string, unknown>[] = [];
      for (const m of rows) {
        const rawM = parseRawMatchup(m.rawMatchup != null ? String(m.rawMatchup) : null);
        const playoffTier =
          (rawM?.playoffTierType as string) ||
          (Number(m.isPlayoff) === 1 ? "WINNERS_BRACKET" : "NONE");
        shaped.push({
          season: yr,
          matchupPeriodId: m.matchupPeriodId,
          scoringPeriodId: m.week,
          winner: winnerLabel(m.homeTeamId, m.awayTeamId, m.winnerTeamId),
          playoffTierType: playoffTier,
          homeTeamId: m.homeTeamId,
          homeTotalPoints: Number(m.homeScore) || 0,
          homeProjectedPoints: m.homeProjected != null ? Number(m.homeProjected) : null,
          awayTeamId: m.awayTeamId,
          awayTotalPoints: Number(m.awayScore) || 0,
          awayProjectedPoints: m.awayProjected != null ? Number(m.awayProjected) : null,
        } as Record<string, unknown>);
      }
      return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
    }
  }

  return emptyResult(yr, lid, "no_matchups_in_normalized_db");
}

export async function getSeasonDraftPicks(
  season: number,
  leagueId?: string,
  userId?: number
): Promise<HistoricalReadResult<Record<string, unknown>>> {
  const yr = Math.floor(Number(season));
  const lid = await resolveLeagueKey(yr, leagueId ?? null, userId);

  const db = await getDb();
  if (db) {
    const rows = await db
      .select({
        id: gmDraftPicks.id,
        overallPick: gmDraftPicks.overallPick,
        roundId: gmDraftPicks.roundId,
        roundPick: gmDraftPicks.roundPick,
        teamId: gmDraftPicks.teamId,
        playerId: gmDraftPicks.playerId,
        playerName: gmDraftPicks.playerName,
        position: gmDraftPicks.position,
        isKeeper: gmDraftPicks.isKeeper,
        bidAmount: gmDraftPicks.bidAmount,
        rawPick: gmDraftPicks.rawPick,
        teamName: gmTeams.name,
      })
      .from(gmDraftPicks)
      .leftJoin(
        gmTeams,
        and(
          eq(gmDraftPicks.leagueId, gmTeams.leagueId),
          eq(gmDraftPicks.season, gmTeams.season),
          eq(gmDraftPicks.teamId, gmTeams.teamId),
        ),
      )
      .where(and(eq(gmDraftPicks.leagueId, lid), eq(gmDraftPicks.season, yr)))
      // desc(id) so that for duplicate overallPick rows, the latest insert wins after dedup
      .orderBy(gmDraftPicks.overallPick, desc(gmDraftPicks.id));

    const isScrapeRow = (raw: string | null | undefined): boolean => {
      if (!raw) return false;
      try {
        const j = JSON.parse(raw) as { source?: string };
        return j.source === "draft_recap_html";
      } catch {
        return false;
      }
    };

    // Deduplicate by overallPick — prefer HTML scrape rows over ESPN API/normalized rows
    const byOverall = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byOverall.get(row.overallPick);
      if (!existing) {
        byOverall.set(row.overallPick, row);
        continue;
      }
      const rowScrape = isScrapeRow(row.rawPick);
      const existingScrape = isScrapeRow(existing.rawPick);
      if (rowScrape && !existingScrape) {
        byOverall.set(row.overallPick, row);
      } else if (rowScrape === existingScrape && row.id > existing.id) {
        byOverall.set(row.overallPick, row);
      }
    }
    const dedupedRows = [...byOverall.values()].sort((a, b) => a.overallPick - b.overallPick);

    if (dedupedRows.length > 0) {
      const shaped = dedupedRows.map((r) => ({
        season: yr,
        overallPickNumber: r.overallPick,
        roundId: r.roundId,
        roundPickNumber: r.roundPick,
        teamId: r.teamId,
        teamName: (r.teamName && String(r.teamName).trim()) || "",
        playerId: r.playerId,
        playerName: r.playerName,
        position: r.position,
        keeper: Boolean(r.isKeeper),
        reservedForKeeper: false,
        proTeam: "",
        bidAmount: r.bidAmount != null ? Number(r.bidAmount) : 0,
        rawPick: r.rawPick,
      }));
      return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length, rawCount: rows.length };
    }
  }

  const mdHit = await getCachedViewWithTier(yr, "mDraftDetail", lid, { userId });
  if (mdHit?.row?.payload && typeof mdHit.row.payload === "object" && !Array.isArray(mdHit.row.payload)) {
    const base = mdHit.row.payload as Record<string, unknown>;
    const payload: Record<string, unknown> = {
      ...base,
      seasonId: base.seasonId != null ? base.seasonId : yr,
    };
    try {
      const norm = normalizeDraftPicks(payload) as unknown as Record<string, unknown>[];
      if (norm.length > 0) {
        const shaped = norm.map((r) => ({
          season: yr,
          overallPickNumber: r.overallPickNumber,
          roundId: r.roundId,
          roundPickNumber: r.roundPickNumber,
          teamId: r.teamId,
          teamName: r.teamName,
          playerId: r.playerId,
          playerName: r.playerName,
          position: r.position,
          keeper: Boolean(r.keeper),
          reservedForKeeper: Boolean(r.reservedForKeeper),
          proTeam: r.proTeam ?? "",
          bidAmount: r.bidAmount != null ? Number(r.bidAmount) : 0,
          rawPick: JSON.stringify(r),
        }));
        return {
          rows: shaped,
          source: tierToHistoricalSource(mdHit.tier),
          season: yr,
          leagueId: lid,
          count: shaped.length,
        };
      }
    } catch (e) {
      console.warn("[historicalDataService] getSeasonDraftPicks mDraftDetail normalize failed:", yr, e);
    }
  }

  const hit = await getCachedViewWithTier(yr, "combined", lid, { userId });
  if (hit?.row?.payload && typeof hit.row.payload === "object" && !Array.isArray(hit.row.payload)) {
    const payload = hit.row.payload as Record<string, unknown>;
    try {
      const norm = normalizeDraftPicks(payload) as unknown as Record<string, unknown>[];
      if (norm.length > 0) {
        return {
          rows: norm,
          source: tierToHistoricalSource(hit.tier),
          season: yr,
          leagueId: lid,
          count: norm.length,
        };
      }
    } catch (e) {
      console.warn("[historicalDataService] getSeasonDraftPicks normalizeDraftPicks failed:", yr, e);
    }
  }

  return emptyResult(yr, lid, "no_draft_picks_in_normalized_or_combined_cache");
}

export async function getSeasonTransactions(
  season: number,
  leagueId?: string,
  userId?: number
): Promise<HistoricalReadResult<Record<string, unknown>>> {
  const yr = Math.floor(Number(season));
  const lid = await resolveLeagueKey(yr, leagueId ?? null, userId);
  const db = await getDb();
  if (db) {
    const rows = await db
      .select()
      .from(gmTransactions)
      .where(and(eq(gmTransactions.leagueId, lid), eq(gmTransactions.season, yr)))
      .orderBy(desc(gmTransactions.processedDate), gmTransactions.transactionId);
    if (rows.length > 0) {
      const shaped: Record<string, unknown>[] = rows.map((t) => ({
        season: yr,
        transactionId: t.transactionId,
        type: t.type,
        status: t.status,
        proposedDate: t.proposedDate,
        processedDate: t.processedDate,
        teamId: t.toTeamId ?? t.fromTeamId,
        playerId: t.playerId,
        playerName: t.playerName,
        fromTeamId: t.fromTeamId,
        toTeamId: t.toTeamId,
        bidAmount: t.bidAmount,
        relatedTransactionId: t.relatedTransactionId,
      }));
      return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
    }
  }

  const hit = await getCachedViewWithTier(yr, "combined", lid, { userId });
  if (hit?.row?.payload && typeof hit.row.payload === "object" && !Array.isArray(hit.row.payload)) {
    const payload = hit.row.payload as Record<string, unknown>;
    try {
      const norm = normalizeTransactions(payload) as unknown as Record<string, unknown>[];
      if (norm.length > 0) {
        return {
          rows: norm,
          source: tierToHistoricalSource(hit.tier),
          season: yr,
          leagueId: lid,
          count: norm.length,
        };
      }
    } catch (e) {
      console.warn("[historicalDataService] getSeasonTransactions normalizeTransactions failed:", yr, e);
    }
  }

  return emptyResult(yr, lid, "no_transactions_in_normalized_or_combined_cache");
}

export type HistoricalCoverageSeason = {
  season: number;
  teams: { count: number; source: HistoricalDataSource };
  matchups: { count: number; source: HistoricalDataSource };
  draftPicks: { count: number; source: HistoricalDataSource };
  transactions: { count: number; source: HistoricalDataSource };
  rawCacheExists: boolean;
  /** Latest sync_runs row for league+season (success with any persisted rows). */
  normalizedSyncComplete: boolean;
  /** Stored ESPN Draft Recap (`mDraftDetail`) has a non-empty `draftDetail.picks` array. */
  draftRecapAvailable: boolean;
  /** Pick count from stored Draft Recap when available; otherwise same as `draftPicks.count`. */
  draftPickCount: number;
  /** Source used by {@link getSeasonDraftPicks} for effective rows (normalized → mDraftDetail cache → combined). */
  draftSource: HistoricalDataSource;
};

export type HistoricalCoverageReport = {
  leagueId: string;
  seasons: HistoricalCoverageSeason[];
  generatedAt: string;
};

async function buildHistoricalCoverageInner(leagueId: string | undefined, userId: number | undefined): Promise<HistoricalCoverageReport> {
  const lid = await resolveLeagueKey(2026, leagueId ?? null, userId);
  const db = await getDb();
  const seasons: HistoricalCoverageSeason[] = [];
  for (const season of COVERAGE_SEASONS) {
    const [t, m, d, x, rawHit, mdHit] = await Promise.all([
      getSeasonTeams(season, lid, userId),
      getSeasonMatchups(season, lid, userId),
      getSeasonDraftPicks(season, lid, userId),
      getSeasonTransactions(season, lid, userId),
      getCachedViewWithTier(season, "combined", lid, { userId }),
      getCachedViewWithTier(season, "mDraftDetail", lid, { userId }),
    ]);
    let normalizedSyncComplete = false;
    if (db) {
      const run = await db
        .select()
        .from(syncRuns)
        .where(and(eq(syncRuns.leagueId, lid), eq(syncRuns.season, season)))
        .orderBy(desc(syncRuns.id))
        .limit(1);
      const r = run[0];
      normalizedSyncComplete = Boolean(
        r &&
          r.status === "success" &&
          ((r.teamsSaved ?? 0) > 0 || (r.matchupsSaved ?? 0) > 0 || (r.draftPicksSaved ?? 0) > 0 || (r.transactionsSaved ?? 0) > 0)
      );
    }
    let draftRecapAvailable = false;
    let recapPickCount = 0;
    if (mdHit?.row?.payload && typeof mdHit.row.payload === "object" && !Array.isArray(mdHit.row.payload)) {
      const dd =
        ((mdHit.row.payload as Record<string, unknown>).draftDetail as Record<string, unknown>) || {};
      const picks = (dd.picks as unknown[]) || [];
      recapPickCount = Array.isArray(picks) ? picks.length : 0;
      draftRecapAvailable = recapPickCount > 0;
    }
    const draftPickCount = draftRecapAvailable ? recapPickCount : d.count;
    seasons.push({
      season,
      teams: { count: t.count, source: t.source },
      matchups: { count: m.count, source: m.source },
      draftPicks: { count: d.count, source: d.source },
      transactions: { count: x.count, source: x.source },
      rawCacheExists: Boolean(rawHit),
      normalizedSyncComplete,
      draftRecapAvailable,
      draftPickCount,
      draftSource: d.source,
    });
  }
  return { leagueId: lid, seasons, generatedAt: new Date().toISOString() };
}

export function getHistoricalCoverageReport(
  leagueId: string | undefined,
  userId: number | undefined
): Promise<HistoricalCoverageReport> {
  const key = `historicalCoverage:v2:${leagueId ?? "default"}:${userId ?? "anon"}`;
  return memCache(key, 5 * 60_000, () => buildHistoricalCoverageInner(leagueId, userId));
}

export type HistoricalReadAuditLine = {
  page: string;
  sourceUsed: HistoricalDataSource;
  rowsReturned: number;
  seasonCoverage: number[];
};

export async function buildHistoricalReadAudit(leagueId: string | undefined, userId: number | undefined): Promise<{
  leagueId: string;
  workbookPath: string | null;
  workbookLoaded: boolean;
  pages: HistoricalReadAuditLine[];
}> {
  const lid = await resolveLeagueKey(new Date().getFullYear(), leagueId ?? null, userId);
  const seasons = COVERAGE_SEASONS.filter((s) => s !== 2009);

  const pickAgg = async (
    label: string,
    probe: (s: number) => Promise<HistoricalReadResult>,
  ): Promise<HistoricalReadAuditLine> => {
    const cov: number[] = [];
    let maxRows = 0;
    let sourceUsed: HistoricalDataSource = "empty";
    for (const s of seasons) {
      const r = await probe(s);
      if (r.count === 0) continue;
      cov.push(s);
      maxRows = Math.max(maxRows, r.count);
      if (r.source === "verified_manual") sourceUsed = "verified_manual";
      else if (sourceUsed !== "verified_manual") sourceUsed = r.source;
    }
    return { page: label, sourceUsed, rowsReturned: maxRows, seasonCoverage: cov.sort((a, b) => a - b) };
  };

  const draft = await pickAgg("draft_history", (s) => getSeasonDraftPicks(s, lid, userId));
  const h2h = await pickAgg("h2h_matchups", (s) => getSeasonMatchups(s, lid, userId));
  const owner = await pickAgg("owner_career", (s) => getSeasonTeams(s, lid, userId));

  return {
    leagueId: lid,
    workbookPath: null,
    workbookLoaded: false,
    pages: [draft, h2h, owner],
  };
}

/**
 * When combined cache has no teams but normalized teams exist, build a minimal ESPN-shaped payload
 * for owner-career style consumers (schedule + members + settings only from real stored fields).
 */
export async function buildCombinedPayloadFromNormalized(
  season: number,
  leagueId: string,
  userId?: number
): Promise<Record<string, unknown> | null> {
  const teamsRes = await getSeasonTeams(season, leagueId, userId);
  if (teamsRes.count === 0) return null;
  const matchRes = await getSeasonMatchups(season, leagueId, userId);

  const membersMap = new Map<string, Record<string, unknown>>();
  for (const t of teamsRes.rows) {
    const ownersStr = String(t.owners || "").trim();
    const parts = ownersStr.split(";").map((s) => s.trim()).filter(Boolean);
    const primary = String(t.primaryOwner || (t.memberIds as string[])?.[0] || parts[0] || "").trim();
    if (!primary) continue;
    if (!membersMap.has(primary)) {
      const display = String(t.ownerDisplay || parts[0] || primary).trim();
      membersMap.set(primary, {
        id: primary,
        firstName: "",
        lastName: "",
        displayName: display || primary,
      });
    }
  }

  const schedule: Record<string, unknown>[] = [];
  for (const row of matchRes.rows) {
    const hid = Number(row.homeTeamId);
    const aid = Number(row.awayTeamId);
    schedule.push({
      matchupPeriodId: row.matchupPeriodId,
      scoringPeriodId: row.scoringPeriodId,
      winner: row.winner,
      playoffTierType: row.playoffTierType,
      home: { teamId: hid, totalPoints: row.homeTotalPoints },
      away: { teamId: aid, totalPoints: row.awayTotalPoints },
    });
  }

  const rsPeriods = matchRes.rows
    .filter((r) => String(r.playoffTierType || "NONE") === "NONE")
    .map((r) => Number(r.matchupPeriodId) || 0);
  const matchupPeriodCount = rsPeriods.length > 0 ? Math.max(...rsPeriods) : 14;

  const teamsPayload = teamsRes.rows.map((t) => {
    const tid = Number(t.teamId ?? t.id);
    return {
      id: tid,
      name: t.name,
      abbrev: t.abbrev,
      owners: (t.memberIds as string[]) || [],
      primaryOwner: t.primaryOwner,
      record: t.record,
      points: t.points,
      rankCalculatedFinal: t.rankCalculatedFinal ?? t.rankFinal,
      playoffSeed: t.playoffSeed,
      transactionCounter: t.transactionCounter || {},
    };
  });

  return {
    seasonId: season,
    id: leagueId,
    members: [...membersMap.values()],
    teams: teamsPayload,
    schedule,
    settings: { scheduleSettings: { matchupPeriodCount } },
    transactions: [],
  };
}
