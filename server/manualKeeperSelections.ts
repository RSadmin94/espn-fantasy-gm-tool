import { getDb } from "./db";
import { gmManualKeeperSelections } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export type ManualKeeperSelection = {
  ownerKey: string;
  playerId: number;
  playerName: string;
  position: string;
};

/**
 * True when a DB error indicates the manual-keeper table has not been provisioned
 * yet. The feature must degrade safely in that case (return empty / no-op) rather
 * than 500, matching the project's optional-table convention (ARCHITECTURE.md §10).
 */
function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; message?: string };
  if (e?.code === "ER_NO_SUCH_TABLE" || e?.errno === 1146) return true;
  const msg = String(e?.message ?? err ?? "");
  return /ER_NO_SUCH_TABLE|doesn't exist|no such table|Unknown table|\b1146\b/i.test(msg);
}

/** All manual selections for a (user, league, season). Empty if the table is missing. */
export async function getManualKeeperSelections(args: {
  userId: number;
  leagueId: string;
  season: number;
}): Promise<ManualKeeperSelection[]> {
  const { userId, leagueId, season } = args;
  if (!userId || !leagueId) return [];
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db
      .select({
        ownerKey: gmManualKeeperSelections.ownerKey,
        playerId: gmManualKeeperSelections.playerId,
        playerName: gmManualKeeperSelections.playerName,
        position: gmManualKeeperSelections.position,
      })
      .from(gmManualKeeperSelections)
      .where(
        and(
          eq(gmManualKeeperSelections.userId, userId),
          eq(gmManualKeeperSelections.leagueId, leagueId),
          eq(gmManualKeeperSelections.season, season),
        ),
      );
    return rows.map((r) => ({
      ownerKey: r.ownerKey,
      playerId: Number(r.playerId),
      playerName: r.playerName ?? "",
      position: r.position ?? "",
    }));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

/**
 * Set of manually-selected playerIds for a (user, league, season). The Draft War
 * Room uses this to override predicted keepers, matched by playerId. Empty if the
 * table is missing — which is exactly the "fall back to predicted" behavior.
 */
export async function loadManualKeeperPlayerIds(
  userId: number | undefined,
  leagueId: string,
  season: number,
): Promise<Set<number>> {
  if (!userId || !leagueId) return new Set<number>();
  const sels = await getManualKeeperSelections({ userId, leagueId, season });
  return new Set<number>(sels.map((s) => s.playerId));
}

export type SetManualResult =
  | { ok: true; selected: boolean; count: number; limit: number | null }
  | { ok: false; error: "no_db" | "limit_reached" | "table_missing"; count?: number; limit?: number | null };

/**
 * Insert or remove a single manual keeper selection. On insert, enforces the
 * per-owner keeper limit (keeperLimit). Idempotent: re-selecting an existing pick
 * is a no-op success; deselecting a missing pick is a no-op success.
 */
export async function setManualKeeperSelection(args: {
  userId: number;
  leagueId: string;
  season: number;
  ownerKey: string;
  playerId: number;
  playerName: string;
  position: string;
  keep: boolean;
  keeperLimit: number | null;
}): Promise<SetManualResult> {
  const { userId, leagueId, season, ownerKey, playerId, playerName, position, keep, keeperLimit } = args;
  const db = await getDb();
  if (!db) return { ok: false, error: "no_db" };

  const whereOwner = and(
    eq(gmManualKeeperSelections.userId, userId),
    eq(gmManualKeeperSelections.leagueId, leagueId),
    eq(gmManualKeeperSelections.season, season),
    eq(gmManualKeeperSelections.ownerKey, ownerKey),
  );

  try {
    const existing = await db
      .select({ playerId: gmManualKeeperSelections.playerId })
      .from(gmManualKeeperSelections)
      .where(whereOwner);
    const has = existing.some((e) => Number(e.playerId) === playerId);

    if (!keep) {
      if (has) {
        await db
          .delete(gmManualKeeperSelections)
          .where(and(whereOwner, eq(gmManualKeeperSelections.playerId, playerId)));
      }
      return { ok: true, selected: false, count: Math.max(0, existing.length - (has ? 1 : 0)), limit: keeperLimit };
    }

    // keep = true
    if (has) return { ok: true, selected: true, count: existing.length, limit: keeperLimit };
    if (keeperLimit != null && keeperLimit > 0 && existing.length >= keeperLimit) {
      if (keeperLimit === 1) {
        // Single-keeper league: a new pick REPLACES this team's current keeper (one-click swap),
        // so the user can freely set/change each team's one keeper for draft predictions.
        await db.delete(gmManualKeeperSelections).where(whereOwner);
      } else {
        return { ok: false, error: "limit_reached", count: existing.length, limit: keeperLimit };
      }
    }
    await db.insert(gmManualKeeperSelections).values({
      userId,
      leagueId,
      season,
      ownerKey,
      playerId,
      playerName: playerName ?? "",
      position: position ?? "",
    } as typeof gmManualKeeperSelections.$inferInsert);
    return { ok: true, selected: true, count: keeperLimit === 1 ? 1 : existing.length + 1, limit: keeperLimit };
  } catch (err) {
    if (isMissingTableError(err)) return { ok: false, error: "table_missing" };
    throw err;
  }
}
