/**
 * Canonical synthetic identifiers for Sleeper integration / smoke tests.
 *
 * Naming today is mixed (`sleeper_*_test`, `*_sleeper`, `sleeper_smoke_*`, etc.).
 * Recommended standard for new fixtures:
 *   - leagueId: `sleeper_test_<area>` or `sleeper_smoke_<scenario>`
 *   - season: 2094–2099 (intentionally far-future; avoids real leagues)
 *   - userId: 99_0xx test band (99001–99199)
 */

export const SLEEPER_SMOKE_LEAGUE_ID = "sleeper_smoke_core" as const;
export const SLEEPER_SMOKE_SEASON = 2096 as const;
export const SLEEPER_SMOKE_USER_ID = 99_003 as const;

export const SLEEPER_INTEGRATION_SCOPES = [
  "coreSmoke",
  "import",
  "connect",
  "chain",
  "ownerResolution",
  "cachedSeasons",
  "draftPicks",
  "rivalry",
  "architecture",
  "universalPersistence",
  "workbook",
] as const;

export type SleeperIntegrationScope = (typeof SLEEPER_INTEGRATION_SCOPES)[number];

export type SleeperIntegrationFixture = {
  leagueIds: readonly string[];
  userIds: readonly number[];
  seasons: readonly number[];
};

/** Every synthetic league id used by Sleeper integration / smoke tests. */
export const ALL_SLEEPER_TEST_LEAGUE_IDS = [
  SLEEPER_SMOKE_LEAGUE_ID,
  "sleeper_import_test",
  "sleeper_connect_test",
  "sleeper_connect_other",
  "sleeper_chain_curr",
  "owner_res_league_a",
  "owner_res_league_b",
  "season_disc_espn",
  "season_disc_sleeper",
  "season_disc_other",
  "draft_picks_espn",
  "draft_picks_sleeper",
  "draft_picks_other",
  "rivalry_espn_test",
  "rivalry_sleeper_test",
  "rivalry_other_test",
  "arch_test_457622",
  "univpersisttest01",
  "workbook_test_league",
] as const;

/** Test user ids that may own synthetic league connections. */
export const ALL_SLEEPER_TEST_USER_IDS = [
  99_001,
  99_002,
  99_003,
  99_004,
  99_010,
  99_011,
  99_012,
  99_020,
  99_021,
  99_022,
  99_030,
  99_031,
  99_032,
  99_101,
  99_102,
] as const;

/** Far-future seasons reserved for Sleeper integration fixtures. */
export const SLEEPER_SYNTHETIC_SEASONS = [2094, 2095, 2096, 2097, 2098, 2099] as const;

export const SLEEPER_INTEGRATION_FIXTURES: Record<SleeperIntegrationScope, SleeperIntegrationFixture> = {
  coreSmoke: {
    leagueIds: [SLEEPER_SMOKE_LEAGUE_ID],
    userIds: [SLEEPER_SMOKE_USER_ID, 99_004],
    seasons: [SLEEPER_SMOKE_SEASON],
  },
  import: {
    leagueIds: ["sleeper_import_test"],
    userIds: [99_001],
    seasons: [2098],
  },
  connect: {
    leagueIds: ["sleeper_connect_test", "sleeper_connect_other"],
    userIds: [99_002],
    seasons: [2097],
  },
  chain: {
    leagueIds: ["sleeper_chain_curr"],
    userIds: [99_003],
    seasons: [2094, 2095, 2096, 2097, 2098],
  },
  ownerResolution: {
    leagueIds: ["owner_res_league_a", "owner_res_league_b"],
    userIds: [99_010],
    seasons: [2022, 2023],
  },
  cachedSeasons: {
    leagueIds: ["season_disc_espn", "season_disc_sleeper", "season_disc_other"],
    userIds: [99_010, 99_011, 99_012],
    seasons: [2023, 2024, 2095, 2096],
  },
  draftPicks: {
    leagueIds: ["draft_picks_espn", "draft_picks_sleeper", "draft_picks_other"],
    userIds: [99_020, 99_021, 99_022],
    seasons: [2024, 2096],
  },
  rivalry: {
    leagueIds: ["rivalry_espn_test", "rivalry_sleeper_test", "rivalry_other_test"],
    userIds: [99_030, 99_031, 99_032],
    seasons: [2024, 2095, 2096],
  },
  architecture: {
    leagueIds: ["arch_test_457622"],
    userIds: [99_101, 99_102],
    seasons: [2096],
  },
  universalPersistence: {
    leagueIds: ["univpersisttest01"],
    userIds: [],
    seasons: [2099],
  },
  workbook: {
    leagueIds: ["workbook_test_league"],
    userIds: [99_020],
    seasons: [2025],
  },
};

export function fixturesForScope(scope: SleeperIntegrationScope): SleeperIntegrationFixture {
  return SLEEPER_INTEGRATION_FIXTURES[scope];
}

export function allFixturesForScopes(scopes: readonly SleeperIntegrationScope[]): SleeperIntegrationFixture {
  const leagueIds = new Set<string>();
  const userIds = new Set<number>();
  const seasons = new Set<number>();
  for (const scope of scopes) {
    const fixture = fixturesForScope(scope);
    for (const id of fixture.leagueIds) leagueIds.add(id);
    for (const id of fixture.userIds) userIds.add(id);
    for (const season of fixture.seasons) seasons.add(season);
  }
  return {
    leagueIds: [...leagueIds],
    userIds: [...userIds],
    seasons: [...seasons],
  };
}
