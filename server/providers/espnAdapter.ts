/**
 * ESPN Provider Adapter
 *
 * Wraps the existing espnService.ts normalize functions and implements
 * the ProviderAdapter interface. The intelligence engine should call
 * this adapter instead of importing from espnService.ts directly.
 *
 * This adapter handles:
 *  - ESPN-specific API auth (SWID + espn_s2 cookies)
 *  - Mapping ESPN's numeric IDs to string IDs (universal schema uses strings)
 *  - Normalizing ESPN's nested JSON into UniversalLeague
 */

import {
  normalizeSettings,
  normalizeTeams,
  normalizeRosters,
  normalizeMatchups,
  normalizeTransactions,
  normalizeDraftPicks,
  hasCookies,
  fetchEspnViews,
  ALL_VIEWS,
} from "../espnService";
import { getCachedView } from "../db";
import type {
  ProviderAdapter,
  UniversalLeague,
  UniversalSettings,
  UniversalTeam,
  UniversalRoster,
  UniversalRosterSlot,
  UniversalMatchup,
  UniversalTransaction,
  UniversalDraftPick,
  TransactionType,
  EspnAdapterConfig,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(id: unknown): string {
  return String(id ?? "");
}

function mapScoringType(raw: unknown): UniversalSettings["scoringType"] {
  const s = String(raw || "").toUpperCase();
  if (s.includes("PPR")) return "ppr";
  if (s.includes("HALF")) return "half_ppr";
  if (s.includes("STANDARD")) return "standard";
  return "custom";
}

function mapMatchupWinner(winner: unknown, homeId: unknown, awayId: unknown): UniversalMatchup["winner"] {
  const w = String(winner || "").toUpperCase();
  if (w === "HOME") return "home";
  if (w === "AWAY") return "away";
  if (w === "TIE") return "tie";
  return "undecided";
}

function mapTxType(type: unknown, itemType: unknown): TransactionType {
  const t = String(type || "").toUpperCase();
  const it = String(itemType || "").toUpperCase();
  if (t === "TRADE") return "TRADE";
  if (t === "WAIVER") return "WAIVER";
  if (t === "FREE_AGENT") return "FREE_AGENT";
  if (it === "ADD") return "ADD";
  if (it === "DROP") return "DROP";
  return "ADD";
}

// ─── Normalization from ESPN raw data ─────────────────────────────────────────

function buildUniversalLeague(
  data: Record<string, unknown>,
  leagueId: string
): UniversalLeague {
  const rawSettings = normalizeSettings(data);
  const rawTeams    = normalizeTeams(data);
  const rawRosters  = normalizeRosters(data) as Array<Record<string, unknown>>;
  const rawMatchups = normalizeMatchups(data);
  const rawTxs      = normalizeTransactions(data) as Array<Record<string, unknown>>;
  const rawDraft    = normalizeDraftPicks(data);

  // ── Settings ──
  const settings: UniversalSettings = {
    leagueId,
    provider: "espn",
    season: (rawSettings.seasonId as number) || 0,
    leagueName: (rawSettings.leagueName as string) || "ESPN League",
    teamCount: rawTeams.length,
    scoringType: mapScoringType(rawSettings.scoringType),
    playoffTeamCount: (rawSettings.playoffTeamCount as number) || 4,
    regularSeasonWeeks: (rawSettings.matchupPeriodCount as number) || 14,
    currentWeek: (rawSettings.currentMatchupPeriod as number) || 1,
    isActive: Boolean(rawSettings.isActive),
    tradeDeadlineMs: rawSettings.tradeDeadline as number | undefined,
    draftType: rawSettings.draftType as string | undefined,
    keeperCount: rawSettings.keeperCount as number | undefined,
  };

  // ── Teams ──
  const sortedTeams = [...rawTeams].sort((a, b) => {
    const wA = (a.wins as number) || 0;
    const wB = (b.wins as number) || 0;
    return wB !== wA ? wB - wA : ((b.pointsFor as number) || 0) - ((a.pointsFor as number) || 0);
  });

  const teams: UniversalTeam[] = sortedTeams.map((t, idx) => ({
    teamId: toStr(t.teamId),
    ownerName: (t.owners as string) || "Unknown",
    ownerNames: [(t.owners as string) || "Unknown"],
    teamName: (t.teamName as string) || `Team ${t.teamId}`,
    abbreviation: (t.abbrev as string) || "",
    wins: (t.wins as number) || 0,
    losses: (t.losses as number) || 0,
    ties: (t.ties as number) || 0,
    pointsFor: Math.round(((t.pointsFor as number) || 0) * 10) / 10,
    pointsAgainst: Math.round(((t.pointsAgainst as number) || 0) * 10) / 10,
    winPct: (t.percentage as number) || 0,
    standingRank: idx + 1,
    playoffSeed: t.playoffSeed as number | undefined,
    logoUrl: t.logoUrl as string | undefined,
    primaryColor: t.primaryColor as string | undefined,
  }));

  // ── Rosters ──
  const rosters: UniversalRoster[] = rawRosters.map((r) => {
    const slots = ((r.players as Array<Record<string, unknown>>) || []).map((p) => {
      const slotType = (() => {
        const slot = String(p.lineupSlot || "").toUpperCase();
        if (slot === "IR") return "ir" as const;
        if (slot === "TAXI") return "taxi" as const;
        if (slot === "BN" || slot === "BENCH") return "bench" as const;
        return "starter" as const;
      })();
      const slot: UniversalRosterSlot = {
        player: {
          playerId: toStr(p.playerId),
          playerName: (p.playerName as string) || "Unknown",
          position: (p.position as string) || "?",
          nflTeam: (p.proTeam as string) || "FA",
          injuryStatus: (p.injuryStatus as string) || "ACTIVE",
          avgPoints: (p.avgPoints as number) || 0,
          projectedPoints: (p.projectedPoints as number) || 0,
        },
        slotType,
        lineupSlot: (p.lineupSlot as string) || "BN",
      };
      return slot;
    });
    return {
      teamId: toStr(r.teamId),
      season: settings.season,
      slots,
    };
  });

  // ── Matchups ──
  const matchups: UniversalMatchup[] = rawMatchups.map((m) => ({
    season: settings.season,
    week: (m.matchupPeriodId as number) || 0,
    homeTeamId: toStr(m.homeTeamId),
    awayTeamId: toStr(m.awayTeamId),
    homeScore: m.homeTotalPoints as number | undefined,
    awayScore: m.awayTotalPoints as number | undefined,
    homeProjectedScore: m.homeProjectedPoints as number | undefined,
    awayProjectedScore: m.awayProjectedPoints as number | undefined,
    winner: mapMatchupWinner(m.winner, m.homeTeamId, m.awayTeamId),
    isPlayoff: (m.playoffTierType as string) !== "NONE" && Boolean(m.playoffTierType),
  }));

  // ── Transactions ──
  const transactions: UniversalTransaction[] = rawTxs.map((tx) => ({
    transactionId: toStr(tx.transactionId),
    season: settings.season,
    type: mapTxType(tx.type, tx.itemType),
    status: String(tx.status || "EXECUTED").toUpperCase() as UniversalTransaction["status"],
    timestampMs: (tx.proposedDate as number) || 0,
    teamId: toStr(tx.teamId),
    playerId: tx.playerId ? toStr(tx.playerId) : undefined,
    playerName: tx.playerName as string | undefined,
    playerPosition: undefined,
    fromTeamId: tx.fromTeamId ? toStr(tx.fromTeamId) : undefined,
    toTeamId: tx.toTeamId ? toStr(tx.toTeamId) : undefined,
  }));

  // ── Draft picks ──
  const draftPicks: UniversalDraftPick[] = rawDraft.map((p) => ({
    season: settings.season,
    round: (p.roundId as number) || 0,
    pickInRound: (p.roundPickNumber as number) || 0,
    overallPick: (p.overallPickNumber as number) || 0,
    teamId: toStr(p.teamId),
    playerId: p.playerId ? toStr(p.playerId) : undefined,
    playerName: p.playerName as string | undefined,
    position: p.position as string | undefined,
    nflTeam: p.proTeam as string | undefined,
    isKeeper: Boolean(p.keeper),
    isAutoDrafted: Boolean(p.autoDrafted),
  }));

  return { settings, teams, rosters, matchups, transactions, draftPicks };
}

// ─── Adapter implementation ───────────────────────────────────────────────────

export class EspnAdapter implements ProviderAdapter {
  readonly provider = "espn" as const;
  private config: EspnAdapterConfig;

  constructor(config?: Partial<EspnAdapterConfig>) {
    this.config = {
      leagueId: config?.leagueId || process.env.ESPN_LEAGUE_ID || "457622",
      swid: config?.swid || process.env.ESPN_SWID || "",
      espnS2: config?.espnS2 || process.env.ESPN_S2 || "",
    };
  }

  validateConfig(): { ok: boolean; reason?: string } {
    if (!this.config.leagueId) return { ok: false, reason: "ESPN_LEAGUE_ID is not set" };
    if (!this.config.swid)    return { ok: false, reason: "ESPN_SWID is not set" };
    if (!this.config.espnS2)  return { ok: false, reason: "ESPN_S2 is not set" };
    return { ok: true };
  }

  async fetchAndNormalize(leagueId: string, season: number): Promise<UniversalLeague> {
    // Trigger a fresh fetch + cache via the existing pipeline
    await fetchEspnViews(season, [...ALL_VIEWS]);
    const result = await this.normalizeFromCache(leagueId, season);
    if (!result) throw new Error(`ESPN fetch succeeded but cache is empty for season ${season}`);
    return result;
  }

  async normalizeFromCache(leagueId: string, season: number): Promise<UniversalLeague | null> {
    const cached = await getCachedView(season, "combined");
    if (!cached) return null;
    const data = cached.payload as Record<string, unknown>;
    return buildUniversalLeague(data, leagueId || this.config.leagueId);
  }
}

// ─── Convenience export ───────────────────────────────────────────────────────

/** Default ESPN adapter using environment variable credentials */
export const defaultEspnAdapter = new EspnAdapter();

/**
 * Quick helper: get a UniversalLeague from cache for a given season.
 * Drop-in replacement for the pattern:
 *   const cached = await getCachedView(season, "combined");
 *   const data = cached.payload as Record<string, unknown>;
 *   const teams = normalizeTeams(data);
 *   ...
 */
export async function getUniversalLeague(season: number): Promise<UniversalLeague | null> {
  return defaultEspnAdapter.normalizeFromCache(process.env.ESPN_LEAGUE_ID || "457622", season);
}
