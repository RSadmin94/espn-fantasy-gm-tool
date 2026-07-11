import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  fetchSleeperLeagueSnapshot,
  __setSleeperApiFetchForTests,
  __clearSleeperPlayerCacheForTests,
  type SleeperApiFetch,
} from "./sleeperAdapter";

const LEAGUE_ID = "sleeper_mock_league";

function mockFetch(routes: Record<string, unknown>): SleeperApiFetch {
  return async <T>(path: string): Promise<T> => {
    if (Object.prototype.hasOwnProperty.call(routes, path)) {
      return routes[path] as T;
    }
    throw new Error(`Unmocked Sleeper path: ${path}`);
  };
}

function baseRoutes(overrides?: {
  lastScoredLeg?: number;
  nflLeg?: number;
  leagueStatus?: string;
}): Record<string, unknown> {
  const lastScoredLeg = overrides?.lastScoredLeg ?? 14;
  const nflLeg = overrides?.nflLeg ?? 5;
  const leagueStatus = overrides?.leagueStatus ?? "in_season";

  const routes: Record<string, unknown> = {
    [`/league/${LEAGUE_ID}`]: {
      league_id: LEAGUE_ID,
      name: "Mock Sleeper League",
      season: "2025",
      status: leagueStatus,
      total_rosters: 2,
      settings: {
        playoff_teams: 2,
        playoff_week_start: 15,
        leg: nflLeg,
        last_scored_leg: lastScoredLeg,
      },
      scoring_settings: { rec: 1 },
      roster_positions: ["QB", "RB", "WR", "TE", "FLEX", "BN"],
    },
    [`/league/${LEAGUE_ID}/users`]: [
      { user_id: "user_a", username: "alpha", display_name: "Alpha Owner" },
      { user_id: "user_b", username: "beta", display_name: "Beta Owner" },
    ],
    [`/league/${LEAGUE_ID}/rosters`]: [
      {
        roster_id: 1,
        owner_id: "user_a",
        league_id: LEAGUE_ID,
        players: ["p1", "p2"],
        starters: ["p1"],
        reserve: [],
        settings: { wins: 2, losses: 0, ties: 0, fpts: 200, fpts_decimal: 50, fpts_against: 180, fpts_against_decimal: 0 },
      },
      {
        roster_id: 2,
        owner_id: "user_b",
        league_id: LEAGUE_ID,
        players: ["p3"],
        starters: ["p3"],
        reserve: [],
        settings: { wins: 0, losses: 2, ties: 0, fpts: 150, fpts_decimal: 0, fpts_against: 200, fpts_against_decimal: 50 },
      },
    ],
    "/state/nfl": {
      week: nflLeg,
      season: "2025",
      season_type: "regular",
      leg: nflLeg,
      display_week: nflLeg,
    },
    "/players/nfl": {
      p1: { full_name: "Patrick Mahomes", position: "QB", team: "KC" },
      p2: { full_name: "Travis Kelce", position: "TE", team: "KC" },
      p3: { full_name: "Justin Jefferson", position: "WR", team: "MIN" },
      p4: { full_name: "Draft Pick Player", position: "RB", team: "DAL" },
    },
    [`/league/${LEAGUE_ID}/drafts`]: [
      { draft_id: "draft_abc", type: "snake", season: "2025", status: "complete" },
    ],
    "/draft/draft_abc/picks": [
      {
        player_id: "p4",
        pick_no: 1,
        round: 1,
        draft_slot: 1,
        roster_id: 1,
        is_keeper: false,
      },
      {
        player_id: "p3",
        pick_no: 2,
        round: 1,
        draft_slot: 2,
        roster_id: 2,
        is_keeper: true,
      },
    ],
    [`/league/${LEAGUE_ID}/transactions/1`]: [
      {
        transaction_id: "trade_1",
        type: "trade",
        status: "complete",
        created: 1_700_000_000_000,
        status_updated: 1_700_000_000_000,
        leg: 1,
        roster_ids: [1, 2],
        adds: { p2: 2, p3: 1 },
        drops: { p2: 1, p3: 2 },
      },
      {
        transaction_id: "waiver_1",
        type: "waiver",
        status: "complete",
        created: 1_700_000_100_000,
        status_updated: 1_700_000_100_000,
        leg: 1,
        roster_ids: [1],
        adds: { p1: 1 },
        drops: null,
        settings: { waiver_bid: 7 },
      },
    ],
  };

  for (let w = 1; w <= lastScoredLeg; w++) {
    routes[`/league/${LEAGUE_ID}/matchups/${w}`] =
      w === 1
        ? [
            { roster_id: 1, matchup_id: 1, points: 110, starters: ["p1"], players: ["p1", "p2"] },
            { roster_id: 2, matchup_id: 1, points: 95, starters: ["p3"], players: ["p3"] },
          ]
        : w === 14
          ? [
              { roster_id: 1, matchup_id: 14, points: 120, starters: ["p1"], players: ["p1"] },
              { roster_id: 2, matchup_id: 14, points: 100, starters: ["p3"], players: ["p3"] },
            ]
          : [];
    routes[`/league/${LEAGUE_ID}/transactions/${w}`] =
      w === 1 ? (routes[`/league/${LEAGUE_ID}/transactions/1`] as unknown[]) : [];
  }

  return routes;
}

describe("sleeperAdapter", () => {
  beforeEach(() => {
    __clearSleeperPlayerCacheForTests();
  });

  afterEach(() => {
    __setSleeperApiFetchForTests(null);
    __clearSleeperPlayerCacheForTests();
  });

  it("maps Sleeper user_id to team ownerId", async () => {
    __setSleeperApiFetchForTests(mockFetch(baseRoutes()));
    const { league } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    expect(league.teams.find((t) => t.teamId === "1")?.ownerId).toBe("user_a");
    expect(league.teams.find((t) => t.teamId === "2")?.ownerId).toBe("user_b");
  });

  it("maps roster_id to teamId", async () => {
    __setSleeperApiFetchForTests(mockFetch(baseRoutes()));
    const { league } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    expect(league.teams.map((t) => t.teamId).sort()).toEqual(["1", "2"]);
    expect(league.rosters.map((r) => r.teamId).sort()).toEqual(["1", "2"]);
  });

  it("enriches player names and positions from the NFL catalog", async () => {
    __setSleeperApiFetchForTests(mockFetch(baseRoutes()));
    const { league } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    const roster1 = league.rosters.find((r) => r.teamId === "1");
    const mahomes = roster1?.slots.find((s) => s.player.playerId === "p1");
    expect(mahomes?.player.playerName).toBe("Patrick Mahomes");
    expect(mahomes?.player.position).toBe("QB");

    const tradeLeg = league.transactions.find((t) => t.type === "TRADE" && t.playerId === "p2");
    expect(tradeLeg?.playerName).toBe("Travis Kelce");
    expect(tradeLeg?.playerPosition).toBe("TE");
  });

  it("returns draft picks from the season draft", async () => {
    __setSleeperApiFetchForTests(mockFetch(baseRoutes()));
    const { league } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    expect(league.draftPicks).toHaveLength(2);
    expect(league.draftPicks[0]).toMatchObject({
      overallPick: 1,
      round: 1,
      teamId: "1",
      playerName: "Draft Pick Player",
      position: "RB",
    });
    expect(league.draftPicks[1]?.isKeeper).toBe(true);
    expect(league.settings.draftType).toBe("snake");
  });

  it("fetches matchups through last_scored_leg, not only current NFL week", async () => {
    __setSleeperApiFetchForTests(mockFetch(baseRoutes({ nflLeg: 5, lastScoredLeg: 14 })));
    const { league } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    expect(league.matchups.some((m) => m.week === 1)).toBe(true);
    expect(league.matchups.some((m) => m.week === 14)).toBe(true);
    expect(league.matchups.length).toBeGreaterThanOrEqual(2);
  });

  it("uses shared transactionId for multi-leg trades", async () => {
    __setSleeperApiFetchForTests(mockFetch(baseRoutes()));
    const { league } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    const tradeLegs = league.transactions.filter((t) => t.transactionId === "trade_1");
    expect(tradeLegs.length).toBe(2);
  });

  it("warns when a roster has no owner_id", async () => {
    const routes = baseRoutes();
    (routes[`/league/${LEAGUE_ID}/rosters`] as unknown[])[1] = {
      ...(routes[`/league/${LEAGUE_ID}/rosters`] as unknown[])[1] as object,
      owner_id: null,
    };
    __setSleeperApiFetchForTests(mockFetch(routes));
    const { warnings } = await fetchSleeperLeagueSnapshot(LEAGUE_ID);
    expect(warnings.some((w) => w.includes("roster 2"))).toBe(true);
  });
});
