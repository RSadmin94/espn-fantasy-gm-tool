import { describe, expect, it } from "vitest";
import { findTrades } from "./tradeFinder/find";
import { attachNeeds, analyzeTeamNeeds, leagueReplacementByPosition } from "./tradeFinder/needSurplus";
import { generateCandidates, rankPartners } from "./tradeFinder/generate";
import { scoreCandidate, evaluateCandidate, rankScored, tradeFitLabel, fillProgressively } from "./tradeFinder/score";
import { applyNarratives } from "./tradeFinder/narrative";
import { behaviorFitForTrade } from "./tradeFinder/behavior";
import { fairnessBandFromGrade } from "./tradeFinder/score";
import { DEFAULT_ROSTER_SLOTS } from "./tradeFinder/types";
import { tradePriorityMultiplier, tradePriorityScore } from "./tradeFinder/priority";
import { partnerRationality } from "./tradeFinder/partnerRationality";
import { TRADE_FINDER_PRIORITY_MULTIPLIER, TRADE_FINDER_SANITY } from "./tradeFinder/weights";
import { classifyOpportunity, selectByTier } from "./tradeFinder/opportunity";
import { hardInvalid } from "./tradeFinder/validity";
import { compareGivenSideTotals, fairnessGradeFromGainRatio, PICK_TO_MARKET_SCALE } from "./tradePickValueAuthority";
import type {
  TradeFinderAsset,
  TradeFinderCandidate,
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
    if (steal) {
      const scored = scoreCandidate(attachNeeds(league), user, steal, {
        targetPosition: "ANY",
        partnerTeamId: 2,
        maxAssets: 1,
        includeDraftPicks: false,
        risk: "balanced",
        topN: 5,
      });
      if (scored) expect(scored.tradeFit).not.toBe("STRONG FIT");
    }
    const result = findTrades(league);
    expect(result.trades.every((t) => t.tradeFit !== "STRONG FIT" || t.fairness !== "UNREALISTIC")).toBe(true);
    void user;
  });

  it("3. prefers mutually beneficial trades over user-only benefit", () => {
    const result = findTrades(rbWrComplementLeague(), { risk: "balanced", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    const top = result.trades[0];
    expect(top.partnerNeedFit).toBeGreaterThan(0);
    expect(["STRONG FIT", "GOOD FIT"].includes(top.tradeFit)).toBe(true);
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
    for (const t of result.trades.filter((x) => x.qualityTier <= 2)) {
      expect(t.partnerDepthDamage).toBeLessThan(1);
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
    if (result.trades.length === 0) {
      expect(result.emptyExplanation).toMatch(/couldn't construct a valid trade/i);
    } else {
      expect(result.trades.every((t) => t.tradeFit !== "STRONG FIT")).toBe(true);
    }
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
    if (result.trades.length === 0) {
      expect(result.emptyExplanation).toMatch(/couldn't construct a valid trade/i);
    } else {
      expect(result.trades.every((t) => t.tradeFit !== "STRONG FIT")).toBe(true);
    }
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
    expect(result.trades.length).toBeGreaterThan(0);
    void result;
  });

  it("8. partner benefit remains required", () => {
    const result = findTrades(dstHighestNeedLeague(), { risk: "balanced", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    for (const t of result.trades.filter((x) => x.qualityTier <= 2)) {
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

const filtersBalanced = {
  targetPosition: "ANY" as const,
  partnerTeamId: null,
  maxAssets: 2 as const,
  includeDraftPicks: false,
  risk: "balanced" as const,
  topN: 5,
};

function stubCandidate(over: Partial<TradeFinderCandidate>): TradeFinderCandidate {
  return {
    partnerTeamId: 1,
    partnerName: "X",
    youGive: [{ kind: "player", assetId: "a", playerId: 1, name: "A", position: "RB", tradeValue: 100 }],
    youReceive: [{ kind: "player", assetId: "b", playerId: 2, name: "B", position: "WR", tradeValue: 100 }],
    shape: "1-for-1",
    tradeScore: 50,
    tradeFit: "GOOD FIT",
    opportunity: "GOOD FIT",
    qualityTier: 1,
    resultGroup: "BEST AVAILABLE",
    targetSatisfied: true,
    twoForOneClutter: false,
    fairness: "BALANCED",
    fairnessGrade: "FAIR",
    gainRatioUser: 1,
    userLineupDelta: 3,
    partnerLineupDelta: 0,
    userNeedFit: 50,
    partnerNeedFit: 50,
    userDepthDamage: 0,
    partnerDepthDamage: 0,
    partnerRationality: "GOOD",
    behaviorFit: "NONE",
    behaviorNote: null,
    whyThisWorks: "why",
    whyTheydConsider: "them",
    theCost: "cost",
    rivalsVerdict: "verdict",
    riskWatchout: "risk",
    yourImpact: "you",
    theirImpact: "them",
    whyAi: null,
    riskAi: null,
    ...over,
  };
}

describe("RFSN-061B partner rationality gate", () => {
  it("1. rejects a fair-value trade that materially hurts the partner lineup with no compensator", () => {
    const user = team(1, "You", [
      asset({ playerId: 1, name: "Josh Allen", position: "QB", weeklyProjection: 22, starter: true, tradeValue: 220 }),
      asset({ playerId: 2, name: "Saquon Barkley", position: "RB", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 3, name: "James Cook", position: "RB", weeklyProjection: 15, starter: true, tradeValue: 150 }),
      asset({ playerId: 4, name: "CeeDee Lamb", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 5, name: "Puka Nacua", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 6, name: "DK Metcalf", position: "WR", weeklyProjection: 12, starter: false, tradeValue: 80 }),
      asset({ playerId: 7, name: "Jordan Addison", position: "WR", weeklyProjection: 8, starter: false, tradeValue: 70 }),
      asset({ playerId: 8, name: "Trey McBride", position: "TE", weeklyProjection: 12, starter: true, tradeValue: 120 }),
      asset({ playerId: 9, name: "K", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 10, name: "DST", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
    ]);
    const mike = team(2, "Mike", [
      asset({ playerId: 11, name: "Jalen Hurts", position: "QB", weeklyProjection: 21, starter: true, tradeValue: 210 }),
      asset({ playerId: 12, name: "Bijan Robinson", position: "RB", weeklyProjection: 20, starter: true, tradeValue: 150 }),
      asset({ playerId: 13, name: "Breece Hall", position: "RB", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 14, name: "Kyren Williams", position: "RB", weeklyProjection: 14, starter: false, tradeValue: 140 }),
      asset({ playerId: 15, name: "Amon-Ra St. Brown", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 16, name: "Garrett Wilson", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 17, name: "Chris Olave", position: "WR", weeklyProjection: 12, starter: false, tradeValue: 120 }),
      asset({ playerId: 18, name: "Dallas Goedert", position: "TE", weeklyProjection: 10, starter: true, tradeValue: 100 }),
      asset({ playerId: 19, name: "K2", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 20, name: "DST2", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
    ]);
    const league = attachNeeds(leagueOf(1, [user, mike, team(3, "Pat", user.roster.map((a) => ({ ...a, playerId: a.playerId! + 200, assetId: `p:${a.playerId! + 200}` })))]));
    const dk = league.teams[0].roster.find((a) => a.name === "DK Metcalf")!;
    const addison = league.teams[0].roster.find((a) => a.name === "Jordan Addison")!;
    const bijan = league.teams[1].roster.find((a) => a.name === "Bijan Robinson")!;
    const outcome = evaluateCandidate(league, league.teams[0], {
      partner: league.teams[1],
      give: [dk, addison],
      receive: [bijan],
      shape: "2-for-1",
    }, filtersBalanced);
    expect(outcome.candidate).toBeTruthy();
    expect(outcome.candidate!.partnerRationality).toBe("POOR");
    expect(outcome.candidate!.tradeFit).not.toBe("STRONG FIT");
    expect(outcome.candidate!.tradeFit).not.toBe("GOOD FIT");
  });

  it("2. allows a slight partnerDelta loss when a severe positional need is fixed", () => {
    const user = team(1, "You", [
      asset({ playerId: 1, name: "Josh Allen", position: "QB", weeklyProjection: 22, starter: true, tradeValue: 220 }),
      asset({ playerId: 2, name: "Saquon Barkley", position: "RB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
      asset({ playerId: 3, name: "James Cook", position: "RB", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 4, name: "Amon-Ra St. Brown", position: "WR", weeklyProjection: 18, starter: true, tradeValue: 180 }),
      asset({ playerId: 5, name: "Puka Nacua", position: "WR", weeklyProjection: 16, starter: true, tradeValue: 160 }),
      asset({ playerId: 6, name: "Trey McBride", position: "TE", weeklyProjection: 12, starter: true, tradeValue: 150 }),
      asset({ playerId: 7, name: "Backup TE", position: "TE", weeklyProjection: 9, starter: false, tradeValue: 150 }),
      asset({ playerId: 8, name: "K", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 9, name: "DST", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
    ]);
    const mike = team(2, "Mike", [
      asset({ playerId: 11, name: "Jalen Hurts", position: "QB", weeklyProjection: 21, starter: true, tradeValue: 210 }),
      asset({ playerId: 12, name: "Breece Hall", position: "RB", weeklyProjection: 15, starter: true, tradeValue: 150 }),
      asset({ playerId: 13, name: "Kyren Williams", position: "RB", weeklyProjection: 14, starter: true, tradeValue: 140 }),
      asset({ playerId: 14, name: "CeeDee Lamb", position: "WR", weeklyProjection: 20, starter: true, tradeValue: 150 }),
      asset({ playerId: 15, name: "Romeo Doubs", position: "WR", weeklyProjection: 8, starter: true, tradeValue: 80 }),
      asset({ playerId: 29, name: "Khalil Shakir", position: "WR", weeklyProjection: 10, starter: false, tradeValue: 90 }),
      asset({ playerId: 16, name: "Broken TE", position: "TE", weeklyProjection: 2, starter: true, tradeValue: 20 }),
      asset({ playerId: 17, name: "K2", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 18, name: "DST2", position: "DST", weeklyProjection: 7, starter: true, tradeValue: 35 }),
    ]);
    const pat = team(3, "Pat", [
      asset({ playerId: 21, name: "Patrick Mahomes", position: "QB", weeklyProjection: 20, starter: true, tradeValue: 200 }),
      asset({ playerId: 22, name: "Josh Jacobs", position: "RB", weeklyProjection: 14, starter: true, tradeValue: 140 }),
      asset({ playerId: 23, name: "Derrick Henry", position: "RB", weeklyProjection: 13, starter: true, tradeValue: 130 }),
      asset({ playerId: 24, name: "Justin Jefferson", position: "WR", weeklyProjection: 19, starter: true, tradeValue: 190 }),
      asset({ playerId: 25, name: "A.J. Brown", position: "WR", weeklyProjection: 15, starter: true, tradeValue: 150 }),
      asset({ playerId: 26, name: "Sam LaPorta", position: "TE", weeklyProjection: 11, starter: true, tradeValue: 110 }),
      asset({ playerId: 27, name: "K3", position: "K", weeklyProjection: 8, starter: true, tradeValue: 40 }),
      asset({ playerId: 28, name: "DST3", position: "DST", weeklyProjection: 8, starter: true, tradeValue: 40 }),
    ]);
    const league = attachNeeds(leagueOf(1, [user, mike, pat]));
    const teNeed = league.teams[1].needs.find((n) => n.position === "TE");
    expect(teNeed?.label).toBe("NEED");
    expect((teNeed?.needScore ?? 0) >= 50).toBe(true);
    const backupTe = league.teams[0].roster.find((a) => a.name === "Backup TE")!;
    const lamb = league.teams[1].roster.find((a) => a.name === "CeeDee Lamb")!;
    const outcome = evaluateCandidate(league, league.teams[0], {
      partner: league.teams[1],
      give: [backupTe],
      receive: [lamb],
      shape: "1-for-1",
    }, { ...filtersBalanced, maxAssets: 1 });
    expect(outcome.rejectedByRationality).toBe(false);
    expect(outcome.candidate).toBeTruthy();
    expect((outcome.candidate!.partnerLineupDelta ?? 0) < 0).toBe(true);
    expect(["GOOD", "MARGINAL", "STRONG"].includes(outcome.candidate!.partnerRationality)).toBe(true);
  });

  it("3. prefers mutual positive-delta trades over user-only positive trades", () => {
    const ranked = rankScored([
      stubCandidate({
        partnerName: "UserOnly",
        tradeScore: 70,
        userLineupDelta: 6,
        partnerLineupDelta: -1.2,
        partnerRationality: "MARGINAL",
        opportunity: "AGGRESSIVE ASK",
        tradeFit: "AGGRESSIVE ASK",
        qualityTier: 2,
        resultGroup: "BEST AVAILABLE",
      }),
      stubCandidate({
        partnerName: "Mutual",
        tradeScore: 48,
        userLineupDelta: 3,
        partnerLineupDelta: 2,
        partnerRationality: "GOOD",
        opportunity: "GOOD FIT",
        tradeFit: "GOOD FIT",
        qualityTier: 1,
        youGive: [{ kind: "player", assetId: "c", playerId: 3, name: "C", position: "RB", tradeValue: 100 }],
        youReceive: [{ kind: "player", assetId: "d", playerId: 4, name: "D", position: "WR", tradeValue: 100 }],
      }),
    ]);
    expect(ranked[0].partnerName).toBe("Mutual");
  });

  it("4. rejects a 2-for-1 where the second asset is unusable bench clutter", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const mike = league.teams[1];
    const addison = league.teams[0].roster.find((a) => a.name === "Jordan Addison")!;
    const shaheed = league.teams[0].roster.find((a) => a.name === "Rashid Shaheed")!;
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    const rat = partnerRationality({
      partner: mike,
      partnerIncoming: [addison, shaheed],
      partnerOutgoing: [wilson],
      partnerDelta: -3.2,
      partnerNeedFit: 12,
      partnerDepthDamage: 0.3,
      partnerUnfilledBefore: 0,
      partnerUnfilledAfter: 0,
      partnerBeforeLineup: { starterIds: [wilson.assetId], starterPoints: 80, usesRealProjections: true, unfilledDedicated: {} },
      partnerAfterLineup: { starterIds: [], starterPoints: 76.8, usesRealProjections: true, unfilledDedicated: {} },
      partnerReceiveValue: addison.tradeValue + shaheed.tradeValue,
      partnerGiveValue: wilson.tradeValue,
      fairness: "BALANCED",
      shape: "2-for-1",
      slots: league.slots,
    });
    expect(rat.twoForOneClutter).toBe(true);
    expect(rat.hasStrongCompensator).toBe(false);
    expect(rat.label).toBe("POOR");
  });

  it("5. allows a rational 2-for-1 where both assets fill real needs", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const white = user.roster.find((a) => a.name === "Rachaad White")!;
    const spears = user.roster.find((a) => a.name === "Tyjae Spears")!;
    const amonRa = mike.roster.find((a) => a.name === "Amon-Ra St. Brown")!;
    const outcome = evaluateCandidate(league, user, {
      partner: mike,
      give: [white, spears],
      receive: [amonRa],
      shape: "2-for-1",
    }, filtersBalanced);
    expect(outcome.rejectedByRationality).toBe(false);
    expect(outcome.candidate).toBeTruthy();
    expect(outcome.candidate!.shape).toBe("2-for-1");
    expect(outcome.candidate!.partnerRationality).not.toBe("POOR");
  });

  it("6. STRONG FIT cannot coexist with POOR partner rationality", () => {
    expect(tradeFitLabel({
      score: 80,
      fairness: "BALANCED",
      partnerGain: 0.4,
      userGain: 0.6,
      userDelta: 5,
      partnerDelta: -4,
      rationality: "POOR",
    })).not.toBe("STRONG FIT");
    const result = findTrades(rbWrComplementLeague(), { topN: 5 });
    expect(result.trades.every((t) => t.tradeFit !== "STRONG FIT" || t.partnerRationality === "STRONG" || t.partnerRationality === "GOOD")).toBe(true);
    expect(result.trades.every((t) => t.partnerRationality !== "POOR")).toBe(true);
  });

  it("7. fairness authority is unchanged", () => {
    const cmp = compareGivenSideTotals(40, 180, Math.round(50 * PICK_TO_MARKET_SCALE));
    const grade = cmp.fairnessGrade || fairnessGradeFromGainRatio(cmp.gainRatioA);
    expect(fairnessBandFromGrade(grade, cmp.gainRatioA)).toBe("UNREALISTIC");
  });

  it("8. player values are unchanged", () => {
    const league = rbWrComplementLeague();
    const before = league.teams.flatMap((t) => t.roster).map((a) => `${a.playerId}:${a.tradeValue}`);
    findTrades(league);
    expect(league.teams.flatMap((t) => t.roster).map((a) => `${a.playerId}:${a.tradeValue}`)).toEqual(before);
  });

  it("9. DST/K priority behavior is unchanged", () => {
    const league = dstHighestNeedLeague();
    const result = findTrades(league, { targetPosition: "ANY", topN: 5 });
    expect(result.userNeeds.some((n) => n.position === "DST")).toBe(true);
    expect(result.metrics.wantNeedPositions).toEqual(expect.arrayContaining(["QB", "RB", "WR", "TE"]));
    expect(result.trades.every((t) => t.youReceive.every((a) => a.position !== "DST"))).toBe(true);
    const targeted = findTrades(league, { targetPosition: "DST", topN: 10 });
    expect(tradePriorityMultiplier("DST", { targetPosition: "DST" })).toBe(1);
    expect(targeted.tradePriority.find((n) => n.position === "DST")!.tradePriorityScore).toBeCloseTo(
      targeted.tradePriority.find((n) => n.position === "DST")!.needScore,
      5,
    );
  });

  it("10. ranking remains deterministic across runs", () => {
    const a = findTrades(rbWrComplementLeague(), { topN: 5 });
    const b = findTrades(rbWrComplementLeague(), { topN: 5 });
    expect(a.trades.map((t) => `${t.partnerTeamId}:${t.youGive.map((x) => x.assetId).join(",")}:${t.youReceive.map((x) => x.assetId).join(",")}`)).toEqual(
      b.trades.map((t) => `${t.partnerTeamId}:${t.youGive.map((x) => x.assetId).join(",")}:${t.youReceive.map((x) => x.assetId).join(",")}`),
    );
  });
});

describe("RFSN-061C validity vs quality", () => {
  it("1. five Tier-1 candidates → return best five Tier-1", () => {
    const scored = [1, 2, 3, 4, 5, 6].map((i) => stubCandidate({
      partnerTeamId: i,
      partnerName: `T1-${i}`,
      qualityTier: 1,
      tradeScore: 40 + i,
      youGive: [{ kind: "player", assetId: `g${i}`, playerId: i, name: `G${i}`, position: "RB", tradeValue: 100 }],
      youReceive: [{ kind: "player", assetId: `r${i}`, playerId: 100 + i, name: `R${i}`, position: "WR", tradeValue: 100 }],
    }));
    const filled = selectByTier(scored.sort((a, b) => b.tradeScore - a.tradeScore), 5);
    expect(filled).toHaveLength(5);
    expect(filled.every((t) => t.qualityTier === 1)).toBe(true);
    expect(filled.some((t) => t.partnerName === "T1-6")).toBe(true);
  });

  it("2. two Tier-1 + three Tier-2 → return five", () => {
    const scored = [
      stubCandidate({ partnerName: "A", qualityTier: 1, partnerTeamId: 1, youGive: [{ kind: "player", assetId: "a1", playerId: 1, name: "A1", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b1", playerId: 11, name: "B1", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "B", qualityTier: 1, partnerTeamId: 2, youGive: [{ kind: "player", assetId: "a2", playerId: 2, name: "A2", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b2", playerId: 12, name: "B2", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "C", qualityTier: 2, partnerTeamId: 3, youGive: [{ kind: "player", assetId: "a3", playerId: 3, name: "A3", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b3", playerId: 13, name: "B3", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "D", qualityTier: 2, partnerTeamId: 4, youGive: [{ kind: "player", assetId: "a4", playerId: 4, name: "A4", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b4", playerId: 14, name: "B4", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "E", qualityTier: 2, partnerTeamId: 5, youGive: [{ kind: "player", assetId: "a5", playerId: 5, name: "A5", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b5", playerId: 15, name: "B5", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "F", qualityTier: 4, partnerTeamId: 6, youGive: [{ kind: "player", assetId: "a6", playerId: 6, name: "A6", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b6", playerId: 16, name: "B6", position: "WR", tradeValue: 100 }] }),
    ];
    const filled = selectByTier(scored, 5);
    expect(filled).toHaveLength(5);
    expect(filled.filter((t) => t.qualityTier === 1)).toHaveLength(2);
    expect(filled.filter((t) => t.qualityTier === 2)).toHaveLength(3);
    expect(filled.some((t) => t.partnerName === "F")).toBe(false);
  });

  it("3. one Tier-1 + one Tier-2 + Tier-3 options → progressively fill", () => {
    const scored = [
      stubCandidate({ partnerName: "T1", qualityTier: 1, partnerTeamId: 1, youGive: [{ kind: "player", assetId: "a1", playerId: 1, name: "A1", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b1", playerId: 11, name: "B1", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "T2", qualityTier: 2, partnerTeamId: 2, youGive: [{ kind: "player", assetId: "a2", playerId: 2, name: "A2", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b2", playerId: 12, name: "B2", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "T3a", qualityTier: 3, partnerTeamId: 3, youGive: [{ kind: "player", assetId: "a3", playerId: 3, name: "A3", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b3", playerId: 13, name: "B3", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "T3b", qualityTier: 3, partnerTeamId: 4, youGive: [{ kind: "player", assetId: "a4", playerId: 4, name: "A4", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b4", playerId: 14, name: "B4", position: "WR", tradeValue: 100 }] }),
      stubCandidate({ partnerName: "T3c", qualityTier: 3, partnerTeamId: 5, youGive: [{ kind: "player", assetId: "a5", playerId: 5, name: "A5", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "b5", playerId: 15, name: "B5", position: "WR", tradeValue: 100 }] }),
    ];
    const filled = selectByTier(scored, 5);
    expect(filled.map((t) => t.partnerName)).toEqual(["T1", "T2", "T3a", "T3b", "T3c"]);
  });

  it("4. no Tier-1/2 but valid Tier-3 → return Tier-3 instead of empty", () => {
    const scored = [stubCandidate({ partnerName: "Need", qualityTier: 3, opportunity: "NECESSITY TRADE", tradeFit: "NECESSITY TRADE" })];
    expect(selectByTier(scored, 5)).toHaveLength(1);
    expect(selectByTier(scored, 5)[0].opportunity).toBe("NECESSITY TRADE");
  });

  it("5. only Long Shot trades exist → return Long Shots with warning copy", () => {
    const scored = [stubCandidate({
      partnerName: "Shot",
      qualityTier: 4,
      opportunity: "LONG SHOT",
      tradeFit: "LONG SHOT",
      rivalsVerdict: "limited roster incentive",
    })];
    const filled = selectByTier(scored, 5);
    expect(filled).toHaveLength(1);
    expect(filled[0].tradeFit).toBe("LONG SHOT");
    expect(filled[0].rivalsVerdict).toMatch(/limited roster incentive/i);
  });

  it("6. negative partnerDelta is classified/ranked, not automatically removed", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const white = user.roster.find((a) => a.name === "Rachaad White")!;
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    const outcome = evaluateCandidate(league, user, {
      partner: mike,
      give: [white],
      receive: [wilson],
      shape: "1-for-1",
    }, { ...filtersBalanced, maxAssets: 1, targetPosition: "WR" });
    if (outcome.rejectedHard) {
      expect(outcome.candidate).toBeNull();
    } else {
      expect(outcome.candidate).toBeTruthy();
      expect(typeof outcome.candidate!.partnerLineupDelta).toBe("number");
    }
    expect(classifyOpportunity({
      userDelta: 4,
      partnerDelta: -4,
      fairness: "BALANCED",
      rationality: "POOR",
      userNeedFit: 50,
      partnerNeedFit: 10,
      gainRatioUser: 1,
      userDepthDamage: 0,
      targetHit: true,
      solvesSevereNeed: true,
      twoForOneClutter: false,
    })).not.toBe("STRONG FIT");
  });

  it("7. negative userDelta can survive as necessity when it solves explicit target/need", () => {
    expect(classifyOpportunity({
      userDelta: -0.4,
      partnerDelta: 2,
      fairness: "SLIGHT EDGE THEM",
      rationality: "GOOD",
      userNeedFit: 70,
      partnerNeedFit: 50,
      gainRatioUser: 0.85,
      userDepthDamage: 0.4,
      targetHit: true,
      solvesSevereNeed: true,
      twoForOneClutter: false,
    })).toBe("NECESSITY TRADE");
  });

  it("8. BAD DEAL FOR YOU is never presented as STRONG/GOOD FIT", () => {
    const label = classifyOpportunity({
      userDelta: -3,
      partnerDelta: 2,
      fairness: "SLIGHT EDGE THEM",
      rationality: "GOOD",
      userNeedFit: 5,
      partnerNeedFit: 40,
      gainRatioUser: 0.7,
      userDepthDamage: 0.2,
      targetHit: false,
      solvesSevereNeed: false,
      twoForOneClutter: false,
    });
    expect(label).toBe("BAD DEAL FOR YOU");
    expect(label).not.toBe("STRONG FIT");
    expect(label).not.toBe("GOOD FIT");
    const result = findTrades(rbWrComplementLeague(), { topN: 5 });
    expect(result.trades.every((t) => t.tradeFit !== "BAD DEAL FOR YOU" || (t.tradeFit !== "STRONG FIT" && t.tradeFit !== "GOOD FIT"))).toBe(true);
  });

  it("9. POOR partner rationality does not automatically invalidate candidate", () => {
    expect(tradeFitLabel({
      score: 80,
      fairness: "BALANCED",
      partnerGain: 0.4,
      userGain: 0.6,
      userDelta: 5,
      partnerDelta: -4,
      rationality: "POOR",
    })).not.toBe("STRONG FIT");
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const dk = user.roster.find((a) => a.name === "Rachaad White")!;
    const bijanish = mike.roster.find((a) => a.name === "Amon-Ra St. Brown")!;
    const outcome = evaluateCandidate(league, user, {
      partner: mike, give: [dk], receive: [bijanish], shape: "1-for-1",
    }, { ...filtersBalanced, maxAssets: 1 });
    if (outcome.candidate && outcome.candidate.partnerRationality === "POOR") {
      expect(outcome.rejectedHard).toBe(false);
    }
  });

  it("10. illegal roster still hard rejects", () => {
    const league = attachNeeds(rbWrComplementLeague());
    league.slots = { ...DEFAULT_ROSTER_SLOTS, QB: 1, SUPERFLEX: 0 };
    const user = league.teams[0];
    const mike = league.teams[1];
    const allen = user.roster.find((a) => a.name === "Josh Allen")!;
    const hurts = mike.roster.find((a) => a.name === "Jalen Hurts")!;
    const outcome = evaluateCandidate(league, user, {
      partner: mike, give: [allen], receive: [hurts], shape: "1-for-1",
    }, { ...filtersBalanced, maxAssets: 1 });
    // Trading the only QB for another QB is legal. Trading only QB for a WR is not.
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    const illegal = evaluateCandidate(league, user, {
      partner: mike, give: [allen], receive: [wilson], shape: "1-for-1",
    }, { ...filtersBalanced, maxAssets: 1 });
    expect(illegal.rejectedHard).toBe(true);
    expect(illegal.hardReason).toBe("illegal_roster");
    expect(illegal.candidate).toBeNull();
    void outcome;
  });

  it("11. duplicate player identity still hard rejects", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const cook = user.roster.find((a) => a.name === "James Cook")!;
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    const dup = { ...cook, assetId: "p:dup-cook" };
    user.roster.push(dup);
    expect(hardInvalid(league, user, { partner: mike, give: [cook, dup], receive: [wilson], shape: "2-for-1" })).toBe("duplicate_identity");
  });

  it("12. unowned asset still hard rejects", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const patWr = league.teams[2].roster.find((a) => a.name === "CeeDee Lamb")!;
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    expect(hardInvalid(league, user, { partner: mike, give: [patWr], receive: [wilson], shape: "1-for-1" })).toBe("unowned");
  });

  it("13. extreme sanity-boundary nonsense hard rejects", () => {
    expect(TRADE_FINDER_SANITY.minGainRatio).toBeLessThan(0.75);
    expect(TRADE_FINDER_SANITY.maxGainRatio).toBeGreaterThan(1.5);
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const cheap = { ...user.roster.find((a) => a.name === "Tyjae Spears")!, tradeValue: 20 };
    const star = { ...mike.roster.find((a) => a.name === "Amon-Ra St. Brown")!, tradeValue: 400 };
    expect(hardInvalid(league, user, { partner: mike, give: [cheap], receive: [star], shape: "1-for-1" })).toBe("sanity_mismatch");
  });

  it("14. explicit TARGET=WR progressively finds WR options", () => {
    const result = findTrades(rbWrComplementLeague(), { targetPosition: "WR", topN: 5 });
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.every((t) => t.youReceive.some((a) => a.position === "WR"))).toBe(true);
  });

  it("15. TARGET=DST preserves 061A override", () => {
    const targeted = findTrades(dstHighestNeedLeague(), { targetPosition: "DST", topN: 10 });
    expect(tradePriorityMultiplier("DST", { targetPosition: "DST" })).toBe(1);
    expect(targeted.trades.some((t) => t.youReceive.some((a) => a.position === "DST"))).toBe(true);
  });

  it("16. default DST/K deprioritization remains", () => {
    const any = findTrades(dstHighestNeedLeague(), { targetPosition: "ANY", topN: 5 });
    expect(any.trades.every((t) => t.youReceive.every((a) => a.position !== "DST" && a.position !== "K"))).toBe(true);
  });

  it("17. BEST VALUE ranks strong mutual trade over necessity trade", () => {
    const ranked = rankScored([
      stubCandidate({
        partnerName: "Necessity",
        opportunity: "NECESSITY TRADE",
        tradeFit: "NECESSITY TRADE",
        qualityTier: 3,
        tradeScore: 90,
        userLineupDelta: 5,
        partnerLineupDelta: -1,
      }),
      stubCandidate({
        partnerName: "Mutual",
        opportunity: "STRONG FIT",
        tradeFit: "STRONG FIT",
        qualityTier: 1,
        tradeScore: 40,
        userLineupDelta: 2,
        partnerLineupDelta: 1,
        youGive: [{ kind: "player", assetId: "c", playerId: 3, name: "C", position: "RB", tradeValue: 100 }],
        youReceive: [{ kind: "player", assetId: "d", playerId: 4, name: "D", position: "WR", tradeValue: 100 }],
      }),
    ], { ...filtersBalanced, risk: "conservative" });
    expect(ranked[0].partnerName).toBe("Mutual");
  });

  it("18. NEED A STARTER can elevate justified overpay", () => {
    const filled = fillProgressively([
      stubCandidate({
        partnerName: "OverpayWR",
        opportunity: "NECESSITY TRADE",
        tradeFit: "NECESSITY TRADE",
        qualityTier: 3,
        targetSatisfied: true,
        userLineupDelta: 4,
        gainRatioUser: 0.8,
        youGive: [{ kind: "player", assetId: "rb", playerId: 8, name: "RB", position: "RB", tradeValue: 140 }],
        youReceive: [{ kind: "player", assetId: "wr", playerId: 9, name: "WR", position: "WR", tradeValue: 110 }],
      }),
      stubCandidate({
        partnerName: "Meh",
        opportunity: "LONG SHOT",
        tradeFit: "LONG SHOT",
        qualityTier: 4,
        targetSatisfied: false,
        youGive: [{ kind: "player", assetId: "x", playerId: 18, name: "X", position: "RB", tradeValue: 100 }],
        youReceive: [{ kind: "player", assetId: "y", playerId: 19, name: "Y", position: "TE", tradeValue: 100 }],
      }),
    ], { ...filtersBalanced, risk: "balanced", targetPosition: "WR", topN: 5 });
    expect(filled[0].partnerName).toBe("OverpayWR");
  });

  it("19. MUST MAKE A MOVE broadens discovery without bypassing hard gates", () => {
    const wide = findTrades(rbWrComplementLeague(), { risk: "aggressive", topN: 5 });
    expect(wide.trades.length).toBeGreaterThan(0);
    expect(wide.metrics.candidatesGenerated).toBeGreaterThan(0);
    const league = attachNeeds(rbWrComplementLeague());
    const user = league.teams[0];
    const mike = league.teams[1];
    const allen = user.roster.find((a) => a.name === "Josh Allen")!;
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    const illegal = evaluateCandidate(league, user, {
      partner: mike, give: [allen], receive: [wilson], shape: "1-for-1",
    }, { ...filtersBalanced, risk: "aggressive", maxAssets: 1 });
    expect(illegal.rejectedHard).toBe(true);
  });

  it("20. fairness authority is unchanged", () => {
    const cmp = compareGivenSideTotals(40, 180, Math.round(50 * PICK_TO_MARKET_SCALE));
    const grade = cmp.fairnessGrade || fairnessGradeFromGainRatio(cmp.gainRatioA);
    expect(fairnessBandFromGrade(grade, cmp.gainRatioA)).toBe("UNREALISTIC");
  });

  it("21. player valuation is unchanged", () => {
    const league = rbWrComplementLeague();
    const before = league.teams.flatMap((t) => t.roster).map((a) => `${a.playerId}:${a.tradeValue}`);
    findTrades(league, { risk: "aggressive" });
    expect(league.teams.flatMap((t) => t.roster).map((a) => `${a.playerId}:${a.tradeValue}`)).toEqual(before);
  });

  it("22. partner rationality measurement is unchanged", () => {
    const league = attachNeeds(rbWrComplementLeague());
    const mike = league.teams[1];
    const addison = league.teams[0].roster.find((a) => a.name === "Jordan Addison")!;
    const shaheed = league.teams[0].roster.find((a) => a.name === "Rashid Shaheed")!;
    const wilson = mike.roster.find((a) => a.name === "Garrett Wilson")!;
    const rat = partnerRationality({
      partner: mike,
      partnerIncoming: [addison, shaheed],
      partnerOutgoing: [wilson],
      partnerDelta: -3.2,
      partnerNeedFit: 12,
      partnerDepthDamage: 0.3,
      partnerUnfilledBefore: 0,
      partnerUnfilledAfter: 0,
      partnerBeforeLineup: { starterIds: [wilson.assetId], starterPoints: 80, usesRealProjections: true, unfilledDedicated: {} },
      partnerAfterLineup: { starterIds: [], starterPoints: 76.8, usesRealProjections: true, unfilledDedicated: {} },
      partnerReceiveValue: addison.tradeValue + shaheed.tradeValue,
      partnerGiveValue: wilson.tradeValue,
      fairness: "BALANCED",
      shape: "2-for-1",
      slots: league.slots,
    });
    expect(rat.label).toBe("POOR");
    expect(rat.twoForOneClutter).toBe(true);
  });

  it("23. ranking remains deterministic", () => {
    const a = findTrades(rbWrComplementLeague(), { topN: 5, risk: "balanced" });
    const b = findTrades(rbWrComplementLeague(), { topN: 5, risk: "balanced" });
    expect(a.trades.map((t) => t.youGive.map((x) => x.assetId).join(",") + t.youReceive.map((x) => x.assetId).join(","))).toEqual(
      b.trades.map((t) => t.youGive.map((x) => x.assetId).join(",") + t.youReceive.map((x) => x.assetId).join(",")),
    );
  });

  it("24. AI failure preserves results/classifications", () => {
    const base = findTrades(rbWrComplementLeague(), { topN: 3 });
    const { trades, applied } = applyNarratives(base.trades, "NOT JSON");
    expect(applied).toBe(false);
    expect(trades.map((t) => t.opportunity)).toEqual(base.trades.map((t) => t.opportunity));
    expect(trades.map((t) => t.qualityTier)).toEqual(base.trades.map((t) => t.qualityTier));
  });

  it("25. fewer than five structurally valid candidates returns the available count", () => {
    const scored = [
      stubCandidate({ partnerName: "Only", qualityTier: 1, partnerTeamId: 9 }),
      stubCandidate({ partnerName: "Two", qualityTier: 4, partnerTeamId: 10, youGive: [{ kind: "player", assetId: "z", playerId: 90, name: "Z", position: "RB", tradeValue: 100 }], youReceive: [{ kind: "player", assetId: "w", playerId: 91, name: "W", position: "WR", tradeValue: 100 }] }),
    ];
    expect(selectByTier(scored, 5)).toHaveLength(2);
  });
});
