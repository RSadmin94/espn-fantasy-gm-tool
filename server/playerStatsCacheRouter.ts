/**
 * server/playerStatsCacheRouter.ts
 * Receives weekly player stat payloads from the Chrome extension and writes
 * them into espn_raw_cache as viewName = "playerStats:{season}:{week}".
 *
 * No ESPN credentials needed on the server side — the extension already
 * fetched the data using the user's ESPN session cookies.
 *
 * Two procedures:
 *   saveWeeklyPlayerStats  - single week, called per-week during extension sync
 *   triggerIngestion       - ask the server to run the ingestion pipeline for a season
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { espnRawCache, gmPlayerRegistry, gmWeeklyPlayerStats, gmTeams, ownerAliases } from "../drizzle/schema";
import {
  eq  as eqD,
  and as andD,
  sql as drizzleSql,
  desc as descD,
} from "drizzle-orm";
import { upsertRawEspnCache } from "./espnPersistence";
import {
  normalizePlayerName,
  isValidPosition,
  isStartingSlot,
  canonicalSlotId,
  type WeeklyStatInsert,
} from "./playerStatsTypes";

// ── ESPN position ID → canonical position ────────────────────────────────────
const ESPN_POS_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE",
  5: "K",  7: "DL", 8: "LB", 9: "DB",
  16: "DEF",
};
function toPos(id?: number | null): string {
  if (id == null) return "";
  return ESPN_POS_MAP[id] ?? "";
}

// ── NFL pro team ID → abbreviation ────────────────────────────────────────────
const PRO_TEAM_MAP: Record<number, string> = {
  1:"ATL",2:"BUF",3:"CHI",4:"CIN",5:"CLE",6:"DAL",7:"DEN",8:"DET",
  9:"GB",10:"TEN",11:"IND",12:"KC",13:"LV",14:"LAR",15:"MIA",
  16:"MIN",17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"PHI",22:"ARI",
  23:"PIT",24:"LAC",25:"SF",26:"SEA",27:"TB",28:"WSH",29:"CAR",
  30:"JAX",33:"BAL",34:"HOU",
};
function toNflTeam(id?: number | null): string | null {
  if (id == null) return null;
  return PRO_TEAM_MAP[id] ?? null;
}

// ── Batch size for inserts ────────────────────────────────────────────────────
const BATCH = 50;

const LEAGUE_ID = "457622";

export const playerStatsCacheRouter = router({

  /**
   * Called by the Chrome extension once per week per season.
   * Receives the raw mMatchupScore payload, validates it, stores it in
   * espn_raw_cache, then immediately runs ingestion for that week.
   */
  saveWeeklyPlayerStats: publicProcedure
    .input(z.object({
      season:  z.number().int().min(2009).max(2030),
      week:    z.number().int().min(1).max(22),
      /** Raw ESPN mMatchupScore JSON for this season+week */
      payload: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ input }) => {
      const { season, week, payload } = input;
      const viewName = `playerStats:${season}:${week}`;

      // Tag payload with season/week so ingestion never guesses
      const enriched = { ...payload, seasonId: season, _fetchedWeek: week };

      // Write to espn_raw_cache
      try {
        await upsertRawEspnCache(LEAGUE_ID, season, viewName, enriched);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[saveWeeklyPlayerStats] cache write failed s${season}w${week}: ${msg}`);
        return { ok: false, error: msg, season, week, playersIngested: 0 };
      }

      // Immediately run ingestion for this week
      const result = await ingestWeekPayload(enriched, season, week);
      return { ok: true, season, week, ...result };
    }),

  /**
   * Returns how many playerStats cache rows exist per season.
   * Used by the extension to show sync progress.
   */
  getPlayerStatsCacheStatus: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { seasons: [] };
      const [rows] = await db.execute(
        drizzleSql`SELECT season,
          SUM(CASE WHEN viewName LIKE 'playerStats:%' THEN 1 ELSE 0 END) AS cached_weeks,
          COUNT(DISTINCT CASE WHEN viewName LIKE 'playerStats:%' THEN viewName END) AS distinct_weeks
        FROM espn_raw_cache WHERE leagueId = ${LEAGUE_ID}
        GROUP BY season ORDER BY season DESC`
      ) as unknown as Array<any>;
      const seasons = (rows as any)?.[0] as Array<{season: number; cached_weeks: number}> ?? [];

      // Also get ingested counts
      const [ingested] = await db.execute(
        drizzleSql`SELECT season, COUNT(*) AS stat_rows, COUNT(DISTINCT playerId) AS players
        FROM gm_weekly_player_stats GROUP BY season ORDER BY season DESC`
      ) as unknown as Array<any>;
      const ingestedRows = (ingested as any)?.[0] as Array<{season: number; stat_rows: number; players: number}> ?? [];
      const ingestedMap = new Map(ingestedRows.map(r => [r.season, r]));

      return {
        seasons: seasons.map(r => ({
          season:      r.season,
          cachedWeeks: Number(r.cached_weeks),
          ingestedRows: ingestedMap.get(r.season)?.stat_rows ?? 0,
          ingestedPlayers: ingestedMap.get(r.season)?.players ?? 0,
        })),
      };
    }),

});

// ── Ingestion logic (server-side, called after cache write) ───────────────────

type IngestResult = {
  playersUpserted: number;
  statsUpserted:   number;
  skipped:         number;
  reviewItems:     string[];
};

async function ingestWeekPayload(
  payload: Record<string, unknown>,
  season:  number,
  week:    number
): Promise<IngestResult> {
  const db = await getDb();
  if (!db) return { playersUpserted: 0, statsUpserted: 0, skipped: 0, reviewItems: ["DB unavailable"] };

  const isLegacy = season <= 2017;
  const reviewItems: string[] = [];
  let playersUpserted = 0, statsUpserted = 0, skipped = 0;

  // ── 1. Build ownerKey map ──────────────────────────────────────────────────
  const [teamRows, aliasRows] = await Promise.all([
    db.select({ teamId: gmTeams.teamId, ownerName: gmTeams.ownerName, ownerId: gmTeams.ownerId })
      .from(gmTeams)
      .where(andD(eqD(gmTeams.leagueId, LEAGUE_ID), eqD(gmTeams.season, season))),
    db.select({ legacyTeamName: ownerAliases.legacyTeamName, resolvedOwnerName: ownerAliases.resolvedOwnerName })
      .from(ownerAliases)
      .where(andD(eqD(ownerAliases.leagueId, LEAGUE_ID), eqD(ownerAliases.status, "approved"))),
  ]);
  const aliasMap = new Map(aliasRows.filter(a => a.resolvedOwnerName).map(a => [a.legacyTeamName.toLowerCase(), a.resolvedOwnerName!]));
  const ownerKeyMap = new Map<number, string>();
  for (const t of teamRows) {
    if (!t.teamId) continue;
    const name = (t.ownerName ?? "").trim();
    const resolved = aliasMap.get(name.toLowerCase()) ?? name;
    const key = t.ownerId?.trim() ? t.ownerId.trim() : `name:${resolved.toLowerCase().replace(/\s+/g, "-")}`;
    ownerKeyMap.set(t.teamId, key);
  }

  // ── 2. Pre-load player index ───────────────────────────────────────────────
  const regRows = await db
    .select({ id: gmPlayerRegistry.id, espnPlayerId: gmPlayerRegistry.espnPlayerId, normalizedName: gmPlayerRegistry.normalizedName, position: gmPlayerRegistry.position })
    .from(gmPlayerRegistry)
    .limit(100_000);
  const byEspnId      = new Map<string, number>(regRows.filter(r => r.espnPlayerId).map(r => [r.espnPlayerId!, r.id]));
  const byNormNamePos = new Map<string, number>(regRows.filter(r => r.normalizedName && r.position).map(r => [`${r.normalizedName}|${r.position}`, r.id]));

  // ── 3. Extract entries from the mMatchupScore payload ─────────────────────
  type RosterEntry = {
    espnId:       number;
    fullName:     string;
    normalizedName: string;
    position:     string;
    nflTeam:      string | null;
    lineupSlotId: number | null;
    points:       number;
    teamId:       number;
  };

  const entries: RosterEntry[] = [];
  const schedule = Array.isArray(payload.schedule) ? payload.schedule as Record<string, unknown>[] : [];
  const seen = new Set<string>();

  for (const matchup of schedule) {
    if (!matchup || typeof matchup !== "object") continue;
    const m = matchup as Record<string, unknown>;
    for (const side of ["home", "away"] as const) {
      const team = m[side] as Record<string, unknown> | undefined;
      if (!team) continue;
      const teamId = Number(team.teamId ?? 0);
      if (!teamId) continue;

      const rosterEntries: unknown[] =
        (team.rosterForCurrentScoringPeriod as any)?.entries ??
        (team.rosterForMatchupPeriod as any)?.entries ??
        (team.roster as any)?.entries ??
        [];

      for (const e of rosterEntries) {
        if (!e || typeof e !== "object") continue;
        const entry = e as Record<string, unknown>;
        const lineupSlotId = entry.lineupSlotId != null ? Number(entry.lineupSlotId) : null;
        const poolEntry = (entry.playerPoolEntry ?? entry) as Record<string, unknown>;
        const pts = entry.appliedStatTotal ?? (poolEntry as any).appliedStatTotal ?? (poolEntry as any).totalPoints;

        if (pts === null || pts === undefined) { skipped++; continue; }
        const ptsNum = Number(pts);
        if (!Number.isFinite(ptsNum)) { skipped++; continue; }

        const player: Record<string, unknown> =
          (poolEntry as any)?.playerPoolEntry?.player ??
          (poolEntry as any)?.player ??
          {};

        const espnId = Number(player.id ?? entry.playerId ?? (poolEntry as any).id);
        const fullName = String(
          player.fullName ?? [player.firstName, player.lastName].filter(Boolean).join(" ") ?? ""
        ).trim();

        if (!fullName || !Number.isFinite(espnId) || espnId <= 0) { skipped++; continue; }

        const position = toPos(player.defaultPositionId as number | undefined);
        if (!isValidPosition(position)) { skipped++; continue; }

        const dedupKey = `${espnId}:${week}:${teamId}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        entries.push({
          espnId,
          fullName,
          normalizedName: normalizePlayerName(fullName),
          position,
          nflTeam: toNflTeam(player.proTeamId as number | undefined),
          lineupSlotId,
          points: ptsNum,
          teamId,
        });
      }
    }
  }

  // ── 4. Upsert players and collect registry IDs ────────────────────────────
  const statsBatch: WeeklyStatInsert[] = [];

  for (let i = 0; i < entries.length; i += BATCH) {
    const chunk = entries.slice(i, i + BATCH);
    for (const e of chunk) {
      const eid = String(e.espnId);
      const npKey = `${e.normalizedName}|${e.position}`;

      let registryId = byEspnId.get(eid) ?? byNormNamePos.get(npKey);

      if (!registryId) {
        // Insert new player
        try {
          await db.insert(gmPlayerRegistry).values({
            espnPlayerId:    eid,
            fullName:        e.fullName,
            normalizedName:  e.normalizedName,
            position:        e.position,
            currentNflTeam:  e.nflTeam,
            firstSeasonSeen: season,
            lastSeasonSeen:  season,
            isActive:        true,
            needsReview:     isLegacy,
            reviewReason:    isLegacy ? "Legacy season — verify identity" : null,
          }).onDuplicateKeyUpdate({
            set: {
              lastSeasonSeen:  drizzleSql`GREATEST(last_season_seen, ${season})`,
              currentNflTeam:  e.nflTeam ?? drizzleSql`current_nfl_team`,
              updatedAt:       new Date(),
            },
          });
          const [inserted] = await db.select({ id: gmPlayerRegistry.id })
            .from(gmPlayerRegistry)
            .where(eqD(gmPlayerRegistry.espnPlayerId, eid))
            .limit(1);
          if (inserted) {
            registryId = inserted.id;
            byEspnId.set(eid, registryId);
            byNormNamePos.set(npKey, registryId);
            playersUpserted++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          reviewItems.push(`Player insert failed: ${e.fullName} — ${msg.slice(0, 80)}`);
          continue;
        }
      } else {
        // Update existing player's lastSeasonSeen
        try {
          await db.update(gmPlayerRegistry)
            .set({ lastSeasonSeen: season, updatedAt: new Date() })
            .where(eqD(gmPlayerRegistry.id, registryId));
          playersUpserted++;
        } catch { /* non-fatal */ }
      }

      if (!registryId) { skipped++; continue; }

      const ownerKey = ownerKeyMap.get(e.teamId) ?? `team:${e.teamId}`;

      statsBatch.push({
        playerId:         registryId,
        season,
        week,
        pointsScored:     e.points,
        rosterSlotId:     canonicalSlotId(e.lineupSlotId),
        isStarter:        isStartingSlot(e.lineupSlotId),
        ownerKey,
        teamId:           e.teamId,
        source:           "espn",
        sourceConfidence: isLegacy ? 90 : 100,
        needsReview:      isLegacy,
        reviewReason:     isLegacy ? "Legacy season" : null,
      });
    }
  }

  // ── 5. Batch upsert weekly stats ──────────────────────────────────────────
  for (const s of statsBatch) {
    try {
      await db.insert(gmWeeklyPlayerStats).values({
        playerId:         s.playerId,
        season:           s.season,
        week:             s.week,
        pointsScored:     s.pointsScored,
        rosterSlotId:     s.rosterSlotId,
        isStarter:        s.isStarter,
        ownerKey:         s.ownerKey,
        teamId:           s.teamId ?? null,
        source:           s.source ?? "espn",
        sourceConfidence: s.sourceConfidence ?? 100,
        needsReview:      s.needsReview ?? false,
        reviewReason:     s.reviewReason ?? null,
      }).onDuplicateKeyUpdate({
        set: {
          pointsScored:     s.pointsScored,
          isStarter:        s.isStarter,
          rosterSlotId:     s.rosterSlotId,
          sourceConfidence: s.sourceConfidence ?? 100,
          updatedAt:        new Date(),
        },
      });
      statsUpserted++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      reviewItems.push(`Stats upsert s${season}w${week}: ${msg.slice(0, 80)}`);
    }
  }

  return { playersUpserted, statsUpserted, skipped, reviewItems };
}

export type PlayerStatsCacheRouter = typeof playerStatsCacheRouter;
