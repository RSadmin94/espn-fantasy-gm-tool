import type {
  EmptyReason,
  TradeFinderFilters,
  TradeFinderLeague,
  TradeFinderResult,
  TradePriorityNeed,
} from "./types";
import { DEFAULT_TRADE_FINDER_FILTERS } from "./types";
import { TRADE_FINDER_BOUNDS } from "./weights";
import { attachNeeds } from "./needSurplus";
import { discoveryNeedPositions, generateCandidates, rankPartners } from "./generate";
import { evaluateCandidate, fillProgressively } from "./score";
import { emptyExplanation } from "./explain";
import { applyNarratives } from "./narrative";
import { tradePriorityScore } from "./priority";

function tradePriorityFor(league: TradeFinderLeague, filters: TradeFinderFilters): TradePriorityNeed[] {
  const user = league.teams.find((t) => t.teamId === league.userTeamId);
  if (!user) return [];
  return user.needs.map((n) => ({
    ...n,
    tradePriorityScore: Math.round(tradePriorityScore(n.needScore, n.position, filters, league.slots) * 10) / 10,
  }));
}

function emptyMetrics() {
  return {
    partnersRanked: 0,
    candidatesGenerated: 0,
    candidatesScored: 0,
    candidatesHardRejected: 0,
    candidatesRejectedByRationality: 0,
    tier1Count: 0,
    tier2Count: 0,
    tier3Count: 0,
    tier4Count: 0,
    candidatesReturned: 0,
  };
}

function emptyResult(
  league: TradeFinderLeague,
  reason: EmptyReason,
  metrics: TradeFinderResult["metrics"],
  entitled: boolean,
  filters: TradeFinderFilters,
): TradeFinderResult {
  const user = league.teams.find((t) => t.teamId === league.userTeamId);
  const needs = user?.needs ?? [];
  return {
    ok: reason === "none",
    gated: !entitled,
    entitled,
    emptyReason: reason,
    emptyExplanation: emptyExplanation(reason, needs, {
      candidatesGenerated: metrics.candidatesGenerated,
      partnersRanked: metrics.partnersRanked,
    }),
    userNeeds: needs.filter((n) => n.label === "NEED"),
    userSurplus: needs.filter((n) => n.label === "SURPLUS"),
    tradePriority: tradePriorityFor(league, filters),
    trades: [],
    disclaimers: league.disclaimers,
    picksSupported: league.teams.some((t) => t.picks.length > 0),
    metrics,
    narrativeApplied: false,
  };
}

export function findTrades(
  leagueIn: TradeFinderLeague,
  filtersIn: Partial<TradeFinderFilters> = {},
  opts?: { entitled?: boolean; narrativeRaw?: string | null },
): TradeFinderResult {
  const started = Date.now();
  const entitled = opts?.entitled !== false;
  const filters: TradeFinderFilters = {
    ...DEFAULT_TRADE_FINDER_FILTERS,
    ...filtersIn,
    topN: Math.min(
      TRADE_FINDER_BOUNDS.maxTopN,
      Math.max(1, filtersIn.topN ?? DEFAULT_TRADE_FINDER_FILTERS.topN),
    ),
  };

  const league = attachNeeds(leagueIn);
  const user = league.teams.find((t) => t.teamId === league.userTeamId);
  const assetsEvaluated = league.teams.reduce((s, t) => s + t.roster.length + t.picks.length, 0);
  const wantNeedPositions = user
    ? discoveryNeedPositions(user, filters, league.slots)
    : [];
  const streamerDeprioritized = filters.targetPosition !== "DST" && filters.targetPosition !== "K";
  const baseMetrics = {
    teams: league.teams.length,
    assetsEvaluated,
    ...emptyMetrics(),
    elapsedMs: 0,
    wantNeedPositions,
    streamerDeprioritized,
  };

  const finish = (partial: Omit<TradeFinderResult, "metrics">, extra: Partial<TradeFinderResult["metrics"]> = {}): TradeFinderResult => ({
    ...partial,
    metrics: { ...baseMetrics, ...extra, elapsedMs: Date.now() - started },
  });

  if (!user) {
    return finish(emptyResult(league, "team_mismatch", baseMetrics, entitled, filters));
  }
  if (league.teams.length < 2) {
    return finish(emptyResult(league, "no_viable_partners", baseMetrics, entitled, filters));
  }
  const rostered = user.roster.filter((a) => a.kind === "player");
  if (rostered.length === 0) {
    return finish(emptyResult(league, "no_roster", baseMetrics, entitled, filters));
  }
  const valued = league.teams.flatMap((t) => t.roster).filter((a) => a.tradeValue > 0).length;
  if (valued < 8) {
    return finish(emptyResult(league, "insufficient_values", baseMetrics, entitled, filters));
  }

  const partners = rankPartners(league, filters);
  if (partners.length === 0) {
    return finish(emptyResult(league, "no_viable_partners", { ...baseMetrics, partnersRanked: 0 }, entitled, filters));
  }

  const generated = generateCandidates(league, partners, filters);
  const scored = [];
  let rejectedByRationality = 0;
  let rejectedHard = 0;
  for (const g of generated) {
    const outcome = evaluateCandidate(league, user, g, filters);
    if (outcome.rejectedHard) rejectedHard += 1;
    if (outcome.rejectedByRationality) rejectedByRationality += 1;
    if (outcome.candidate) scored.push(outcome.candidate);
  }
  const tier1Count = scored.filter((t) => t.qualityTier === 1).length;
  const tier2Count = scored.filter((t) => t.qualityTier === 2).length;
  const tier3Count = scored.filter((t) => t.qualityTier === 3).length;
  const tier4Count = scored.filter((t) => t.qualityTier === 4).length;
  const ranked = fillProgressively(scored, filters);
  const withNarrative = applyNarratives(ranked, opts?.narrativeRaw ?? null);

  const scoredMetrics = {
    partnersRanked: partners.length,
    candidatesGenerated: generated.length,
    candidatesScored: scored.length,
    candidatesHardRejected: rejectedHard,
    candidatesRejectedByRationality: rejectedByRationality,
    tier1Count,
    tier2Count,
    tier3Count,
    tier4Count,
    candidatesReturned: withNarrative.trades.length,
  };

  if (withNarrative.trades.length === 0) {
    const reason: EmptyReason = generated.length === 0 ? "no_constructable_trade" : "no_constructable_trade";
    return finish(emptyResult(league, reason, { ...baseMetrics, ...scoredMetrics }, entitled, filters));
  }

  return finish({
    ok: true,
    gated: !entitled,
    entitled,
    emptyReason: "none",
    emptyExplanation: null,
    userNeeds: user.needs.filter((n) => n.label === "NEED"),
    userSurplus: user.needs.filter((n) => n.label === "SURPLUS"),
    tradePriority: tradePriorityFor(league, filters),
    trades: withNarrative.trades,
    disclaimers: league.disclaimers,
    picksSupported: league.teams.some((t) => t.picks.length > 0),
    narrativeApplied: withNarrative.applied,
  }, scoredMetrics);
}
