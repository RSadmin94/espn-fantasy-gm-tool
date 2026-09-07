import { describe, expect, it } from "vitest";
import { findTrades } from "./tradeFinder/find";
import { attachNeeds, analyzeTeamNeeds, leagueReplacementByPosition } from "./tradeFinder/needSurplus";
import { generateCandidates, rankPartners } from "./tradeFinder/generate";
import { scoreCandidate } from "./tradeFinder/score";
import { applyNarratives } from "./tradeFinder/narrative";
import { behaviorFitForTrade } from "./tradeFinder/behavior";
import { fairnessBandFromGrade } from "./tradeFinder/score";
import { DEFAULT_ROSTER_SLOTS } from "./tradeFinder/types";
import { tradePriorityMultiplier, tradePriorityScore } from "./tradeFinder/priority";
import { TRADE_FINDER_PRIORITY_MULTIPLIER } from "./tradeFinder/weights";
import { compareGivenSideTotals, fairnessGradeFromGainRatio, PICK_TO_MARKET_SCALE } from "./tradePickValueAuthority";
import type {
  TradeFinderAsset,
  TradeFinderLeague,
  TradeFinderTeam,
  TradePosition,
} from "./tradeFinder/types";

function asset(over: Partial<TradeFinderAsset> & { playerId: number; name: string; position: TradePosition }): TradeFinderAsset {
  const weekly = over.weeklyProjection ?? 10;
  return {
    kind: "player",
    assetId: `p:${over.playerId}`,
    nflTeam: "NYJ",
    tradeValue: over.tradeValue ?? weekly * 10,
    weeklyProjection: weekly,
    starter: over.starter ?? false,
    bench: over.bench ?? !over.starter,
    ir: false,
    injuryStatus: "ACTIVE",
    unavailable: false,
    ...over,
  };
}

function team(teamId: number, displayName: string, roster: TradeFinderAsset[]): TradeFinderTeam {
  return { teamId, displayName, ownerName: displayName, roster, picks: [], needs: [] };
}

function leagueOf(userTeamId: number, teams: TradeFinderTeam[], slots = DEFAULT_ROSTER_SLOTS): TradeFinderLeague {
  return {
    leagueId: "test",
    provider: "espn",
    season: 2026,
    userTeamId,
    format: "redraft",
    slots,
    teamCount: teams.length,
    teams,
    behaviorByTeam: {},
    disclaimers: [],
  };
}

/** User: RB surplus / WR need. Mike: WR surplus / RB need. */
function rbWrComplementLeague() {
  const user = team(1, "You", [
    asset({ playerId: 1, name: "Josh Allen", position: "QB", weeklyProjection: 22, starter: true, tradeValue: 220 }),
    asset({ playerId: 2, name: "Saquon Barkley", position: "RB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
    asset({ playerId: 3, name: "James Cook", position: "RB", weeklyProjection: 16, starter: true, tradeValue: 160 }),
    asset({ playerId: 4, name: "Rachaad White", position: "RB", weeklyProjection: 12, starter: false, tradeValue: 120 }),
    asset({ playerId: 5, name: "Tyjae Spears", position: "RB", weeklyProjection: 10, starter: false, tradeValue: 100 }),
    asset({ playerId: 6, name: "Jordan Addison", position: "WR", weeklyProjection: 8, starter: true, tradeValue: 80 }),
    asset({ playerId: 7, name: "Rashid Shaheed", position: "WR", weeklyProjection: 6, starter: true, tradeValue: 60 }),
    asset({ playerId: 8, name: "Trey McBride", position: "TE", weeklyProjection: 12, starter: true, tradeValue: 120 }),
    asset({ playerId: 9, name: "Ka'imi Fairbairn", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    asset({ playerId: 10, name: "Bills D/ST", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
  ]);
  const mike = team(2, "Mike", [
    asset({ playerId: 11, name: "Jalen Hurts", position: "QB", weeklyProjection: 21, starter: true, tradeValue: 210 }),
    asset({ playerId: 12, name: "Garrett Wilson", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
    asset({ playerId: 13, name: "Amon-Ra St. Brown", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
    asset({ playerId: 14, name: "DK Metcalf", position: "WR", weeklyProjection: 14, starter: false, tradeValue: 140 }),
    asset({ playerId: 15, name: "Chris Olave", position: "WR", weeklyProjection: 12, starter: false, tradeValue: 120 }),
    asset({ playerId: 16, name: "Zamir White", position: "RB", weeklyProjection: 7, starter: true, tradeValue: 70 }),
    asset({ playerId: 17, name: "Elijah Mitchell", position: "RB", weeklyProjection: 5, starter: true, tradeValue: 50 }),
    asset({ playerId: 18, name: "Dallas Goedert", position: "TE", weeklyProjection: 10, starter: true, tradeValue: 100 }),
    asset({ playerId: 19, name: "Younghoe Koo", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    asset({ playerId: 20, name: "49ers D/ST", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
  ]);
  const other = team(3, "Pat", [
    asset({ playerId: 21, name: "Patrick Mahomes", position: "QB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
    asset({ playerId: 22, name: "Lamar Jackson", position: "QB", weeklyProjection: 22, starter: false, tradeValue: 220 }),
    asset({ playerId: 23, name: "Breece Hall", position: "RB", weeklyProjection: 15, starter: true, tradeValue: 150 }),
    asset({ playerId: 24, name: "Kyren Williams", position: "RB", weeklyProjection: 14, starter: true, tradeValue: 140 }),
    asset({ playerId: 25, name: "CeeDee Lamb", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
    asset({ playerId: 26, name: "Puka Nacua", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
    asset({ playerId: 27, name: "Sam LaPorta", position: "TE", weeklyProjection: 11, starter: true, tradeValue: 110 }),
    asset({ playerId: 28, name: "Justin Tucker", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    asset({ playerId: 29, name: "Ravens D/ST", position: "DST", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    asset({ playerId: 30, name: "Romeo Doubs", position: "WR", weeklyProjection: 9, starter: false, tradeValue: 90 }),
  ]);
  return leagueOf(1, [user, mike, other]);
}

describe("Trade Finder need/surplus", () => {
  it("labels RB surplus and WR need for a RB-heavy / WR-thin roster", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams.find((t) => t.teamId === 1)!;
    const rb = user.needs.find((n) => n.position === "RB");
    const wr = user.needs.find((n) => n.position === "WR");
    expect(rb?.label).toBe("SURPLUS");
    expect(wr?.label).toBe("NEED");
    expect((wr?.needScore ?? 0) >= 40).toBe(true);
    expect((rb?.surplusScore ?? 0) >= 40).toBe(true);
  });
});

describe("Trade Finder partner discovery", () => {
  it("1. ranks the WR-rich / RB-need partner above a balanced roster", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const ranked = rankPartners(league, {
      targetPosition: "ANY",
      partnerTeamId: null,
      maxAssets: 2,
      includeDraftPicks: false,
      risk: "balanced",
      topN: 5,
    });
    expect(ranked[0]?.team.displayName).toBe("Mike");
    expect(ranked[0]!.complementScore).toBeGreaterThan(ranked[1]?.complementScore ?? 0);
  });
});

describe("Trade Finder generation and scoring", () => {
  it("1. finds WR-for-RB deals with Mike", () => {
    const result = findTrades(rbWrComplementLeague(), { targetPosition: "WR", topN: 5 });
    expect(result.emptyReason).toBe("none");
    expect(result.trades.length).toBeGreaterThan(0);
    const hit = result.trades.find((t) => t.partnerName === "Mike");
    expect(hit).toBeTruthy();
    expect(hit!.youReceive.some((a) => a.position === "WR")).toBe(true);
    expect(hit!.youGive.some((a) => a.position === "RB")).toBe(true);
  });

  it("2. rejects one-sided unrealistic trades", () => {
    const league = rbWrComplementLeague();
    const user = league.teams[0];
    const mike = league.teams[1];
    const generated = generateCandidates(attachNeeds(league), [{ team: mike, complementScore: 1 }], {
      targetPosition: "ANY",
      partnerTeamId: 2,
      maxAssets: 1,
      includeDraftPicks: false,
      risk: "balanced",
      topN: 5,
    });
    const steal = generated.find(
      (g) =>
        g.give.some((a) => a.name === "Tyjae Spears") &&
        g.receive.some((a) => a.name === "Amon-Ra St. Brown"),
    );
    expect(steal).toBeUndefined();
    const result = findTrades(league);
    expect(result.trades.every((t) => t.fairness !== "UNREALISTIC")).toBe(true);
    void user;
  });

  it("3. prefers mutually beneficial trades over user-only benefit", () => {
    const result = findTrades(rbWrComplementLeague(), { risk: "balanced", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    const top = result.trades[0];
    expect(top.partnerNeedFit).toBeGreaterThan(0);
    expect(["STRONG FIT", "GOOD FIT", "BALANCED"].includes(top.tradeFit)).toBe(true);
  });

  it("4. improves the user starting lineup when receiving a starter WR", () => {
    const result = findTrades(rbWrComplementLeague(), { targetPosition: "WR", topN: 10 });
    const wrDeal = result.trades.find((t) => t.youReceive.some((a) => a.position === "WR"));
    expect(wrDeal).toBeTruthy();
    expect((wrDeal!.userLineupDelta ?? 0) >= 0).toBe(true);
  });

  it("5. does not create an unacceptable RB depth hole", () => {
    const thin = rbWrComplementLeague();
    thin.teams[0].roster = thin.teams[0].roster.filter((a) => a.position !== "RB" || a.name === "Saquon Barkley" || a.name === "James Cook");
    const result = findTrades(thin, { maxAssets: 1, topN: 10 });
    for (const t of result.trades) {
      const rbsGiven = t.youGive.filter((a) => a.position === "RB").length;
      expect(rbsGiven).toBeLessThan(2);
      expect(t.userDepthDamage).toBeLessThan(1);
    }
  });

  it("6. opponent roster remains rational (no new unfilled hole ranked highly)", () => {
    const result = findTrades(rbWrComplementLeague(), { topN: 5 });
    for (const t of result.trades) {
      expect(t.partnerDepthDamage).toBeLessThan(1);
      expect(t.partnerNeedFit).toBeGreaterThan(0);
    }
  });

  it("7. supports 1-for-1", () => {
    const result = findTrades(rbWrComplementLeague(), { maxAssets: 1, topN: 10 });
    expect(result.trades.some((t) => t.shape === "1-for-1")).toBe(true);
  });

function scoredShapes(maxAssets: 1 | 2) {
  const league = attachNeeds(rbWrComplementLeague());
  const user = league.teams[0];
  const filters = {
    targetPosition: "ANY" as const,
    partnerTeamId: null,
    maxAssets,
    includeDraftPicks: false,
    risk: "balanced" as const,
    topN: 10,
  };
  const partners = rankPartners(league, filters);
  const generated = generateCandidates(league, partners, filters);
  const scored = generated
    .map((g) => scoreCandidate(league, user, g, filters))
    .filter((s): s is NonNullable<typeof s> => s != null);
  return { generated, scored };
}

  it("8. supports 2-for-1", () => {
    const { generated, scored } = scoredShapes(2);
    expect(generated.some((g) => g.shape === "2-for-1")).toBe(true);
    expect(scored.some((t) => t.shape === "2-for-1")).toBe(true);
    const hit = scored.find((t) => t.shape === "2-for-1")!;
    expect(hit.youGive).toHaveLength(2);
    expect(hit.youReceive).toHaveLength(1);
  });

  it("9. supports 1-for-2", () => {
    const { generated, scored } = scoredShapes(2);
    expect(generated.some((g) => g.shape === "1-for-2")).toBe(true);
    expect(scored.some((t) => t.shape === "1-for-2")).toBe(true);
    const hit = scored.find((t) => t.shape === "1-for-2")!;
    expect(hit.youGive).toHaveLength(1);
    expect(hit.youReceive).toHaveLength(2);
  });

  it("10. returns a clean empty state when no partners complement", () => {
    const user = team(1, "You", [
      asset({ playerId: 1, name: "A", position: "QB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
      asset({ playerId: 2, name: "B", position: "RB", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 3, name: "C", position: "RB", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 4, name: "D", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 5, name: "E", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 6, name: "F", position: "TE", weeklyProjection: 12, starter: true, tradeValue: 120 }),
      asset({ playerId: 7, name: "G", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 8, name: "H", position: "DST", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    ]);
    const clone = team(2, "Clone", user.roster.map((a) => ({ ...a, playerId: a.playerId! + 100, assetId: `p:${a.playerId! + 100}` })));
    const result = findTrades(leagueOf(1, [user, clone]));
    expect(result.trades).toHaveLength(0);
    expect(result.emptyExplanation).toMatch(/No strong trade opportunities right now/);
  });

  it("11. respects 1-QB league rules (does not trade away the only QB)", () => {
    const league = rbWrComplementLeague();
    league.slots = { ...DEFAULT_ROSTER_SLOTS, QB: 1, SUPERFLEX: 0 };
    const result = findTrades(league, { maxAssets: 1, topN: 10 });
    for (const t of result.trades) {
      expect(t.youGive.some((a) => a.position === "QB")).toBe(false);
    }
  });

  it("12. does not treat OUT players as acquirable starters", () => {
    const league = rbWrComplementLeague();
    const wilson = league.teams[1].roster.find((a) => a.name === "Garrett Wilson")!;
    wilson.unavailable = true;
    wilson.injuryStatus = "OUT";
    const result = findTrades(league, { targetPosition: "WR", maxAssets: 1, topN: 10 });
    expect(result.trades.every((t) => t.youReceive.every((a) => a.name !== "Garrett Wilson"))).toBe(true);
  });

  it("13. is duplicate canonical player-id safe", () => {
    const league = rbWrComplementLeague();
    const dup = { ...league.teams[0].roster[2], assetId: "p:dup" };
    league.teams[0].roster.push(dup);
    const result = findTrades(league, { maxAssets: 1, topN: 10 });
    for (const t of result.trades) {
      const ids = [...t.youGive, ...t.youReceive].map((a) => a.playerId).filter((id): id is number => id != null);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("14. ranking is stable / deterministic", () => {
    const a = findTrades(rbWrComplementLeague(), { topN: 5 });
    const b = findTrades(rbWrComplementLeague(), { topN: 5 });
    expect(a.trades.map((t) => `${t.partnerTeamId}:${t.youGive.map((x) => x.assetId).join(",")}:${t.youReceive.map((x) => x.assetId).join(",")}`)).toEqual(
      b.trades.map((t) => `${t.partnerTeamId}:${t.youGive.map((x) => x.assetId).join(",")}:${t.youReceive.map((x) => x.assetId).join(",")}`),
    );
  });

  it("15. AI failure does not remove deterministic results", () => {
    const base = findTrades(rbWrComplementLeague(), { topN: 3 });
    expect(base.trades.length).toBeGreaterThan(0);
    const { trades, applied } = applyNarratives(base.trades, "NOT JSON");
    expect(applied).toBe(false);
    expect(trades).toHaveLength(base.trades.length);
    expect(trades[0].whyThisWorks.length).toBeGreaterThan(10);
    expect(trades[0].whyAi).toBeNull();
  });
});

describe("Trade Finder fairness authority", () => {
  it("maps canonical grades onto product bands without a second verdict model", () => {
    expect(fairnessBandFromGrade("FAIR", 1)).toBe("BALANCED");
    expect(fairnessBandFromGrade("SLIGHT EDGE A", 1.1)).toBe("SLIGHT EDGE YOU");
    expect(fairnessBandFromGrade("SLIGHT EDGE B", 0.9)).toBe("SLIGHT EDGE THEM");
    expect(fairnessBandFromGrade("A WINS", 1.25)).toBe("AGGRESSIVE ASK");
    expect(fairnessBandFromGrade("LOPSIDED", 1.8)).toBe("UNREALISTIC");
  });
});

describe("Trade Finder manager behavior grounding", () => {
  it("does not claim tendencies without completed-trade evidence", () => {
    const { fit, note } = behaviorFitForTrade(undefined, [
      asset({ playerId: 3, name: "James Cook", position: "RB", weeklyProjection: 16 }),
    ]);
    expect(fit).toBe("NONE");
    expect(note).toBeNull();
  });

  it("grounds a position claim in actual completed-trade counts", () => {
    const { fit, note } = behaviorFitForTrade(
      {
        completedTrades: 6,
        mostAcquiredPos: "RB",
        mostTradedAwayPos: "WR",
        twoForOneCount: 1,
        pickReceiptCount: 0,
      },
      [asset({ playerId: 3, name: "James Cook", position: "RB", weeklyProjection: 16 })],
    );
    expect(fit === "STRONG" || fit === "MODERATE").toBe(true);
    expect(note).toMatch(/6 completed league trades/);
    expect(note).toMatch(/RB/);
  });
});

describe("Trade Finder replacement uses league lineup slots", () => {
  it("11b. replacement math follows dedicated slots, not a hardcoded 14-team chart", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const repl = leagueReplacementByPosition(league.teams, league.slots);
    expect(repl.RB).toBeGreaterThan(0);
    const user = league.teams[0];
    const needs = analyzeTeamNeeds(user.roster, { ...DEFAULT_ROSTER_SLOTS, RB: 1, WR: 3, FLEX: 0 }, repl);
    const wr = needs.find((n) => n.position === "WR");
    expect(wr).toBeTruthy();
  });
});

function dstHighestNeedLeague() {
  const league = rbWrComplementLeague();
  const dst = league.teams[0].roster.find((a) => a.position === "DST")!;
  dst.weeklyProjection = 1;
  dst.tradeValue = 8;
  const extraDst: TradeFinderAsset = {
    ...dst,
    playerId: 201,
    assetId: "p:201",
    name: "Jets D/ST",
    weeklyProjection: 9,
    tradeValue: 45,
    starter: false,
    bench: true,
  };
  league.teams[1].roster.push(extraDst);
  return league;
}

function kHighestNeedLeague() {
  const user = team(1, "You", [
    asset({ playerId: 1, name: "Josh Allen", position: "QB", weeklyProjection: 22, starter: true, tradeValue: 220 }),
    asset({ playerId: 2, name: "Zamir White", position: "RB", weeklyProjection: 7, starter: true, tradeValue: 70 }),
    asset({ playerId: 3, name: "Elijah Mitchell", position: "RB", weeklyProjection: 5, starter: true, tradeValue: 50 }),
    asset({ playerId: 4, name: "Amon-Ra St. Brown", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
    asset({ playerId: 5, name: "Garrett Wilson", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
    asset({ playerId: 6, name: "DK Metcalf", position: "WR", weeklyProjection: 14, starter: false, tradeValue: 140 }),
    asset({ playerId: 7, name: "Trey McBride", position: "TE", weeklyProjection: 12, starter: true, tradeValue: 120 }),
    asset({ playerId: 8, name: "Bad Kicker", position: "K", weeklyProjection: 1, starter: true, tradeValue: 8 }),
    asset({ playerId: 9, name: "Bills D/ST", position: "DST", weeklyProjection: 8, starter: true, tradeValue: 40 }),
  ]);
  const mike = team(2, "Mike", [
    asset({ playerId: 11, name: "Jalen Hurts", position: "QB", weeklyProjection: 21, starter: true, tradeValue: 210 }),
    asset({ playerId: 12, name: "Saquon Barkley", position: "RB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
    asset({ playerId: 13, name: "James Cook", position: "RB", weeklyProjection: 16, starter: true, tradeValue: 160 }),
    asset({ playerId: 14, name: "Rachaad White", position: "RB", weeklyProjection: 12, starter: false, tradeValue: 120 }),
    asset({ playerId: 15, name: "Jordan Addison", position: "WR", weeklyProjection: 8, starter: true, tradeValue: 80 }),
    asset({ playerId: 16, name: "Rashid Shaheed", position: "WR", weeklyProjection: 6, starter: true, tradeValue: 60 }),
    asset({ playerId: 17, name: "Dallas Goedert", position: "TE", weeklyProjection: 10, starter: true, tradeValue: 100 }),
    asset({ playerId: 18, name: "Younghoe Koo", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    asset({ playerId: 19, name: "49ers D/ST", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
  ]);
  const other = team(3, "Pat", [
    asset({ playerId: 21, name: "Patrick Mahomes", position: "QB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
    asset({ playerId: 22, name: "Breece Hall", position: "RB", weeklyProjection: 15, starter: true, tradeValue: 150 }),
    asset({ playerId: 23, name: "Kyren Williams", position: "RB", weeklyProjection: 14, starter: true, tradeValue: 140 }),
    asset({ playerId: 24, name: "CeeDee Lamb", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
    asset({ playerId: 25, name: "Puka Nacua", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
    asset({ playerId: 26, name: "Sam LaPorta", position: "TE", weeklyProjection: 11, starter: true, tradeValue: 110 }),
    asset({ playerId: 27, name: "Justin Tucker", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    asset({ playerId: 28, name: "Ravens D/ST", position: "DST", weeklyProjection: 8, starter: true, tradeValue: 40 }),
  ]);
  return leagueOf(1, [user, mike, other]);
}

describe("RFSN-061A trade-priority discovery", () => {
  it("1. DST highest raw need does not suppress useful WR opportunity", () => {
    const league = dstHighestNeedLeague();
    const needs = attachNeeds(league).teams[0].needs;
    const dst = needs.find((n) => n.position === "DST")!;
    const wr = needs.find((n) => n.position === "WR")!;
    expect(dst.needScore).toBeGreaterThan(wr.needScore);
    expect(dst.label).toBe("NEED");
    const result = findTrades(league, { targetPosition: "ANY", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.some((t) => t.youReceive.some((a) => a.position === "WR"))).toBe(true);
    expect(result.metrics.wantNeedPositions).toEqual(expect.arrayContaining(["QB", "RB", "WR", "TE"]));
    expect(result.metrics.candidatesGenerated).toBeGreaterThan(0);
  });

  it("2. K highest raw need does not suppress useful RB opportunity", () => {
    const league = kHighestNeedLeague();
    const needs = attachNeeds(league).teams[0].needs;
    const k = needs.find((n) => n.position === "K")!;
    const rb = needs.find((n) => n.position === "RB")!;
    expect(k.needScore).toBeGreaterThan(rb.needScore);
    expect(k.label).toBe("NEED");
    const result = findTrades(league, { targetPosition: "ANY", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.some((t) => t.youReceive.some((a) => a.position === "RB"))).toBe(true);
  });

  it("3. DST remains visible as roster need", () => {
    const result = findTrades(dstHighestNeedLeague());
    expect(result.userNeeds.some((n) => n.position === "DST" && n.label === "NEED")).toBe(true);
    const pri = result.tradePriority.find((n) => n.position === "DST")!;
    expect(pri.needScore).toBe(result.userNeeds.find((n) => n.position === "DST")!.needScore);
    expect(pri.tradePriorityScore).toBeCloseTo(Math.round(pri.needScore * TRADE_FINDER_PRIORITY_MULTIPLIER.DST * 10) / 10, 5);
  });

  it("4. explicit TARGET=DST restores full DST trade priority", () => {
    const league = dstHighestNeedLeague();
    const any = findTrades(league, { targetPosition: "ANY", topN: 5 });
    expect(any.trades.every((t) => t.youReceive.every((a) => a.position !== "DST"))).toBe(true);
    const targeted = findTrades(league, { targetPosition: "DST", topN: 10 });
    expect(tradePriorityMultiplier("DST", { targetPosition: "DST" })).toBe(1);
    expect(targeted.trades.some((t) => t.youReceive.some((a) => a.position === "DST"))).toBe(true);
    const pri = targeted.tradePriority.find((n) => n.position === "DST")!;
    expect(pri.tradePriorityScore).toBeCloseTo(Math.round(pri.needScore * 10) / 10, 5);
  });

  it("5. no useful offensive opportunity still returns empty state", () => {
    const user = team(1, "You", [
      asset({ playerId: 1, name: "A", position: "QB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
      asset({ playerId: 2, name: "B", position: "RB", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 3, name: "C", position: "RB", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 4, name: "D", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 5, name: "E", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 6, name: "F", position: "TE", weeklyProjection: 12, starter: true, tradeValue: 120 }),
      asset({ playerId: 7, name: "G", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 8, name: "H", position: "DST", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    ]);
    const clone = team(2, "Clone", user.roster.map((a) => ({ ...a, playerId: a.playerId! + 100, assetId: `p:${a.playerId! + 100}` })));
    const result = findTrades(leagueOf(1, [user, clone]));
    expect(result.trades).toHaveLength(0);
    expect(result.emptyExplanation).toMatch(/No strong trade opportunities right now/);
  });

  it("6. trade-priority multiplier does not alter canonical player values", () => {
    const league = dstHighestNeedLeague();
    const before = league.teams.flatMap((t) => t.roster).map((a) => `${a.playerId}:${a.tradeValue}`);
    const result = findTrades(league);
    expect(league.teams.flatMap((t) => t.roster).map((a) => `${a.playerId}:${a.tradeValue}`)).toEqual(before);
    for (const t of result.trades) {
      for (const a of [...t.youGive, ...t.youReceive]) {
        const src = league.teams.flatMap((x) => x.roster).find((r) => r.assetId === a.assetId);
        expect(src).toBeTruthy();
        expect(a.tradeValue).toBe(src!.tradeValue);
      }
    }
  });

  it("7. trade-priority multiplier does not alter fairness authority", () => {
    const cmp = compareGivenSideTotals(40, 180, Math.round(50 * PICK_TO_MARKET_SCALE));
    const grade = cmp.fairnessGrade || fairnessGradeFromGainRatio(cmp.gainRatioA);
    expect(fairnessBandFromGrade(grade, cmp.gainRatioA)).toBe("UNREALISTIC");
    const result = findTrades(dstHighestNeedLeague());
    expect(result.trades.every((t) => t.fairness !== "UNREALISTIC")).toBe(true);
  });

  it("8. partner benefit remains required", () => {
    const result = findTrades(dstHighestNeedLeague(), { risk: "balanced", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    for (const t of result.trades) {
      expect(t.partnerNeedFit).toBeGreaterThan(0);
    }
  });

  it("9. existing RB-surplus / WR-need case remains stable", () => {
    const result = findTrades(rbWrComplementLeague(), { targetPosition: "WR", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    const hit = result.trades.find((t) => t.partnerName === "Mike");
    expect(hit).toBeTruthy();
    expect(hit!.youReceive.some((a) => a.position === "WR")).toBe(true);
    expect(hit!.youGive.some((a) => a.position === "RB")).toBe(true);
  });

  it("10. deterministic ranking remains stable", () => {
    const a = findTrades(dstHighestNeedLeague(), { topN: 5 });
    const b = findTrades(dstHighestNeedLeague(), { topN: 5 });
    expect(a.trades.map((t) => `${t.partnerTeamId}:${t.youGive.map((x) => x.assetId).join(",")}:${t.youReceive.map((x) => x.assetId).join(",")}`)).toEqual(
      b.trades.map((t) => `${t.partnerTeamId}:${t.youGive.map((x) => x.assetId).join(",")}:${t.youReceive.map((x) => x.assetId).join(",")}`),
    );
  });

  it("IDP starting slots keep full trade priority (not 0.20)", () => {
    expect(tradePriorityMultiplier("DP", { targetPosition: "ANY" }, { ...DEFAULT_ROSTER_SLOTS, DP: 2 })).toBe(1);
    expect(tradePriorityMultiplier("DP", { targetPosition: "ANY" }, { ...DEFAULT_ROSTER_SLOTS, DP: 0 })).toBe(0.2);
    expect(tradePriorityScore(80, "DST", { targetPosition: "ANY" })).toBe(16);
    expect(tradePriorityScore(80, "DST", { targetPosition: "DST" })).toBe(80);
  });
});
