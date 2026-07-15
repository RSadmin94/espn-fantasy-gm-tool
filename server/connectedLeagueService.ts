/**
 * Connected league management — groups season rows into account-level league slots.
 *
 * Disconnect removes the user's league_connections rows for a provider+leagueId group
 * and reconciles active league. Normalized gm_* data is intentionally retained so
 * other users stay connected and reconnect stays cheap; authorization uses league_connections.
 */
import { and, eq } from "drizzle-orm";
import { getDb, reconcileActiveLeague } from "./db";
import { leagueConnections, users } from "../drizzle/schema";
import {
  connectedLeagueKey,
  getConnectedLeagueUsage,
  isCountableConnectedLeague,
} from "./connectedLeagueLimits";
import {
  clearUserDisplayName,
  deleteUserDisplayNamesForLeague,
  listUserDisplayNamesForKeys,
  resolveConnectedLeagueLabel,
  setUserDisplayName,
} from "./connectedLeagueDisplayName";

export type ConnectedLeagueGroup = {
  key: string;
  provider: string;
  leagueId: string;
  /** Resolved label: user display → canonical → fallback */
  displayName: string;
  /** Provider-imported name from league_connections (unchanged by nickname) */
  canonicalName: string;
  /** User nickname when set */
  customDisplayName: string | null;
  seasonStart: number | null;
  seasonEnd: number | null;
  seasonCount: number;
  lastSyncedAt: Date | null;
  syncStatus: string | null;
  isSetupComplete: boolean;
  isActive: boolean;
  connectionIds: number[];
};

const PROVIDER_LABELS: Record<string, string> = {
  espn: "ESPN",
  sleeper: "Sleeper API",
  sleeper_workbook: "Sleeper Workbook",
  yahoo: "Yahoo",
};

export function providerDisplayLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export async function buildConnectedLeagueGroups(
  userId: number,
  activeConnectionId: number | null,
): Promise<ConnectedLeagueGroup[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: leagueConnections.id,
      provider: leagueConnections.provider,
      leagueId: leagueConnections.leagueId,
      leagueName: leagueConnections.leagueName,
      season: leagueConnections.season,
      selectedTeamId: leagueConnections.selectedTeamId,
      syncStatus: leagueConnections.syncStatus,
      lastSyncedAt: leagueConnections.lastSyncedAt,
      updatedAt: leagueConnections.updatedAt,
    })
    .from(leagueConnections)
    .where(eq(leagueConnections.userId, userId))
    .orderBy(leagueConnections.updatedAt);

  const grouped = new Map<
    string,
    ConnectedLeagueGroup & { canonicalCandidates: string[] }
  >();

  for (const row of rows) {
    if (!isCountableConnectedLeague(row.provider, row.leagueId)) continue;
    const key = connectedLeagueKey(row.provider, row.leagueId);
    let group = grouped.get(key);
    if (!group) {
      const canonical = row.leagueName?.trim() || "";
      group = {
        key,
        provider: row.provider,
        leagueId: row.leagueId,
        displayName: resolveConnectedLeagueLabel(null, canonical, row.leagueId),
        canonicalName: canonical || `League ${row.leagueId}`,
        customDisplayName: null,
        seasonStart: row.season,
        seasonEnd: row.season,
        seasonCount: 0,
        lastSyncedAt: row.lastSyncedAt,
        syncStatus: row.syncStatus,
        isSetupComplete: row.selectedTeamId != null,
        isActive: row.id === activeConnectionId,
        connectionIds: [],
        canonicalCandidates: canonical ? [canonical] : [],
      };
      grouped.set(key, group);
    }

    group.connectionIds.push(row.id);
    group.seasonCount += 1;
    if (group.seasonStart == null || row.season < group.seasonStart) group.seasonStart = row.season;
    if (group.seasonEnd == null || row.season > group.seasonEnd) group.seasonEnd = row.season;
    if (row.selectedTeamId != null) group.isSetupComplete = true;
    if (row.id === activeConnectionId) group.isActive = true;
    if (row.lastSyncedAt && (!group.lastSyncedAt || row.lastSyncedAt > group.lastSyncedAt)) {
      group.lastSyncedAt = row.lastSyncedAt;
      group.syncStatus = row.syncStatus;
    }
    const name = row.leagueName?.trim();
    if (name) group.canonicalCandidates.push(name);
  }

  const keys = [...grouped.keys()];
  const customNames = await listUserDisplayNamesForKeys(userId, keys);

  return [...grouped.values()]
    .map(({ canonicalCandidates, ...group }) => {
      const bestCanonical =
        canonicalCandidates.find((n) => n && !/^league\s+\d+$/i.test(n)) ??
        canonicalCandidates[canonicalCandidates.length - 1] ??
        "";
      const canonicalName = bestCanonical || `League ${group.leagueId}`;
      const custom = customNames.get(group.key) ?? null;
      return {
        ...group,
        canonicalName,
        customDisplayName: custom,
        displayName: resolveConnectedLeagueLabel(custom, canonicalName, group.leagueId),
      };
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (b.lastSyncedAt?.getTime() ?? 0) - (a.lastSyncedAt?.getTime() ?? 0);
    });
}

export async function disconnectConnectedLeague(
  userId: number,
  provider: string,
  leagueId: string,
): Promise<{ success: boolean; removedRows: number }> {
  const db = await getDb();
  if (!db) return { success: false, removedRows: 0 };

  const lid = leagueId.trim();
  const rows = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, userId),
        eq(leagueConnections.provider, provider),
        eq(leagueConnections.leagueId, lid),
      ),
    );

  if (rows.length === 0) return { success: true, removedRows: 0 };

  const removedIds = new Set(rows.map((r) => r.id));
  await db
    .delete(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, userId),
        eq(leagueConnections.provider, provider),
        eq(leagueConnections.leagueId, lid),
      ),
    );

  await deleteUserDisplayNamesForLeague(userId, provider, lid);

  const [userRow] = await db
    .select({ activeLeagueId: users.activeLeagueId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (userRow?.activeLeagueId && removedIds.has(userRow.activeLeagueId)) {
    const remaining = await db
      .select({ id: leagueConnections.id })
      .from(leagueConnections)
      .where(eq(leagueConnections.userId, userId))
      .limit(1);
    await db
      .update(users)
      .set({ activeLeagueId: remaining[0]?.id ?? 0 })
      .where(eq(users.id, userId));
  }

  await reconcileActiveLeague(userId);
  return { success: true, removedRows: rows.length };
}

export async function renameConnectedLeague(
  userId: number,
  provider: string,
  leagueId: string,
  displayName: string | null,
): Promise<{ success: boolean; cleared?: boolean }> {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) {
    await clearUserDisplayName(userId, provider, leagueId);
    return { success: true, cleared: true };
  }
  return setUserDisplayName(userId, provider, leagueId, trimmed);
}

export async function getConnectedLeagueManagementSummary(userId: number, activeConnectionId: number | null) {
  const [usage, leagues] = await Promise.all([
    getConnectedLeagueUsage(userId),
    buildConnectedLeagueGroups(userId, activeConnectionId),
  ]);
  return { usage, leagues };
}
