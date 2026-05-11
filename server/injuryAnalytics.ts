// FILE: server/injuryAnalytics.ts
/**
 * Phase 1 — Injury-Aware Analytics Patches
 *
 * These are drop-in replacements / wrappers for the existing analytics
 * functions that add injury intelligence. Import these instead of the
 * originals wherever you want injury-adjusted output.
 *
 * Functions:
 *   calcROSValueWithInjury     — wraps calcROSValue, applies volatility multiplier
 *   calcTradeValueWithInjury   — wraps calcTradeValue, applies injury discount
 *   buildAdvisorInjuryContext  — injects injury facts into the GM Advisor system prompt
 */

import {
  calcROSValue,
  calcTradeValue,
  type PlayerRow,
  type VORPResult,
  type ROSValueResult,
  type PositionalScarcityResult,
  type KeeperEfficiencyResult,
  type TradeValueResult,
} from "./analytics";
import {
  getInjuries,
  calcInjuryScores,
  buildInjuryPromptBlock,
  type InjuryScores,
} from "./injuryService";

// ─── ROS Value with Injury Adjustment ────────────────────────────────────────

export interface ROSValueWithInjury extends ROSValueResult {
  injuryScore: InjuryScores;
  rosAdjustedWithInjury: number;  // rosAdjusted × volatilityMultiplier
}

/**
 * Calculates ROS value for a list of players, then applies each player's
 * injury volatility multiplier to produce a final injury-adjusted projection.
 *
 * Drop-in replacement for calcROSValue() wherever you need the injury layer.
 */
export async function calcROSValueWithInjury(
  players: PlayerRow[],
  weeksRemaining: number = 10
): Promise<ROSValueWithInjury[]> {
  const [rosResults, injuries] = await Promise.all([
    Promise.resolve(calcROSValue(players, weeksRemaining)),
    getInjuries(),
  ]);

  const injuryScores = calcInjuryScores(
    players.map(p => ({ playerId: p.playerId, playerName: p.playerName, position: p.position })),
    injuries
  );

  const scoreMap = new Map(injuryScores.map(s => [s.playerId, s]));

  return rosResults.map(ros => {
    const score = scoreMap.get(ros.playerId) ?? {
      playerId: ros.playerId,
      playerName: ros.playerName,
      position: ros.position,
      injuryRiskScore: 0,
      workloadConfidence: 100,
      volatilityMultiplier: 1.0,
      statusLabel: "Active",
      designation: "ACTIVE" as const,
      practiceTrend: "UNKNOWN" as const,
    };

    return {
      ...ros,
      injuryScore: score,
      rosAdjustedWithInjury: Math.round(ros.rosAdjusted * score.volatilityMultiplier * 10) / 10,
    };
  });
}

// ─── Trade Value with Injury Adjustment ──────────────────────────────────────

export interface TradeValueWithInjury extends TradeValueResult {
  injuryScore: InjuryScores;
  compositeValueWithInjury: number;  // compositeValue × volatilityMultiplier
  injuryDiscount: number;            // how many points were discounted
}

/**
 * Calculates trade value for a player and applies injury discount.
 * Use this in the Trade Analyzer instead of calcTradeValue().
 */
export async function calcTradeValueWithInjury(
  player: PlayerRow,
  vorpResult: VORPResult | undefined,
  rosResult: ROSValueResult | undefined,
  scarcity: PositionalScarcityResult | undefined,
  keeperEfficiency: KeeperEfficiencyResult | undefined
): Promise<TradeValueWithInjury> {
  const base = calcTradeValue(player, vorpResult, rosResult, scarcity, keeperEfficiency);

  const injuries = await getInjuries();
  const scores = calcInjuryScores(
    [{ playerId: player.playerId, playerName: player.playerName, position: player.position }],
    injuries
  );
  const score = scores[0]!;

  const compositeValueWithInjury = Math.round(base.compositeValue * score.volatilityMultiplier);
  const injuryDiscount = base.compositeValue - compositeValueWithInjury;

  return {
    ...base,
    injuryScore: score,
    compositeValueWithInjury,
    injuryDiscount,
  };
}

// ─── GM Advisor Injury Context Builder ───────────────────────────────────────

/**
 * Builds an injury intelligence block scoped to Rod's current roster
 * and the specific players being discussed.
 *
 * Call this and append the result to the leagueContext string in
 * the advisor.chat mutation in routers.ts.
 *
 * Usage in routers.ts advisor.chat:
 *   const { buildAdvisorInjuryContext } = await import("./injuryAnalytics");
 *   const injuryContext = await buildAdvisorInjuryContext(allPlayers, rodTeamId);
 *   leagueContext += "\n\n" + injuryContext;
 */
export async function buildAdvisorInjuryContext(
  allPlayers: Array<{ playerId: number; playerName: string; position: string; teamId: number }>,
  rodTeamId: number
): Promise<string> {
  const injuries = await getInjuries();

  // Focus on Rod's roster + any player with an injury designation
  const rodRoster = allPlayers.filter(p => p.teamId === rodTeamId);
  const injuredLeaguePlayers = allPlayers.filter(p => {
    const match = injuries.find(
      i => i.playerId === p.playerId || i.playerName.toLowerCase() === p.playerName.toLowerCase()
    );
    return match && match.injuryStatus !== "ACTIVE";
  });

  // Deduplicate
  const seen = new Set<number>();
  const toScore: typeof allPlayers = [];
  for (const p of [...rodRoster, ...injuredLeaguePlayers]) {
    if (!seen.has(p.playerId)) {
      seen.add(p.playerId);
      toScore.push(p);
    }
  }

  const scores = calcInjuryScores(toScore, injuries);
  const injuryBlock = buildInjuryPromptBlock(scores);

  // Summarize Rod's roster injury situation specifically
  const rodScores = scores.filter(s => rodRoster.some(r => r.playerId === s.playerId));
  const rodInjured = rodScores.filter(s => s.injuryRiskScore > 0);

  let rodSummary = "";
  if (rodInjured.length === 0) {
    rodSummary = "\nROD'S ROSTER INJURY STATUS: All players healthy — no injury concerns.";
  } else {
    const critical = rodInjured.filter(s => s.injuryRiskScore >= 75);
    const watch = rodInjured.filter(s => s.injuryRiskScore >= 30 && s.injuryRiskScore < 75);
    const parts: string[] = [];
    if (critical.length > 0) {
      parts.push(`Critical: ${critical.map(s => `${s.playerName} (${s.statusLabel})`).join(", ")}`);
    }
    if (watch.length > 0) {
      parts.push(`Watch: ${watch.map(s => `${s.playerName} (${s.statusLabel})`).join(", ")}`);
    }
    rodSummary = `\nROD'S ROSTER INJURY STATUS: ${parts.join(" | ")}`;
  }

  return injuryBlock + rodSummary;
}

// ─── Bulk roster injury summary (for command center / war room) ───────────────

export interface RosterInjurySummary {
  teamId: number;
  ownerName: string;
  healthScore: number;           // 0-100, 100 = everyone healthy
  criticalCount: number;         // players with risk >= 75
  watchCount: number;            // players with risk 30-74
  injuredPlayers: InjuryScores[];
}

/**
 * Calculates a roster health score for every team.
 * Useful for the Command Center threat assessment and trade targeting.
 */
export async function calcRosterHealthScores(
  players: Array<{ playerId: number; playerName: string; position: string; teamId: number; ownerName: string }>
): Promise<RosterInjurySummary[]> {
  const injuries = await getInjuries();
  const scores = calcInjuryScores(players, injuries);
  const scoreMap = new Map(scores.map(s => [s.playerId, s]));

  // Group by team
  const byTeam = new Map<number, { ownerName: string; players: InjuryScores[] }>();
  for (const p of players) {
    if (!byTeam.has(p.teamId)) {
      byTeam.set(p.teamId, { ownerName: p.ownerName, players: [] });
    }
    const score = scoreMap.get(p.playerId);
    if (score) byTeam.get(p.teamId)!.players.push(score);
  }

  const results: RosterInjurySummary[] = [];
  for (const [teamId, { ownerName, players: teamScores }] of Array.from(byTeam)) {
    if (teamScores.length === 0) continue;

    const injuredPlayers = teamScores.filter((s: InjuryScores) => s.injuryRiskScore > 0);
    const criticalCount = injuredPlayers.filter((s: InjuryScores) => s.injuryRiskScore >= 75).length;
    const watchCount = injuredPlayers.filter((s: InjuryScores) => s.injuryRiskScore >= 30 && s.injuryRiskScore < 75).length;

    // Health score: start at 100, deduct for each injured player weighted by risk
    const totalRisk = teamScores.reduce((sum: number, s: InjuryScores) => sum + s.injuryRiskScore, 0);
    const healthScore = Math.max(0, Math.round(100 - (totalRisk / Math.max(teamScores.length, 1)) * 0.8));

    results.push({
      teamId,
      ownerName,
      healthScore,
      criticalCount,
      watchCount,
      injuredPlayers: injuredPlayers.sort((a: InjuryScores, b: InjuryScores) => b.injuryRiskScore - a.injuryRiskScore),
    });
  }

  return results.sort((a, b) => a.healthScore - b.healthScore);
}
