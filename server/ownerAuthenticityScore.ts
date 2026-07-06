/**
 * ownerAuthenticityScore.ts — Measures how well mock picks align with owner draft DNA.
 *
 * Compares DNA-enabled mock vs ADP-only baseline using historical round×position rates.
 */

import {
  normOwnerKey,
  OFFENSE_DNA_POSITIONS,
  resolveOwnerDnaModel,
  type OwnerDraftDnaContext,
} from "./ownerDraftDnaModel";

export interface MockPickRow {
  pickNumber: number;
  round: number;
  ownerName: string;
  player: string;
  position: string;
  primaryFactor?: string | null;
  isKeeperSlot?: boolean;
}

export interface OwnerAuthenticityRow {
  ownerKey: string;
  ownerName: string;
  offensePicks: number;
  score: number;
  baselineScore: number;
  lift: number;
  dnaNudges: number;
}

export interface OwnerAuthenticityReport {
  leagueScore: number;
  leagueBaselineScore: number;
  leagueLift: number;
  directDnaNudges: number;
  offensePickCount: number;
  top14PlayerMatches: number;
  top14Total: number;
  garrettPick: number | null;
  warnerPick: number | null;
  dpCount: number;
  teamsWith2PlusDp: number;
  perOwner: OwnerAuthenticityRow[];
  compositeObjective: number;
}

function rateAtRound(
  roundPosRate: Map<number, Map<string, number>>,
  round: number,
  pos: string,
): number {
  const roundMap = roundPosRate.get(round);
  if (roundMap?.has(pos)) return roundMap.get(pos)!;
  const prev = roundPosRate.get(round - 1)?.get(pos) ?? 0;
  const next = roundPosRate.get(round + 1)?.get(pos) ?? 0;
  if (prev || next) return (prev + next) / (prev && next ? 2 : 1);
  return 0;
}

function blendedTendency(
  ctx: OwnerDraftDnaContext,
  ownerName: string,
  round: number,
  pos: string,
): number {
  const model = resolveOwnerDnaModel(ctx, ownerName);
  const ownerRate = model ? rateAtRound(model.roundPosRate, round, pos) : 0;
  const leagueRate = rateAtRound(ctx.league.roundPosRate, round, pos);
  const cw = model?.confidenceWeight ?? 0;
  return cw * ownerRate + (1 - cw) * leagueRate;
}

function offensePicks(rows: MockPickRow[]): MockPickRow[] {
  return rows.filter(
    (p) => !p.isKeeperSlot && OFFENSE_DNA_POSITIONS.has(p.position),
  );
}

function scorePicks(picks: MockPickRow[], ctx: OwnerDraftDnaContext): number {
  const offense = offensePicks(picks);
  if (!offense.length) return 0;
  let sum = 0;
  for (const p of offense) {
    sum += blendedTendency(ctx, p.ownerName, p.round, p.position);
  }
  return sum / offense.length;
}

function findPick(rows: MockPickRow[], re: RegExp): number | null {
  return rows.find((p) => re.test(p.player))?.pickNumber ?? null;
}

export function computeOwnerAuthenticityReport(params: {
  mockPicks: MockPickRow[];
  baselinePicks: MockPickRow[];
  phase1Top14Baseline: MockPickRow[];
  ownerDnaContext: OwnerDraftDnaContext;
}): OwnerAuthenticityReport {
  const { mockPicks, baselinePicks, phase1Top14Baseline, ownerDnaContext } = params;

  const leagueScore = scorePicks(mockPicks, ownerDnaContext);
  const leagueBaselineScore = scorePicks(baselinePicks, ownerDnaContext);
  const leagueLift = leagueScore - leagueBaselineScore;

  const directDnaNudges = mockPicks.filter((p) => p.primaryFactor === "OWNER_DNA").length;
  const offense = offensePicks(mockPicks);

  const top14 = mockPicks.slice(0, 14);
  const top14PlayerMatches = top14.filter(
    (p, i) => phase1Top14Baseline[i]?.player === p.player,
  ).length;

  const dpRows = mockPicks.filter((p) => p.position === "DP");
  const dpByOwner = new Map<string, number>();
  for (const p of dpRows) {
    const k = normOwnerKey(p.ownerName);
    dpByOwner.set(k, (dpByOwner.get(k) ?? 0) + 1);
  }
  const teamsWith2PlusDp = [...dpByOwner.values()].filter((c) => c >= 2).length;

  const byOwner = new Map<string, OwnerAuthenticityRow>();
  for (const p of offense) {
    const key = normOwnerKey(p.ownerName);
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        ownerKey: key,
        ownerName: p.ownerName,
        offensePicks: 0,
        score: 0,
        baselineScore: 0,
        lift: 0,
        dnaNudges: 0,
      });
    }
    const row = byOwner.get(key)!;
    row.offensePicks++;
    row.score += blendedTendency(ownerDnaContext, p.ownerName, p.round, p.position);
    const basePick = baselinePicks.find((b) => b.pickNumber === p.pickNumber);
    if (basePick) {
      row.baselineScore += blendedTendency(ownerDnaContext, p.ownerName, basePick.round, basePick.position);
    }
    if (p.primaryFactor === "OWNER_DNA") row.dnaNudges++;
  }

  const perOwner = [...byOwner.values()].map((r) => ({
    ...r,
    score: r.offensePicks ? r.score / r.offensePicks : 0,
    baselineScore: r.offensePicks ? r.baselineScore / r.offensePicks : 0,
    lift: r.offensePicks ? (r.score - r.baselineScore) / r.offensePicks : 0,
  }));

  const garrettPick = findPick(mockPicks, /Myles Garrett/i);
  const warnerPick = findPick(mockPicks, /Fred Warner/i);

  let compositeObjective = leagueScore * 100 + leagueLift * 200;
  if (directDnaNudges < 8 || directDnaNudges > 18) compositeObjective -= 25;
  if (top14PlayerMatches < 14) compositeObjective -= 40;
  if (garrettPick !== 75 || warnerPick !== 78) compositeObjective -= 40;
  if (dpRows.length !== 14 || teamsWith2PlusDp > 0) compositeObjective -= 40;

  return {
    leagueScore,
    leagueBaselineScore,
    leagueLift,
    directDnaNudges,
    offensePickCount: offense.length,
    top14PlayerMatches,
    top14Total: 14,
    garrettPick,
    warnerPick,
    dpCount: dpRows.length,
    teamsWith2PlusDp,
    perOwner: perOwner.sort((a, b) => b.lift - a.lift),
    compositeObjective,
  };
}
