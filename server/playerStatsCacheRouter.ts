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
  /**
   * Called by the extension after fetching ?view=mRoster for a season.
   * Accepts the raw player list and upserts into gm_player_registry.
   */
  saveRosterPlayers: publicProcedure
    .input(z.object({
      season:  z.number().int().min(2009).max(2030),
      players: z.array(z.object({
        espnId:   z.number().int(),
        fullName: z.string().min(1).max(100),
        position: z.string().max(10),
        nflTeam:  z.string().max(5).nullable().optional(),
      })).min(1).max(1500),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable", received: 0, valid: 0, inserted: 0, updated: 0, skipped: 0, skipReasons: [] };

      const { season, players } = input;
      const isLegacy = season <= 2017;

      const received   = players.length;
      let inserted     = 0;
      let updated      = 0;
      let skipped      = 0;
      const skipReasons: string[] = [];

      // Load existing ESPN IDs into memory to decide insert vs update
      const existing = await db.execute(
        drizzleSql`SELECT id, espnPlayerId FROM gm_player_registry WHERE espnPlayerId IS NOT NULL LIMIT 200000`
      ) as unknown as Array<any>;
      const existingRows = ((existing as any)?.[0] ?? []) as Array<{ id: number; espnPlayerId: string }>;
      const byEspnId = new Map<string, number>(existingRows.map(r => [String(r.espnPlayerId), r.id]));

      for (const p of players) {
        const eid      = String(p.espnId);
        const pos      = p.position?.trim();
        const fullName = p.fullName?.trim();
        const nflTeam  = p.nflTeam ?? null;

        if (!eid || !fullName || !pos) {
          skipped++;
          skipReasons.push(`espnId=${p.espnId}: missing required field (name=${!!fullName} pos=${!!pos})`);
          continue;
        }

        const norm = normalizePlayerName(fullName);

        try {
          if (byEspnId.has(eid)) {
            // Update lastSeasonSeen if higher, refresh NFL team
            await db.execute(drizzleSql`
              UPDATE gm_player_registry
              SET lastSeasonSeen = GREATEST(lastSeasonSeen, ${season}),
                  currentNflTeam = ${nflTeam},
                  updatedAt      = NOW()
              WHERE espnPlayerId = ${eid}
            `);
            updated++;
          } else {
            // Insert new player
            await db.execute(drizzleSql`
              INSERT INTO gm_player_registry
                (espnPlayerId, fullName, normalizedName, position, currentNflTeam,
                 firstSeasonSeen, lastSeasonSeen, isActive, needsReview, reviewReason,
                 createdAt, updatedAt)
              VALUES
                (${eid}, ${fullName}, ${norm}, ${pos}, ${nflTeam},
                 ${season}, ${season}, 1, ${isLegacy ? 1 : 0}, ${isLegacy ? "Legacy season" : null},
                 NOW(), NOW())
              ON DUPLICATE KEY UPDATE
                lastSeasonSeen = GREATEST(lastSeasonSeen, ${season}),
                currentNflTeam = ${nflTeam},
                updatedAt      = NOW()
            `);
            byEspnId.set(eid, -1); // mark as known
            inserted++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          skipped++;
          if (skipReasons.length < 5) skipReasons.push(`espnId=${eid} ${fullName}: ${msg.slice(0, 80)}`);
        }
      }

      return {
        ok:          true,
        season,
        received,
        valid:       received - skipped,
        inserted,
        updated,
        skipped,
        skipReasons: skipReasons.slice(0, 5),
      };
    }),

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

  /**
   * Read every combined/mRoster row already in espn_raw_cache,
   * extract player identity (id, name, position, NFL team) from each
   * team roster, and upsert into gm_player_registry.
   * No new ESPN fetches required — works entirely off existing cache data.
   */
  syncPlayersFromCache: publicProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable", inserted: 0, updated: 0, skipped: 0 };

      // Load all combined/mRoster rows for every season
      const [cacheRows] = await db.execute(
        drizzleSql`SELECT season, viewName, payload FROM espn_raw_cache WHERE leagueId = ${LEAGUE_ID} ORDER BY season ASC`
      ) as unknown as Array<any>;

      const rows = (cacheRows as any) as Array<{ season: number; viewName: string; payload: string }> ?? [];

      // Pre-load existing registry index
      const regRows = await db.select({
          id: gmPlayerRegistry.id,
          espnPlayerId: gmPlayerRegistry.espnPlayerId,
        }).from(gmPlayerRegistry).limit(200_000);

      const byEspnId = new Map<string, number>(
        regRows.filter(r => r.espnPlayerId).map(r => [r.espnPlayerId!, r.id])
      );

      let inserted = 0, updated = 0, skipped = 0;

      for (const row of rows) {
        let payload: Record<string, unknown>;
        try { payload = JSON.parse(row.payload); } catch { continue; }

        const season = row.season;
        const isLegacy = season <= 2017;

        // Extract teams array — handles both array and object-keyed formats
        const rawTeams = payload.teams;
        const teams: Record<string, unknown>[] = Array.isArray(rawTeams)
          ? rawTeams as Record<string, unknown>[]
          : rawTeams && typeof rawTeams === "object"
            ? Object.values(rawTeams as Record<string, Record<string, unknown>>)
            : [];

        for (const team of teams) {
          const entries: Record<string, unknown>[] =
            ((team.roster as any)?.entries as Record<string, unknown>[]) ?? [];

          for (const entry of entries) {
            const pool   = (entry.playerPoolEntry as Record<string, unknown>) ?? {};
            const player = (pool.player as Record<string, unknown>) ?? {};

            const espnId   = Number(player.id);
            const fullName = String(player.fullName ?? "").trim();
            if (!espnId || !fullName) { skipped++; continue; }

            const posId    = Number(player.defaultPositionId);
            const position = ESPN_POS_MAP[posId] ?? "";
            if (!position) { skipped++; continue; }

            const nflTeam       = toNflTeam(player.proTeamId as number | undefined);
            const normalizedName = normalizePlayerName(fullName);
            const eid            = String(espnId);

            const existingId = byEspnId.get(eid);

            if (existingId) {
              // Update lastSeasonSeen
              try {
                await db.update(gmPlayerRegistry)
                  .set({
                    lastSeasonSeen: drizzleSql`GREATEST(last_season_seen, ${season})`,
                    currentNflTeam: nflTeam ?? drizzleSql`current_nfl_team`,
                    updatedAt:      new Date(),
                  })
                  .where(eqD(gmPlayerRegistry.id, existingId));
                updated++;
              } catch { skipped++; }
            } else {
              // Insert new
              try {
                await db.insert(gmPlayerRegistry).values({
                  espnPlayerId:    eid,
                  fullName,
                  normalizedName,
                  position,
                  currentNflTeam:  nflTeam,
                  firstSeasonSeen: season,
                  lastSeasonSeen:  season,
                  isActive:        true,
                  needsReview:     isLegacy,
                  reviewReason:    isLegacy ? "Legacy season" : null,
                }).onDuplicateKeyUpdate({
                  set: {
                    lastSeasonSeen:  drizzleSql`GREATEST(last_season_seen, ${season})`,
                    currentNflTeam:  nflTeam ?? drizzleSql`current_nfl_team`,
                    updatedAt:       new Date(),
                  },
                });

                const [ins] = await db.select({ id: gmPlayerRegistry.id })
                  .from(gmPlayerRegistry)
                  .where(eqD(gmPlayerRegistry.espnPlayerId, eid))
                  .limit(1);
                if (ins) { byEspnId.set(eid, ins.id); inserted++; }
                else { skipped++; }
              } catch { skipped++; }
            }
          }
        }
      }

      return { ok: true, seasonsScanned: rows.length, inserted, updated, skipped };
    }),

});

// -- Ingestion logic (server-side, called after cache write) ───────────────────

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
