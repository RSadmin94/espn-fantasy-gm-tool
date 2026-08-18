import { and, desc, eq } from "drizzle-orm";
import { gmDraftPicks, gmTeams } from "../drizzle/schema";
import {
  isPlaceholderDraftLedger,
  overlayDraftPickIdentities,
  pickIdentityScore,
  type DraftPickIdentityCoverage,
} from "../shared/draftPickSourceSelection";
import { draftPickNameIsBlank } from "../shared/draftPickIdentity";
import { getDb, getCachedViewWithTier } from "./db";
import { draftPickSourceRank } from "./draftPickSourcePriority";
import { fillMissingDraftPickIdentities } from "./draftPickIdentityLookup";
import { normalizeDraftPicks } from "./espnService";
import type { LeagueSeasonRef } from "./leagueDataReads";

export type DraftBoardReadResult = {
  rows: Record<string, unknown>[];
  source: string;
  count: number;
  identityCoverage: DraftPickIdentityCoverage;
  placeholderLedger: boolean;
};

type DbDraftRow = {
  id: number;
  overallPick: number;
  roundId: number;
  roundPick: number;
  teamId: number;
  playerId: number | null;
  playerName: string | null;
  position: string | null;
  isKeeper: number;
  bidAmount: number | null;
  rawPick: string | null;
  teamName: string | null;
};

function shapeDbRow(r: DbDraftRow, season: number): Record<string, unknown> {
  let teamName = (r.teamName && String(r.teamName).trim()) || "";
  let reservedForKeeper = false;
  let keeper = Boolean(r.isKeeper);
  let draftedForAnalytics: boolean | undefined;
  let keeperSlot = Boolean(r.isKeeper);
  let retained = false;
  if (r.rawPick) {
    try {
      const j = JSON.parse(String(r.rawPick)) as Record<string, unknown>;
      if (typeof j.teamName === "string" && j.teamName.trim()) teamName = j.teamName.trim();
      if (j.reservedForKeeper === true) reservedForKeeper = true;
      if (j.keeper === true) keeper = true;
      if (j.retained === true) retained = true;
      if (j.keeperSlot === true) keeperSlot = true;
      if (typeof j.draftedForAnalytics === "boolean") draftedForAnalytics = j.draftedForAnalytics;
    } catch {
      /* ignore */
    }
  }
  return {
    season,
    overallPickNumber: r.overallPick,
    roundId: r.roundId,
    roundPickNumber: r.roundPick,
    teamId: r.teamId,
    teamName,
    playerId: r.playerId,
    playerName: r.playerName,
    position: r.position,
    keeper,
    reservedForKeeper,
    keeperSlot,
    retained,
    draftedForAnalytics: draftedForAnalytics ?? !keeper,
    proTeam: "",
    bidAmount: r.bidAmount != null ? Number(r.bidAmount) : 0,
    rawPick: r.rawPick,
  };
}

function dedupeDbRowsWithSourceRank(
  season: number,
  rows: DbDraftRow[],
): Record<string, unknown>[] {
  const byOverall = new Map<number, DbDraftRow>();
  for (const row of rows) {
    const existing = byOverall.get(row.overallPick);
    if (!existing) {
      byOverall.set(row.overallPick, row);
      continue;
    }
    const nextRank = draftPickSourceRank(season, row.rawPick);
    const prevRank = draftPickSourceRank(season, existing.rawPick);
    if (nextRank > prevRank) {
      byOverall.set(row.overallPick, row);
    } else if (nextRank === prevRank && row.id > existing.id) {
      byOverall.set(row.overallPick, row);
    }
  }
  return [...byOverall.values()]
    .sort((a, b) => a.overallPick - b.overallPick)
    .map((r) => shapeDbRow(r, season));
}

async function loadDbDraftRows(leagueId: string, season: number): Promise<DbDraftRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
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
    .where(and(eq(gmDraftPicks.leagueId, leagueId), eq(gmDraftPicks.season, season)))
    .orderBy(gmDraftPicks.overallPick, desc(gmDraftPicks.id));
}

function filterRecapHtmlRows(rows: DbDraftRow[]): DbDraftRow[] {
  return rows.filter((row) => {
    if (!row.rawPick) return false;
    try {
      const j = JSON.parse(String(row.rawPick)) as { source?: string };
      return j.source === "draft_recap_html";
    } catch {
      return false;
    }
  });
}

async function loadCacheDraftRows(
  season: number,
  leagueId: string,
  userId?: number,
  viewName: "mDraftDetail" | "combined" = "combined",
): Promise<Record<string, unknown>[]> {
  const hit = await getCachedViewWithTier(season, viewName, leagueId, { userId });
  const payload = hit?.row?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  try {
    const norm = normalizeDraftPicks(payload as Record<string, unknown>) as Array<Record<string, unknown>>;
    return norm.map((r) => ({
      season,
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
      keeperSlot: Boolean(r.keeperSlot),
      retained: Boolean(r.retained),
      draftedForAnalytics:
        typeof r.draftedForAnalytics === "boolean" ? r.draftedForAnalytics : !Boolean(r.keeper),
      proTeam: r.proTeam ?? "",
      bidAmount: r.bidAmount != null ? Number(r.bidAmount) : 0,
      rawPick: JSON.stringify(r),
    }));
  } catch {
    return [];
  }
}

async function finalizeRows(
  source: string,
  rows: Record<string, unknown>[],
): Promise<DraftBoardReadResult> {
  const filled = await fillMissingDraftPickIdentities(
    rows.map((row) => ({
      ...row,
      playerId: (row.playerId as number | null) ?? null,
      playerName: (row.playerName as string | null) ?? null,
      position: (row.position as string | null) ?? null,
    })),
  );
  const identityCoverage = {
    total: filled.length,
    resolved: filled.filter((p) => !draftPickNameIsBlank(p.playerName as string | null)).length,
    withPlayerId: filled.filter((p) => p.playerId != null && Number(p.playerId) > 0).length,
    unresolved: 0,
    resolutionPct: 0,
  };
  identityCoverage.unresolved = identityCoverage.total - identityCoverage.resolved;
  identityCoverage.resolutionPct =
    identityCoverage.total > 0
      ? Math.round((identityCoverage.resolved / identityCoverage.total) * 1000) / 10
      : 100;
  return {
    rows: filled,
    source,
    count: filled.length,
    identityCoverage,
    placeholderLedger: isPlaceholderDraftLedger(filled),
  };
}

/**
 * Identity-aware Draft Board read path for espn.draftPicks.
 * Prefers the source with the highest resolved player identity coverage.
 */
export async function resolveDraftBoardPicks(
  ref: LeagueSeasonRef & { userId?: number },
): Promise<DraftBoardReadResult> {
  const leagueId = String(ref.leagueId).slice(0, 32);
  const season = Math.floor(Number(ref.season));
  const dbRows = await loadDbDraftRows(leagueId, season);

  const candidates: Array<{ source: string; rows: Record<string, unknown>[] }> = [];

  if (dbRows.length > 0) {
    candidates.push({
      source: "normalized_dedup",
      rows: dedupeDbRowsWithSourceRank(season, dbRows),
    });
    const recapRows = filterRecapHtmlRows(dbRows);
    if (recapRows.length > 0) {
      candidates.push({
        source: "draft_recap_html",
        rows: dedupeDbRowsWithSourceRank(season, recapRows),
      });
    }
  }

  const mdetail = await loadCacheDraftRows(season, leagueId, ref.userId, "mDraftDetail");
  if (mdetail.length > 0) candidates.push({ source: "espn_mDraftDetail_cache", rows: mdetail });

  const combined = await loadCacheDraftRows(season, leagueId, ref.userId, "combined");
  if (combined.length > 0) candidates.push({ source: "espn_combined_cache", rows: combined });

  if (candidates.length === 0) {
    return {
      rows: [],
      source: "empty",
      count: 0,
      identityCoverage: {
        total: 0,
        resolved: 0,
        withPlayerId: 0,
        unresolved: 0,
        resolutionPct: 100,
      },
      placeholderLedger: false,
    };
  }

  let best = candidates[0]!;
  for (const c of candidates.slice(1)) {
    if (c.rows.length > best.rows.length) {
      best = c;
    } else if (
      c.rows.length === best.rows.length &&
      pickIdentityScore(c.rows) > pickIdentityScore(best.rows)
    ) {
      best = c;
    }
  }

  const overlaid = overlayDraftPickIdentities(
    best.rows,
    candidates.flatMap((c) => c.rows),
  );
  return finalizeRows(best.source, overlaid);
}
