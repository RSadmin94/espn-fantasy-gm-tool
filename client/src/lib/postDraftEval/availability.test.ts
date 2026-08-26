import { describe, expect, it } from "vitest";
import { buildFormatProfile } from "@/lib/liveDraftGrade";
import {
  EVALUATOR_VERSION,
  addPlayerIdentityKeys,
  evaluatePostDraft,
  leagueKeeperPicks,
  playerAvailabilityAtPick,
  pdeSeasonPolicy,
  type HistoricalPick,
  type RankedPlayer,
} from "./index";

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

const archived = {
  rankingSource: "fantasypros_current" as const,
  rankingSourceNote: "archived test board",
  rankingEvidenceQuality: "archived" as const,
  superflexStatus: "none" as const,
};

function evalUser(args: {
  season: number;
  picks: HistoricalPick[];
  board: RankedPlayer[];
  extra?: Partial<Parameters<typeof evaluatePostDraft>[0]>;
}) {
  const policy = pdeSeasonPolicy(args.season);
  return evaluatePostDraft({
    leagueId: "t",
    season: args.season,
    userTeamId: 11,
    picks: args.picks,
    board: args.board,
    profile,
    rankingSource: args.extra?.rankingSource ?? (policy.rankingKind === "league_order" ? "historical_draft_order_proxy" : "espn_season_adp"),
    rankingSourceNote: args.extra?.rankingSourceNote ?? "test",
    rankingEvidenceQuality:
      args.extra?.rankingEvidenceQuality ??
      (policy.rankingKind === "league_order" ? "league_order" : policy.rankingKind === "current_board" ? "current_cache" : "season_cache"),
    superflexStatus: "none",
    supportStatus: policy.support,
    recommendationCeiling: policy.recommendationCeiling,
    ...args.extra,
  });
}

describe("getAvailablePlayersAtPick", () => {
  it("A — opponent keeper stored at pick 20 is unavailable to the user at pick 5", () => {
    const historicalDraft = [
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
      pick({ overallPick: 20, round: 2, teamId: 8, playerId: 99, playerName: "Nico Collins", position: "WR", isKeeper: true }),
    ];
    const status = playerAvailabilityAtPick({
      player: { playerId: 99, name: "Nico Collins", position: "WR" },
      overallPick: 5,
      historicalDraft,
      userTeamId: 11,
    });
    expect(status.reason).toBe("KEEPER");
    expect(status.available).toBe(false);
    expect(status.historicalOverallPick).toBe(20);
    const board = [
      player({ playerId: 99, name: "Nico Collins", position: "WR", ecrRank: 1, adp: 1 }),
      player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
      player({ playerId: 11, name: "Backup WR", position: "WR", ecrRank: 40, adp: 40 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 11,
      picks: historicalDraft,
      board,
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.rivals?.name).not.toBe("Nico Collins");
    expect(evaled.redraftPicks.some((p) => p.player.name === "Nico Collins")).toBe(false);
    expect(evaled.picks[0]?.availableTop.some((p) => p.name === "Nico Collins")).toBe(false);
  });

  it("B — non-keeper historically drafted at 20 is available to the user at pick 5", () => {
    const historicalDraft = [
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
      pick({ overallPick: 20, round: 2, teamId: 8, playerId: 99, playerName: "Later Star", position: "WR" }),
    ];
    const status = playerAvailabilityAtPick({
      player: { playerId: 99, name: "Later Star", position: "WR" },
      overallPick: 5,
      historicalDraft,
      userTeamId: 11,
    });
    expect(status.reason).toBe("AVAILABLE");
    expect(status.historicalOverallPick).toBe(20);
    const board = [
      player({ playerId: 99, name: "Later Star", position: "WR", ecrRank: 1, adp: 1 }),
      player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 11,
      picks: historicalDraft,
      board,
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.rivals?.name).toBe("Later Star");
  });

  it("C — non-keeper historically drafted at 4 is unavailable at pick 5", () => {
    const historicalDraft = [
      pick({ overallPick: 4, round: 1, teamId: 8, playerId: 2, playerName: "Already Gone", position: "RB" }),
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
    ];
    const status = playerAvailabilityAtPick({
      player: { playerId: 2, name: "Already Gone", position: "RB" },
      overallPick: 5,
      historicalDraft,
      userTeamId: 11,
    });
    expect(status.reason).toBe("ALREADY_DRAFTED");
    expect(status.available).toBe(false);
    const board = [
      player({ playerId: 2, name: "Already Gone", position: "RB", ecrRank: 1, adp: 1 }),
      player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
      player({ playerId: 11, name: "Backup WR", position: "WR", ecrRank: 20, adp: 20 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 11,
      picks: historicalDraft,
      board,
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.rivals?.name).not.toBe("Already Gone");
    expect(evaled.picks[0]?.availableTop.some((p) => p.name === "Already Gone")).toBe(false);
  });

  it("D — Rivals cannot select the same player at a later user slot", () => {
    const picks = [
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
      pick({ overallPick: 16, round: 2, teamId: 11, playerId: 12, playerName: "Okay WR", position: "WR" }),
    ];
    const board = [
      player({ playerId: 99, name: "Elite WR", position: "WR", ecrRank: 1, adp: 1 }),
      player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
      player({ playerId: 12, name: "Okay WR", position: "WR", ecrRank: 40, adp: 40 }),
      player({ playerId: 13, name: "Next RB", position: "RB", ecrRank: 22, adp: 22 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 11,
      picks,
      board,
      profile,
      ...archived,
    });
    expect(evaled.redraftPicks[0]?.player.name).toBe("Elite WR");
    expect(evaled.redraftPicks[1]?.player.name).not.toBe("Elite WR");
    expect(new Set(evaled.redraftPicks.map((p) => p.player.name)).size).toBe(evaled.redraftPicks.length);
    const second = playerAvailabilityAtPick({
      player: { playerId: 99, name: "Elite WR", position: "WR" },
      overallPick: 16,
      historicalDraft: picks,
      userTeamId: 11,
      rivalsRosterKeys: (() => {
        const keys = new Set<string>();
        addPlayerIdentityKeys(keys, { playerId: 99, name: "Elite WR", position: "WR" });
        return keys;
      })(),
    });
    expect(second.reason).toBe("ALREADY_ON_RIVALS_ROSTER");
  });

  it("E — user keeper starts on the reconstructed roster and is never redrafted", () => {
    const picks = [
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
      pick({ overallPick: 27, round: 2, teamId: 11, playerId: 5, playerName: "Trey McBride", position: "TE", isKeeper: true }),
    ];
    const board = [
      player({ playerId: 5, name: "Trey McBride", position: "TE", ecrRank: 4, adp: 4 }),
      player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
      player({ playerId: 11, name: "Elite WR", position: "WR", ecrRank: 3, adp: 3 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 11,
      picks,
      board,
      profile,
      ...archived,
    });
    expect(evaled.picks.find((p) => p.overallPick === 5)?.rosterBefore.some((r) => r.name === "Trey McBride")).toBe(true);
    expect(evaled.picks.find((p) => p.overallPick === 5)?.openNeedsBefore).not.toContain("TE");
    expect(evaled.picks.find((p) => p.isKeeper)?.decisionGrade).toBe("—");
    expect(evaled.picks.find((p) => p.overallPick === 5)?.rivals?.name).not.toBe("Trey McBride");
    expect(evaled.redraftPicks.filter((p) => p.player.name === "Trey McBride")).toHaveLength(1);
    expect(evaled.redraftPicks.find((p) => p.player.name === "Trey McBride")?.isKeeper).toBe(true);
    expect(evaled.starterRows.some((row) => row.redraft?.name === "Trey McBride") || evaled.benchRedraft.some((p) => p.name === "Trey McBride")).toBe(true);
  });

  it("F — DB keeper true / raw keeper false is unavailable from the beginning", () => {
    const historicalDraft = [
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
      pick({ overallPick: 12, round: 1, teamId: 28, playerId: 4258173, playerName: "Nico Collins", position: "WR", isKeeper: true }),
    ];
    expect(leagueKeeperPicks(historicalDraft).map((p) => p.playerName)).toEqual(["Nico Collins"]);
    const atPick1 = playerAvailabilityAtPick({
      player: { playerId: 4258173, name: "Nico Collins", position: "WR" },
      overallPick: 1,
      historicalDraft,
      userTeamId: 11,
    });
    expect(atPick1.reason).toBe("KEEPER");
    expect(atPick1.available).toBe(false);
  });

  it("G — consecutive user picks reconstruct independently in overall-pick order", () => {
    const picks = [
      pick({ overallPick: 19, round: 2, teamId: 11, playerId: 1, playerName: "Larry Fitzgerald", position: "WR" }),
      pick({ overallPick: 20, round: 2, teamId: 11, playerId: 2, playerName: "Devonta Freeman", position: "RB" }),
      pick({ overallPick: 21, round: 2, teamId: 4, playerId: 3, playerName: "Depth WR", position: "WR" }),
    ];
    const board = [
      player({ playerId: 8, name: "Elite QB", position: "QB", ecrRank: 2, adp: 2 }),
      player({ playerId: 9, name: "Star RB", position: "RB", ecrRank: 10, adp: 10 }),
      player({ playerId: 1, name: "Larry Fitzgerald", position: "WR", ecrRank: 40, adp: 40 }),
      player({ playerId: 2, name: "Devonta Freeman", position: "RB", ecrRank: 50, adp: 50 }),
      player({ playerId: 3, name: "Depth WR", position: "WR", ecrRank: 60, adp: 60 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2018,
      userTeamId: 11,
      picks,
      board,
      profile,
      rankingSource: "espn_season_adp",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
      superflexStatus: "none",
      supportStatus: "FULLY_SUPPORTED",
      recommendationCeiling: "MEDIUM",
    });
    expect(evaled.picks).toHaveLength(2);
    expect(evaled.redraftPicks[0]?.player.name).not.toBe(evaled.redraftPicks[1]?.player.name);
    expect(new Set(evaled.redraftPicks.map((p) => p.player.name)).size).toBe(2);
    const first = evaled.redraftPicks[0]!.player;
    const keys = new Set<string>();
    addPlayerIdentityKeys(keys, { playerId: first.playerId, name: first.name, position: first.position });
    const secondPool = playerAvailabilityAtPick({
      player: { playerId: first.playerId, name: first.name, position: first.position },
      overallPick: 20,
      historicalDraft: picks,
      userTeamId: 11,
      rivalsRosterKeys: keys,
    });
    expect(secondPool.reason).toBe("ALREADY_ON_RIVALS_ROSTER");
  });

  it("H — replaced original user selection is not reused as a duplicate", () => {
    const picks = [
      pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
      pick({ overallPick: 16, round: 2, teamId: 11, playerId: 12, playerName: "Okay WR", position: "WR" }),
      pick({ overallPick: 17, round: 2, teamId: 8, playerId: 14, playerName: "Other WR", position: "WR" }),
    ];
    const frozen = JSON.parse(JSON.stringify(picks)) as HistoricalPick[];
    const board = [
      player({ playerId: 99, name: "Elite WR", position: "WR", ecrRank: 1, adp: 1 }),
      player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
      player({ playerId: 12, name: "Okay WR", position: "WR", ecrRank: 40, adp: 40 }),
      player({ playerId: 13, name: "Next RB", position: "RB", ecrRank: 22, adp: 22 }),
      player({ playerId: 14, name: "Other WR", position: "WR", ecrRank: 30, adp: 30 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 11,
      picks,
      board,
      profile,
      ...archived,
    });
    expect(evaled.redraftPicks[0]?.sameAsOriginal).toBe(false);
    expect(evaled.redraftPicks[0]?.player.name).toBe("Elite WR");
    const names = evaled.redraftPicks.map((p) => p.player.name);
    expect(new Set(names).size).toBe(names.length);
    expect(picks).toEqual(frozen);
    const released = playerAvailabilityAtPick({
      player: { playerId: 10, name: "Solid RB", position: "RB" },
      overallPick: 16,
      historicalDraft: picks,
      userTeamId: 11,
    });
    expect(released.reason).toBe("AVAILABLE");
  });

  it("I — 2018 no-keeper regression still uses overall-pick availability", () => {
    const evaled = evalUser({
      season: 2018,
      picks: [
        pick({ overallPick: 4, round: 1, teamId: 3, playerId: 4, playerName: "Early RB", position: "RB" }),
        pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
        pick({ overallPick: 20, round: 2, teamId: 8, playerId: 99, playerName: "Later WR", position: "WR" }),
      ],
      board: [
        player({ playerId: 4, name: "Early RB", position: "RB", ecrRank: 1, adp: 1 }),
        player({ playerId: 99, name: "Later WR", position: "WR", ecrRank: 2, adp: 2 }),
        player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
      ],
      extra: { rankingEvidenceQuality: "archived", recommendationCeiling: "MEDIUM" },
    });
    expect(evaled.picks[0]?.rivals?.name).not.toBe("Early RB");
    expect(evaled.picks[0]?.rivals?.name).toBe("Later WR");
    expect(evaled.picks.every((p) => !p.isKeeper)).toBe(true);
  });

  it("J — 2022+ keeper regression removes opponent keepers before reconstruction", () => {
    const evaled = evalUser({
      season: 2022,
      picks: [
        pick({ overallPick: 5, round: 1, teamId: 11, playerId: 10, playerName: "Solid RB", position: "RB" }),
        pick({ overallPick: 20, round: 2, teamId: 8, playerId: 99, playerName: "Kept Star", position: "WR", isKeeper: true }),
        pick({ overallPick: 27, round: 3, teamId: 11, playerId: 5, playerName: "User TE", position: "TE", isKeeper: true }),
      ],
      board: [
        player({ playerId: 99, name: "Kept Star", position: "WR", ecrRank: 1, adp: 1 }),
        player({ playerId: 5, name: "User TE", position: "TE", ecrRank: 12, adp: 12 }),
        player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
        player({ playerId: 11, name: "Backup WR", position: "WR", ecrRank: 22, adp: 22 }),
      ],
      extra: { rankingEvidenceQuality: "archived" },
    });
    expect(evaled.picks.find((p) => p.isKeeper && p.actual.name === "User TE")?.decisionGrade).toBe("—");
    expect(evaled.redraftPicks.some((p) => p.player.name === "Kept Star")).toBe(false);
    expect(evaled.picks.find((p) => p.overallPick === 5)?.rivals?.name).not.toBe("Kept Star");
    expect(evaled.picks.find((p) => p.overallPick === 5)?.rosterBefore.some((r) => r.name === "User TE")).toBe(true);
  });
});

describe("season availability regressions 2018-2026", () => {
  it("still evaluates supported seasons and keeps 2018 consecutive 19/20 sequential", () => {
    expect(EVALUATOR_VERSION).toBe("post-draft-eval-04");
    for (const season of [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) {
      const evaled = evalUser({
        season,
        picks: [
          pick({ overallPick: 14, round: 1, teamId: 11, playerId: 1, playerName: "Star WR", position: "WR" }),
          pick({ overallPick: 19, round: 2, teamId: 11, playerId: 2, playerName: "Star RB", position: "RB" }),
          pick({ overallPick: 20, round: 2, teamId: 3, playerId: 3, playerName: "Depth WR", position: "WR" }),
        ],
        board: [
          player({ playerId: 1, name: "Star WR", position: "WR", ecrRank: 8, adp: 8 }),
          player({ playerId: 2, name: "Star RB", position: "RB", ecrRank: 10, adp: 12 }),
          player({ playerId: 3, name: "Depth WR", position: "WR", ecrRank: 40, adp: 42 }),
        ],
      });
      expect(evaled.picks.length, String(season)).toBeGreaterThan(0);
      expect(evaled.redraftPicks.length, String(season)).toBeGreaterThan(0);
      expect(new Set(evaled.redraftPicks.map((p) => p.player.name)).size).toBe(evaled.redraftPicks.length);
    }
  });
});
