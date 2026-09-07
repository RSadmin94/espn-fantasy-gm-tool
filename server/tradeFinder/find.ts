import type {
  EmptyReason,
  TradeFinderFilters,
  TradeFinderLeague,
  TradeFinderResult,
} from "./types";
import { DEFAULT_TRADE_FINDER_FILTERS } from "./types";
import { TRADE_FINDER_BOUNDS } from "./weights";
import { attachNeeds } from "./needSurplus";
import { generateCandidates, rankPartners } from "./generate";
import { rankScored, scoreCandidate } from "./score";
import { emptyExplanation } from "./explain";
import { applyNarratives } from "./narrative";

function emptyResult(
  league: TradeFinderLeague,
  reason: EmptyReason,
  metrics: TradeFinderResult["metrics"],
  entitled: boolean,
): TradeFinderResult {
  const user = league.teams.find((t) => t.teamId === league.userTeamId);
  const needs = user?.needs ?? [];
  return {
    ok: reason === "none",
    gated: !entitled,
    entitled,
    emptyReason: reason,
    emptyExplanation: emptyExplanation(reason, needs),
    userNeeds: needs.filter((n) => n.label === "NEED"),
    userSurplus: needs.filter((n) => n.label === "SURPLUS"),
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
  const baseMetrics = {
    teams: league.teams.length,
    assetsEvaluated,
    partnersRanked: 0,
    candidatesGenerated: 0,
    candidatesScored: 0,
    candidatesReturned: 0,
    elapsedMs: 0,
  };

  const finish = (partial: Omit<TradeFinderResult, "metrics">, extra: Partial<TradeFinderResult["metrics"]> = {}): TradeFinderResult => ({
    ...partial,
    metrics: { ...baseMetrics, ...extra, elapsedMs: Date.now() - started },
  });

  if (!user) {
    return finish(emptyResult(league, "team_mismatch", baseMetrics, entitled));
  }
  if (league.teams.length < 2) {
    return finish(emptyResult(league, "no_viable_partners", baseMetrics, entitled));
  }
  const rostered = user.roster.filter((a) => a.kind === "player");
  if (rostered.length === 0) {
    return finish(emptyResult(league, "no_roster", baseMetrics, entitled));
  }
  const valued = league.teams.flatMap((t) => t.roster).filter((a) => a.tradeValue > 0).length;
  if (valued < 8) {
    return finish(emptyResult(league, "insufficient_values", baseMetrics, entitled));
  }
  const unavailable = rostered.filter((a) => a.unavailable).length;
  if (unavailable >= rostered.length - 3 && rostered.length >= 8) {
    return finish(emptyResult(league, "injury_heavy", baseMetrics, entitled));
  }

  const partners = rankPartners(league, filters);
  if (partners.length === 0 || partners.every((p) => p.complementScore <= 0)) {
    const still = partners.filter((p) => p.complementScore > 0);
    if (still.length === 0) {
      return finish(emptyResult(league, "no_viable_partners", baseMetrics, entitled), {
        partnersRanked: partners.length,
      });
    }
  }

  const generated = generateCandidates(league, partners, filters);
  const scored = [];
  for (const g of generated) {
    const s = scoreCandidate(league, user, g, filters);
    if (s) scored.push(s);
  }
  const ranked = rankScored(scored).slice(0, filters.topN);
  const withNarrative = applyNarratives(ranked, opts?.narrativeRaw ?? null);

  if (withNarrative.trades.length === 0) {
    return finish(emptyResult(league, "no_viable_partners", baseMetrics, entitled), {
      partnersRanked: partners.length,
      candidatesGenerated: generated.length,
      candidatesScored: scored.length,
    });
  }

  return finish({
    ok: true,
    gated: !entitled,
    entitled,
    emptyReason: "none",
    emptyExplanation: null,
    userNeeds: user.needs.filter((n) => n.label === "NEED"),
    userSurplus: user.needs.filter((n) => n.label === "SURPLUS"),
    trades: withNarrative.trades,
    disclaimers: league.disclaimers,
    picksSupported: league.teams.some((t) => t.picks.length > 0),
    narrativeApplied: withNarrative.applied,
  }, {
    partnersRanked: partners.length,
    candidatesGenerated: generated.length,
    candidatesScored: scored.length,
    candidatesReturned: withNarrative.trades.length,
  });
}
