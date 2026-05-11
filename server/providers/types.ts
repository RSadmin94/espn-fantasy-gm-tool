/**
 * Universal League Schema
 *
 * Provider-agnostic data contract. Every fantasy platform adapter must
 * normalize its raw API responses into these types before the intelligence
 * engine can consume them.
 *
 * Design principles:
 *  - All IDs are strings (providers use different ID types)
 *  - All timestamps are Unix milliseconds UTC
 *  - All monetary/point values are numbers (never strings)
 *  - Optional fields use undefined (not null) for clean optional chaining
 *  - Provider-specific fields go in the `raw` escape hatch — never in core types
 *
 * The intelligence layer (DNA, simulations, weekly assessment, etc.) MUST
 * only consume these types — never import from espnService.ts directly.
 */

// ─── Provider identity ────────────────────────────────────────────────────────

export type FantasyProvider =
  | "espn"
  | "yahoo"
  | "sleeper"
  | "nfl"
  | "cbs"
  | "fleaflicker"
  | "fantrax"
  | "custom";

// ─── Core objects ─────────────────────────────────────────────────────────────

export interface UniversalSettings {
  leagueId: string;
  provider: FantasyProvider;
  season: number;
  leagueName: string;
  teamCount: number;
  scoringType: "standard" | "ppr" | "half_ppr" | "custom";
  playoffTeamCount: number;
  regularSeasonWeeks: number;
  currentWeek: number;
  isActive: boolean;
  tradeDeadlineMs?: number;
  draftType?: string;
  keeperCount?: number;
}

export interface UniversalTeam {
  teamId: string;
  ownerName: string;           // display name for the primary owner
  ownerNames: string[];        // all co-owners
  teamName: string;
  abbreviation: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  winPct: number;
  standingRank: number;        // 1-indexed, 1 = first place
  playoffSeed?: number;
  logoUrl?: string;
  primaryColor?: string;
}

export interface UniversalPlayer {
  playerId: string;
  playerName: string;
  position: string;            // QB, RB, WR, TE, K, D/ST, FLEX, etc.
  nflTeam: string;             // e.g. "KC", "BUF", "FA"
  injuryStatus?: string;       // "ACTIVE", "QUESTIONABLE", "OUT", "IR", etc.
  avgPoints?: number;
  projectedPoints?: number;
}

export interface UniversalRosterSlot {
  player: UniversalPlayer;
  slotType: "starter" | "bench" | "ir" | "taxi";
  lineupSlot: string;          // "QB", "RB1", "FLEX", "BN", "IR", etc.
}

export interface UniversalRoster {
  teamId: string;
  season: number;
  week?: number;
  slots: UniversalRosterSlot[];
}

export interface UniversalMatchup {
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number;
  awayScore?: number;
  homeProjectedScore?: number;
  awayProjectedScore?: number;
  winner?: "home" | "away" | "tie" | "undecided";
  isPlayoff?: boolean;
}

export type TransactionType = "ADD" | "DROP" | "TRADE" | "WAIVER" | "FREE_AGENT";

export interface UniversalTransaction {
  transactionId: string;
  season: number;
  type: TransactionType;
  status: "EXECUTED" | "PENDING" | "FAILED" | "VETOED";
  timestampMs: number;
  teamId: string;
  playerId?: string;
  playerName?: string;
  playerPosition?: string;
  fromTeamId?: string;
  toTeamId?: string;
  faabBid?: number;             // FAAB amount if applicable
}

export interface UniversalDraftPick {
  season: number;
  round: number;
  pickInRound: number;
  overallPick: number;
  teamId: string;
  playerId?: string;
  playerName?: string;
  position?: string;
  nflTeam?: string;
  isKeeper?: boolean;
  isAutoDrafted?: boolean;
}

// ─── The full normalized league snapshot ─────────────────────────────────────

export interface UniversalLeague {
  settings: UniversalSettings;
  teams: UniversalTeam[];
  rosters: UniversalRoster[];
  matchups: UniversalMatchup[];
  transactions: UniversalTransaction[];
  draftPicks: UniversalDraftPick[];
}

// ─── Provider adapter interface ───────────────────────────────────────────────

/**
 * Every provider adapter must implement this interface.
 * The adapter is responsible for:
 *  1. Fetching raw data from the provider API
 *  2. Normalizing it into UniversalLeague
 *  3. Persisting the raw payload to the cache (espnSeasonCache or equivalent)
 *
 * The intelligence engine only ever calls `fetchAndNormalize()` or
 * `normalizeFromCache()` — it never touches provider-specific APIs.
 */
export interface ProviderAdapter {
  readonly provider: FantasyProvider;

  /**
   * Fetch live data from the provider API and return a normalized league.
   * Should also persist the raw payload to the cache.
   */
  fetchAndNormalize(leagueId: string, season: number): Promise<UniversalLeague>;

  /**
   * Normalize from a previously cached raw payload (avoids re-fetching).
   * Returns null if no cache exists for this season.
   */
  normalizeFromCache(leagueId: string, season: number): Promise<UniversalLeague | null>;

  /**
   * Validate that the adapter has the credentials/config it needs.
   * Returns { ok: true } or { ok: false, reason: string }.
   */
  validateConfig(): { ok: boolean; reason?: string };
}

// ─── Provider registry ────────────────────────────────────────────────────────

/**
 * Connection record stored in the database per user/league.
 * Tells the system which adapter to use and what credentials are needed.
 */
export interface LeagueConnection {
  id: number;
  userId: number;
  provider: FantasyProvider;
  leagueId: string;
  leagueName: string;
  season: number;
  isActive: boolean;
  credentials?: Record<string, string>; // encrypted at rest
  lastSyncedAt?: number;
  syncStatus?: "ok" | "error" | "pending";
  syncError?: string;
  createdAt: number;
}

// ─── Adapter config shapes (per provider) ────────────────────────────────────

export interface EspnAdapterConfig {
  leagueId: string;
  swid: string;
  espnS2: string;
}

export interface SleeperAdapterConfig {
  leagueId: string;
  // Sleeper has a fully public API — no auth required for read operations
}

export interface YahooAdapterConfig {
  leagueId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
}

export interface NflAdapterConfig {
  leagueId: string;
  accessToken: string;
}
