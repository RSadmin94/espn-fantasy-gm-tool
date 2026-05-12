/**
 * draftStrategyEngine.ts
 *
 * 2026 draft strategy engine.
 *
 * Combines:
 *   - 2026 draft order (pick positions per team)
 *   - Keeper decisions (which players are locked, which rounds are used)
 *   - Historical draft tendencies from ManagerDNA
 *   - Ineligible players returning to the pool
 *
 * Produces per-team draft strategy briefs and a league-wide draft board overview.
 */

import type { ManagerDNA } from "./leagueDNA";
import type { TeamKeeperRecommendation } from "./keeperRecommendationEngine";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface DraftOrderEntry {
  teamId: number;
  teamName: string;
  ownerName?: string;
  pickNumber: number;   // 1-14, their first-round pick position
}

export interface ReturningPlayer {
  playerName: string;
  teamName: string;    // team that can no longer keep them
  position: string;
  round2025: number;   // the round they were kept in 2025 = their approximate ADP tier
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface TeamDraftStrategy {
  teamId: number;
  teamName: string;
  ownerName: string;
  pickNumber: number;
  gmArchetype: string;
  /** Rounds locked by keeper decisions */
  lockedRounds: number[];
  /** Free rounds (not used by keepers) */
  freeRounds: number[];
  /** Positional gaps after keeper decision */
  positionalGaps: string[];
  /** Predicted draft targets based on DNA + gaps */
  predictedTargets: Array<{
    round: number;
    position: string;
    reasoning: string;
    confidence: "high" | "medium" | "low";
  }>;
  /** How to exploit this team during the draft */
  exploitOpportunity: string;
  /** Plain-English strategy brief */
  strategyBrief: string;
  /** Threat level to your team */
  draftThreat: "critical" | "high" | "medium" | "low";
}

export interface LeagueDraftBoard {
  season: 2026;
  totalRounds: number;
  /** Positions returning to the pool from ineligible keepers */
  returningPool: Array<ReturningPlayer & { poolValue: "elite" | "high" | "medium" | "low" }>;
  /** Per-team strategies */
  teamStrategies: TeamDraftStrategy[];
  /** League-wide positional scarcity after all keepers are locked */
  positionalScarcity: Record<string, { keptCount: number; scarcityLevel: "scarce" | "normal" | "deep" }>;
  /** Top 5 draft-day intelligence tips */
  draftDayTips: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 15;
const ALL_ROUNDS = Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1);

const POSITION_ADP_ROUND: Record<string, number> = {
  QB: 6, RB: 3, WR: 3, TE: 5, K: 14, DEF: 13,
};

function getPositionScarcityThreshold(pos: string): { scarce: number; deep: number } {
  // In a 14-team league, how many kept players at a position = scarce vs deep?
  const thresholds: Record<string, { scarce: number; deep: number }> = {
    RB:  { scarce: 8, deep: 4 },
    WR:  { scarce: 8, deep: 4 },
    QB:  { scarce: 5, deep: 2 },
    TE:  { scarce: 5, deep: 2 },
    K:   { scarce: 3, deep: 1 },
    DEF: { scarce: 3, deep: 1 },
  };
  return thresholds[pos] ?? { scarce: 6, deep: 3 };
}

function getArchetypeTargets(
  gmArchetype: string,
  dna: ManagerDNA,
  freeRounds: number[],
  positionalGaps: string[],
): Array<{ round: number; position: string; reasoning: string; confidence: "high" | "medium" | "low" }> {
  const arch = gmArchetype.toLowerCase();
  const targets: Array<{ round: number; position: string; reasoning: string; confidence: "high" | "medium" | "low" }> = [];

  // Use DNA draft bias to predict early picks
  const biasVsLeague = dna.draft.biasVsLeague ?? {};
  const overvaluedPositions = Object.entries(biasVsLeague)
    .filter(([, bias]) => bias >= 1.5)
    .map(([pos]) => pos);

  // Round 1 prediction
  const round1 = freeRounds[0];
  if (round1 !== undefined) {
    if (positionalGaps.includes("RB") || overvaluedPositions.includes("RB")) {
      targets.push({
        round: round1,
        position: "RB",
        reasoning: `${dna.ownerName} historically overvalues RBs (avg round ${dna.draft.avgRoundByPosition?.["RB"] ?? "?"} vs league avg) — expect an RB1 here.`,
        confidence: "high",
      });
    } else if (positionalGaps.includes("WR") || overvaluedPositions.includes("WR")) {
      targets.push({
        round: round1,
        position: "WR",
        reasoning: `WR gap after keeper decision — likely to target a WR1 with their first free pick.`,
        confidence: "high",
      });
    } else {
      targets.push({
        round: round1,
        position: "RB/WR",
        reasoning: `No clear gap — will take best available at RB or WR.`,
        confidence: "medium",
      });
    }
  }

  // Round 2 prediction
  const round2 = freeRounds[1];
  if (round2 !== undefined) {
    if (arch.includes("win-now") || arch.includes("trader")) {
      targets.push({
        round: round2,
        position: "RB",
        reasoning: `Win-now archetype — will stack RBs early to compete immediately.`,
        confidence: "high",
      });
    } else if (arch.includes("waiver") || arch.includes("hawk")) {
      targets.push({
        round: round2,
        position: "WR",
        reasoning: `Waiver hawk — tends to draft WRs early and stream RBs via waiver wire.`,
        confidence: "medium",
      });
    } else if (positionalGaps.includes("TE") && !positionalGaps.includes("RB")) {
      targets.push({
        round: round2,
        position: "TE",
        reasoning: `TE gap — may reach for a TE1 here if they missed in round 1.`,
        confidence: "medium",
      });
    }
  }

  // QB prediction based on historical avg round
  const qbAvgRound = dna.draft.avgRoundByPosition?.["QB"] ?? 7;
  const qbFreeRound = freeRounds.find(r => r >= Math.max(4, qbAvgRound - 1));
  if (qbFreeRound && !targets.find(t => t.position === "QB")) {
    targets.push({
      round: qbFreeRound,
      position: "QB",
      reasoning: `Historically drafts QB in round ${qbAvgRound} — expect a QB target around this spot.`,
      confidence: "medium",
    });
  }

  return targets.slice(0, 4); // top 4 predictions
}

function buildExploitOpportunity(
  dna: ManagerDNA,
  lockedRounds: number[],
  positionalGaps: string[],
  pickNumber: number,
): string {
  const arch = dna.gmArchetype.toLowerCase();

  if (lockedRounds.length === 0) {
    return `No keeper — they have full draft flexibility. Harder to predict, but their ${dna.gmArchetype} tendencies still apply.`;
  }

  const highestLockedRound = Math.max(...lockedRounds);
  const gaps = positionalGaps.join(", ");

  if (highestLockedRound <= 3 && positionalGaps.length > 0) {
    return `They burned a round ${highestLockedRound} pick on their keeper, leaving a ${gaps} gap. If you need ${gaps}, you can likely get them at their natural ADP — they can't compete for that position early.`;
  }

  if (arch.includes("panic") || arch.includes("tilt")) {
    return `High tilt score (${dna.tilt?.tiltScore ?? "?"}%) — if they fall behind in the first 4 weeks, expect them to reach for a "win-now" player mid-draft. Target their waiver wire discards.`;
  }

  if (dna.exploitabilityScore >= 70) {
    return `Highly exploitable (score: ${dna.exploitabilityScore}) — ${dna.exploitWindows?.[0] ?? "predictable draft patterns make them easy to read"}. Watch their pick at #${pickNumber} closely.`;
  }

  return `Standard keeper setup. Their ${dna.gmArchetype} style means they'll likely target ${positionalGaps[0] ?? "best available"} in their first free round.`;
}

function calcDraftThreat(
  dna: ManagerDNA,
  pickNumber: number,
  lockedRounds: number[],
): TeamDraftStrategy["draftThreat"] {
  // Threat = combination of pick position, DNA strength, and keeper efficiency
  const pickScore = pickNumber <= 3 ? 40 : pickNumber <= 6 ? 30 : pickNumber <= 10 ? 20 : 10;
  const keeperScore = lockedRounds.length > 0 && Math.min(...lockedRounds) <= 3 ? 30 : 15;
  const dnaScore = dna.exploitabilityScore <= 30 ? 30 : dna.exploitabilityScore <= 50 ? 20 : 10;
  const total = pickScore + keeperScore + dnaScore;

  if (total >= 85) return "critical";
  if (total >= 65) return "high";
  if (total >= 45) return "medium";
  return "low";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildLeagueDraftBoard(
  draftOrder: DraftOrderEntry[],
  keeperRecommendations: TeamKeeperRecommendation[],
  dnaProfiles: ManagerDNA[],
  returningPlayers: ReturningPlayer[],
): LeagueDraftBoard {
  const dnaMap = new Map(dnaProfiles.map(d => [d.ownerName.toLowerCase(), d]));
  const keeperMap = new Map(keeperRecommendations.map(k => [k.teamId, k]));

  // Build per-team strategies
  const teamStrategies: TeamDraftStrategy[] = draftOrder.map(entry => {
    const keeper = keeperMap.get(entry.teamId);
    const dna = Array.from(dnaMap.values()).find(d =>
      d.ownerName && entry.teamName.toLowerCase().includes(d.ownerName.toLowerCase().split(" ")[0].toLowerCase())
    ) ?? null;

    // Determine locked rounds from the primary keeper recommendation
    const lockedRounds: number[] = [];
    if (keeper?.primaryRecommendation) {
      lockedRounds.push(keeper.primaryRecommendation.roundCost2026);
    }

    // Free rounds = all rounds minus locked rounds
    const freeRounds = ALL_ROUNDS.filter(r => !lockedRounds.includes(r));

    // Positional gaps: positions NOT covered by keeper
    const keptPositions = keeper?.primaryRecommendation
      ? [keeper.primaryRecommendation.position.toUpperCase()]
      : [];
    const positionalGaps: string[] = [];
    if (!keptPositions.includes("RB")) positionalGaps.push("RB");
    if (!keptPositions.includes("WR")) positionalGaps.push("WR");
    if (!keptPositions.includes("QB")) positionalGaps.push("QB");
    if (!keptPositions.includes("TE")) positionalGaps.push("TE");

    const gmArchetype = dna?.gmArchetype ?? keeper?.dnaPrediction?.gmArchetype ?? "Unknown";
    const ownerName = entry.ownerName ?? keeper?.ownerName ?? entry.teamName;

    const predictedTargets = dna
      ? getArchetypeTargets(gmArchetype, dna, freeRounds, positionalGaps)
      : [];

    const exploitOpportunity = dna
      ? buildExploitOpportunity(dna, lockedRounds, positionalGaps, entry.pickNumber)
      : `Pick #${entry.pickNumber} — watch their early selections for patterns.`;

    const draftThreat = dna
      ? calcDraftThreat(dna, entry.pickNumber, lockedRounds)
      : entry.pickNumber <= 4 ? "high" : "medium";

    // Strategy brief
    let strategyBrief = `${ownerName} picks at #${entry.pickNumber}`;
    if (lockedRounds.length > 0 && keeper?.primaryRecommendation) {
      strategyBrief += `, keeping ${keeper.primaryRecommendation.playerName} (${keeper.primaryRecommendation.position}) at round ${lockedRounds[0]}`;
    } else {
      strategyBrief += `, no keeper committed`;
    }
    strategyBrief += `. Their ${gmArchetype} style suggests they'll target ${positionalGaps[0] ?? "best available"} early.`;
    if (dna?.exploitWindows?.[0]) {
      strategyBrief += ` Key exploit: ${dna.exploitWindows[0]}`;
    }

    return {
      teamId: entry.teamId,
      teamName: entry.teamName,
      ownerName,
      pickNumber: entry.pickNumber,
      gmArchetype,
      lockedRounds,
      freeRounds,
      positionalGaps,
      predictedTargets,
      exploitOpportunity,
      strategyBrief,
      draftThreat,
    };
  }).sort((a, b) => a.pickNumber - b.pickNumber);

  // Positional scarcity: count how many players at each position are being kept
  const keptByPosition: Record<string, number> = { RB: 0, WR: 0, QB: 0, TE: 0, K: 0, DEF: 0 };
  for (const k of keeperRecommendations) {
    if (k.primaryRecommendation) {
      const pos = k.primaryRecommendation.position.toUpperCase();
      keptByPosition[pos] = (keptByPosition[pos] ?? 0) + 1;
    }
  }

  const positionalScarcity: LeagueDraftBoard["positionalScarcity"] = {};
  for (const [pos, count] of Object.entries(keptByPosition)) {
    const thresh = getPositionScarcityThreshold(pos);
    positionalScarcity[pos] = {
      keptCount: count,
      scarcityLevel: count >= thresh.scarce ? "scarce" : count >= thresh.deep ? "normal" : "deep",
    };
  }

  // Returning pool with value tiers
  const returningPool = returningPlayers.map(p => {
    const round = p.round2025;
    const poolValue: "elite" | "high" | "medium" | "low" =
      round <= 2 ? "elite" :
      round <= 4 ? "high" :
      round <= 7 ? "medium" : "low";
    return { ...p, poolValue };
  }).sort((a, b) => a.round2025 - b.round2025);

  // Draft day tips
  const draftDayTips: string[] = [];

  const scarcePosns = Object.entries(positionalScarcity)
    .filter(([, v]) => v.scarcityLevel === "scarce")
    .map(([pos]) => pos);
  if (scarcePosns.length > 0) {
    draftDayTips.push(`${scarcePosns.join(" and ")} are scarce this year — ${keptByPosition[scarcePosns[0]] ?? 0} players kept. Target them earlier than usual.`);
  }

  const deepPosns = Object.entries(positionalScarcity)
    .filter(([, v]) => v.scarcityLevel === "deep")
    .map(([pos]) => pos);
  if (deepPosns.length > 0) {
    draftDayTips.push(`${deepPosns.join(" and ")} are deep this year — you can wait a round or two longer than normal.`);
  }

  if (returningPool.filter(p => p.poolValue === "elite" || p.poolValue === "high").length > 0) {
    const elitePlayers = returningPool.filter(p => p.poolValue === "elite").map(p => p.playerName);
    if (elitePlayers.length > 0) {
      draftDayTips.push(`Elite players returning to the pool: ${elitePlayers.join(", ")}. These were round 1-2 keepers last year — expect them to go early again.`);
    }
  }

  const criticalTeams = teamStrategies.filter(t => t.draftThreat === "critical").map(t => t.teamName);
  if (criticalTeams.length > 0) {
    draftDayTips.push(`Watch ${criticalTeams.join(", ")} — they have elite pick positions AND strong keepers. They will set the tone in rounds 1-3.`);
  }

  const highlyExploitable = teamStrategies
    .filter(t => {
      const dna = Array.from(dnaMap.values()).find(d =>
        t.teamName.toLowerCase().includes(d.ownerName.toLowerCase().split(" ")[0].toLowerCase())
      );
      return dna && dna.exploitabilityScore >= 70;
    })
    .map(t => t.teamName);
  if (highlyExploitable.length > 0) {
    draftDayTips.push(`Highly exploitable managers this draft: ${highlyExploitable.join(", ")}. Their predictable tendencies create value opportunities — watch their picks closely.`);
  }

  if (draftDayTips.length < 3) {
    draftDayTips.push("Use the DNA profiles to anticipate who will reach for their preferred positions — let them overpay and grab value one round later.");
  }

  return {
    season: 2026,
    totalRounds: TOTAL_ROUNDS,
    returningPool,
    teamStrategies,
    positionalScarcity,
    draftDayTips,
  };
}
