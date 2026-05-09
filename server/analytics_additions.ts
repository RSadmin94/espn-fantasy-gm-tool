/**
 * analytics_additions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SEPARATE FILE — copy to server/analytics_additions.ts.
 * Do NOT paste this into server/analytics.ts.
 *
 * The import type line below intentionally imports shared types from ./analytics.
 * If this code is pasted directly into analytics.ts, that import can create a
 * circular/self import problem. Keep this as its own module.
 *
 * Adds:
 *   1. calc3DProjections — floor / median / ceiling per player
 *   2. calcKeeperFutureValue — multi-year ROI score
 *   3. calcStrengthOfSchedule — upcoming matchup difficulty
 *   4. calcOpponentOvervaluation — per-opponent positional draft bias
 *   5. buildStrategyModeContext — win-now / long-term context builder
 *   6. calcWaiverReplacementCost — waiver opportunity cost by position
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PlayerRow, TeamRow, DraftPickRow, TransactionRow, ManagerBehaviorStats } from "./analytics";

// ─── 1. 3D PROJECTIONS ────────────────────────────────────────────────────────
// Requires: weekly scoring history per player (array of weekly point totals)

export interface Projection3D {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  // Core three numbers
  floor: number;        // 25th percentile weekly score × weeksRemaining
  median: number;       // 50th percentile (median) × weeksRemaining
  ceiling: number;      // 90th percentile weekly score × weeksRemaining
  // Per-week equivalents for display
  floorPerWeek: number;
  medianPerWeek: number;
  ceilingPerWeek: number;
  // Boom/bust classification
  volatility: number;               // standard deviation of weekly scores
  volatilityLabel: "Boom/Bust" | "Volatile" | "Consistent" | "Safe Floor";
  profile: "Ceiling Play" | "Safe Floor" | "Balanced" | "Boom/Bust";
  // Confidence
  sampleSize: number;               // weeks of data used
  weeksRemaining: number;
}

/**
 * Calculates floor/median/ceiling projections from weekly scoring history.
 *
 * @param playerWeeklyScores  Map of playerId → array of weekly point totals
 * @param players             PlayerRow array for metadata
 * @param weeksRemaining      Weeks left in the season (default 10)
 */
export function calc3DProjections(
  playerWeeklyScores: Map<number, number[]>,
  players: PlayerRow[],
  weeksRemaining: number = 10
): Projection3D[] {
  const results: Projection3D[] = [];

  for (const player of players) {
    const weekly = playerWeeklyScores.get(player.playerId) || [];

    // Need at least 3 data points for meaningful percentiles
    if (weekly.length === 0) {
      // Fallback: derive from avgPoints with fixed variance assumptions by position
      const posVariance: Record<string, number> = {
        QB: 0.22, RB: 0.35, WR: 0.40, TE: 0.38, K: 0.25, "D/ST": 0.45,
      };
      const variance = posVariance[player.position] || 0.35;
      const avg = player.avgPoints;
      const floor = Math.round(avg * (1 - variance) * weeksRemaining * 10) / 10;
      const median = Math.round(avg * weeksRemaining * 10) / 10;
      const ceiling = Math.round(avg * (1 + variance * 1.5) * weeksRemaining * 10) / 10;
      results.push({
        playerId: player.playerId,
        playerName: player.playerName,
        position: player.position,
        ownerName: player.ownerName,
        floor, median, ceiling,
        floorPerWeek: Math.round(floor / weeksRemaining * 10) / 10,
        medianPerWeek: Math.round(median / weeksRemaining * 10) / 10,
        ceilingPerWeek: Math.round(ceiling / weeksRemaining * 10) / 10,
        volatility: Math.round(avg * variance * 10) / 10,
        volatilityLabel: variance >= 0.38 ? "Boom/Bust" : variance >= 0.28 ? "Volatile" : "Consistent",
        profile: variance >= 0.38 ? "Ceiling Play" : variance <= 0.25 ? "Safe Floor" : "Balanced",
        sampleSize: 0,
        weeksRemaining,
      });
      continue;
    }

    const sorted = [...weekly].sort((a, b) => a - b);
    const n = sorted.length;

    // Percentile helper
    const pct = (p: number) => {
      const idx = (p / 100) * (n - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };

    const floorPpw = Math.round(pct(25) * 10) / 10;
    const medianPpw = Math.round(pct(50) * 10) / 10;
    const ceilingPpw = Math.round(pct(90) * 10) / 10;

    // Standard deviation
    const mean = weekly.reduce((s, v) => s + v, 0) / n;
    const variance = weekly.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

    // Volatility classification
    const cv = stdDev / Math.max(mean, 1); // coefficient of variation
    let volatilityLabel: Projection3D["volatilityLabel"];
    let profile: Projection3D["profile"];
    if (cv >= 0.55) { volatilityLabel = "Boom/Bust"; profile = "Boom/Bust"; }
    else if (cv >= 0.40) { volatilityLabel = "Volatile"; profile = "Ceiling Play"; }
    else if (cv >= 0.25) { volatilityLabel = "Consistent"; profile = "Balanced"; }
    else { volatilityLabel = "Safe Floor"; profile = "Safe Floor"; }

    results.push({
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      ownerName: player.ownerName,
      floor: Math.round(floorPpw * weeksRemaining * 10) / 10,
      median: Math.round(medianPpw * weeksRemaining * 10) / 10,
      ceiling: Math.round(ceilingPpw * weeksRemaining * 10) / 10,
      floorPerWeek: floorPpw,
      medianPerWeek: medianPpw,
      ceilingPerWeek: ceilingPpw,
      volatility: stdDev,
      volatilityLabel,
      profile,
      sampleSize: n,
      weeksRemaining,
    });
  }

  return results.sort((a, b) => b.median - a.median);
}

// ─── 2. KEEPER FUTURE VALUE SCORE ─────────────────────────────────────────────
// Accounts for multi-year cost compounding and age trajectory

export interface KeeperFutureValue {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  currentAvgPoints: number;
  // This year
  keeperRoundCost: number;       // round they cost to keep this year
  keeperPickValue: number;       // pick value of that round
  // Next year projection
  nextYearRoundCost: number;     // round + 1 if kept again
  nextYearPickValue: number;
  // Value calculations
  currentYearSurplus: number;    // ADP equiv value − keeper cost value
  nextYearSurplus: number;       // projected next year value − next year cost
  combinedROI: number;           // total value over 2 years vs cost over 2 years
  roiScore: number;              // 0-100
  roiLabel: "Elite ROI" | "Strong ROI" | "Fair ROI" | "Poor ROI" | "Release";
  // Age/trajectory factor
  ageGroup: "Prime (24-27)" | "Young (22-23)" | "Veteran (28-30)" | "Decline (31+)" | "Unknown";
  trajectoryMultiplier: number;  // applied to next-year value projection
  recommendation: string;
}

const PICK_BASE_FV = 3000;
const PICK_K_FV = 0.028;
const PICK_TEAMS_FV = 14;

function pickValFV(round: number, pickMid = 7): number {
  const overall = (round - 1) * PICK_TEAMS_FV + pickMid;
  return Math.round(PICK_BASE_FV * Math.exp(-PICK_K_FV * (overall - 1)));
}

function estimateAdpRoundFV(avgPoints: number, position: string): number {
  const adj = position === "QB" ? avgPoints * 0.85 : avgPoints;
  const thresholds: [number, number][] = [
    [22, 1], [19, 2], [17, 3], [15, 4], [13, 5],
    [11, 6], [9, 7], [8, 8], [7, 9], [6, 10], [0, 11],
  ];
  for (const [t, r] of thresholds) if (adj >= t) return r;
  return 12;
}

export function calcKeeperFutureValue(
  players: PlayerRow[],
  // Optional: player ages from ESPN or manual mapping
  playerAges?: Map<number, number>
): KeeperFutureValue[] {
  const results: KeeperFutureValue[] = [];

  for (const player of players) {
    if (!player.keeperValue || player.keeperValue <= 0) continue;

    const keeperRound = player.keeperValue;
    const nextYearRound = Math.min(keeperRound + 1, 14);

    const keeperPickValue = pickValFV(keeperRound);
    const nextYearPickValue = pickValFV(nextYearRound);

    const adpRound = estimateAdpRoundFV(player.avgPoints, player.position);
    const adpPickValue = pickValFV(adpRound);

    // Age trajectory
    const age = playerAges?.get(player.playerId) ?? 0;
    let ageGroup: KeeperFutureValue["ageGroup"] = "Unknown";
    let trajectoryMultiplier = 1.0;
    if (age >= 22 && age <= 23) { ageGroup = "Young (22-23)"; trajectoryMultiplier = 1.08; }
    else if (age >= 24 && age <= 27) { ageGroup = "Prime (24-27)"; trajectoryMultiplier = 1.02; }
    else if (age >= 28 && age <= 30) { ageGroup = "Veteran (28-30)"; trajectoryMultiplier = 0.90; }
    else if (age > 30) { ageGroup = "Decline (31+)"; trajectoryMultiplier = 0.78; }
    else { trajectoryMultiplier = 1.0; }

    // RB-specific age penalty (RBs age faster)
    if (player.position === "RB" && age >= 28) {
      trajectoryMultiplier = Math.max(0.70, trajectoryMultiplier - 0.08);
    }

    const currentYearSurplus = adpPickValue - keeperPickValue;
    const nextYearAdpValue = Math.round(adpPickValue * trajectoryMultiplier);
    const nextYearSurplus = nextYearAdpValue - nextYearPickValue;
    const combinedROI = currentYearSurplus + nextYearSurplus;

    // Score: normalize to 0-100 (max reasonable combined ROI ≈ 4000)
    const roiScore = Math.round(Math.max(0, Math.min(100, 50 + (combinedROI / 80))));

    let roiLabel: KeeperFutureValue["roiLabel"];
    if (roiScore >= 80) roiLabel = "Elite ROI";
    else if (roiScore >= 65) roiLabel = "Strong ROI";
    else if (roiScore >= 45) roiLabel = "Fair ROI";
    else if (roiScore >= 25) roiLabel = "Poor ROI";
    else roiLabel = "Release";

    let recommendation: string;
    const roundSavings = adpRound - keeperRound;
    if (roiScore >= 80) {
      recommendation = `Keep both years — ${roundSavings} round surplus now, strong future value`;
    } else if (roiScore >= 65) {
      recommendation = `Keep this year — monitor next year's cost vs production`;
    } else if (roiScore >= 45) {
      recommendation = `Marginal keep — consider if you need the draft slot`;
    } else {
      recommendation = `Release — cost exceeds value, take the draft pick instead`;
    }

    results.push({
      playerId: player.playerId,
      playerName: player.playerName,
      position: player.position,
      ownerName: player.ownerName,
      currentAvgPoints: player.avgPoints,
      keeperRoundCost: keeperRound,
      keeperPickValue,
      nextYearRoundCost: nextYearRound,
      nextYearPickValue,
      currentYearSurplus,
      nextYearSurplus,
      combinedROI,
      roiScore,
      roiLabel,
      ageGroup,
      trajectoryMultiplier,
      recommendation,
    });
  }

  return results.sort((a, b) => b.roiScore - a.roiScore);
}

// ─── 3. STRENGTH OF SCHEDULE ──────────────────────────────────────────────────
// Derived from historical matchup data in the ESPN cache

export interface SOSResult {
  teamId: number;
  ownerName: string;
  // Upcoming schedule difficulty
  avgOpponentPF: number;          // avg points opponent scores — higher = harder schedule
  scheduleRating: "Brutal" | "Hard" | "Average" | "Easy" | "Cupcake";
  scheduleScore: number;          // 0-100, higher = harder
  playoffScheduleRating: "Brutal" | "Hard" | "Average" | "Easy" | "Cupcake";
  // For use as a multiplier in trade value calculations
  sosTradingMultiplier: number;   // < 1 = discount for hard schedule, > 1 = boost for easy schedule
  remainingMatchups: { week: number; opponentId: number; opponentOwner: string; }[];
}

/**
 * Calculates schedule strength from matchup history.
 * Uses opponents' avg PF as a proxy for matchup difficulty.
 */
export function calcStrengthOfSchedule(
  matchups: {
    week: number;
    homeTeamId: number;
    awayTeamId: number;
    homeScore: number;
    awayScore: number;
    winner: string;
  }[],
  teams: TeamRow[],
  ownerNameMap: Record<number, string>,
  currentWeek: number,
  playoffStartWeek: number = 15
): SOSResult[] {
  const results: SOSResult[] = [];

  // Build avg PF per team from completed matchups
  const teamPFHistory: Record<number, number[]> = {};
  for (const m of matchups.filter(m => m.week < currentWeek)) {
    if (!teamPFHistory[m.homeTeamId]) teamPFHistory[m.homeTeamId] = [];
    if (!teamPFHistory[m.awayTeamId]) teamPFHistory[m.awayTeamId] = [];
    teamPFHistory[m.homeTeamId].push(m.homeScore);
    teamPFHistory[m.awayTeamId].push(m.awayScore);
  }

  const teamAvgPF: Record<number, number> = {};
  for (const [tid, scores] of Object.entries(teamPFHistory)) {
    teamAvgPF[Number(tid)] = scores.length > 0
      ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
      : 0;
  }

  const allAvgPF = Object.values(teamAvgPF);
  const leagueAvgPF = allAvgPF.length > 0
    ? allAvgPF.reduce((s, v) => s + v, 0) / allAvgPF.length
    : 130;

  for (const team of teams) {
    const tid = team.teamId;
    const ownerName = ownerNameMap[tid] || team.ownerName;

    // Get upcoming matchups
    const upcoming = matchups
      .filter(m => m.week >= currentWeek && (m.homeTeamId === tid || m.awayTeamId === tid))
      .map(m => ({
        week: m.week,
        opponentId: m.homeTeamId === tid ? m.awayTeamId : m.homeTeamId,
        opponentOwner: ownerNameMap[m.homeTeamId === tid ? m.awayTeamId : m.homeTeamId] || "?",
      }));

    const upcomingOpponentPFs = upcoming
      .map(u => teamAvgPF[u.opponentId] || leagueAvgPF)
      .filter(v => v > 0);

    const avgOpponentPF = upcomingOpponentPFs.length > 0
      ? Math.round((upcomingOpponentPFs.reduce((s, v) => s + v, 0) / upcomingOpponentPFs.length) * 10) / 10
      : leagueAvgPF;

    // Playoff schedule
    const playoffMatchups = upcoming.filter(u => u.week >= playoffStartWeek);
    const playoffOpponentPFs = playoffMatchups.map(u => teamAvgPF[u.opponentId] || leagueAvgPF);
    const avgPlayoffOpponentPF = playoffOpponentPFs.length > 0
      ? playoffOpponentPFs.reduce((s, v) => s + v, 0) / playoffOpponentPFs.length
      : leagueAvgPF;

    const scheduleScore = Math.round(Math.max(0, Math.min(100,
      ((avgOpponentPF - leagueAvgPF) / leagueAvgPF) * 200 + 50
    )));

    const rateLabel = (pf: number): SOSResult["scheduleRating"] => {
      const diff = pf - leagueAvgPF;
      if (diff > 15) return "Brutal";
      if (diff > 7) return "Hard";
      if (diff > -7) return "Average";
      if (diff > -15) return "Easy";
      return "Cupcake";
    };

    // Trading multiplier: easy schedule = higher value (more wins = playoff relevance)
    const sosTradingMultiplier = Math.round((1 + ((leagueAvgPF - avgOpponentPF) / leagueAvgPF) * 0.15) * 100) / 100;

    results.push({
      teamId: tid,
      ownerName,
      avgOpponentPF,
      scheduleRating: rateLabel(avgOpponentPF),
      scheduleScore,
      playoffScheduleRating: rateLabel(avgPlayoffOpponentPF),
      sosTradingMultiplier: Math.max(0.85, Math.min(1.15, sosTradingMultiplier)),
      remainingMatchups: upcoming,
    });
  }

  return results.sort((a, b) => b.scheduleScore - a.scheduleScore);
}

// ─── 4. OPPONENT OVERVALUATION DETECTOR ──────────────────────────────────────
// Extends calcManagerBehavior output to detect per-opponent positional bias
// for use in the Trade Analyzer

export interface OpponentOvervaluation {
  teamId: number;
  ownerName: string;
  gmArchetype: string;
  // Positions this manager overvalues (drafts earlier than league avg)
  overvaluedPositions: {
    position: string;
    theirAvgRound: number;
    leagueAvgRound: number;
    roundsEarlier: number;
    exploitLabel: string;    // "Sell your RB here" etc.
  }[];
  // Positions this manager undervalues (drafts later than league avg)
  undervaluedPositions: {
    position: string;
    theirAvgRound: number;
    leagueAvgRound: number;
    roundsLater: number;
    buyLabel: string;        // "Buy TE from this manager cheap"
  }[];
  // Trade targeting summary
  tradeTargetSummary: string;
  sellHighPositions: string[];
  buyLowPositions: string[];
}

/**
 * Detects positional overvaluation per manager from draft history.
 * Feed the output into TradeAnalyzer to surface exploit opportunities.
 *
 * @param draftPicks  All draft picks across multiple seasons
 * @param teams       Team roster
 * @param ownerNameMap teamId → owner name
 * @param managerBehavior  Output from calcManagerBehavior (for GM archetype)
 */
export function calcOpponentOvervaluation(
  draftPicks: DraftPickRow[],
  teams: TeamRow[],
  ownerNameMap: Record<number, string>,
  managerBehavior: ManagerBehaviorStats[]
): OpponentOvervaluation[] {
  const positions = ["QB", "RB", "WR", "TE"];
  const results: OpponentOvervaluation[] = [];

  // Calculate league average draft round per position (excluding keepers)
  const leagueAvgByPos: Record<string, number> = {};
  for (const pos of positions) {
    const posPicks = draftPicks.filter(p => p.position === pos && !p.keeper);
    leagueAvgByPos[pos] = posPicks.length > 0
      ? Math.round((posPicks.reduce((s, p) => s + p.roundId, 0) / posPicks.length) * 10) / 10
      : 7;
  }

  for (const team of teams) {
    const tid = team.teamId;
    const ownerName = ownerNameMap[tid] || team.ownerName;
    const behavior = managerBehavior.find(b => b.teamId === tid);
    const gmArchetype = behavior?.gmArchetype || "Unknown";
    const avgByPos = behavior?.avgDraftRoundByPosition || {};

    const overvalued: OpponentOvervaluation["overvaluedPositions"] = [];
    const undervalued: OpponentOvervaluation["undervaluedPositions"] = [];

    for (const pos of positions) {
      const theirAvg = avgByPos[pos];
      if (!theirAvg) continue;
      const leagueAvg = leagueAvgByPos[pos];
      const diff = leagueAvg - theirAvg; // positive = they draft earlier = overvalue

      if (diff >= 1.5) {
        overvalued.push({
          position: pos,
          theirAvgRound: theirAvg,
          leagueAvgRound: leagueAvg,
          roundsEarlier: Math.round(diff * 10) / 10,
          exploitLabel: `Sell your ${pos} to ${ownerName} — they pay ${diff.toFixed(1)} rounds above market`,
        });
      } else if (diff <= -1.5) {
        undervalued.push({
          position: pos,
          theirAvgRound: theirAvg,
          leagueAvgRound: leagueAvg,
          roundsLater: Math.round(Math.abs(diff) * 10) / 10,
          buyLabel: `Buy ${pos} from ${ownerName} cheap — they undervalue by ${Math.abs(diff).toFixed(1)} rounds`,
        });
      }
    }

    const sellHighPositions = overvalued.map(o => o.position);
    const buyLowPositions = undervalued.map(u => u.position);

    let tradeTargetSummary = "";
    if (sellHighPositions.length > 0 && buyLowPositions.length > 0) {
      tradeTargetSummary = `Sell ${sellHighPositions.join("/")} high, buy ${buyLowPositions.join("/")} low. ${gmArchetype} — active trader.`;
    } else if (sellHighPositions.length > 0) {
      tradeTargetSummary = `Sell ${sellHighPositions.join("/")} to this manager — they consistently overpay.`;
    } else if (buyLowPositions.length > 0) {
      tradeTargetSummary = `Target their ${buyLowPositions.join("/")} players — they undervalue this position.`;
    } else {
      tradeTargetSummary = "Market-aware manager — no strong positional bias detected.";
    }

    results.push({
      teamId: tid,
      ownerName,
      gmArchetype,
      overvaluedPositions: overvalued.sort((a, b) => b.roundsEarlier - a.roundsEarlier),
      undervaluedPositions: undervalued.sort((a, b) => b.roundsLater - a.roundsLater),
      tradeTargetSummary,
      sellHighPositions,
      buyLowPositions,
    });
  }

  return results.sort((a, b) =>
    (b.overvaluedPositions.length + b.undervaluedPositions.length) -
    (a.overvaluedPositions.length + a.undervaluedPositions.length)
  );
}

// ─── 5. WIN-NOW vs LONG-TERM MODE CONTEXT BUILDER ────────────────────────────
// Call this to build the mode-specific AI context string injected into prompts

export type StrategyMode = "win_now" | "long_term" | "balanced";

export interface StrategyModeContext {
  mode: StrategyMode;
  modeLabel: string;
  modeDescription: string;
  aiInstruction: string;          // inject directly into AI prompt
  tradeValueAdjustments: {
    rosWeight: number;            // multiplier for ROS value in composite
    keeperBonusWeight: number;    // multiplier for keeper bonus in composite
    pickValueAdjustment: number;  // multiplier for draft pick values
  };
}

/**
 * Derives the recommended strategy mode from a team's current standing.
 * Also allows manual override.
 */
export function buildStrategyModeContext(
  teamRecord: { wins: number; losses: number; ties: number; },
  currentWeek: number,
  totalRegularSeasonWeeks: number = 14,
  manualOverride?: StrategyMode
): StrategyModeContext {
  const gamesPlayed = teamRecord.wins + teamRecord.losses + teamRecord.ties;
  const winPct = gamesPlayed > 0 ? teamRecord.wins / gamesPlayed : 0.5;
  const weeksRemaining = totalRegularSeasonWeeks - currentWeek;
  const isPlayoffBubble = winPct >= 0.35 && winPct <= 0.60;
  const isLockedIn = winPct >= 0.65;
  const isEliminated = winPct < 0.30 && weeksRemaining <= 4;

  let mode: StrategyMode = manualOverride || "balanced";

  if (!manualOverride) {
    if (isLockedIn) mode = "long_term";
    else if (isEliminated) mode = "long_term";
    else if (isPlayoffBubble && weeksRemaining <= 6) mode = "win_now";
    else mode = "balanced";
  }

  const configs: Record<StrategyMode, StrategyModeContext> = {
    win_now: {
      mode: "win_now",
      modeLabel: "Win-Now Mode",
      modeDescription: "On the playoff bubble — prioritize immediate weekly points",
      aiInstruction: `STRATEGY MODE: WIN-NOW (Playoff bubble — ${teamRecord.wins}-${teamRecord.losses}). 
Prioritize: (1) immediate ROS production over future keeper value, (2) proven weekly floor over upside ceiling, 
(3) players with easy upcoming schedule, (4) ignore long-term age concerns. 
Do NOT recommend giving up proven starters for unproven upside. Every week matters.`,
      tradeValueAdjustments: { rosWeight: 1.4, keeperBonusWeight: 0.5, pickValueAdjustment: 0.7 },
    },
    long_term: {
      mode: "long_term",
      modeLabel: "Long-Term Mode",
      modeDescription: "Seed locked or eliminated — optimize for next season",
      aiInstruction: `STRATEGY MODE: LONG-TERM (Seed locked or rebuilding — ${teamRecord.wins}-${teamRecord.losses}). 
Prioritize: (1) keeper value and future draft cost over current production, (2) young ascending players over aging veterans, 
(3) draft picks over aging starters, (4) building for 2026 draft position. 
Current season results are secondary to building a championship foundation.`,
      tradeValueAdjustments: { rosWeight: 0.7, keeperBonusWeight: 1.8, pickValueAdjustment: 1.4 },
    },
    balanced: {
      mode: "balanced",
      modeLabel: "Balanced Mode",
      modeDescription: "Competitive — balance current production and future value",
      aiInstruction: `STRATEGY MODE: BALANCED (${teamRecord.wins}-${teamRecord.losses}). 
Weigh both immediate production and long-term keeper/draft value equally. 
Prefer trades that improve both the current roster and future flexibility.`,
      tradeValueAdjustments: { rosWeight: 1.0, keeperBonusWeight: 1.0, pickValueAdjustment: 1.0 },
    },
  };

  return configs[mode];
}

// ─── 6. WAIVER REPLACEMENT COST ───────────────────────────────────────────────
// For Start/Sit — shows opportunity cost of sitting a player

export interface WaiverReplacementCost {
  position: string;
  topWaiverPlayers: {
    playerName: string;
    avgPoints: number;
    vorp: number;
  }[];
  avgTop3Ppg: number;             // average of top 3 available at position
  replacementCost: string;        // human-readable opportunity cost summary
}

/**
 * Calculates the top available waiver players per position.
 * Feed freeAgents from ESPN cache (players not on any roster).
 */
export function calcWaiverReplacementCost(
  freeAgents: PlayerRow[],
  positions: string[] = ["QB", "RB", "WR", "TE"]
): WaiverReplacementCost[] {
  return positions.map(pos => {
    const posFA = freeAgents
      .filter(p => p.position === pos)
      .sort((a, b) => b.avgPoints - a.avgPoints)
      .slice(0, 3);

    const avgTop3 = posFA.length > 0
      ? Math.round((posFA.reduce((s, p) => s + p.avgPoints, 0) / posFA.length) * 10) / 10
      : 0;

    const replacementCost = posFA.length === 0
      ? `No ${pos} available on waivers`
      : `Best available ${pos}: ${posFA[0].playerName} (${posFA[0].avgPoints.toFixed(1)} ppg). Top 3 average: ${avgTop3} ppg.`;

    return {
      position: pos,
      topWaiverPlayers: posFA.map(p => ({ playerName: p.playerName, avgPoints: p.avgPoints, vorp: 0 })),
      avgTop3Ppg: avgTop3,
      replacementCost,
    };
  });
}
