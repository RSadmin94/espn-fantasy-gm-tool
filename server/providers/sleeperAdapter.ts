/**
 * Sleeper Provider Adapter
 *
 * Implements ProviderAdapter for the Sleeper fantasy platform.
 * Sleeper has a fully public REST API — no authentication required.
 *
 * API base: https://api.sleeper.app/v1/
 * Rate limit: ~1000 calls/minute
 *
 * Endpoints used:
 *   GET /league/<league_id>                         → settings
 *   GET /league/<league_id>/users                   → owner names
 *   GET /league/<league_id>/rosters                 → teams + rosters + standings
 *   GET /league/<league_id>/matchups/<week>         → matchups (called for each week)
 *   GET /league/<league_id>/transactions/<week>     → transactions (called for each week)
 *   GET /state/nfl                                  → current week/season
 *   GET /players/nfl                                → player metadata (cached)
 */

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
  SleeperAdapterConfig,
} from "./types";

const SLEEPER_BASE = "https://api.sleeper.app/v1";

// ─── Sleeper raw types ────────────────────────────────────────────────────────

interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  settings: {
    playoff_teams?: number;
    playoff_week_start?: number;
    leg?: number;
    last_scored_leg?: number;
    num_teams?: number;
    waiver_type?: number;
    [key: string]: unknown;
  };
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  previous_league_id?: string;
}

interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  metadata?: { team_name?: string };
  is_owner?: boolean;
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  league_id: string;
  players: string[];
  starters: string[];
  reserve: string[] | null;
  taxi?: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal?: number;
    fpts_against?: number;
    fpts_against_decimal?: number;
    waiver_budget_used?: number;
    total_moves?: number;
    [key: string]: unknown;
  };
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points: number;
  custom_points?: number | null;
  starters: string[];
  players: string[];
}

interface SleeperTransaction {
  transaction_id: string;
  type: string;
  status: string;
  created: number;
  status_updated: number;
  leg: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  settings?: { waiver_bid?: number } | null;
  waiver_budget?: Array<{ sender: number; receiver: number; amount: number }>;
}

interface SleeperNflState {
  week: number;
  season: string;
  season_type: string;
  leg: number;
  display_week: number;
}

interface SleeperPlayer {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
  injury_status?: string;
  status?: string;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function sleeperGet<T>(path: string): Promise<T> {
  const url = `${SLEEPER_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Sleeper API error: GET ${url} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// ─── Scoring type detection ───────────────────────────────────────────────────

function detectScoringType(scoringSettings: Record<string, number>): UniversalSettings["scoringType"] {
  const rec = scoringSettings["rec"] ?? 0;
  if (rec >= 1) return "ppr";
  if (rec >= 0.5) return "half_ppr";
  return "standard";
}

// ─── Transaction type mapping ─────────────────────────────────────────────────

function mapSleeperTxType(type: string): TransactionType {
  switch (type.toLowerCase()) {
    case "trade":       return "TRADE";
    case "waiver":      return "WAIVER";
    case "free_agent":  return "FREE_AGENT";
    default:            return "ADD";
  }
}

// ─── Main normalization ───────────────────────────────────────────────────────

async function fetchAndBuildLeague(leagueId: string): Promise<UniversalLeague> {
  // Fetch all data in parallel where possible
  const [league, users, rosters, nflState] = await Promise.all([
    sleeperGet<SleeperLeague>(`/league/${leagueId}`),
    sleeperGet<SleeperUser[]>(`/league/${leagueId}/users`),
    sleeperGet<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    sleeperGet<SleeperNflState>("/state/nfl"),
  ]);

  const season = parseInt(league.season, 10) || new Date().getFullYear();
  const currentWeek = nflState.leg || 1;
  const regularSeasonWeeks = league.settings.playoff_week_start
    ? league.settings.playoff_week_start - 1
    : 14;

  // Build user map: user_id → display info
  const userMap = new Map<string, SleeperUser>();
  for (const u of users) userMap.set(u.user_id, u);

  // Build roster_id → owner map
  const rosterOwnerMap = new Map<number, string>();
  for (const r of rosters) {
    rosterOwnerMap.set(r.roster_id, r.owner_id);
  }

  // ── Settings ──
  const settings: UniversalSettings = {
    leagueId,
    provider: "sleeper",
    season,
    leagueName: league.name,
    teamCount: league.total_rosters,
    scoringType: detectScoringType(league.scoring_settings),
    playoffTeamCount: league.settings.playoff_teams ?? 4,
    regularSeasonWeeks,
    currentWeek,
    isActive: league.status === "in_season" || league.status === "drafting",
  };

  // ── Teams (from rosters + users) ──
  const sortedRosters = [...rosters].sort((a, b) => {
    const wDiff = (b.settings.wins || 0) - (a.settings.wins || 0);
    if (wDiff !== 0) return wDiff;
    const fptsA = (a.settings.fpts || 0) + (a.settings.fpts_decimal || 0) / 100;
    const fptsB = (b.settings.fpts || 0) + (b.settings.fpts_decimal || 0) / 100;
    return fptsB - fptsA;
  });

  const teams: UniversalTeam[] = sortedRosters.map((r, idx) => {
    const user = userMap.get(r.owner_id);
    const displayName = user?.display_name || user?.username || `Team ${r.roster_id}`;
    const teamName = user?.metadata?.team_name || displayName;
    const fpts = (r.settings.fpts || 0) + (r.settings.fpts_decimal || 0) / 100;
    const fptsAgainst = (r.settings.fpts_against || 0) + (r.settings.fpts_against_decimal || 0) / 100;
    const wins = r.settings.wins || 0;
    const losses = r.settings.losses || 0;
    const ties = r.settings.ties || 0;
    const totalGames = wins + losses + ties;
    return {
      teamId: String(r.roster_id),
      ownerName: displayName,
      ownerNames: [displayName],
      teamName,
      abbreviation: displayName.slice(0, 4).toUpperCase(),
      wins,
      losses,
      ties,
      pointsFor: Math.round(fpts * 10) / 10,
      pointsAgainst: Math.round(fptsAgainst * 10) / 10,
      winPct: totalGames > 0 ? wins / totalGames : 0,
      standingRank: idx + 1,
    };
  });

  // ── Rosters ──
  const universalRosters: UniversalRoster[] = rosters.map((r) => {
    const starterSet = new Set(r.starters || []);
    const reserveSet = new Set(r.reserve || []);
    const taxiSet = new Set(r.taxi || []);

    const slots: UniversalRosterSlot[] = (r.players || []).map((playerId) => {
      const slotType = taxiSet.has(playerId)
        ? "taxi" as const
        : reserveSet.has(playerId)
        ? "ir" as const
        : starterSet.has(playerId)
        ? "starter" as const
        : "bench" as const;

      return {
        player: {
          playerId,
          playerName: playerId, // will be enriched if player data is available
          position: "?",
          nflTeam: "FA",
        },
        slotType,
        lineupSlot: slotType === "bench" ? "BN" : slotType === "ir" ? "IR" : slotType === "taxi" ? "TAXI" : "FLEX",
      };
    });

    return {
      teamId: String(r.roster_id),
      season,
      slots,
    };
  });

  // ── Matchups: fetch all weeks up to current ──
  const matchupWeeks = Math.min(currentWeek, regularSeasonWeeks);
  const matchupPromises = Array.from({ length: matchupWeeks }, (_, i) =>
    sleeperGet<SleeperMatchup[]>(`/league/${leagueId}/matchups/${i + 1}`)
      .then(data => ({ week: i + 1, data }))
      .catch(() => ({ week: i + 1, data: [] as SleeperMatchup[] }))
  );
  const allMatchupResults = await Promise.all(matchupPromises);

  const matchups: UniversalMatchup[] = [];
  for (const { week, data } of allMatchupResults) {
    // Group by matchup_id
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of data) {
      if (!byMatchupId.has(m.matchup_id)) byMatchupId.set(m.matchup_id, []);
      byMatchupId.get(m.matchup_id)!.push(m);
    }
    for (const pair of Array.from(byMatchupId.values())) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const aScore = a.custom_points ?? a.points ?? 0;
      const bScore = b.custom_points ?? b.points ?? 0;
      const winner: UniversalMatchup["winner"] =
        aScore > bScore ? "home" :
        bScore > aScore ? "away" :
        week < currentWeek ? "tie" : "undecided";

      matchups.push({
        season,
        week,
        homeTeamId: String(a.roster_id),
        awayTeamId: String(b.roster_id),
        homeScore: aScore,
        awayScore: bScore,
        winner,
        isPlayoff: week > regularSeasonWeeks,
      });
    }
  }

  // ── Transactions: fetch all weeks ──
  const txWeeks = Math.min(currentWeek, regularSeasonWeeks);
  const txPromises = Array.from({ length: txWeeks }, (_, i) =>
    sleeperGet<SleeperTransaction[]>(`/league/${leagueId}/transactions/${i + 1}`)
      .then(data => data)
      .catch(() => [] as SleeperTransaction[])
  );
  const allTxResults = await Promise.all(txPromises);
  const allTxs = allTxResults.flat();

  const transactions: UniversalTransaction[] = [];
  for (const tx of allTxs) {
    if (tx.status !== "complete") continue;
    const type = mapSleeperTxType(tx.type);
    const teamId = String(tx.roster_ids?.[0] ?? "");

    if (type === "TRADE") {
      // Each roster_id in the trade gets a transaction record
      for (const rid of tx.roster_ids || []) {
        transactions.push({
          transactionId: `${tx.transaction_id}-${rid}`,
          season,
          type: "TRADE",
          status: "EXECUTED",
          timestampMs: tx.created || tx.status_updated || 0,
          teamId: String(rid),
          fromTeamId: String(tx.roster_ids.find(r => r !== rid) ?? ""),
          toTeamId: String(rid),
        });
      }
    } else {
      // ADD/DROP/WAIVER/FREE_AGENT
      if (tx.adds) {
        for (const [playerId, rosterId] of Object.entries(tx.adds)) {
          transactions.push({
            transactionId: `${tx.transaction_id}-add-${playerId}`,
            season,
            type: type === "WAIVER" ? "WAIVER" : "ADD",
            status: "EXECUTED",
            timestampMs: tx.created || 0,
            teamId: String(rosterId),
            playerId,
            faabBid: tx.settings?.waiver_bid,
          });
        }
      }
      if (tx.drops) {
        for (const [playerId, rosterId] of Object.entries(tx.drops)) {
          transactions.push({
            transactionId: `${tx.transaction_id}-drop-${playerId}`,
            season,
            type: "DROP",
            status: "EXECUTED",
            timestampMs: tx.created || 0,
            teamId: String(rosterId),
            playerId,
          });
        }
      }
    }
  }

  // Draft picks: Sleeper draft picks require separate draft endpoint
  // For MVP, return empty array — can be enriched via /draft/<draft_id>/picks
  const draftPicks: UniversalDraftPick[] = [];

  return { settings, teams, rosters: universalRosters, matchups, transactions, draftPicks };
}

// ─── Adapter implementation ───────────────────────────────────────────────────

export class SleeperAdapter implements ProviderAdapter {
  readonly provider = "sleeper" as const;
  private config: SleeperAdapterConfig;

  constructor(config: SleeperAdapterConfig) {
    this.config = config;
  }

  validateConfig(): { ok: boolean; reason?: string } {
    if (!this.config.leagueId) {
      return { ok: false, reason: "Sleeper league ID is required" };
    }
    return { ok: true };
  }

  async fetchAndNormalize(leagueId: string, season: number): Promise<UniversalLeague> {
    const id = leagueId || this.config.leagueId;
    return fetchAndBuildLeague(id);
  }

  async normalizeFromCache(_leagueId: string, _season: number): Promise<UniversalLeague | null> {
    // Sleeper API is public and fast — no local cache needed for MVP.
    // For production, implement a Redis/DB cache here.
    return null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSleeperAdapter(leagueId: string): SleeperAdapter {
  return new SleeperAdapter({ leagueId });
}

/**
 * Quick helper: fetch a Sleeper league and return a UniversalLeague.
 * No auth required.
 */
export async function getSleeperLeague(leagueId: string): Promise<UniversalLeague> {
  return fetchAndBuildLeague(leagueId);
}
