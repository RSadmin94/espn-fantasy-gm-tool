/**
 * User-controlled display names for connected leagues.
 * Canonical provider-imported names live on league_connections.leagueName.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { leagueConnectionDisplayNames } from "../drizzle/schema";
import { connectedLeagueKey } from "./connectedLeagueLimits";

export function resolveConnectedLeagueLabel(
  customDisplayName: string | null | undefined,
  canonicalName: string | null | undefined,
  leagueId: string,
): string {
  const custom = (customDisplayName ?? "").trim();
  if (custom) return custom;
  const canonical = (canonicalName ?? "").trim();
  if (canonical) return canonical;
  return `League ${leagueId}`;
}

export async function getUserDisplayName(
  userId: number,
  provider: string,
  leagueId: string,
): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({ displayName: leagueConnectionDisplayNames.displayName })
    .from(leagueConnectionDisplayNames)
    .where(
      and(
        eq(leagueConnectionDisplayNames.userId, userId),
        eq(leagueConnectionDisplayNames.provider, provider),
        eq(leagueConnectionDisplayNames.leagueId, leagueId.trim()),
      ),
    )
    .limit(1);
  const name = row?.displayName?.trim();
  return name || null;
}

export async function listUserDisplayNamesForKeys(
  userId: number,
  keys: string[],
): Promise<Map<string, string>> {
  const db = await getDb();
  const map = new Map<string, string>();
  if (!db || keys.length === 0) return map;

  const rows = await db
    .select({
      provider: leagueConnectionDisplayNames.provider,
      leagueId: leagueConnectionDisplayNames.leagueId,
      displayName: leagueConnectionDisplayNames.displayName,
    })
    .from(leagueConnectionDisplayNames)
    .where(eq(leagueConnectionDisplayNames.userId, userId));

  const keySet = new Set(keys);
  for (const row of rows) {
    const key = connectedLeagueKey(row.provider, row.leagueId);
    if (!keySet.has(key)) continue;
    const name = row.displayName?.trim();
    if (name) map.set(key, name);
  }
  return map;
}

export async function setUserDisplayName(
  userId: number,
  provider: string,
  leagueId: string,
  displayName: string,
): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };
  const name = displayName.trim().slice(0, 256);
  if (!name) return { success: false };

  const lid = leagueId.trim();
  await db
    .insert(leagueConnectionDisplayNames)
    .values({ userId, provider, leagueId: lid, displayName: name })
    .onDuplicateKeyUpdate({
      set: { displayName: name, updatedAt: new Date() },
    });
  return { success: true };
}

export async function clearUserDisplayName(
  userId: number,
  provider: string,
  leagueId: string,
): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };
  await db
    .delete(leagueConnectionDisplayNames)
    .where(
      and(
        eq(leagueConnectionDisplayNames.userId, userId),
        eq(leagueConnectionDisplayNames.provider, provider),
        eq(leagueConnectionDisplayNames.leagueId, leagueId.trim()),
      ),
    );
  return { success: true };
}

export async function deleteUserDisplayNamesForLeague(
  userId: number,
  provider: string,
  leagueId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(leagueConnectionDisplayNames)
    .where(
      and(
        eq(leagueConnectionDisplayNames.userId, userId),
        eq(leagueConnectionDisplayNames.provider, provider),
        eq(leagueConnectionDisplayNames.leagueId, leagueId.trim()),
      ),
    );
}
