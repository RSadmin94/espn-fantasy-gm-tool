/**
 * Account-level connected league limits.
 * A "connected league" is a distinct provider + leagueId (seasons do not count separately).
 */
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";

export const MAX_CONNECTED_LEAGUES = 5;

export const CONNECTED_LEAGUE_LIMIT_MESSAGE =
  "You've reached the maximum of 5 connected leagues. Disconnect one of your existing leagues before connecting another.";

export const CROSS_PROVIDER_LEAGUE_ID_MESSAGE =
  "A league with this league ID is already connected from another fantasy provider. Cross-provider duplicate league IDs are not supported yet. Disconnect the existing league before connecting the new provider.";

const IGNORED_LEAGUE_IDS = new Set(["", "default", "__pending__"]);

export function connectedLeagueKey(provider: string, leagueId: string): string {
  return `${provider}:${leagueId.trim()}`;
}

export function isCountableConnectedLeague(provider: string, leagueId: string): boolean {
  const lid = String(leagueId ?? "").trim();
  return Boolean(lid) && !IGNORED_LEAGUE_IDS.has(lid);
}

/** Distinct provider+leagueId keys for a user (historical seasons collapse to one slot). */
export async function listConnectedLeagueKeys(userId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({
      provider: leagueConnections.provider,
      leagueId: leagueConnections.leagueId,
    })
    .from(leagueConnections)
    .where(eq(leagueConnections.userId, userId));

  const keys = new Set<string>();
  for (const row of rows) {
    if (!isCountableConnectedLeague(row.provider, row.leagueId)) continue;
    keys.add(connectedLeagueKey(row.provider, row.leagueId));
  }
  return keys;
}

/**
 * True when the user already has a countable connection for this raw leagueId
 * under a different provider. Same-provider reconnects are not conflicts.
 */
export function hasCrossProviderLeagueIdConflict(
  existingConnections: ReadonlyArray<{ provider: string; leagueId: string }>,
  provider: string,
  leagueId: string,
): boolean {
  const lid = String(leagueId ?? "").trim();
  if (!isCountableConnectedLeague(provider, lid)) return false;

  for (const row of existingConnections) {
    if (!isCountableConnectedLeague(row.provider, row.leagueId)) continue;
    if (row.leagueId.trim() !== lid) continue;
    if (row.provider === provider) continue;
    return true;
  }
  return false;
}

/** Distinct providers already connected for this user + raw leagueId. */
export async function listProvidersForConnectedLeagueId(
  userId: number,
  leagueId: string,
): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const lid = String(leagueId ?? "").trim();
  const rows = await db
    .select({ provider: leagueConnections.provider, leagueId: leagueConnections.leagueId })
    .from(leagueConnections)
    .where(and(eq(leagueConnections.userId, userId), eq(leagueConnections.leagueId, lid)));

  const providers = new Set<string>();
  for (const row of rows) {
    if (!isCountableConnectedLeague(row.provider, row.leagueId)) continue;
    providers.add(row.provider);
  }
  return [...providers];
}

/**
 * Block connecting the same raw leagueId from a second provider.
 * Normalized data is keyed by leagueId only; cross-provider duplicates are unsafe until
 * provider-qualified normalized IDs exist.
 */
export async function assertNoCrossProviderLeagueIdConflict(
  userId: number,
  provider: string,
  leagueId: string,
): Promise<void> {
  const lid = String(leagueId ?? "").trim();
  if (!isCountableConnectedLeague(provider, lid)) return;

  const providers = await listProvidersForConnectedLeagueId(userId, lid);
  if (providers.length === 0) return;
  if (providers.includes(provider)) return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: CROSS_PROVIDER_LEAGUE_ID_MESSAGE,
  });
}

export async function getConnectedLeagueUsage(userId: number): Promise<{
  max: number;
  used: number;
  atLimit: boolean;
  remaining: number;
}> {
  const used = (await listConnectedLeagueKeys(userId)).size;
  const max = MAX_CONNECTED_LEAGUES;
  return {
    max,
    used,
    atLimit: used >= max,
    remaining: Math.max(0, max - used),
  };
}

/**
 * Block a net-new connected league before any provider API call or persistence.
 * Reconnecting an existing provider+leagueId is always allowed.
 */
export async function assertCanConnectLeague(
  userId: number,
  provider: string,
  leagueId: string,
): Promise<void> {
  const lid = String(leagueId ?? "").trim();
  if (!isCountableConnectedLeague(provider, lid)) return;

  const keys = await listConnectedLeagueKeys(userId);
  const key = connectedLeagueKey(provider, lid);
  if (keys.has(key)) return;

  await assertNoCrossProviderLeagueIdConflict(userId, provider, lid);

  if (keys.size >= MAX_CONNECTED_LEAGUES) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: CONNECTED_LEAGUE_LIMIT_MESSAGE,
    });
  }
}
