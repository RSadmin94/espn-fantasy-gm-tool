/**
 * ESPN team selection for connected users (mirrors Sleeper select flow without receipt gate).
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, reconcileActiveLeague, setActiveLeagueForUser } from "./db";
import { gmTeams, leagueConnections } from "../drizzle/schema";

export type EspnTeamOption = {
  teamId: number;
  teamName: string;
  ownerName: string;
  ownerKey: string;
};

export type EspnTeamSelectionContext =
  | {
      ok: true;
      leagueId: string;
      season: number;
      teams: EspnTeamOption[];
      selectedTeamId: number | null;
      selectedOwnerKey: string | null;
      selectedOwnerName: string | null;
      selectedFranchiseName: string | null;
      isSetupComplete: boolean;
    }
  | { ok: false; error: string };

export type SelectEspnTeamResult =
  | { success: true; leagueConnectionId: number; isSetupComplete: true }
  | { success: false; error: string };

async function userHasEspnConnection(userId: number, leagueId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: leagueConnections.id })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, userId),
        eq(leagueConnections.provider, "espn"),
        eq(leagueConnections.leagueId, leagueId.trim()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function getEspnTeamSelectionContext(
  userId: number,
  leagueId: string,
): Promise<EspnTeamSelectionContext> {
  const db = await getDb();
  if (!db) return { ok: false, error: "no_db" };

  const lid = leagueId.trim();
  if (!(await userHasEspnConnection(userId, lid))) {
    return { ok: false, error: "connection_not_found" };
  }

  const seasonRows = await db
    .select({ season: gmTeams.season })
    .from(gmTeams)
    .where(eq(gmTeams.leagueId, lid))
    .orderBy(desc(gmTeams.season))
    .limit(1);
  const season = seasonRows[0]?.season;
  if (season == null) {
    return { ok: false, error: "no_teams_synced" };
  }

  const teamRows = await db
    .select({
      teamId: gmTeams.teamId,
      name: gmTeams.name,
      ownerName: gmTeams.ownerName,
      ownerId: gmTeams.ownerId,
    })
    .from(gmTeams)
    .where(and(eq(gmTeams.leagueId, lid), eq(gmTeams.season, season)));

  const teams: EspnTeamOption[] = teamRows
    .filter((t) => t.ownerId)
    .map((t) => ({
      teamId: t.teamId,
      teamName: t.name || `Team ${t.teamId}`,
      ownerName: t.ownerName || "Unknown",
      ownerKey: `id:${t.ownerId}`,
    }));

  const [conn] = await db
    .select({
      selectedTeamId: leagueConnections.selectedTeamId,
      selectedOwnerKey: leagueConnections.selectedOwnerKey,
      selectedOwnerName: leagueConnections.selectedOwnerName,
      selectedFranchiseName: leagueConnections.selectedFranchiseName,
    })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, userId),
        eq(leagueConnections.provider, "espn"),
        eq(leagueConnections.leagueId, lid),
      ),
    )
    .orderBy(desc(leagueConnections.season))
    .limit(1);

  return {
    ok: true,
    leagueId: lid,
    season,
    teams,
    selectedTeamId: conn?.selectedTeamId ?? null,
    selectedOwnerKey: conn?.selectedOwnerKey ?? null,
    selectedOwnerName: conn?.selectedOwnerName ?? null,
    selectedFranchiseName: conn?.selectedFranchiseName ?? null,
    isSetupComplete: conn?.selectedTeamId != null,
  };
}

export async function runSelectEspnTeam(args: {
  userId: number;
  leagueId: string;
  teamId: number;
  season?: number;
}): Promise<SelectEspnTeamResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "no_db" };

  const lid = args.leagueId.trim();
  if (!(await userHasEspnConnection(args.userId, lid))) {
    return { success: false, error: "connection_not_found" };
  }

  let season = args.season;
  if (season == null) {
    const seasonRows = await db
      .select({ season: gmTeams.season })
      .from(gmTeams)
      .where(eq(gmTeams.leagueId, lid))
      .orderBy(desc(gmTeams.season))
      .limit(1);
    season = seasonRows[0]?.season;
  }
  if (season == null) return { success: false, error: "no_teams_synced" };

  const [team] = await db
    .select({
      teamId: gmTeams.teamId,
      name: gmTeams.name,
      ownerName: gmTeams.ownerName,
      ownerId: gmTeams.ownerId,
    })
    .from(gmTeams)
    .where(
      and(
        eq(gmTeams.leagueId, lid),
        eq(gmTeams.season, season),
        eq(gmTeams.teamId, args.teamId),
      ),
    )
    .limit(1);

  if (!team) return { success: false, error: "team_not_found" };
  if (!team.ownerId) return { success: false, error: "owner_unresolved" };

  const ownerKey = `id:${team.ownerId}`;
  const ownerName = team.ownerName || "Unknown";
  const franchiseName = team.name || null;

  const connections = await db
    .select({ id: leagueConnections.id, season: leagueConnections.season })
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, args.userId),
        eq(leagueConnections.provider, "espn"),
        eq(leagueConnections.leagueId, lid),
      ),
    );

  if (connections.length === 0) return { success: false, error: "connection_not_found" };

  await db
    .update(leagueConnections)
    .set({
      selectedTeamId: args.teamId,
      selectedOwnerKey: ownerKey,
      selectedOwnerName: ownerName,
      selectedFranchiseName: franchiseName,
      selectedSeason: season,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(leagueConnections.userId, args.userId),
        eq(leagueConnections.provider, "espn"),
        eq(leagueConnections.leagueId, lid),
      ),
    );

  const activeConn =
    connections.find((c) => c.season === season) ??
    connections.sort((a, b) => b.season - a.season)[0]!;

  await setActiveLeagueForUser(args.userId, activeConn.id);
  await reconcileActiveLeague(args.userId);

  return { success: true, leagueConnectionId: activeConn.id, isSetupComplete: true };
}
