/**
 * Phase 5 — real ESPN K / IDP (DP) + skill depth for full-board simulation.
 * Same feeds as Draft War Room: getEspnPlayerInfoMap + getEspnDefensiveInfoMap.
 */

import { sql } from "drizzle-orm";
import type { AppDb } from "../../db";
import { getEspnDefensiveInfoMap, getEspnPlayerInfoMap, type EspnPlayerInfo } from "../../playerStatsRouter";
import { normalizePlayerKey, normalizePosition } from "../phase1/types";
import type { TerrainDraftPickRow } from "../phase2/types";
import type { RosterPosition } from "./leagueRosterRules";
import { boardValueOf, type SimPlayer } from "./weather";

const IDP_POSITIONS = new Set(["DL", "LB", "DB", "S", "CB", "DE", "DT", "DP"]);
const MIN_DP_POOL = 80;

export type EspnSimPoolStats = {
  skillFromTerrain: number;
  skillFromEspn: number;
  kickers: number;
  defenders: number;
  defendersFromEspn: number;
  defendersFromFallback: number;
  total: number;
};

export function registryPositionToSim(pos: string): RosterPosition | null {
  const p = String(pos ?? "").trim().toUpperCase();
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE" || p === "K") return p;
  if (IDP_POSITIONS.has(p)) return "DP";
  return null;
}

/** Map ESPN ADP to terrain-compatible value score (higher = better). */
export function adpToValueScore(adp: number | null, projection: number | null): number {
  if (projection != null && projection > 0) {
    return Math.max(5, Math.min(100, Math.round(projection * 2.2)));
  }
  if (adp != null && adp > 0 && adp < 500) {
    return Math.max(5, Math.min(100, Math.round(100 - adp * 0.42)));
  }
  return 20;
}

export function adpToTier(adp: number | null): string {
  if (adp == null || adp <= 0) return "T5";
  if (adp <= 36) return "T1";
  if (adp <= 72) return "T2";
  if (adp <= 120) return "T3";
  if (adp <= 180) return "T4";
  return "T5";
}

function simPlayerFromRegistry(args: {
  fullName: string;
  simPos: RosterPosition;
  espnId?: string;
  info: EspnPlayerInfo;
}): SimPlayer {
  const key = normalizePlayerKey(args.fullName);
  return {
    playerName: args.fullName,
    position: args.simPos === "DP" ? "DP" : args.simPos,
    playerKey: key,
    valueScore: adpToValueScore(args.info.adp, args.info.projection),
    tier: adpToTier(args.info.adp),
    adp: args.info.adp,
    espnPlayerId: args.espnId,
  };
}

export function draftRowIsIdp(position: string): boolean {
  const raw = String(position ?? "").trim().toUpperCase();
  return IDP_POSITIONS.has(raw);
}

export function addIdpFromDraftHistory(
  byKey: Map<string, SimPlayer>,
  draftPicks: TerrainDraftPickRow[],
): number {
  let added = 0;
  const sorted = [...draftPicks].sort((a, b) => a.overallPick - b.overallPick);
  for (const row of sorted) {
    if (!draftRowIsIdp(row.position)) continue;
    const name = row.playerName.trim();
    if (!name) continue;
    const key = normalizePlayerKey(name);
    if (byKey.has(key)) continue;
    const adp = row.overallPick;
    byKey.set(key, {
      playerName: name,
      position: "DP",
      playerKey: key,
      valueScore: adpToValueScore(adp, null),
      tier: adpToTier(adp),
      adp,
    });
    added += 1;
  }
  return added;
}

function addIdpFromRegistryNoEspn(
  byKey: Map<string, SimPlayer>,
  regRows: Array<{ fullName: string; position: string }>,
): number {
  let added = 0;
  for (const reg of regRows) {
    if (!IDP_POSITIONS.has(String(reg.position).toUpperCase())) continue;
    const key = normalizePlayerKey(reg.fullName);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      playerName: reg.fullName,
      position: "DP",
      playerKey: key,
      valueScore: 28,
      tier: "T5",
      adp: null,
    });
    added += 1;
    if (added + [...byKey.values()].filter((p) => p.position === "DP").length >= MIN_DP_POOL) break;
  }
  return added;
}

export async function resolveSimEspnUserId(db: AppDb, leagueId: string): Promise<number | undefined> {
  try {
    const [rows] = (await db.execute(sql`
      SELECT userId FROM league_connections
      WHERE leagueId = ${leagueId} AND provider = 'espn' AND isActive = 1
      ORDER BY updatedAt DESC LIMIT 1
    `)) as unknown as [Array<{ userId: number }>];
    const id = rows[0]?.userId;
    return id != null && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function loadEspnSimPlayerPool(args: {
  db: AppDb;
  leagueId: string;
  skillPlayers: SimPlayer[];
  userId?: number;
  draftPickFallback?: TerrainDraftPickRow[];
  /** Include skill players from ESPN with ADP below this (default 280). */
  maxSkillAdp?: number;
}): Promise<{
  pool: SimPlayer[];
  poolHas: Partial<Record<RosterPosition, boolean>>;
  stats: EspnSimPoolStats;
}> {
  const maxSkillAdp = args.maxSkillAdp ?? 280;
  const byKey = new Map<string, SimPlayer>();
  let skillFromTerrain = 0;
  for (const p of args.skillPlayers) {
    byKey.set(normalizePlayerKey(p.playerKey), { ...p });
    skillFromTerrain += 1;
  }

  const [regRows] = (await args.db.execute(sql`
    SELECT fullName, position, espnPlayerId
    FROM gm_player_registry
    WHERE espnPlayerId IS NOT NULL
      AND position IN ('QB','RB','WR','TE','K','DL','LB','DB')
    ORDER BY lastSeasonSeen DESC, id ASC
    LIMIT 2500
  `)) as unknown as [Array<{ fullName: string; position: string; espnPlayerId: string | number }>];

  const userId = args.userId ?? (await resolveSimEspnUserId(args.db, args.leagueId));
  const espnInfo = await getEspnPlayerInfoMap();
  const espnDefInfo = await getEspnDefensiveInfoMap(args.leagueId, userId);
  const infoFor = (espnId: string): EspnPlayerInfo | undefined =>
    espnInfo.get(espnId) ?? espnDefInfo.get(espnId);

  let skillFromEspn = 0;
  let kickers = 0;
  let defenders = 0;
  let defendersFromEspn = 0;

  for (const reg of regRows) {
    const espnId = String(reg.espnPlayerId ?? "").trim();
    if (!espnId) continue;
    const simPos = registryPositionToSim(reg.position);
    if (!simPos) continue;
    const info = infoFor(espnId);
    if (!info) continue;

    const key = normalizePlayerKey(reg.fullName);
    const existing = byKey.get(key);

    if (simPos === "K" || simPos === "DP") {
      const player = simPlayerFromRegistry({ fullName: reg.fullName, simPos, espnId, info });
      if (byKey.has(key)) continue;
      byKey.set(key, player);
      if (simPos === "K") kickers += 1;
      else {
        defenders += 1;
        defendersFromEspn += 1;
      }
      continue;
    }

    if (existing) {
      // Terrain players keep their position-normalized valueScore (soul-model input, untouched),
      // but adopt the real cross-position ESPN ADP so the board can rank by true draftability.
      if (info.adp != null && info.adp > 0) {
        existing.adp = info.adp;
        existing.tier = adpToTier(info.adp);
        if (!existing.espnPlayerId) existing.espnPlayerId = espnId;
      }
      continue;
    }
    if (info.adp == null || info.adp > maxSkillAdp) continue;
    const skillPos = normalizePosition(simPos);
    if (!["QB", "RB", "WR", "TE"].includes(skillPos)) continue;
    byKey.set(key, simPlayerFromRegistry({ fullName: reg.fullName, simPos, espnId, info }));
    skillFromEspn += 1;
  }

  let defendersFromFallback = 0;
  if (defenders < MIN_DP_POOL && args.draftPickFallback?.length) {
    defendersFromFallback += addIdpFromDraftHistory(byKey, args.draftPickFallback);
    defenders = [...byKey.values()].filter((p) => p.position === "DP").length;
  }
  if (defenders < MIN_DP_POOL) {
    defendersFromFallback += addIdpFromRegistryNoEspn(byKey, regRows);
    defenders = [...byKey.values()].filter((p) => p.position === "DP").length;
  }

  const pool = [...byKey.values()].sort((a, b) => boardValueOf(b) - boardValueOf(a));
  const poolHas: Partial<Record<RosterPosition, boolean>> = {
    QB: pool.some((p) => normalizePosition(p.position) === "QB"),
    RB: pool.some((p) => normalizePosition(p.position) === "RB"),
    WR: pool.some((p) => normalizePosition(p.position) === "WR"),
    TE: pool.some((p) => normalizePosition(p.position) === "TE"),
    K: kickers > 0,
    DP: defenders > 0,
    DST: false,
  };

  return {
    pool,
    poolHas,
    stats: {
      skillFromTerrain,
      skillFromEspn,
      kickers,
      defenders,
      defendersFromEspn,
      defendersFromFallback,
      total: pool.length,
    },
  };
}
