/**
 * Sleeper Data Import v8 workbook → UniversalLeague adapter.
 */

import type {
  UniversalDraftPick,
  UniversalLeague,
  UniversalMatchup,
  UniversalRoster,
  UniversalRosterSlot,
  UniversalSettings,
  UniversalTeam,
  UniversalTransaction,
  TransactionType,
} from "../types";
import {
  excelSerialToMs,
  getSheet,
  headerIndexMap,
  parseNumber,
  parseWorkbookBytes,
  pickColumn,
  type ParsedSleeperWorkbook,
} from "./workbookParser";
import { validateSleeperWorkbookV8 } from "./workbookValidation";

export type SleeperWorkbookPreview = {
  valid: boolean;
  version: string;
  errors: string[];
  warnings: string[];
  leagueName: string;
  season: number;
  leagueId: string;
  teamCount: number;
  ownerCount: number;
  draftPickCount: number;
  matchupCount: number;
  transactionCount: number;
  rosterEntryCount: number;
};

type OwnerRecord = {
  userId: string;
  displayName: string;
  teamName: string;
  username: string;
};

type TeamRecord = {
  rosterId: string;
  ownerUsername: string;
  teamName: string;
};

function mapTxType(raw: string, action: string): TransactionType {
  const type = raw.trim().toLowerCase();
  if (type === "trade") return "TRADE";
  if (type === "waiver") return "WAIVER";
  if (type === "free_agent") return action.trim().toLowerCase() === "drop" ? "DROP" : "FREE_AGENT";
  return action.trim().toLowerCase() === "drop" ? "DROP" : "ADD";
}

function detectScoringType(recPoints: number): UniversalSettings["scoringType"] {
  if (recPoints >= 1) return "ppr";
  if (recPoints >= 0.5) return "half_ppr";
  return "standard";
}

function parseOwners(parsed: ParsedSleeperWorkbook): Map<string, OwnerRecord> {
  const users = getSheet(parsed, "Users");
  if (users.length < 2) return new Map();

  const header = headerIndexMap(users[0] ?? []);
  const displayIdx = pickColumn(header, ["display_name", "/display_name"]);
  const userIdIdx = pickColumn(header, ["user_id", "/user_id"]);
  const teamNameIdx = pickColumn(header, ["metadata_team_name", "/metadata/team_name"]);

  const byUsername = new Map<string, OwnerRecord>();
  for (const row of users.slice(1)) {
    const displayName = (displayIdx != null ? row[displayIdx] : row[1])?.trim() || "";
    const userId = (userIdIdx != null ? row[userIdIdx] : "")?.trim() || "";
    const teamName = (teamNameIdx != null ? row[teamNameIdx] : "")?.trim() || "";
    if (!displayName) continue;
    const record: OwnerRecord = {
      userId,
      displayName,
      teamName,
      username: displayName,
    };
    byUsername.set(displayName.toLowerCase(), record);
  }
  return byUsername;
}

function parseTeams(parsed: ParsedSleeperWorkbook, owners: Map<string, OwnerRecord>): {
  teams: TeamRecord[];
  byUsername: Map<string, TeamRecord>;
} {
  const summary = getSheet(parsed, "Roster Summary");
  const standings = getSheet(parsed, "Standings");
  const standingsHeader = headerIndexMap(standings[0] ?? []);
  const userIdx = pickColumn(standingsHeader, ["user"]);
  const winsIdx = pickColumn(standingsHeader, ["wins"]);
  const lossesIdx = pickColumn(standingsHeader, ["losses"]);
  const pfIdx = pickColumn(standingsHeader, ["total_points", "total points"]);

  const standingsByUser = new Map<string, { wins: number; losses: number; pf: number }>();
  for (const row of standings.slice(1)) {
    const user = (userIdx != null ? row[userIdx] : "")?.trim();
    if (!user) continue;
    standingsByUser.set(user.toLowerCase(), {
      wins: winsIdx != null ? parseNumber(row[winsIdx] ?? "0") : 0,
      losses: lossesIdx != null ? parseNumber(row[lossesIdx] ?? "0") : 0,
      pf: pfIdx != null ? parseNumber(row[pfIdx] ?? "0") : 0,
    });
  }

  const teams: TeamRecord[] = [];
  const byUsername = new Map<string, TeamRecord>();
  for (const row of summary.slice(1)) {
    const rosterId = String(row[0] ?? "").trim();
    const ownerUsername = String(row[1] ?? "").trim();
    const teamName = String(row[2] ?? "").trim();
    if (!rosterId || !ownerUsername) continue;
    const team: TeamRecord = { rosterId, ownerUsername, teamName };
    teams.push(team);
    byUsername.set(ownerUsername.toLowerCase(), team);
    if (!standingsByUser.has(ownerUsername.toLowerCase())) {
      standingsByUser.set(ownerUsername.toLowerCase(), { wins: 0, losses: 0, pf: 0 });
    }
    void owners.get(ownerUsername.toLowerCase());
  }

  return { teams, byUsername };
}

function parseLeagueSettings(parsed: ParsedSleeperWorkbook): {
  leagueId: string;
  leagueName: string;
  teamCount: number;
  playoffTeamCount: number;
  regularSeasonWeeks: number;
  currentWeek: number;
  scoringType: UniversalSettings["scoringType"];
  isActive: boolean;
  draftType?: string;
} {
  const season = parsed.info.year;
  const leagues = getSheet(parsed, "Leagues");
  const header = headerIndexMap(leagues[0] ?? []);
  const seasonIdx = pickColumn(header, ["season"]);
  const leagueIdIdx = pickColumn(header, ["league_id", "league id"]);
  const nameIdx = pickColumn(header, ["name"]);
  const totalRostersIdx = pickColumn(header, ["total_rosters", "total rosters"]);
  const playoffTeamsIdx = pickColumn(header, ["settings_playoff_teams", "settings playoff teams"]);
  const playoffWeekIdx = pickColumn(header, ["settings_playoff_week_start", "settings playoff week start"]);
  const legIdx = pickColumn(header, ["settings_leg", "settings leg"]);
  const statusIdx = pickColumn(header, ["status"]);
  const recIdx = pickColumn(header, ["scoring_settings_rec", "scoring settings rec"]);
  const draftTypeIdx = pickColumn(header, ["settings_type", "type"]);

  let leagueRow = leagues[1] ?? [];
  const settings = getSheet(parsed, "Settings");
  const settingsHeader = headerIndexMap(settings[0] ?? []);
  const settingsNameIdx = pickColumn(settingsHeader, ["name", "/name"]);
  const settingsNameRaw = settingsNameIdx != null ? String(settings[1]?.[settingsNameIdx] ?? "").trim() : "";

  const seasonMatches: string[][] = [];
  for (const row of leagues.slice(1)) {
    const rowSeason = seasonIdx != null ? Number(row[seasonIdx]) : 0;
    if (rowSeason === season) seasonMatches.push(row);
  }

  if (seasonMatches.length === 1) {
    leagueRow = seasonMatches[0]!;
  } else if (seasonMatches.length > 1 && settingsNameRaw && nameIdx != null) {
    const named = seasonMatches.filter((row) => String(row[nameIdx] ?? "").trim() === settingsNameRaw);
    leagueRow = named[0] ?? seasonMatches[0]!;
  } else if (seasonMatches.length > 0) {
    leagueRow = seasonMatches[0]!;
  }

  const settingsTeamsIdx = pickColumn(settingsHeader, ["settings_num_teams", "/settings/num_teams"]);
  const settingsPlayoffIdx = pickColumn(settingsHeader, ["settings_playoff_teams", "/settings/playoff_teams"]);

  const leagueId = (leagueIdIdx != null ? leagueRow[leagueIdIdx] : "")?.trim() || `workbook_${season}`;
  const leagueName =
    (settingsNameRaw || (nameIdx != null ? leagueRow[nameIdx] : "") || parsed.info.leagueLabel || "Sleeper Workbook League")
      .toString()
      .replace(/\s*\(\d{4}\)\s*$/, "")
      .trim();

  const rosterSummaryCount = Math.max(0, getSheet(parsed, "Roster Summary").length - 1);
  const teamCount =
    rosterSummaryCount ||
    (settingsTeamsIdx != null ? parseNumber(settings[1]?.[settingsTeamsIdx] ?? "0") : 0) ||
    (totalRostersIdx != null ? parseNumber(leagueRow[totalRostersIdx] ?? "0") : 0);

  const playoffTeamCount =
    (settingsPlayoffIdx != null ? parseNumber(settings[1]?.[settingsPlayoffIdx] ?? "0") : 0) ||
    (playoffTeamsIdx != null ? parseNumber(leagueRow[playoffTeamsIdx] ?? "0") : 0) ||
    4;

  const playoffWeekStart =
    playoffWeekIdx != null ? parseNumber(leagueRow[playoffWeekIdx] ?? "0") : 15;
  const regularSeasonWeeks = playoffWeekStart > 1 ? playoffWeekStart - 1 : 14;
  const currentWeek =
    parsed.info.throughWeek ||
    (legIdx != null ? parseNumber(leagueRow[legIdx] ?? "0") : 0) ||
    1;

  const status = (statusIdx != null ? leagueRow[statusIdx] : "in_season")?.toString() || "in_season";
  const recPoints = recIdx != null ? parseNumber(leagueRow[recIdx] ?? "0") : 1;

  return {
    leagueId,
    leagueName,
    teamCount,
    playoffTeamCount,
    regularSeasonWeeks,
    currentWeek,
    scoringType: detectScoringType(recPoints),
    isActive: status !== "complete",
    draftType: draftTypeIdx != null ? String(leagueRow[draftTypeIdx] ?? "") : undefined,
  };
}

function buildUniversalTeams(
  parsed: ParsedSleeperWorkbook,
  owners: Map<string, OwnerRecord>,
  teamRecords: TeamRecord[],
): UniversalTeam[] {
  const standings = getSheet(parsed, "Standings");
  const header = headerIndexMap(standings[0] ?? []);
  const userIdx = pickColumn(header, ["user"]);
  const winsIdx = pickColumn(header, ["wins"]);
  const lossesIdx = pickColumn(header, ["losses"]);
  const tiesIdx = pickColumn(header, ["ties"]);
  const pfIdx = pickColumn(header, ["total_points", "total points"]);
  const paIdx = pickColumn(header, ["vs_league_w", "vs league w"]);

  const stats = new Map<string, { wins: number; losses: number; ties: number; pf: number; pa: number }>();
  for (const row of standings.slice(1)) {
    const user = (userIdx != null ? row[userIdx] : "")?.trim().toLowerCase();
    if (!user) continue;
    stats.set(user, {
      wins: winsIdx != null ? parseNumber(row[winsIdx] ?? "0") : 0,
      losses: lossesIdx != null ? parseNumber(row[lossesIdx] ?? "0") : 0,
      ties: tiesIdx != null ? parseNumber(row[tiesIdx] ?? "0") : 0,
      pf: pfIdx != null ? parseNumber(row[pfIdx] ?? "0") : 0,
      pa: paIdx != null ? parseNumber(row[paIdx] ?? "0") : 0,
    });
  }

  const teams: UniversalTeam[] = teamRecords.map((team, index) => {
    const owner = owners.get(team.ownerUsername.toLowerCase());
    const standing = stats.get(team.ownerUsername.toLowerCase()) ?? {
      wins: 0,
      losses: 0,
      ties: 0,
      pf: 0,
      pa: 0,
    };
    const ownerName = owner?.displayName || team.ownerUsername;
    const teamName = team.teamName || owner?.teamName || ownerName;
    const games = standing.wins + standing.losses + standing.ties;
    const winPct = games > 0 ? standing.wins / games : 0;
    const abbrev = teamName
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase()
      .padEnd(4, "X")
      .slice(0, 4);

    return {
      teamId: team.rosterId,
      ownerId: owner?.userId || undefined,
      ownerName,
      ownerNames: [ownerName],
      teamName,
      abbreviation: abbrev,
      wins: standing.wins,
      losses: standing.losses,
      ties: standing.ties,
      pointsFor: standing.pf,
      pointsAgainst: standing.pa,
      winPct,
      standingRank: index + 1,
    };
  });

  teams.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
  teams.forEach((team, idx) => {
    team.standingRank = idx + 1;
  });

  return teams;
}

function buildMatchups(
  parsed: ParsedSleeperWorkbook,
  teamsByUsername: Map<string, TeamRecord>,
  playoffWeekStart: number,
): UniversalMatchup[] {
  const weekly = getSheet(parsed, "Weekly Results");
  if (weekly.length < 2) return [];

  const header = headerIndexMap(weekly[0] ?? []);
  const weekIdx = pickColumn(header, ["week"]);
  const userIdx = pickColumn(header, ["user"]);
  const scoreIdx = pickColumn(header, ["team_score", "team score"]);
  const oppIdx = pickColumn(header, ["opponent"]);
  const oppScoreIdx = pickColumn(header, ["opp_score", "opp score"]);
  const resultIdx = pickColumn(header, ["result"]);

  const season = parsed.info.year;
  const seen = new Set<string>();
  const matchups: UniversalMatchup[] = [];

  for (const row of weekly.slice(1)) {
    const week = weekIdx != null ? parseNumber(row[weekIdx] ?? "0") : 0;
    const user = (userIdx != null ? row[userIdx] : "")?.trim();
    const opponent = (oppIdx != null ? row[oppIdx] : "")?.trim();
    if (!week || !user || !opponent) continue;

    const homeTeam = teamsByUsername.get(user.toLowerCase());
    const awayTeam = teamsByUsername.get(opponent.toLowerCase());
    if (!homeTeam || !awayTeam) continue;

    const pairKey = `${week}:${[homeTeam.rosterId, awayTeam.rosterId].sort().join("-")}`;
    if (seen.has(pairKey)) continue;
    seen.add(pairKey);

    const homeScore = scoreIdx != null ? parseNumber(row[scoreIdx] ?? "0") : undefined;
    const awayScore = oppScoreIdx != null ? parseNumber(row[oppScoreIdx] ?? "0") : undefined;
    const result = (resultIdx != null ? row[resultIdx] : "")?.trim().toUpperCase();

    let winner: UniversalMatchup["winner"] = "undecided";
    if (result === "W") winner = "home";
    else if (result === "L") winner = "away";
    else if (result === "T") winner = "tie";
    else if (homeScore != null && awayScore != null) {
      if (homeScore > awayScore) winner = "home";
      else if (awayScore > homeScore) winner = "away";
      else winner = "tie";
    }

    matchups.push({
      season,
      week,
      homeTeamId: homeTeam.rosterId,
      awayTeamId: awayTeam.rosterId,
      homeScore,
      awayScore,
      winner,
      isPlayoff: week >= playoffWeekStart,
    });
  }

  return matchups;
}

function buildRosters(parsed: ParsedSleeperWorkbook): UniversalRoster[] {
  const rostersSheet = getSheet(parsed, "Rosters");
  if (rostersSheet.length < 2) return [];

  const header = headerIndexMap(rostersSheet[0] ?? []);
  const rosterIdx = pickColumn(header, ["roster_id", "roster id"]);
  const slotIdx = pickColumn(header, ["roster_slot", "roster slot"]);
  const starterIdx = pickColumn(header, ["starter_slot", "starter slot"]);
  const playerIdIdx = pickColumn(header, ["player_id", "player id"]);
  const playerIdx = pickColumn(header, ["player"]);
  const positionIdx = pickColumn(header, ["position"]);
  const nflIdx = pickColumn(header, ["nfl_team", "nfl team"]);

  const season = parsed.info.year;
  const grouped = new Map<string, UniversalRosterSlot[]>();

  for (const row of rostersSheet.slice(1)) {
    const teamId = (rosterIdx != null ? row[rosterIdx] : row[0])?.trim();
    const playerId = (playerIdIdx != null ? row[playerIdIdx] : "")?.trim();
    const playerName = (playerIdx != null ? row[playerIdx] : "")?.trim();
    if (!teamId || !playerId) continue;

    const rosterSlot = (slotIdx != null ? row[slotIdx] : "")?.trim().toLowerCase();
    const starterSlot = (starterIdx != null ? row[starterIdx] : "")?.trim();
    const slotType: UniversalRosterSlot["slotType"] =
      rosterSlot.includes("reserve") || rosterSlot === "ir"
        ? "ir"
        : rosterSlot.includes("taxi")
          ? "taxi"
          : starterSlot
            ? "starter"
            : "bench";

    const slot: UniversalRosterSlot = {
      player: {
        playerId,
        playerName: playerName || playerId,
        position: (positionIdx != null ? row[positionIdx] : "?")?.trim() || "?",
        nflTeam: (nflIdx != null ? row[nflIdx] : "FA")?.trim() || "FA",
      },
      slotType,
      lineupSlot: starterSlot || (slotType === "starter" ? "FLEX" : "BN"),
    };

    if (!grouped.has(teamId)) grouped.set(teamId, []);
    grouped.get(teamId)!.push(slot);
  }

  return [...grouped.entries()].map(([teamId, slots]) => ({
    teamId,
    season,
    slots,
  }));
}

function buildDraftPicks(
  parsed: ParsedSleeperWorkbook,
  teamsByUsername: Map<string, TeamRecord>,
): UniversalDraftPick[] {
  const draft = getSheet(parsed, "Draft Result");
  if (draft.length < 2) return [];

  const header = headerIndexMap(draft[0] ?? []);
  const roundIdx = pickColumn(header, ["round"]);
  const overallIdx = pickColumn(header, ["overall_pick", "overall pick"]);
  const playerIdx = pickColumn(header, ["player"]);
  const positionIdx = pickColumn(header, ["position"]);
  const nflIdx = pickColumn(header, ["nfl_team", "nfl team"]);
  const draftedByIdx = pickColumn(header, ["drafted_by", "drafted by"]);
  const keeperIdx = pickColumn(header, ["keeper"]);

  const season = parsed.info.year;
  const teamCount = Math.max(teamsByUsername.size, 1);
  const picks: UniversalDraftPick[] = [];

  for (const row of draft.slice(1)) {
    const overallPick = overallIdx != null ? parseNumber(row[overallIdx] ?? "0") : 0;
    const round = roundIdx != null ? parseNumber(row[roundIdx] ?? "0") : 0;
    const draftedBy = (draftedByIdx != null ? row[draftedByIdx] : "")?.trim();
    const team = draftedBy ? teamsByUsername.get(draftedBy.toLowerCase()) : undefined;
    if (!overallPick || !team) continue;

    picks.push({
      season,
      round,
      pickInRound: ((overallPick - 1) % teamCount) + 1,
      overallPick,
      teamId: team.rosterId,
      playerName: (playerIdx != null ? row[playerIdx] : "")?.trim() || undefined,
      position: (positionIdx != null ? row[positionIdx] : "")?.trim() || undefined,
      nflTeam: (nflIdx != null ? row[nflIdx] : "")?.trim() || undefined,
      isKeeper: keeperIdx != null ? Boolean(String(row[keeperIdx] ?? "").trim()) : false,
    });
  }

  return picks;
}

function buildTransactions(
  parsed: ParsedSleeperWorkbook,
  teamsByUsername: Map<string, TeamRecord>,
): UniversalTransaction[] {
  const txSheet = getSheet(parsed, "Transactions");
  if (txSheet.length < 2) return [];

  const header = headerIndexMap(txSheet[0] ?? []);
  const weekIdx = pickColumn(header, ["week"]);
  const txIdIdx = pickColumn(header, ["transaction_id", "transaction id"]);
  const typeIdx = pickColumn(header, ["type"]);
  const dateIdx = pickColumn(header, ["date"]);
  const userIdx = pickColumn(header, ["user"]);
  const actionIdx = pickColumn(header, ["action"]);
  const playerIdx = pickColumn(header, ["player"]);
  const positionIdx = pickColumn(header, ["position"]);
  const bidIdx = pickColumn(header, ["waiver_bid", "waiver bid"]);

  const season = parsed.info.year;
  const transactions: UniversalTransaction[] = [];

  for (const row of txSheet.slice(1)) {
    const txId = (txIdIdx != null ? row[txIdIdx] : "")?.trim();
    const user = (userIdx != null ? row[userIdx] : "")?.trim();
    const action = (actionIdx != null ? row[actionIdx] : "")?.trim();
    const playerName = (playerIdx != null ? row[playerIdx] : "")?.trim();
    if (!txId || !user) continue;

    const team = teamsByUsername.get(user.toLowerCase());
    if (!team) continue;

    const type = mapTxType(typeIdx != null ? row[typeIdx] ?? "" : "", action);
    const timestampMs = dateIdx != null ? excelSerialToMs(row[dateIdx] ?? "") : Date.now();
    const faabBid = bidIdx != null ? parseNumber(row[bidIdx] ?? "0") : undefined;

    transactions.push({
      transactionId: `${txId}:${action}:${playerName || "unknown"}`,
      season,
      type,
      status: "EXECUTED",
      timestampMs,
      teamId: team.rosterId,
      playerName: playerName || undefined,
      playerPosition: positionIdx != null ? row[positionIdx]?.trim() : undefined,
      faabBid: faabBid && faabBid > 0 ? faabBid : undefined,
    });
  }

  return transactions;
}

export function mapSleeperWorkbookV8ToUniversalLeague(parsed: ParsedSleeperWorkbook): UniversalLeague {
  const owners = parseOwners(parsed);
  const { teams: teamRecords, byUsername } = parseTeams(parsed, owners);
  const leagueMeta = parseLeagueSettings(parsed);

  const settings: UniversalSettings = {
    leagueId: leagueMeta.leagueId,
    provider: "sleeper_workbook",
    season: parsed.info.year,
    leagueName: leagueMeta.leagueName,
    teamCount: teamRecords.length || leagueMeta.teamCount,
    scoringType: leagueMeta.scoringType,
    playoffTeamCount: leagueMeta.playoffTeamCount,
    regularSeasonWeeks: leagueMeta.regularSeasonWeeks,
    currentWeek: leagueMeta.currentWeek,
    isActive: leagueMeta.isActive,
    draftType: leagueMeta.draftType,
  };

  const teams = buildUniversalTeams(parsed, owners, teamRecords);
  const matchups = buildMatchups(parsed, byUsername, leagueMeta.regularSeasonWeeks + 1);
  const rosters = buildRosters(parsed);
  const draftPicks = buildDraftPicks(parsed, byUsername);
  const transactions = buildTransactions(parsed, byUsername);

  return {
    settings,
    teams,
    rosters,
    matchups,
    transactions,
    draftPicks,
  };
}

export function previewSleeperWorkbook(buffer: Buffer): SleeperWorkbookPreview {
  const parsed = parseWorkbookBytes(buffer);
  const validation = validateSleeperWorkbookV8(parsed);

  if (!validation.valid) {
    return {
      valid: false,
      version: parsed.version,
      errors: validation.errors,
      warnings: validation.warnings,
      leagueName: "",
      season: parsed.info.year,
      leagueId: "",
      teamCount: 0,
      ownerCount: 0,
      draftPickCount: 0,
      matchupCount: 0,
      transactionCount: 0,
      rosterEntryCount: 0,
    };
  }

  const league = mapSleeperWorkbookV8ToUniversalLeague(parsed);
  const ownerCount = new Set(league.teams.map((t) => t.ownerId).filter(Boolean)).size;
  const rosterEntryCount = league.rosters.reduce((sum, r) => sum + r.slots.length, 0);

  return {
    valid: true,
    version: parsed.version,
    errors: [],
    warnings: validation.warnings,
    leagueName: league.settings.leagueName,
    season: league.settings.season,
    leagueId: league.settings.leagueId,
    teamCount: league.teams.length,
    ownerCount,
    draftPickCount: league.draftPicks.length,
    matchupCount: league.matchups.length,
    transactionCount: league.transactions.length,
    rosterEntryCount,
  };
}

export function importSleeperWorkbookFromBuffer(buffer: Buffer): {
  parsed: ParsedSleeperWorkbook;
  validation: ReturnType<typeof validateSleeperWorkbookV8>;
  league: UniversalLeague;
} {
  const parsed = parseWorkbookBytes(buffer);
  const validation = validateSleeperWorkbookV8(parsed);
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }
  const league = mapSleeperWorkbookV8ToUniversalLeague(parsed);
  return { parsed, validation, league };
}

export function loadSleeperWorkbookFromBuffer(buffer: Buffer): ParsedSleeperWorkbook {
  return parseWorkbookBytes(buffer);
}
