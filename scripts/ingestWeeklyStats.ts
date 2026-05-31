/**
 * P2 Player Intelligence Pipeline — Ingestion scaffold.
 * scripts/ingestWeeklyStats.ts
 *
 * Reads raw ESPN payloads from espn_raw_cache, validates with Zod,
 * normalizes player identity, resolves ownerKey, and batch-upserts into:
 *   gm_player_registry
 *   gm_weekly_player_stats
 *
 * Accuracy guardrails (enforced throughout):
 *   - Never invent stats. Only insert 0.00 if ESPN payload confirms a player
 *     was rostered and scored nothing. Otherwise skip.
 *   - Below 85% confidence: log a review item, do not merge.
 *   - Legacy seasons 2010–2017 treated as lower confidence (90 max).
 *   - Batch upserts use INSERT ... ON DUPLICATE KEY UPDATE.
 *
 * Usage:
 *   npx tsx scripts/ingestWeeklyStats.ts --season=2024 [--week=1] [--dry-run]
 *
 * Environment:
 *   DATABASE_URL  TiDB/MySQL connection string
 *   LEAGUE_ID     ESPN league ID (default: 457622)
 */

import { sql as drizzleSql, eq as eqD, and as andD } from "drizzle-orm";
import {
  gmPlayerRegistry,
  gmWeeklyPlayerStats,
  ownerAliases,
  espnRawCache,
  gmTeams,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  RawEspnCachePayloadSchema,
  NormalizedPlayerSchema,
  WeeklyStatInsertSchema,
  normalizePlayerName,
  isValidPosition,
  isStartingSlot,
  canonicalSlotId,
  CONFIDENCE,
  confidenceTier,
  type NormalizedPlayer,
  type WeeklyStatInsert,
} from "../server/playerStatsTypes";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? true];
    })
);

const TARGET_SEASON = args.season ? Number(args.season) : new Date().getFullYear() - 1;
const TARGET_WEEK   = args.week   ? Number(args.week)   : undefined;
const DRY_RUN       = Boolean(args["dry-run"]);
const LEAGUE_ID     = (args.league as string) ?? process.env.LEAGUE_ID ?? "457622";

// ── Position ID map (ESPN default position IDs → canonical) ──────────────────
const ESPN_POS_MAP: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE",
  5: "K",  7: "DL", 8: "LB", 9: "DB",
  16: "DEF",
};

function espnPosToCanonical(defaultPositionId?: number): string {
  if (defaultPositionId == null) return "";
  return ESPN_POS_MAP[defaultPositionId] ?? "";
}

// ── Review log ────────────────────────────────────────────────────────────────
type ReviewItem = {
  season:     number;
  week?:      number;
  playerName: string;
  espnId?:    number;
  reason:     string;
  confidence: number;
};
const reviewLog: ReviewItem[] = [];

function logReview(item: ReviewItem) {
  reviewLog.push(item);
  console.warn(`[REVIEW] s${item.season}w${item.week ?? "?"} ${item.playerName}: ${item.reason} (conf=${item.confidence})`);
}

// ── ownerKey resolver ─────────────────────────────────────────────────────────
// Priority: owner_aliases table → gmTeams by teamId + season → raw string

async function buildOwnerKeyMap(
  db: Awaited<ReturnType<typeof getDb>>,
  leagueId: string,
  season: number,
): Promise<Map<number, string>> {
  if (!db) return new Map();
  const teamRows = await db
    .select({ teamId: gmTeams.teamId, ownerName: gmTeams.ownerName, ownerId: gmTeams.ownerId })
    .from(gmTeams)
    .where(andD(eqD(gmTeams.leagueId, leagueId), eqD(gmTeams.season, season)));

  const aliases = await db
    .select({ legacyTeamName: ownerAliases.legacyTeamName, resolvedOwnerName: ownerAliases.resolvedOwnerName })
    .from(ownerAliases)
    .where(andD(eqD(ownerAliases.leagueId, leagueId), eqD(ownerAliases.status, "approved")));

  const aliasMap = new Map<string, string>(
    aliases
      .filter(a => a.resolvedOwnerName)
      .map(a => [a.legacyTeamName.toLowerCase(), a.resolvedOwnerName!])
  );

  const m = new Map<number, string>();
  for (const t of teamRows) {
    const ownerName = t.ownerName?.trim() || "";
    const normalized = ownerName.toLowerCase();
    const resolved = aliasMap.get(normalized) ?? ownerName;
    const key = t.ownerId?.trim()
      ? t.ownerId.trim()
      : `name:${normalized.replace(/\s+/g, "-")}`;
    if (t.teamId && key) m.set(t.teamId, key);
  }
  return m;
}

// ── Player registry upsert ─────────────────────────────────────────────────────
// Returns registry row id. Returns null if confidence is below AUTO_MERGE threshold.

async function upsertPlayer(
  db: Awaited<ReturnType<typeof getDb>>,
  data: NormalizedPlayer,
  season: number,
  espnIdNum?: number,
): Promise<number | null> {
  if (!db) return null;

  // 1. Try exact ESPN ID lookup
  if (data.espnPlayerId) {
    const [existing] = await db
      .select({ id: gmPlayerRegistry.id })
      .from(gmPlayerRegistry)
      .where(eqD(gmPlayerRegistry.espnPlayerId, data.espnPlayerId))
      .limit(1);
    if (existing) {
      if (!DRY_RUN) {
        await db.update(gmPlayerRegistry)
          .set({
            currentNflTeam:  data.currentNflTeam ?? undefined,
            lastSeasonSeen:  Math.max(season, data.lastSeasonSeen ?? season),
            isActive:        data.isActive,
            updatedAt:       new Date(),
          })
          .where(eqD(gmPlayerRegistry.id, existing.id));
      }
      return existing.id;
    }
  }

  // 2. Try normalized name + position lookup
  const [byName] = data.position
    ? await db
        .select({ id: gmPlayerRegistry.id, needsReview: gmPlayerRegistry.needsReview })
        .from(gmPlayerRegistry)
        .where(andD(
          eqD(gmPlayerRegistry.normalizedName, data.normalizedName),
          eqD(gmPlayerRegistry.position,       data.position),
        ))
        .limit(1)
    : [];

  // Confidence heuristic: exact name+position in a recent season = high confidence
  const isLegacy   = season <= 2017;
  const confidence = data.espnPlayerId ? CONFIDENCE.ID_MATCH
    : byName ? (isLegacy ? 90 : CONFIDENCE.AUTO_MERGE)
    : CONFIDENCE.REVIEW_LOW;

  const tier = confidenceTier(confidence);

  if (byName) {
    if (tier === "auto" || tier === "review_high") {
      const needsReview = tier === "review_high";
      if (!DRY_RUN) {
        await db.update(gmPlayerRegistry)
          .set({
            currentNflTeam: data.currentNflTeam ?? undefined,
            lastSeasonSeen: Math.max(season, data.lastSeasonSeen ?? season),
            espnPlayerId:   data.espnPlayerId ?? undefined,
            needsReview:    needsReview || Boolean(byName.needsReview),
            reviewReason:   needsReview ? `Matched by name+pos (conf=${confidence}) — verify identity` : undefined,
            updatedAt:      new Date(),
          })
          .where(eqD(gmPlayerRegistry.id, byName.id));
      }
      if (needsReview) {
        logReview({
          season, playerName: data.fullName, espnId: espnIdNum,
          reason: "name+pos match at confidence 85–94, flagged for review",
          confidence,
        });
      }
      return byName.id;
    }
    // tier = review_low | skip — don't merge
    logReview({
      season, playerName: data.fullName, espnId: espnIdNum,
      reason: `Low confidence match (${confidence}) — did not merge`,
      confidence,
    });
    return null;
  }

  // 3. Insert new player
  const validated = NormalizedPlayerSchema.safeParse(data);
  if (!validated.success) {
    logReview({
      season, playerName: data.fullName, espnId: espnIdNum,
      reason: `Zod validation failed: ${validated.error.issues.map(i => i.message).join("; ")}`,
      confidence: 0,
    });
    return null;
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would insert player: ${data.fullName} (${data.position})`);
    return null;
  }

  const inserted = await db.insert(gmPlayerRegistry).values({
    espnPlayerId:    data.espnPlayerId ?? null,
    sleeperPlayerId: data.sleeperPlayerId ?? null,
    fullName:        data.fullName,
    normalizedName:  data.normalizedName,
    position:        data.position,
    currentNflTeam:  data.currentNflTeam ?? null,
    firstSeasonSeen: season,
    lastSeasonSeen:  season,
    isActive:        data.isActive,
    needsReview:     data.needsReview,
    reviewReason:    data.reviewReason ?? null,
  }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  // Retrieve the newly inserted ID
  const [newRow] = await db
    .select({ id: gmPlayerRegistry.id })
    .from(gmPlayerRegistry)
    .where(eqD(gmPlayerRegistry.normalizedName, data.normalizedName))
    .limit(1);

  return newRow?.id ?? null;
}

// ── Main ingestion loop ────────────────────────────────────────────────────────

async function run() {
  const db = await getDb();
  if (!db) {
    console.error("Cannot connect to database. Check DATABASE_URL.");
    process.exit(1);
  }

  console.log(`[ingest] Season=${TARGET_SEASON} Week=${TARGET_WEEK ?? "all"} DryRun=${DRY_RUN} League=${LEAGUE_ID}`);

  // Build ownerKey map for this season
  const ownerKeyMap = await buildOwnerKeyMap(db, LEAGUE_ID, TARGET_SEASON);
  console.log(`[ingest] ownerKeyMap: ${ownerKeyMap.size} teams`);

  // Fetch raw cache rows (scoreboard view contains lineup + points)
  const cacheQuery = db
    .select({
      season:   espnRawCache.season,
      viewName: espnRawCache.viewName,
      payload:  espnRawCache.payload,
    })
    .from(espnRawCache)
    .where(andD(
      eqD(espnRawCache.leagueId, LEAGUE_ID),
      eqD(espnRawCache.season,   TARGET_SEASON),
    ))
    .limit(100);

  const cacheRows = await cacheQuery;
  console.log(`[ingest] Found ${cacheRows.length} raw cache rows for season ${TARGET_SEASON}`);

  let insertedPlayers = 0;
  let insertedStats   = 0;
  let skipped         = 0;

  for (const row of cacheRows) {
    // Only process scoring/lineup views (not settings/history views)
    if (!row.viewName.includes("mScoringPeriod") && !row.viewName.includes("mMatchup") && !row.viewName.includes("mRoster")) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload);
    } catch {
      console.warn(`[ingest] JSON parse failed for ${row.viewName} s${row.season}`);
      continue;
    }

    const result = RawEspnCachePayloadSchema.safeParse(parsed);
    if (!result.success) {
      console.warn(`[ingest] Zod validation failed for ${row.viewName}: ${result.error.issues[0]?.message}`);
      skipped++;
      continue;
    }

    const payload = result.data;
    const week    = payload.scoringPeriodId ?? TARGET_WEEK;

    // Skip if we're filtering to a specific week and this doesn't match
    if (TARGET_WEEK !== undefined && week !== TARGET_WEEK) continue;

    // Process each team's roster
    const teams = payload.teams ?? [];
    for (const team of teams) {
      const teamId   = team.id;
      const ownerKey = ownerKeyMap.get(teamId) ?? `team:${teamId}`;
      const entries  = team.roster?.entries ?? [];

      // Determine confidence for legacy seasons
      const isLegacy        = TARGET_SEASON <= 2017;
      const sourceConfidence = isLegacy ? 90 : 100;

      for (const entry of entries) {
        const lineupSlotId = entry.lineupSlotId;
        const ppts         = entry.appliedStatTotal
          ?? entry.playerPoolEntry?.appliedStatTotal
          ?? entry.playerPoolEntry?.totalPoints;

        // ESPN confirms the player was rostered if entry exists
        // but we only insert 0.00 if we have confirmed scoring data
        if (ppts === undefined || ppts === null) {
          // We cannot prove the score — skip, do not invent
          skipped++;
          continue;
        }

        const playerEntry = entry.playerPoolEntry;
        const player = playerEntry?.playerPoolEntry?.player ?? playerEntry as any;
        const espnId = player?.id ?? entry.playerId;
        const rawName = player?.fullName
          ?? [player?.firstName, player?.lastName].filter(Boolean).join(" ")
          ?? "";

        if (!rawName || !espnId) { skipped++; continue; }

        const rawPos = player?.defaultPositionId;
        const position = espnPosToCanonical(rawPos);
        if (!isValidPosition(position)) { skipped++; continue; }

        const normalizedName = normalizePlayerName(rawName);
        const espnPlayerIdStr = String(espnId);

        // Upsert into player registry
        const playerId = await upsertPlayer(
          db,
          {
            espnPlayerId:    espnPlayerIdStr,
            fullName:        rawName,
            normalizedName,
            position,
            currentNflTeam:  player?.proTeamId ? String(player.proTeamId) : null,
            firstSeasonSeen: TARGET_SEASON,
            lastSeasonSeen:  TARGET_SEASON,
            isActive:        true,
            needsReview:     false,
          },
          TARGET_SEASON,
          espnId,
        );

        if (!playerId) { skipped++; continue; }
        insertedPlayers++;

        // Build weekly stat row
        const statInsert: WeeklyStatInsert = {
          playerId,
          season:           TARGET_SEASON,
          week:             week ?? 0,
          pointsScored:     Number(ppts),
          rosterSlotId:     canonicalSlotId(lineupSlotId),
          isStarter:        isStartingSlot(lineupSlotId),
          ownerKey,
          teamId:           teamId ?? null,
          source:           "espn",
          sourceConfidence,
          needsReview:      isLegacy,
          reviewReason:     isLegacy ? "Legacy season — verify via roster reconstruction" : null,
        };

        const validated = WeeklyStatInsertSchema.safeParse(statInsert);
        if (!validated.success) {
          logReview({
            season: TARGET_SEASON, week: week ?? 0, playerName: rawName, espnId,
            reason: `WeeklyStatInsertSchema failed: ${validated.error.issues.map(i => i.message).join("; ")}`,
            confidence: 0,
          });
          skipped++;
          continue;
        }

        if (!DRY_RUN) {
          try {
            await db.insert(gmWeeklyPlayerStats).values({
              playerId:         validated.data.playerId,
              season:           validated.data.season,
              week:             validated.data.week,
              pointsScored:     validated.data.pointsScored,
              rosterSlotId:     validated.data.rosterSlotId,
              isStarter:        validated.data.isStarter,
              ownerKey:         validated.data.ownerKey,
              teamId:           validated.data.teamId ?? null,
              source:           validated.data.source,
              sourceConfidence: validated.data.sourceConfidence,
              needsReview:      validated.data.needsReview,
              reviewReason:     validated.data.reviewReason ?? null,
            }).onDuplicateKeyUpdate({
              set: {
                pointsScored:     validated.data.pointsScored,
                isStarter:        validated.data.isStarter,
                rosterSlotId:     validated.data.rosterSlotId,
                sourceConfidence: validated.data.sourceConfidence,
                updatedAt:        new Date(),
              },
            });
            insertedStats++;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logReview({
              season: TARGET_SEASON, week: week ?? 0, playerName: rawName,
              reason: `DB upsert failed: ${msg}`, confidence: 0,
            });
          }
        } else {
          console.log(`[DRY RUN] Would upsert stat: ${rawName} s${TARGET_SEASON}w${week} ownerKey=${ownerKey} pts=${ppts}`);
          insertedStats++;
        }
      }
    }
  }

  // Summary
  console.log("\n── Ingestion complete ──────────────────────────────────────────");
  console.log(`  Players upserted:     ${insertedPlayers}`);
  console.log(`  Stat rows upserted:   ${insertedStats}`);
  console.log(`  Rows skipped:         ${skipped}`);
  console.log(`  Review items logged:  ${reviewLog.length}`);

  if (reviewLog.length > 0) {
    console.log("\n── Review log (first 20) ───────────────────────────────────────");
    reviewLog.slice(0, 20).forEach(r =>
      console.log(`  [${r.season}w${r.week ?? "?"}] ${r.playerName}: ${r.reason}`)
    );
    if (reviewLog.length > 20) {
      console.log(`  ... and ${reviewLog.length - 20} more (set needsReview=true in DB)`);
    }
  }

  process.exit(0);
}

run().catch(err => {
  console.error("[ingest] Fatal error:", err);
  process.exit(1);
});
