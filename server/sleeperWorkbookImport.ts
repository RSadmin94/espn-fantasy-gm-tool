/**
 * Sleeper workbook import orchestration: workbook bytes → UniversalLeague → persist.
 */

import { and, eq } from "drizzle-orm";
import { getDb, reconcileActiveLeague, setActiveLeagueForUser } from "./db";
import { gmTeams, leagueConnections } from "../drizzle/schema";
import {
  importSleeperWorkbookFromBuffer,
  previewSleeperWorkbook,
  type SleeperWorkbookPreview,
} from "./providers/workbook/sleeperWorkbookAdapter";
import { listWorkbookAudit } from "./providers/workbook/workbookValidation";
import { persistUniversalLeague, type PersistUniversalLeagueResult } from "./universalPersistence";
import type { UniversalLeague } from "./providers/types";

export type SleeperWorkbookImportResult = {
  success: boolean;
  dryRun: boolean;
  steps: string[];
  preview: SleeperWorkbookPreview;
  league: {
    leagueId: string;
    leagueName: string;
    season: number;
    teamCount: number;
    scoringType: string;
    currentWeek: number;
    provider: "sleeper_workbook";
  };
  persist: PersistUniversalLeagueResult;
  teams: Array<{
    teamId: number;
    ownerId: string | null;
    ownerKey: string | null;
    ownerName: string;
    teamName: string;
  }>;
  warnings: string[];
};

export type SelectSleeperWorkbookTeamResult =
  | { success: true; leagueConnectionId: number; isSetupComplete: true }
  | {
      success: false;
      error: "no_db" | "connection_not_found" | "connection_season_missing" | "team_not_found";
      message: string;
    };

export function decodeWorkbookInput(fileBase64: string): Buffer {
  const trimmed = fileBase64.trim();
  const payload = trimmed.includes(",") ? trimmed.split(",").pop()! : trimmed;
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0) throw new Error("empty_workbook");
  if (buffer.length > 25 * 1024 * 1024) throw new Error("workbook_too_large");
  return buffer;
}

export function previewSleeperWorkbookFile(fileBase64: string): SleeperWorkbookPreview {
  const buffer = decodeWorkbookInput(fileBase64);
  return previewSleeperWorkbook(buffer);
}

export async function runSleeperWorkbookImport(args: {
  userId: number;
  fileBase64: string;
  dryRun?: boolean;
}): Promise<SleeperWorkbookImportResult> {
  const steps: string[] = [];
  const dryRun = args.dryRun === true;
  const buffer = decodeWorkbookInput(args.fileBase64);

  steps.push("Reading Sleeper workbook...");
  const { validation, league, parsed } = importSleeperWorkbookFromBuffer(buffer);
  const preview = previewSleeperWorkbook(buffer);
  void listWorkbookAudit(parsed);

  steps.push(`Validated Sleeper Data Import ${preview.version}`);
  steps.push(`Found league: ${league.settings.leagueName} (${league.teams.length} teams)`);

  if (!dryRun) {
    const { assertCanConnectLeague } = await import("./connectedLeagueLimits");
    await assertCanConnectLeague(args.userId, "sleeper_workbook", league.settings.leagueId);
  }

  steps.push(dryRun ? "Dry run — validating persistence mapping..." : "Persisting normalized league data...");
  const persist = await persistUniversalLeague(league, { dryRun });
  const warnings = [...validation.warnings, ...persist.warnings];

  if (!dryRun && persist.failures.length === 0) {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const partial = warnings.length > 0;
    await db
      .insert(leagueConnections)
      .values({
        userId: args.userId,
        provider: "sleeper_workbook",
        leagueId: league.settings.leagueId,
        leagueName: league.settings.leagueName,
        season: league.settings.season,
        isActive: true,
        syncStatus: partial ? "error" : "ok",
        syncError: partial ? warnings.join("; ").slice(0, 2000) : null,
        lastSyncedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          leagueName: league.settings.leagueName,
          season: league.settings.season,
          isActive: true,
          syncStatus: partial ? "error" : "ok",
          syncError: partial ? warnings.join("; ").slice(0, 2000) : null,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    await reconcileActiveLeague(args.userId);
    steps.push("League connection saved.");
  }

  const teams = buildTeamSummaries(league);

  return {
    success: dryRun || persist.failures.length === 0,
    dryRun,
    steps,
    preview,
    league: {
      leagueId: league.settings.leagueId,
      leagueName: league.settings.leagueName,
      season: league.settings.season,
      teamCount: league.teams.length,
      scoringType: league.settings.scoringType,
      currentWeek: league.settings.currentWeek,
      provider: "sleeper_workbook",
    },
    persist,
    teams,
    warnings,
  };
}

/**
 * Complete setup for a sleeper_workbook connection without owner-resolution rows.
 * Workbook teams already carry concrete owner IDs from the Users sheet.
 */
export async function runSelectSleeperWorkbookTeam(args: {
  userId: number;
  leagueId: string;
  teamId: number;
  ownerName?: string;
}): Promise<SelectSleeperWorkbookTeamResult> {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      error: "no_db",
      message: "We couldn't reach the database. Please try again.",
    };
  }

  const leagueId = args.leagueId.trim();
  const [conn] = await db
    .select()
    .from(leagueConnections)
    .where(
      and(
        eq(leagueConnections.userId, args.userId),
        eq(leagueConnections.provider, "sleeper_workbook"),
        eq(leagueConnections.leagueId, leagueId),
      ),
    )
    .limit(1);

  if (!conn) {
    return {
      success: false,
      error: "connection_not_found",
      message: "That Sleeper workbook connection was not found.",
    };
  }

  const season = conn.season;
  if (season == null) {
    return {
      success: false,
      error: "connection_season_missing",
      message: "That Sleeper workbook connection is incomplete.",
    };
  }

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
        eq(gmTeams.leagueId, leagueId),
        eq(gmTeams.season, season),
        eq(gmTeams.teamId, args.teamId),
      ),
    )
    .limit(1);

  if (!team) {
    return {
      success: false,
      error: "team_not_found",
      message: "That team was not found in the imported workbook league.",
    };
  }

  const ownerId = (team.ownerId || "").trim();
  const selectedOwnerKey = ownerId ? `id:${ownerId}` : `workbook:team:${args.teamId}`;

  await db
    .update(leagueConnections)
    .set({
      selectedTeamId: args.teamId,
      selectedOwnerKey,
      selectedOwnerName: args.ownerName || team.ownerName || null,
      selectedFranchiseName: team.name || null,
      selectedSeason: season,
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(leagueConnections.id, conn.id));

  await setActiveLeagueForUser(args.userId, conn.id);
  await reconcileActiveLeague(args.userId);

  return { success: true, leagueConnectionId: conn.id, isSetupComplete: true };
}

function buildTeamSummaries(league: UniversalLeague): SleeperWorkbookImportResult["teams"] {
  return league.teams.map((t) => {
    const tid = Number(t.teamId);
    const ownerId = (t.ownerId || "").trim() || null;
    return {
      teamId: Number.isFinite(tid) ? tid : 0,
      ownerId,
      ownerKey: ownerId ? `id:${ownerId}` : null,
      ownerName: t.ownerName,
      teamName: t.teamName,
    };
  });
}
