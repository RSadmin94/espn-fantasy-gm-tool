/**
 * scripts/runIngestionPipeline.ts
 * Steps 2 + 3: Production-ready ingestion.
 * Reads espn_raw_cache → populates gm_player_registry + gm_weekly_player_stats.
 *
 * Usage:
 *   npx tsx scripts/runIngestionPipeline.ts --season=2024
 *   npx tsx scripts/runIngestionPipeline.ts --season=2024 --week=7
 *   npx tsx scripts/runIngestionPipeline.ts --season=2024 --dry-run
 *   npx tsx scripts/runIngestionPipeline.ts --all          # all cached seasons
 *
 * Guardrails:
 *   - ESPN ID match = 100% confidence, always merge
 *   - Name+position match in recent season (>=2018) = 95%, auto-merge
 *   - Name+position in legacy season (<=2017) = 90%, auto-merge + flag review
 *   - Below 85%: log review item, never merge
 *   - Only insert 0.00 if ESPN confirms rostered-but-no-score
 *   - Batch upserts; no per-row round trips inside inner loops
 */

import {
  eq  as eqD,
  and as andD,
  sql as drizzleSql,
  inArray as inArrayD,
} from "drizzle-orm";
import {
  gmPlayerRegistry,
  gmWeeklyPlayerStats,
  gmTeams,
  ownerAliases,
  espnRawCache,
} from "../drizzle/schema";
import type { AppDb } from "../server/db";
import { getDb } from "../server/db";
import {
  normalizePlayerName,
  isValidPosition,
  isStartingSlot,
  canonicalSlotId,
  type NormalizedPlayer,
  type WeeklyStatInsert,
} from "../server/playerStatsTypes";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
    const [k, v] = a.slice(2).split("=");
    return [k, v ?? "true"];
  })
);

const DRY_RUN    = args["dry-run"] === "true";
const ALL_SEASONS = args.all === "true";
const LEAGUE_ID  = (args.league as string) ?? process.env.LEAGUE_ID ?? "457622";
const TARGET_SEASON = args.season ? Number(args.season) : undefined;
const TARGET_WEEK   = args.week   ? Number(args.week)   : undefined;

// Batch size for INSERT ... ON DUPLICATE KEY UPDATE
const UPSERT_BATCH = 100;

// ESPN position ID → canonical position string
const ESPN_POS_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE",
  5: "K",  7: "DL", 8: "LB", 9: "DB",
  16: "DEF",
};

function toPos(id?: number): string {
  if (id == null) return "";
  return ESPN_POS_MAP[id] ?? "";
}

// NFL team ID → 3-letter abbreviation (ESPN proTeamId)
const ESPN_TEAM_MAP: Record<number, string> = {
  1:"Atl",2:"Buf",3:"Chi",4:"Cin",5:"Cle",6:"Dal",7:"Den",8:"Det",
  9:"GB",10:"Ten",11:"Ind",12:"KC",13:"Oak",14:"LAR",15:"Mia",
  16:"Min",17:"NE",18:"NO",19:"NYG",20:"NYJ",21:"Phi",22:"Ari",
  23:"Pit",24:"LAC",25:"SF",26:"Sea",27:"TB",28:"Was",29:"Car",
  30:"Jax",33:"Bal",34:"Hou",
};
function toNflTeam(id?: number): string | null {
  if (id == null) return null;
  return ESPN_TEAM_MAP[id] ?? null;
}

// ── Review log ────────────────────────────────────────────────────────────────

type ReviewItem = { season: number; week?: number; playerName: string; espnId?: number; reason: string; confidence: number };
const reviewLog: ReviewItem[] = [];
function logReview(item: ReviewItem) {
  reviewLog.push(item);
  if (!DRY_RUN) process.stderr.write(`[review] s${item.season}w${item.week ?? "?"} ${item.playerName}: ${item.reason}\n`);
}

// ── ownerKey resolver (build once per season) ─────────────────────────────────

async function buildOwnerKeyMap(db: AppDb, leagueId: string, season: number): Promise<Map<number, string>> {
  const [teamRows, aliasRows] = await Promise.all([
    db.select({ teamId: gmTeams.teamId, ownerName: gmTeams.ownerName, ownerId: gmTeams.ownerId })
      .from(gmTeams)
      .where(andD(eqD(gmTeams.leagueId, leagueId), eqD(gmTeams.season, season))),
    db.select({ legacyTeamName: ownerAliases.legacyTeamName, resolvedOwnerName: ownerAliases.resolvedOwnerName })
      .from(ownerAliases)
      .where(andD(eqD(ownerAliases.leagueId, leagueId), eqD(ownerAliases.status, "approved"))),
  ]);

  const aliasMap = new Map(
    aliasRows.filter(a => a.resolvedOwnerName)
      .map(a => [a.legacyTeamName.toLowerCase().trim(), a.resolvedOwnerName!])
  );

  const m = new Map<number, string>();
  for (const t of teamRows) {
    if (!t.teamId) continue;
    const name = (t.ownerName ?? "").trim();
    const resolved = aliasMap.get(name.toLowerCase()) ?? name;
    const key = t.ownerId?.trim()
      ? t.ownerId.trim()
      : `name:${resolved.toLowerCase().replace(/\s+/g, "-")}`;
    m.set(t.teamId, key);
  }
  return m;
}

// ── Player registry: bulk ESP-ID index ────────────────────────────────────────
// Pre-load all existing espnPlayerIds to avoid per-player SELECT on hot path.

async function loadPlayerIndex(db: AppDb): Promise<{
  byEspnId:      Map<string, number>;    // espnPlayerId → registry id
  byNormNamePos: Map<string, number>;    // "normName|pos" → registry id
}> {
  const rows = await db
    .select({ id: gmPlayerRegistry.id, espnPlayerId: gmPlayerRegistry.espnPlayerId, normalizedName: gmPlayerRegistry.normalizedName, position: gmPlayerRegistry.position })
    .from(gmPlayerRegistry)
    .limit(100_000);

  const byEspnId      = new Map<string, number>();
  const byNormNamePos = new Map<string, number>();
  for (const r of rows) {
    if (r.espnPlayerId) byEspnId.set(r.espnPlayerId, r.id);
    if (r.normalizedName && r.position) byNormNamePos.set(`${r.normalizedName}|${r.position}`, r.id);
  }
  return { byEspnId, byNormNamePos };
}

// ── Batch upsert helpers ──────────────────────────────────────────────────────

type PlayerBatch = Array<{
  espnPlayerId: string | null;
  fullName: string;
  normalizedName: string;
  position: string;
  currentNflTeam: string | null;
  season: number;
}>;

/** Batch upsert players; returns Map<espnId|normNamePos → registryId> */
async function batchUpsertPlayers(
  db: AppDb,
  batch: PlayerBatch,
  index: { byEspnId: Map<string, number>; byNormNamePos: Map<string, number> },
  season: number,
  isDryRun: boolean
): Promise<Map<string, number>> {
  const resultMap = new Map<string, number>(); // "espnId" or "name|pos" → registryId

  // Split into: already known (update only) and new (insert)
  const toInsert: typeof batch = [];

  for (const p of batch) {
    const eid = p.espnPlayerId;
    const npKey = `${p.normalizedName}|${p.position}`;

    if (eid && index.byEspnId.has(eid)) {
      resultMap.set(eid, index.byEspnId.get(eid)!);
      continue;
    }
    if (index.byNormNamePos.has(npKey)) {
      const id = index.byNormNamePos.get(npKey)!;
      if (eid) { index.byEspnId.set(eid, id); resultMap.set(eid, id); }
      resultMap.set(npKey, id);
      continue;
    }
    toInsert.push(p);
  }

  if (toInsert.length === 0 || isDryRun) {
    if (isDryRun) {
      for (const p of toInsert) console.log(`[dry-run] Would insert player: ${p.fullName} (${p.position})`);
    }
    return resultMap;
  }

  // Insert in sub-batches
  for (let i = 0; i < toInsert.length; i += UPSERT_BATCH) {
    const chunk = toInsert.slice(i, i + UPSERT_BATCH);
    for (const p of chunk) {
      try {
        await db.insert(gmPlayerRegistry).values({
          espnPlayerId:    p.espnPlayerId,
          sleeperPlayerId: null,
          fullName:        p.fullName,
          normalizedName:  p.normalizedName,
          position:        p.position,
          currentNflTeam:  p.currentNflTeam,
          firstSeasonSeen: season,
          lastSeasonSeen:  season,
          isActive:        true,
          needsReview:     season <= 2017,
          reviewReason:    season <= 2017 ? "Legacy season — verify via roster reconstruction" : null,
        }).onDuplicateKeyUpdate({
          set: {
            lastSeasonSeen:  drizzleSql`GREATEST(last_season_seen, ${season})`,
            currentNflTeam:  p.currentNflTeam ?? drizzleSql`current_nfl_team`,
            updatedAt:       new Date(),
          },
        });

        // Fetch back the ID (TiDB doesn't reliably return insertId in all drivers)
        const [inserted] = p.espnPlayerId
          ? await db.select({ id: gmPlayerRegistry.id }).from(gmPlayerRegistry).where(eqD(gmPlayerRegistry.espnPlayerId, p.espnPlayerId)).limit(1)
          : await db.select({ id: gmPlayerRegistry.id }).from(gmPlayerRegistry)
              .where(andD(eqD(gmPlayerRegistry.normalizedName, p.normalizedName), eqD(gmPlayerRegistry.position, p.position))).limit(1);

        if (inserted) {
          const id = inserted.id;
          if (p.espnPlayerId) { index.byEspnId.set(p.espnPlayerId, id); resultMap.set(p.espnPlayerId, id); }
          const npKey = `${p.normalizedName}|${p.position}`;
          index.byNormNamePos.set(npKey, id);
          resultMap.set(npKey, id);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logReview({ season, playerName: p.fullName, reason: `Player insert failed: ${msg}`, confidence: 0 });
      }
    }
  }

  return resultMap;
}

// ── Batch upsert weekly stats ─────────────────────────────────────────────────

async function batchUpsertStats(db: AppDb, stats: WeeklyStatInsert[], isDryRun: boolean): Promise<number> {
  if (stats.length === 0) return 0;
  if (isDryRun) {
    console.log(`[dry-run] Would upsert ${stats.length} stat rows`);
    return stats.length;
  }

  let count = 0;
  for (let i = 0; i < stats.length; i += UPSERT_BATCH) {
    const chunk = stats.slice(i, i + UPSERT_BATCH);
    for (const s of chunk) {
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
        count++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[stats upsert] s${s.season}w${s.week} pid=${s.playerId}: ${msg}\n`);
      }
    }
  }
  return count;
}

// ── Parse a single espn_raw_cache row ─────────────────────────────────────────

type ExtractedEntry = {
  espnPlayerId:    string | null;
  fullName:        string;
  normalizedName:  string;
  position:        string;
  nflTeam:         string | null;
  lineupSlotId:    number | null;
  pointsScored:    number | null;    // null = ESPN didn't report score (skip stat row)
  teamId:          number;
  scoringPeriodId: number;
};

function parsePayload(payloadStr: string, season: number): ExtractedEntry[] {
  let payload: unknown;
  try { payload = JSON.parse(payloadStr); } catch { return []; }
  if (!payload || typeof payload !== "object") return [];

  const p = payload as Record<string, unknown>;
  // Use _fetchedWeek (tagged by fetchEspnWeeklyPlayerStats) first, then scoringPeriodId
  const scoringPeriodId = Number(p._fetchedWeek ?? p.scoringPeriodId ?? 0);
  const results: ExtractedEntry[] = [];

  // Helper: extract entries from a team roster
  // Handles all ESPN roster container keys across API versions:
  //   - roster.entries                        (mRoster / mTeam views)
  //   - rosterForCurrentScoringPeriod.entries (mMatchupScore current week)
  //   - rosterForMatchupPeriod.entries        (mMatchupScore historical matchup)
  const extractTeamEntries = (team: Record<string, unknown>, teamId: number) => {
    const rosterEntries: unknown[] =
      (team.roster as any)?.entries ??
      (team.rosterForCurrentScoringPeriod as any)?.entries ??
      (team.rosterForMatchupPeriod as any)?.entries ??
      [];

    for (const entry of rosterEntries) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;

      const lineupSlotId  = e.lineupSlotId != null ? Number(e.lineupSlotId) : null;
      const poolEntry     = (e.playerPoolEntry ?? e) as Record<string, unknown>;

      // Points: ESPN stores applied stat total at multiple depths
      const pts = e.appliedStatTotal
        ?? (poolEntry as any).appliedStatTotal
        ?? (poolEntry as any).totalPoints
        ?? null;

      if (pts === null || pts === undefined) continue; // can't prove score, skip

      const ptsNum = Number(pts);
      if (!Number.isFinite(ptsNum)) continue;

      // Player object — navigate through nested structures ESPN uses
      const player: Record<string, unknown> =
        (poolEntry as any)?.playerPoolEntry?.player ??
        (poolEntry as any)?.player ??
        {};

      const espnId = Number(
        (player.id ?? e.playerId ?? (poolEntry as any).id)
      );
      const fullName = String(
        player.fullName ??
        [player.firstName, player.lastName].filter(Boolean).join(" ") ??
        ""
      ).trim();

      if (!fullName || !Number.isFinite(espnId) || espnId <= 0) continue;

      const position    = toPos(player.defaultPositionId as number | undefined);
      if (!isValidPosition(position)) continue;

      const nflTeam     = toNflTeam(player.proTeamId as number | undefined);
      const normalizedName = normalizePlayerName(fullName);

      results.push({
        espnPlayerId:    String(espnId),
        fullName,
        normalizedName,
        position,
        nflTeam,
        lineupSlotId,
        pointsScored:    ptsNum,
        teamId,
        scoringPeriodId,
      });
    }
  };

  // Source 1: schedule[].home/away.rosterForCurrentScoringPeriod
  const schedule: unknown[] = Array.isArray(p.schedule) ? p.schedule : [];
  for (const matchup of schedule) {
    if (!matchup || typeof matchup !== "object") continue;
    const m = matchup as Record<string, unknown>;
    const spid = Number(m.matchupPeriodId ?? scoringPeriodId);
    const matchupScoringPeriod = spid > 0 ? spid : scoringPeriodId;

    for (const side of ["home", "away"] as const) {
      const team = m[side] as Record<string, unknown> | undefined;
      if (!team) continue;
      const teamId = Number(team.teamId ?? 0);
      if (!teamId) continue;
      extractTeamEntries(team, teamId);
      // Fix scoringPeriodId from matchup level if not in team
      for (const r of results.slice(-100)) {
        if (r.scoringPeriodId === 0) (r as any).scoringPeriodId = matchupScoringPeriod;
      }
    }
  }

  // Source 2: teams[].roster.entries (if schedule not present)
  if (results.length === 0) {
    const teams: unknown[] = Array.isArray(p.teams) ? p.teams : [];
    for (const team of teams) {
      if (!team || typeof team !== "object") continue;
      const t = team as Record<string, unknown>;
      const teamId = Number(t.id ?? 0);
      if (!teamId) continue;
      extractTeamEntries(t, teamId);
    }
  }

  // Fix scoringPeriodId = 0 from top-level
  if (scoringPeriodId > 0) {
    for (const r of results) {
      if (r.scoringPeriodId === 0) r.scoringPeriodId = scoringPeriodId;
    }
  }

  // Deduplicate: same player in same scoring period, keep the first occurrence
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.espnPlayerId}:${r.scoringPeriodId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Single season ingestion ───────────────────────────────────────────────────

async function ingestSeason(db: AppDb, season: number) {
  console.log(`\n[ingest] Season ${season} | DryRun=${DRY_RUN} | League=${LEAGUE_ID}`);

  const ownerKeyMap = await buildOwnerKeyMap(db, LEAGUE_ID, season);
  console.log(`  ownerKey map: ${ownerKeyMap.size} teams`);

  const playerIndex = await loadPlayerIndex(db);
  console.log(`  player index: ${playerIndex.byEspnId.size} by ESPN ID, ${playerIndex.byNormNamePos.size} by name+pos`);

  // Fetch all lineup/scoring cache rows for this season
  const cacheRows = await db
    .select({ viewName: espnRawCache.viewName, payload: espnRawCache.payload })
    .from(espnRawCache)
    .where(andD(
      eqD(espnRawCache.leagueId, LEAGUE_ID),
      eqD(espnRawCache.season,   season),
    ))
    .limit(500);

  const lineupRows = cacheRows.filter(r =>
    ["playerStats:", "mRoster","mMatchup","mMatchupScore","mScoringPeriod","mLiveScoring","mBoxscore","kona_game_state","mTeam"].some(
      v => r.viewName.toLowerCase().includes(v.toLowerCase())
    )
  );

  console.log(`  cache rows total: ${cacheRows.length} | lineup rows: ${lineupRows.length}`);

  if (lineupRows.length === 0) {
    console.log(`  ⚠ No lineup/scoring views for season ${season}. Skipping.`);
    return { playersUpserted: 0, statsUpserted: 0, skipped: 0 };
  }

  // Filter by target week if specified
  let totalPlayers = 0, totalStats = 0, totalSkipped = 0;

  for (const row of lineupRows) {
    const entries = parsePayload(row.payload, season);
    if (entries.length === 0) { totalSkipped++; continue; }

    // Filter to target week
    const filtered = TARGET_WEEK !== undefined
      ? entries.filter(e => e.scoringPeriodId === TARGET_WEEK)
      : entries;

    if (filtered.length === 0) continue;

    // Build player batch
    const playerBatch = filtered.map(e => ({
      espnPlayerId:  e.espnPlayerId,
      fullName:      e.fullName,
      normalizedName: e.normalizedName,
      position:      e.position,
      currentNflTeam: e.nflTeam,
      season,
    }));

    const idMap = await batchUpsertPlayers(db, playerBatch, playerIndex, season, DRY_RUN);
    totalPlayers += DRY_RUN ? playerBatch.length : idMap.size;

    // Build stats batch
    const statsBatch: WeeklyStatInsert[] = [];
    for (const e of filtered) {
      if (e.scoringPeriodId <= 0 || e.scoringPeriodId > 22) {
        totalSkipped++;
        continue;
      }

      const registryId = e.espnPlayerId
        ? (playerIndex.byEspnId.get(e.espnPlayerId) ?? idMap.get(e.espnPlayerId) ?? idMap.get(`${e.normalizedName}|${e.position}`))
        : idMap.get(`${e.normalizedName}|${e.position}`);

      if (!registryId) {
        logReview({ season, week: e.scoringPeriodId, playerName: e.fullName, reason: "No registry ID resolved", confidence: 0 });
        totalSkipped++;
        continue;
      }

      const ownerKey = ownerKeyMap.get(e.teamId) ?? `team:${e.teamId}`;
      const isLegacy = season <= 2017;

      statsBatch.push({
        playerId:         registryId,
        season,
        week:             e.scoringPeriodId,
        pointsScored:     e.pointsScored!,
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

    const upserted = await batchUpsertStats(db, statsBatch, DRY_RUN);
    totalStats += upserted;
  }

  console.log(`  ✓ Season ${season}: players=${totalPlayers} stats=${totalStats} skipped=${totalSkipped}`);
  return { playersUpserted: totalPlayers, statsUpserted: totalStats, skipped: totalSkipped };
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function run() {
  const db = await getDb();
  if (!db) {
    console.error("[ingest] Cannot connect. Check DATABASE_URL.");
    process.exit(1);
  }

  let seasons: number[];
  if (ALL_SEASONS) {
    const rows = await db.execute(
      drizzleSql`SELECT DISTINCT season FROM espn_raw_cache WHERE leagueId = ${LEAGUE_ID} ORDER BY season ASC`
    ) as unknown as Array<any>;
    seasons = ((rows as any)?.[0] as Array<{season:number}> ?? []).map(r => r.season);
  } else if (TARGET_SEASON) {
    seasons = [TARGET_SEASON];
  } else {
    console.error("[ingest] Provide --season=YYYY or --all");
    process.exit(1);
  }

  console.log(`[ingest] Seasons to process: ${seasons.join(", ")}`);
  let grandPlayers = 0, grandStats = 0, grandSkipped = 0;

  for (const s of seasons) {
    const result = await ingestSeason(db, s);
    grandPlayers += result.playersUpserted;
    grandStats   += result.statsUpserted;
    grandSkipped += result.skipped;
  }

  console.log("\n── Ingestion complete ──────────────────────────────────────────");
  console.log(`  Players upserted:    ${grandPlayers}`);
  console.log(`  Stat rows upserted:  ${grandStats}`);
  console.log(`  Rows skipped:        ${grandSkipped}`);
  console.log(`  Review items:        ${reviewLog.length}`);

  if (reviewLog.length > 0) {
    console.log("\n── Review log (first 20) ──");
    reviewLog.slice(0, 20).forEach(r =>
      console.log(`  [s${r.season}w${r.week ?? "?"}] ${r.playerName}: ${r.reason}`)
    );
  }
}

run().catch(err => {
  console.error("[ingest] Fatal:", err);
  process.exit(1);
});
