/**
 * draftHelperService.ts
 * ─────────────────────
 * AI Draft Helper — pure logic layer.
 *
 * Responsibilities:
 *   1. scorePositionalNeed()  — given Rod's current roster, score how urgently
 *      each position needs to be filled at this pick.
 *   2. buildOwnerTendencies() — given DNA profiles + historical picks, return
 *      per-owner likelihood of targeting each position in upcoming rounds.
 *   3. buildPickRecommendationPrompt() — assemble the full LLM context string
 *      for the pick recommendation call.
 *   4. parsePickRecommendation() — parse the LLM JSON response.
 *
 * No ESPN API calls. No DB writes. All inputs come from existing procedures.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RosterSlot {
  position: string;   // "QB" | "RB" | "WR" | "TE" | "K" | "D/ST"
  playerName: string;
  round: number;      // round they were drafted / kept
}

/** One entry in the live draft board — picks already made */
export interface DraftPick {
  overall: number;    // 1-based overall pick number
  round: number;
  pickInRound: number;
  teamId: number;
  ownerName: string;
  playerName: string;
  position: string;
}

/** Owner tendency profile built from DNA + historical data */
export interface OwnerTendency {
  ownerName: string;
  teamId: number;
  draftSlot: number;
  gmArchetype: string;
  reachPositions: string[];   // positions they over-draft vs league avg
  valuePositions: string[];   // positions they under-draft (value plays)
  round1Distribution: Record<string, number>;   // e.g. { RB: 0.6, WR: 0.3 }
  keeperRate: number;         // 0-1
  tiltScore: number;          // 0-100, how reactive they are
  exploitabilityScore: number;
  nextPickOverall: number | null;  // their next pick in the draft
  predictedPositions: string[];    // top-2 positions they'll likely take next
}

/** A single player available on the board */
export interface AvailablePlayer {
  playerName: string;
  position: string;
  ecrRank: number;
  adpRank: number;
  ecrAdpGap: number;   // positive = value (ECR better than ADP), negative = reach
  vbd: number;         // value-based drafting score from PFR
  survivalRisk: number; // 0-1, probability they're gone before Rod's next pick
  leagueHistoryCount: number; // how many times drafted in this league (2018-2025)
  avgLeagueRound: number;     // avg round taken in this league
  isLeagueFavorite: boolean;  // drafted in 4+ of the last 8 seasons
}

/** Positional need score for Rod's roster */
export interface PositionalNeed {
  position: string;
  urgency: "critical" | "high" | "medium" | "low";
  urgencyScore: number;   // 0-100
  currentCount: number;
  targetCount: number;
  reasoning: string;
}

/** Full pick recommendation from LLM */
export interface PickRecommendation {
  primaryPick: string;        // player name
  primaryPosition: string;
  primaryReasoning: string;
  alternativePick: string;
  alternativePosition: string;
  alternativeReasoning: string;
  avoidPick: string;          // player to avoid (owner likely to take)
  avoidReason: string;
  rosterImpact: string;       // how this pick changes Rod's championship equity
  urgencyAlert: string | null; // e.g. "RB run in progress — 3 RBs in last 5 picks"
  confidenceLevel: "high" | "medium" | "low";
}

// ─── Roster target counts (14-team PPR, 15 rounds) ───────────────────────────

const ROSTER_TARGETS: Record<string, { min: number; ideal: number }> = {
  QB:   { min: 1, ideal: 2 },
  RB:   { min: 3, ideal: 4 },
  WR:   { min: 3, ideal: 4 },
  TE:   { min: 1, ideal: 2 },
  "D/ST": { min: 1, ideal: 1 },
  K:    { min: 1, ideal: 1 },
};

// ─── 1. Positional need scoring ───────────────────────────────────────────────

/**
 * Score how urgently Rod needs each position given his current roster
 * and how many rounds remain.
 */
export function scorePositionalNeed(
  currentRoster: RosterSlot[],
  currentRound: number,
  totalRounds: number
): PositionalNeed[] {
  const roundsLeft = totalRounds - currentRound + 1;
  const counts: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, "D/ST": 0, K: 0 };
  for (const slot of currentRoster) {
    const pos = normalizePosition(slot.position);
    if (pos in counts) counts[pos]++;
  }

  const needs: PositionalNeed[] = [];
  for (const [pos, targets] of Object.entries(ROSTER_TARGETS)) {
    const current = counts[pos] ?? 0;
    const gap = targets.ideal - current;
    const minGap = targets.min - current;

    let urgencyScore = 0;
    let urgency: PositionalNeed["urgency"] = "low";
    let reasoning = "";

    if (minGap > 0) {
      // Haven't hit the minimum — critical
      urgencyScore = 90 + Math.min(10, minGap * 5);
      urgency = "critical";
      reasoning = `Need at least ${targets.min} ${pos} — currently have ${current}. Must draft before round ${Math.min(totalRounds, currentRound + 3)}.`;
    } else if (gap > 0) {
      // Below ideal but above minimum
      const roundPressure = Math.max(0, 1 - (roundsLeft / totalRounds));
      urgencyScore = 40 + gap * 15 + roundPressure * 20;
      urgency = urgencyScore >= 70 ? "high" : urgencyScore >= 50 ? "medium" : "low";
      reasoning = `Ideally want ${targets.ideal} ${pos} — have ${current}. ${roundsLeft} rounds remain.`;
    } else {
      // At or above ideal
      urgencyScore = Math.max(0, 20 - (current - targets.ideal) * 10);
      urgency = "low";
      reasoning = `${pos} is covered (${current}/${targets.ideal}).`;
    }

    needs.push({ position: pos, urgency, urgencyScore: Math.min(100, urgencyScore), currentCount: current, targetCount: targets.ideal, reasoning });
  }

  return needs.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

function normalizePosition(pos: string): string {
  const p = (pos || "").toUpperCase().trim();
  if (p === "DST" || p === "DEF" || p === "D/ST") return "D/ST";
  return p;
}

// ─── 2. Owner tendency analysis ───────────────────────────────────────────────

/**
 * Given the draft order and picks already made, compute each owner's
 * next pick number and predict what position they'll target.
 */
export function buildOwnerTendencies(
  owners: Array<{
    teamId: number;
    ownerName: string;
    draftSlot: number;
    gmArchetype: string;
    reachPositions: string[];
    valuePositions: string[];
    round1Distribution: Record<string, number>;
    keeperRate: number;
    tiltScore: number;
    exploitabilityScore: number;
  }>,
  picksAlreadyMade: DraftPick[],
  currentOverall: number,
  totalTeams: number,
  totalRounds: number
): OwnerTendency[] {
  // Build snake draft pick schedule for each owner
  const pickSchedule = buildSnakeSchedule(totalTeams, totalRounds);

  return owners.map(owner => {
    // Find their next pick after currentOverall
    const myPicks = pickSchedule.filter(p => p.slot === owner.draftSlot && p.overall > currentOverall);
    const nextPickOverall = myPicks.length > 0 ? myPicks[0].overall : null;

    // What positions have they already drafted?
    const theirPicks = picksAlreadyMade.filter(p => p.teamId === owner.teamId);
    const theirPositions = theirPicks.map(p => normalizePosition(p.position));
    const theirCounts: Record<string, number> = {};
    for (const pos of theirPositions) theirCounts[pos] = (theirCounts[pos] ?? 0) + 1;

    // Predict next position based on their gaps + tendencies
    const predicted = predictNextPositions(owner, theirCounts, nextPickOverall, pickSchedule, totalTeams);

    return {
      ...owner,
      nextPickOverall,
      predictedPositions: predicted,
    };
  });
}

function buildSnakeSchedule(teams: number, rounds: number): Array<{ overall: number; round: number; slot: number }> {
  const schedule: Array<{ overall: number; round: number; slot: number }> = [];
  let overall = 1;
  for (let r = 1; r <= rounds; r++) {
    const isEven = r % 2 === 0;
    for (let i = 0; i < teams; i++) {
      const slot = isEven ? teams - i : i + 1;
      schedule.push({ overall, round: r, slot });
      overall++;
    }
  }
  return schedule;
}

function predictNextPositions(
  owner: { reachPositions: string[]; valuePositions: string[]; round1Distribution: Record<string, number>; gmArchetype: string },
  currentCounts: Record<string, number>,
  nextPickOverall: number | null,
  schedule: Array<{ overall: number; round: number; slot: number }>,
  totalTeams: number
): string[] {
  if (!nextPickOverall) return [];
  const nextRound = Math.ceil(nextPickOverall / totalTeams);

  // Positional gaps
  const gaps: Array<{ pos: string; gap: number }> = [];
  for (const [pos, targets] of Object.entries(ROSTER_TARGETS)) {
    const current = currentCounts[pos] ?? 0;
    const gap = targets.ideal - current;
    if (gap > 0) gaps.push({ pos, gap });
  }
  gaps.sort((a, b) => b.gap - a.gap);

  // Weight by round distribution and tendencies
  const candidates = gaps.slice(0, 4).map(g => g.pos);

  // Boost reach positions
  for (const pos of owner.reachPositions) {
    if (!candidates.includes(pos)) candidates.push(pos);
  }

  // In early rounds, weight by round1Distribution
  if (nextRound <= 3 && Object.keys(owner.round1Distribution).length > 0) {
    const topDist = Object.entries(owner.round1Distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([pos]) => pos);
    return topDist;
  }

  return candidates.slice(0, 2);
}

// ─── 3. Survival risk calculation ─────────────────────────────────────────────

/**
 * Estimate probability a player is gone before Rod's next pick.
 * Based on: picks between now and Rod's next pick, player's ECR rank,
 * and how many owners are likely targeting that position.
 */
export function calcSurvivalRisk(
  playerEcrRank: number,
  picksUntilRodNext: number,
  ownerTendencies: OwnerTendency[],
  playerPosition: string
): number {
  if (picksUntilRodNext <= 0) return 0;

  // Base: how many players ranked above this one are already gone?
  // Approximate: in a 14-team draft, ~1 player per pick is taken
  const rankPressure = Math.min(1, picksUntilRodNext / Math.max(1, playerEcrRank));

  // Position demand: how many owners are targeting this position next?
  const positionDemand = ownerTendencies.filter(
    o => o.nextPickOverall !== null &&
         o.predictedPositions.includes(normalizePosition(playerPosition))
  ).length;

  const demandFactor = Math.min(0.4, positionDemand * 0.1);

  return Math.min(0.99, rankPressure * 0.6 + demandFactor);
}

// ─── 4. Run detection ─────────────────────────────────────────────────────────

/**
 * Detect if a position run is in progress (3+ picks of same position
 * in the last 8 picks).
 */
export function detectPositionRun(
  recentPicks: DraftPick[],
  windowSize = 8,
  threshold = 3
): { position: string; count: number; alert: string } | null {
  const window = recentPicks.slice(-windowSize);
  const counts: Record<string, number> = {};
  for (const p of window) {
    const pos = normalizePosition(p.position);
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const run = Object.entries(counts)
    .filter(([, c]) => c >= threshold)
    .sort((a, b) => b[1] - a[1])[0];
  if (!run) return null;
  return {
    position: run[0],
    count: run[1],
    alert: `${run[0]} run in progress — ${run[1]} taken in last ${windowSize} picks. Consider pivoting or grabbing your ${run[0]} now.`,
  };
}

// ─── 5. LLM prompt builder ────────────────────────────────────────────────────

export function buildPickRecommendationPrompt(params: {
  currentOverall: number;
  currentRound: number;
  pickInRound: number;
  totalTeams: number;
  totalRounds: number;
  rodRoster: RosterSlot[];
  positionalNeeds: PositionalNeed[];
  topAvailable: AvailablePlayer[];
  ownerTendencies: OwnerTendency[];
  recentPicks: DraftPick[];
  positionRun: { position: string; count: number; alert: string } | null;
  leagueContext: string;
}): string {
  const {
    currentOverall, currentRound, pickInRound, totalTeams, totalRounds,
    rodRoster, positionalNeeds, topAvailable, ownerTendencies, recentPicks, positionRun, leagueContext,
  } = params;

  const rosterSummary = rodRoster.length === 0
    ? "No players drafted yet."
    : rodRoster.map(s => `${s.position} ${s.playerName} (Rd ${s.round})`).join(", ");

  const needsSummary = positionalNeeds
    .filter(n => n.urgency !== "low")
    .map(n => `${n.position} [${n.urgency.toUpperCase()}]: ${n.reasoning}`)
    .join("\n");

  const availableSummary = topAvailable.slice(0, 15).map(p =>
    `${p.playerName} (${p.position}) ECR#${p.ecrRank} ADP#${p.adpRank} Gap:${p.ecrAdpGap > 0 ? "+" : ""}${p.ecrAdpGap} VBD:${p.vbd} SurvivalRisk:${Math.round(p.survivalRisk * 100)}% LeagueAvgRound:${p.avgLeagueRound > 0 ? p.avgLeagueRound.toFixed(1) : "N/A"}`
  ).join("\n");

  const ownerAlerts = ownerTendencies
    .filter(o => o.nextPickOverall !== null && o.nextPickOverall < currentOverall + 5)
    .map(o => `${o.ownerName} picks at #${o.nextPickOverall} — likely targeting: ${o.predictedPositions.join("/") || "unknown"} (archetype: ${o.gmArchetype})`)
    .join("\n");

  const recentPicksSummary = recentPicks.slice(-8).map(p =>
    `#${p.overall} ${p.ownerName}: ${p.playerName} (${p.position})`
  ).join("\n");

  return `You are an elite fantasy football draft advisor for a 14-team PPR league (15 rounds, snake draft).

LEAGUE CONTEXT:
${leagueContext}

CURRENT PICK:
- Overall pick: #${currentOverall} (Round ${currentRound}, Pick ${pickInRound} of ${totalTeams})
- Rounds remaining: ${totalRounds - currentRound + 1}

ROD'S CURRENT ROSTER (${rodRoster.length} players):
${rosterSummary}

POSITIONAL NEEDS (urgency analysis):
${needsSummary || "All positions adequately covered."}

${positionRun ? `⚠️ POSITION RUN ALERT: ${positionRun.alert}` : ""}

UPCOMING OWNER PICKS (next 5 picks):
${ownerAlerts || "No immediate threats."}

RECENT PICKS (last 8):
${recentPicksSummary || "Draft just started."}

TOP AVAILABLE PLAYERS:
${availableSummary}

Based on all of the above, provide a pick recommendation as JSON with this exact schema:
{
  "primaryPick": "player name",
  "primaryPosition": "position",
  "primaryReasoning": "2-3 sentence explanation referencing roster needs, survival risk, and value",
  "alternativePick": "player name",
  "alternativePosition": "position",
  "alternativeReasoning": "1-2 sentence explanation",
  "avoidPick": "player name most likely to be taken by an upcoming owner",
  "avoidReason": "which owner and why",
  "rosterImpact": "1 sentence on how the primary pick changes Rod's championship equity",
  "urgencyAlert": "null or a short alert string if there is a run or critical need",
  "confidenceLevel": "high" | "medium" | "low"
}

Respond with ONLY the JSON object, no markdown fences.`;
}

// ─── 6. Response parser ───────────────────────────────────────────────────────

export function parsePickRecommendation(raw: string): PickRecommendation | null {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<PickRecommendation>;
    if (!parsed.primaryPick || !parsed.primaryPosition) return null;
    return {
      primaryPick: parsed.primaryPick ?? "",
      primaryPosition: parsed.primaryPosition ?? "",
      primaryReasoning: parsed.primaryReasoning ?? "",
      alternativePick: parsed.alternativePick ?? "",
      alternativePosition: parsed.alternativePosition ?? "",
      alternativeReasoning: parsed.alternativeReasoning ?? "",
      avoidPick: parsed.avoidPick ?? "",
      avoidReason: parsed.avoidReason ?? "",
      rosterImpact: parsed.rosterImpact ?? "",
      urgencyAlert: parsed.urgencyAlert ?? null,
      confidenceLevel: parsed.confidenceLevel ?? "medium",
    };
  } catch {
    return null;
  }
}
