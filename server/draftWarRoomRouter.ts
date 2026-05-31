/**
 * draftWarRoomRouter.ts — Draft War Room Phase 1 + 1.5
 *
 * Phase 1.5 additions:
 *   - Keeper Value Score (KVS) replacing simple projection sort
 *   - Draft Capital Awareness (traded pick detection)
 *   - Draft Shock Meter (predictability per owner)
 *   - Confidence Dashboard (league-wide summary)
 *
 * All deterministic. No LLM. No fabricated ADP or rankings.
 */

import { z }                       from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb }                   from "./db";
import { sql as drizzleSql }       from "drizzle-orm";
import {
  calcKeeperCompression, calcScarcityAlerts, calcPositionRunAlerts,
  calcDraftBoardPressure, buildDraftEnvironmentDashboard,
} from "./draftWarRoomPhase175";

const LEAGUE_ID = "457622";

// ── Slot → position ───────────────────────────────────────────────────────────
const SLOT_MAP: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE",
  15: "RB", 16: "DEF", 17: "K", 20: "BE", 21: "IR", 23: "FLEX",
};

const LINEUP_REQS: Record<string, number> = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1,
  // DEF removed — this league uses individual defensive players (DL, LB, DB, S, CB)
};

// Position-round expected value (projected pts per round, avg)
const POS_ROUND_VALUE: Record<string, number[]> = {
  QB:  [480, 440, 400, 370, 340, 310, 280, 260, 240, 220, 200, 180, 160, 140],
  RB:  [350, 310, 275, 250, 225, 205, 185, 165, 145, 130, 115, 100,  85,  70],
  WR:  [340, 305, 270, 245, 220, 200, 180, 160, 143, 126, 110,  95,  80,  65],
  TE:  [290, 240, 200, 175, 155, 135, 115, 100,  85,  72,  60,  50,  42,  35],
  K:   [175, 160, 148, 135, 122, 110,  98,  88,  78,  68,  58,  50,  42,  35],
  DEF: [160, 145, 130, 118, 106,  95,  84,  74,  65,  57,  49,  42,  35,  29],
};

// Position scarcity weight (higher = scarcer at high value)
const POS_SCARCITY: Record<string, number> = {
  QB: 0.85, RB: 1.10, WR: 1.05, TE: 1.15, K: 0.70, DEF: 0.70,
};

// Round position weights for mock draft
const ROUND_POS_WEIGHTS: Record<number, Record<string, number>> = {
  // R1-R2: elite RB/WR/TE only — almost never QB (use VORP tier filter instead)
  1:  { RB: 48, WR: 46, QB:  2, TE:  4 },
  2:  { RB: 40, WR: 42, QB:  6, TE: 12 },
  3:  { RB: 35, WR: 38, QB: 12, TE: 15 },
  4:  { WR: 32, RB: 28, QB: 22, TE: 18 },
  5:  { WR: 28, RB: 22, QB: 26, TE: 14, K:  5, DEF:  5 },
  6:  { WR: 25, RB: 20, QB: 28, TE: 12, K:  8, DEF:  7 },
  7:  { WR: 24, RB: 18, QB: 22, TE: 14, K: 12, DEF: 10 },
  8:  { WR: 22, RB: 17, QB: 18, TE: 13, K: 15, DEF: 15 },
  9:  { WR: 20, RB: 15, QB: 16, TE: 12, K: 18, DEF: 19 },
  10: { WR: 18, RB: 14, QB: 14, TE: 11, K: 22, DEF: 21 },
  11: { WR: 18, RB: 14, QB: 12, TE: 10, K: 23, DEF: 23 },
  12: { WR: 18, RB: 14, QB: 12, TE: 10, K: 23, DEF: 23 },
  13: { WR: 18, RB: 14, QB: 10, TE: 10, K: 24, DEF: 24 },
  14: { WR: 18, RB: 14, QB: 10, TE: 10, K: 24, DEF: 24 },
};

// VBD replacement baselines for 14-team 1QB/2RB/2WR/1TE/1K/2FLEX league
// Calibrated to push QBs to rounds 3-5 where they are actually drafted
const VBD_BASELINE: Record<string, number> = {
  QB:  380,  // 12th QB -- teams wait until late rounds for QB2
  RB:  140,  // 28th RB (2 starters + flex shares)
  WR:  130,  // 28th WR
  TE:  110,  // 14th TE (only 1 starter)
  K:    90,  // 14th K
  DEF:  80,
};

function vorp(projectedPoints: number, position: string): number {
  return projectedPoints - (VBD_BASELINE[position] ?? 100);
}

function roundWeights(round: number) {
  return ROUND_POS_WEIGHTS[Math.min(round, 14)] ?? ROUND_POS_WEIGHTS[14];
}

// ── KVS (Keeper Value Score) ──────────────────────────────────────────────────
// Measures how much value the player gives relative to their keeper cost.
// KVS = (projectedPts / expectedValueAtCostRound) × scarcityMultiplier × 100
// Capped 0-200 (100 = break-even, >100 = value, <100 = overpay)

function calcKVS(params: {
  projectedPoints: number;
  position:        string;
  keeperRound:     number;
}): {
  kvs:          number;
  kvsRaw:       number;
  breakEven:    number;
  surplus:      number;
  surplusLabel: string;
  evidence:     string[];
} {
  const { projectedPoints, position, keeperRound } = params;
  const roundIdx = Math.min(keeperRound - 1, (POS_ROUND_VALUE[position]?.length ?? 1) - 1);
  const expectedAtRound = POS_ROUND_VALUE[position]?.[roundIdx] ?? 100;
  const scarcity = POS_SCARCITY[position] ?? 1.0;

  const raw = projectedPoints > 0
    ? (projectedPoints / expectedAtRound) * scarcity * 100
    : 0;

  const kvsRaw = Math.round(Math.max(0, raw));           // uncapped — used for sorting
  const kvs    = Math.round(Math.min(200, kvsRaw));         // capped at 200 — used for display
  const surplus = Math.round(projectedPoints - expectedAtRound);
  const surplusLabel = surplus > 50 ? "ELITE VALUE" : surplus > 20 ? "GOOD VALUE" : surplus > 0 ? "SLIGHT VALUE" : surplus > -30 ? "FAIR" : "OVERPAY";

  const evidence = [
    `Projected ${projectedPoints.toFixed(0)} pts vs expected ${expectedAtRound} pts at Round ${keeperRound}`,
    `Position scarcity multiplier: ${scarcity}× (${position})`,
    `Value surplus: ${surplus > 0 ? "+" : ""}${surplus} pts → ${surplusLabel}`,
  ];

  return { kvs, kvsRaw, breakEven: expectedAtRound, surplus, surplusLabel, evidence };
}

// ── Traded pick detection ─────────────────────────────────────────────────────
// A team has a traded pick if they have MORE than 1 pick in any round.
// A team has traded away a pick if they have 0 picks in any round (but are in the league).

export interface TradedPickInfo {
  round:          number;
  teamId:         number;
  teamName:       string;
  ownerName:      string;
  type:           "ACQUIRED" | "TRADED_AWAY";
  pickNumber:     number | null;
  evidence:       string[];
}

function detectTradedPicks(
  picks: Array<{ roundId: number; roundPick: number; overallPick: number; teamId: number }>,
  teams: any[]
): TradedPickInfo[] {
  const teamIds = teams.map(t => Number(t.teamId));
  const totalRounds = Math.max(...picks.map(p => p.roundId), 14);
  const result: TradedPickInfo[] = [];

  // Team map for lookup
  const teamMap = new Map(teams.map(t => [Number(t.teamId), t]));

  for (let round = 1; round <= totalRounds; round++) {
    const roundPicks = picks.filter(p => p.roundId === round);

    // Count picks per team this round
    const teamPickCounts = new Map<number, number[]>();
    for (const p of roundPicks) {
      const tid = Number(p.teamId);
      if (!teamPickCounts.has(tid)) teamPickCounts.set(tid, []);
      teamPickCounts.get(tid)!.push(p.overallPick);
    }

    for (const tid of teamIds) {
      const myPicks = teamPickCounts.get(tid) ?? [];
      const team = teamMap.get(tid);
      if (!team) continue;

      if (myPicks.length > 1) {
        // Has extra picks — acquired from trade
        for (const pickNum of myPicks.slice(1)) {
          result.push({
            round, teamId: tid, teamName: team.name, ownerName: team.ownerName,
            type: "ACQUIRED", pickNumber: pickNum,
            evidence: [
              `Has ${myPicks.length} picks in Round ${round} (expected 1)`,
              `Extra pick #${pickNum} was acquired via trade`,
            ],
          });
        }
      } else if (myPicks.length === 0) {
        // Missing pick — traded away
        result.push({
          round, teamId: tid, teamName: team.name, ownerName: team.ownerName,
          type: "TRADED_AWAY", pickNumber: null,
          evidence: [
            `Has 0 picks in Round ${round} (expected 1)`,
            `Round ${round} pick was traded to another team`,
          ],
        });
      }
    }
  }

  return result;
}

// ── Draft Shock Meter ─────────────────────────────────────────────────────────
// Measures how predictable/surprising an owner's draft will be.

export interface ShockMeter {
  teamId:              number;
  teamName:            string;
  ownerName:           string;
  predictabilityScore: number;   // 0-100 (100 = totally predictable)
  surpriseProbability: number;   // 0-100
  mostLikelyPosition:  string;
  mostLikelyPickType:  "VALUE" | "NEED" | "REACH" | "UNKNOWN";
  draftCapital:        "ABOVE_AVERAGE" | "AVERAGE" | "BELOW_AVERAGE";
  evidence:            string[];
  signals:             Array<{ label: string; value: string; impact: "PREDICTABLE" | "UNPREDICTABLE" | "NEUTRAL" }>;
}

function calcShockMeter(params: {
  teamId:        number;
  teamName:      string;
  ownerName:     string;
  rosterNeeds:   Array<{ position: string; urgency: string }>;
  keeperPred:    Array<{ confidence: number; status: string }>;
  tradedPicks:   TradedPickInfo[];
  draftSlot:     number;  // 1-14
  teamCount:     number;
}): ShockMeter {
  const { teamId, teamName, ownerName, rosterNeeds, keeperPred, tradedPicks, draftSlot, teamCount } = params;

  const signals: ShockMeter["signals"] = [];
  const predictSignals: number[] = [];

  // Signal 1: Need concentration (many critical needs = less predictable)
  const critNeeds   = rosterNeeds.filter(n => n.urgency === "CRITICAL").length;
  const highNeeds   = rosterNeeds.filter(n => n.urgency === "HIGH").length;
  const needSpread  = critNeeds + highNeeds;
  if (needSpread === 0) {
    signals.push({ label: "No critical needs", value: "Balanced roster", impact: "UNPREDICTABLE" });
    predictSignals.push(0.45);
  } else if (needSpread === 1) {
    signals.push({ label: "Single clear need", value: rosterNeeds[0]?.position ?? "?", impact: "PREDICTABLE" });
    predictSignals.push(0.85);
  } else if (needSpread === 2) {
    signals.push({ label: "Two positional needs", value: `${rosterNeeds[0]?.position}+${rosterNeeds[1]?.position}`, impact: "PREDICTABLE" });
    predictSignals.push(0.72);
  } else {
    signals.push({ label: "Multiple critical needs", value: `${needSpread} positions`, impact: "UNPREDICTABLE" });
    predictSignals.push(0.50);
  }

  // Signal 2: Keeper confidence
  const avgKeeperConf = keeperPred.length > 0
    ? keeperPred.reduce((s, k) => s + k.confidence, 0) / keeperPred.length
    : 50;
  const hasConfirmed = keeperPred.some(k => k.status === "CONFIRMED");
  if (hasConfirmed) {
    signals.push({ label: "Confirmed keeper", value: "Known", impact: "PREDICTABLE" });
    predictSignals.push(0.88);
  } else if (keeperPred.length > 0) {
    signals.push({ label: "Keeper predicted", value: `${avgKeeperConf}% conf`, impact: avgKeeperConf > 70 ? "PREDICTABLE" : "UNPREDICTABLE" });
    predictSignals.push(avgKeeperConf / 100);
  } else {
    signals.push({ label: "No keeper", value: "Open slot", impact: "UNPREDICTABLE" });
    predictSignals.push(0.60);
  }

  // Signal 3: Draft capital situation
  const acquired    = tradedPicks.filter(p => p.teamId === teamId && p.type === "ACQUIRED").length;
  const tradedAway  = tradedPicks.filter(p => p.teamId === teamId && p.type === "TRADED_AWAY").length;
  const capitalDiff = acquired - tradedAway;
  let capitalStatus: ShockMeter["draftCapital"] = "AVERAGE";
  if (capitalDiff > 0) {
    capitalStatus = "ABOVE_AVERAGE";
    signals.push({ label: "Extra draft capital", value: `+${capitalDiff} picks`, impact: "UNPREDICTABLE" });
    predictSignals.push(0.50);
  } else if (capitalDiff < 0) {
    capitalStatus = "BELOW_AVERAGE";
    signals.push({ label: "Fewer picks", value: `${capitalDiff} picks`, impact: "PREDICTABLE" });
    predictSignals.push(0.80);
  } else {
    signals.push({ label: "Standard draft capital", value: "Normal picks", impact: "NEUTRAL" });
    predictSignals.push(0.70);
  }

  // Signal 4: Draft position (early vs late)
  if (draftSlot <= 3) {
    signals.push({ label: "Top-3 pick", value: `Slot #${draftSlot}`, impact: "PREDICTABLE" });
    predictSignals.push(0.82);
  } else if (draftSlot >= teamCount - 2) {
    signals.push({ label: "Late pick", value: `Slot #${draftSlot}`, impact: "UNPREDICTABLE" });
    predictSignals.push(0.60);
  } else {
    signals.push({ label: "Mid-round pick", value: `Slot #${draftSlot}`, impact: "NEUTRAL" });
    predictSignals.push(0.70);
  }

  const avgPredict = predictSignals.reduce((s, v) => s + v, 0) / predictSignals.length;
  const predictabilityScore = Math.round(Math.min(97, Math.max(30, avgPredict * 100)));
  const surpriseProbability = 100 - predictabilityScore;

  // Most likely position = top urgency need
  const topNeed = rosterNeeds.find(n => ["CRITICAL","HIGH"].includes(n.urgency));
  const mostLikelyPosition = topNeed?.position ?? "ANY";

  // Pick type prediction
  let mostLikelyPickType: ShockMeter["mostLikelyPickType"] = "NEED";
  if (needSpread === 0 && capitalStatus === "ABOVE_AVERAGE") mostLikelyPickType = "VALUE";
  else if (avgKeeperConf < 50 && needSpread > 2) mostLikelyPickType = "REACH";
  else if (needSpread >= 1) mostLikelyPickType = "NEED";
  else mostLikelyPickType = "UNKNOWN";

  const evidence = [
    `Predictability: ${predictabilityScore}% (${predictSignals.map(s => (s * 100).toFixed(0)).join(", ")} signals)`,
    `Need spread: ${needSpread} high-urgency positions`,
    `Draft capital: ${capitalStatus} (${capitalDiff > 0 ? "+" : ""}${capitalDiff})`,
    `Draft slot: #${draftSlot} of ${teamCount}`,
  ];

  return {
    teamId, teamName, ownerName,
    predictabilityScore, surpriseProbability,
    mostLikelyPosition, mostLikelyPickType,
    draftCapital: capitalStatus, evidence, signals,
  };
}

// ── Confidence Dashboard ──────────────────────────────────────────────────────

export interface ConfidenceDashboard {
  mostPredictable:   { teamName: string; ownerName: string; score: number; reason: string };
  leastPredictable:  { teamName: string; ownerName: string; score: number; reason: string };
  biggestReach:      { teamName: string; ownerName: string; position: string; reason: string } | null;
  biggestRosterHole: { teamName: string; ownerName: string; position: string; urgency: string; reason: string } | null;
  bestKeeperValue:   { teamName: string; ownerName: string; player: string; kvs: number; reason: string } | null;
  mostLikelyToChange:{ teamName: string; ownerName: string; score: number; reason: string };
}

function buildConfidenceDashboard(
  shockMeters: ShockMeter[],
  rosterNeeds: any[],
  keeperPredictions: any[]
): ConfidenceDashboard {
  const sorted = [...shockMeters].sort((a, b) => b.predictabilityScore - a.predictabilityScore);

  const mostPredictable = sorted[0];
  const leastPredictable = sorted[sorted.length - 1];
  const mostLikelyToChange = [...shockMeters].sort((a, b) => b.surpriseProbability - a.surpriseProbability)[0];

  // Biggest roster hole = team with CRITICAL need at highest urgency
  const allCritical = rosterNeeds
    .flatMap(n => n.needs.filter((nd: any) => nd.urgency === "CRITICAL").map((nd: any) => ({ ...nd, teamName: n.teamName, ownerName: n.ownerName })))
    .sort((a: any, b: any) => b.gap - a.gap);
  const biggestRosterHole = allCritical[0] ? {
    teamName: allCritical[0].teamName, ownerName: allCritical[0].ownerName,
    position: allCritical[0].position, urgency: "CRITICAL",
    reason: `Missing ${allCritical[0].gap} starter(s) at ${allCritical[0].position}`,
  } : null;

  // Best keeper value = highest KVS from keeper predictions
  const kvsKeepers = keeperPredictions
    .filter((k: any) => k.kvs !== undefined)
    .sort((a: any, b: any) => b.kvs - a.kvs);
  const bestKeeperValue = kvsKeepers[0] ? {
    teamName: kvsKeepers[0].teamName, ownerName: kvsKeepers[0].ownerName,
    player: kvsKeepers[0].predictedPlayer, kvs: kvsKeepers[0].kvs,
    reason: `KVS ${kvsKeepers[0].kvs} — ${kvsKeepers[0].surplusLabel ?? "value"}`,
  } : null;

  // Biggest projected reach = team drafting from depth when already stacked (value pick expected but filling need)
  // Determine by finding team with highest predicted "reach": low draft slot + stacked position = reach
  const biggestReach = shockMeters.find(s => s.mostLikelyPickType === "REACH") ?? null;

  return {
    mostPredictable: {
      teamName: mostPredictable.teamName, ownerName: mostPredictable.ownerName,
      score: mostPredictable.predictabilityScore,
      reason: mostPredictable.signals.filter(s => s.impact === "PREDICTABLE").map(s => s.label).join(", ") || "Stable roster",
    },
    leastPredictable: {
      teamName: leastPredictable.teamName, ownerName: leastPredictable.ownerName,
      score: leastPredictable.predictabilityScore,
      reason: leastPredictable.signals.filter(s => s.impact === "UNPREDICTABLE").map(s => s.label).join(", ") || "Multiple unknowns",
    },
    biggestReach: biggestReach ? {
      teamName: biggestReach.teamName, ownerName: biggestReach.ownerName,
      position: biggestReach.mostLikelyPosition,
      reason: "Projected to reach based on need vs capital mismatch",
    } : null,
    biggestRosterHole,
    bestKeeperValue,
    mostLikelyToChange: {
      teamName: mostLikelyToChange.teamName, ownerName: mostLikelyToChange.ownerName,
      score: mostLikelyToChange.surpriseProbability,
      reason: mostLikelyToChange.signals.filter(s => s.impact === "UNPREDICTABLE").map(s => s.label).join(", ") || "Unpredictable roster",
    },
  };
}

// ── Roster loader ─────────────────────────────────────────────────────────────

async function loadRoster(db: any, season: number) {
  const [rosterRows] = await db.execute(drizzleSql`
    SELECT r.teamId, r.playerName, r.position, r.slotId,
           r.projectedPoints, r.injuryStatus, r.acquisitionType,
           t.name as teamName, t.ownerName
    FROM roster_entries r
    JOIN teams t ON t.leagueId = r.leagueId AND t.season = r.season AND t.teamId = r.teamId
    WHERE r.leagueId = ${LEAGUE_ID} AND r.season = ${season} AND r.week = 0
    ORDER BY r.teamId, r.projectedPoints DESC
  `) as unknown as [any[]];

  const [teamRows] = await db.execute(drizzleSql`
    SELECT teamId, name, ownerName FROM teams
    WHERE leagueId = ${LEAGUE_ID} AND season = ${season} ORDER BY teamId
  `) as unknown as [any[]];

  const [keeperRows] = await db.execute(drizzleSql`
    SELECT teamId, roundId, roundPick, overallPick, playerName, position, isKeeper
    FROM draft_picks
    WHERE leagueId = ${LEAGUE_ID} AND season = ${season} AND isKeeper = 1
    ORDER BY teamId, roundId
  `) as unknown as [any[]];

  const [allPickRows] = await db.execute(drizzleSql`
    SELECT teamId, roundId, roundPick, overallPick, playerName, position, isKeeper
    FROM draft_picks
    WHERE leagueId = ${LEAGUE_ID} AND season = ${season}
    ORDER BY overallPick
  `) as unknown as [any[]];

  const byTeam = new Map<number, any[]>();
  for (const r of (rosterRows as any[])) {
    const tid = Number(r.teamId);
    if (!byTeam.has(tid)) byTeam.set(tid, []);
    byTeam.get(tid)!.push({ ...r, projectedPoints: parseFloat(r.projectedPoints ?? "0") });
  }

  return {
    byTeam,
    teams:    teamRows as any[],
    keepers:  keeperRows as any[],
    allPicks: allPickRows as any[],
  };
}

// ── Keeper predictions (Phase 1.5: with KVS) ─────────────────────────────────

function predictKeepers(teams: any[], byTeam: Map<number, any[]>, keeperSlots: any[]) {
  const predictions: any[] = [];
  const slotsByTeam = new Map<number, any[]>();
  for (const k of keeperSlots) {
    const tid = Number(k.teamId);
    if (!slotsByTeam.has(tid)) slotsByTeam.set(tid, []);
    slotsByTeam.get(tid)!.push(k);
  }

  for (const [tid, slots] of slotsByTeam.entries()) {
    const roster = byTeam.get(tid) ?? [];
    const team   = teams.find(t => Number(t.teamId) === tid);
    if (!team) continue;

    // Starters sorted by projected points
    const starters = [...roster]
      .filter(p => p.playerName && p.slotId !== 20 && p.slotId !== 21)
      .sort((a, b) => b.projectedPoints - a.projectedPoints);

    const used = new Set<string>();

    for (const slot of slots) {
      const keeperRound = Number(slot.roundId);
      const isConfirmed = slot.playerName?.trim() && slot.position !== "?";

      if (isConfirmed) {
        const kvsResult = calcKVS({ projectedPoints: 0, position: slot.position, keeperRound });
        predictions.push({
          teamId: tid, teamName: team.name, ownerName: team.ownerName,
          keeperRound, keeperRoundPick: Number(slot.roundPick),
          predictedPlayer: slot.playerName, position: slot.position,
          projectedPoints: 0, confidence: 100,
          ...kvsResult,
          evidence: [`Official keeper confirmed for Round ${keeperRound}`, ...kvsResult.evidence],
          status: "CONFIRMED", alternatives: [],
        });
        used.add(slot.playerName);
        continue;
      }

      // Phase 1.5: Score ALL players by KVS and pick best
      const candidates = starters
        .filter(p => p.playerName && !used.has(p.playerName) && p.projectedPoints > 0)
        .map(p => {
          const kvsResult = calcKVS({ projectedPoints: p.projectedPoints, position: p.position, keeperRound });
          return { ...p, ...kvsResult };
        })
        .sort((a, b) => (b.kvsRaw ?? b.kvs) - (a.kvsRaw ?? a.kvs));

      const best = candidates[0];
      if (!best) {
        predictions.push({
          teamId: tid, teamName: team.name, ownerName: team.ownerName,
          keeperRound, keeperRoundPick: Number(slot.roundPick),
          predictedPlayer: "Unknown", position: "?",
          projectedPoints: 0, kvs: 0, confidence: 20,
          evidence: ["Insufficient roster data to predict keeper"], status: "PREDICTED", alternatives: [],
        });
        continue;
      }

      used.add(best.playerName);

      const confSignals = [
        best.kvs >= 120 ? 0.90 : best.kvs >= 100 ? 0.78 : 0.62,
        best.slotId < 20 ? 0.85 : 0.55,
        keeperRound >= 10 ? 0.82 : 0.65,
      ];
      const confidence = Math.round(Math.min(95, Math.max(35, (confSignals.reduce((s,v) => s+v, 0)/confSignals.length)*100)));

      const alts = candidates.slice(1, 4).map(c => ({
        player: c.playerName, position: c.position,
        projectedPoints: c.projectedPoints, kvs: c.kvs, reason: `KVS ${c.kvs} (${c.surplusLabel})`,
      }));

      predictions.push({
        teamId: tid, teamName: team.name, ownerName: team.ownerName,
        keeperRound, keeperRoundPick: Number(slot.roundPick),
        predictedPlayer: best.playerName, position: best.position,
        projectedPoints: best.projectedPoints,
        kvs: best.kvs, breakEven: best.breakEven, surplus: best.surplus, surplusLabel: best.surplusLabel,
        confidence,
        evidence: [...best.evidence, `Selected over ${candidates.length - 1} other candidates based on KVS`],
        status: "PREDICTED" as const,
        alternatives: alts,
      });
    }
  }

  return predictions;
}

// ── Roster needs ──────────────────────────────────────────────────────────────

function buildRosterNeeds(teams: any[], byTeam: Map<number, any[]>, keeperPredictions: any[]) {
  const needs: any[] = [];
  const urgOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

  for (const team of teams) {
    const tid    = Number(team.teamId);
    const roster = byTeam.get(tid) ?? [];
    const posCount: Record<string, number> = {};
    const posPlayers: Record<string, any[]> = {};
    let projTotal = 0;

    for (const p of roster) {
      if (!p.playerName) continue;
      posCount[p.position] = (posCount[p.position] ?? 0) + 1;
      if (!posPlayers[p.position]) posPlayers[p.position] = [];
      posPlayers[p.position].push(p);
      if (p.slotId !== 20 && p.slotId !== 21) projTotal += p.projectedPoints;
    }

    const starters = roster.filter(p => p.slotId !== 20 && p.slotId !== 21);
    const starterByPos: Record<string, any[]> = {};
    for (const p of starters) {
      if (!starterByPos[p.position]) starterByPos[p.position] = [];
      starterByPos[p.position].push(p);
    }

    const rosterNeeds: any[] = [];
    const strengths: any[] = [];
    const priority: string[] = [];

    for (const [pos, needed] of Object.entries(LINEUP_REQS)) {
      const have = (starterByPos[pos] ?? []).length;
      const gap  = Math.max(0, needed - have);
      const top  = (posPlayers[pos] ?? []).sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
      const urg  = gap >= needed ? "CRITICAL" : gap >= 1 ? "HIGH" : have > needed + 2 ? "LOW" : "MEDIUM";

      if (gap > 0) {
        rosterNeeds.push({
          position: pos, urgency: urg, have, need: needed, gap,
          topPlayer: top?.playerName ?? "None",
          topProj:   top?.projectedPoints ?? 0,
          evidence: [
            `Roster has ${have} ${pos} starter(s), lineup requires ${needed}`,
            top ? `Best ${pos}: ${top.playerName} (${top.projectedPoints.toFixed(0)} pts proj)` : `No ${pos} on roster`,
          ],
        });
        if (urg === "CRITICAL" || urg === "HIGH") priority.push(pos);
      }
      if (have > needed + 2) {
        const top3 = (posPlayers[pos] ?? []).slice(0,3);
        strengths.push({ position: pos, count: have, topPlayer: top3[0]?.playerName ?? "?" });
      }
    }

    rosterNeeds.sort((a: any, b: any) => (urgOrder[a.urgency as keyof typeof urgOrder] ?? 3) - (urgOrder[b.urgency as keyof typeof urgOrder] ?? 3));
    needs.push({
      teamId: tid, teamName: team.name, ownerName: team.ownerName,
      projectedTotal: Math.round(projTotal),
      positionCounts: posCount,
      needs: rosterNeeds, strengths,
      draftPriority: priority.slice(0,4),
      overallRank: 0,
    });
  }

  needs.sort((a, b) => b.projectedTotal - a.projectedTotal);
  needs.forEach((n, i) => n.overallRank = i + 1);
  return needs;
}

// ── Mock draft ────────────────────────────────────────────────────────────────

function buildMockDraft(params: {
  allPicks: any[];
  rosterNeeds: any[];
  keeperPredictions: any[];
  tradedPicks: TradedPickInfo[];
  playerPool: Array<{ name: string; position: string; projectedPoints: number; espnId: string | null }>;
}) {
  const { allPicks, rosterNeeds, keeperPredictions, tradedPicks, playerPool } = params;
  const picks: any[] = [];
  const drafted = new Set<string>();

  // Pre-mark keeper players as drafted
  const keeperByTeamRound = new Map<string, string>();
  for (const kp of keeperPredictions) {
    if (kp.predictedPlayer && kp.predictedPlayer !== "Unknown") {
      drafted.add(kp.predictedPlayer);
      keeperByTeamRound.set(`${kp.teamId}_${kp.keeperRound}`, kp.predictedPlayer);
    }
  }

  const pool = [...playerPool].sort((a, b) => b.projectedPoints - a.projectedPoints);
  const needMap = new Map(rosterNeeds.map(n => [n.teamId, n]));
  const teamPosCounts = new Map<number, Record<string, number>>();
  for (const p of allPicks) teamPosCounts.set(Number(p.teamId), {});

  // Traded pick context
  const tradedPickMap = new Map<string, TradedPickInfo>();
  for (const tp of tradedPicks) {
    if (tp.pickNumber) tradedPickMap.set(`${tp.round}_${tp.teamId}`, tp);
  }

  let processedPick = 0;
  for (const draftPick of allPicks) {
    processedPick++;
    const pickNum = Number(draftPick.overallPick);
    const round   = Number(draftPick.roundId);
    const rp      = Number(draftPick.roundPick);
    const tid     = Number(draftPick.teamId);

    // Find team info from roster needs
    const teamData = rosterNeeds.find(n => n.teamId === tid);
    const teamName = teamData?.teamName ?? `Team ${tid}`;
    const ownerName = teamData?.ownerName ?? "Unknown";
    const needs    = needMap.get(tid);
    const counts   = teamPosCounts.get(tid) ?? {};

    // Keeper slot?
    const keeperPlayer = keeperByTeamRound.get(`${tid}_${round}`);
    if (keeperPlayer && keeperPlayer !== "Unknown") {
      const kp = keeperPredictions.find(k => k.teamId === tid && k.keeperRound === round);
      const tradeCtx = tradedPickMap.get(`${round}_${tid}`);
      picks.push({
        pickNumber: pickNum, round, roundPick: rp,
        teamId: tid, teamName, ownerName,
        player: keeperPlayer,
        position: kp?.position ?? "?",
        espnId: null,
        projectedPoints: kp?.projectedPoints ?? 0,
        confidence: kp?.confidence ?? 100,
        reasoning: `Keeper slot — Round ${round} reserved`,
        evidence: kp?.evidence ?? [`Keeper in Round ${round}`],
        alternatePicks: [],
        isKeeperSlot: true,
        tradedPickContext: tradeCtx ? {
          type: tradeCtx.type, evidence: tradeCtx.evidence
        } : null,
        kvs: kp?.kvs,
      });
      counts[kp?.position ?? "?"] = (counts[kp?.position ?? "?"] ?? 0) + 1;
      continue;
    }

    // Check if this is a traded pick
    const tradeCtx = tradedPickMap.get(`${round}_${tid}`);

    // Determine position to target
    const weights = roundWeights(round);
    const needWeights = { ...weights };
    if (needs) {
      for (const n of needs.needs) {
        const boost = ({ CRITICAL: 2.0, HIGH: 1.5, MEDIUM: 1.2, LOW: 1.0 } as Record<string,number>)[n.urgency] ?? 1.0;
        if (needWeights[n.position] !== undefined) needWeights[n.position] = Math.round(needWeights[n.position] * boost);
      }
    }
    // Cap over-rostered positions
    for (const [pos, cnt] of Object.entries(counts)) {
      const cap = { QB: 2, RB: 5, WR: 6, TE: 3, K: 2, DEF: 2 }[pos] ?? 3;
      if (cnt >= cap && needWeights[pos] !== undefined) needWeights[pos] = Math.max(1, Math.round(needWeights[pos] * 0.2));
    }

    // Deterministic weighted pick
    const posEntries = Object.entries(needWeights).filter(([, w]) => w > 0);
    const totalW = posEntries.reduce((s, [, w]) => s + w, 0);
    const seed = (pickNum * 2654435761) >>> 0;
    const threshold = ((seed % 10000) / 10000) * totalW;
    let cumulative = 0;
    let targetPos = posEntries[0][0];
    for (const [pos, w] of posEntries) {
      cumulative += w;
      if (threshold <= cumulative) { targetPos = pos; break; }
    }

    const available = pool.filter(p => p.position === targetPos && !drafted.has(p.name));
    const pick = available[0] ?? pool.filter(p => !drafted.has(p.name))[0];

    if (!pick) { continue; }
    drafted.add(pick.name);
    counts[pick.position] = (counts[pick.position] ?? 0) + 1;

    const needUrg = needs?.needs.find((n: any) => n.position === targetPos)?.urgency;
    const confSignals = [
      pick.projectedPoints > 200 ? 0.9 : pick.projectedPoints > 100 ? 0.75 : 0.55,
      needUrg === "CRITICAL" ? 0.95 : needUrg === "HIGH" ? 0.85 : 0.70,
      available.length > 5 ? 0.80 : 0.65,
    ];
    const conf = Math.round(Math.min(95, Math.max(35, (confSignals.reduce((s,v)=>s+v,0)/confSignals.length)*100)));

    const tradeNote = tradeCtx
      ? tradeCtx.type === "ACQUIRED"
        ? `[TRADED PICK] Acquired pick — ${ownerName} has extra Round ${round} capital`
        : `[TRADED PICK] This pick was traded in`
      : null;

    const evidence = [
      `Round ${round} ${targetPos} weight: ${needWeights[targetPos]}%`,
      needUrg ? `${teamName} ${targetPos} urgency: ${needUrg}` : `Round ${round} positional tendency`,
      `#${pool.filter(p => p.position === targetPos).findIndex(p => p.name === pick.name) + 1} available ${targetPos} (${pick.projectedPoints.toFixed(0)} pts)`,
      ...(tradeNote ? [tradeNote] : []),
    ];

    picks.push({
      pickNumber: pickNum, round, roundPick: rp,
      teamId: tid, teamName, ownerName,
      player: pick.name, position: pick.position, espnId: pick.espnId,
      projectedPoints: pick.projectedPoints, confidence: conf,
      reasoning: `${ownerName} targets ${targetPos} Round ${round}${needUrg ? ` [${needUrg} need]` : ""}${tradeCtx ? " [TRADED PICK]" : ""}`,
      evidence,
      alternatePicks: available.slice(1, 4).map(p => ({ player: p.name, position: p.position, projectedPoints: p.projectedPoints })),
      isKeeperSlot: false,
      tradedPickContext: tradeCtx ? { type: tradeCtx.type, evidence: tradeCtx.evidence } : null,
    });
  }

  return picks;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const draftWarRoomRouter = router({

  getDraftWarRoomData: publicProcedure
    .input(z.object({ season: z.number().int().min(2018).max(2030) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };
      const { season } = input;

      const { byTeam, teams, keepers, allPicks } = await loadRoster(db, season);
      if (teams.length === 0) return { ok: false, error: `No roster data for ${season}` };

      // Player pool
      const [regRows] = await db.execute(drizzleSql`
        SELECT fullName, position, espnPlayerId
        FROM gm_player_registry WHERE position IN ('QB','RB','WR','TE','K','DEF')
        ORDER BY lastSeasonSeen DESC, id ASC LIMIT 500
      `) as unknown as [any[]];

      const inPool = new Set<string>();
      const playerPool: any[] = [];
      const posCounters: Record<string, number> = {};
      const POS_BASELINE: Record<string, number[]> = {
        QB:  [480,440,400,370,340,310,280,260,240,220,200,180,160,140],
        RB:  [350,310,275,250,225,205,185,165,145,130,115,100,85,70],
        WR:  [340,305,270,245,220,200,180,160,143,126,110,95,80,65],
        TE:  [290,240,200,175,155,135,115,100,85,72,60,50,42,35],
        K:   [175,160,148,135,122,110,98,88,78,68,58,50,42,35],
        DEF: [160,145,130,118,106,95,84,74,65,57,49,42,35,29],
      };

      for (const [, players] of byTeam.entries()) {
        for (const p of players) {
          if (!p.playerName || inPool.has(p.playerName.toLowerCase())) continue;
          playerPool.push({ name: p.playerName, position: p.position, projectedPoints: p.projectedPoints, espnId: null });
          inPool.add(p.playerName.toLowerCase());
        }
      }
      for (const reg of (regRows as any[])) {
        if (inPool.has(reg.fullName.toLowerCase())) continue;
        const pos = reg.position as string;
        posCounters[pos] = (posCounters[pos] ?? 0) + 1;
        const tier = Math.min(posCounters[pos] - 1, (POS_BASELINE[pos]?.length ?? 1) - 1);
        playerPool.push({ name: reg.fullName, position: pos, projectedPoints: POS_BASELINE[pos]?.[tier] ?? 0, espnId: reg.espnPlayerId });
        inPool.add(reg.fullName.toLowerCase());
      }
      // Sort by VBD VORP (Value Over Replacement Player) — not raw projected points
      // This naturally pushes QBs to rounds 3-5 where they belong
      playerPool.sort((a, b) => vorp(b.projectedPoints, b.position) - vorp(a.projectedPoints, a.position));

      // Phase 1: Keeper + Roster
      const keeperPredictions = predictKeepers(teams, byTeam, keepers);
      const rosterNeeds       = buildRosterNeeds(teams, byTeam, keeperPredictions);

      // Phase 1.5: Traded picks + Shock Meters
      const tradedPicks = detectTradedPicks(allPicks, teams);

      // Build draft slot map (position in round 1 snake)
      const round1 = allPicks.filter(p => p.roundId === 1).sort((a, b) => a.roundPick - b.roundPick);
      const draftSlotMap = new Map<number, number>();
      round1.forEach((p, i) => draftSlotMap.set(Number(p.teamId), i + 1));

      const shockMeters = teams.map(t => {
        const tid    = Number(t.teamId);
        const needs  = rosterNeeds.find(n => n.teamId === tid);
        const kpreds = keeperPredictions.filter(k => k.teamId === tid);
        return calcShockMeter({
          teamId: tid, teamName: t.name, ownerName: t.ownerName,
          rosterNeeds: needs?.needs ?? [],
          keeperPred: kpreds,
          tradedPicks,
          draftSlot: draftSlotMap.get(tid) ?? 7,
          teamCount: teams.length,
        });
      });

      const confidenceDashboard = buildConfidenceDashboard(shockMeters, rosterNeeds, keeperPredictions);

      // Phase 1.5 Mock draft with traded pick awareness
      const mockDraft = buildMockDraft({ allPicks, rosterNeeds, keeperPredictions, tradedPicks, playerPool });

      // Phase 1.75 — Pressure Engine
      const keeperCompression = calcKeeperCompression(keeperPredictions, playerPool);
      const scarcityAlerts    = calcScarcityAlerts({ rosterNeeds, playerPool, keeperPredictions, totalTeams: teams.length, totalRounds: 14 });
      const positionRunAlerts = calcPositionRunAlerts({ rosterNeeds, scarcityAlerts, keeperPredictions, mockDraft, totalTeams: teams.length });
      const pressureByRound   = calcDraftBoardPressure({ rosterNeeds, scarcityAlerts, keeperPredictions, totalTeams: teams.length, totalRounds: 14 });
      const draftEnvironment  = buildDraftEnvironmentDashboard({ scarcityAlerts, runAlerts: positionRunAlerts, compression: keeperCompression, pressureByRound, playerPool });

      return {
        ok: true, season,
        teamCount: teams.length,
        keeperPredictions,
        rosterNeeds,
        tradedPicks,
        shockMeters,
        confidenceDashboard,
        keeperCompression,
        scarcityAlerts,
        positionRunAlerts,
        pressureByRound,
        draftEnvironment,
        mockDraft,
        totalPicks: mockDraft.length,
        dataAvailability: {
          roster: byTeam.size > 0,
          keepers: keepers.length > 0,
          playerRegistry: (regRows as any[]).length > 0,
          tradedPicks: tradedPicks.length > 0,
        },
      };
    }),
});

export type DraftWarRoomRouter = typeof draftWarRoomRouter;
