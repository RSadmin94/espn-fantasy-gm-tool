/**
 * P2 Player Intelligence Pipeline — shared types and Zod schemas.
 *
 * Used by:
 *   - server/routers/playerStats.ts   (tRPC procedures)
 *   - scripts/ingestWeeklyStats.ts    (ingestion scaffold)
 *
 * Strict guardrails:
 *   - No fake data / mock stats.
 *   - All raw payloads validated with Zod before DB insertion.
 *   - Player identity confidence tiers enforced here, not in DB.
 */

import { z } from "zod";

// ── 1. Position constants ─────────────────────────────────────────────────────

export const VALID_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF", "DL", "LB", "DB"] as const;
export type PlayerPosition = typeof VALID_POSITIONS[number];

export function isValidPosition(p: string): p is PlayerPosition {
  return (VALID_POSITIONS as readonly string[]).includes(p);
}

// ── 2. Name normalizer (used for fuzzy matching) ──────────────────────────────

export function normalizePlayerName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip accents
    .replace(/[^a-z0-9 ]/g, " ")       // non-alphanum → space
    .replace(/\bjr\.?\b|\bsr\.?\b|\bii+\b/g, "") // strip Jr/Sr/II
    .replace(/\s+/g, " ")
    .trim();
}

// ── 3. Player identity confidence tiers ──────────────────────────────────────
// Enforced during ingestion — never stored as magic numbers in DB comments.

export const CONFIDENCE = {
  /** espnPlayerId matched exactly: always merge */
  ID_MATCH:     100,
  /** normalized name + position + season context match: auto-merge */
  AUTO_MERGE:   95,
  /** probable match: insert but flag for review */
  REVIEW_HIGH:  85,
  /** possible match: do not merge; log review item */
  REVIEW_LOW:   70,
  /** below threshold: create new record or skip */
  SKIP:         0,
} as const;

export type ConfidenceLevel = typeof CONFIDENCE[keyof typeof CONFIDENCE];

export function confidenceTier(score: number): "auto" | "review_high" | "review_low" | "skip" {
  if (score >= CONFIDENCE.AUTO_MERGE)  return "auto";
  if (score >= CONFIDENCE.REVIEW_HIGH) return "review_high";
  if (score >= CONFIDENCE.REVIEW_LOW)  return "review_low";
  return "skip";
}

// ── 4. Raw ESPN payload Zod schemas ──────────────────────────────────────────
// Matches the rosters/matchup ESPN API response shape stored in espn_raw_cache.
// All fields optional at the Zod level because ESPN payloads are inconsistent;
// ingestion code handles missing fields conservatively.

export const RawEspnPlayerSchema = z.object({
  id:            z.number().int().optional(),
  fullName:      z.string().optional(),
  firstName:     z.string().optional(),
  lastName:      z.string().optional(),
  proTeamId:     z.number().int().optional(),
  defaultPositionId: z.number().int().optional(),
  eligibleSlots: z.array(z.number()).optional(),
  onTeamId:      z.number().int().optional(),
  injuryStatus:  z.string().optional(),
  active:        z.boolean().optional(),
});

export const RawEspnRosterEntrySchema = z.object({
  playerId:         z.number().int(),
  playerPoolEntry:  z.object({
    id:             z.number().int().optional(),
    acquisitionType: z.string().optional(),
    lineupLocked:   z.boolean().optional(),
    playerPoolEntry: z.object({
      player: RawEspnPlayerSchema.optional(),
    }).optional(),
    appliedStatTotal: z.number().optional(),
    totalPoints:    z.number().optional(),
    scoringPeriodId: z.number().int().optional(),
    lineupSlotId:   z.number().int().optional(),
    slotCategoryId: z.number().int().optional(),
  }).optional(),
  lineupSlotId:     z.number().int().optional(),
  appliedStatTotal: z.number().optional(),
});

export const RawEspnMatchupTeamSchema = z.object({
  teamId:          z.number().int(),
  totalPoints:     z.number().optional(),
  totalProjectedPoints: z.number().optional(),
  rosterForCurrentScoringPeriod: z.object({
    entries: z.array(RawEspnRosterEntrySchema).optional(),
  }).optional(),
});

export const RawEspnMatchupSchema = z.object({
  id:              z.number().int().optional(),
  matchupPeriodId: z.number().int(),
  home:            RawEspnMatchupTeamSchema.optional(),
  away:            RawEspnMatchupTeamSchema.optional(),
  winner:          z.string().optional(),
  playoffTierType: z.string().optional(),
});

/** Top-level view shape returned by the scoreboard/roster ESPN cache views */
export const RawEspnCachePayloadSchema = z.object({
  schedule: z.array(RawEspnMatchupSchema).optional(),
  teams:    z.array(z.object({
    id:         z.number().int(),
    abbrev:     z.string().optional(),
    name:       z.string().optional(),
    owners:     z.array(z.string()).optional(),
    roster:     z.object({
      entries: z.array(RawEspnRosterEntrySchema).optional(),
    }).optional(),
  })).optional(),
  scoringPeriodId: z.number().int().optional(),
  seasonId:        z.number().int().optional(),
}).passthrough();

export type RawEspnCachePayload = z.infer<typeof RawEspnCachePayloadSchema>;

// ── 5. Normalized player insert schema ───────────────────────────────────────

export const NormalizedPlayerSchema = z.object({
  espnPlayerId:    z.string().max(50).nullable().optional(),
  sleeperPlayerId: z.string().max(50).nullable().optional(),
  fullName:        z.string().min(1).max(100),
  normalizedName:  z.string().min(1).max(100),
  position:        z.enum(VALID_POSITIONS),
  currentNflTeam:  z.string().max(3).nullable().optional(),
  firstSeasonSeen: z.number().int().min(2009).max(2030).nullable().optional(),
  lastSeasonSeen:  z.number().int().min(2009).max(2030).nullable().optional(),
  isActive:        z.boolean().default(true),
  needsReview:     z.boolean().default(false),
  reviewReason:    z.string().max(255).nullable().optional(),
});

export type NormalizedPlayer = z.infer<typeof NormalizedPlayerSchema>;

// ── 6. Weekly stat insert schema ──────────────────────────────────────────────

export const WeeklyStatInsertSchema = z.object({
  playerId:         z.number().int().positive(),   // FK to gm_player_registry.id
  season:           z.number().int().min(2009).max(2030),
  week:             z.number().int().min(1).max(22),
  pointsScored:     z.number().min(-999).max(999).transform(v => Number(v.toFixed(2))),
  rosterSlotId:     z.number().int().min(0),
  isStarter:        z.boolean(),
  ownerKey:         z.string().min(1).max(50),
  teamId:           z.number().int().positive().nullable().optional(),
  source:           z.string().max(50).default("espn"),
  sourceConfidence: z.number().min(0).max(100).default(100).transform(v => Number(v.toFixed(2))),
  needsReview:      z.boolean().default(false),
  reviewReason:     z.string().max(255).nullable().optional(),
});

export type WeeklyStatInsert = z.infer<typeof WeeklyStatInsertSchema>;

// ── 7. tRPC input/output schemas ─────────────────────────────────────────────

export const GetCanonicalPlayersInput = z.object({
  query:    z.string().min(1).max(120).optional(),
  position: z.enum(VALID_POSITIONS).optional(),
  isActive: z.boolean().optional(),
  page:     z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const GetCanonicalPlayersOutput = z.object({
  players: z.array(z.object({
    id:             z.number(),
    fullName:       z.string(),
    normalizedName: z.string(),
    position:       z.string(),
    currentNflTeam: z.string().nullable(),
    espnPlayerId:   z.string().nullable(),
    firstSeasonSeen: z.number().nullable(),
    lastSeasonSeen:  z.number().nullable(),
    isActive:        z.boolean(),
    needsReview:     z.boolean(),
  })),
  total:    z.number(),
  page:     z.number(),
  pageSize: z.number(),
});

export const GetWeeklyStatsByOwnerInput = z.object({
  ownerKey: z.string().min(1).max(50),
  season:   z.number().int().min(2009).max(2030),
  week:     z.number().int().min(1).max(22).optional(),
  limit:    z.number().int().min(1).max(200).default(50),
  offset:   z.number().int().min(0).default(0),
});

export const GetDraftPickPerformanceInput = z.object({
  leagueId: z.string().min(1).max(32).optional(),
  season:   z.number().int().min(2009).max(2030),
  ownerKey: z.string().min(1).max(50).optional(),
});

// ── 8. Roster slot helpers ────────────────────────────────────────────────────
// ESPN slot IDs that indicate a starting (active) position.
// Slot 20 = Bench (BE), Slot 21 = IR, anything else is typically a starting slot.

export const ESPN_BENCH_SLOT_ID = 20;
export const ESPN_IR_SLOT_ID    = 21;
export const ESPN_FLEX_SLOT_IDS = new Set([23]);  // Flex

export function isStartingSlot(lineupSlotId: number | undefined | null): boolean {
  if (lineupSlotId == null) return false;
  return lineupSlotId !== ESPN_BENCH_SLOT_ID && lineupSlotId !== ESPN_IR_SLOT_ID;
}

// Normalize ESPN slot → canonical rosterSlotId (0=Bench, 1=Starter, 2=IR)
export function canonicalSlotId(lineupSlotId: number | undefined | null): number {
  if (lineupSlotId == null) return 0;
  if (lineupSlotId === ESPN_IR_SLOT_ID)    return 2;
  if (lineupSlotId === ESPN_BENCH_SLOT_ID) return 0;
  return 1; // any other slot = active/starter
}
