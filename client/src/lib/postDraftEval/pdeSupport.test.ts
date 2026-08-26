import { describe, expect, it } from "vitest";
import { buildFormatProfile } from "@/lib/liveDraftGrade";
import {
  availableBoardPlayers,
  buildTakenBefore,
  evaluatePostDraft,
  isPlayerTaken,
  resolvePickDisplayIdentity,
  UNAVAILABLE_PLAYER_LABEL,
  type HistoricalPick,
  type RankedPlayer,
} from "./index";
import {
  capRecommendationConfidence,
  pdeSeasonPolicy,
  pdeLiveBoardForSeason,
  pdeLeagueOrderProxyRank,
} from "./historicalIntegrity";

const profile = buildFormatProfile({
  leagueId: "test",
  lineupReqs: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 0, DEF: 0, DP: 0 },
  softCap: { QB: 2, RB: 5, WR: 6, TE: 2 },
  hardCap: { QB: 3, RB: 6, WR: 7, TE: 2 },
  superflexSlots: 0,
});

function player(partial: Partial<RankedPlayer> & Pick<RankedPlayer, "name" | "position">): RankedPlayer {
  return {
    playerId: partial.playerId ?? null,
    fpId: partial.fpId ?? null,
    name: partial.name,
    position: partial.position,
    ecrRank: partial.ecrRank ?? null,
    adp: partial.adp ?? null,
    tier: partial.tier ?? null,
    projectedPoints: partial.projectedPoints ?? null,
    marketValue: partial.marketValue ?? null,
  };
}

function pick(
  partial: Omit<HistoricalPick, "roundPick" | "isKeeper"> & Partial<Pick<HistoricalPick, "roundPick" | "isKeeper">>,
): HistoricalPick {
  return {
    roundPick: partial.roundPick ?? 1,
    isKeeper: partial.isKeeper ?? false,
    ...partial,
  };
}

const board: RankedPlayer[] = [
  player({ playerId: 1, name: "Star WR", position: "WR", ecrRank: 8, adp: 8 }),
  player({ playerId: 2, name: "Star RB", position: "RB", ecrRank: 10, adp: 12 }),
  player({ playerId: 3, name: "Depth WR", position: "WR", ecrRank: 40, adp: 42 }),
  player({ playerId: 4, name: "Depth RB", position: "RB", ecrRank: 48, adp: 50 }),
];

function evalSeason(season: number, extra?: Partial<Parameters<typeof evaluatePostDraft>[0]>) {
  const policy = pdeSeasonPolicy(season);
  return evaluatePostDraft({
    leagueId: "t",
    season,
    userTeamId: 11,
    picks: [
      pick({ overallPick: 14, round: 1, teamId: 11, playerId: 1, playerName: "Star WR", position: "WR" }),
      pick({ overallPick: 19, round: 2, teamId: 11, playerId: 2, playerName: "Star RB", position: "RB" }),
      pick({ overallPick: 20, round: 2, teamId: 3, playerId: 3, playerName: "Depth WR", position: "WR" }),
    ],
    board,
    profile,
    rankingSource: extra?.rankingSource ?? (policy.rankingKind === "league_order" ? "historical_draft_order_proxy" : "espn_season_adp"),
    rankingSourceNote: "test",
    rankingEvidenceQuality:
      extra?.rankingEvidenceQuality ??
      (policy.rankingKind === "league_order" ? "league_order" : policy.rankingKind === "current_board" ? "current_cache" : "season_cache"),
    superflexStatus: "none",
    supportStatus: policy.support,
    recommendationCeiling: policy.recommendationCeiling,
    ...extra,
  });
}

describe("2018-2026 post-draft support gates", () => {
  it("does not generate grades or a redraft for 2017", () => {
    const evaled = evalSeason(2017);
    expect(evaled.picks).toEqual([]);
    expect(evaled.redraftPicks).toEqual([]);
    expect(evaled.overallLetter).toBe("—");
    expect(evaled.bestPick).toBeNull();
    expect(evaled.biggestMiss).toBeNull();
    expect(evaled.turningPoint).toBeNull();
  });

  it("evaluates 2018 as fully supported with a MEDIUM recommendation ceiling", () => {
    const evaled = evalSeason(2018);
    expect(evaled.picks.length).toBeGreaterThan(0);
    expect(evaled.redraftPicks.length).toBeGreaterThan(0);
    expect(evaled.overallConfidence).toBe("MEDIUM");
    expect(evaled.picks.every((p) => p.recommendationConfidence !== "HIGH")).toBe(true);
    expect(evaled.picks[0]?.availabilityConfidence).toBe("HIGH");
  });

  it("caps 2019 limited-support recommendation confidence at LOW", () => {
    const evaled = evalSeason(2019);
    expect(evaled.picks.length).toBeGreaterThan(0);
    expect(evaled.overallConfidence).toBe("LOW");
    expect(evaled.rankingTier).toBe("TIER_3_LEAGUE_ORDER");
    expect(evaled.picks.every((p) => p.recommendationConfidence === "LOW" || p.recommendationConfidence === "INSUFFICIENT")).toBe(true);
  });

  it("keeps HIGH availability from implying HIGH recommendation confidence", () => {
    expect(capRecommendationConfidence("HIGH", pdeSeasonPolicy(2018).recommendationCeiling)).toBe("MEDIUM");
    expect(capRecommendationConfidence("HIGH", pdeSeasonPolicy(2019).recommendationCeiling)).toBe("LOW");
    const evaled = evalSeason(2020);
    expect(evaled.picks[0]?.availabilityConfidence).toBe("HIGH");
    expect(evaled.overallConfidence).not.toBe("HIGH");
  });

  it("does not break availability on consecutive traded picks 19 and 20", () => {
    const picks = [
      pick({ overallPick: 19, round: 2, teamId: 11, playerId: 1, playerName: "Larry Fitzgerald", position: "WR" }),
      pick({ overallPick: 20, round: 2, teamId: 11, playerId: 2, playerName: "Devonta Freeman", position: "RB" }),
      pick({ overallPick: 21, round: 2, teamId: 4, playerId: 3, playerName: "Depth WR", position: "WR" }),
    ];
    const takenAt20 = buildTakenBefore(picks, 20);
    expect(isPlayerTaken({ playerId: 1, name: "Larry Fitzgerald", position: "WR" }, takenAt20)?.overallPick).toBe(19);
    expect(isPlayerTaken({ playerId: 2, name: "Devonta Freeman", position: "RB" }, takenAt20)).toBeNull();
    const available = availableBoardPlayers(board, takenAt20);
    expect(available.some((p) => p.name === "Larry Fitzgerald")).toBe(false);
    expect(available.some((p) => p.name === "Star RB")).toBe(true);
  });

  it("resolves a blank name from ESPN ID lookup without inventing one", () => {
    const resolved = resolvePickDisplayIdentity(
      { playerId: 13934, playerName: "", position: null },
      { name: "Le'Veon Bell", position: "RB", source: "registry" },
    );
    expect(resolved.name).toBe("Le'Veon Bell");
    expect(resolved.unresolved).toBe(false);
    const missing = resolvePickDisplayIdentity({ playerId: 9, playerName: "", position: "WR" });
    expect(missing.name).toBe(UNAVAILABLE_PLAYER_LABEL);
    expect(missing.unresolved).toBe(true);
  });

  it("does not grade a keeper but still counts the keeper on the roster", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2022,
      userTeamId: 11,
      picks: [
        pick({ overallPick: 1, round: 1, teamId: 11, playerId: 1, playerName: "Star WR", position: "WR", isKeeper: true }),
        pick({ overallPick: 14, round: 1, teamId: 11, playerId: 2, playerName: "Star RB", position: "RB" }),
      ],
      board,
      profile,
      rankingSource: "espn_season_adp",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "season_cache",
      superflexStatus: "none",
      supportStatus: "FULLY_SUPPORTED",
      recommendationCeiling: "MEDIUM",
    });
    expect(evaled.picks[0]?.isKeeper).toBe(true);
    expect(evaled.picks[0]?.decisionGrade).toBe("—");
    expect(evaled.picks[0]?.rivalsLabel).toMatch(/keeper/i);
    expect(evaled.picks[1]?.rosterBefore.some((r) => r.name === "Star WR")).toBe(true);
    expect(evaled.bestPick?.actualName).not.toBe("Star WR");
  });

  it("seeds a late-stored user keeper onto the roster before the first live pick", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2022,
      userTeamId: 11,
      picks: [
        pick({ overallPick: 14, round: 1, teamId: 11, playerId: 2, playerName: "Star RB", position: "RB" }),
        pick({ overallPick: 27, round: 2, teamId: 11, playerId: 1, playerName: "Star WR", position: "WR", isKeeper: true }),
      ],
      board,
      profile,
      rankingSource: "espn_season_adp",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "season_cache",
      superflexStatus: "none",
      supportStatus: "FULLY_SUPPORTED",
      recommendationCeiling: "MEDIUM",
    });
    expect(evaled.picks[0]?.rosterBefore.some((r) => r.name === "Star WR")).toBe(true);
    expect(evaled.picks.find((p) => p.isKeeper)?.rivalsLabel).toMatch(/keeper/i);
  });

  it("evaluates 2025 as fully supported with a MEDIUM ceiling", () => {
    const evaled = evalSeason(2025);
    expect(evaled.picks.length).toBeGreaterThan(0);
    expect(evaled.overallConfidence).toBe("MEDIUM");
    expect(evaled.rankingTier).toBe("TIER_2_SEASON_CACHE");
    expect(evaled.picks.every((p) => p.recommendationConfidence !== "HIGH")).toBe(true);
  });

  it("evaluates 2026 as fully supported with a MEDIUM recommendation ceiling", () => {
    const evaled = evalSeason(2026);
    expect(evaled.picks.length).toBeGreaterThan(0);
    expect(evaled.redraftPicks.length).toBeGreaterThan(0);
    expect(evaled.overallConfidence).toBe("MEDIUM");
    expect(evaled.picks.every((p) => p.recommendationConfidence !== "HIGH")).toBe(true);
  });

  it("does not award HIGH recommendation confidence for archived evidence under the 2018 ceiling", () => {
    const evaled = evalSeason(2018, { rankingEvidenceQuality: "archived" });
    expect(evaled.picks.every((p) => p.recommendationConfidence !== "HIGH")).toBe(true);
    expect(evaled.overallConfidence).not.toBe("HIGH");
  });

  it("clears a stale previous-season board when the season changes", () => {
    const stale = { season: 2018, overallLetter: "A" as const };
    expect(pdeLiveBoardForSeason(stale, 2017)).toBeNull();
    expect(pdeLiveBoardForSeason(stale, 2019)).toBeNull();
    expect(pdeLiveBoardForSeason(stale, 2018)?.overallLetter).toBe("A");
  });
});
