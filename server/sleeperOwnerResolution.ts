/**
 * Sleeper team-season owner resolution: verified / suggested / unresolved / manual.
 * Does not modify intelligence formulas — only classifies owners and applies overrides
 * before normalized persistence.
 */

import { and, eq } from "drizzle-orm";
import type { UniversalLeague, UniversalTeam } from "./providers/types";
import { getDb } from "./db";
import { gmTeamOwnerOverrides, gmTeamOwnerResolution, gmTeams } from "../drizzle/schema";
import { memberIdFromOwnerKey } from "./db";

export type OwnerResolutionStatus = "verified" | "suggested" | "unresolved" | "manual";

export type TeamOwnerResolution = {
  season: number;
  teamId: number;
  teamName: string;
  status: OwnerResolutionStatus;
  ownerKey: string | null;
  ownerName: string | null;
  suggestedOwnerKey: string | null;
  suggestedOwnerName: string | null;
  suggestionReason: string | null;
  sourceDetail: string;
};

export type OwnerResolutionSummary = {
  verified: number;
  suggested: number;
  unresolved: number;
  manual: number;
};

export type ManualOwnerOverride = {
  season: number;
  teamId: number;
  ownerKey: string;
  ownerName: string;
  updatedByUserId: number;
};

type SeasonTeamKey = `${number}:${number}`;

function seasonTeamKey(season: number, teamId: number): SeasonTeamKey {
  return `${season}:${teamId}`;
}

export function ownerKeyFromId(ownerId: string): string {
  return `id:${ownerId.trim()}`;
}

export function ownerKeyFromHistoricalName(ownerName: string): string {
  const normalized = ownerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `name:${normalized}`;
}

export function ownerIdFromOwnerKey(ownerKey: string): string | null {
  const id = memberIdFromOwnerKey(ownerKey);
  return id && ownerKey.startsWith("id:") ? id : null;
}

export function summarizeResolutions(rows: TeamOwnerResolution[]): OwnerResolutionSummary {
  const summary: OwnerResolutionSummary = {
    verified: 0,
    suggested: 0,
    unresolved: 0,
    manual: 0,
  };
  for (const row of rows) {
    summary[row.status]++;
  }
  return summary;
}

export function isSelectableOwnerStatus(status: OwnerResolutionStatus): boolean {
  return status === "verified" || status === "manual";
}

type IndexedOwner = {
  season: number;
  teamId: number;
  ownerId: string;
  ownerName: string;
  status: OwnerResolutionStatus;
};

export type SleeperOwnerResolutionContext = {
  leagueId: string;
  manualOverrides: Map<SeasonTeamKey, ManualOwnerOverride>;
  /** Populated as seasons import (newest first). */
  indexedOwners: Map<SeasonTeamKey, IndexedOwner>;
};

export async function loadManualOverrides(
  leagueId: string,
): Promise<Map<SeasonTeamKey, ManualOwnerOverride>> {
  const db = await getDb();
  const map = new Map<SeasonTeamKey, ManualOwnerOverride>();
  if (!db) return map;

  const rows = await db
    .select()
    .from(gmTeamOwnerOverrides)
    .where(eq(gmTeamOwnerOverrides.leagueId, leagueId));

  for (const row of rows) {
    map.set(seasonTeamKey(row.season, row.teamId), {
      season: row.season,
      teamId: row.teamId,
      ownerKey: row.ownerKey,
      ownerName: row.ownerName,
      updatedByUserId: row.updatedByUserId,
    });
  }
  return map;
}

export async function loadIndexedOwnersFromDb(
  leagueId: string,
): Promise<Map<SeasonTeamKey, IndexedOwner>> {
  const db = await getDb();
  const map = new Map<SeasonTeamKey, IndexedOwner>();
  if (!db) return map;

  const [teams, resolutions] = await Promise.all([
    db.select().from(gmTeams).where(eq(gmTeams.leagueId, leagueId)),
    db.select().from(gmTeamOwnerResolution).where(eq(gmTeamOwnerResolution.leagueId, leagueId)),
  ]);

  const statusByKey = new Map<SeasonTeamKey, OwnerResolutionStatus>();
  for (const r of resolutions) {
    statusByKey.set(
      seasonTeamKey(r.season, r.teamId),
      r.status as OwnerResolutionStatus,
    );
  }

  for (const t of teams) {
    const key = seasonTeamKey(t.season, t.teamId);
    const ownerId = (t.ownerId || "").trim();
    if (!ownerId) continue;
    map.set(key, {
      season: t.season,
      teamId: t.teamId,
      ownerId,
      ownerName: t.ownerName || "",
      status: statusByKey.get(key) ?? "verified",
    });
  }
  return map;
}

function findAdjacentAuthoritativeOwner(
  season: number,
  teamId: number,
  indexed: Map<SeasonTeamKey, IndexedOwner>,
): IndexedOwner | null {
  const candidates: IndexedOwner[] = [];
  for (const delta of [-1, 1]) {
    const neighbor = indexed.get(seasonTeamKey(season + delta, teamId));
    if (
      neighbor &&
      (neighbor.status === "verified" || neighbor.status === "manual") &&
      neighbor.ownerId
    ) {
      candidates.push(neighbor);
    }
  }
  if (candidates.length !== 1) return null;
  return candidates[0]!;
}

function findExactUserIdMatchInLineage(
  rawOwnerId: string,
  season: number,
  indexed: Map<SeasonTeamKey, IndexedOwner>,
): IndexedOwner | null {
  const id = rawOwnerId.trim();
  if (!id) return null;
  const matches: IndexedOwner[] = [];
  for (const row of indexed.values()) {
    if (row.season === season) continue;
    if (row.ownerId === id && (row.status === "verified" || row.status === "manual")) {
      matches.push(row);
    }
  }
  if (matches.length !== 1) return null;
  return matches[0]!;
}

export function resolveSleeperLeagueOwners(args: {
  league: UniversalLeague;
  connectionLeagueId: string;
  knownUserIds: Set<string>;
  context: SleeperOwnerResolutionContext;
}): { league: UniversalLeague; resolutions: TeamOwnerResolution[] } {
  const season = args.league.settings.season;
  const resolutions: TeamOwnerResolution[] = [];
  const teams: UniversalTeam[] = [];

  for (const team of args.league.teams) {
    const teamId = Number(team.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) {
      teams.push(team);
      continue;
    }

    const key = seasonTeamKey(season, teamId);
    const manual = args.context.manualOverrides.get(key);
    if (manual) {
      const ownerId = ownerIdFromOwnerKey(manual.ownerKey);
      const resolvedTeam: UniversalTeam = {
        ...team,
        ownerId: ownerId ?? undefined,
        ownerName: manual.ownerName || team.ownerName,
      };
      teams.push(resolvedTeam);
      const resolution: TeamOwnerResolution = {
        season,
        teamId,
        teamName: team.teamName,
        status: "manual",
        ownerKey: manual.ownerKey,
        ownerName: manual.ownerName,
        suggestedOwnerKey: null,
        suggestedOwnerName: null,
        suggestionReason: null,
        sourceDetail: "manual override",
      };
      resolutions.push(resolution);
      args.context.indexedOwners.set(key, {
        season,
        teamId,
        ownerId: ownerId ?? "",
        ownerName: manual.ownerName,
        status: "manual",
      });
      continue;
    }

    const rawOwnerId = (team.ownerId || "").trim();
    if (rawOwnerId && args.knownUserIds.has(rawOwnerId)) {
      const ownerKey = ownerKeyFromId(rawOwnerId);
      teams.push({ ...team, ownerId: rawOwnerId });
      resolutions.push({
        season,
        teamId,
        teamName: team.teamName,
        status: "verified",
        ownerKey,
        ownerName: team.ownerName,
        suggestedOwnerKey: null,
        suggestedOwnerName: null,
        suggestionReason: null,
        sourceDetail: "Sleeper roster.owner_id matched league user",
      });
      args.context.indexedOwners.set(key, {
        season,
        teamId,
        ownerId: rawOwnerId,
        ownerName: team.ownerName,
        status: "verified",
      });
      continue;
    }

    const lineageMatch = rawOwnerId
      ? findExactUserIdMatchInLineage(rawOwnerId, season, args.context.indexedOwners)
      : null;
    if (lineageMatch) {
      teams.push({ ...team, ownerId: undefined });
      resolutions.push({
        season,
        teamId,
        teamName: team.teamName,
        status: "suggested",
        ownerKey: null,
        ownerName: null,
        suggestedOwnerKey: ownerKeyFromId(lineageMatch.ownerId),
        suggestedOwnerName: lineageMatch.ownerName,
        suggestionReason: `Same Sleeper user_id verified in season ${lineageMatch.season}`,
        sourceDetail: "lineage user_id match",
      });
      continue;
    }

    const adjacent = findAdjacentAuthoritativeOwner(season, teamId, args.context.indexedOwners);
    if (adjacent) {
      teams.push({ ...team, ownerId: undefined });
      resolutions.push({
        season,
        teamId,
        teamName: team.teamName,
        status: "suggested",
        ownerKey: null,
        ownerName: null,
        suggestedOwnerKey: ownerKeyFromId(adjacent.ownerId),
        suggestedOwnerName: adjacent.ownerName,
        suggestionReason: `Same roster ID with verified owner in season ${adjacent.season}`,
        sourceDetail: "adjacent season roster continuity",
      });
      continue;
    }

    teams.push({ ...team, ownerId: undefined });
    resolutions.push({
      season,
      teamId,
      teamName: team.teamName,
      status: "unresolved",
      ownerKey: null,
      ownerName: null,
      suggestedOwnerKey: null,
      suggestedOwnerName: null,
      suggestionReason: null,
      sourceDetail: "insufficient evidence",
    });
  }

  return {
    league: { ...args.league, teams },
    resolutions,
  };
}

export async function persistOwnerResolutions(
  leagueId: string,
  resolutions: TeamOwnerResolution[],
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  const db = await getDb();
  if (!db || resolutions.length === 0) return;

  const now = new Date();
  for (const r of resolutions) {
    await db
      .insert(gmTeamOwnerResolution)
      .values({
        provider: "sleeper",
        leagueId,
        season: r.season,
        teamId: r.teamId,
        teamName: r.teamName,
        status: r.status,
        ownerKey: r.ownerKey,
        ownerName: r.ownerName,
        suggestedOwnerKey: r.suggestedOwnerKey,
        suggestedOwnerName: r.suggestedOwnerName,
        suggestionReason: r.suggestionReason,
        sourceDetail: r.sourceDetail,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          teamName: r.teamName,
          status: r.status,
          ownerKey: r.ownerKey,
          ownerName: r.ownerName,
          suggestedOwnerKey: r.suggestedOwnerKey,
          suggestedOwnerName: r.suggestedOwnerName,
          suggestionReason: r.suggestionReason,
          sourceDetail: r.sourceDetail,
          updatedAt: now,
        },
      });
  }
}

export async function saveManualOwnerOverride(args: {
  leagueId: string;
  season: number;
  teamId: number;
  ownerKey: string;
  ownerName: string;
  userId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const ownerKey = args.ownerKey.trim();
  const ownerName = args.ownerName.trim();
  if (!ownerKey) throw new Error("owner_key_required");
  if (!ownerName) throw new Error("owner_name_required");

  await db
    .insert(gmTeamOwnerOverrides)
    .values({
      provider: "sleeper",
      leagueId: args.leagueId,
      season: args.season,
      teamId: args.teamId,
      ownerKey,
      ownerName,
      updatedByUserId: args.userId,
    })
    .onDuplicateKeyUpdate({
      set: {
        ownerKey,
        ownerName,
        updatedByUserId: args.userId,
        updatedAt: new Date(),
      },
    });
}

export async function removeManualOwnerOverride(args: {
  leagueId: string;
  season: number;
  teamId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .delete(gmTeamOwnerOverrides)
    .where(
      and(
        eq(gmTeamOwnerOverrides.leagueId, args.leagueId),
        eq(gmTeamOwnerOverrides.season, args.season),
        eq(gmTeamOwnerOverrides.teamId, args.teamId),
      ),
    );
}

export async function listOwnerResolutions(leagueId: string): Promise<TeamOwnerResolution[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(gmTeamOwnerResolution)
    .where(eq(gmTeamOwnerResolution.leagueId, leagueId));

  return rows
    .map((r) => ({
      season: r.season,
      teamId: r.teamId,
      teamName: r.teamName,
      status: r.status as OwnerResolutionStatus,
      ownerKey: r.ownerKey,
      ownerName: r.ownerName,
      suggestedOwnerKey: r.suggestedOwnerKey,
      suggestedOwnerName: r.suggestedOwnerName,
      suggestionReason: r.suggestionReason,
      sourceDetail: r.sourceDetail,
    }))
    .sort((a, b) => b.season - a.season || a.teamId - b.teamId);
}

export async function listKnownLeagueOwners(leagueId: string): Promise<
  Array<{ ownerKey: string; ownerName: string; seasons: number[] }>
> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      season: gmTeamOwnerResolution.season,
      ownerKey: gmTeamOwnerResolution.ownerKey,
      ownerName: gmTeamOwnerResolution.ownerName,
      status: gmTeamOwnerResolution.status,
    })
    .from(gmTeamOwnerResolution)
    .where(eq(gmTeamOwnerResolution.leagueId, leagueId));

  const byKey = new Map<string, { ownerName: string; seasons: Set<number> }>();
  for (const row of rows) {
    if (!row.ownerKey || !isSelectableOwnerStatus(row.status as OwnerResolutionStatus)) continue;
    const existing = byKey.get(row.ownerKey) ?? { ownerName: row.ownerName || "", seasons: new Set() };
    existing.seasons.add(row.season);
    if (row.ownerName) existing.ownerName = row.ownerName;
    byKey.set(row.ownerKey, existing);
  }

  return [...byKey.entries()]
    .map(([ownerKey, v]) => ({
      ownerKey,
      ownerName: v.ownerName,
      seasons: [...v.seasons].sort((a, b) => b - a),
    }))
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

export async function reapplyOwnerResolutionForTeam(args: {
  leagueId: string;
  season: number;
  teamId: number;
  knownUserIds: Set<string>;
}): Promise<TeamOwnerResolution | null> {
  const db = await getDb();
  if (!db) return null;

  const [teamRow] = await db
    .select()
    .from(gmTeams)
    .where(
      and(
        eq(gmTeams.leagueId, args.leagueId),
        eq(gmTeams.season, args.season),
        eq(gmTeams.teamId, args.teamId),
      ),
    )
    .limit(1);
  if (!teamRow) return null;

  let rawTeam: UniversalTeam | null = null;
  try {
    rawTeam = JSON.parse(teamRow.rawTeam) as UniversalTeam;
  } catch {
    rawTeam = null;
  }

  const manualOverrides = await loadManualOverrides(args.leagueId);
  const indexedOwners = await loadIndexedOwnersFromDb(args.leagueId);
  indexedOwners.delete(seasonTeamKey(args.season, args.teamId));

  const league: UniversalLeague = {
    settings: {
      leagueId: args.leagueId,
      provider: "sleeper",
      season: args.season,
      leagueName: "",
      teamCount: 1,
      scoringType: "ppr",
      playoffTeamCount: 4,
      regularSeasonWeeks: 14,
      currentWeek: 1,
      isActive: false,
    },
    teams: [
      rawTeam ?? {
        teamId: String(args.teamId),
        ownerId: teamRow.ownerId || undefined,
        ownerName: teamRow.ownerName,
        ownerNames: [teamRow.ownerName],
        teamName: teamRow.name,
        abbreviation: teamRow.abbreviation,
        wins: teamRow.wins,
        losses: teamRow.losses,
        ties: teamRow.ties,
        pointsFor: teamRow.pointsFor,
        pointsAgainst: teamRow.pointsAgainst,
        winPct: 0,
        standingRank: teamRow.finalStanding ?? 0,
      },
    ],
    rosters: [],
    matchups: [],
    transactions: [],
    draftPicks: [],
  };

  const context: SleeperOwnerResolutionContext = {
    leagueId: args.leagueId,
    manualOverrides,
    indexedOwners,
  };

  const { league: resolved, resolutions } = resolveSleeperLeagueOwners({
    league,
    connectionLeagueId: args.leagueId,
    knownUserIds: args.knownUserIds,
    context,
  });

  const resolution = resolutions[0] ?? null;
  if (!resolution) return null;

  const resolvedTeam = resolved.teams[0]!;
  await db
    .update(gmTeams)
    .set({
      ownerId: String(resolvedTeam.ownerId ?? ""),
      ownerName: String(resolvedTeam.ownerName ?? ""),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gmTeams.leagueId, args.leagueId),
        eq(gmTeams.season, args.season),
        eq(gmTeams.teamId, args.teamId),
      ),
    );

  await persistOwnerResolutions(args.leagueId, [resolution], false);
  return resolution;
}
