/**
 * Tenant isolation — verify the authenticated user is linked to a league via league_connections.
 * Throws FORBIDDEN (never empty/teaser) when access is denied.
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";

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
