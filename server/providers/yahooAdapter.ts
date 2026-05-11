/**
 * Yahoo Fantasy Sports Adapter
 *
 * Implements ProviderAdapter for Yahoo Fantasy Football leagues.
 *
 * Yahoo Fantasy API base URL: https://fantasysports.yahooapis.com/fantasy/v2/
 *
 * Key resource patterns:
 *   League key:  {game_key}.l.{league_id}  e.g. "423.l.12345"
 *   Team key:    {league_key}.t.{team_id}  e.g. "423.l.12345.t.1"
 *   Game key:    423 = NFL 2024, 422 = NFL 2023, 414 = NFL 2022, etc.
 *
 * All responses are JSON (using ?format=json query param).
 * Access tokens expire after 1 hour; this adapter auto-refreshes via yahooOAuth.
 *
 * Scoring type detection:
 *   - PPR:      stat_modifiers has stat_id 11 (receptions) with value >= 1.0
 *   - Half PPR: stat_id 11 with value 0.5
 *   - Standard: no reception modifier
 */

import type {
  ProviderAdapter,
  FantasyProvider,
  UniversalLeague,
  UniversalSettings,
  UniversalTeam,
  UniversalRoster,
  UniversalRosterSlot,
  UniversalPlayer,
  UniversalMatchup,
  UniversalTransaction,
  UniversalDraftPick,
} from "./types";
import {
  yahooApiFetch,
  refreshYahooToken,
  type YahooTokenResponse,
} from "./yahooOAuth";

// ─── Yahoo API base ───────────────────────────────────────────────────────────

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

// NFL game keys by season year (Yahoo uses a new game key each season)
// Updated through 2025 season
const NFL_GAME_KEYS: Record<number, string> = {
  2015: "348",
  2016: "359",
  2017: "371",
  2018: "380",
  2019: "390",
  2020: "399",
  2021: "406",
  2022: "414",
  2023: "423",
  2024: "449",
  2025: "458",
};

function getGameKey(season: number): string {
  return NFL_GAME_KEYS[season] ?? String(season);
}

function buildLeagueKey(leagueId: string, season: number): string {
  // If leagueId already contains a dot (e.g. "423.l.12345"), use as-is
  if (leagueId.includes(".l.")) return leagueId;
  return `${getGameKey(season)}.l.${leagueId}`;
}

// ─── Raw Yahoo API types ──────────────────────────────────────────────────────

interface YahooApiWrapper<T> {
  fantasy_content: T;
}

interface YahooLeagueResponse {
  league: [YahooLeagueMeta, YahooLeagueSubresource];
}

interface YahooLeagueMeta {
  league_key: string;
  league_id: string;
  name: string;
  season: string;
  num_teams: number;
  current_week: number;
  start_week: number;
  end_week: number;
  is_finished: number;
  scoring_type: string;
  draft_status: string;
  league_type: string;
  settings?: {
    playoff_num_teams?: number;
    trade_end_date?: string;
    draft_type?: string;
    keeper_type?: string;
    num_keeper_slots?: number;
    stat_modifiers?: {
      stats: {
        stat: Array<{ stat_id: string; value: string }>;
      };
    };
  };
}

interface YahooLeagueSubresource {
  teams?: {
    count: number;
    [key: string]: YahooTeamEntry | number;
  };
  standings?: {
    teams: {
      count: number;
      [key: string]: YahooTeamEntry | number;
    };
  };
  scoreboard?: {
    week: number;
    matchups: {
      count: number;
      [key: string]: YahooMatchupEntry | number;
    };
  };
  transactions?: {
    count: number;
    [key: string]: YahooTransactionEntry | number;
  };
  draftresults?: {
    draft_picks: Array<YahooDraftPick>;
  };
}

interface YahooTeamEntry {
  team: [YahooTeamMeta, YahooTeamStats?];
}

interface YahooTeamMeta {
  team_key: string;
  team_id: string;
  name: string;
  url: string;
  team_logos?: Array<{ team_logo: { size: string; url: string } }>;
  managers?: Array<{ manager: { nickname: string; guid: string } }>;
  team_points?: { total: string };
  team_standings?: {
    rank: number;
    playoff_seed: number;
    outcome_totals: {
      wins: string;
      losses: string;
      ties: string;
      percentage: string;
    };
    points_for: string;
    points_against: string;
  };
}

interface YahooTeamStats {
  team_points?: { total: string };
  team_projected_points?: { total: string };
}

interface YahooMatchupEntry {
  matchup: {
    week: string;
    status: string;
    is_playoffs: string;
    teams: {
      count: number;
      [key: string]: YahooMatchupTeam | number;
    };
  };
}

interface YahooMatchupTeam {
  team: [YahooTeamMeta, YahooTeamStats];
}

interface YahooTransactionEntry {
  transaction: [YahooTransactionMeta, YahooTransactionPlayers];
}

interface YahooTransactionMeta {
  transaction_key: string;
  transaction_id: string;
  type: string;
  status: string;
  timestamp: string;
}

interface YahooTransactionPlayers {
  players: {
    count: number;
    [key: string]: YahooTransactionPlayer | number;
  };
}

interface YahooTransactionPlayer {
  player: [
    Array<{ player_key?: string; player_id?: string; full_name?: string; display_position?: string; editorial_team_abbr?: string }>,
    { transaction_data: Array<{ type: string; source_team_key?: string; destination_team_key?: string; source_type?: string; destination_type?: string }> }
  ];
}

interface YahooDraftPick {
  pick: number;
  round: number;
  team_key: string;
  player_key: string;
  cost?: string;
  is_keeper?: string;
}

interface YahooRosterResponse {
  team: [YahooTeamMeta, { roster: { players: { count: number; [key: string]: YahooRosterPlayer | number } } }];
}

interface YahooRosterPlayer {
  player: [
    Array<{ player_key?: string; player_id?: string; full_name?: string; display_position?: string; editorial_team_abbr?: string; status?: string; injury_note?: string }>,
    { selected_position: Array<{ position: string }> }
  ];
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function parseTeams(
  teamsData: YahooLeagueSubresource["teams"] | YahooLeagueSubresource["standings"]
): UniversalTeam[] {
  const teams: UniversalTeam[] = [];
  if (!teamsData) return teams;

  // Handle both /teams and /standings subresource shapes
  const teamsObj = "teams" in teamsData
    ? (teamsData as YahooLeagueSubresource["standings"])?.teams
    : teamsData;

  if (!teamsObj) return teams;

  const count = typeof teamsObj.count === "number" ? teamsObj.count : 0;
  for (let i = 0; i < count; i++) {
    const entry = teamsObj[i] as YahooTeamEntry | undefined;
    if (!entry?.team) continue;

    const [meta] = entry.team;
    const standings = meta.team_standings;
    const managers = meta.managers ?? [];

    const ownerNames = managers.map(m => m.manager.nickname).filter(Boolean);
    const wins = parseInt(standings?.outcome_totals?.wins ?? "0", 10);
    const losses = parseInt(standings?.outcome_totals?.losses ?? "0", 10);
    const ties = parseInt(standings?.outcome_totals?.ties ?? "0", 10);
    const pf = parseFloat(standings?.points_for ?? "0");
    const pa = parseFloat(standings?.points_against ?? "0");
    const total = wins + losses + ties;
    const winPct = total > 0 ? wins / total : 0;

    teams.push({
      teamId: meta.team_id,
      ownerName: ownerNames[0] ?? meta.name,
      ownerNames,
      teamName: meta.name,
      abbreviation: meta.name.slice(0, 4).toUpperCase(),
      wins,
      losses,
      ties,
      pointsFor: pf,
      pointsAgainst: pa,
      winPct,
      standingRank: standings?.rank ?? 0,
      playoffSeed: standings?.playoff_seed,
      logoUrl: meta.team_logos?.[0]?.team_logo?.url,
    });
  }

  return teams;
}

function parseMatchups(
  scoreboardData: YahooLeagueSubresource["scoreboard"] | undefined,
  season: number
): UniversalMatchup[] {
  const matchups: UniversalMatchup[] = [];
  if (!scoreboardData?.matchups) return matchups;

  const count = typeof scoreboardData.matchups.count === "number"
    ? scoreboardData.matchups.count
    : 0;

  for (let i = 0; i < count; i++) {
    const entry = scoreboardData.matchups[i] as YahooMatchupEntry | undefined;
    if (!entry?.matchup) continue;

    const { matchup } = entry;
    const week = parseInt(matchup.week, 10);
    const isPlayoff = matchup.is_playoffs === "1";

    const matchupTeams: Array<[YahooTeamMeta, YahooTeamStats]> = [];
    const teamCount = typeof matchup.teams.count === "number" ? matchup.teams.count : 0;
    for (let j = 0; j < teamCount; j++) {
      const t = matchup.teams[j] as YahooMatchupTeam | undefined;
      if (t?.team) matchupTeams.push(t.team);
    }

    if (matchupTeams.length < 2) continue;

    const [homeMeta, homeStats] = matchupTeams[0];
    const [awayMeta, awayStats] = matchupTeams[1];

    const homeScore = parseFloat(homeStats?.team_points?.total ?? "0");
    const awayScore = parseFloat(awayStats?.team_points?.total ?? "0");
    const homeProj = parseFloat(homeStats?.team_projected_points?.total ?? "0");
    const awayProj = parseFloat(awayStats?.team_projected_points?.total ?? "0");

    let winner: UniversalMatchup["winner"] = "undecided";
    if (matchup.status === "postevent") {
      if (homeScore > awayScore) winner = "home";
      else if (awayScore > homeScore) winner = "away";
      else winner = "tie";
    }

    matchups.push({
      season,
      week,
      homeTeamId: homeMeta.team_id,
      awayTeamId: awayMeta.team_id,
      homeScore,
      awayScore,
      homeProjectedScore: homeProj,
      awayProjectedScore: awayProj,
      winner,
      isPlayoff,
    });
  }

  return matchups;
}

function parseTransactions(
  txData: YahooLeagueSubresource["transactions"] | undefined,
  season: number
): UniversalTransaction[] {
  const transactions: UniversalTransaction[] = [];
  if (!txData) return transactions;

  const count = typeof txData.count === "number" ? txData.count : 0;
  for (let i = 0; i < count; i++) {
    const entry = txData[i] as YahooTransactionEntry | undefined;
    if (!entry?.transaction) continue;

    const [meta, playersData] = entry.transaction;
    const tsMs = parseInt(meta.timestamp, 10) * 1000;

    const rawType = meta.type.toUpperCase();
    let txType: UniversalTransaction["type"] = "FREE_AGENT";
    if (rawType === "ADD") txType = "ADD";
    else if (rawType === "DROP") txType = "DROP";
    else if (rawType === "TRADE") txType = "TRADE";
    else if (rawType === "ADD/DROP") txType = "WAIVER";

    const rawStatus = meta.status.toUpperCase();
    let status: UniversalTransaction["status"] = "EXECUTED";
    if (rawStatus === "PENDING") status = "PENDING";
    else if (rawStatus === "FAILED" || rawStatus === "INVALID") status = "FAILED";

    // Extract first player's info
    const pCount = typeof playersData?.players?.count === "number"
      ? playersData.players.count
      : 0;

    for (let j = 0; j < pCount; j++) {
      const pEntry = playersData?.players?.[j] as YahooTransactionPlayer | undefined;
      if (!pEntry?.player) continue;

      const [playerMeta, txDataArr] = pEntry.player;
      const playerInfo = playerMeta.reduce((acc, item) => ({ ...acc, ...item }), {} as Record<string, string>);
      const txInfo = txDataArr?.transaction_data?.[0] ?? {};

      const toTeamKey = txInfo.destination_team_key ?? "";
      const fromTeamKey = txInfo.source_team_key ?? "";

      // Extract team ID from team key (e.g. "423.l.12345.t.3" → "3")
      const toTeamId = toTeamKey.split(".t.")[1] ?? toTeamKey;
      const fromTeamId = fromTeamKey.split(".t.")[1] ?? fromTeamKey;

      transactions.push({
        transactionId: `${meta.transaction_id}-${j}`,
        season,
        type: txType,
        status,
        timestampMs: tsMs,
        teamId: toTeamId || fromTeamId,
        playerId: playerInfo.player_id,
        playerName: playerInfo.full_name,
        playerPosition: playerInfo.display_position,
        fromTeamId: fromTeamId || undefined,
        toTeamId: toTeamId || undefined,
      });
    }
  }

  return transactions;
}

function parseDraftPicks(
  draftData: YahooLeagueSubresource["draftresults"] | undefined,
  season: number
): UniversalDraftPick[] {
  if (!draftData?.draft_picks) return [];

  return draftData.draft_picks.map((pick, idx) => {
    const teamId = pick.team_key.split(".t.")[1] ?? pick.team_key;
    const playerId = pick.player_key.split(".p.")[1] ?? pick.player_key;
    return {
      season,
      round: pick.round,
      pickInRound: idx + 1, // Yahoo doesn't expose pick-in-round directly
      overallPick: pick.pick,
      teamId,
      playerId,
      isKeeper: pick.is_keeper === "1",
    };
  });
}

function detectScoringType(
  settings: YahooLeagueMeta["settings"]
): UniversalSettings["scoringType"] {
  const stats = settings?.stat_modifiers?.stats?.stat ?? [];
  const recStat = stats.find(s => s.stat_id === "11");
  if (!recStat) return "standard";
  const val = parseFloat(recStat.value);
  if (val >= 1.0) return "ppr";
  if (val >= 0.5) return "half_ppr";
  return "standard";
}

// ─── Yahoo Adapter class ──────────────────────────────────────────────────────

export interface YahooAdapterCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export class YahooAdapter implements ProviderAdapter {
  readonly provider: FantasyProvider = "yahoo";

  private leagueId: string;
  private credentials: YahooAdapterCredentials;
  private onTokenRefresh?: (newTokens: YahooTokenResponse) => Promise<void>;

  constructor(
    config: { leagueId: string } & YahooAdapterCredentials,
    onTokenRefresh?: (newTokens: YahooTokenResponse) => Promise<void>
  ) {
    this.leagueId = config.leagueId;
    this.credentials = {
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
    };
    this.onTokenRefresh = onTokenRefresh;
  }

  validateConfig(): { ok: boolean; reason?: string } {
    if (!this.leagueId) return { ok: false, reason: "leagueId is required" };
    if (!this.credentials.accessToken) return { ok: false, reason: "accessToken is required" };
    if (!this.credentials.refreshToken) return { ok: false, reason: "refreshToken is required" };
    return { ok: true };
  }

  private async fetch<T>(path: string): Promise<T> {
    const url = `${YAHOO_API_BASE}${path}?format=json`;
    const { data, newTokens } = await yahooApiFetch<YahooApiWrapper<T>>(
      url,
      this.credentials.accessToken,
      this.credentials.refreshToken,
      this.credentials.expiresAt
    );

    if (newTokens) {
      this.credentials = {
        accessToken: newTokens.accessToken,
        refreshToken: newTokens.refreshToken,
        expiresAt: newTokens.expiresAt,
      };
      if (this.onTokenRefresh) {
        await this.onTokenRefresh(newTokens).catch(err =>
          console.warn("[YahooAdapter] Failed to persist refreshed token:", err)
        );
      }
    }

    return data.fantasy_content;
  }

  async fetchAndNormalize(leagueId: string, season: number): Promise<UniversalLeague> {
    const lId = leagueId || this.leagueId;
    const leagueKey = buildLeagueKey(lId, season);

    // Fetch league meta + settings + standings in one call
    const leagueData = await this.fetch<YahooLeagueResponse>(
      `/league/${leagueKey};out=settings,standings,scoreboard,transactions,draftresults`
    );

    const [meta, subresource] = leagueData.league;

    // Settings
    const scoringType = detectScoringType(meta.settings);
    const settings: UniversalSettings = {
      leagueId: lId,
      provider: "yahoo",
      season,
      leagueName: meta.name,
      teamCount: meta.num_teams,
      scoringType,
      playoffTeamCount: meta.settings?.playoff_num_teams ?? 4,
      regularSeasonWeeks: meta.end_week - (meta.settings ? 2 : 0),
      currentWeek: meta.current_week,
      isActive: meta.is_finished === 0,
      draftType: meta.settings?.draft_type,
      keeperCount: meta.settings?.num_keeper_slots,
    };

    // Teams from standings
    const teams = parseTeams(subresource.standings ?? subresource.teams);

    // Matchups from scoreboard (current week only in this call; we fetch all weeks below)
    const matchups = parseMatchups(subresource.scoreboard, season);

    // Transactions
    const transactions = parseTransactions(subresource.transactions, season);

    // Draft picks
    const draftPicks = parseDraftPicks(subresource.draftresults, season);

    // Fetch rosters for each team
    const rosters: UniversalRoster[] = [];
    for (const team of teams) {
      try {
        const teamKey = `${leagueKey}.t.${team.teamId}`;
        const rosterData = await this.fetch<{ team: YahooRosterResponse["team"] }>(
          `/team/${teamKey}/roster`
        );
        const [, rosterSubresource] = rosterData.team;
        const slots: UniversalRosterSlot[] = [];

        const playerCount = typeof rosterSubresource.roster.players.count === "number"
          ? rosterSubresource.roster.players.count
          : 0;

        for (let i = 0; i < playerCount; i++) {
          const pEntry = rosterSubresource.roster.players[i] as YahooRosterPlayer | undefined;
          if (!pEntry?.player) continue;

          const [playerMetaArr, posData] = pEntry.player;
          const playerInfo = playerMetaArr.reduce(
            (acc, item) => ({ ...acc, ...item }),
            {} as Record<string, string>
          );

          const selectedPos = posData?.selected_position?.[1]?.position ?? "BN";
          const isStarter = !["BN", "IR", "TAXI"].includes(selectedPos);

          const player: UniversalPlayer = {
            playerId: playerInfo.player_id ?? "",
            playerName: playerInfo.full_name ?? "",
            position: playerInfo.display_position ?? "",
            nflTeam: playerInfo.editorial_team_abbr ?? "FA",
            injuryStatus: playerInfo.status,
          };

          slots.push({
            player,
            slotType: selectedPos === "IR" ? "ir"
              : selectedPos === "TAXI" ? "taxi"
              : isStarter ? "starter"
              : "bench",
            lineupSlot: selectedPos,
          });
        }

        rosters.push({ teamId: team.teamId, season, slots });
      } catch (err) {
        console.warn(`[YahooAdapter] Failed to fetch roster for team ${team.teamId}:`, err);
      }
    }

    return { settings, teams, rosters, matchups, transactions, draftPicks };
  }

  async normalizeFromCache(_leagueId: string, _season: number): Promise<UniversalLeague | null> {
    // Yahoo adapter does not use the ESPN cache table.
    // Cache is handled at the providerRouter level via leagueConnections.dnaProfile.
    return null;
  }
}

// ─── Standalone helper: fetch league list for a Yahoo user ────────────────────

/**
 * Fetch all NFL fantasy leagues for the authenticated Yahoo user.
 * Returns a list of { leagueKey, leagueId, name, season, teamCount }.
 */
export async function getYahooLeaguesForUser(
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  season: number
): Promise<Array<{ leagueKey: string; leagueId: string; name: string; season: string; teamCount: number }>> {
  const gameKey = getGameKey(season);
  const url = `${YAHOO_API_BASE}/users;use_login=1/games;game_keys=${gameKey}/leagues?format=json`;

  const { data } = await yahooApiFetch<YahooApiWrapper<{
    users: {
      "0": {
        user: [
          unknown,
          {
            games: {
              count: number;
              "0": {
                game: [
                  unknown,
                  {
                    leagues: {
                      count: number;
                      [key: string]: {
                        league: [YahooLeagueMeta];
                      } | number;
                    };
                  }
                ];
              };
            };
          }
        ];
      };
    };
  }>>(url, accessToken, refreshToken, expiresAt);

  try {
    const user = data.fantasy_content.users["0"].user[1];
    const game = user.games["0"].game[1];
    const leaguesData = game.leagues;
    const count = typeof leaguesData.count === "number" ? leaguesData.count : 0;
    const leagues = [];

    for (let i = 0; i < count; i++) {
      const entry = leaguesData[i] as { league: [YahooLeagueMeta] } | undefined;
      if (!entry?.league) continue;
      const [meta] = entry.league;
      leagues.push({
        leagueKey: meta.league_key,
        leagueId: meta.league_id,
        name: meta.name,
        season: meta.season,
        teamCount: meta.num_teams,
      });
    }

    return leagues;
  } catch (err) {
    console.warn("[YahooAdapter] Failed to parse leagues response:", err);
    return [];
  }
}
