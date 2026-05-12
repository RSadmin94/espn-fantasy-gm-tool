/**
 * leagueIdentityService.ts
 *
 * Single source of truth for static ESPN league data.
 *
 * Data model:
 *   STATIC (stored in `league_identity` DB table, refreshed once per season):
 *     - teams          — [{teamId, name, abbrev, owners}]
 *     - members        — [{id, firstName, lastName, displayName}]
 *     - draftOrder     — [{position, teamId, teamName, ownerName}]
 *     - draftDate      — unix seconds
 *     - keeperDeadline — unix seconds
 *     - draftType      — "SNAKE" | "AUCTION" | etc.
 *     - keeperCount    — number
 *     - teamCount      — number
 *     - playoffTeamCount
 *     - scoringType    — "PPR" | "HALF_PPR" | "STANDARD"
 *
 *   DYNAMIC (computed on demand, short memCache TTL):
 *     - Current rosters, matchups, waiver wire — NOT stored here
 *
 * Usage:
 *   // Read (returns DB row or null if not yet populated)
 *   const identity = await getLeagueIdentity(2026);
 *
 *   // Write (called by Data Center refresh pipeline)
 *   await upsertLeagueIdentity(2026, espnMergedData);
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { leagueIdentity } from "../drizzle/schema";
import { normalizeDraftOrder, normalizeTeams } from "./espnService";
import { fetchEspnViews } from "./espnService";
import { memCache } from "./memCache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamIdentity {
  teamId: number;
  name: string;
  abbrev: string;
  owners: string; // semicolon-separated owner display names
}

export interface MemberIdentity {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface DraftSlot {
  position: number;   // 1-based draft slot
  teamId: number;
  teamName: string;
  ownerName: string;
}

export interface LeagueIdentityData {
  season: number;
  teams: TeamIdentity[];
  members: MemberIdentity[];
  draftOrder: DraftSlot[];
  draftDate: number | null;        // unix seconds
  keeperDeadline: number | null;   // unix seconds
  draftType: string | null;
  keeperCount: number | null;
  teamCount: number | null;
  playoffTeamCount: number | null;
  scoringType: string | null;
  fetchedAt: Date;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Read league identity for a given season from the DB.
 * Returns null if not yet populated (run Data Center refresh first).
 */
export async function getLeagueIdentity(season: number): Promise<LeagueIdentityData | null> {
  return memCache(`leagueIdentity:${season}`, 10 * 60_000, async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select().from(leagueIdentity)
      .where(eq(leagueIdentity.season, season))
      .limit(1);
    if (!rows.length) return null;
    const row = rows[0];
    return {
      season: row.season,
      teams: (row.teams as TeamIdentity[]) ?? [],
      members: (row.members as MemberIdentity[]) ?? [],
      draftOrder: (row.draftOrder as DraftSlot[]) ?? [],
      draftDate: row.draftDate ?? null,
      keeperDeadline: row.keeperDeadline ?? null,
      draftType: row.draftType ?? null,
      keeperCount: row.keeperCount ?? null,
      teamCount: row.teamCount ?? null,
      playoffTeamCount: row.playoffTeamCount ?? null,
      scoringType: row.scoringType ?? null,
      fetchedAt: row.fetchedAt,
    };
  });
}

/**
 * Persist league identity data for a season.
 * Extracts all static fields from the raw ESPN merged payload.
 * Called by the Data Center refresh pipeline after a successful fetch.
 */
export async function upsertLeagueIdentity(
  season: number,
  espnData: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Extract team identities
  const rawTeams = normalizeTeams(espnData);
  const teams: TeamIdentity[] = rawTeams.map(t => ({
    teamId: t.teamId as number,
    name: (t.teamName as string) || `Team ${t.teamId}`,
    abbrev: (t.abbrev as string) || "",
    owners: (t.owners as string) || "",
  }));

  // Extract member identities
  const rawMembers = (espnData.members as Record<string, unknown>[]) || [];
  const members: MemberIdentity[] = rawMembers.map(m => ({
    id: (m.id as string) || "",
    firstName: (m.firstName as string) || "",
    lastName: (m.lastName as string) || "",
    displayName: `${m.firstName || ""} ${m.lastName || ""}`.trim() || (m.id as string) || "",
  }));

  // Extract draft order
  const rawOrder = normalizeDraftOrder(espnData);
  const draftOrder: DraftSlot[] = (rawOrder?.pickOrder || []).map(p => ({
    position: p.position,
    teamId: p.teamId,
    teamName: p.name ?? `Team ${p.teamId}`,
    ownerName: p.owners ?? "",
  }));

  // Extract scalar settings
  const settings = (espnData.settings as Record<string, unknown>) || {};
  const draftSettings = (settings.draftSettings as Record<string, unknown>) || {};
  const scoringSettings = (settings.scoringSettings as Record<string, unknown>) || {};
  const scheduleSettings = (settings.scheduleSettings as Record<string, unknown>) || {};

  const draftDate = (draftSettings.date as number) || null;
  const keeperDeadline = (draftSettings.keeperDeadlineDate as number) || null;
  const draftType = (draftSettings.orderType as string) || null;
  const keeperCount = (draftSettings.keeperCount as number) ?? null;
  const teamCount = (espnData.teams as unknown[])?.length ?? teams.length ?? null;
  const playoffTeamCount = (scheduleSettings.playoffTeamCount as number) ?? null;

  // Detect scoring type from scoring items
  const scoringItems = (scoringSettings.scoringItems as Array<Record<string, unknown>>) || [];
  let scoringType: string | null = null;
  const pprItem = scoringItems.find(i => i.statId === 53); // statId 53 = reception
  if (pprItem) {
    const pts = pprItem.points as number;
    if (pts >= 1) scoringType = "PPR";
    else if (pts >= 0.5) scoringType = "HALF_PPR";
    else scoringType = "STANDARD";
  }

  // Upsert
  await db.insert(leagueIdentity)
    .values({
      season,
      teams: teams as unknown as Record<string, unknown>,
      members: members as unknown as Record<string, unknown>,
      draftOrder: draftOrder as unknown as Record<string, unknown>,
      draftDate,
      keeperDeadline,
      draftType,
      keeperCount,
      teamCount,
      playoffTeamCount,
      scoringType,
    })
    .onDuplicateKeyUpdate({
      set: {
        teams: teams as unknown as Record<string, unknown>,
        members: members as unknown as Record<string, unknown>,
        draftOrder: draftOrder as unknown as Record<string, unknown>,
        draftDate,
        keeperDeadline,
        draftType,
        keeperCount,
        teamCount,
        playoffTeamCount,
        scoringType,
        updatedAt: new Date(),
      },
    });

  // Bust the memCache so next read gets fresh data
  memCache.invalidate(`leagueIdentity:${season}`);
}

/**
 * Fetch live ESPN data for a season and persist it as league identity.
 * This is the "refresh" path — called by Data Center or on first access.
 */
export async function refreshLeagueIdentity(season: number): Promise<LeagueIdentityData | null> {
  try {
    // Only need mSettings + mTeam for identity data — fast fetch
    const data = await fetchEspnViews(season, ["mSettings", "mTeam"]);
    await upsertLeagueIdentity(season, data);
    return getLeagueIdentity(season);
  } catch (err) {
    console.error(`[LeagueIdentity] Failed to refresh season ${season}:`, err);
    return null;
  }
}

/**
 * Get league identity, auto-refreshing from ESPN if not yet in DB.
 * This is the primary consumer API — use this everywhere instead of
 * calling normalizeDraftOrder(data2025) directly.
 */
export async function getOrFetchLeagueIdentity(season: number): Promise<LeagueIdentityData | null> {
  const cached = await getLeagueIdentity(season);
  if (cached) return cached;
  // Not in DB yet — fetch live from ESPN
  return refreshLeagueIdentity(season);
}
