/**
 * Provider-neutral persistence: UniversalLeague → normalized gm_* tables.
 * Does not touch ESPN raw cache or espnService normalize* functions.
 */
import { eq, and, sql } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import type {
  UniversalLeague,
  UniversalSettings,
  UniversalTeam,
  UniversalMatchup,
  UniversalTransaction,
  UniversalDraftPick,
  UniversalRoster,
} from "./providers/types";
import { getDbConn, safeStringify, type AppDb } from "./espnPersistence";
import { mapNormalizedLegToPersist } from "./transactionPersist";

// ─── Result types ─────────────────────────────────────────────────────────────

export type EntityPersistCounts = {
  attempted: number;
  persisted: number;
};

export type PersistUniversalLeagueCounts = {
  settings: EntityPersistCounts;
  teams: EntityPersistCounts;
  matchups: EntityPersistCounts;
  transactions: EntityPersistCounts;
  draftPicks: EntityPersistCounts;
  rosterEntries: EntityPersistCounts;
};

export type PersistUniversalLeagueResult = {
  leagueId: string;
  season: number;
  provider: string;
  dryRun: boolean;
  counts: PersistUniversalLeagueCounts;
  warnings: string[];
  failures: Array<{ entity: string; message: string }>;
  /** teamId strings skipped or stored with empty ownerId */
  teamsMissingOwnerId: string[];
};

export type PersistUniversalLeagueOptions = {
  dryRun?: boolean;
};

// ─── Coercion helpers ─────────────────────────────────────────────────────────

function leagueKey(leagueId: string): string {
  return String(leagueId).slice(0, 32);
}

function seasonYear(season: number): number {
  return Math.floor(Number(season));
}

function finitePosInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function scoringTypeLabel(s: UniversalSettings["scoringType"]): string {
  switch (s) {
    case "ppr":
      return "PPR";
    case "half_ppr":
      return "Half PPR";
    case "standard":
      return "Standard";
    default:
      return "custom";
  }
}

function matchupWinnerTeamId(
  m: UniversalMatchup,
  homeId: number,
  awayId: number,
): { winnerTeamId: number | null; isCompleted: number } {
  switch (m.winner) {
    case "home":
      return { winnerTeamId: homeId, isCompleted: 1 };
    case "away":
      return { winnerTeamId: awayId, isCompleted: 1 };
    case "tie":
      return { winnerTeamId: null, isCompleted: 1 };
    case "undecided":
    default:
      return { winnerTeamId: null, isCompleted: 0 };
  }
}

function universalTxToLegRow(tx: UniversalTransaction): Record<string, unknown> {
  const ts = Math.floor(Number(tx.timestampMs)) || 0;
  const itemType =
    tx.type === "WAIVER" ? "WAIVER"
    : tx.type === "FREE_AGENT" ? "FREEAGENT"
    : tx.type === "ADD" ? "ADD"
    : tx.type === "DROP" ? "DROP"
    : tx.type === "TRADE" ? "TRADE"
    : tx.type;

  return {
    transactionId: tx.transactionId,
    type: tx.type,
    status: tx.status,
    proposedDate: ts || null,
    processedDate: ts || null,
    teamId: tx.teamId,
    playerId: tx.playerId ?? null,
    playerName: tx.playerName ?? null,
    position: tx.playerPosition ?? null,
    fromTeamId: tx.fromTeamId ?? null,
    toTeamId: tx.toTeamId ?? tx.teamId ?? null,
    bidAmount: tx.faabBid ?? 0,
    itemType,
    relatedTransactionId: null,
    executionType: null,
    round: null,
    pickInRound: null,
    overallPickNumber: null,
    pickSeason: null,
  };
}

// ─── Entity writers ───────────────────────────────────────────────────────────

async function persistSettings(
  db: AppDb | null,
  lid: string,
  yr: number,
  settings: UniversalSettings,
  dryRun: boolean,
): Promise<EntityPersistCounts> {
  const attempted = 1;
  if (dryRun || !db) return { attempted, persisted: dryRun ? attempted : 0 };

  const name = String(settings.leagueName ?? "");
  const teamCount = Number(settings.teamCount ?? 0) || 0;
  const scoringType = scoringTypeLabel(settings.scoringType);
  const playoffTeams = Number(settings.playoffTeamCount ?? 0) || 0;
  const regularSeasonWeeks = Number(settings.regularSeasonWeeks ?? 0) || 0;
  const tradeDeadline =
    settings.tradeDeadlineMs != null && Number.isFinite(settings.tradeDeadlineMs)
      ? Math.floor(settings.tradeDeadlineMs)
      : null;
  const now = new Date();
  const rawSettings = safeStringify(settings);

  await db
    .insert(schema.gmLeagueSettings)
    .values({
      leagueId: lid,
      season: yr,
      name,
      teamCount,
      scoringType,
      playoffTeams,
      regularSeasonWeeks,
      tradeDeadline,
      rosterSlots: null,
      scoringSettings: null,
      rawSettings,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        name,
        teamCount,
        scoringType,
        playoffTeams,
        regularSeasonWeeks,
        tradeDeadline,
        rawSettings,
        updatedAt: now,
      },
    });

  return { attempted, persisted: 1 };
}

async function persistTeams(
  db: AppDb | null,
  lid: string,
  yr: number,
  teams: UniversalTeam[],
  dryRun: boolean,
  warnings: string[],
): Promise<{ counts: EntityPersistCounts; missingOwnerIds: string[] }> {
  const missingOwnerIds: string[] = [];
  let persisted = 0;
  let attempted = 0;
  const now = new Date();

  for (const t of teams) {
    attempted++;
    const tid = finitePosInt(t.teamId);
    if (tid == null) {
      warnings.push(`teams: skipped non-numeric teamId "${t.teamId}"`);
      continue;
    }
    const ownerId = String(t.ownerId ?? "").trim();
    if (!ownerId) {
      missingOwnerIds.push(String(t.teamId));
    }
    if (dryRun || !db) {
      persisted++;
      continue;
    }

    const pf = Number(t.pointsFor ?? 0) || 0;
    const pa = Number(t.pointsAgainst ?? 0) || 0;
    const rawTeam = safeStringify(t);

    await db
      .insert(schema.gmTeams)
      .values({
        leagueId: lid,
        season: yr,
        teamId: tid,
        name: String(t.teamName ?? ""),
        abbreviation: String(t.abbreviation ?? ""),
        ownerName: String(t.ownerName ?? ""),
        ownerId,
        logoUrl: String(t.logoUrl ?? ""),
        wins: Number(t.wins ?? 0) || 0,
        losses: Number(t.losses ?? 0) || 0,
        ties: Number(t.ties ?? 0) || 0,
        pointsFor: pf,
        pointsAgainst: pa,
        playoffSeed: t.playoffSeed != null ? Number(t.playoffSeed) : null,
        finalStanding: t.standingRank != null ? Number(t.standingRank) : null,
        rawTeam,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: String(t.teamName ?? ""),
          abbreviation: String(t.abbreviation ?? ""),
          ownerName: String(t.ownerName ?? ""),
          ownerId,
          logoUrl: String(t.logoUrl ?? ""),
          wins: Number(t.wins ?? 0) || 0,
          losses: Number(t.losses ?? 0) || 0,
          ties: Number(t.ties ?? 0) || 0,
          pointsFor: pf,
          pointsAgainst: pa,
          playoffSeed: t.playoffSeed != null ? Number(t.playoffSeed) : null,
          finalStanding: t.standingRank != null ? Number(t.standingRank) : null,
          rawTeam,
          updatedAt: now,
        },
      });
    persisted++;
  }

  return {
    counts: { attempted, persisted },
    missingOwnerIds,
  };
}

async function persistMatchups(
  db: AppDb | null,
  lid: string,
  yr: number,
  matchups: UniversalMatchup[],
  dryRun: boolean,
  warnings: string[],
): Promise<EntityPersistCounts> {
  let persisted = 0;
  const now = new Date();

  for (const m of matchups) {
    const hid = finitePosInt(m.homeTeamId);
    const aid = finitePosInt(m.awayTeamId);
    if (hid == null || aid == null) {
      warnings.push(`matchups: skipped week ${m.week} — invalid home/away teamId`);
      continue;
    }
    const mpid = Number(m.week) || 0;
    const week = Number(m.week) || 0;
    const hs = Number(m.homeScore ?? 0) || 0;
    const as = Number(m.awayScore ?? 0) || 0;
    const hp = m.homeProjectedScore != null ? Number(m.homeProjectedScore) : null;
    const ap = m.awayProjectedScore != null ? Number(m.awayProjectedScore) : null;
    const { winnerTeamId, isCompleted } = matchupWinnerTeamId(m, hid, aid);
    const isPlayoff = m.isPlayoff ? 1 : 0;
    const rawMatchup = safeStringify(m);

    if (dryRun || !db) {
      persisted++;
      continue;
    }

    await db
      .insert(schema.gmMatchups)
      .values({
        leagueId: lid,
        season: yr,
        week,
        matchupPeriodId: mpid,
        homeTeamId: hid,
        awayTeamId: aid,
        homeScore: hs,
        awayScore: as,
        homeProjected: hp,
        awayProjected: ap,
        winnerTeamId,
        isPlayoff,
        isCompleted,
        rawMatchup,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          homeScore: hs,
          awayScore: as,
          homeProjected: hp,
          awayProjected: ap,
          winnerTeamId,
          isPlayoff,
          isCompleted,
          rawMatchup,
          updatedAt: now,
        },
      });
    persisted++;
  }

  return { attempted: matchups.length, persisted: dryRun ? persisted : persisted };
}

async function persistDraftPicks(
  db: AppDb | null,
  lid: string,
  yr: number,
  picks: UniversalDraftPick[],
  dryRun: boolean,
  warnings: string[],
): Promise<EntityPersistCounts> {
  let persisted = 0;
  const now = new Date();

  for (const p of picks) {
    const overall = finitePosInt(p.overallPick);
    if (overall == null) {
      warnings.push(`draftPicks: skipped invalid overallPick`);
      continue;
    }
    const teamId = finitePosInt(p.teamId) ?? 0;
    const playerIdVal = p.playerId != null ? finitePosInt(p.playerId) : null;
    const bidAmount = 0;
    const rawPick = safeStringify(p);

    if (dryRun || !db) {
      persisted++;
      continue;
    }

    await db
      .insert(schema.gmDraftPicks)
      .values({
        leagueId: lid,
        season: yr,
        overallPick: overall,
        roundId: Number(p.round ?? 0) || 0,
        roundPick: Number(p.pickInRound ?? 0) || 0,
        teamId,
        owningTeamId: null,
        playerId: playerIdVal,
        playerName: p.playerName != null ? String(p.playerName) : null,
        position: p.position != null ? String(p.position) : null,
        isKeeper: p.isKeeper ? 1 : 0,
        bidAmount,
        rawPick,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          roundId: Number(p.round ?? 0) || 0,
          roundPick: Number(p.pickInRound ?? 0) || 0,
          teamId,
          playerId: playerIdVal,
          playerName: p.playerName != null ? String(p.playerName) : null,
          position: p.position != null ? String(p.position) : null,
          isKeeper: p.isKeeper ? 1 : 0,
          bidAmount,
          rawPick,
          updatedAt: now,
        },
      });
    persisted++;
  }

  return { attempted: picks.length, persisted: dryRun ? persisted : persisted };
}

async function persistTransactions(
  db: AppDb | null,
  lid: string,
  yr: number,
  transactions: UniversalTransaction[],
  dryRun: boolean,
  warnings: string[],
): Promise<EntityPersistCounts> {
  let persisted = 0;
  const now = new Date();
  const seqByTid = new Map<string, number>();
  const rawById = new Map<string, Record<string, unknown>>();

  for (const tx of transactions) {
    const tid = String(tx.transactionId ?? "").trim();
    if (!tid) {
      warnings.push("transactions: skipped row with empty transactionId");
      continue;
    }
    if (!rawById.has(tid)) rawById.set(tid, universalTxToLegRow(tx));
  }

  for (const tx of transactions) {
    const tid = String(tx.transactionId ?? "").trim();
    if (!tid) continue;

    const legIndex = (seqByTid.get(tid) ?? 0) + 1;
    seqByTid.set(tid, legIndex);
    const row = universalTxToLegRow(tx);
    const parent = rawById.get(tid) ?? row;
    const rawTransaction = safeStringify(parent);

    if (dryRun || !db) {
      persisted++;
      continue;
    }

    try {
      const leg = mapNormalizedLegToPersist({
        leagueId: lid,
        season: yr,
        legIndex,
        row,
        rawTransaction,
      });
      await db
        .insert(schema.gmTransactions)
        .values({
          leagueId: leg.leagueId,
          season: leg.season,
          transactionId: leg.transactionId,
          relatedTransactionId: leg.relatedTransactionId,
          type: leg.type,
          status: leg.status,
          playerId: leg.playerId,
          playerKey: leg.playerKey,
          playerName: leg.playerName,
          fromTeamId: leg.fromTeamId,
          toTeamId: leg.toTeamId,
          teamId: leg.teamId,
          itemType: leg.itemType,
          position: leg.position,
          round: leg.round,
          pickInRound: leg.pickInRound,
          overallPickNumber: leg.overallPickNumber,
          pickSeason: leg.pickSeason,
          legIndex: leg.legIndex,
          executionType: leg.executionType,
          bidAmount: leg.bidAmount,
          proposedDate: leg.proposedDate,
          processedDate: leg.processedDate,
          rawTransaction: leg.rawTransaction,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            relatedTransactionId: leg.relatedTransactionId,
            type: leg.type,
            status: leg.status,
            playerId: leg.playerId,
            playerName: leg.playerName,
            fromTeamId: leg.fromTeamId,
            toTeamId: leg.toTeamId,
            teamId: leg.teamId,
            itemType: leg.itemType,
            position: leg.position,
            round: leg.round,
            pickInRound: leg.pickInRound,
            overallPickNumber: leg.overallPickNumber,
            pickSeason: leg.pickSeason,
            legIndex: leg.legIndex,
            executionType: leg.executionType,
            bidAmount: leg.bidAmount,
            proposedDate: leg.proposedDate,
            processedDate: leg.processedDate,
            rawTransaction: leg.rawTransaction,
            updatedAt: now,
          },
        });
      persisted++;
    } catch (e) {
      warnings.push(
        `transactions: upsert failed for ${tid} leg ${legIndex}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { attempted: transactions.length, persisted: dryRun ? persisted : persisted };
}

async function persistRosterEntries(
  db: AppDb | null,
  lid: string,
  yr: number,
  rosters: UniversalRoster[],
  dryRun: boolean,
  warnings: string[],
): Promise<EntityPersistCounts> {
  let persisted = 0;
  const now = new Date();
  let attempted = 0;

  for (const roster of rosters) {
    const teamId = finitePosInt(roster.teamId);
    if (teamId == null) {
      warnings.push(`rosterEntries: skipped roster with invalid teamId "${roster.teamId}"`);
      continue;
    }
    for (const slot of roster.slots) {
      attempted++;
      const playerId = finitePosInt(slot.player.playerId);
      if (playerId == null) {
        warnings.push(`rosterEntries: skipped player with invalid id on team ${teamId}`);
        continue;
      }
      const rawRosterEntry = safeStringify({
        teamId,
        playerId,
        playerName: slot.player.playerName,
        position: slot.player.position,
        proTeam: slot.player.nflTeam,
        lineupSlot: slot.lineupSlot,
        slotType: slot.slotType,
        injuryStatus: slot.player.injuryStatus ?? "",
        projectedTotal: slot.player.projectedPoints ?? null,
        appliedTotal: null,
        acquisitionType: "",
      });

      if (dryRun || !db) {
        persisted++;
        continue;
      }

      await db
        .insert(schema.gmRosterEntries)
        .values({
          leagueId: lid,
          season: yr,
          week: 0,
          teamId,
          playerId,
          playerName: String(slot.player.playerName ?? ""),
          position: String(slot.player.position ?? ""),
          nflTeam: String(slot.player.nflTeam ?? ""),
          slotId: null,
          acquisitionType: "",
          projectedPoints:
            slot.player.projectedPoints != null ? Number(slot.player.projectedPoints) : null,
          actualPoints: null,
          injuryStatus: String(slot.player.injuryStatus ?? ""),
          rawRosterEntry,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            playerName: String(slot.player.playerName ?? ""),
            position: String(slot.player.position ?? ""),
            nflTeam: String(slot.player.nflTeam ?? ""),
            slotId: null,
            acquisitionType: "",
            projectedPoints:
              slot.player.projectedPoints != null ? Number(slot.player.projectedPoints) : null,
            actualPoints: null,
            injuryStatus: String(slot.player.injuryStatus ?? ""),
            rawRosterEntry,
            updatedAt: now,
          },
        });
      persisted++;
    }
  }

  return { attempted, persisted: dryRun ? persisted : persisted };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function persistUniversalLeague(
  league: UniversalLeague,
  options?: PersistUniversalLeagueOptions,
): Promise<PersistUniversalLeagueResult> {
  const dryRun = options?.dryRun === true;
  const lid = leagueKey(league.settings.leagueId);
  const yr = seasonYear(league.settings.season);
  const warnings: string[] = [];
  const failures: Array<{ entity: string; message: string }> = [];

  const emptyCounts = (): PersistUniversalLeagueCounts => ({
    settings: { attempted: 0, persisted: 0 },
    teams: { attempted: 0, persisted: 0 },
    matchups: { attempted: 0, persisted: 0 },
    transactions: { attempted: 0, persisted: 0 },
    draftPicks: { attempted: 0, persisted: 0 },
    rosterEntries: { attempted: 0, persisted: 0 },
  });

  const db = dryRun ? null : await getDbConn();
  if (!dryRun && !db) {
    return {
      leagueId: lid,
      season: yr,
      provider: league.settings.provider,
      dryRun: false,
      counts: emptyCounts(),
      warnings,
      failures: [{ entity: "database", message: "Database unavailable" }],
      teamsMissingOwnerId: [],
    };
  }
  const counts = emptyCounts();
  let teamsMissingOwnerId: string[] = [];

  const runEntity = async (
    entity: keyof PersistUniversalLeagueCounts,
    fn: () => Promise<EntityPersistCounts | { counts: EntityPersistCounts; missingOwnerIds: string[] }>,
  ) => {
    try {
      const result = await fn();
      if ("missingOwnerIds" in result) {
        counts.teams = result.counts;
        teamsMissingOwnerId = result.missingOwnerIds;
      } else {
        counts[entity] = result;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      failures.push({ entity, message });
    }
  };

  await runEntity("settings", () =>
    persistSettings(db, lid, yr, league.settings, dryRun),
  );

  await runEntity("teams", () =>
    persistTeams(db, lid, yr, league.teams, dryRun, warnings),
  );

  await runEntity("matchups", () =>
    persistMatchups(db, lid, yr, league.matchups, dryRun, warnings),
  );

  await runEntity("transactions", () =>
    persistTransactions(db, lid, yr, league.transactions, dryRun, warnings),
  );

  await runEntity("draftPicks", () =>
    persistDraftPicks(db, lid, yr, league.draftPicks, dryRun, warnings),
  );

  await runEntity("rosterEntries", () =>
    persistRosterEntries(db, lid, yr, league.rosters, dryRun, warnings),
  );

  if (teamsMissingOwnerId.length > 0) {
    warnings.push(
      `teams: ${teamsMissingOwnerId.length} team(s) persisted without ownerId: ${teamsMissingOwnerId.join(", ")}`,
    );
  }

  return {
    leagueId: lid,
    season: yr,
    provider: league.settings.provider,
    dryRun,
    counts,
    warnings,
    failures,
    teamsMissingOwnerId,
  };
}

/** Count rows for a league-season slice (test helper). */
export async function countUniversalPersistRows(
  leagueId: string,
  season: number,
): Promise<Record<keyof PersistUniversalLeagueCounts, number>> {
  const db = await getDbConn();
  if (!db) {
    return {
      settings: 0,
      teams: 0,
      matchups: 0,
      transactions: 0,
      draftPicks: 0,
      rosterEntries: 0,
    };
  }
  const lid = leagueKey(leagueId);
  const yr = seasonYear(season);

  const countTable = async (
    table:
      | typeof schema.gmLeagueSettings
      | typeof schema.gmTeams
      | typeof schema.gmMatchups
      | typeof schema.gmTransactions
      | typeof schema.gmDraftPicks
      | typeof schema.gmRosterEntries,
  ): Promise<number> => {
    const rows = await db
      .select({ c: sql<number>`count(*)` })
      .from(table)
      .where(and(eq(table.leagueId, lid), eq(table.season, yr)));
    return Number(rows[0]?.c ?? 0);
  };

  return {
    settings: await countTable(schema.gmLeagueSettings),
    teams: await countTable(schema.gmTeams),
    matchups: await countTable(schema.gmMatchups),
    transactions: await countTable(schema.gmTransactions),
    draftPicks: await countTable(schema.gmDraftPicks),
    rosterEntries: await countTable(schema.gmRosterEntries),
  };
}
