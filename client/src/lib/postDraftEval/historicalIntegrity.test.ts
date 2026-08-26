import { describe, expect, it } from "vitest";
import {
  classifySeasonIntegrity,
  continuousRanges,
  rankingTierFromStoredEvidence,
  pdeSeasonPolicy,
  pdeMayEvaluate,
  resolvePdeSeason,
  pdeLiveBoardForSeason,
  pdeLeagueOrderProxyRank,
  type SeasonIntegrityInput,
} from "./historicalIntegrity";

const BASE: SeasonIntegrityInput = {
  season: 2026,
  pickCount: 196,
  expectedPicks: 196,
  duplicateOverall: 0,
  missingOverallCount: 0,
  distinctTeamIdsInPicks: 14,
  zeroTeamIdPicks: 0,
  userPickCount: 14,
  userTeamPresentInTeamsTable: true,
  leagueName: "ATLANTAS FINEST FF",
  expectedLeagueName: "ATLANTAS FINEST FF",
  foreignLeagueEvidence: false,
  playerIdCoveragePct: 100,
  namedCoveragePct: 100,
  identifiablePct: 100,
  snakeOk: true,
  settingsSource: "STORED",
  superflex: "NO",
  keeperFieldExists: true,
  keeperCount: 14,
  rankingTier: "TIER_2",
};

describe("historical season integrity classifier", () => {
  it("valid recap is FULLY SUPPORTED", () => {
    const result = classifySeasonIntegrity(BASE);
    expect(result.status).toBe("FULLY_SUPPORTED");
    expect(result.completeness).toBe("PASS");
    expect(result.teamIdentity).toBe("PASS");
    expect(result.draftOrder).toBe("PASS");
    expect(result.availability).toBe("HIGH");
    expect(result.recommendationCeiling).toBe("MEDIUM");
  });

  it("missing team IDs are UNSUPPORTED", () => {
    const result = classifySeasonIntegrity({
      ...BASE,
      season: 2010,
      pickCount: 160,
      expectedPicks: 160,
      distinctTeamIdsInPicks: 1,
      zeroTeamIdPicks: 160,
      userPickCount: 0,
      playerIdCoveragePct: 0,
      namedCoveragePct: 100,
      identifiablePct: 100,
      snakeOk: false,
      settingsSource: "UNKNOWN",
      superflex: "UNKNOWN",
      keeperCount: 0,
      rankingTier: "TIER_4",
    });
    expect(result.teamIdentity).toBe("FAIL");
    expect(result.status).toBe("UNSUPPORTED");
    expect(result.availability).toBe("IMPOSSIBLE");
  });

  it("missing player IDs but reliable name identity still reconstructs availability", () => {
    const result = classifySeasonIntegrity({
      ...BASE,
      playerIdCoveragePct: 0,
      namedCoveragePct: 100,
      identifiablePct: 100,
      rankingTier: "TIER_3",
    });
    expect(result.playerIdentity).toBe("WARN");
    expect(result.status).not.toBe("UNSUPPORTED");
    expect(["HIGH", "MEDIUM"]).toContain(result.availability);
  });

  it("duplicate overall picks fail draft order", () => {
    const result = classifySeasonIntegrity({ ...BASE, duplicateOverall: 4 });
    expect(result.completeness).toBe("FAIL");
    expect(result.draftOrder).toBe("FAIL");
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("incomplete draft is UNSUPPORTED", () => {
    const result = classifySeasonIntegrity({
      ...BASE,
      pickCount: 80,
      expectedPicks: 196,
      missingOverallCount: 116,
    });
    expect(result.completeness).toBe("FAIL");
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("selected user has no picks", () => {
    const result = classifySeasonIntegrity({ ...BASE, userPickCount: 0 });
    expect(result.teamIdentity).toBe("FAIL");
    expect(result.rosterReconstruction).toBe("FAIL");
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("foreign team identities fail", () => {
    const result = classifySeasonIntegrity({
      ...BASE,
      leagueName: "SOME OTHER LEAGUE",
      foreignLeagueEvidence: true,
    });
    expect(result.teamIdentity).toBe("FAIL");
    expect(result.status).toBe("UNSUPPORTED");
  });

  it("inferred settings cannot be FULLY SUPPORTED", () => {
    const result = classifySeasonIntegrity({ ...BASE, settingsSource: "INFERRED" });
    expect(result.status).toBe("LIMITED_SUPPORT");
  });

  it("unknown Superflex lowers the recommendation ceiling", () => {
    const result = classifySeasonIntegrity({ ...BASE, superflex: "UNKNOWN", rankingTier: "TIER_2" });
    expect(result.recommendationCeiling).toBe("LOW");
  });

  it("ranking Tier 1, 2, and 3 map to distinct ceilings", () => {
    expect(classifySeasonIntegrity({ ...BASE, rankingTier: "TIER_1" }).recommendationCeiling).toBe("HIGH");
    expect(classifySeasonIntegrity({ ...BASE, rankingTier: "TIER_2" }).recommendationCeiling).toBe("MEDIUM");
    expect(classifySeasonIntegrity({ ...BASE, rankingTier: "TIER_3" }).recommendationCeiling).toBe("LOW");
    expect(classifySeasonIntegrity({ ...BASE, rankingTier: "TIER_3" }).status).toBe("LIMITED_SUPPORT");
  });

  it("rankingTierFromStoredEvidence distinguishes contemporaneous vs season vs order-only", () => {
    expect(rankingTierFromStoredEvidence({ contemporaneousSnapshot: true, correctSeasonRanking: true, draftOrderTrustworthy: true })).toBe("TIER_1");
    expect(rankingTierFromStoredEvidence({ contemporaneousSnapshot: false, correctSeasonRanking: true, draftOrderTrustworthy: true })).toBe("TIER_2");
    expect(rankingTierFromStoredEvidence({ contemporaneousSnapshot: false, correctSeasonRanking: false, draftOrderTrustworthy: true })).toBe("TIER_3");
    expect(rankingTierFromStoredEvidence({ contemporaneousSnapshot: false, correctSeasonRanking: false, draftOrderTrustworthy: false })).toBe("TIER_4");
  });

  it("FULLY SUPPORTED vs LIMITED SUPPORT vs UNSUPPORTED vs NO DATA", () => {
    expect(classifySeasonIntegrity(BASE).status).toBe("FULLY_SUPPORTED");
    expect(classifySeasonIntegrity({ ...BASE, rankingTier: "TIER_3" }).status).toBe("LIMITED_SUPPORT");
    expect(classifySeasonIntegrity({ ...BASE, zeroTeamIdPicks: 196, distinctTeamIdsInPicks: 1, userPickCount: 0 }).status).toBe("UNSUPPORTED");
    expect(classifySeasonIntegrity({ ...BASE, pickCount: 0, userPickCount: 0 }).status).toBe("NO_DATA");
  });

  it("keeper/trade snake mismatches do not drop a complete ID recap from HIGH availability", () => {
    const result = classifySeasonIntegrity({ ...BASE, snakeOk: false });
    expect(result.draftOrder).toBe("PASS");
    expect(result.availability).toBe("HIGH");
    expect(result.status).toBe("FULLY_SUPPORTED");
  });

  it("continuousRanges prefers a contiguous run", () => {
    const seasons = [
      { season: 2016, status: "UNSUPPORTED" as const },
      { season: 2017, status: "UNSUPPORTED" as const },
      { season: 2018, status: "LIMITED_SUPPORT" as const },
      { season: 2019, status: "FULLY_SUPPORTED" as const },
      { season: 2020, status: "FULLY_SUPPORTED" as const },
    ];
    expect(continuousRanges(seasons, ["FULLY_SUPPORTED"])).toEqual([{ start: 2019, end: 2020 }]);
    expect(continuousRanges(seasons, ["FULLY_SUPPORTED", "LIMITED_SUPPORT"])).toEqual([{ start: 2018, end: 2020 }]);
  });
});

describe("verified Post-Draft Evaluation season policy", () => {
  it("marks 2017 unsupported and 2018 fully supported", () => {
    expect(pdeSeasonPolicy(2017).support).toBe("UNSUPPORTED");
    expect(pdeMayEvaluate(pdeSeasonPolicy(2017).support)).toBe(false);
    expect(pdeSeasonPolicy(2018)).toMatchObject({
      support: "FULLY_SUPPORTED",
      rankingTier: "TIER_2",
      rankingKind: "espn_season_adp",
      recommendationCeiling: "MEDIUM",
      availabilityConfidence: "HIGH",
    });
  });

  it("keeps 2019 limited and treats 2025 like other ESPN season-rank years", () => {
    expect(pdeSeasonPolicy(2019).support).toBe("LIMITED_SUPPORT");
    expect(pdeSeasonPolicy(2019).recommendationCeiling).toBe("LOW");
    expect(pdeSeasonPolicy(2019).rankingKind).toBe("league_order");
    expect(pdeSeasonPolicy(2025)).toMatchObject({
      support: "FULLY_SUPPORTED",
      rankingTier: "TIER_2",
      rankingKind: "espn_season_adp",
      recommendationCeiling: "MEDIUM",
      limitedRankingDisclosure: false,
    });
    expect(pdeSeasonPolicy(2020).support).toBe("FULLY_SUPPORTED");
    expect(pdeSeasonPolicy(2026).rankingKind).toBe("current_board");
  });

  it("preserves a requested Draft History season instead of snapping to the newest year", () => {
    expect(resolvePdeSeason(2022, [2026, 2025, 2022, 2018, 2017])).toBe(2022);
    expect(resolvePdeSeason(2017, [2026, 2017])).toBe(2017);
  });

  it("assigns overall-pick proxy ranks only for league-order seasons", () => {
    expect(pdeLeagueOrderProxyRank("league_order", 19)).toEqual({ ecrRank: 19, adp: 19 });
    expect(pdeLeagueOrderProxyRank("espn_season_adp", 19)).toEqual({ ecrRank: null, adp: null });
    expect(pdeLeagueOrderProxyRank("current_board", 1)).toEqual({ ecrRank: null, adp: null });
  });

  it("drops a stale board when switching from a supported season to an unsupported season", () => {
    expect(pdeLiveBoardForSeason({ season: 2018, picks: [14] }, 2017)).toBeNull();
    expect(pdeLiveBoardForSeason({ season: 2018, picks: [14] }, 2018)?.picks).toEqual([14]);
  });
});
