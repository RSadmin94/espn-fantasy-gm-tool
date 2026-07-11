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
 *   GET /league/<league_id>/drafts                  → draft metadata
 *   GET /draft/<draft_id>/picks                     → draft picks
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
  UniversalPlayer,
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
  owner_id: string | null;
  co_owners?: string[] | null;
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

interface SleeperDraft {
  draft_id: string;
  type?: string;
  season?: string;
  status?: string;
  settings?: Record<string, unknown>;
}

interface SleeperDraftPick {
  player_id?: string | null;
  pick_no?: number;
  round?: number;
  draft_slot?: number;
  roster_id?: number;
  is_keeper?: boolean | null;
  metadata?: { is_keeper?: boolean | null } | null;
}

export type SleeperApiFetch = <T>(path: string) => Promise<T>;

export type SleeperLeagueSnapshot = {
  league: UniversalLeague;
  warnings: string[];
  /** Sleeper `previous_league_id` from the league payload, when present. */
  previousLeagueId: string | null;
};

export type SleeperLeagueImportSnapshots = {
  current: SleeperLeagueSnapshot;
  /** Linked older seasons via previous_league_id, newest → oldest (excludes current). */
  history: SleeperLeagueSnapshot[];
  warnings: string[];
  /** First linked historical snapshot — same as history[0] when present. */
  previous: SleeperLeagueSnapshot | null;
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function defaultSleeperGet<T>(path: string): Promise<T> {
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

let sleeperApiFetch: SleeperApiFetch = defaultSleeperGet;

/** Test hook: inject mocked Sleeper API responses. */
export function __setSleeperApiFetchForTests(fn: SleeperApiFetch | null): void {
  sleeperApiFetch = fn ?? defaultSleeperGet;
}

let playersNflCache: { at: number; data: Record<string, SleeperPlayer> } | null = null;
const PLAYERS_NFL_TTL_MS = 24 * 60 * 60 * 1000;

/** Test hook: clear in-memory NFL player catalog cache. */
export function __clearSleeperPlayerCacheForTests(): void {
  playersNflCache = null;
}

async function loadPlayersNfl(): Promise<Map<string, SleeperPlayer>> {
  const now = Date.now();
  if (playersNflCache && now - playersNflCache.at < PLAYERS_NFL_TTL_MS) {
    return new Map(Object.entries(playersNflCache.data));
  }
  const data = await sleeperApiFetch<Record<string, SleeperPlayer>>("/players/nfl");
  playersNflCache = { at: now, data };
  return new Map(Object.entries(data));
}

function playerDisplayName(p: SleeperPlayer | undefined, playerId: string): string {
  if (!p) return playerId;
  const full = (p.full_name || "").trim();
  if (full) return full;
  const parts = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return parts || playerId;
}

function enrichPlayer(playerId: string, catalog: Map<string, SleeperPlayer>): UniversalPlayer {
  const p = catalog.get(playerId);
  return {
    playerId,
    playerName: playerDisplayName(p, playerId),
    position: (p?.position || "?").trim() || "?",
    nflTeam: (p?.team || "FA").trim() || "FA",
    injuryStatus: p?.injury_status,
  };
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

function resolveMaxActivityWeek(
  league: SleeperLeague,
  nflState: SleeperNflState,
  regularSeasonWeeks: number,
): number {
  const playoffStart = league.settings.playoff_week_start ?? regularSeasonWeeks + 1;
  const lastScored = league.settings.last_scored_leg ?? 0;
  const leagueLeg = league.settings.leg ?? 0;
  const nflLeg = nflState.season === league.season ? (nflState.leg ?? 0) : 0;

  let maxWeek = regularSeasonWeeks;

  if (league.status === "complete" && lastScored > 0) {
    maxWeek = lastScored;
  } else if (lastScored > 0) {
    maxWeek = Math.max(maxWeek, lastScored);
  }

  if (league.status === "in_season" || league.status === "post_season") {
    maxWeek = Math.max(maxWeek, leagueLeg, nflLeg);
  }

  if (lastScored >= playoffStart) {
    maxWeek = Math.max(maxWeek, lastScored);
  }

  return Math.max(1, maxWeek);
}

function resolvePrimaryOwnerId(roster: SleeperRoster): string | null {
  const owner = (roster.owner_id || "").trim();
  if (owner) return owner;
  const co = roster.co_owners?.find((id) => String(id || "").trim());
  return co ? String(co).trim() : null;
}

// ─── Main normalization ───────────────────────────────────────────────────────

export async function fetchSleeperLeagueSnapshot(leagueId: string): Promise<SleeperLeagueSnapshot> {
  const warnings: string[] = [];

  const [league, users, rosters, nflState, playerCatalog] = await Promise.all([
    sleeperApiFetch<SleeperLeague>(`/league/${leagueId}`),
    sleeperApiFetch<SleeperUser[]>(`/league/${leagueId}/users`),
    sleeperApiFetch<SleeperRoster[]>(`/league/${leagueId}/rosters`),
    sleeperApiFetch<SleeperNflState>("/state/nfl"),
    loadPlayersNfl(),
  ]);

  const season = parseInt(league.season, 10) || new Date().getFullYear();
  const nflLeg = nflState.season === league.season ? (nflState.leg || 1) : 1;
  const regularSeasonWeeks = league.settings.playoff_week_start
    ? league.settings.playoff_week_start - 1
    : 14;
  const playoffWeekStart = league.settings.playoff_week_start ?? regularSeasonWeeks + 1;
  const maxActivityWeek = resolveMaxActivityWeek(league, nflState, regularSeasonWeeks);
  const currentWeek = Math.max(nflLeg, league.settings.leg ?? 0, maxActivityWeek);

  const userMap = new Map<string, SleeperUser>();
  for (const u of users) userMap.set(u.user_id, u);

  // ── Draft metadata + picks ──
  let draftType: string | undefined;
  const draftPicks: UniversalDraftPick[] = [];
  try {
    const drafts = await sleeperApiFetch<SleeperDraft[]>(`/league/${leagueId}/drafts`);
    const seasonStr = String(season);
    const seasonDraft =
      drafts.find((d) => String(d.season ?? "") === seasonStr) ??
      drafts[0] ??
      null;

    if (seasonDraft) {
      draftType = seasonDraft.type;
      const rawPicks = await sleeperApiFetch<SleeperDraftPick[]>(
        `/draft/${seasonDraft.draft_id}/picks`,
      );
      for (const p of rawPicks) {
        const overall = Number(p.pick_no ?? 0);
        const rosterId = Number(p.roster_id ?? 0);
        if (!Number.isFinite(overall) || overall <= 0 || !Number.isFinite(rosterId) || rosterId <= 0) {
          continue;
        }
        const playerId = p.player_id != null ? String(p.player_id).trim() : "";
        const enriched = playerId ? enrichPlayer(playerId, playerCatalog) : null;
        const isKeeper =
          p.is_keeper === true ||
          p.metadata?.is_keeper === true;

        draftPicks.push({
          season,
          round: Number(p.round ?? 0) || 0,
          pickInRound: Number(p.draft_slot ?? 0) || 0,
          overallPick: overall,
          teamId: String(rosterId),
          playerId: playerId || undefined,
          playerName: enriched?.playerName,
          position: enriched?.position,
          nflTeam: enriched?.nflTeam,
          isKeeper: isKeeper || undefined,
        });
      }
    } else {
      warnings.push("drafts: no draft found for league season");
    }
  } catch (e) {
    warnings.push(`drafts: fetch failed — ${e instanceof Error ? e.message : String(e)}`);
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
    draftType,
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
    const ownerId = resolvePrimaryOwnerId(r);
    if (!ownerId) {
      warnings.push(`teams: roster ${r.roster_id} has no owner_id`);
    }
    const user = ownerId ? userMap.get(ownerId) : undefined;
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
      ownerId: ownerId ?? undefined,
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
      const player = enrichPlayer(playerId, playerCatalog);

      return {
        player,
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

  // ── Matchups ──
  const matchupPromises = Array.from({ length: maxActivityWeek }, (_, i) =>
    sleeperApiFetch<SleeperMatchup[]>(`/league/${leagueId}/matchups/${i + 1}`)
      .then((data) => ({ week: i + 1, data }))
      .catch(() => ({ week: i + 1, data: [] as SleeperMatchup[] })),
  );
  const allMatchupResults = await Promise.all(matchupPromises);

  const matchups: UniversalMatchup[] = [];
  for (const { week, data } of allMatchupResults) {
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
      const isPlayoff = week >= playoffWeekStart;
      const winner: UniversalMatchup["winner"] =
        aScore > bScore ? "home"
        : bScore > aScore ? "away"
        : week < maxActivityWeek || league.status === "complete" ? "tie" : "undecided";

      matchups.push({
        season,
        week,
        homeTeamId: String(a.roster_id),
        awayTeamId: String(b.roster_id),
        homeScore: aScore,
        awayScore: bScore,
        winner,
        isPlayoff,
      });
    }
  }

  // ── Transactions ──
  const txPromises = Array.from({ length: maxActivityWeek }, (_, i) =>
    sleeperApiFetch<SleeperTransaction[]>(`/league/${leagueId}/transactions/${i + 1}`)
      .then((data) => data)
      .catch(() => [] as SleeperTransaction[]),
  );
  const allTxResults = await Promise.all(txPromises);
  const allTxs = allTxResults.flat();

  const transactions: UniversalTransaction[] = [];
  for (const tx of allTxs) {
    if (tx.status !== "complete") continue;
    const type = mapSleeperTxType(tx.type);
    const ts = tx.created || tx.status_updated || 0;

    if (type === "TRADE") {
      const dropByPlayer = new Map<string, number>();
      if (tx.drops) {
        for (const [playerId, rosterId] of Object.entries(tx.drops)) {
          dropByPlayer.set(playerId, rosterId);
        }
      }
      if (tx.adds) {
        for (const [playerId, rosterId] of Object.entries(tx.adds)) {
          const enriched = enrichPlayer(playerId, playerCatalog);
          const fromRoster =
            dropByPlayer.get(playerId) ??
            tx.roster_ids?.find((r) => r !== rosterId);
          transactions.push({
            transactionId: tx.transaction_id,
            season,
            type: "TRADE",
            status: "EXECUTED",
            timestampMs: ts,
            teamId: String(rosterId),
            playerId,
            playerName: enriched.playerName,
            playerPosition: enriched.position,
            fromTeamId: fromRoster != null ? String(fromRoster) : undefined,
            toTeamId: String(rosterId),
          });
        }
      }
      continue;
    }

    if (tx.adds) {
      for (const [playerId, rosterId] of Object.entries(tx.adds)) {
        const enriched = enrichPlayer(playerId, playerCatalog);
        transactions.push({
          transactionId: `${tx.transaction_id}-add-${playerId}`,
          season,
          type: type === "WAIVER" ? "WAIVER" : type === "FREE_AGENT" ? "FREE_AGENT" : "ADD",
          status: "EXECUTED",
          timestampMs: ts,
          teamId: String(rosterId),
          playerId,
          playerName: enriched.playerName,
          playerPosition: enriched.position,
          faabBid: tx.settings?.waiver_bid,
        });
      }
    }
    if (tx.drops) {
      for (const [playerId, rosterId] of Object.entries(tx.drops)) {
        const enriched = enrichPlayer(playerId, playerCatalog);
        transactions.push({
          transactionId: `${tx.transaction_id}-drop-${playerId}`,
          season,
          type: "DROP",
          status: "EXECUTED",
          timestampMs: ts,
          teamId: String(rosterId),
          playerId,
          playerName: enriched.playerName,
          playerPosition: enriched.position,
        });
      }
    }
  }

  return {
    league: {
      settings,
      teams,
      rosters: universalRosters,
      matchups,
      transactions,
      draftPicks,
    },
    warnings,
    previousLeagueId: (league.previous_league_id || "").trim() || null,
  };
}

/**
 * Fetch the current Sleeper league and, when requested, walk the full `previous_league_id`
 * chain until null, empty, or a repeated league id.
 */
export async function fetchSleeperLeagueImportSnapshots(
  leagueId: string,
  options?: { includePreviousSeason?: boolean },
): Promise<SleeperLeagueImportSnapshots> {
  const warnings: string[] = [];
  const visitedLeagueIds = new Set<string>();
  const history: SleeperLeagueSnapshot[] = [];

  const rootId = leagueId.trim();
  if (!rootId) {
    throw new Error("leagueId required");
  }
  visitedLeagueIds.add(rootId);

  const current = await fetchSleeperLeagueSnapshot(rootId);
  warnings.push(...current.warnings);

  if (options?.includePreviousSeason !== true) {
    return { current, history, previous: null, warnings };
  }

  let nextId = current.previousLeagueId;
  if (!nextId) {
    warnings.push("previous season: no previous_league_id on current league");
    return { current, history, previous: null, warnings };
  }

  while (nextId) {
    const id = nextId.trim();
    if (!id) {
      break;
    }
    if (visitedLeagueIds.has(id)) {
      warnings.push(`league history: stopped at repeated league id ${id}`);
      break;
    }
    visitedLeagueIds.add(id);

    try {
      const snapshot = await fetchSleeperLeagueSnapshot(id);
      warnings.push(...snapshot.warnings);
      history.push(snapshot);
      nextId = snapshot.previousLeagueId;
    } catch (e) {
      warnings.push(
        `season history: fetch failed for league ${id} — ${e instanceof Error ? e.message : String(e)}`,
      );
      break;
    }
  }

  return {
    current,
    history,
    previous: history[0] ?? null,
    warnings,
  };
}

async function fetchAndBuildLeague(leagueId: string): Promise<UniversalLeague> {
  const { league } = await fetchSleeperLeagueSnapshot(leagueId);
  return league;
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

  async fetchAndNormalize(leagueId: string, _season: number): Promise<UniversalLeague> {
    const id = leagueId || this.config.leagueId;
    return fetchAndBuildLeague(id);
  }

  async normalizeFromCache(_leagueId: string, _season: number): Promise<UniversalLeague | null> {
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
