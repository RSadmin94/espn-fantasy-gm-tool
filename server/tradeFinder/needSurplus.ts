/**
 * Need / surplus model (RFSN-061 Phase 3).
 *
 * For each rostered skill position P:
 *
 *   slotFillNeed        = 100 * unfilledDedicated / max(1, dedicatedSlots)
 *   starterQualityNeed  = 100 * clamp(0,1, (replacement - starterQuality) / max(replacement, ε))
 *   depthNeed           = 100 if no playable bench at P, else 100 * clamp(0,1, (replacement - benchQuality) / replacement)
 *   injuryNeed          = 100 * injuredStarterCaliber / max(1, dedicatedSlots)
 *
 *   needScore = 25% slotFill + 50% starterQuality + 15% depth + 10% injury   (0–100)
 *   Starter quality uses 65% weakest dedicated starter + 35% average, so WR2-weak reads as need.
 *
 *   extraStarters       = playable bodies with quality ≥ 0.65 * replacement beyond dedicated slots
 *   extraCountScore     = 100 * clamp(0,1, extraStarters / 2)
 *   depthQualityScore   = 100 * clamp(0,1, benchQuality / max(replacement, ε))
 *   redundancyScore     = 90 / 70 / 55 / 35 by extra-body count and quality
 *
 *   surplusScore = 45% extraCount + 35% depthQuality + 20% redundancy        (0–100)
 *
 * Label:
 *   NEED    if needScore ≥ 40 AND needScore ≥ surplusScore + 8
 *   SURPLUS if surplusScore ≥ 40 AND surplusScore ≥ needScore + 8
 *   else NEUTRAL
 *
 * Replacement for P is the median starter-slot quality at P across the league
 * (dedicated starters only — FLEX is not double-counted here).
 */
import type {
  NeedLabel,
  PositionNeedSurplus,
  TradeFinderAsset,
  TradeFinderLeague,
  TradeFinderRosterSlots,
  TradeFinderTeam,
  TradePosition,
} from "./types";
import { TRADE_FINDER_CLASSIFY, TRADE_FINDER_NEED_WEIGHTS, TRADE_FINDER_SURPLUS_WEIGHTS } from "./weights";
import { assetQuality, clamp, skillPositions } from "./positions";

function q(a: TradeFinderAsset): number {
  return a.unavailable ? 0 : assetQuality(a.weeklyProjection, a.tradeValue);
}

function playableAt(roster: TradeFinderAsset[], pos: TradePosition): TradeFinderAsset[] {
  return roster
    .filter((a) => a.kind === "player" && a.position === pos && !a.ir)
    .sort((a, b) => q(b) - q(a));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function leagueReplacementByPosition(
  teams: TradeFinderTeam[],
  slots: TradeFinderRosterSlots,
): Record<TradePosition, number> {
  const out = {} as Record<TradePosition, number>;
  for (const pos of skillPositions(slots)) {
    const dedicated = slots[pos] ?? 0;
    const starterQs: number[] = [];
    for (const t of teams) {
      const ranked = playableAt(t.roster, pos).filter((a) => !a.unavailable);
      for (let i = 0; i < dedicated; i++) {
        starterQs.push(ranked[i] ? q(ranked[i]) : 0);
      }
    }
    const med = median(starterQs.filter((n) => n > 0));
    out[pos] = med > 0 ? med : median(starterQs);
  }
  return out;
}

export function analyzeTeamNeeds(
  roster: TradeFinderAsset[],
  slots: TradeFinderRosterSlots,
  replacement: Record<TradePosition, number>,
): PositionNeedSurplus[] {
  const nw = TRADE_FINDER_NEED_WEIGHTS;
  const sw = TRADE_FINDER_SURPLUS_WEIGHTS;
  const results: PositionNeedSurplus[] = [];

  for (const pos of skillPositions(slots)) {
    const dedicated = slots[pos] ?? 0;
    if (dedicated <= 0 && pos !== "RB" && pos !== "WR" && pos !== "TE") continue;
    const ranked = playableAt(roster, pos);
    const healthy = ranked.filter((a) => !a.unavailable);
    const repl = Math.max(replacement[pos] ?? 0, 0.01);

    let weakestStarter = 0;
    let unfilled = 0;
    const nStart = Math.max(dedicated, 0);
    const starterQs: number[] = [];
    for (let i = 0; i < nStart; i++) {
      const p = healthy[i];
      if (!p) {
        unfilled++;
        starterQs.push(0);
        continue;
      }
      starterQs.push(q(p));
    }
    weakestStarter = nStart > 0 ? Math.min(...starterQs) : 0;
    const avgStarter = nStart > 0 ? starterQs.reduce((s, n) => s + n, 0) / nStart : 0;
    // Weakest dedicated starter drives need (WR2-weak should read as WR need even if WR1 is fine).
    const starterQuality = 0.65 * weakestStarter + 0.35 * avgStarter;

    const slotFillNeed = nStart > 0 ? 100 * (unfilled / nStart) : 0;
    const starterQualityNeed = 100 * clamp((repl - starterQuality) / repl, 0, 1);
    const bench = healthy.slice(nStart);
    const benchQuality = bench[0] ? q(bench[0]) : 0;
    const depthNeed = bench.length === 0 ? 100 : 100 * clamp((repl - benchQuality) / repl, 0, 1);
    const injuredCaliber = ranked.filter((a) => {
      if (!a.unavailable) return false;
      const raw = assetQuality(a.weeklyProjection, a.tradeValue);
      return raw >= 0.7 * repl;
    }).length;
    const injuryNeed = 100 * clamp(injuredCaliber / Math.max(1, nStart), 0, 1);

    const needScore = clamp(
      nw.slotFill * slotFillNeed +
        nw.starterQuality * starterQualityNeed +
        nw.depth * depthNeed +
        nw.injury * injuryNeed,
      0,
      100,
    );

    const extraThreshold = 0.65 * repl;
    const extraStarters = healthy.slice(nStart).filter((a) => q(a) >= extraThreshold).length;
    const extraCountScore = 100 * clamp(extraStarters / 2, 0, 1);
    const depthQualityScore = 100 * clamp(benchQuality / repl, 0, 1);
    const third = healthy[nStart + 1];
    const second = healthy[nStart];
    let redundancyScore = 0;
    if (extraStarters >= 3) redundancyScore = 90;
    else if (third && q(third) >= 0.7 * repl) redundancyScore = 70;
    else if (extraStarters >= 2) redundancyScore = 55;
    else if (second && q(second) >= 0.7 * repl) redundancyScore = 35;

    const surplusScore = clamp(
      sw.extraStarters * extraCountScore +
        sw.depthQuality * depthQualityScore +
        sw.redundancy * redundancyScore,
      0,
      100,
    );

    const { needMin, surplusMin, labelMargin } = TRADE_FINDER_CLASSIFY;
    let label: NeedLabel = "NEUTRAL";
    if (needScore >= needMin && needScore >= surplusScore + labelMargin) label = "NEED";
    else if (surplusScore >= surplusMin && surplusScore >= needScore + labelMargin) label = "SURPLUS";

    results.push({
      position: pos,
      needScore: Math.round(needScore * 10) / 10,
      surplusScore: Math.round(surplusScore * 10) / 10,
      label,
    });
  }

  return results;
}

export function attachNeeds(league: TradeFinderLeague): TradeFinderLeague {
  const replacement = leagueReplacementByPosition(league.teams, league.slots);
  return {
    ...league,
    teams: league.teams.map((t) => ({
      ...t,
      needs: analyzeTeamNeeds(t.roster, league.slots, replacement),
    })),
  };
}

export function needMap(team: TradeFinderTeam): Map<TradePosition, PositionNeedSurplus> {
  return new Map(team.needs.map((n) => [n.position, n]));
}
