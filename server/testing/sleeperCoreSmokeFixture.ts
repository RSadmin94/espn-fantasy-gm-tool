import type { UniversalLeague } from "../providers/types";
import {
  SLEEPER_SMOKE_LEAGUE_ID,
  SLEEPER_SMOKE_SEASON,
  SLEEPER_SMOKE_USER_ID,
} from "./sleeperIntegrationFixtures";

export const SLEEPER_CORE_SMOKE_FIXTURE: UniversalLeague = {
  settings: {
    leagueId: SLEEPER_SMOKE_LEAGUE_ID,
    provider: "sleeper",
    season: SLEEPER_SMOKE_SEASON,
    leagueName: "Smoke Test League",
    teamCount: 2,
    scoringType: "ppr",
    playoffTeamCount: 2,
    regularSeasonWeeks: 14,
    currentWeek: 5,
    isActive: true,
    draftType: "snake",
  },
  teams: [
    {
      teamId: "1",
      ownerId: "owner_alpha",
      ownerName: "Alpha Owner",
      ownerNames: ["Alpha Owner"],
      teamName: "Team Alpha",
      abbreviation: "ALP",
      wins: 3,
      losses: 1,
      ties: 0,
      pointsFor: 420,
      pointsAgainst: 380,
      winPct: 0.75,
      standingRank: 1,
    },
    {
      teamId: "2",
      ownerId: "owner_beta",
      ownerName: "Beta Owner",
      ownerNames: ["Beta Owner"],
      teamName: "Team Beta",
      abbreviation: "BET",
      wins: 1,
      losses: 3,
      ties: 0,
      pointsFor: 380,
      pointsAgainst: 420,
      winPct: 0.25,
      standingRank: 2,
    },
  ],
  rosters: [],
  matchups: [
    {
      season: SLEEPER_SMOKE_SEASON,
      week: 1,
      homeTeamId: "1",
      awayTeamId: "2",
      homeScore: 110,
      awayScore: 95,
      winner: "home",
      isPlayoff: false,
    },
    {
      season: SLEEPER_SMOKE_SEASON,
      week: 2,
      homeTeamId: "2",
      awayTeamId: "1",
      homeScore: 88,
      awayScore: 102,
      winner: "away",
      isPlayoff: false,
    },
  ],
  transactions: [
    {
      transactionId: "tx1",
      season: SLEEPER_SMOKE_SEASON,
      type: "WAIVER",
      status: "EXECUTED",
      timestampMs: 1_700_000_000_000,
      teamId: "1",
      playerId: "101",
      playerName: "Player A",
      playerPosition: "QB",
      faabBid: 5,
    },
  ],
  draftPicks: [
    {
      season: SLEEPER_SMOKE_SEASON,
      round: 1,
      pickInRound: 1,
      overallPick: 1,
      teamId: "1",
      playerId: "101",
      playerName: "Player A",
      position: "QB",
    },
    {
      season: SLEEPER_SMOKE_SEASON,
      round: 1,
      pickInRound: 2,
      overallPick: 2,
      teamId: "2",
      playerId: "102",
      playerName: "Player B",
      position: "RB",
    },
  ],
};

export const SLEEPER_CORE_SMOKE_PRIOR_SEASON = 2095 as const;

export function buildSleeperCoreSmokePriorSeasonFixture(): UniversalLeague {
  return {
    ...SLEEPER_CORE_SMOKE_FIXTURE,
    settings: {
      ...SLEEPER_CORE_SMOKE_FIXTURE.settings,
      season: SLEEPER_CORE_SMOKE_PRIOR_SEASON,
    },
    teams: SLEEPER_CORE_SMOKE_FIXTURE.teams.map((team) => ({
      ...team,
    })),
    matchups: [],
    transactions: [],
    draftPicks: [],
    rosters: [],
  };
}

export function sleeperCoreSmokeCaller() {
  return {
    user: {
      id: SLEEPER_SMOKE_USER_ID,
      openId: `smoke_${SLEEPER_SMOKE_USER_ID}`,
      role: "user" as const,
      subscriptionStatus: "active" as const,
    },
    req: {} as never,
    res: {} as never,
  };
}
