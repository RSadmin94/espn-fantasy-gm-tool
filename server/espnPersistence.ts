/**
 * ESPN raw cache + normalized tables + sync_runs (MySQL / Drizzle).
 * Uses dynamic import("./db.js") for getDb to avoid circular deps with db.ts.
 */
import { eq, desc, and, count } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../drizzle/schema";
import {
  normalizeTeams,
  normalizeRosters,
  normalizeMatchups,
  normalizeDraftPicks,
  normalizeTransactions,
  normalizeSettings,
  buildPlayerIdMap,
} from "./espnService";

export type AppDb = MySql2Database<typeof schema>;

export async function getDbConn(): Promise<AppDb | null> {
  const { getDb } = await import("./db.js");
  return await getDb();
}

export function safeStringify(value: unknown): string {
  try {
    if (value === undefined) return "null";
    return JSON.stringify(value, (_k, v) => (v === undefined ? null : v));
  } catch {
    try {
      return JSON.stringify(String(value));
    } catch {
      return "{}";
    }
  }
}

export function getPayloadBytes(value: unknown): number {
  return Buffer.byteLength(safeStringify(value), "utf8");
}

function txPlayerKey(transactionId: string, seq: number): number {
  let h = 0;
  const s = `${transactionId}#${seq}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 2_000_000_000;
}

export async function upsertRawEspnCache(
  leagueId: string,
  season: number,
  viewName: string,
  payload: unknown
): Promise<{ payloadBytes: number }> {
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const lid = String(leagueId).slice(0, 32);
  const vn = String(viewName).slice(0, 64);
  const yr = Math.floor(Number(season));
  const body = safeStringify(payload);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  const now = new Date();
  await db
    .insert(schema.espnRawCache)
    .values({
      leagueId: lid,
      season: yr,
      viewName: vn,
      payload: body,
      payloadBytes,
      fetchedAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        payload: body,
        payloadBytes,
        updatedAt: now,
      },
    });
  return { payloadBytes };
}

/** Best-effort legacy writes — must not throw. */
export async function writeLegacyEspnCaches(
  leagueId: string,
  season: number,
  viewName: string,
  payload: unknown
): Promise<void> {
  const db = await getDbConn();
  if (!db) return;
  const lid = String(leagueId).slice(0, 32);
  const vn = String(viewName).slice(0, 64);
  const yr = Math.floor(Number(season));
  const body = safeStringify(payload);
  const now = new Date();
  const { buildEspnFantasyDataCacheKey } = await import("./db.js");
  const cacheKey = buildEspnFantasyDataCacheKey(lid, yr, vn);
  try {
    await db
      .insert(schema.fantasyDataCache)
      .values({ cacheKey, payload: body, fetchedAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { payload: body, updatedAt: now } });
  } catch (e) {
    console.warn("[espnPersistence] legacy fantasy_data_cache write failed:", e);
  }
  try {
    await db
      .insert(schema.espnSeasonCache)
      .values({ leagueId: lid, season: yr, viewName: vn, payload: body, fetchedAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { payload: body, updatedAt: now } });
  } catch (e) {
    console.warn("[espnPersistence] legacy espn_season_cache write failed:", e);
  }
}

export async function createSyncRun(leagueId: string, season: number): Promise<number | null> {
  const db = await getDbConn();
  if (!db) return null;
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const now = new Date();
  try {
    const ins = await db.insert(schema.syncRuns).values({
      leagueId: lid,
      season: yr,
      status: "running",
      startedAt: now,
      finishedAt: null,
      errorMessage: null,
    });
    const header = ins as unknown as { insertId?: number };
    if (header.insertId != null && header.insertId > 0) return header.insertId;
    const rows = await db
      .select({ id: schema.syncRuns.id })
      .from(schema.syncRuns)
      .where(and(eq(schema.syncRuns.leagueId, lid), eq(schema.syncRuns.season, yr)))
      .orderBy(desc(schema.syncRuns.id))
      .limit(1);
    return rows[0]?.id ?? null;
  } catch (e) {
    console.warn("[espnPersistence] createSyncRun failed:", e);
    return null;
  }
}

export async function finishSyncRun(
  runId: number | null,
  status: "running" | "success" | "partial" | "failed",
  counts: {
    rawViewsSaved?: number;
    teamsSaved?: number;
    matchupsSaved?: number;
    draftPicksSaved?: number;
    transactionsSaved?: number;
    rosterEntriesSaved?: number;
    playersSaved?: number;
    standingsSaved?: number;
  },
  errorMessage?: string | null
): Promise<void> {
  if (runId == null) return;
  const db = await getDbConn();
  if (!db) return;
  const now = new Date();
  try {
    await db
      .update(schema.syncRuns)
      .set({
        status,
        finishedAt: now,
        errorMessage: errorMessage ?? null,
        rawViewsSaved: counts.rawViewsSaved ?? 0,
        teamsSaved: counts.teamsSaved ?? 0,
        matchupsSaved: counts.matchupsSaved ?? 0,
        draftPicksSaved: counts.draftPicksSaved ?? 0,
        transactionsSaved: counts.transactionsSaved ?? 0,
        rosterEntriesSaved: counts.rosterEntriesSaved ?? 0,
        playersSaved: counts.playersSaved ?? 0,
        standingsSaved: counts.standingsSaved ?? 0,
      })
      .where(eq(schema.syncRuns.id, runId));
  } catch (e) {
    console.warn("[espnPersistence] finishSyncRun failed:", e);
  }
}

export async function upsertLeagueSettings(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<void> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  let ns: ReturnType<typeof normalizeSettings> | null = null;
  try {
    ns = normalizeSettings(payload);
  } catch {
    return;
  }
  const settings = (payload.settings as Record<string, unknown>) || {};
  const name = String(ns.leagueName ?? settings.name ?? "");
  const teamCount = Number(ns.size ?? 0) || 0;
  const scoringType = String(ns.scoringType ?? "");
  const playoffTeams = Number(ns.playoffTeamCount ?? 0) || 0;
  const regularSeasonWeeks = Number(ns.matchupPeriodCount ?? 0) || 0;
  const tradeDeadline =
    typeof ns.tradeDeadline === "number" && Number.isFinite(ns.tradeDeadline)
      ? Math.floor(ns.tradeDeadline)
      : null;
  const now = new Date();
  await db
    .insert(schema.gmLeagueSettings)
    .values({
      leagueId: lid,
      season: yr,
      name,
      teamCount,
      scoringType,
      playoffTeams,
      regularSeasonWeeks,
      tradeDeadline,
      rosterSlots: ns.rosterPositions != null ? safeStringify(ns.rosterPositions) : null,
      scoringSettings: ns.scoringItems != null ? safeStringify(ns.scoringItems) : null,
      rawSettings: safeStringify(settings),
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        name,
        teamCount,
        scoringType,
        playoffTeams,
        regularSeasonWeeks,
        tradeDeadline,
        rosterSlots: ns.rosterPositions != null ? safeStringify(ns.rosterPositions) : null,
        scoringSettings: ns.scoringItems != null ? safeStringify(ns.scoringItems) : null,
        rawSettings: safeStringify(settings),
        updatedAt: now,
      },
    });
}

export async function upsertTeams(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  let teams: ReturnType<typeof normalizeTeams> = [];
  try {
    teams = normalizeTeams(payload);
  } catch {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const t of teams) {
    const tid = Number(t.teamId);
    if (!Number.isFinite(tid)) continue;
    const pf = Number(t.pointsFor ?? 0) || 0;
    const pa = Number(t.pointsAgainst ?? 0) || 0;
    await db
      .insert(schema.gmTeams)
      .values({
        leagueId: lid,
        season: yr,
        teamId: tid,
        name: String(t.teamName ?? ""),
        abbreviation: String(t.abbrev ?? ""),
        ownerName: String(t.owners ?? ""),
        ownerId: Array.isArray(t.memberIds) && t.memberIds[0] ? String(t.memberIds[0]) : "",
        logoUrl: String(t.logoUrl ?? ""),
        wins: Number(t.wins ?? 0) || 0,
        losses: Number(t.losses ?? 0) || 0,
        ties: Number(t.ties ?? 0) || 0,
        pointsFor: pf,
        pointsAgainst: pa,
        playoffSeed: t.playoffSeed != null ? Number(t.playoffSeed) : null,
        finalStanding: t.rankFinal != null ? Number(t.rankFinal) : null,
        rawTeam: safeStringify(t),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: String(t.teamName ?? ""),
          abbreviation: String(t.abbrev ?? ""),
          ownerName: String(t.owners ?? ""),
          ownerId: Array.isArray(t.memberIds) && t.memberIds[0] ? String(t.memberIds[0]) : "",
          logoUrl: String(t.logoUrl ?? ""),
          wins: Number(t.wins ?? 0) || 0,
          losses: Number(t.losses ?? 0) || 0,
          ties: Number(t.ties ?? 0) || 0,
          pointsFor: pf,
          pointsAgainst: pa,
          playoffSeed: t.playoffSeed != null ? Number(t.playoffSeed) : null,
          finalStanding: t.rankFinal != null ? Number(t.rankFinal) : null,
          rawTeam: safeStringify(t),
          updatedAt: now,
        },
      });
    n++;
  }
  return n;
}

export async function upsertMatchups(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  let rows: ReturnType<typeof normalizeMatchups> = [];
  try {
    rows = normalizeMatchups(payload);
  } catch {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const m of rows) {
    const hid = Number(m.homeTeamId);
    const aid = Number(m.awayTeamId);
    if (!Number.isFinite(hid) || !Number.isFinite(aid)) continue;
    const mpid = Number(m.matchupPeriodId ?? 0) || 0;
    const week = Number(m.scoringPeriodId ?? 0) || 0;
    const hs = Number(m.homeTotalPoints ?? 0) || 0;
    const as = Number(m.awayTotalPoints ?? 0) || 0;
    const hp = m.homeProjectedPoints != null ? Number(m.homeProjectedPoints) : null;
    const ap = m.awayProjectedPoints != null ? Number(m.awayProjectedPoints) : null;
    const winner = m.winner != null && m.winner !== "UNDECIDED" ? Number(m.winner) : null;
    const isPlayoff = String(m.playoffTierType || "").length > 0 ? 1 : 0;
    const isCompleted = winner != null && Number.isFinite(winner) ? 1 : 0;
    await db
      .insert(schema.gmMatchups)
      .values({
        leagueId: lid,
        season: yr,
        week,
        matchupPeriodId: mpid,
        homeTeamId: hid,
        awayTeamId: aid,
        homeScore: hs,
        awayScore: as,
        homeProjected: hp,
        awayProjected: ap,
        winnerTeamId: winner,
        isPlayoff,
        isCompleted,
        rawMatchup: safeStringify(m),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          homeScore: hs,
          awayScore: as,
          homeProjected: hp,
          awayProjected: ap,
          winnerTeamId: winner,
          isPlayoff,
          isCompleted,
          rawMatchup: safeStringify(m),
          updatedAt: now,
        },
      });
    n++;
  }
  return n;
}

export async function upsertDraftPicks(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  let picks: ReturnType<typeof normalizeDraftPicks> = [];
  try {
    picks = normalizeDraftPicks(payload);
  } catch {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const p of picks) {
    const overall = Number(p.overallPickNumber ?? 0);
    if (!Number.isFinite(overall) || overall <= 0) continue;
    const bidRaw = (p as Record<string, unknown>).bidAmount;
    const bidAmount =
      bidRaw != null && Number.isFinite(Number(bidRaw)) ? Number(bidRaw) : 0;
    await db
      .insert(schema.gmDraftPicks)
      .values({
        leagueId: lid,
        season: yr,
        overallPick: overall,
        roundId: Number(p.roundId ?? 0) || 0,
        roundPick: Number(p.roundPickNumber ?? 0) || 0,
        teamId: Number(p.teamId ?? 0) || 0,
        owningTeamId: null,
        playerId: p.playerId != null ? Number(p.playerId) : null,
        playerName: p.playerName != null ? String(p.playerName) : null,
        position: p.position != null ? String(p.position) : null,
        isKeeper: (p.keeper || p.reservedForKeeper) ? 1 : 0,
        bidAmount,
        rawPick: safeStringify(p),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          roundId: Number(p.roundId ?? 0) || 0,
          roundPick: Number(p.roundPickNumber ?? 0) || 0,
          teamId: Number(p.teamId ?? 0) || 0,
          playerId: p.playerId != null ? Number(p.playerId) : null,
          playerName: p.playerName != null ? String(p.playerName) : null,
          position: p.position != null ? String(p.position) : null,
          isKeeper: (p.keeper || p.reservedForKeeper) ? 1 : 0,
          bidAmount,
          rawPick: safeStringify(p),
          updatedAt: now,
        },
      });
    n++;
  }
  return n;
}

/**
 * Store raw `mDraftDetail` league JSON and upsert `draft_picks` from ESPN Draft Recap only.
 * Does not fabricate picks — uses {@link normalizeDraftPicks} / {@link upsertDraftPicks}.
 */
export async function persistDraftRecapSnapshot(
  leagueId: string,
  season: number,
  apiBody: Record<string, unknown>
): Promise<{ payloadBytes: number; picksSaved: number }> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const { payloadBytes } = await upsertRawEspnCache(lid, yr, "mDraftDetail", apiBody);
  await writeLegacyEspnCaches(lid, yr, "mDraftDetail", apiBody);
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const picksSaved = await upsertDraftPicks(db, lid, yr, apiBody);
  return { payloadBytes, picksSaved };
}

export async function upsertTransactions(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const rawList = (payload.transactions as Record<string, unknown>[]) || [];
  const rawById = new Map<string, Record<string, unknown>>();
  for (const t of rawList) {
    const id = t.id != null ? String(t.id) : "";
    if (id) rawById.set(id, t);
  }
  let txs: unknown[] = [];
  try {
    txs = normalizeTransactions(payload) as unknown[];
  } catch (e) {
    console.warn("[upsertTransactions] normalizeTransactions failed:", e);
    return 0;
  }
  const now = new Date();
  let n = 0;
  const seqByTid = new Map<string, number>();
  for (const row of txs) {
    const tx = row as Record<string, unknown>;
    const tid = String(tx.transactionId ?? tx.id ?? "");
    if (!tid) continue;
    try {
      const seq = (seqByTid.get(tid) ?? 0) + 1;
      seqByTid.set(tid, seq);
      const playerKey = txPlayerKey(tid, seq);
      const pid =
        tx.playerId != null && Number.isFinite(Number(tx.playerId)) && Number(tx.playerId) > 0
          ? Number(tx.playerId)
          : null;
      const parent = rawById.get(tid) ?? tx;
      const rawTransaction = safeStringify(parent);
      const rel =
        tx.relatedTransactionId != null && String(tx.relatedTransactionId).trim() !== ""
          ? String(tx.relatedTransactionId).slice(0, 64)
          : null;
      const bidAmount =
        tx.bidAmount != null && Number.isFinite(Number(tx.bidAmount)) ? Number(tx.bidAmount) : 0;
      const proposedDate =
        tx.proposedDate != null && Number.isFinite(Number(tx.proposedDate))
          ? Math.floor(Number(tx.proposedDate))
          : null;
      const processedDate =
        tx.processedDate != null && Number.isFinite(Number(tx.processedDate))
          ? Math.floor(Number(tx.processedDate))
          : null;
      await db
        .insert(schema.gmTransactions)
        .values({
          leagueId: lid,
          season: yr,
          transactionId: tid.slice(0, 64),
          relatedTransactionId: rel,
          type: String(tx.type ?? ""),
          status: String(tx.status ?? ""),
          playerId: pid,
          playerKey,
          playerName: tx.playerName != null ? String(tx.playerName) : null,
          fromTeamId: tx.fromTeamId != null ? Number(tx.fromTeamId) : null,
          toTeamId: tx.toTeamId != null ? Number(tx.toTeamId) : tx.teamId != null ? Number(tx.teamId) : null,
          bidAmount,
          proposedDate,
          processedDate,
          rawTransaction,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            relatedTransactionId: rel,
            type: String(tx.type ?? ""),
            status: String(tx.status ?? ""),
            playerId: pid,
            playerName: tx.playerName != null ? String(tx.playerName) : null,
            fromTeamId: tx.fromTeamId != null ? Number(tx.fromTeamId) : null,
            toTeamId: tx.toTeamId != null ? Number(tx.toTeamId) : tx.teamId != null ? Number(tx.teamId) : null,
            bidAmount,
            proposedDate,
            processedDate,
            rawTransaction,
            updatedAt: now,
          },
        });
      n++;
    } catch (e) {
      console.warn("[upsertTransactions] row upsert failed:", tid, e);
    }
  }
  return n;
}

export async function upsertRosterEntries(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  let roster: unknown[] = [];
  try {
    roster = normalizeRosters(payload);
  } catch {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const r of roster) {
    const row = r as Record<string, unknown>;
    const teamId = Number(row.teamId);
    const playerId = Number(row.playerId);
    if (!Number.isFinite(teamId) || !Number.isFinite(playerId)) continue;
    await db
      .insert(schema.gmRosterEntries)
      .values({
        leagueId: lid,
        season: yr,
        week: 0,
        teamId,
        playerId,
        playerName: String(row.playerName ?? ""),
        position: String(row.position ?? ""),
        nflTeam: String(row.proTeam ?? ""),
        slotId: row.lineupSlotId != null ? Number(row.lineupSlotId) : null,
        acquisitionType: String(row.acquisitionType ?? ""),
        projectedPoints: row.projectedTotal != null ? Number(row.projectedTotal) : null,
        actualPoints: row.appliedTotal != null ? Number(row.appliedTotal) : null,
        injuryStatus: String(row.injuryStatus ?? ""),
        rawRosterEntry: safeStringify(row),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          playerName: String(row.playerName ?? ""),
          position: String(row.position ?? ""),
          nflTeam: String(row.proTeam ?? ""),
          slotId: row.lineupSlotId != null ? Number(row.lineupSlotId) : null,
          acquisitionType: String(row.acquisitionType ?? ""),
          projectedPoints: row.projectedTotal != null ? Number(row.projectedTotal) : null,
          actualPoints: row.appliedTotal != null ? Number(row.appliedTotal) : null,
          injuryStatus: String(row.injuryStatus ?? ""),
          rawRosterEntry: safeStringify(row),
          updatedAt: now,
        },
      });
    n++;
  }
  return n;
}

export async function upsertPlayers(
  db: AppDb,
  _leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  void _leagueId;
  const yr = Math.floor(Number(season));
  const map = buildPlayerIdMap(payload);
  const now = new Date();
  let n = 0;
  for (const [playerId, info] of Array.from(map.entries())) {
    await db
      .insert(schema.gmPlayers)
      .values({
        playerId,
        season: yr,
        name: info.name,
        position: info.position,
        nflTeam: info.proTeam,
        jerseyNumber: null,
        injuryStatus: "",
        percentOwned: null,
        percentStarted: null,
        averagePoints: null,
        totalPoints: null,
        projectedTotalPoints: null,
        rawPlayer: safeStringify({ playerId, ...info }),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: info.name,
          position: info.position,
          nflTeam: info.proTeam,
          rawPlayer: safeStringify({ playerId, ...info }),
          updatedAt: now,
        },
      });
    n++;
  }
  return n;
}

export async function upsertStandingsSnapshots(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  let teams: ReturnType<typeof normalizeTeams> = [];
  try {
    teams = normalizeTeams(payload);
  } catch {
    return 0;
  }
  const now = new Date();
  let n = 0;
  for (const t of teams) {
    const tid = Number(t.teamId);
    if (!Number.isFinite(tid)) continue;
    const rk = t.rankFinal != null ? Number(t.rankFinal) : 0;
    await db
      .insert(schema.gmStandingsSnapshots)
      .values({
        leagueId: lid,
        season: yr,
        week: 0,
        teamId: tid,
        rank: rk,
        wins: Number(t.wins ?? 0) || 0,
        losses: Number(t.losses ?? 0) || 0,
        ties: Number(t.ties ?? 0) || 0,
        pointsFor: Number(t.pointsFor ?? 0) || 0,
        pointsAgainst: Number(t.pointsAgainst ?? 0) || 0,
        rawStanding: safeStringify(t),
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          rank: rk,
          wins: Number(t.wins ?? 0) || 0,
          losses: Number(t.losses ?? 0) || 0,
          ties: Number(t.ties ?? 0) || 0,
          pointsFor: Number(t.pointsFor ?? 0) || 0,
          pointsAgainst: Number(t.pointsAgainst ?? 0) || 0,
          rawStanding: safeStringify(t),
          updatedAt: now,
        },
      });
    n++;
  }
  return n;
}

export type NormalizationCounts = {
  teamsSaved: number;
  matchupsSaved: number;
  draftPicksSaved: number;
  transactionsSaved: number;
  rosterEntriesSaved: number;
  playersSaved: number;
  standingsSaved: number;
};

export async function normalizeEspnPayload(
  db: AppDb,
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<NormalizationCounts> {
  const out: NormalizationCounts = {
    teamsSaved: 0,
    matchupsSaved: 0,
    draftPicksSaved: 0,
    transactionsSaved: 0,
    rosterEntriesSaved: 0,
    playersSaved: 0,
    standingsSaved: 0,
  };
  try {
    await upsertLeagueSettings(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.teamsSaved = await upsertTeams(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.matchupsSaved = await upsertMatchups(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.draftPicksSaved = await upsertDraftPicks(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.transactionsSaved = await upsertTransactions(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.rosterEntriesSaved = await upsertRosterEntries(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.playersSaved = await upsertPlayers(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  try {
    out.standingsSaved = await upsertStandingsSnapshots(db, leagueId, season, payload);
  } catch {
    /* skip */
  }
  return out;
}

export type CombinedPersistResult = {
  payloadBytes: number;
  norm: NormalizationCounts;
  normalizationError: string | null;
};

/**
 * After ESPN combined payload is ready: raw cache → normalization → legacy mirrors (best-effort).
 * Does not touch refresh_manifest / espn_view_health (callers: best-effort there).
 */
export async function runEspnCombinedPersist(
  leagueId: string,
  season: number,
  enrichedData: Record<string, unknown>,
  opts?: { syncRunId?: number | null }
): Promise<CombinedPersistResult> {
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const syncRunId = opts?.syncRunId ?? null;
  const { payloadBytes } = await upsertRawEspnCache(lid, yr, "combined", enrichedData);
  console.warn("[espnPersist]", JSON.stringify({
    leagueId: lid,
    season: yr,
    viewName: "combined",
    payloadBytes,
    syncRunId,
    phase: "raw_saved",
  }));
  await writeLegacyEspnCaches(lid, yr, "combined", enrichedData);
  let norm: NormalizationCounts = {
    teamsSaved: 0,
    matchupsSaved: 0,
    draftPicksSaved: 0,
    transactionsSaved: 0,
    rosterEntriesSaved: 0,
    playersSaved: 0,
    standingsSaved: 0,
  };
  let normalizationError: string | null = null;
  try {
    norm = await normalizeEspnPayload(db, lid, yr, enrichedData);
    console.warn("[espnPersist]", JSON.stringify({
      leagueId: lid,
      season: yr,
      viewName: "combined",
      payloadBytes,
      syncRunId,
      normalizationCounts: norm,
      phase: "normalized",
    }));
  } catch (e) {
    normalizationError = e instanceof Error ? e.message : String(e);
    console.warn("[espnPersist] normalization failed:", normalizationError);
  }
  return { payloadBytes, norm, normalizationError };
}

const emptyNormCounts = (): NormalizationCounts => ({
  teamsSaved: 0,
  matchupsSaved: 0,
  draftPicksSaved: 0,
  transactionsSaved: 0,
  rosterEntriesSaved: 0,
  playersSaved: 0,
  standingsSaved: 0,
});

/**
 * Full combined ESPN persist with sync_runs bookkeeping (raw + normalize + legacy mirrors).
 */
export async function syncEspnCombinedFullPipeline(
  leagueId: string,
  season: number,
  enrichedData: Record<string, unknown>,
  meta: { pipelineAllOk: boolean; qualityUsable: boolean }
): Promise<void> {
  const syncRunId = await createSyncRun(leagueId, season);
  try {
    const result = await runEspnCombinedPersist(leagueId, season, enrichedData, { syncRunId });
    const partial =
      result.normalizationError != null ||
      !meta.pipelineAllOk ||
      !meta.qualityUsable;
    await finishSyncRun(
      syncRunId,
      partial ? "partial" : "success",
      {
        rawViewsSaved: 1,
        teamsSaved: result.norm.teamsSaved,
        matchupsSaved: result.norm.matchupsSaved,
        draftPicksSaved: result.norm.draftPicksSaved,
        transactionsSaved: result.norm.transactionsSaved,
        rosterEntriesSaved: result.norm.rosterEntriesSaved,
        playersSaved: result.norm.playersSaved,
        standingsSaved: result.norm.standingsSaved,
      },
      result.normalizationError ?? null
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishSyncRun(syncRunId, "failed", { rawViewsSaved: 0, ...emptyNormCounts() }, msg);
    throw e;
  }
}

/**
 * Re-run only normalized tables (matchups, transactions, roster_entries, standings_snapshots)
 * from an existing combined payload — no ESPN fetch. Creates a sync_runs row with rawViewsSaved=0.
 */
export async function backfillNormalizedTablesFromPayload(
  leagueId: string,
  season: number,
  payload: Record<string, unknown>
): Promise<{
  matchupsSaved: number;
  transactionsSaved: number;
  rosterEntriesSaved: number;
  standingsSaved: number;
  errors: string[];
  syncRunId: number | null;
}> {
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const errors: string[] = [];
  const syncRunId = await createSyncRun(lid, yr);

  const run = async (label: string, fn: () => Promise<number>) => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  };

  const matchupsSaved = await run("upsertMatchups", () => upsertMatchups(db, lid, yr, payload));
  const transactionsSaved = await run("upsertTransactions", () => upsertTransactions(db, lid, yr, payload));
  const rosterEntriesSaved = await run("upsertRosterEntries", () => upsertRosterEntries(db, lid, yr, payload));
  const standingsSaved = await run("upsertStandingsSnapshots", () =>
    upsertStandingsSnapshots(db, lid, yr, payload)
  );

  const status = errors.length > 0 ? "partial" : "success";
  await finishSyncRun(
    syncRunId,
    status,
    {
      rawViewsSaved: 0,
      teamsSaved: 0,
      draftPicksSaved: 0,
      playersSaved: 0,
      matchupsSaved,
      transactionsSaved,
      rosterEntriesSaved,
      standingsSaved,
    },
    errors.length ? errors.join("; ") : null
  );

  return { matchupsSaved, transactionsSaved, rosterEntriesSaved, standingsSaved, errors, syncRunId };
}

export type EspnRawCacheBackfillSeasonResult = {
  season: number;
  status: "success" | "partial" | "no_cache" | "failed";
  teams: number;
  matchups: number;
  draftPicks: number;
  transactions: number;
  rosters: number;
  players: number;
  standings: number;
  errors: string[];
};

function payloadTeamLen(p: Record<string, unknown>): number {
  const t = p.teams;
  return Array.isArray(t) ? t.length : 0;
}

function payloadScheduleLen(p: Record<string, unknown>): number {
  const s = p.schedule;
  return Array.isArray(s) ? s.length : 0;
}

function payloadDraftPickLen(p: Record<string, unknown>): number {
  const dd = p.draftDetail as Record<string, unknown> | undefined;
  const picks = dd?.picks;
  return Array.isArray(picks) ? picks.length : 0;
}

function payloadTxnLen(p: Record<string, unknown>): number {
  const t = p.transactions;
  return Array.isArray(t) ? t.length : 0;
}

function payloadHasRosterEntries(p: Record<string, unknown>): boolean {
  for (const tm of (p.teams as Record<string, unknown>[]) || []) {
    const ent = (tm.roster as Record<string, unknown> | undefined)?.entries;
    if (Array.isArray(ent) && ent.length > 0) return true;
  }
  return false;
}

function payloadPlayersLen(p: Record<string, unknown>): number {
  const pl = p.players;
  return Array.isArray(pl) ? pl.length : 0;
}

/** Merge weekly `mMatchup` payloads into a single combined-shaped object for {@link normalizeMatchups}. */
export function mergeScheduleIntoCombinedPayload(
  combined: Record<string, unknown>,
  matchupPayloads: { week: number; payload: Record<string, unknown> }[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...combined };
  const base = (out.schedule as Record<string, unknown>[]) ?? [];
  const merged: Record<string, unknown>[] = [...base];
  const keyOf = (item: Record<string, unknown>) => {
    const home = (item.home as Record<string, unknown> | undefined)?.teamId;
    const away = (item.away as Record<string, unknown> | undefined)?.teamId;
    const sp = item.scoringPeriodId;
    return `${String(sp)}|${String(home)}|${String(away)}`;
  };
  const seen = new Set(merged.map((x) => keyOf(x)));
  for (const { payload } of matchupPayloads) {
    const sch = (payload.schedule as Record<string, unknown>[]) ?? [];
    for (const item of sch) {
      const k = keyOf(item);
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(item);
      }
    }
  }
  out.schedule = merged;
  return out;
}

export async function countNormalizedGmRowsForSeason(
  leagueId: string,
  season: number,
): Promise<{
  draftPicks: number;
  teams: number;
  matchups: number;
  transactions: number;
}> {
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const [draftPicks, teams, matchups, transactions] = await Promise.all([
    gmCountLeagueSeason(db, schema.gmDraftPicks, lid, yr),
    gmCountLeagueSeason(db, schema.gmTeams, lid, yr),
    gmCountLeagueSeason(db, schema.gmMatchups, lid, yr),
    gmCountLeagueSeason(db, schema.gmTransactions, lid, yr),
  ]);
  return { draftPicks, teams, matchups, transactions };
}

async function gmCountLeagueSeason(
  db: AppDb,
  table:
    | typeof schema.gmTeams
    | typeof schema.gmMatchups
    | typeof schema.gmDraftPicks
    | typeof schema.gmTransactions
    | typeof schema.gmRosterEntries
    | typeof schema.gmStandingsSnapshots,
  leagueId: string,
  season: number
): Promise<number> {
  const lid = String(leagueId).slice(0, 32);
  const yr = Math.floor(Number(season));
  const t = table as typeof schema.gmTeams;
  const [r] = await db
    .select({ c: count() })
    .from(t)
    .where(and(eq(t.leagueId, lid), eq(t.season, yr)));
  return Number(r?.c ?? 0);
}

/** `players` table is keyed by season + playerId only (no leagueId). */
async function gmPlayersSeasonCount(db: AppDb, season: number): Promise<number> {
  const yr = Math.floor(Number(season));
  const [r] = await db.select({ c: count() }).from(schema.gmPlayers).where(eq(schema.gmPlayers.season, yr));
  return Number(r?.c ?? 0);
}

/**
 * Backfill normalized GM tables from **existing** `espn_raw_cache` `combined` payloads only (no ESPN fetch).
 * When `force` is false, skips upserts for categories that already have rows, and skips when the cache
 * slice is empty so we never replace populated tables with empty writes.
 */
export async function runEspnRawCacheNormalizedBackfill(
  leagueId: string,
  seasons: number[],
  opts?: { force?: boolean }
): Promise<EspnRawCacheBackfillSeasonResult[]> {
  const { getEspnRawCacheCombinedPayload } = await import("./db.js");
  const db = await getDbConn();
  if (!db) throw new Error("Database unavailable");
  const lid = String(leagueId).slice(0, 32);
  const force = opts?.force === true;
  const out: EspnRawCacheBackfillSeasonResult[] = [];

  for (const season of seasons) {
    const yr = Math.floor(Number(season));
    const errors: string[] = [];
    const zero = (): EspnRawCacheBackfillSeasonResult => ({
      season: yr,
      status: "failed",
      teams: 0,
      matchups: 0,
      draftPicks: 0,
      transactions: 0,
      rosters: 0,
      players: 0,
      standings: 0,
      errors,
    });

    try {
      const rawPayload = await getEspnRawCacheCombinedPayload(lid, yr);
      if (!rawPayload) {
        out.push({
          season: yr,
          status: "no_cache",
          teams: 0,
          matchups: 0,
          draftPicks: 0,
          transactions: 0,
          rosters: 0,
          players: 0,
          standings: 0,
          errors: [],
        });
        continue;
      }

      const payload: Record<string, unknown> = {
        ...rawPayload,
        seasonId: rawPayload.seasonId != null ? rawPayload.seasonId : yr,
      };

      const syncRunId = await createSyncRun(lid, yr);

      const teamsExisting = await gmCountLeagueSeason(db, schema.gmTeams, lid, yr);
      const matchupsExisting = await gmCountLeagueSeason(db, schema.gmMatchups, lid, yr);
      const draftExisting = await gmCountLeagueSeason(db, schema.gmDraftPicks, lid, yr);
      const txExisting = await gmCountLeagueSeason(db, schema.gmTransactions, lid, yr);
      const rosterExisting = await gmCountLeagueSeason(db, schema.gmRosterEntries, lid, yr);
      const playersExisting = await gmPlayersSeasonCount(db, yr);
      const standingsExisting = await gmCountLeagueSeason(db, schema.gmStandingsSnapshots, lid, yr);

      const hasTeamsPayload = payloadTeamLen(payload) > 0;
      const hasSchedulePayload = payloadScheduleLen(payload) > 0;
      const hasDraftPayload = payloadDraftPickLen(payload) > 0;
      const hasTxnPayload = payloadTxnLen(payload) > 0;
      const hasRosterPayload = payloadHasRosterEntries(payload);
      const hasPlayersPayload = payloadPlayersLen(payload) > 0;
      const hasStandingsPayload = hasTeamsPayload;

      const run = async (label: string, fn: () => Promise<number | void>): Promise<number> => {
        try {
          const v = await fn();
          return typeof v === "number" ? v : 0;
        } catch (e) {
          errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
          return 0;
        }
      };

      let teamsSaved = 0;
      if ((force || teamsExisting === 0) && hasTeamsPayload) {
        await run("upsertLeagueSettings", () => upsertLeagueSettings(db, lid, yr, payload));
        teamsSaved = await run("upsertTeams", () => upsertTeams(db, lid, yr, payload));
      }

      let matchupsSaved = 0;
      if ((force || matchupsExisting === 0) && hasSchedulePayload) {
        matchupsSaved = await run("upsertMatchups", () => upsertMatchups(db, lid, yr, payload));
      }

      let draftPicksSaved = 0;
      if ((force || draftExisting === 0) && hasDraftPayload) {
        draftPicksSaved = await run("upsertDraftPicks", () => upsertDraftPicks(db, lid, yr, payload));
      }

      let transactionsSaved = 0;
      if ((force || txExisting === 0) && hasTxnPayload) {
        transactionsSaved = await run("upsertTransactions", () => upsertTransactions(db, lid, yr, payload));
      }

      let rosterEntriesSaved = 0;
      if ((force || rosterExisting === 0) && hasRosterPayload) {
        rosterEntriesSaved = await run("upsertRosterEntries", () => upsertRosterEntries(db, lid, yr, payload));
      }

      let playersSaved = 0;
      if ((force || playersExisting === 0) && hasPlayersPayload) {
        playersSaved = await run("upsertPlayers", () => upsertPlayers(db, lid, yr, payload));
      }

      let standingsSaved = 0;
      if ((force || standingsExisting === 0) && hasStandingsPayload) {
        standingsSaved = await run("upsertStandingsSnapshots", () => upsertStandingsSnapshots(db, lid, yr, payload));
      }

      const status: EspnRawCacheBackfillSeasonResult["status"] = errors.length > 0 ? "partial" : "success";
      await finishSyncRun(
        syncRunId,
        status,
        {
          rawViewsSaved: 0,
          teamsSaved,
          matchupsSaved,
          draftPicksSaved,
          transactionsSaved,
          rosterEntriesSaved,
          playersSaved,
          standingsSaved,
        },
        errors.length ? errors.join("; ") : null
      );

      out.push({
        season: yr,
        status,
        teams: teamsSaved,
        matchups: matchupsSaved,
        draftPicks: draftPicksSaved,
        transactions: transactionsSaved,
        rosters: rosterEntriesSaved,
        players: playersSaved,
        standings: standingsSaved,
        errors,
      });
    } catch (e) {
      const z = zero();
      z.status = "failed";
      z.errors.push(e instanceof Error ? e.message : String(e));
      out.push(z);
    }
  }

  return out;
}
