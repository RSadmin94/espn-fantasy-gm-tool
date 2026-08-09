import { describe, expect, it } from "vitest";
import {
  absMargin,
  computeMatchupMarginAnalytics,
  detectScoringPrecision,
  exactMarginBand,
  formatMatchupMarginAnswer,
  type MarginGameRecord,
} from "./matchupMarginAnalytics";
import {
  MATCHUP_MARGIN_TOOL_NAME,
  selectMatchupMarginTool,
  tryMatchupMarginToolAnswer,
} from "./matchupMarginTool";

function game(
  partial: Partial<MarginGameRecord> &
    Pick<
      MarginGameRecord,
      "season" | "homeScore" | "awayScore" | "homePersonId" | "awayPersonId" | "winnerPersonId"
    >,
): MarginGameRecord {
  return {
    week: 1,
    matchupPeriodId: 1,
    isPlayoff: false,
    homeTeamId: 1,
    awayTeamId: 2,
    homePersonName: partial.homePersonId === "id:bruce" ? "Bruce Edwards" : partial.homePersonId === "id:rod" ? "Rod Sellers" : "Home",
    awayPersonName: partial.awayPersonId === "id:bruce" ? "Bruce Edwards" : partial.awayPersonId === "id:rod" ? "Rod Sellers" : "Away",
    homeTeamName: "Home FC",
    awayTeamName: "Away FC",
    ...partial,
  };
}

const fixtures: MarginGameRecord[] = [
  // Bruce one-point losses (decimal band 0.50–1.49)
  game({
    season: 2011,
    homePersonId: "id:bruce",
    awayPersonId: "id:rod",
    homeScore: 100.0,
    awayScore: 100.8,
    winnerPersonId: "id:rod",
  }),
  game({
    season: 2015,
    week: 4,
    homePersonId: "id:rod",
    awayPersonId: "id:bruce",
    homeScore: 112.4,
    awayScore: 111.5,
    winnerPersonId: "id:rod",
  }),
  game({
    season: 2020,
    week: 8,
    homePersonId: "id:bruce",
    awayPersonId: "id:demetri",
    homePersonName: "Bruce Edwards",
    awayPersonName: "Demetri Clark",
    homeScore: 95.2,
    awayScore: 96.1,
    winnerPersonId: "id:demetri",
  }),
  // Margin 1.50 — outside one-point band
  game({
    season: 2021,
    week: 2,
    homePersonId: "id:bruce",
    awayPersonId: "id:rod",
    homeScore: 100,
    awayScore: 101.5,
    winnerPersonId: "id:rod",
  }),
  // Tie — must not count as a loss
  game({
    season: 2018,
    week: 6,
    homePersonId: "id:bruce",
    awayPersonId: "id:rod",
    homeScore: 110.5,
    awayScore: 110.5,
    winnerPersonId: null,
  }),
  // Playoff one-point loss for Bruce
  game({
    season: 2019,
    week: 15,
    isPlayoff: true,
    homePersonId: "id:bruce",
    awayPersonId: "id:rod",
    homeScore: 120.0,
    awayScore: 120.7,
    winnerPersonId: "id:rod",
  }),
  // Steve Hibbard alias target (same person id after identity)
  game({
    season: 2010,
    week: 3,
    homePersonId: "id:steve",
    awayPersonId: "id:rod",
    homePersonName: "Steve Hibbard",
    awayPersonName: "Rod Sellers",
    homeScore: 88.2,
    awayScore: 89.0,
    winnerPersonId: "id:rod",
  }),
  game({
    season: 2022,
    week: 5,
    homePersonId: "id:steve",
    awayPersonId: "id:bruce",
    homePersonName: "Steven Hibbard",
    awayPersonName: "Bruce Edwards",
    homeScore: 101.1,
    awayScore: 100.4,
    winnerPersonId: "id:steve",
  }),
];

describe("RFSN-049 matchup margin analytics", () => {
  it("detects decimal scoring precision", () => {
    expect(detectScoringPrecision([100, 101])).toBe("integer");
    expect(detectScoringPrecision([100.5, 101])).toBe("one_decimal");
    expect(detectScoringPrecision([100.25, 101.1])).toBe("two_decimals");
  });

  it("defines one-point band as 0.50–1.49 under decimal scoring", () => {
    const band = exactMarginBand(1, "two_decimals");
    expect(band.minInclusive).toBe(0.5);
    expect(band.maxInclusive).toBe(1.49);
    expect(band.definition).toContain("0.50");
    expect(band.definition).toContain("1.49");
  });

  it("uses exact 1.00 for integer scoring", () => {
    const band = exactMarginBand(1, "integer");
    expect(band.minInclusive).toBe(1);
    expect(band.maxInclusive).toBe(1);
  });

  it("counts exact one-point losses correctly and excludes ties", () => {
    const result = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "regular",
    });
    expect(result.noData).toBe(false);
    expect(result.scoringPrecision).not.toBe("integer");
    expect(result.appliedBand?.minInclusive).toBe(0.5);
    expect(result.ties).toBe(1);

    const bruce = result.byOwner.find((o) => o.personId === "id:bruce");
    // Games 1,2,3 + loss to Steve (0.7); excludes 1.50, tie, and playoff
    expect(bruce?.count).toBe(4);
    expect(result.byOwner[0].personId).toBe("id:bruce");

    // Tie must not create a loss for either side
    expect(absMargin(fixtures[4])).toBe(0);
  });

  it("handles decimal margins inside/outside the band", () => {
    const result = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "regular",
    });
    const answer = formatMatchupMarginAnswer(result);
    expect(answer).toContain("Bruce Edwards");
    expect(answer).toContain("has the most one-point losses:");
    expect(answer).toMatch(/calculated from .+ recorded league regular-season matchups/);
    expect(answer).toMatch(/one-point range of 0\.50–1\.49 because this league uses decimal scoring/i);
    expect(answer).not.toMatch(/every team likely/i);
  });

  it("filters playoffs when requested", () => {
    const regular = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "regular",
    });
    const playoffs = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "playoffs",
    });
    expect(regular.byOwner.find((o) => o.personId === "id:bruce")?.count).toBe(4);
    expect(playoffs.coverage.recordedGames).toBe(1);
    expect(playoffs.byOwner.find((o) => o.personId === "id:bruce")?.count).toBe(1);
  });

  it("filters by season range", () => {
    const result = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "regular",
      seasonFrom: 2020,
      seasonTo: 2020,
    });
    expect(result.coverage.recordedGames).toBe(1);
    expect(result.byOwner.find((o) => o.personId === "id:bruce")?.count).toBe(1);
  });

  it("resolves owner aliases to the same person id for counts", () => {
    // Both Steve / Steven rows share id:steve — one-point loss in 2010 + win in 2022
    const losses = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "regular",
    });
    const steve = losses.byOwner.find((o) => o.personId === "id:steve");
    expect(steve?.count).toBe(1);

    const wins = computeMatchupMarginAnalytics(fixtures, {
      metric: "wins_by_margin",
      marginExact: 1,
      phase: "regular",
      ownerPersonId: "id:steve",
    });
    // Filter still includes all games steve played; count his wins in band
    expect(wins.byOwner.find((o) => o.personId === "id:steve")?.count).toBe(1);
  });

  it("answers owner-scoped one-point loss counts for the named owner", () => {
    const result = computeMatchupMarginAnalytics(fixtures, {
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "regular",
      ownerName: "Bruce Edwards",
    });
    const answer = formatMatchupMarginAnswer(result);
    expect(answer).toMatch(/^Bruce Edwards has \d+ one-point losses/);
    expect(answer).not.toContain("has the most");
  });

  it("names the missing dataset when there is no matchup history", () => {
    const result = computeMatchupMarginAnalytics([], {
      metric: "losses_by_margin",
      marginExact: 1,
    });
    const answer = formatMatchupMarginAnswer(result);
    expect(result.noData).toBe(true);
    expect(answer).toContain("Missing dataset");
    expect(answer).toContain("gmMatchups");
    expect(answer).not.toMatch(/every team likely/i);
  });

  it("reports largest comeback as unsupported with exact missing dataset", () => {
    const result = computeMatchupMarginAnalytics(fixtures, {
      metric: "largest_comeback",
      phase: "regular",
    });
    expect(result.unsupported).toBe(true);
    const answer = formatMatchupMarginAnswer(result);
    expect(answer).toContain("in-game score timeline");
  });
});

describe("RFSN-049 League AI tool selection", () => {
  it("selects the deterministic matchup tool for one-point loss questions", () => {
    const sel = selectMatchupMarginTool("Who has the most one-point losses?");
    expect(sel).not.toBeNull();
    expect(sel!.toolName).toBe(MATCHUP_MARGIN_TOOL_NAME);
    expect(sel!.query.metric).toBe("losses_by_margin");
    expect(sel!.query.marginExact).toBe(1);
    expect(sel!.query.phase).toBe("regular");
  });

  it("does not select the tool for unrelated start/sit questions", () => {
    expect(selectMatchupMarginTool("Who should I start this week?")).toBeNull();
  });

  it("selects playoff phase when asked", () => {
    const sel = selectMatchupMarginTool("Most one-point losses in the playoffs?");
    expect(sel?.query.phase).toBe("playoffs");
  });

  it("selects season range when asked", () => {
    const sel = selectMatchupMarginTool("One-point losses from 2011-2020?");
    expect(sel?.query.seasonFrom).toBe(2011);
    expect(sel?.query.seasonTo).toBe(2020);
  });

  it("maps Preview-gate prompts to the right queries", () => {
    expect(selectMatchupMarginTool("Who has the most losses by three points or fewer?")?.query).toMatchObject({
      metric: "losses_by_margin",
      marginMax: 3,
    });
    expect(selectMatchupMarginTool("What was the closest game in league history?")?.query.metric).toBe(
      "closest_game",
    );
    expect(selectMatchupMarginTool("Who has the most narrow wins?")?.query).toMatchObject({
      metric: "wins_by_margin",
      marginExact: 1,
    });
    expect(selectMatchupMarginTool("Who has the most one-point playoff losses?")?.query).toMatchObject({
      metric: "losses_by_margin",
      marginExact: 1,
      phase: "playoffs",
    });
    const rod = selectMatchupMarginTool(
      "How many close losses did Rod have from 2018 through 2024?",
    );
    expect(rod?.query).toMatchObject({
      metric: "losses_by_margin",
      marginMax: 3,
      ownerName: "Rod",
      seasonFrom: 2018,
      seasonTo: 2024,
    });
    expect(selectMatchupMarginTool("What was the largest comeback?")?.query.metric).toBe(
      "largest_comeback",
    );
    expect(selectMatchupMarginTool("Who should I start this week at WR?")).toBeNull();
  });

  it("RFSN-052K: largest margin of victory is not one-point losses", () => {
    const shot = selectMatchupMarginTool(
      "who has the largest margin of victory in a single game",
    );
    expect(shot?.query).toMatchObject({
      metric: "largest_margin",
      aggregation: "single_game",
    });
    expect(shot?.query.marginExact).toBeUndefined();

    const board = selectMatchupMarginTool("Who has the largest margin of victory?");
    expect(board?.query).toMatchObject({
      metric: "largest_margin",
      aggregation: "owner_max",
    });

    const history = selectMatchupMarginTool(
      "What was the largest margin of victory in league history?",
    );
    expect(history?.query).toMatchObject({
      metric: "largest_margin",
      aggregation: "single_game",
    });

    const mine = selectMatchupMarginTool("What's my biggest win?", {
      resolvedOwnerNames: ["Christian Graham"],
    });
    expect(mine?.query).toMatchObject({
      metric: "largest_margin",
      aggregation: "single_game",
      personalAsk: true,
      ownerName: "Christian Graham",
    });

    const vs = selectMatchupMarginTool("What's Rod's biggest win over Bruce?");
    expect(vs?.query).toMatchObject({
      metric: "largest_margin",
      aggregation: "single_game",
      ownerName: "Rod",
      opponentName: "Bruce",
    });

    expect(selectMatchupMarginTool("biggest blowout")?.query.metric).toBe("largest_margin");
    expect(selectMatchupMarginTool("most dominant win")?.query.metric).toBe("largest_margin");
    expect(selectMatchupMarginTool("highest combined score")?.query.metric).toBe(
      "highest_combined_score",
    );
    expect(selectMatchupMarginTool("lowest winning score")?.query.metric).toBe(
      "lowest_winning_score",
    );
    expect(selectMatchupMarginTool("largest upset")?.query.metric).toBe("largest_upset");
    expect(selectMatchupMarginTool("biggest halftime deficit")?.query.metric).toBe(
      "largest_halftime_deficit",
    );

    expect(selectMatchupMarginTool("Who has the most blowout wins by 50+?")?.query).toMatchObject({
      metric: "wins_by_margin",
      marginMin: 50,
    });
    expect(selectMatchupMarginTool("Who has the most one-point losses?")?.query).toMatchObject({
      metric: "losses_by_margin",
      marginExact: 1,
    });
  });

  it("returns deterministic answer without generic fallback when data exists", async () => {
    const out = await tryMatchupMarginToolAnswer({
      leagueId: "457622",
      message: "Who has the most one-point losses?",
      games: fixtures,
    });
    expect(out?.toolName).toBe(MATCHUP_MARGIN_TOOL_NAME);
    expect(out?.answer).toContain("Bruce Edwards");
    expect(out?.answer).toMatch(/one-point losses/i);
    expect(out?.answer).toMatch(/decimal scoring/i);
    expect(out?.answer).not.toMatch(/I don't have the data/i);
    expect(out?.answer).not.toMatch(/every team likely/i);
  });
});
