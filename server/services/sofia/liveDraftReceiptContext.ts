/**
 * Live-draft receipt context — real ESPN ADP board, not the shadow cert fixture.
 *
 * The production notify path previously reused makeShadowReceiptContext(), which only
 * knew Routine POS N names + a handful of story beats. Real War Room picks therefore
 * resolved adp=null, classified as routine, and were silenced by the written floor.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { getEspnPlayerInfoMap } from "../../playerStatsRouter";
import {
  normName,
  type ReceiptContext,
  type RegistryEntry,
} from "../draftMoments/draftMomentReceiptService";

const BOARD_TTL_MS = 4 * 60 * 60 * 1000;

export type LiveEspnAdpBoard = {
  loadedAt: number;
  adpByName: Map<string, number>;
  adpByEspnId: Map<string, number>;
  registry: RegistryEntry[];
  nflTeamByName: Map<string, string>;
};

let boardCache: LiveEspnAdpBoard | null = null;

export function resetLiveDraftReceiptContextForTests(): void {
  boardCache = null;
}

/** Test-only — inject a board without hitting ESPN/DB. */
export function setLiveEspnAdpBoardForTests(board: LiveEspnAdpBoard | null): void {
  boardCache = board;
}

/** Live context with no shadow Alice rivalry / filler ADP names. */
export function makeEmptyLiveReceiptContext(leagueId: string, teamCount: number): ReceiptContext {
  return {
    leagueId,
    adpByName: new Map(),
    registry: [],
    historyByKey: new Map(),
    seasonsByKey: new Map(),
    rivalById: new Map(),
    focalMemberId: "",
    dpWindow: { startPick: 100, endPick: 180 },
    teamCount,
    starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DP: 1 },
  };
}

/** Draft-moment identity key used by live pick resolver (`PID_OWNER_NAME`). */
export function liveDraftOwnerKey(ownerName: string): string {
  return `PID_${ownerName.trim().toUpperCase().replace(/\s+/g, "_")}`;
}

export type LiveRivalryOverlay = {
  focalOwnerName: string;
  rivals: Array<{ ownerName: string; heat: string }>;
};

/**
 * Attach rivalry onto a live receipt context using the same PID_* keys the live
 * pick resolver uses. Does not invent rivals — callers must supply real pairs.
 */
export function applyLiveRivalryOverlay(
  ctx: ReceiptContext,
  rivalry: LiveRivalryOverlay | null | undefined,
): ReceiptContext {
  if (!rivalry?.focalOwnerName?.trim()) return ctx;
  const rivalById = new Map(ctx.rivalById);
  for (const r of rivalry.rivals) {
    const name = String(r.ownerName ?? "").trim();
    if (!name) continue;
    rivalById.set(liveDraftOwnerKey(name), {
      rivalName: name,
      heat: String(r.heat ?? "Heated"),
    });
  }
  return {
    ...ctx,
    focalMemberId: liveDraftOwnerKey(rivalry.focalOwnerName),
    rivalById,
  };
}

export function espnIdFromLockedPlayerId(playerId: string | null | undefined): string | null {
  const s = String(playerId ?? "").trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith("espn:")) {
    const id = s.slice(5).trim();
    return id || null;
  }
  if (/^\d+$/.test(s)) return s;
  return null;
}

export async function ensureLiveEspnAdpBoard(): Promise<LiveEspnAdpBoard> {
  if (boardCache && Date.now() - boardCache.loadedAt < BOARD_TTL_MS) {
    return boardCache;
  }

  const adpByName = new Map<string, number>();
  const adpByEspnId = new Map<string, number>();
  const registry: RegistryEntry[] = [];
  const nflTeamByName = new Map<string, string>();

  try {
    const [espnInfo, db] = await Promise.all([getEspnPlayerInfoMap(), getDb()]);
    for (const [espnId, info] of espnInfo) {
      if (info?.adp != null && Number.isFinite(Number(info.adp))) {
        adpByEspnId.set(String(espnId), Number(info.adp));
      }
    }

    if (db) {
      const [reg] = (await db.execute(sql`
        SELECT espnPlayerId, fullName, position, currentNflTeam
        FROM gm_player_registry
        WHERE fullName IS NOT NULL AND fullName <> ''
      `)) as any;
      for (const r of reg ?? []) {
        const espnId = String(r.espnPlayerId ?? "").trim();
        const n = normName(String(r.fullName));
        const pos = String(r.position ?? "?").toUpperCase();
        const adp = espnId && adpByEspnId.get(espnId) != null ? adpByEspnId.get(espnId)! : null;
        if (adp != null && Number.isFinite(adp)) {
          adpByName.set(n, adp);
        }
        registry.push({ norm: n, position: pos, adp });
        const nfl = String(r.currentNflTeam ?? "").trim().toUpperCase();
        if (nfl) nflTeamByName.set(n, nfl);
      }
    }
  } catch (err) {
    console.warn("[rfsn-live] ESPN ADP board load failed:", err instanceof Error ? err.message : err);
  }

  boardCache = {
    loadedAt: Date.now(),
    adpByName,
    adpByEspnId,
    registry,
    nflTeamByName,
  };
  return boardCache;
}

export function buildLiveReceiptContext(args: {
  leagueId: string;
  teamCount: number;
  board: LiveEspnAdpBoard;
  /** Client-supplied ADP overlays (War Room pool already has ESPN ADP). */
  overlays?: Array<{ playerName: string; position: string; adp?: number | null; playerId?: string }>;
  /** Real rivalry overlay keyed for live PID_* owner identities. */
  rivalry?: LiveRivalryOverlay | null;
}): ReceiptContext {
  const ctx = makeEmptyLiveReceiptContext(args.leagueId, args.teamCount);
  for (const [k, v] of args.board.adpByName) ctx.adpByName.set(k, v);
  ctx.registry = args.board.registry.map((r) => ({ ...r }));

  for (const o of args.overlays ?? []) {
    const n = normName(o.playerName);
    let adp = o.adp != null && Number.isFinite(Number(o.adp)) ? Number(o.adp) : null;
    if (adp == null) {
      const espnId = espnIdFromLockedPlayerId(o.playerId);
      if (espnId != null) adp = args.board.adpByEspnId.get(espnId) ?? null;
    }
    if (adp == null) continue;
    ctx.adpByName.set(n, adp);
    const entry: RegistryEntry = {
      norm: n,
      position: String(o.position ?? "?").toUpperCase(),
      adp,
    };
    const idx = ctx.registry.findIndex((r) => r.norm === n);
    if (idx >= 0) ctx.registry[idx] = entry;
    else ctx.registry.push(entry);
  }

  return applyLiveRivalryOverlay(ctx, args.rivalry);
}

/**
 * Load rivalry pairs for the signed-in user and map them onto live draft owner keys.
 * Returns null when rivalry data is unavailable — never fabricates pairs.
 */
export async function loadLiveRivalryOverlay(args: {
  userId?: number | null;
  leagueId: string;
  /** Optional draft owner names used for loose name matching. */
  ownerNames?: string[];
}): Promise<LiveRivalryOverlay | null> {
  if (args.userId == null) return null;
  try {
    const { computeRivalryScores } = await import("../../rivalryService");
    const pairs = await computeRivalryScores(args.userId, args.leagueId);
    if (!pairs.length) return null;
    const focalOwnerName = String(pairs[0]?.ownerName ?? "").trim();
    if (!focalOwnerName) return null;

    const draftNames = (args.ownerNames ?? []).map((n) => n.trim()).filter(Boolean);
    const rivals: Array<{ ownerName: string; heat: string }> = [];
    for (const p of pairs) {
      const rivalName = String(p.rivalName ?? "").trim();
      if (!rivalName) continue;
      const matched =
        draftNames.find((n) => normName(n) === normName(rivalName)) ??
        draftNames.find(
          (n) =>
            normName(n).includes(normName(rivalName)) ||
            normName(rivalName).includes(normName(n)),
        ) ??
        rivalName;
      rivals.push({ ownerName: matched, heat: String(p.heatLabel ?? "Heated") });
    }
    if (!rivals.length) return null;
    return { focalOwnerName, rivals };
  } catch (err) {
    console.warn(
      "[rfsn-live] rivalry overlay load failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
