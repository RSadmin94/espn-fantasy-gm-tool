import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildFormatProfile } from "@/lib/liveDraftGrade";
import { emptyCounts } from "@/lib/liveDraftGrade/rosterMath";
import {
  availableBoardPlayers,
  buildTakenBefore,
  evaluatePostDraft,
  isPlayerTaken,
  type HistoricalPick,
  type RankedPlayer,
} from "./index";
import { scoreCandidate } from "./score";
import { computeVacancies } from "./need";
import { playerSurvivesUntilNextPick } from "./survival";
import { detectTierCliff } from "./tierCliff";

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

function pick(partial: Omit<HistoricalPick, "roundPick" | "isKeeper"> & Partial<Pick<HistoricalPick, "roundPick" | "isKeeper">>): HistoricalPick {
  return {
    roundPick: partial.roundPick ?? 1,
    isKeeper: partial.isKeeper ?? false,
    ...partial,
  };
}

const board: RankedPlayer[] = [
  player({ playerId: 1, name: "Player A", position: "WR", ecrRank: 24, adp: 24, tier: 3 }),
  player({ playerId: 2, name: "Kenneth Walker", position: "RB", ecrRank: 28, adp: 30, tier: 3 }),
  player({ playerId: 3, name: "Player C", position: "WR", ecrRank: 40, adp: 42, tier: 4 }),
  player({ playerId: 4, name: "Player D", position: "RB", ecrRank: 45, adp: 48, tier: 4 }),
  player({ playerId: 5, name: "Trey McBride", position: "TE", ecrRank: 32, adp: 35, tier: 3 }),
  player({ playerId: 6, name: "Dalton Kincaid", position: "TE", ecrRank: 55, adp: 60, tier: 5 }),
  player({ playerId: 7, name: "Deebo Samuel", position: "WR", ecrRank: 38, adp: 40, tier: 4 }),
  player({ playerId: 8, name: "Elite TE", position: "TE", ecrRank: 18, adp: 20, tier: 2 }),
];

describe("availability reconstruction", () => {
  it("Scenario A — a player still undrafted at the pick may be recommended", () => {
    const picks = [
      pick({ overallPick: 1, round: 1, teamId: 2, playerId: 1, playerName: "Player A", position: "WR" }),
      pick({ overallPick: 12, round: 1, teamId: 1, playerId: 7, playerName: "Deebo Samuel", position: "WR" }),
    ];
    const taken = buildTakenBefore(picks, 12);
    const available = availableBoardPlayers(board, taken);
    expect(isPlayerTaken({ playerId: 2, name: "Kenneth Walker", position: "RB" }, taken)).toBeNull();
    expect(available.some((p) => p.name === "Kenneth Walker")).toBe(true);
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board,
      profile,
      rankingSource: "fantasypros_current",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
    });
    expect(evaled.picks[0]?.rivals?.name).toBeTruthy();
    expect(evaled.integrity.canProveAvailability).toBe(true);
  });

  it("Scenario B — a player drafted three picks earlier MUST NOT appear", () => {
    const picks = [
      pick({ overallPick: 9, round: 1, teamId: 8, playerId: 2, playerName: "Kenneth Walker", position: "RB" }),
      pick({ overallPick: 10, round: 1, teamId: 9, playerId: 3, playerName: "Player C", position: "WR" }),
      pick({ overallPick: 11, round: 1, teamId: 10, playerId: 4, playerName: "Player D", position: "RB" }),
      pick({ overallPick: 12, round: 1, teamId: 1, playerId: 7, playerName: "Deebo Samuel", position: "WR" }),
    ];
    const taken = buildTakenBefore(picks, 12);
    expect(isPlayerTaken({ playerId: 2, name: "Kenneth Walker", position: "RB" }, taken)?.overallPick).toBe(9);
    const available = availableBoardPlayers(board, taken);
    expect(available.some((p) => p.name === "Kenneth Walker")).toBe(false);
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board,
      profile,
      rankingSource: "fantasypros_current",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
    });
    const review = evaled.picks[0]!;
    expect(review.rivals?.name).not.toBe("Kenneth Walker");
    expect(review.otherOptions.some((p) => p.name === "Kenneth Walker")).toBe(false);
    expect(review.availableTop.some((p) => p.name === "Kenneth Walker")).toBe(false);
  });
});

describe("decision engine roster context", () => {
  it("Scenario C — three starting WRs and one RB should pull toward an RB", () => {
    const picks: HistoricalPick[] = [
      pick({ overallPick: 1, round: 1, teamId: 1, playerId: 101, playerName: "WR One", position: "WR" }),
      pick({ overallPick: 2, round: 1, teamId: 2, playerId: 201, playerName: "Taken Star", position: "RB" }),
      pick({ overallPick: 13, round: 2, teamId: 1, playerId: 102, playerName: "WR Two", position: "WR" }),
      pick({ overallPick: 25, round: 3, teamId: 1, playerId: 103, playerName: "WR Three", position: "WR" }),
      pick({ overallPick: 37, round: 4, teamId: 1, playerId: 7, playerName: "Deebo Samuel", position: "WR" }),
    ];
    const localBoard: RankedPlayer[] = [
      player({ playerId: 101, name: "WR One", position: "WR", ecrRank: 5, adp: 5 }),
      player({ playerId: 102, name: "WR Two", position: "WR", ecrRank: 15, adp: 16 }),
      player({ playerId: 103, name: "WR Three", position: "WR", ecrRank: 22, adp: 24 }),
      player({ playerId: 7, name: "Deebo Samuel", position: "WR", ecrRank: 38, adp: 40 }),
      player({ playerId: 2, name: "Kenneth Walker", position: "RB", ecrRank: 28, adp: 30, tier: 3 }),
      player({ playerId: 4, name: "Player D", position: "RB", ecrRank: 45, adp: 48 }),
      player({ playerId: 201, name: "Taken Star", position: "RB", ecrRank: 3, adp: 3 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board: localBoard,
      profile,
      rankingSource: "fantasypros_current",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
    });
    const last = evaled.picks[evaled.picks.length - 1]!;
    expect(last.actual.name).toBe("Deebo Samuel");
    expect(last.rivals?.position).toBe("RB");
    expect(last.sameAsRivals).toBe(false);
  });

  it("Scenario D — a lone remaining TE before a tier drop should influence the pick", () => {
    const picks: HistoricalPick[] = [
      pick({ overallPick: 1, round: 1, teamId: 1, playerId: 2, playerName: "Kenneth Walker", position: "RB" }),
      pick({ overallPick: 13, round: 2, teamId: 1, playerId: 4, playerName: "Player D", position: "RB" }),
      pick({ overallPick: 25, round: 3, teamId: 1, playerId: 1, playerName: "Player A", position: "WR" }),
      pick({ overallPick: 37, round: 4, teamId: 1, playerId: 3, playerName: "Player C", position: "WR" }),
      pick({ overallPick: 49, round: 5, teamId: 1, playerId: 7, playerName: "Deebo Samuel", position: "WR" }),
    ];
    const localBoard: RankedPlayer[] = [
      player({ playerId: 2, name: "Kenneth Walker", position: "RB", ecrRank: 12, adp: 12 }),
      player({ playerId: 4, name: "Player D", position: "RB", ecrRank: 30, adp: 32 }),
      player({ playerId: 1, name: "Player A", position: "WR", ecrRank: 18, adp: 18 }),
      player({ playerId: 3, name: "Player C", position: "WR", ecrRank: 40, adp: 42 }),
      player({ playerId: 7, name: "Deebo Samuel", position: "WR", ecrRank: 48, adp: 50 }),
      player({ playerId: 8, name: "Elite TE", position: "TE", ecrRank: 22, adp: 24, tier: 2 }),
      player({ playerId: 6, name: "Dalton Kincaid", position: "TE", ecrRank: 70, adp: 75, tier: 6 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board: localBoard,
      profile,
      rankingSource: "fantasypros_current",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
    });
    const last = evaled.picks[evaled.picks.length - 1]!;
    expect(last.openNeedsBefore).toContain("TE");
    expect(last.rivals?.name).toBe("Elite TE");
  });

  it("Scenario E — sequential redraft: swapping round 4 to RB changes round 5 need", () => {
    const picks: HistoricalPick[] = [
      pick({ overallPick: 1, round: 1, teamId: 1, playerId: 11, playerName: "WR Ace", position: "WR" }),
      pick({ overallPick: 13, round: 2, teamId: 1, playerId: 12, playerName: "WR Two", position: "WR" }),
      pick({ overallPick: 25, round: 3, teamId: 1, playerId: 13, playerName: "WR Three", position: "WR" }),
      pick({ overallPick: 37, round: 4, teamId: 1, playerId: 14, playerName: "WR Four", position: "WR" }),
      pick({ overallPick: 49, round: 5, teamId: 1, playerId: 15, playerName: "WR Five", position: "WR" }),
    ];
    const localBoard: RankedPlayer[] = [
      player({ playerId: 11, name: "WR Ace", position: "WR", ecrRank: 6, adp: 6 }),
      player({ playerId: 12, name: "WR Two", position: "WR", ecrRank: 14, adp: 14 }),
      player({ playerId: 13, name: "WR Three", position: "WR", ecrRank: 22, adp: 24 }),
      player({ playerId: 14, name: "WR Four", position: "WR", ecrRank: 38, adp: 40 }),
      player({ playerId: 15, name: "WR Five", position: "WR", ecrRank: 50, adp: 52 }),
      player({ playerId: 22, name: "RB Two", position: "RB", ecrRank: 28, adp: 30 }),
      player({ playerId: 23, name: "RB Three", position: "RB", ecrRank: 34, adp: 36 }),
      player({ playerId: 31, name: "TE One", position: "TE", ecrRank: 32, adp: 33 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board: localBoard,
      profile,
      rankingSource: "fantasypros_current",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
    });
    const r3 = evaled.redraftPicks.find((p) => p.round === 3)!;
    const r4 = evaled.redraftPicks.find((p) => p.round === 4)!;
    const r5 = evaled.redraftPicks.find((p) => p.round === 5)!;
    expect(evaled.picks.find((p) => p.round === 4)?.rivals?.position).toBe("RB");
    expect(new Set(evaled.redraftPicks.map((p) => p.player.name)).size).toBe(evaled.redraftPicks.length);
    expect(r5.player.name).not.toBe(r4.player.name);
    expect(r5.player.name).not.toBe(r3.player.name);
  });

  it("Scenario F — if the actual pick was best, say so", () => {
    const picks: HistoricalPick[] = [
      pick({ overallPick: 1, round: 1, teamId: 1, playerId: 2, playerName: "Kenneth Walker", position: "RB" }),
    ];
    const localBoard: RankedPlayer[] = [
      player({ playerId: 2, name: "Kenneth Walker", position: "RB", ecrRank: 8, adp: 8 }),
      player({ playerId: 7, name: "Deebo Samuel", position: "WR", ecrRank: 38, adp: 40 }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board: localBoard,
      profile,
      rankingSource: "fantasypros_current",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "archived",
    });
    expect(evaled.picks[0]?.sameAsRivals).toBe(true);
    expect(evaled.picks[0]?.why.toLowerCase()).toMatch(/right pick|same as yours|same call/);
  });
});

describe("2010 historical draft — proven availability", () => {
  it("does not claim a player was available if the 2010 recap shows they were already picked", () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), "scripts/draft-data/2010.json"), "utf8"),
    ) as {
      picks: Array<{
        overallPick: number;
        round: number;
        roundPick: number;
        teamId: number;
        playerName: string;
        position: string;
        isKeeper: boolean;
      }>;
    };
    const picks: HistoricalPick[] = raw.picks.map((p) => ({
      overallPick: p.overallPick,
      round: p.round,
      roundPick: p.roundPick,
      teamId: p.teamId,
      playerId: p.overallPick,
      playerName: p.playerName,
      position: p.position,
      isKeeper: p.isKeeper,
    }));
    const boardFromDraft: RankedPlayer[] = picks.map((p) =>
      player({
        playerId: p.playerId,
        name: p.playerName,
        position: p.position || "UNK",
        ecrRank: p.overallPick,
        adp: p.overallPick,
      }),
    );
    const rodgersPick = picks.find((p) => p.playerName === "Aaron Rodgers")!;
    expect(rodgersPick.overallPick).toBe(5);
    const taken = buildTakenBefore(picks, rodgersPick.overallPick);
    expect(isPlayerTaken({ name: "Chris Johnson", position: "RB" }, taken)?.overallPick).toBe(1);
    expect(isPlayerTaken({ name: "Ray Rice", position: "RB" }, taken)?.overallPick).toBe(4);
    expect(isPlayerTaken({ name: "Frank Gore", position: "RB" }, taken)).toBeNull();
    expect(isPlayerTaken({ name: "Randy Moss", position: "WR" }, taken)).toBeNull();

    const evaled = evaluatePostDraft({
      leagueId: "457622",
      season: 2010,
      userTeamId: rodgersPick.teamId,
      picks,
      board: boardFromDraft,
      profile,
      rankingSource: "historical_draft_order_proxy",
      rankingSourceNote: "2010 recap — availability from historical pick order only",
      rankingEvidenceQuality: "league_order",
    });
    expect(evaled.picks).toHaveLength(0);
    expect(evaled.redraftPicks).toHaveLength(0);
    expect(evaled.overallLetter).toBe("—");
    expect(evaled.redraftLetter).toBe("—");
    expect(evaled.bestPick).toBeNull();
    expect(evaled.biggestMiss).toBeNull();
    expect(evaled.turningPoint).toBeNull();
  });
});

describe("POST-DRAFT-EVAL-02 accuracy", () => {
  const archived = {
    rankingSource: "fantasypros_current" as const,
    rankingSourceNote: "archived test board",
    rankingEvidenceQuality: "archived" as const,
    superflexStatus: "none" as const,
  };

  it("A empty roster — no position gets an unjustified major need edge", () => {
    const counts = emptyCounts();
    const available = [
      player({ playerId: 1, name: "Elite QB", position: "QB", ecrRank: 8, adp: 8 }),
      player({ playerId: 2, name: "Elite RB", position: "RB", ecrRank: 6, adp: 6 }),
      player({ playerId: 3, name: "Elite WR", position: "WR", ecrRank: 5, adp: 5 }),
    ];
    const scores = available.map((p) =>
      scoreCandidate({
        player: p,
        overallPick: 5,
        totalPicks: 180,
        round: 1,
        totalRounds: 15,
        countsBefore: counts,
        profile,
        available,
        rankingTier: "TIER_2_SEASON_CACHE",
      }),
    );
    const needs = scores.map((s) => s.need);
    expect(Math.max(...needs) - Math.min(...needs)).toBeLessThan(8);
  });

  it("B early draft — talent beats empty-chair need", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [pick({ overallPick: 5, round: 1, teamId: 1, playerId: 10, playerName: "Solid RB", position: "RB" })],
      board: [
        player({ playerId: 10, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
        player({ playerId: 11, name: "Elite WR", position: "WR", ecrRank: 3, adp: 3 }),
      ],
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.rivals?.name).toBe("Elite WR");
    expect(evaled.picks[0]?.why.toLowerCase()).not.toMatch(/was not the hole|empty chair/);
  });

  it("C mid-draft imbalance still favors the open RB2", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [
        pick({ overallPick: 1, round: 1, teamId: 1, playerId: 101, playerName: "WR One", position: "WR" }),
        pick({ overallPick: 13, round: 2, teamId: 1, playerId: 102, playerName: "WR Two", position: "WR" }),
        pick({ overallPick: 25, round: 3, teamId: 1, playerId: 103, playerName: "WR Three", position: "WR" }),
        pick({ overallPick: 37, round: 4, teamId: 1, playerId: 7, playerName: "Deebo Samuel", position: "WR" }),
      ],
      board: [
        player({ playerId: 101, name: "WR One", position: "WR", ecrRank: 5, adp: 5 }),
        player({ playerId: 102, name: "WR Two", position: "WR", ecrRank: 15, adp: 16 }),
        player({ playerId: 103, name: "WR Three", position: "WR", ecrRank: 22, adp: 24 }),
        player({ playerId: 7, name: "Deebo Samuel", position: "WR", ecrRank: 38, adp: 40 }),
        player({ playerId: 2, name: "Kenneth Walker", position: "RB", ecrRank: 28, adp: 30 }),
      ],
      profile,
      ...archived,
    });
    expect(evaled.picks[evaled.picks.length - 1]?.rivals?.position).toBe("RB");
  });

  it("E elite value fall can ignore positional need", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [
        pick({ overallPick: 12, round: 1, teamId: 1, playerId: 21, playerName: "RB One", position: "RB" }),
        pick({ overallPick: 13, round: 2, teamId: 1, playerId: 22, playerName: "RB Two", position: "RB" }),
        pick({ overallPick: 36, round: 3, teamId: 1, playerId: 31, playerName: "Okay WR", position: "WR" }),
      ],
      board: [
        player({ playerId: 21, name: "RB One", position: "RB", ecrRank: 10, adp: 10 }),
        player({ playerId: 22, name: "RB Two", position: "RB", ecrRank: 20, adp: 20 }),
        player({ playerId: 31, name: "Okay WR", position: "WR", ecrRank: 48, adp: 50 }),
        player({ playerId: 99, name: "Elite WR Fall", position: "WR", ecrRank: 4, adp: 4 }),
      ],
      profile,
      ...archived,
    });
    const last = evaled.picks[evaled.picks.length - 1]!;
    expect(last.rivals?.name).toBe("Elite WR Fall");
  });

  it("F FLEX vacancies are not double-counted onto RB", () => {
    const counts = emptyCounts();
    counts.QB = 1;
    counts.RB = 2;
    counts.WR = 2;
    counts.TE = 1;
    const report = computeVacancies(counts, profile);
    expect(report.dedicatedRemaining.RB).toBe(0);
    expect(report.dedicatedRemaining.WR).toBe(0);
    expect(report.flexRemaining).toBe(1);
    counts.RB = 3;
    const filled = computeVacancies(counts, profile);
    expect(filled.flexRemaining).toBe(0);
    expect(filled.dedicatedRemaining.RB).toBe(0);
  });

  it("G already drafted player cannot be recommended", () => {
    const picks = [
      pick({ overallPick: 9, round: 1, teamId: 8, playerId: 2, playerName: "Kenneth Walker", position: "RB" }),
      pick({ overallPick: 12, round: 1, teamId: 1, playerId: 7, playerName: "Deebo Samuel", position: "WR" }),
    ];
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks,
      board,
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.rivals?.name).not.toBe("Kenneth Walker");
  });

  it("I near-tie is not called a mistake", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [pick({ overallPick: 20, round: 2, teamId: 1, playerId: 1, playerName: "Player A", position: "WR" })],
      board: [
        player({ playerId: 1, name: "Player A", position: "WR", ecrRank: 20, adp: 20 }),
        player({ playerId: 2, name: "Player Twin", position: "WR", ecrRank: 21, adp: 21 }),
      ],
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.sameAsRivals || evaled.picks[0]?.recommendationKind === "same").toBe(true);
  });

  it("K LOW confidence with league-order rankings does not invent a miss", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2019,
      userTeamId: 1,
      picks: [pick({ overallPick: 5, round: 1, teamId: 1, playerId: 1, playerName: "Aaron Rodgers", position: "QB" })],
      board: [
        player({ playerId: 1, name: "Aaron Rodgers", position: "QB", ecrRank: 5, adp: 5 }),
        player({ playerId: 2, name: "Frank Gore", position: "RB", ecrRank: 13, adp: 13 }),
      ],
      profile,
      rankingSource: "historical_draft_order_proxy",
      rankingSourceNote: "league order only",
      rankingEvidenceQuality: "league_order",
    });
    expect(evaled.picks[0]?.recommendationConfidence === "LOW" || evaled.picks[0]?.recommendationConfidence === "INSUFFICIENT").toBe(true);
    expect(evaled.picks[0]?.sameAsRivals || evaled.picks[0]?.recommendationKind === "none" || evaled.picks[0]?.rivals?.name === "Aaron Rodgers").toBe(true);
    expect(evaled.biggestMiss).toBeNull();
  });

  it("P no hindsight — projectedPoints do not change the pick", () => {
    const boardA = [
      player({ playerId: 1, name: "Draft Star", position: "WR", ecrRank: 8, adp: 8, projectedPoints: 80 }),
      player({ playerId: 2, name: "Later Hero", position: "RB", ecrRank: 40, adp: 40, projectedPoints: 400 }),
    ];
    const boardB = boardA.map((p) => ({ ...p, projectedPoints: p.name === "Later Hero" ? 12 : 400 }));
    const input = {
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [pick({ overallPick: 8, round: 1, teamId: 1, playerId: 1, playerName: "Draft Star", position: "WR" })],
      profile,
      ...archived,
    };
    const a = evaluatePostDraft({ ...input, board: boardA });
    const b = evaluatePostDraft({ ...input, board: boardB });
    expect(a.picks[0]?.rivals?.name).toBe(b.picks[0]?.rivals?.name);
  });

  it("D late starter vacancy — need has stronger influence", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [
        pick({ overallPick: 1, round: 1, teamId: 1, playerId: 1, playerName: "QB One", position: "QB" }),
        pick({ overallPick: 13, round: 2, teamId: 1, playerId: 2, playerName: "RB One", position: "RB" }),
        pick({ overallPick: 25, round: 3, teamId: 1, playerId: 3, playerName: "RB Two", position: "RB" }),
        pick({ overallPick: 37, round: 4, teamId: 1, playerId: 4, playerName: "WR One", position: "WR" }),
        pick({ overallPick: 49, round: 5, teamId: 1, playerId: 5, playerName: "WR Two", position: "WR" }),
        pick({ overallPick: 145, round: 13, teamId: 1, playerId: 6, playerName: "WR Depth", position: "WR" }),
      ],
      board: [
        player({ playerId: 1, name: "QB One", position: "QB", ecrRank: 12, adp: 12 }),
        player({ playerId: 2, name: "RB One", position: "RB", ecrRank: 8, adp: 8 }),
        player({ playerId: 3, name: "RB Two", position: "RB", ecrRank: 18, adp: 18 }),
        player({ playerId: 4, name: "WR One", position: "WR", ecrRank: 10, adp: 10 }),
        player({ playerId: 5, name: "WR Two", position: "WR", ecrRank: 20, adp: 20 }),
        player({ playerId: 6, name: "WR Depth", position: "WR", ecrRank: 90, adp: 90 }),
        player({ playerId: 7, name: "TE Starter", position: "TE", ecrRank: 88, adp: 88 }),
      ],
      profile,
      ...archived,
    });
    const last = evaled.picks[evaled.picks.length - 1]!;
    expect(last.rivals?.position).toBe("TE");
  });

  it("H same player remains the Rivals pick", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [pick({ overallPick: 3, round: 1, teamId: 1, playerId: 1, playerName: "Best Available", position: "WR" })],
      board: [
        player({ playerId: 1, name: "Best Available", position: "WR", ecrRank: 3, adp: 3 }),
        player({ playerId: 2, name: "Next WR", position: "WR", ecrRank: 14, adp: 14 }),
      ],
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.rivals?.name).toBe("Best Available");
    expect(evaled.picks[0]?.sameAsRivals || evaled.picks[0]?.recommendationKind === "same").toBe(true);
  });

  it("J HIGH confidence with contemporaneous ranking evidence", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [pick({ overallPick: 5, round: 1, teamId: 1, playerId: 1, playerName: "Solid RB", position: "RB" })],
      board: [
        player({ playerId: 1, name: "Solid RB", position: "RB", ecrRank: 18, adp: 18 }),
        player({ playerId: 2, name: "Elite WR", position: "WR", ecrRank: 3, adp: 3 }),
      ],
      profile,
      ...archived,
    });
    expect(evaled.picks[0]?.recommendationConfidence).toBe("HIGH");
    expect(evaled.rankingTier).toBe("TIER_1_CONTEMPORANEOUS");
  });

  it("L INSUFFICIENT ranking evidence yields no definitive replacement", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2019,
      userTeamId: 1,
      picks: [pick({ overallPick: 5, round: 1, teamId: 1, playerId: 1, playerName: "Actual Pick", position: "QB" })],
      board: [
        player({ playerId: 1, name: "Actual Pick", position: "QB" }),
        player({ playerId: 2, name: "Other Name", position: "RB" }),
      ],
      profile,
      rankingSource: "historical_draft_order_proxy",
      rankingSourceNote: "no rankings",
      rankingEvidenceQuality: "none",
      superflexStatus: "unknown",
    });
    expect(evaled.picks[0]?.recommendationConfidence).toBe("INSUFFICIENT");
    expect(evaled.picks[0]?.recommendationKind === "none" || evaled.picks[0]?.sameAsRivals).toBe(true);
    expect(evaled.biggestMiss).toBeNull();
  });

  it("M next-pick survival changes opportunity cost from historical recap", () => {
    const target = player({ playerId: 9, name: "Target RB", position: "RB", ecrRank: 22, adp: 22 });
    const available = [target];
    const counts = emptyCounts();
    const base = {
      player: target,
      overallPick: 12,
      totalPicks: 180,
      round: 2,
      totalRounds: 15,
      countsBefore: counts,
      profile,
      available,
      rankingTier: "TIER_1_CONTEMPORANEOUS" as const,
      nextUserOverall: 24,
    };
    const survives = scoreCandidate({
      ...base,
      historicalPicks: [
        pick({ overallPick: 12, round: 2, teamId: 1, playerId: 1, playerName: "User Pick", position: "WR" }),
        pick({ overallPick: 24, round: 3, teamId: 1, playerId: 2, playerName: "Next Slot", position: "RB" }),
      ],
    });
    const gone = scoreCandidate({
      ...base,
      historicalPicks: [
        pick({ overallPick: 12, round: 2, teamId: 1, playerId: 1, playerName: "User Pick", position: "WR" }),
        pick({ overallPick: 15, round: 2, teamId: 8, playerId: 9, playerName: "Target RB", position: "RB" }),
        pick({ overallPick: 24, round: 3, teamId: 1, playerId: 2, playerName: "Next Slot", position: "TE" }),
      ],
    });
    expect(playerSurvivesUntilNextPick({
      player: target,
      picks: [pick({ overallPick: 15, round: 2, teamId: 8, playerId: 9, playerName: "Target RB", position: "RB" })],
      afterOverall: 12,
      untilOverall: 24,
    })).toBe(false);
    expect(survives.survivesUntilNextPick).toBe(true);
    expect(gone.survivesUntilNextPick).toBe(false);
    expect(gone.total).toBeGreaterThan(survives.total);
  });

  it("N tier cliff increases scarcity when ranking data supports it", () => {
    const cliffPlayer = player({ playerId: 1, name: "Last RB", position: "RB", ecrRank: 48, adp: 48 });
    const available = [
      cliffPlayer,
      player({ playerId: 2, name: "Next RB", position: "RB", ecrRank: 72, adp: 72 }),
    ];
    const cliff = detectTierCliff({
      player: cliffPlayer,
      available,
      rankingTier: "TIER_1_CONTEMPORANEOUS",
    });
    expect(cliff.isCliff).toBe(true);
    const scored = scoreCandidate({
      player: cliffPlayer,
      overallPick: 40,
      totalPicks: 180,
      round: 4,
      totalRounds: 15,
      countsBefore: emptyCounts(),
      profile,
      available,
      rankingTier: "TIER_1_CONTEMPORANEOUS",
    });
    expect(scored.reasons).toContain("TIER_CLIFF");
    const noCliff = detectTierCliff({
      player: cliffPlayer,
      available,
      rankingTier: "TIER_3_LEAGUE_ORDER",
    });
    expect(noCliff.isCliff).toBe(false);
  });

  it("O sequential redraft earlier alternate changes later roster need", () => {
    const evaled = evaluatePostDraft({
      leagueId: "t",
      season: 2026,
      userTeamId: 1,
      picks: [
        pick({ overallPick: 1, round: 1, teamId: 1, playerId: 11, playerName: "WR Ace", position: "WR" }),
        pick({ overallPick: 13, round: 2, teamId: 1, playerId: 12, playerName: "WR Two", position: "WR" }),
        pick({ overallPick: 25, round: 3, teamId: 1, playerId: 13, playerName: "WR Three", position: "WR" }),
        pick({ overallPick: 37, round: 4, teamId: 1, playerId: 14, playerName: "WR Four", position: "WR" }),
        pick({ overallPick: 49, round: 5, teamId: 1, playerId: 15, playerName: "WR Five", position: "WR" }),
      ],
      board: [
        player({ playerId: 11, name: "WR Ace", position: "WR", ecrRank: 6, adp: 6 }),
        player({ playerId: 12, name: "WR Two", position: "WR", ecrRank: 14, adp: 14 }),
        player({ playerId: 13, name: "WR Three", position: "WR", ecrRank: 22, adp: 24 }),
        player({ playerId: 14, name: "WR Four", position: "WR", ecrRank: 38, adp: 40 }),
        player({ playerId: 15, name: "WR Five", position: "WR", ecrRank: 50, adp: 52 }),
        player({ playerId: 22, name: "RB Two", position: "RB", ecrRank: 28, adp: 30 }),
        player({ playerId: 23, name: "RB Three", position: "RB", ecrRank: 34, adp: 36 }),
      ],
      profile,
      ...archived,
    });
    expect(evaled.picks.find((p) => p.round === 4)?.rivals?.position).toBe("RB");
    const r4 = evaled.redraftPicks.find((p) => p.round === 4)!;
    const r5 = evaled.redraftPicks.find((p) => p.round === 5)!;
    expect(r4.player.position).toBe("RB");
    expect(r4.sameAsOriginal).toBe(false);
    expect(r5.player.name).not.toBe(r4.player.name);
  });

  it("does not grade another owner when recap team ids are missing", () => {
    const evaled = evaluatePostDraft({
      leagueId: "457622",
      season: 2010,
      userTeamId: 11,
      picks: [
        pick({ overallPick: 1, round: 1, teamId: 0, playerId: 1, playerName: "Dez Bryant", position: "WR" }),
        pick({ overallPick: 2, round: 1, teamId: 0, playerId: 2, playerName: "Aaron Rodgers", position: "QB" }),
      ],
      board: [
        player({ playerId: 1, name: "Dez Bryant", position: "WR", ecrRank: 1, adp: 1 }),
        player({ playerId: 2, name: "Aaron Rodgers", position: "QB", ecrRank: 2, adp: 2 }),
      ],
      profile,
      rankingSource: "historical_draft_order_proxy",
      rankingSourceNote: "test",
      rankingEvidenceQuality: "league_order",
    });
    expect(evaled.picks).toHaveLength(0);
    expect(evaled.integrity.warnings.join(" ")).toMatch(/not available|team identity|not assigned|no draft picks are assigned/i);
  });
});

