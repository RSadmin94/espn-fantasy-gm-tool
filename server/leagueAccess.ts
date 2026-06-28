/**
 * Tenant isolation — verify the authenticated user is linked to a league via league_connections.
 * Throws FORBIDDEN (never empty/teaser) when access is denied.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { gmTeams, leagueConnections } from "../drizzle/schema";
import { personMergeKey } from "./ownerProfileService";

function normalizeLeagueId(leagueId: string): string {
  return String(leagueId).trim().slice(0, 32);
}

/** True when the user has any league_connections row for this ESPN league id. */
export async function userHasLeagueAccess(userId: number, leagueId: string): Promise<boolean> {
  const lid = normalizeLeagueId(leagueId);
  if (!lid || !Number.isFinite(userId) || userId <= 0) return false;

  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }

  const rows = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, userId), eq(leagueConnections.leagueId, lid)))
    .limit(1);

  return rows.length > 0;
}

/** Refuse with FORBIDDEN when the user is not connected to the league. */
export async function assertUserLeagueAccess(userId: number, leagueId: string): Promise<void> {
  const allowed = await userHasLeagueAccess(userId, leagueId);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this league.",
    });
  }
}

function normalizeOwnerGuid(raw: string): string {
  return raw.replace(/[{}-]/g, "").toUpperCase();
}

function rowsOf(res: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(res)) return (Array.isArray(res[0]) ? res[0] : res) as Array<Record<string, unknown>>;
  if (res && typeof res === "object" && Array.isArray((res as { rows?: unknown[] }).rows)) {
    return (res as { rows: Array<Record<string, unknown>> }).rows;
  }
  return [];
}

/**
 * Resolve distinct league ids where this ownerKey appears in `teams`.
 * Supports `id:{GUID}` / bare GUID (teams.ownerId) and `name:{personMergeKey}`.
 */
export async function resolveLeagueIdsForOwnerKey(ownerKey: string): Promise<string[]> {
  const key = ownerKey.trim();
  if (!key) return [];

  const db = await getDb();
  if (!db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  }

  if (key.startsWith("id:") || (!key.startsWith("name:") && key.includes("{"))) {
    const guid = normalizeOwnerGuid(key.startsWith("id:") ? key.slice(3) : key);
    if (!guid) return [];
    const res = await db.execute(sql`
      SELECT DISTINCT leagueId AS leagueId
      FROM teams
      WHERE UPPER(REPLACE(REPLACE(REPLACE(ownerId, '{', ''), '}', ''), '-', '')) = ${guid}
    `);
    return rowsOf(res)
      .map((r) => String(r.leagueId ?? "").trim())
      .filter(Boolean);
  }

  if (key.startsWith("name:")) {
    const pk = key.slice(5);
    if (!pk) return [];
    const rows = await db
      .selectDistinct({ leagueId: gmTeams.leagueId, ownerName: gmTeams.ownerName })
      .from(gmTeams);
    const out = new Set<string>();
    for (const row of rows) {
      if (personMergeKey(row.ownerName) === pk) out.add(String(row.leagueId));
    }
    return [...out];
  }

  return [];
}

/**
 * Leagues the user may read for this ownerKey. FORBIDDEN when the owner exists
 * but none of their leagues are connected; NOT_FOUND when unknown owner.
 */
export async function resolveAccessibleLeagueIdsForOwnerKey(
  userId: number,
  ownerKey: string,
): Promise<string[]> {
  const leagueIds = await resolveLeagueIdsForOwnerKey(ownerKey);
  if (leagueIds.length === 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Owner not found in any league.",
    });
  }

  const allowed: string[] = [];
  for (const lid of leagueIds) {
    if (await userHasLeagueAccess(userId, lid)) allowed.push(lid);
  }
  if (allowed.length === 0) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this league.",
    });
  }
  return allowed;
}
