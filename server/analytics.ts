// FILE: server/analytics.ts
/**
 * Analytics Engine — ESPN FF GM War Room
 *
 * This module is the calculated "facts" layer. All AI tools should consume
 * outputs from here rather than reasoning from raw data.
 *
 * Exports:
 *   - calcVORP: Value Over Replacement Player by position
 *   - calcPositionalScarcity: How many starters are rostered vs available
 *   - calcRosterGaps: Weakest positions per team
 *   - calcKeeperEfficiency: Keeper value vs draft cost vs ADP
 *   - calcManagerBehavior: Derived GM stats from transaction history
 *   - calcROSValue: Rest-of-season value estimate
 *   - calcTradeValue: Math-first trade value for a player or pick
 *   - calcLeagueAnalytics: Full league snapshot (all of the above combined)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerRow {
  playerId: number;
  playerName: string;
  position: string;        // QB, RB, WR, TE, K, D/ST
  teamId: number;
  ownerName: string;
  seasonPoints: number;    // actual total points scored
  avgPoints: number;       // average per game
  projectedTotal: number | null;
  keeperValue: number;     // round cost to keep (ESPN keeperValue)
  keeperValueFuture: number;
  injuryStatus: string;
  appliedStats: Record<string, number>;
}

export interface PickRow {
  round: number;
  pickInRound: number;
  label: string;           // e.g. "1.07"
  value: number;           // canonical pick value
  ownerName: string;
}

export interface TeamRow {
  teamId: number;
  ownerName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface TransactionRow {
  season: number;
  teamId: number;
  type: string;           // "WAIVER", "FREE_AGENT", "TRADE", "DRAFT"
  itemType?: string;      // "ADD", "DROP"
  proposedDate?: number;
}

export interface DraftPickRow {
  season: number;
  teamId: number;
  roundId: number;
  roundPickNumber: number;
  overallPickNumber: number;
  position: string;
  keeper: boolean;
}

// ─── Replacement level baselines (PPR, 14-team, 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX) ──

// Replacement level = the player just outside the starting lineup at each position
// For 14 teams: QB15, RB29, WR29, TE15
const REPLACEMENT_LEVEL: Record<string, number> = {
  QB: 14,   // 14 starting QBs
  RB: 28,   // 14×2 starting RBs
  WR: 28,   // 14×2 starting WRs
  TE: 14,   // 14 starting TEs
  K: 14,
  "D/ST": 14,
};

// ─── VORP ─────────────────────────────────────────────────────────────────────

export interface VORPResult {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  avgPoints: number;
  replacementLevel: number;
  vorp: number;             // avgPoints - replacementAvg
  vorpTier: "Elite" | "Starter" | "Borderline" | "Handcuff" | "Droppable";
}

/**
 * Calculates VORP for every rostered player.
 * Replacement level = average PPG of the player at rank N+1 at their position,
 * where N = number of starters at that position across the league.
 */
export function calcVORP(players: PlayerRow[]): VORPResult[] {
  const byPosition: Record<string, PlayerRow[]> = {};
  for (const p of players) {
    if (!byPosition[p.position]) byPosition[p.position] = [];
    byPosition[p.position].push(p);
  }

  const results: VORPResult[] = [];

  for (const [pos, posPlayers] of Object.entries(byPosition)) {
    const sorted = [...posPlayers].sort((a, b) => b.avgPoints - a.avgPoints);
    const replacementRank = REPLACEMENT_LEVEL[pos] ?? 14;
    // Replacement level = avg of players ranked N+1 through N+3 (buffer zone)
    const replacementPlayers = sorted.slice(replacementRank, replacementRank + 3);
    const replacementAvg = replacementPlayers.length > 0
      ? replacementPlayers.reduce((s, p) => s + p.avgPoints, 0) / replacementPlayers.length
      : 0;

    for (const player of posPlayers) {
      const vorp = Math.round((player.avgPoints - replacementAvg) * 10) / 10;
      let vorpTier: VORPResult["vorpTier"];
      if (vorp >= 8) vorpTier = "Elite";
      else if (vorp >= 3) vorpTier = "Starter";
      else if (vorp >= 0) vorpTier = "Borderline";
      else if (vorp >= -3) vorpTier = "Handcuff";
      else vorpTier = "Droppable";

      results.push({
        playerId: player.playerId,
        playerName: player.playerName,
        position: pos,
        ownerName: player.ownerName,
        avgPoints: player.avgPoints,
        replacementLevel: Math.round(replacementAvg * 10) / 10,
        vorp,
        vorpTier,
      });
    }
  }

  return results.sort((a, b) => b.vorp - a.vorp);
}

// ─── Positional Scarcity ──────────────────────────────────────────────────────

export interface PositionalScarcityResult {
  position: string;
  totalRostered: number;
  starterSlots: number;       // how many starters across the league
  availableStarters: number;  // starters not yet rostered (free agents)
  scarcityScore: number;      // 0-100, higher = more scarce
  scarcityLabel: "Scarce" | "Tight" | "Available" | "Deep";
  topFreeAgentAvg: number;    // best available FA's avg points
}

/**
 * Calculates positional scarcity across the league.
 * Requires both rostered players and free agent pool.
 */
export function calcPositionalScarcity(
  rosteredPlayers: PlayerRow[],
  freeAgents: PlayerRow[]
): PositionalScarcityResult[] {
  const positions = ["QB", "RB", "WR", "TE", "K", "D/ST"];
  const results: PositionalScarcityResult[] = [];

  for (const pos of positions) {
    const rostered = rosteredPlayers.filter(p => p.position === pos);
    const fas = freeAgents.filter(p => p.position === pos).sort((a, b) => b.avgPoints - a.avgPoints);
    const starterSlots = REPLACEMENT_LEVEL[pos] ?? 14;
    const availableStarters = Math.max(0, starterSlots - rostered.length);
    const scarcityScore = Math.round(Math.max(0, Math.min(100,
      ((starterSlots - fas.length) / starterSlots) * 100
    )));

    let scarcityLabel: PositionalScarcityResult["scarcityLabel"];
    if (scarcityScore >= 80) scarcityLabel = "Scarce";
    else if (scarcityScore >= 60) scarcityLabel = "Tight";
    else if (scarcityScore >= 30) scarcityLabel = "Available";
    else scarcityLabel = "Deep";

    results.push({
      position: pos,
      totalRostered: rostered.length,
      starterSlots,
      availableStarters,
      scarcityScore,
      scarcityLabel,
      topFreeAgentAvg: fas[0]?.avgPoints ?? 0,
    });
  }

  return results.sort((a, b) => b.scarcityScore - a.scarcityScore);
}

// ─── Roster Gap Analyzer ──────────────────────────────────────────────────────

export interface RosterGapResult {
  teamId: number;
  ownerName: string;
  gaps: {
    position: string;
    starterCount: number;
    neededStarters: number;
    deficit: number;
    topPlayerAvg: number;
    gapSeverity: "Critical" | "Weak" | "Adequate" | "Strong";
  }[];
  overallGrade: "A" | "B" | "C" | "D" | "F";
  weakestPosition: string;
}

// Required starters per team
const REQUIRED_STARTERS: Record<string, number> = {
  QB: 1, RB: 2, WR: 2, TE: 1, K: 1, "D/ST": 1,
};

export function calcRosterGaps(players: PlayerRow[]): RosterGapResult[] {
  const byTeam: Record<number, PlayerRow[]> = {};
  for (const p of players) {
    if (!byTeam[p.teamId]) byTeam[p.teamId] = [];
    byTeam[p.teamId].push(p);
  }

  const results: RosterGapResult[] = [];

  for (const [teamIdStr, teamPlayers] of Object.entries(byTeam)) {
    const teamId = Number(teamIdStr);
    const ownerName = teamPlayers[0]?.ownerName ?? "Unknown";
    const gaps = [];
    let totalDeficit = 0;

    for (const [pos, needed] of Object.entries(REQUIRED_STARTERS)) {
      const posPlayers = teamPlayers
        .filter(p => p.position === pos)
        .sort((a, b) => b.avgPoints - a.avgPoints);
      const starterCount = posPlayers.length;
      const deficit = Math.max(0, needed - starterCount);
      totalDeficit += deficit;
      const topPlayerAvg = posPlayers[0]?.avgPoints ?? 0;

      let gapSeverity: "Critical" | "Weak" | "Adequate" | "Strong";
      if (deficit > 0) gapSeverity = "Critical";
      else if (topPlayerAvg < 8) gapSeverity = "Weak";
      else if (topPlayerAvg < 14) gapSeverity = "Adequate";
      else gapSeverity = "Strong";

      gaps.push({ position: pos, starterCount, neededStarters: needed, deficit, topPlayerAvg: Math.round(topPlayerAvg * 10) / 10, gapSeverity });
    }

    const criticalGaps = gaps.filter(g => g.gapSeverity === "Critical").length;
    const weakGaps = gaps.filter(g => g.gapSeverity === "Weak").length;
    let overallGrade: "A" | "B" | "C" | "D" | "F";
    if (criticalGaps === 0 && weakGaps === 0) overallGrade = "A";
    else if (criticalGaps === 0 && weakGaps <= 1) overallGrade = "B";
    else if (criticalGaps <= 1) overallGrade = "C";
    else if (criticalGaps <= 2) overallGrade = "D";
    else overallGrade = "F";

    const weakestPosition = gaps.sort((a, b) => a.topPlayerAvg - b.topPlayerAvg)[0]?.position ?? "N/A";

    results.push({ teamId, ownerName, gaps, overallGrade, weakestPosition });
  }

  return results.sort((a, b) => a.overallGrade.localeCompare(b.overallGrade));
}

// ─── Keeper Efficiency ────────────────────────────────────────────────────────

export interface KeeperEfficiencyResult {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  keeperRound: number;       // round they'd be kept in (keeperValue)
  keeperRoundFuture: number; // round cost next year
  avgPoints: number;
  vorp: number;
  // ADP-equivalent round: what round would this player go in a fresh draft?
  adpEquivRound: number;
  // Efficiency: how many rounds of value are you getting?
  roundSavings: number;      // adpEquivRound - keeperRound (positive = good deal)
  efficiencyScore: number;   // 0-100
  efficiencyLabel: "Elite Value" | "Good Value" | "Fair Value" | "Poor Value" | "Avoid";
  recommendation: string;
}

/**
 * Estimates ADP-equivalent round from average PPG.
 * Based on a 14-team PPR draft where top players go in round 1.
 */
function estimateAdpRound(avgPoints: number, position: string): number {
  // Rough PPG → draft round mapping for 14-team PPR
  const thresholds: [number, number][] = [
    [22, 1], [19, 2], [17, 3], [15, 4], [13, 5],
    [11, 6], [9, 7], [8, 8], [7, 9], [6, 10],
    [5, 11], [4, 12], [3, 13], [0, 14],
  ];
  // QBs are typically drafted later
  const adjusted = position === "QB" ? avgPoints * 0.85 : avgPoints;
  for (const [threshold, round] of thresholds) {
    if (adjusted >= threshold) return round;
  }
  return 15;
}

export function calcKeeperEfficiency(players: PlayerRow[], vorpResults: VORPResult[]): KeeperEfficiencyResult[] {
  const vorpMap = new Map(vorpResults.map(v => [v.playerId, v.vorp]));
  const results: KeeperEfficiencyResult[] = [];

  for (const player of players) {
    if (!player.keeperValue || player.keeperValue <= 0) continue;

    const keeperRound = player.keeperValue;
    const keeperRoundFuture = player.keeperValueFuture || keeperRound + 1;
    const adpEquivRound = estimateAdpRound(player.avgPoints, player.position);
    const roundSavings = adpEquivRound - keeperRound;
    const vorp = vorpMap.get(player.playerId) ?? 0;

    // Score: round savings weighted by VORP
    const rawScore = (roundSavings * 10) + (vorp * 2);
    const efficiencyScore = Math.round(Math.max(0, Math.min(100, 50 + rawScore)));

    let efficiencyLabel: KeeperEfficiencyResult["efficiencyLabel"];
    if (efficiencyScore >= 80) efficiencyLabel = "Elite Value";
    else if (efficiencyScore >= 65) efficiencyLabel = "Good Value";
    else if (efficiencyScore >= 45) efficiencyLabel = "Fair Value";
    else if (efficiencyScore >= 25) efficiencyLabel = "Poor Value";
    else efficiencyLabel = "Avoid";

    let recommendation: string;
    if (roundSavings >= 4) recommendation = `Strong keep — saving ${roundSavings} rounds vs ADP`;
    else if (roundSavings >= 2) recommendation = `Good keep — saving ${roundSavings} rounds vs ADP`;
    else if (roundSavings >= 0) recommendation = `Marginal keep — ADP and cost are close`;
    else recommendation = `Consider releasing — costing ${Math.abs(roundSavings)} rounds above ADP`;

    results.push({
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      ownerName: player.ownerName,
      keeperRound,
      keeperRoundFuture,
      avgPoints: player.avgPoints,
      vorp,
      adpEquivRound,
      roundSavings,
      efficiencyScore,
      efficiencyLabel,
      recommendation,
    });
  }

  return results.sort((a, b) => b.efficiencyScore - a.efficiencyScore);
}

// ─── Manager Behavior Stats ───────────────────────────────────────────────────

export interface ManagerBehaviorStats {
  teamId: number;
  ownerName: string;
  seasonsAnalyzed: number;
  // Waiver activity
  avgWaiverAddsPerSeason: number;
  avgDropsPerSeason: number;
  waiverAggressionScore: number;   // 0-100
  // Trade activity
  avgTradesPerSeason: number;
  tradeFrequencyScore: number;     // 0-100
  // Draft behavior
  avgDraftRoundByPosition: Record<string, number>;
  earlyQbTendency: boolean;        // drafts QB in rounds 1-3
  earlyTeTendency: boolean;        // drafts TE in rounds 1-4
  // Keeper behavior
  keeperEfficiencyAvg: number;     // avg round savings on keepers
  // Derived archetypes
  gmArchetype: string;
  gmArchetypeDesc: string;
  // Roster stability
  rosterStabilityScore: number;    // 100 - (drops/adds ratio × 100)
}

export function calcManagerBehavior(
  teams: TeamRow[],
  transactions: TransactionRow[],
  draftPicks: DraftPickRow[],
  ownerNameMap: Record<number, string>  // teamId -> ownerName
): ManagerBehaviorStats[] {
  const results: ManagerBehaviorStats[] = [];

  for (const team of teams) {
    const ownerName = ownerNameMap[team.teamId] || team.ownerName;
    const teamTxs = transactions.filter(t => t.teamId === team.teamId);
    const teamPicks = draftPicks.filter(p => p.teamId === team.teamId);

    // Count by season
    const seasons = Array.from(new Set(teamTxs.map(t => t.season)));
    const seasonsAnalyzed = Math.max(seasons.length, 1);

    const adds = teamTxs.filter(t => t.itemType === "ADD" || t.type === "WAIVER" || t.type === "FREE_AGENT");
    const drops = teamTxs.filter(t => t.itemType === "DROP");
    const trades = teamTxs.filter(t => t.type === "TRADE");

    const avgAdds = Math.round((adds.length / seasonsAnalyzed) * 10) / 10;
    const avgDrops = Math.round((drops.length / seasonsAnalyzed) * 10) / 10;
    const avgTrades = Math.round((trades.length / seasonsAnalyzed) * 10) / 10;

    // Aggression scores (calibrated to league averages: ~35 adds, ~5 trades per season)
    const waiverAggressionScore = Math.min(100, Math.round((avgAdds / 70) * 100));
    const tradeFrequencyScore = Math.min(100, Math.round((avgTrades / 10) * 100));
    const rosterStabilityScore = Math.max(0, 100 - Math.round((avgDrops / Math.max(avgAdds, 1)) * 100));

    // Draft tendencies
    const avgDraftRoundByPosition: Record<string, number> = {};
    const positions = ["QB", "RB", "WR", "TE", "K", "D/ST"];
    for (const pos of positions) {
      const posPicks = teamPicks.filter(p => p.position === pos && !p.keeper);
      if (posPicks.length > 0) {
        avgDraftRoundByPosition[pos] = Math.round(
          (posPicks.reduce((s, p) => s + p.roundId, 0) / posPicks.length) * 10
        ) / 10;
      }
    }

    const earlyQbTendency = (avgDraftRoundByPosition["QB"] ?? 10) <= 3;
    const earlyTeTendency = (avgDraftRoundByPosition["TE"] ?? 10) <= 4;

    // GM Archetype derivation
    let gmArchetype = "Balanced Manager";
    let gmArchetypeDesc = "Moderate activity across all areas.";

    if (waiverAggressionScore >= 70 && tradeFrequencyScore >= 60) {
      gmArchetype = "Dealmaker";
      gmArchetypeDesc = "Extremely active on both waivers and trades. Never sits still.";
    } else if (waiverAggressionScore >= 70) {
      gmArchetype = "Waiver Grinder";
      gmArchetypeDesc = "Dominates the waiver wire. Relies on finding hidden gems over big trades.";
    } else if (tradeFrequencyScore >= 60) {
      gmArchetype = "Trade Shark";
      gmArchetypeDesc = "Aggressive trader who moves players frequently. Watch for low-ball offers.";
    } else if (waiverAggressionScore < 30 && tradeFrequencyScore < 30) {
      gmArchetype = "Set & Forget";
      gmArchetypeDesc = "Minimal roster moves. Either very confident in their team or disengaged.";
    } else if (earlyQbTendency) {
      gmArchetype = "QB-First Drafter";
      gmArchetypeDesc = "Prioritizes QB early in the draft. Can create positional scarcity at RB/WR.";
    } else if (rosterStabilityScore >= 80) {
      gmArchetype = "Roster Builder";
      gmArchetypeDesc = "Rarely drops players — builds through the draft and selective adds.";
    }

    results.push({
      teamId: team.teamId,
      ownerName,
      seasonsAnalyzed,
      avgWaiverAddsPerSeason: avgAdds,
      avgDropsPerSeason: avgDrops,
      waiverAggressionScore,
      avgTradesPerSeason: avgTrades,
      tradeFrequencyScore,
      avgDraftRoundByPosition,
      earlyQbTendency,
      earlyTeTendency,
      keeperEfficiencyAvg: 0, // filled in by calcKeeperEfficiency caller
      gmArchetype,
      gmArchetypeDesc,
      rosterStabilityScore,
    });
  }

  return results;
}

// ─── Rest-of-Season Value ─────────────────────────────────────────────────────

export interface ROSValueResult {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  avgPoints: number;
  weeksRemaining: number;
  rosProjectedTotal: number;   // avgPoints × weeksRemaining
  rosAdjusted: number;         // adjusted for injury risk, schedule, and trend
  scheduleStrength: "Easy" | "Neutral" | "Tough";
  injuryRisk: "None" | "Low" | "Medium" | "High";
  trendLabel: "Hot" | "Stable" | "Cold" | "Unknown";
}

export function calcROSValue(
  players: PlayerRow[],
  weeksRemaining: number = 10
): ROSValueResult[] {
  return players.map(player => {
    // Injury risk from ESPN status
    let injuryRisk: ROSValueResult["injuryRisk"] = "None";
    const status = (player.injuryStatus || "").toUpperCase();
    if (status === "OUT" || status === "IR") injuryRisk = "High";
    else if (status === "DOUBTFUL") injuryRisk = "High";
    else if (status === "QUESTIONABLE") injuryRisk = "Medium";
    else if (status === "PROBABLE") injuryRisk = "Low";

    // Injury discount
    const injuryDiscount = injuryRisk === "High" ? 0.5
      : injuryRisk === "Medium" ? 0.85
      : injuryRisk === "Low" ? 0.95
      : 1.0;

    const scheduleRaw = (player as PlayerRow & { scheduleStrength?: string | number }).scheduleStrength;
    const scheduleText = String(scheduleRaw ?? "").toLowerCase();
    const scheduleNumber = typeof scheduleRaw === "number" ? scheduleRaw : 0;
    const scheduleStrength: ROSValueResult["scheduleStrength"] = scheduleText.includes("easy") || scheduleText.includes("weak") || scheduleNumber > 0.1
      ? "Easy"
      : scheduleText.includes("tough") || scheduleText.includes("hard") || scheduleNumber < -0.1
        ? "Tough"
        : "Neutral";
    const scheduleMultiplier = scheduleStrength === "Easy" ? 1.08 : scheduleStrength === "Tough" ? 0.92 : 1.0;

    const rosProjectedTotal = Math.round(player.avgPoints * weeksRemaining * 10) / 10;
    const rosAdjusted = Math.round(rosProjectedTotal * injuryDiscount * scheduleMultiplier * 10) / 10;

    return {
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      ownerName: player.ownerName,
      avgPoints: player.avgPoints,
      weeksRemaining,
      rosProjectedTotal,
      rosAdjusted,
      scheduleStrength,
      injuryRisk,
      trendLabel: "Stable" as const, // enhanced with weekly data in future
    };
  }).sort((a, b) => b.rosAdjusted - a.rosAdjusted);
}

// ─── Trade Value (Math-First) ─────────────────────────────────────────────────

export interface TradeValueResult {
  playerId?: number;
  pickLabel?: string;
  name: string;
  position: string;
  avgPoints: number;
  vorp: number;
  rosValue: number;
  keeperBonus: number;        // extra value for being keepable at good cost
  positionalScarcityBonus: number;
  compositeValue: number;     // the number to use in trade math
  valueBreakdown: string;     // human-readable explanation
}

export function calcTradeValue(
  player: PlayerRow,
  vorpResult: VORPResult | undefined,
  rosResult: ROSValueResult | undefined,
  scarcity: PositionalScarcityResult | undefined,
  keeperEfficiency: KeeperEfficiencyResult | undefined
): TradeValueResult {
  const avgPoints = player.avgPoints;
  const vorp = vorpResult?.vorp ?? 0;
  const rosValue = rosResult?.rosAdjusted ?? (avgPoints * 10);

  // Keeper bonus: if player is a good keeper deal, add value
  const keeperBonus = keeperEfficiency
    ? Math.max(0, keeperEfficiency.roundSavings * 15)
    : 0;

  // Positional scarcity bonus: scarce positions are worth more
  const scarcityBonus = scarcity
    ? Math.round(scarcity.scarcityScore * 0.3)
    : 0;

  // Composite: ROS value + VORP premium + keeper bonus + scarcity bonus
  const compositeValue = Math.round(rosValue + (vorp * 5) + keeperBonus + scarcityBonus);

  const parts: string[] = [
    `ROS: ${rosValue.toFixed(0)}pts`,
    `VORP: ${vorp > 0 ? "+" : ""}${vorp.toFixed(1)}`,
  ];
  if (keeperBonus > 0) parts.push(`Keeper bonus: +${keeperBonus}`);
  if (scarcityBonus > 0) parts.push(`Scarcity: +${scarcityBonus}`);

  return {
    playerId: player.playerId,
    name: player.playerName,
    position: player.position,
    avgPoints,
    vorp,
    rosValue,
    keeperBonus,
    positionalScarcityBonus: scarcityBonus,
    compositeValue,
    valueBreakdown: parts.join(" | "),
  };
}

// ─── Pick Value (canonical 14-team snake formula) ─────────────────────────────

const PICK_BASE = 3000;
const PICK_K = 0.028;
const PICK_TEAMS = 14;

export function calcPickValue(round: number, pickInRound: number): number {
  const overallPick = (round - 1) * PICK_TEAMS + pickInRound;
  return Math.round(PICK_BASE * Math.exp(-PICK_K * (overallPick - 1)));
}

// ─── Full League Analytics Snapshot ──────────────────────────────────────────

export interface LeagueAnalyticsSnapshot {
  season: number;
  computedAt: Date;
  vorp: VORPResult[];
  scarcity: PositionalScarcityResult[];
  rosterGaps: RosterGapResult[];
  keeperEfficiency: KeeperEfficiencyResult[];
  managerBehavior: ManagerBehaviorStats[];
  rosValues: ROSValueResult[];
  dataQuality: {
    playerCount: number;
    teamsWithRosters: number;
    hasTransactionData: boolean;
    hasDraftData: boolean;
  };
}

export function calcLeagueAnalytics(
  season: number,
  players: PlayerRow[],
  freeAgents: PlayerRow[],
  teams: TeamRow[],
  transactions: TransactionRow[],
  draftPicks: DraftPickRow[],
  ownerNameMap: Record<number, string>,
  weeksRemaining: number = 10
): LeagueAnalyticsSnapshot {
  const vorp = calcVORP(players);
  const scarcity = calcPositionalScarcity(players, freeAgents);
  const rosterGaps = calcRosterGaps(players);
  const keeperEfficiency = calcKeeperEfficiency(players, vorp);
  const managerBehavior = calcManagerBehavior(teams, transactions, draftPicks, ownerNameMap);
  const rosValues = calcROSValue(players, weeksRemaining);

  return {
    season,
    computedAt: new Date(),
    vorp,
    scarcity,
    rosterGaps,
    keeperEfficiency,
    managerBehavior,
    rosValues,
    dataQuality: {
      playerCount: players.length,
      teamsWithRosters: Array.from(new Set(players.map(p => p.teamId))).length,
      hasTransactionData: transactions.length > 0,
      hasDraftData: draftPicks.length > 0,
    },
  };
}
