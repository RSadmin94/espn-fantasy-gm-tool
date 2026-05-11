// FILE: server/monteCarloService.ts
/**
 * Phase 2 — Monte Carlo Simulation Engine (Lean v1)
 *
 * Runs 10,000 weekly matchup simulations to produce real win probability
 * rather than deterministic point projections.
 *
 * Inputs per player:
 *   - projectedPoints   (from ECR/ADP board or ESPN avg)
 *   - stdDev            (derived from ecrStd, position defaults, or weekly variance)
 *   - volatilityMultiplier (from Phase 1 injuryService — defaults to 1.0)
 *   - matchupAdjustment (schedule strength modifier — defaults to 0)
 *
 * Outputs:
 *   - winProbability      0-100%
 *   - bustProbability     0-100%  (score < replacement level)
 *   - ceilingProbability  0-100%  (score > 1.5× projection)
 *   - projectedScore      adjusted median
 *   - scoreRange          { p10, p25, p50, p75, p90 }
 *   - confidenceLabel     HIGH / MEDIUM / LOW
 *
 * Architecture note (from Phase 2 blueprint):
 *   LLMs explain decisions. This engine produces the numbers.
 *   AI layers receive simulation output as calculated facts.
 *
 * Exports:
 *   simulateMatchup()        — core weekly matchup sim (two lineups)
 *   simulatePlayer()         — single player outcome distribution
 *   calcLineupProjection()   — aggregate lineup stats from player list
 *   deriveStdDev()           — estimate stdDev when not explicitly provided
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SimPlayer {
  playerId: number;
  playerName: string;
  position: string;
  /** Base projected points for this week */
  projectedPoints: number;
  /** Standard deviation — use deriveStdDev() if unknown */
  stdDev?: number;
  /** From Phase 1 injuryService: 1.0 = healthy, 0.35 = doubtful, etc. */
  volatilityMultiplier?: number;
  /** Schedule strength modifier: +0.08 = easy, -0.08 = tough, 0 = neutral */
  matchupAdjustment?: number;
  /** FantasyPros ECR standard deviation — used to derive stdDev if not provided */
  ecrStd?: number;
}

export interface PlayerOutcome {
  playerId: number;
  playerName: string;
  position: string;
  projectedPoints: number;       // raw input
  adjustedProjection: number;    // after injury + matchup adjustments
  stdDev: number;                // used in simulation
  /** Percentile distribution across 10,000 sims */
  scoreRange: {
    p10: number;   // floor — score at 10th percentile
    p25: number;
    p50: number;   // median
    p75: number;
    p90: number;   // ceiling
  };
  bustProbability: number;       // % sims below replacement level
  ceilingProbability: number;    // % sims above 1.5× projection
  volatilityMultiplier: number;
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
}

export interface LineupOutcome {
  players: PlayerOutcome[];
  totalProjected: number;        // sum of adjustedProjection
  totalP10: number;
  totalP50: number;
  totalP90: number;
  lineupStdDev: number;
}

export interface MatchupSimResult {
  myLineup: LineupOutcome;
  opponentLineup: LineupOutcome;
  /** % of 10,000 sims where myLineup total > opponentLineup total */
  winProbability: number;
  /** Point spread: myLineup.totalP50 - opponentLineup.totalP50 */
  projectedSpread: number;
  /** Confidence in the win probability estimate */
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  /** How many simulations were run */
  simCount: number;
  /** Plain-English summary for injection into AI prompts */
  summaryText: string;
}

// ─── Position replacement levels (PPR, 14-team) ───────────────────────────────
// Used to calculate bust probability (scoring below replacement)

const REPLACEMENT_LEVEL_PPG: Record<string, number> = {
  QB: 16,
  RB: 8,
  WR: 8,
  TE: 6,
  K: 6,
  "D/ST": 6,
};

// ─── Position standard deviation defaults ────────────────────────────────────
// Based on historical PPR variance by position.
// QB is relatively consistent; RB and TE are high variance.

const POSITION_STD_DEV_PCT: Record<string, number> = {
  QB: 0.30,    // QBs are ~30% std dev of their projection
  RB: 0.55,    // RBs are highly variable (game script, splits)
  WR: 0.50,
  TE: 0.55,
  K: 0.60,
  "D/ST": 0.65,
};

// ─── Core RNG: Box-Muller transform ──────────────────────────────────────────
// Generates a normally-distributed random number given mean and stdDev.
// Pure math — no external dependencies.

function gaussianRandom(mean: number, stdDev: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  // Fantasy scores can't go below 0
  return Math.max(0, mean + z0 * stdDev);
}

// ─── Standard deviation derivation ───────────────────────────────────────────

/**
 * Estimates a player's weekly standard deviation when not explicitly provided.
 *
 * Priority:
 *   1. ecrStd from FantasyPros (direct ranking uncertainty proxy)
 *   2. Historical weekly variance from your weeklyPlayerStats DB
 *   3. Position-based default percentage of projection
 *
 * For v1, we use ecrStd as a ranking variance signal and convert to points,
 * then apply a position multiplier. This is good enough for the lean v1.
 */
export function deriveStdDev(
  projectedPoints: number,
  position: string,
  ecrStd?: number,         // from MergedPlayer.ecrStd (ranking positions)
  weeklyVariance?: number  // pre-calculated from historical weekly stats
): number {
  // If we have actual historical weekly variance, use it directly
  if (weeklyVariance !== undefined && weeklyVariance > 0) {
    return Math.sqrt(weeklyVariance);
  }

  // Convert ECR std (in ranking positions) to points uncertainty
  // Rough calibration: 1 ECR position ≈ 0.3 PPG difference for skill positions
  if (ecrStd !== undefined && ecrStd > 0) {
    const rankingUncertainty = ecrStd * 0.3;
    const positionBase = projectedPoints * (POSITION_STD_DEV_PCT[position] ?? 0.5);
    // Take the larger of the two signals
    return Math.max(rankingUncertainty, positionBase * 0.8);
  }

  // Default: position-based percentage of projection
  return projectedPoints * (POSITION_STD_DEV_PCT[position] ?? 0.5);
}

// ─── Single player simulation ─────────────────────────────────────────────────

/**
 * Runs N simulations for a single player and returns their outcome distribution.
 */
export function simulatePlayer(
  player: SimPlayer,
  simCount: number = 10000
): PlayerOutcome {
  const volatility = player.volatilityMultiplier ?? 1.0;
  const matchupAdj = player.matchupAdjustment ?? 0;
  const adjustedProjection = Math.max(0, player.projectedPoints * volatility * (1 + matchupAdj));

  const stdDev = player.stdDev ?? deriveStdDev(player.projectedPoints, player.position);
  // Apply volatility to stdDev too — injured players have more variance
  const adjustedStdDev = stdDev * (2 - volatility); // volatility 0.5 → 1.5× std dev

  const replacementLevel = REPLACEMENT_LEVEL_PPG[player.position] ?? 6;
  const ceilingThreshold = player.projectedPoints * 1.5;

  // Run the simulations
  const results: number[] = new Array(simCount);
  let bustCount = 0;
  let ceilingCount = 0;

  for (let i = 0; i < simCount; i++) {
    const score = gaussianRandom(adjustedProjection, adjustedStdDev);
    results[i] = score;
    if (score < replacementLevel) bustCount++;
    if (score > ceilingThreshold) ceilingCount++;
  }

  // Sort for percentile calculation
  results.sort((a, b) => a - b);

  const pct = (p: number) => Math.round(results[Math.floor(simCount * p)] * 10) / 10;

  const bustProbability = Math.round((bustCount / simCount) * 100);
  const ceilingProbability = Math.round((ceilingCount / simCount) * 100);

  // Confidence: high if injury is low and projection is stable
  const injuryRisk = 1 - volatility; // 0=healthy, 1=out
  const confidenceLabel: PlayerOutcome["confidenceLabel"] =
    injuryRisk >= 0.5 ? "LOW" :
    injuryRisk >= 0.2 || bustProbability >= 30 ? "MEDIUM" :
    "HIGH";

  return {
    playerId: player.playerId,
    playerName: player.playerName,
    position: player.position,
    projectedPoints: player.projectedPoints,
    adjustedProjection: Math.round(adjustedProjection * 10) / 10,
    stdDev: Math.round(adjustedStdDev * 10) / 10,
    scoreRange: {
      p10: pct(0.10),
      p25: pct(0.25),
      p50: pct(0.50),
      p75: pct(0.75),
      p90: pct(0.90),
    },
    bustProbability,
    ceilingProbability,
    volatilityMultiplier: volatility,
    confidenceLabel,
  };
}

// ─── Lineup aggregation ───────────────────────────────────────────────────────

/**
 * Runs individual player simulations and aggregates to a full lineup outcome.
 */
export function calcLineupProjection(
  players: SimPlayer[],
  simCount: number = 10000
): LineupOutcome {
  const playerOutcomes = players.map(p => simulatePlayer(p, simCount));

  // For lineup totals, we need correlated simulations (not just summing percentiles)
  // Run simCount lineup-level sims
  const lineupTotals: number[] = new Array(simCount);
  const stdDevs = playerOutcomes.map(o => o.stdDev);
  const adjustedProjections = playerOutcomes.map(o => o.adjustedProjection);

  for (let i = 0; i < simCount; i++) {
    let total = 0;
    for (let j = 0; j < playerOutcomes.length; j++) {
      total += gaussianRandom(adjustedProjections[j], stdDevs[j]);
    }
    lineupTotals[i] = Math.max(0, total);
  }

  lineupTotals.sort((a, b) => a - b);
  const pct = (p: number) => Math.round(lineupTotals[Math.floor(simCount * p)] * 10) / 10;

  const totalProjected = Math.round(playerOutcomes.reduce((s, o) => s + o.adjustedProjection, 0) * 10) / 10;
  const lineupStdDev = Math.round(Math.sqrt(stdDevs.reduce((s, v) => s + v * v, 0)) * 10) / 10;

  return {
    players: playerOutcomes,
    totalProjected,
    totalP10: pct(0.10),
    totalP50: pct(0.50),
    totalP90: pct(0.90),
    lineupStdDev,
  };
}

// ─── Matchup simulation ───────────────────────────────────────────────────────

/**
 * Core Phase 2 function. Simulates 10,000 matchups between two lineups
 * and returns win probability + full outcome distributions.
 *
 * This is the function called by the simulationRouter for every
 * Start/Sit decision and weekly lineup check.
 */
export function simulateMatchup(
  myPlayers: SimPlayer[],
  opponentPlayers: SimPlayer[],
  simCount: number = 10000
): MatchupSimResult {
  const myOutcomes = myPlayers.map(p => simulatePlayer(p, simCount));
  const oppOutcomes = opponentPlayers.map(p => simulatePlayer(p, simCount));

  const myStdDevs = myOutcomes.map(o => o.stdDev);
  const myProjections = myOutcomes.map(o => o.adjustedProjection);
  const oppStdDevs = oppOutcomes.map(o => o.stdDev);
  const oppProjections = oppOutcomes.map(o => o.adjustedProjection);

  let myWins = 0;
  const myTotals: number[] = new Array(simCount);
  const oppTotals: number[] = new Array(simCount);

  for (let i = 0; i < simCount; i++) {
    let myTotal = 0;
    for (let j = 0; j < myProjections.length; j++) {
      myTotal += gaussianRandom(myProjections[j], myStdDevs[j]);
    }
    let oppTotal = 0;
    for (let j = 0; j < oppProjections.length; j++) {
      oppTotal += gaussianRandom(oppProjections[j], oppStdDevs[j]);
    }
    myTotals[i] = Math.max(0, myTotal);
    oppTotals[i] = Math.max(0, oppTotal);
    if (myTotal > oppTotal) myWins++;
  }

  myTotals.sort((a, b) => a - b);
  oppTotals.sort((a, b) => a - b);

  const myPct = (p: number) => Math.round(myTotals[Math.floor(simCount * p)] * 10) / 10;
  const oppPct = (p: number) => Math.round(oppTotals[Math.floor(simCount * p)] * 10) / 10;

  const winProbability = Math.round((myWins / simCount) * 100);
  const myMedian = myPct(0.50);
  const oppMedian = oppPct(0.50);
  const projectedSpread = Math.round((myMedian - oppMedian) * 10) / 10;

  // Lineup-level confidence: degraded if any player has injury concern
  const hasInjuryConcern = [...myPlayers, ...opponentPlayers].some(
    p => (p.volatilityMultiplier ?? 1.0) < 0.85
  );
  const spreadIsClose = Math.abs(projectedSpread) < 10;
  const confidenceLabel: MatchupSimResult["confidenceLabel"] =
    hasInjuryConcern ? "LOW" :
    spreadIsClose ? "MEDIUM" :
    "HIGH";

  // Plain-English summary for AI prompt injection
  const spreadDesc = projectedSpread > 0
    ? `favored by ${Math.abs(projectedSpread).toFixed(1)} pts`
    : projectedSpread < 0
    ? `underdog by ${Math.abs(projectedSpread).toFixed(1)} pts`
    : "even matchup";

  const summaryText = [
    `MATCHUP SIMULATION (${simCount.toLocaleString()} runs):`,
    `  Win probability: ${winProbability}% (${spreadDesc})`,
    `  My lineup — Floor: ${myPct(0.10)} | Median: ${myMedian} | Ceiling: ${myPct(0.90)}`,
    `  Opponent    — Floor: ${oppPct(0.10)} | Median: ${oppMedian} | Ceiling: ${oppPct(0.90)}`,
    `  Confidence: ${confidenceLabel}${hasInjuryConcern ? " (injury uncertainty present)" : ""}`,
  ].join("\n");

  const myLineup: LineupOutcome = {
    players: myOutcomes,
    totalProjected: Math.round(myProjections.reduce((s, v) => s + v, 0) * 10) / 10,
    totalP10: myPct(0.10),
    totalP50: myMedian,
    totalP90: myPct(0.90),
    lineupStdDev: Math.round(Math.sqrt(myStdDevs.reduce((s, v) => s + v * v, 0)) * 10) / 10,
  };

  const opponentLineup: LineupOutcome = {
    players: oppOutcomes,
    totalProjected: Math.round(oppProjections.reduce((s, v) => s + v, 0) * 10) / 10,
    totalP10: oppPct(0.10),
    totalP50: oppMedian,
    totalP90: oppPct(0.90),
    lineupStdDev: Math.round(Math.sqrt(oppStdDevs.reduce((s, v) => s + v * v, 0)) * 10) / 10,
  };

  return {
    myLineup,
    opponentLineup,
    winProbability,
    projectedSpread,
    confidenceLabel,
    simCount,
    summaryText,
  };
}

// ─── Start/Sit win-probability delta ─────────────────────────────────────────

export interface StartSitSimResult {
  playerA: PlayerOutcome;
  playerB: PlayerOutcome;
  /** Win probability starting A (opponent lineup held constant) */
  winProbWithA: number;
  /** Win probability starting B (opponent lineup held constant) */
  winProbWithB: number;
  /** Positive = A is better, negative = B is better */
  winProbDelta: number;
  recommendation: "START_A" | "START_B" | "COIN_FLIP";
  confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
  summaryText: string;
}

/**
 * Compares two lineup variants (A starts playerA, B starts playerB)
 * against the same opponent lineup and returns the win-probability delta.
 *
 * Usage: Start/Sit Advisor — shows "Starting X improves your win odds by 7%"
 */
export function simulateStartSit(
  baseLineupWithoutFlex: SimPlayer[],  // rest of your lineup (excluding the flex spot)
  playerA: SimPlayer,
  playerB: SimPlayer,
  opponentPlayers: SimPlayer[],
  simCount: number = 10000
): StartSitSimResult {
  const outcomeA = simulatePlayer(playerA, simCount);
  const outcomeB = simulatePlayer(playerB, simCount);

  const lineupA = [...baseLineupWithoutFlex, playerA];
  const lineupB = [...baseLineupWithoutFlex, playerB];

  const resultA = simulateMatchup(lineupA, opponentPlayers, simCount);
  const resultB = simulateMatchup(lineupB, opponentPlayers, simCount);

  const winProbWithA = resultA.winProbability;
  const winProbWithB = resultB.winProbability;
  const winProbDelta = winProbWithA - winProbWithB;

  const recommendation: StartSitSimResult["recommendation"] =
    Math.abs(winProbDelta) < 3 ? "COIN_FLIP" :
    winProbDelta > 0 ? "START_A" : "START_B";

  const better = winProbDelta > 0 ? playerA.playerName : playerB.playerName;
  const delta = Math.abs(winProbDelta);

  const confidenceLabel: StartSitSimResult["confidenceLabel"] =
    resultA.confidenceLabel === "LOW" || resultB.confidenceLabel === "LOW" ? "LOW" :
    delta < 5 ? "MEDIUM" : "HIGH";

  const summaryText = recommendation === "COIN_FLIP"
    ? `SIMULATION: Too close to call — win probability within 3% either way (A: ${winProbWithA}% vs B: ${winProbWithB}%). Consider injury risk and matchup.`
    : `SIMULATION: Start ${better} — improves win probability by ${delta}% (${winProbWithA}% with ${playerA.playerName} vs ${winProbWithB}% with ${playerB.playerName}). Confidence: ${confidenceLabel}.`;

  return {
    playerA: outcomeA,
    playerB: outcomeB,
    winProbWithA,
    winProbWithB,
    winProbDelta,
    recommendation,
    confidenceLabel,
    summaryText,
  };
}
