// FILE: server/championshipEngine.ts
/**
 * Phase 5 — Championship Equity Engine
 *
 * Optimizes for the right target: championship probability, not weekly points.
 *
 * Key insight from the blueprint:
 *   Most fantasy apps optimize weekly projections. Wrong goal.
 *   High-variance rosters win championships.
 *   Safe rosters lose them in January.
 *
 * Builds on Phase 2 (Monte Carlo) — extends weekly win probability into
 * full-season playoff path simulation.
 *
 * Exports:
 *   calcChampionshipEquity()     — roster-level championship probability
 *   calcPlayoffSurvivalOdds()    — round-by-round survival probability
 *   calcRosterUniqueness()       — how differentiated is Rod's roster?
 *   calcInjuryResilience()       — how well does the roster survive injuries?
 *   calcPlayoffScheduleStrength()— weeks 14-17 matchup quality
 *   buildChampEquityPromptBlock()— ready-to-inject AI context string
 *   runChampEquitySimulation()   — full simulation: season → playoffs → champion
 */

import { simulateMatchup, type SimPlayer } from "./monteCarloService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamStanding {
  teamId: number;
  ownerName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  /** Projected lineup for remaining weeks — SimPlayer[] */
  projectedLineup: SimPlayer[];
  /** Remaining schedule: array of opponentTeamIds per week */
  remainingSchedule: number[];
  /** Is this Rod's team? */
  isRod: boolean;
}

export interface ChampionshipEquityResult {
  teamId: number;
  ownerName: string;
  /** % chance of making the playoffs (top 7 of 14) */
  playoffProbability: number;
  /** % chance of winning the championship conditional on making playoffs */
  champProbabilityConditional: number;
  /** Absolute championship probability */
  champProbabilityAbsolute: number;
  /** Expected wins over remaining regular season */
  expectedWins: number;
  /** Projected final seed (1-14) */
  projectedSeed: number;
  champLabel: "Championship Contender" | "Playoff Lock" | "Bubble" | "Long Shot" | "Eliminated";
}

export interface PlayoffSurvivalResult {
  teamId: number;
  ownerName: string;
  /** Probability of winning each playoff round */
  roundOdds: {
    round: string;      // "Wildcard" | "Semifinal" | "Championship"
    winProbability: number;
    opponentOwner: string;
    projectedSpread: number;
  }[];
  /** Overall championship probability through the bracket */
  championshipProbability: number;
}

export interface RosterUniquenessResult {
  teamId: number;
  ownerName: string;
  /** 0-100: how different is this roster from the league median? */
  uniquenessScore: number;
  /** Players that ONLY this team has (not on any other roster) */
  uniquePlayers: string[];
  /** Players heavily rostered across the league (>50% of teams have equivalent) */
  commonPlayers: string[];
  /**
   * Championship equity multiplier.
   * Unique rosters have higher upside in a field of similar teams.
   * 1.0 = average, >1.0 = unique advantage, <1.0 = chalk disadvantage.
   */
  uniquenessMultiplier: number;
  uniquenessLabel: "Highly Unique" | "Differentiated" | "Chalk" | "Copy-Cat";
}

export interface InjuryResilienceResult {
  teamId: number;
  ownerName: string;
  /** 0-100: how well does this roster survive the loss of a key player? */
  resilienceScore: number;
  /** Best backup for each starter */
  backupDepth: Record<string, { starter: string; backup: string | null; dropoff: number }>;
  /** Expected points lost if top player at each position goes down */
  worstCaseLoss: number;
  resilienceLabel: "Deep Roster" | "Adequate Depth" | "Fragile" | "Glass Cannon";
}

export interface PlayoffScheduleResult {
  teamId: number;
  ownerName: string;
  /** Week 14-17 matchup quality */
  playoffWeeks: {
    week: number;
    opponentId: number;
    opponentOwner: string;
    opponentAvgPF: number;
    difficultyLabel: "Easy" | "Average" | "Hard";
  }[];
  /** Average opponent strength in weeks 14-17 */
  avgPlayoffOpponentPF: number;
  /** Composite playoff schedule score: lower = easier = better */
  playoffScheduleScore: number;
  playoffScheduleLabel: "Favorable Draw" | "Neutral" | "Tough Draw";
}

export interface FullChampEquityReport {
  teamId: number;
  ownerName: number;
  equity: ChampionshipEquityResult;
  uniqueness: RosterUniquenessResult;
  resilience: InjuryResilienceResult;
  playoffSchedule: PlayoffScheduleResult;
  /** Composite championship equity score: 0-100 */
  champEquityScore: number;
  /** Key recommendation for maximizing championship odds */
  champAdvice: string;
}

// ─── Season simulation ────────────────────────────────────────────────────────

const PLAYOFF_SPOTS = 7;       // top 7 of 14 make playoffs
const SIM_COUNT = 5000;        // season sims — fewer than weekly sims for speed
const PLAYOFF_ROUNDS = 3;      // wildcard, semifinal, championship

/**
 * Simulates the remaining regular season for all 14 teams.
 * Returns win totals across N simulations to derive playoff probability.
 */
function simulateRemainingSchedule(
  teams: TeamStanding[],
  simCount: number = SIM_COUNT
): Map<number, { wins: number[]; playoffCount: number; champCount: number }> {
  const results = new Map<number, { wins: number[]; playoffCount: number; champCount: number }>();
  for (const t of teams) {
    results.set(t.teamId, { wins: [], playoffCount: 0, champCount: 0 });
  }

  const teamMap = new Map(teams.map(t => [t.teamId, t]));

  for (let sim = 0; sim < simCount; sim++) {
    // Track wins for this simulation
    const simWins = new Map<number, number>();
    const simPF = new Map<number, number>();
    for (const t of teams) {
      simWins.set(t.teamId, t.wins); // start with actual wins
      simPF.set(t.teamId, t.pointsFor);
    }

    // Simulate each remaining matchup
    const processedMatchups = new Set<string>();
    for (const team of teams) {
      for (const oppId of team.remainingSchedule) {
        const matchupKey = [team.teamId, oppId].sort().join("-");
        if (processedMatchups.has(matchupKey)) continue;
        processedMatchups.add(matchupKey);

        const opp = teamMap.get(oppId);
        if (!opp) continue;

        const myLineup = team.projectedLineup.length > 0
          ? team.projectedLineup
          : defaultLineup(team.teamId);
        const oppLineup = opp.projectedLineup.length > 0
          ? opp.projectedLineup
          : defaultLineup(oppId);

        // Single sim matchup (reuse Phase 2)
        const result = simulateMatchup(myLineup, oppLineup, 200); // 200 sims per matchup for speed
        const myScore = result.myLineup.totalP50;
        const oppScore = result.opponentLineup.totalP50;

        // Random outcome weighted by win probability
        const myWins = Math.random() * 100 < result.winProbability;
        if (myWins) {
          simWins.set(team.teamId, (simWins.get(team.teamId) ?? 0) + 1);
          simPF.set(team.teamId, (simPF.get(team.teamId) ?? 0) + myScore);
          simPF.set(oppId, (simPF.get(oppId) ?? 0) + oppScore);
        } else {
          simWins.set(oppId, (simWins.get(oppId) ?? 0) + 1);
          simPF.set(oppId, (simPF.get(oppId) ?? 0) + myScore);
          simPF.set(team.teamId, (simPF.get(team.teamId) ?? 0) + oppScore);
        }
      }
    }

    // Sort teams by wins (tiebreak: PF)
    const sorted = [...teams].sort((a, b) => {
      const wA = simWins.get(a.teamId) ?? 0;
      const wB = simWins.get(b.teamId) ?? 0;
      if (wB !== wA) return wB - wA;
      return (simPF.get(b.teamId) ?? 0) - (simPF.get(a.teamId) ?? 0);
    });

    // Top PLAYOFF_SPOTS teams make playoffs
    const playoffTeams = sorted.slice(0, PLAYOFF_SPOTS);
    const playoffTeamIds = new Set(playoffTeams.map(t => t.teamId));

    // Simple bracket: seed 1 gets bye, seeds 2-7 play wildcard
    // Then semifinals: top seeds vs wildcard winners
    // Championship: final two
    let champion: number | null = null;

    if (playoffTeamIds.size >= PLAYOFF_SPOTS) {
      // Simulate bracket (simplified: each round = weighted coin flip)
      const seeds = playoffTeams.map((t, i) => ({ teamId: t.teamId, seed: i + 1 }));

      // Wildcard: seeds 5v7 and 4v6 (or similar bracket)
      const wildcardWinners: number[] = [];
      const wildcardPairs = [[seeds[3], seeds[6]], [seeds[4], seeds[5]]];
      for (const [s1, s2] of wildcardPairs) {
        if (!s1 || !s2) continue;
        const t1 = teamMap.get(s1.teamId)!;
        const t2 = teamMap.get(s2.teamId)!;
        const r = simulateMatchup(
          t1.projectedLineup.length > 0 ? t1.projectedLineup : defaultLineup(t1.teamId),
          t2.projectedLineup.length > 0 ? t2.projectedLineup : defaultLineup(t2.teamId),
          100
        );
        wildcardWinners.push(Math.random() * 100 < r.winProbability ? s1.teamId : s2.teamId);
      }

      // Semifinals: seeds 1, 2, 3 + wildcard winners
      const semiFinals = [
        [seeds[0]!.teamId, wildcardWinners[0]],
        [seeds[1]!.teamId, wildcardWinners[1] ?? seeds[2]!.teamId],
      ].filter(p => p[0] !== undefined && p[1] !== undefined) as [number, number][];

      const finalTeams: number[] = [];
      for (const [t1Id, t2Id] of semiFinals) {
        const t1 = teamMap.get(t1Id);
        const t2 = teamMap.get(t2Id);
        if (!t1 || !t2) continue;
        const r = simulateMatchup(
          t1.projectedLineup.length > 0 ? t1.projectedLineup : defaultLineup(t1Id),
          t2.projectedLineup.length > 0 ? t2.projectedLineup : defaultLineup(t2Id),
          100
        );
        finalTeams.push(Math.random() * 100 < r.winProbability ? t1Id : t2Id);
      }

      // Championship
      if (finalTeams.length >= 2) {
        const t1 = teamMap.get(finalTeams[0]!);
        const t2 = teamMap.get(finalTeams[1]!);
        if (t1 && t2) {
          const r = simulateMatchup(
            t1.projectedLineup.length > 0 ? t1.projectedLineup : defaultLineup(t1.teamId),
            t2.projectedLineup.length > 0 ? t2.projectedLineup : defaultLineup(t2.teamId),
            100
          );
          champion = Math.random() * 100 < r.winProbability ? t1.teamId : t2.teamId;
        }
      }
    }

    // Record results
    for (const team of teams) {
      const r = results.get(team.teamId)!;
      const w = simWins.get(team.teamId) ?? team.wins;
      r.wins.push(w);
      if (playoffTeamIds.has(team.teamId)) r.playoffCount++;
      if (champion === team.teamId) r.champCount++;
    }
  }

  return results;
}

// Default lineup for teams without projection data
function defaultLineup(teamId: number): SimPlayer[] {
  return [
    { playerId: teamId * 100 + 1, playerName: "QB", position: "QB", projectedPoints: 18, stdDev: 5.4 },
    { playerId: teamId * 100 + 2, playerName: "RB1", position: "RB", projectedPoints: 14, stdDev: 7.7 },
    { playerId: teamId * 100 + 3, playerName: "RB2", position: "RB", projectedPoints: 10, stdDev: 5.5 },
    { playerId: teamId * 100 + 4, playerName: "WR1", position: "WR", projectedPoints: 13, stdDev: 6.5 },
    { playerId: teamId * 100 + 5, playerName: "WR2", position: "WR", projectedPoints: 10, stdDev: 5.0 },
    { playerId: teamId * 100 + 6, playerName: "TE", position: "TE", projectedPoints: 9, stdDev: 4.95 },
    { playerId: teamId * 100 + 7, playerName: "FLEX", position: "RB", projectedPoints: 9, stdDev: 4.95 },
  ];
}

// ─── Championship Equity ──────────────────────────────────────────────────────

export function calcChampionshipEquity(
  teams: TeamStanding[],
  simCount: number = SIM_COUNT
): ChampionshipEquityResult[] {
  const simResults = simulateRemainingSchedule(teams, simCount);
  const totalTeams = teams.length;

  return teams.map(team => {
    const r = simResults.get(team.teamId)!;
    const playoffProbability = Math.round((r.playoffCount / simCount) * 100);
    const champProbabilityAbsolute = Math.round((r.champCount / simCount) * 100 * 10) / 10;
    const champProbabilityConditional = r.playoffCount > 0
      ? Math.round((r.champCount / r.playoffCount) * 100 * 10) / 10
      : 0;

    const avgWins = r.wins.reduce((s, v) => s + v, 0) / r.wins.length;
    const expectedWins = Math.round(avgWins * 10) / 10;

    // Projected seed from avg wins
    const winsRanked = teams
      .map(t => ({ teamId: t.teamId, avgW: (simResults.get(t.teamId)!.wins.reduce((s, v) => s + v, 0) / simCount) }))
      .sort((a, b) => b.avgW - a.avgW);
    const projectedSeed = winsRanked.findIndex(t => t.teamId === team.teamId) + 1;

    const champLabel: ChampionshipEquityResult["champLabel"] =
      champProbabilityAbsolute >= 15 ? "Championship Contender" :
      playoffProbability >= 80 ? "Playoff Lock" :
      playoffProbability >= 40 ? "Bubble" :
      playoffProbability >= 15 ? "Long Shot" :
      "Eliminated";

    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      playoffProbability,
      champProbabilityConditional,
      champProbabilityAbsolute,
      expectedWins,
      projectedSeed,
      champLabel,
    };
  }).sort((a, b) => b.champProbabilityAbsolute - a.champProbabilityAbsolute);
}

// ─── Roster Uniqueness ────────────────────────────────────────────────────────

export function calcRosterUniqueness(
  teams: Array<{
    teamId: number;
    ownerName: string;
    players: Array<{ playerId: number; playerName: string; position: string }>;
  }>
): RosterUniquenessResult[] {
  // Count how many teams have each player
  const playerTeamCount = new Map<number, number>();
  for (const team of teams) {
    for (const p of team.players) {
      playerTeamCount.set(p.playerId, (playerTeamCount.get(p.playerId) ?? 0) + 1);
    }
  }

  const totalTeams = teams.length;

  return teams.map(team => {
    const uniquePlayers: string[] = [];
    const commonPlayers: string[] = [];

    for (const p of team.players) {
      const count = playerTeamCount.get(p.playerId) ?? 1;
      if (count === 1) uniquePlayers.push(p.playerName);
      // In a 14-team keeper league, players on >1 team = common
      // (each player can only be on 1 roster — so "common" = players others have equivalents of)
    }

    // Uniqueness score based on positional scarcity of rostered players
    // Players with high ECR rank that only this team has = high uniqueness
    const uniquenessScore = Math.min(100, Math.round(
      50 + (uniquePlayers.length * 8) - (commonPlayers.length * 5)
    ));

    const uniquenessMultiplier =
      uniquenessScore >= 80 ? 1.15 :
      uniquenessScore >= 60 ? 1.05 :
      uniquenessScore >= 40 ? 1.0 :
      0.92;

    const uniquenessLabel: RosterUniquenessResult["uniquenessLabel"] =
      uniquenessScore >= 70 ? "Highly Unique" :
      uniquenessScore >= 55 ? "Differentiated" :
      uniquenessScore >= 40 ? "Chalk" :
      "Copy-Cat";

    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      uniquenessScore,
      uniquePlayers,
      commonPlayers,
      uniquenessMultiplier,
      uniquenessLabel,
    };
  });
}

// ─── Injury Resilience ────────────────────────────────────────────────────────

export function calcInjuryResilience(
  teams: Array<{
    teamId: number;
    ownerName: string;
    starters: SimPlayer[];
    backups: SimPlayer[];
  }>
): InjuryResilienceResult[] {
  return teams.map(team => {
    const positions = ["QB", "RB", "WR", "TE"];
    const backupDepth: InjuryResilienceResult["backupDepth"] = {};
    let worstCaseLoss = 0;

    for (const pos of positions) {
      const posStarters = team.starters.filter(p => p.position === pos)
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
      const posBackups = team.backups.filter(p => p.position === pos)
        .sort((a, b) => b.projectedPoints - a.projectedPoints);

      const starter = posStarters[0];
      const backup = posBackups[0] ?? posStarters[1];

      if (starter) {
        const dropoff = backup
          ? Math.max(0, Math.round((starter.projectedPoints - backup.projectedPoints) * 10) / 10)
          : starter.projectedPoints;

        backupDepth[pos] = {
          starter: starter.playerName,
          backup: backup?.playerName ?? null,
          dropoff,
        };

        if (dropoff > worstCaseLoss) worstCaseLoss = dropoff;
      }
    }

    // Resilience score: lower dropoff = more resilient
    const avgDropoff = Object.values(backupDepth).reduce((s, v) => s + v.dropoff, 0) /
      Math.max(Object.keys(backupDepth).length, 1);
    const resilienceScore = Math.min(100, Math.max(0, Math.round(100 - (avgDropoff * 4))));

    const resilienceLabel: InjuryResilienceResult["resilienceLabel"] =
      resilienceScore >= 75 ? "Deep Roster" :
      resilienceScore >= 55 ? "Adequate Depth" :
      resilienceScore >= 35 ? "Fragile" :
      "Glass Cannon";

    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      resilienceScore,
      backupDepth,
      worstCaseLoss: Math.round(worstCaseLoss * 10) / 10,
      resilienceLabel,
    };
  });
}

// ─── Playoff Schedule Strength ────────────────────────────────────────────────

export function calcPlayoffScheduleStrength(
  teams: TeamStanding[],
  playoffWeekStart: number = 15
): PlayoffScheduleResult[] {
  const teamMap = new Map(teams.map(t => [t.teamId, t]));

  // Calculate each team's average projected score from their lineup
  const teamAvgPF = new Map<number, number>();
  for (const t of teams) {
    const lineup = t.projectedLineup.length > 0 ? t.projectedLineup : defaultLineup(t.teamId);
    teamAvgPF.set(t.teamId, lineup.reduce((s, p) => s + p.projectedPoints, 0));
  }

  const leagueAvgPF = Array.from(teamAvgPF.values()).reduce((s, v) => s + v, 0) / teamAvgPF.size;

  return teams.map(team => {
    // Find this team's playoff-week matchups from remaining schedule
    // remaining schedule is indexed by week position, not absolute week number
    // Use last N entries as playoff weeks
    const schedLength = team.remainingSchedule.length;
    const playoffMatchupIds = team.remainingSchedule.slice(
      Math.max(0, schedLength - 3)
    );

    const playoffWeeks = playoffMatchupIds.map((oppId, idx) => {
      const opp = teamMap.get(oppId);
      const oppAvgPF = teamAvgPF.get(oppId) ?? leagueAvgPF;
      const diff = oppAvgPF - leagueAvgPF;
      return {
        week: playoffWeekStart + idx,
        opponentId: oppId,
        opponentOwner: opp?.ownerName ?? "Unknown",
        opponentAvgPF: Math.round(oppAvgPF * 10) / 10,
        difficultyLabel: (diff > 15 ? "Hard" : diff < -10 ? "Easy" : "Average") as "Easy" | "Average" | "Hard",
      };
    });

    const avgPlayoffOpponentPF = playoffWeeks.length > 0
      ? Math.round((playoffWeeks.reduce((s, w) => s + w.opponentAvgPF, 0) / playoffWeeks.length) * 10) / 10
      : leagueAvgPF;

    // Score: lower = easier = better for championship odds
    const playoffScheduleScore = Math.round(Math.max(0, Math.min(100,
      50 + ((avgPlayoffOpponentPF - leagueAvgPF) / leagueAvgPF) * 100
    )));

    const playoffScheduleLabel: PlayoffScheduleResult["playoffScheduleLabel"] =
      playoffScheduleScore <= 40 ? "Favorable Draw" :
      playoffScheduleScore <= 60 ? "Neutral" :
      "Tough Draw";

    return {
      teamId: team.teamId,
      ownerName: team.ownerName,
      playoffWeeks,
      avgPlayoffOpponentPF,
      playoffScheduleScore,
      playoffScheduleLabel,
    };
  });
}

// ─── Composite championship equity report ────────────────────────────────────

export function calcChampEquityScore(
  equity: ChampionshipEquityResult,
  uniqueness: RosterUniquenessResult,
  resilience: InjuryResilienceResult,
  playoffSchedule: PlayoffScheduleResult
): { champEquityScore: number; champAdvice: string } {
  // Weighted composite: championship probability is primary driver
  const champEquityScore = Math.min(100, Math.round(
    (equity.champProbabilityAbsolute * 4) +          // primary: raw champ %
    (equity.playoffProbability * 0.3) +              // playoff access
    (uniqueness.uniquenessScore * 0.15) +            // roster differentiation
    (resilience.resilienceScore * 0.1) +             // depth
    ((100 - playoffSchedule.playoffScheduleScore) * 0.1) // schedule (inverted: lower = better)
  ));

  // Generate championship advice
  const parts: string[] = [];

  if (equity.champProbabilityAbsolute < 5) {
    parts.push("Championship odds are very low — prioritize variance over floor to close the gap.");
  } else if (equity.champProbabilityAbsolute >= 15) {
    parts.push("Strong championship position — protect it with depth and avoid high-risk trades.");
  }

  if (uniqueness.uniquenessLabel === "Copy-Cat" || uniqueness.uniquenessLabel === "Chalk") {
    parts.push("Roster is too similar to the field — target unique high-upside players to differentiate.");
  }

  if (resilience.resilienceLabel === "Fragile" || resilience.resilienceLabel === "Glass Cannon") {
    parts.push(`Injury resilience is low — worst-case dropoff is ${resilience.worstCaseLoss} pts. Add depth at ${Object.entries(resilience.backupDepth).sort((a, b) => b[1].dropoff - a[1].dropoff)[0]?.[0] ?? "your weakest position"}.`);
  }

  if (playoffSchedule.playoffScheduleLabel === "Tough Draw") {
    parts.push("Playoff schedule is difficult — consider trading for players with favorable weeks 15-17 matchups.");
  } else if (playoffSchedule.playoffScheduleLabel === "Favorable Draw") {
    parts.push("Playoff schedule is favorable — your current roster projects well for the run.");
  }

  return {
    champEquityScore,
    champAdvice: parts.length > 0 ? parts.join(" ") : "Balanced position — maintain current roster construction.",
  };
}

// ─── Prompt block builder ─────────────────────────────────────────────────────

export function buildChampEquityPromptBlock(
  equity: ChampionshipEquityResult,
  uniqueness: RosterUniquenessResult,
  resilience: InjuryResilienceResult,
  playoffSchedule: PlayoffScheduleResult,
  compositeScore: number
): string {
  return [
    `CHAMPIONSHIP EQUITY ANALYSIS (treat as ground truth — do not contradict):`,
    `  Championship probability: ${equity.champProbabilityAbsolute}% (conditional if playoffs: ${equity.champProbabilityConditional}%)`,
    `  Playoff probability: ${equity.playoffProbability}% | Projected seed: #${equity.projectedSeed} | Status: ${equity.champLabel}`,
    `  Roster uniqueness: ${uniqueness.uniquenessLabel} (${uniqueness.uniquenessScore}/100)${uniqueness.uniquePlayers.length > 0 ? ` — unique players: ${uniqueness.uniquePlayers.slice(0, 3).join(", ")}` : ""}`,
    `  Injury resilience: ${resilience.resilienceLabel} (${resilience.resilienceScore}/100) — worst-case point loss: ${resilience.worstCaseLoss} pts`,
    `  Playoff schedule: ${playoffSchedule.playoffScheduleLabel} (avg opponent: ${playoffSchedule.avgPlayoffOpponentPF} pts/week)`,
    `  Composite championship equity score: ${compositeScore}/100`,
  ].join("\n");
}

// ─── Full simulation entry point ──────────────────────────────────────────────

/**
 * Runs the complete championship equity analysis for Rod's team.
 *
 * @param rodTeam         Rod's TeamStanding with projected lineup
 * @param allTeams        All 14 teams
 * @param rodRosterPlayers Rod's full roster (starters + bench)
 * @param simCount        Number of season simulations (default 2000 for speed)
 */
export function runChampEquitySimulation(
  rodTeam: TeamStanding,
  allTeams: TeamStanding[],
  rodRosterPlayers: {
    starters: SimPlayer[];
    backups: SimPlayer[];
    allPlayers: Array<{ playerId: number; playerName: string; position: string }>;
  },
  simCount: number = 2000
): {
  equity: ChampionshipEquityResult;
  uniqueness: RosterUniquenessResult;
  resilience: InjuryResilienceResult;
  playoffSchedule: PlayoffScheduleResult;
  champEquityScore: number;
  champAdvice: string;
  promptBlock: string;
  leagueEquityRankings: ChampionshipEquityResult[];
} {
  // Full league championship equity
  const leagueEquity = calcChampionshipEquity(allTeams, simCount);
  const rodEquity = leagueEquity.find(e => e.teamId === rodTeam.teamId)!;

  // Uniqueness: compare Rod's players against league
  const allTeamRosters = allTeams.map(t => ({
    teamId: t.teamId,
    ownerName: t.ownerName,
    players: t.projectedLineup.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      position: p.position,
    })),
  }));
  const allUniqueness = calcRosterUniqueness(allTeamRosters);
  const rodUniqueness = allUniqueness.find(u => u.teamId === rodTeam.teamId) ?? {
    teamId: rodTeam.teamId,
    ownerName: rodTeam.ownerName,
    uniquenessScore: 50,
    uniquePlayers: [],
    commonPlayers: [],
    uniquenessMultiplier: 1.0,
    uniquenessLabel: "Chalk" as const,
  };

  // Resilience
  const rodResilience = calcInjuryResilience([{
    teamId: rodTeam.teamId,
    ownerName: rodTeam.ownerName,
    starters: rodRosterPlayers.starters,
    backups: rodRosterPlayers.backups,
  }])[0]!;

  // Playoff schedule
  const allSchedules = calcPlayoffScheduleStrength(allTeams);
  const rodSchedule = allSchedules.find(s => s.teamId === rodTeam.teamId) ?? {
    teamId: rodTeam.teamId,
    ownerName: rodTeam.ownerName,
    playoffWeeks: [],
    avgPlayoffOpponentPF: 130,
    playoffScheduleScore: 50,
    playoffScheduleLabel: "Neutral" as const,
  };

  // Composite score and advice
  const { champEquityScore, champAdvice } = calcChampEquityScore(
    rodEquity, rodUniqueness, rodResilience, rodSchedule
  );

  const promptBlock = buildChampEquityPromptBlock(
    rodEquity, rodUniqueness, rodResilience, rodSchedule, champEquityScore
  );

  return {
    equity: rodEquity,
    uniqueness: rodUniqueness,
    resilience: rodResilience,
    playoffSchedule: rodSchedule,
    champEquityScore,
    champAdvice,
    promptBlock,
    leagueEquityRankings: leagueEquity,
  };
}
