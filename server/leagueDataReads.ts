/**
 * leagueDataReads.ts — Phase 1C Step 1
 *
 * Provider-neutral, read-only facade over normalized `gm_*` tables.
 * No ESPN fetch, no cache reads, no writes.
 *
 * Shapes mirror the normalized DB paths in `historicalDataService.ts`.
 * Step 2 parity tests will verify equivalence before production adoption.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  gmDraftPicks,
  gmLeagueSettings,
  gmMatchups,
  gmRosterEntries,
  gmTeams,
  gmTransactions,
} from "../drizzle/schema";
import { getDb } from "./db";
import { fillMissingDraftPickIdentities } from "./draftPickIdentityLookup";
import { draftPickSourceRank } from "./draftPickSourcePriority";
import { keepersEnabledFromSlots, readKeeperSlotsPerTeamFromPayload } from "./leagueCapabilities";

// ─── Types ───────────────────────────────────────────────────────────────────

export type LeagueSeasonRef = {
  leagueId: string;
  season: number;
};

export type LeagueDataSource = "normalized" | "empty";

export type LeagueDataReadResult<T = Record<string, unknown>> = {
  rows: T[];
  source: LeagueDataSource;
  season: number;
  leagueId: string;
  count: number;
  /** Total DB rows before in-memory dedup (draft picks path only). */
  rawCount?: number;
  debugReason?: string;
};

export type CombinedSeasonBundleResult = {
  leagueId: string;
  season: number;
  source: LeagueDataSource;
  /** ESPN-shaped payload from normalized rows (see historicalDataService.buildCombinedPayloadFromNormalized). */
  payload: Record<string, unknown> | null;
  debugReason?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function leagueKey(leagueId: string): string {
  return String(leagueId).slice(0, 32);
}

function seasonYear(season: number): number {
  return Math.floor(Number(season));
}

function emptyResult<T>(
  season: number,
  leagueId: string,
  reason: string,
): LeagueDataReadResult<T> {
  return { rows: [], source: "empty", season, leagueId, count: 0, debugReason: reason };
}

function parseJsonObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function winnerLabel(homeId: number, awayId: number, winnerTeamId: number | null): string {
  if (winnerTeamId == null) return "UNDECIDED";
  if (winnerTeamId === homeId) return "HOME";
  if (winnerTeamId === awayId) return "AWAY";
  return "UNDECIDED";
}

/** Mirrors `historicalDataService.teamRowFromGmTeam`. */
function teamRowFromGmTeam(row: typeof gmTeams.$inferSelect, season: number): Record<string, unknown> {
  const rawParsed = parseJsonObject(row.rawTeam != null ? String(row.rawTeam) : null);
  const fromRaw = (rawParsed?.record as Record<string, unknown>)?.overall as Record<string, unknown> | undefined;
  const wins = fromRaw?.wins != null ? Number(fromRaw.wins) : Number(row.wins) || 0;
  const losses = fromRaw?.losses != null ? Number(fromRaw.losses) : Number(row.losses) || 0;
  const ties = fromRaw?.ties != null ? Number(fromRaw.ties) : Number(row.ties) || 0;
  const pa = fromRaw?.pointsAgainst != null ? Number(fromRaw.pointsAgainst) : Number(row.pointsAgainst) || 0;
  const pf = Number(row.pointsFor) || 0;
  const ownerId = String(row.ownerId || "").trim();
  const memberIds = ownerId ? [ownerId] : [];
  const ownerDisplay = String(row.ownerName || "").trim();
  const ownersStr = ownerDisplay || ownerId;
  const tc =
    (rawParsed?.transactionCounter as Record<string, unknown>) ||
    ({} as Record<string, unknown>);
  return {
    season,
    teamId: row.teamId,
    id: row.teamId,
    name: row.name,
    abbrev: row.abbreviation,
    location: "",
    nickname: row.name,
    owners: ownersStr,
    ownerDisplay,
    primaryOwner: ownerId || (memberIds[0] as string) || "",
    memberIds,
    wins,
    losses,
    ties,
    pointsFor: pf,
    pointsAgainst: pa,
    percentage: fromRaw?.percentage,
    rankFinal: row.finalStanding ?? undefined,
    rankCalculatedFinal: row.finalStanding ?? undefined,
    playoffSeed: row.playoffSeed ?? undefined,
    record: { overall: { wins, losses, ties, pointsAgainst: pa, pointsFor: pf } },
    points: pf,
    transactionCounter: tc,
  };
}

/** Mirrors normalized DB draft-pick shaping in `historicalDataService.getSeasonDraftPicks`. */
function draftPickRowFromGm(
  r: {
    overallPick: number;
    roundId: number;
    roundPick: number;
    teamId: number;
    playerId: number | null;
    playerName: string | null;
    position: string | null;
    isKeeper: number;
    bidAmount: number | null;
    rawPick: string | null;
    teamName: string | null;
  },
  season: number,
): Record<string, unknown> {
  let teamName = (r.teamName && String(r.teamName).trim()) || "";
  if (r.rawPick) {
    try {
      const j = JSON.parse(String(r.rawPick)) as { teamName?: string };
      if (j.teamName?.trim()) teamName = j.teamName.trim();
    } catch {
      /* ignore */
    }
  }
  return {
    season,
    overallPickNumber: r.overallPick,
    roundId: r.roundId,
    roundPickNumber: r.roundPick,
    teamId: r.teamId,
    teamName,
    playerId: r.playerId,
    playerName: r.playerName,
    position: r.position,
    keeper: Boolean(r.isKeeper),
    reservedForKeeper: false,
    proTeam: "",
    bidAmount: r.bidAmount != null ? Number(r.bidAmount) : 0,
    rawPick: r.rawPick,
  };
}

/** Mirrors persisted normalizeRosters row stored in `gm_roster_entries.rawRosterEntry`. */
function rosterRowFromGm(row: typeof gmRosterEntries.$inferSelect, season: number): Record<string, unknown> {
  const raw = parseJsonObject(row.rawRosterEntry != null ? String(row.rawRosterEntry) : null);
  if (raw) {
    return { ...raw, season: raw.season ?? season };
  }
  return {
    season,
    teamId: row.teamId,
    teamName: "",
    playerId: row.playerId,
    playerName: row.playerName,
    position: row.position,
    proTeam: row.nflTeam,
    lineupSlotId: row.slotId,
    acquisitionType: row.acquisitionType,
    injuryStatus: row.injuryStatus,
    appliedTotal: row.actualPoints != null ? Number(row.actualPoints) : null,
    projectedTotal: row.projectedPoints != null ? Number(row.projectedPoints) : null,
  };
}

/** Mirrors fields produced by `normalizeSettings` from persisted `gm_league_settings`. */
function settingsRowFromGm(row: typeof gmLeagueSettings.$inferSelect, leagueId: string, season: number): Record<string, unknown> {
  const rosterPositions = parseJsonObject(row.rosterSlots);
  const scoringItems = parseJsonObject(row.scoringSettings);
  const rawSettings = parseJsonObject(row.rawSettings) ?? {};
  const schedSettings = (rawSettings.scheduleSettings as Record<string, unknown>) || {};
  const scoringSettings = (rawSettings.scoringSettings as Record<string, unknown>) || {};
  const rosterSettings = (rawSettings.rosterSettings as Record<string, unknown>) || {};
  const tradeSettings = (rawSettings.tradeSettings as Record<string, unknown>) || {};
  const draftSettings = (rawSettings.draftSettings as Record<string, unknown>) || {};
  const keeperPayload = { id: leagueId, seasonId: season, settings: rawSettings };
  const keeperSlotsNum = readKeeperSlotsPerTeamFromPayload(keeperPayload);
  const keepers = keepersEnabledFromSlots(keeperSlotsNum);
  return {
    leagueId,
    seasonId: season,
    leagueName: row.name,
    size: row.teamCount,
    scoringType: row.scoringType || scoringSettings.scoringType,
    playoffTeamCount: row.playoffTeams || schedSettings.playoffTeamCount,
    matchupPeriodCount: row.regularSeasonWeeks || schedSettings.matchupPeriodCount,
    currentMatchupPeriod: undefined,
    latestScoringPeriod: undefined,
    isActive: undefined,
    tradeDeadline:
      row.tradeDeadline ??
      (typeof tradeSettings.deadlineDate === "number" ? tradeSettings.deadlineDate : undefined),
    draftType: draftSettings.type,
    keeperCount: keeperSlotsNum ?? (rawSettings.keeperCount as number | undefined) ?? null,
    keeperSlotsPerTeam: keeperSlotsNum,
    keepers,
    rosterPositions: rosterPositions ?? rosterSettings.lineupSlotCounts,
    scoringItems: scoringItems ?? scoringSettings.scoringItems,
  };
}


// ─── Public reads ────────────────────────────────────────────────────────────

export async function getSeasonTeams(
  ref: LeagueSeasonRef,
): Promise<LeagueDataReadResult<Record<string, unknown>>> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);
  const db = await getDb();
  if (!db) return emptyResult(yr, lid, "database_unavailable");

  const rows = await db
    .select()
    .from(gmTeams)
    .where(and(eq(gmTeams.leagueId, lid), eq(gmTeams.season, yr)))
    .orderBy(gmTeams.teamId);

  if (rows.length === 0) {
    return emptyResult(yr, lid, "no_teams_in_normalized_db");
  }

  const shaped = rows.map((r) => teamRowFromGmTeam(r, yr));
  return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
}

export async function getSeasonMatchups(
  ref: LeagueSeasonRef,
): Promise<LeagueDataReadResult<Record<string, unknown>>> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);
  const db = await getDb();
  if (!db) return emptyResult(yr, lid, "database_unavailable");

  const rows = await db
    .select()
    .from(gmMatchups)
    .where(and(eq(gmMatchups.leagueId, lid), eq(gmMatchups.season, yr)))
    .orderBy(gmMatchups.week, gmMatchups.matchupPeriodId, gmMatchups.id);

  if (rows.length === 0) {
    return emptyResult(yr, lid, "no_matchups_in_normalized_db");
  }

  const shaped: Record<string, unknown>[] = [];
  for (const m of rows) {
    const rawM = parseJsonObject(m.rawMatchup != null ? String(m.rawMatchup) : null);
    const playoffTier =
      (rawM?.playoffTierType as string) ||
      (Number(m.isPlayoff) === 1 ? "WINNERS_BRACKET" : "NONE");
    shaped.push({
      season: yr,
      matchupPeriodId: m.matchupPeriodId,
      scoringPeriodId: m.week,
      winner: winnerLabel(m.homeTeamId, m.awayTeamId, m.winnerTeamId),
      playoffTierType: playoffTier,
      homeTeamId: m.homeTeamId,
      homeTotalPoints: Number(m.homeScore) || 0,
      homeProjectedPoints: m.homeProjected != null ? Number(m.homeProjected) : null,
      awayTeamId: m.awayTeamId,
      awayTotalPoints: Number(m.awayScore) || 0,
      awayProjectedPoints: m.awayProjected != null ? Number(m.awayProjected) : null,
    });
  }

  return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
}

export async function getSeasonDraftPicks(
  ref: LeagueSeasonRef,
): Promise<LeagueDataReadResult<Record<string, unknown>>> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);
  const db = await getDb();
  if (!db) return emptyResult(yr, lid, "database_unavailable");

  const rows = await db
    .select({
      id: gmDraftPicks.id,
      overallPick: gmDraftPicks.overallPick,
      roundId: gmDraftPicks.roundId,
      roundPick: gmDraftPicks.roundPick,
      teamId: gmDraftPicks.teamId,
      playerId: gmDraftPicks.playerId,
      playerName: gmDraftPicks.playerName,
      position: gmDraftPicks.position,
      isKeeper: gmDraftPicks.isKeeper,
      bidAmount: gmDraftPicks.bidAmount,
      rawPick: gmDraftPicks.rawPick,
      teamName: gmTeams.name,
    })
    .from(gmDraftPicks)
    .leftJoin(
      gmTeams,
      and(
        eq(gmDraftPicks.leagueId, gmTeams.leagueId),
        eq(gmDraftPicks.season, gmTeams.season),
        eq(gmDraftPicks.teamId, gmTeams.teamId),
      ),
    )
    .where(and(eq(gmDraftPicks.leagueId, lid), eq(gmDraftPicks.season, yr)))
    .orderBy(gmDraftPicks.overallPick, desc(gmDraftPicks.id));

  const byOverall = new Map<number, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byOverall.get(row.overallPick);
    if (!existing) {
      byOverall.set(row.overallPick, row);
      continue;
    }
    const nextRank = draftPickSourceRank(yr, row.rawPick);
    const prevRank = draftPickSourceRank(yr, existing.rawPick);
    if (nextRank > prevRank) {
      byOverall.set(row.overallPick, row);
    } else if (nextRank === prevRank && row.id > existing.id) {
      byOverall.set(row.overallPick, row);
    }
  }
  const dedupedRows = [...byOverall.values()].sort((a, b) => a.overallPick - b.overallPick);

  if (dedupedRows.length === 0) {
    return emptyResult(yr, lid, "no_draft_picks_in_normalized_db");
  }

  const shaped = dedupedRows.map((r) => draftPickRowFromGm(r, yr));
  const filled = await fillMissingDraftPickIdentities(
    shaped.map((row) => ({
      ...row,
      playerId: (row.playerId as number | null) ?? null,
      playerName: (row.playerName as string | null) ?? null,
      position: (row.position as string | null) ?? null,
    })),
  );
  return {
    rows: filled,
    source: "normalized",
    season: yr,
    leagueId: lid,
    count: filled.length,
    rawCount: rows.length,
  };
}

export async function getSeasonTransactions(
  ref: LeagueSeasonRef,
): Promise<LeagueDataReadResult<Record<string, unknown>>> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);
  const db = await getDb();
  if (!db) return emptyResult(yr, lid, "database_unavailable");

  const rows = await db
    .select()
    .from(gmTransactions)
    .where(and(eq(gmTransactions.leagueId, lid), eq(gmTransactions.season, yr)))
    .orderBy(desc(gmTransactions.processedDate), gmTransactions.transactionId);

  if (rows.length === 0) {
    return emptyResult(yr, lid, "no_transactions_in_normalized_db");
  }

  const shaped: Record<string, unknown>[] = rows.map((t) => ({
    season: yr,
    transactionId: t.transactionId,
    type: t.type,
    status: t.status,
    proposedDate: t.proposedDate,
    processedDate: t.processedDate,
    teamId: t.toTeamId ?? t.fromTeamId,
    playerId: t.playerId,
    playerName: t.playerName,
    fromTeamId: t.fromTeamId,
    toTeamId: t.toTeamId,
    bidAmount: t.bidAmount,
    relatedTransactionId: t.relatedTransactionId,
  }));

  return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
}

export async function getSeasonRosters(
  ref: LeagueSeasonRef,
): Promise<LeagueDataReadResult<Record<string, unknown>>> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);
  const db = await getDb();
  if (!db) return emptyResult(yr, lid, "database_unavailable");

  const rows = await db
    .select()
    .from(gmRosterEntries)
    .where(and(eq(gmRosterEntries.leagueId, lid), eq(gmRosterEntries.season, yr), eq(gmRosterEntries.week, 0)))
    .orderBy(gmRosterEntries.teamId, gmRosterEntries.slotId, gmRosterEntries.playerId);

  if (rows.length === 0) {
    return emptyResult(yr, lid, "no_roster_entries_in_normalized_db");
  }

  const shaped = rows.map((r) => rosterRowFromGm(r, yr));
  return { rows: shaped, source: "normalized", season: yr, leagueId: lid, count: shaped.length };
}

export async function getSeasonSettings(
  ref: LeagueSeasonRef,
): Promise<LeagueDataReadResult<Record<string, unknown>>> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);
  const db = await getDb();
  if (!db) return emptyResult(yr, lid, "database_unavailable");

  const rows = await db
    .select()
    .from(gmLeagueSettings)
    .where(and(eq(gmLeagueSettings.leagueId, lid), eq(gmLeagueSettings.season, yr)))
    .limit(1);

  if (rows.length === 0) {
    return emptyResult(yr, lid, "no_league_settings_in_normalized_db");
  }

  const shaped = settingsRowFromGm(rows[0]!, lid, yr);
  return { rows: [shaped], source: "normalized", season: yr, leagueId: lid, count: 1 };
}

/**
 * Compose teams + matchups + settings into an ESPN-shaped payload.
 * Mirrors `historicalDataService.buildCombinedPayloadFromNormalized` using DB reads only.
 */
export async function getCombinedSeasonBundle(
  ref: LeagueSeasonRef,
): Promise<CombinedSeasonBundleResult> {
  const yr = seasonYear(ref.season);
  const lid = leagueKey(ref.leagueId);

  const [teamsRes, matchRes, settingsRes] = await Promise.all([
    getSeasonTeams(ref),
    getSeasonMatchups(ref),
    getSeasonSettings(ref),
  ]);

  if (teamsRes.count === 0) {
    return {
      leagueId: lid,
      season: yr,
      source: "empty",
      payload: null,
      debugReason: teamsRes.debugReason ?? "no_teams_in_normalized_db",
    };
  }

  const membersMap = new Map<string, Record<string, unknown>>();
  for (const t of teamsRes.rows) {
    const ownersStr = String(t.owners || "").trim();
    const parts = ownersStr.split(";").map((s) => s.trim()).filter(Boolean);
    const primary = String(t.primaryOwner || (t.memberIds as string[])?.[0] || parts[0] || "").trim();
    if (!primary) continue;
    if (!membersMap.has(primary)) {
      const display = String(t.ownerDisplay || parts[0] || primary).trim();
      membersMap.set(primary, {
        id: primary,
        firstName: "",
        lastName: "",
        displayName: display || primary,
      });
    }
  }

  const schedule: Record<string, unknown>[] = [];
  for (const row of matchRes.rows) {
    const hid = Number(row.homeTeamId);
    const aid = Number(row.awayTeamId);
    schedule.push({
      matchupPeriodId: row.matchupPeriodId,
      scoringPeriodId: row.scoringPeriodId,
      winner: row.winner,
      playoffTierType: row.playoffTierType,
      home: { teamId: hid, totalPoints: row.homeTotalPoints },
      away: { teamId: aid, totalPoints: row.awayTotalPoints },
    });
  }

  const rsPeriods = matchRes.rows
    .filter((r) => String(r.playoffTierType || "NONE") === "NONE")
    .map((r) => Number(r.matchupPeriodId) || 0);
  const matchupPeriodCount = rsPeriods.length > 0 ? Math.max(...rsPeriods) : 14;

  const settingsRow = settingsRes.rows[0];
  const matchupPeriodCountFromSettings =
    settingsRow?.matchupPeriodCount != null ? Number(settingsRow.matchupPeriodCount) : matchupPeriodCount;
  const bundleSettings: Record<string, unknown> = {
    scheduleSettings: { matchupPeriodCount: matchupPeriodCountFromSettings },
  };
  if (settingsRow) {
    bundleSettings.scoringSettings = {
      scoringType: settingsRow.scoringType,
      scoringItems: settingsRow.scoringItems,
    };
    bundleSettings.rosterSettings = {
      lineupSlotCounts: settingsRow.rosterPositions,
    };
  }

  const teamsPayload = teamsRes.rows.map((t) => {
    const tid = Number(t.teamId ?? t.id);
    return {
      id: tid,
      name: t.name,
      abbrev: t.abbrev,
      owners: (t.memberIds as string[]) || [],
      primaryOwner: t.primaryOwner,
      record: t.record,
      points: t.points,
      rankCalculatedFinal: t.rankCalculatedFinal ?? t.rankFinal,
      playoffSeed: t.playoffSeed,
      transactionCounter: t.transactionCounter || {},
    };
  });

  return {
    leagueId: lid,
    season: yr,
    source: "normalized",
    payload: {
      seasonId: yr,
      id: lid,
      members: [...membersMap.values()],
      teams: teamsPayload,
      schedule,
      settings: bundleSettings,
      transactions: [],
    },
  };
}
