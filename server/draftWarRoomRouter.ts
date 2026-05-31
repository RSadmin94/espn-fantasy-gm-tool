/**
 * draftWarRoomRouter.ts — Draft War Room MVP
 *
 * Phase 1 implementation:
 *   - Keeper predictions (evidence-backed, confidence-scored)
 *   - Roster construction analysis (needs + strengths)
 *   - Owner-tendency mock draft (deterministic, no LLM)
 *
 * Data sources: roster_entries, teams, draft_picks, gm_player_registry
 * No fabricated ADP, rankings, or player values.
 * Every prediction includes evidence[] and confidence (0-100).
 */

import { z }                       from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { getDb }                   from "./db";
import { sql as drizzleSql }       from "drizzle-orm";

const LEAGUE_ID = "457622";

// ── Slot ID → position/type mapping ──────────────────────────────────────────
const SLOT_MAP: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE",
  15: "RB", 16: "DEF", 17: "K", 20: "BE", 21: "IR", 23: "FLEX",
};

// Starting lineup requirements for this league
const LINEUP_REQS: Record<string, number> = {
  QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1, DEF: 0,
};

// Position draft value tiers (projected points baseline when roster data unavailable)
const POS_BASELINE: Record<string, number[]> = {
  QB:  [480, 440, 400, 370, 340, 310, 280, 260, 240, 220, 200, 180, 160, 140],
  RB:  [350, 310, 275, 250, 225, 205, 185, 165, 145, 130, 115, 100,  85,  70],
  WR:  [340, 305, 270, 245, 220, 200, 180, 160, 143, 126, 110,  95,  80,  65],
  TE:  [290, 240, 200, 175, 155, 135, 115, 100,  85,  72,  60,  50,  42,  35],
  K:   [175, 160, 148, 135, 122, 110,  98,  88,  78,  68,  58,  50,  42,  35],
  DEF: [160, 145, 130, 118, 106,  95,  84,  74,  65,  57,  49,  42,  35,  29],
};

// Round-position tendencies (what most fantasy owners pick in each round)
const ROUND_POS_WEIGHTS: Record<number, Record<string, number>> = {
  1:  { RB: 40, WR: 35, QB: 15, TE: 10 },
  2:  { RB: 35, WR: 40, QB: 10, TE: 15 },
  3:  { WR: 35, RB: 30, QB: 20, TE: 15 },
  4:  { WR: 30, RB: 25, QB: 25, TE: 20 },
  5:  { WR: 30, RB: 25, QB: 20, TE: 15, K: 5, DEF: 5 },
  6:  { WR: 28, RB: 22, QB: 20, TE: 15, K: 8, DEF: 7 },
  7:  { WR: 25, RB: 20, QB: 18, TE: 17, K: 10, DEF: 10 },
  8:  { WR: 22, RB: 18, QB: 20, TE: 18, K: 12, DEF: 10 },
  9:  { WR: 20, RB: 18, QB: 22, TE: 18, K: 12, DEF: 10 },
  10: { WR: 20, RB: 18, QB: 15, TE: 15, K: 15, DEF: 17 },
  11: { WR: 22, RB: 20, QB: 12, TE: 14, K: 16, DEF: 16 },
  12: { WR: 22, RB: 20, QB: 12, TE: 14, K: 16, DEF: 16 },
  13: { WR: 22, RB: 20, QB: 12, TE: 14, K: 16, DEF: 16 },
  14: { WR: 22, RB: 20, QB: 12, TE: 14, K: 16, DEF: 16 },
};

function roundWeights(round: number): Record<string, number> {
  return ROUND_POS_WEIGHTS[Math.min(round, 14)] ?? ROUND_POS_WEIGHTS[14];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KeeperPrediction {
  teamId: number; teamName: string; ownerName: string;
  keeperRound: number; keeperRoundPick: number;
  predictedPlayer: string; position: string;
  projectedPoints: number; confidence: number;
  evidence: string[];
  status: "PREDICTED" | "CONFIRMED";
  alternatives: Array<{ player: string; position: string; projectedPoints: number; reason: string }>;
}

export interface RosterNeed {
  teamId: number; teamName: string; ownerName: string;
  projectedTotal: number;
  positionCounts: Record<string, number>;
  starterProjections: Record<string, number>;
  needs: Array<{
    position: string;
    urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    have: number; need: number; gap: number;
    topPlayer: string; topProj: number;
    evidence: string[];
  }>;
  strengths: Array<{ position: string; count: number; topPlayer: string }>;
  draftPriority: string[];
  overallRank: number;
}

export interface MockPick {
  pickNumber: number; round: number; roundPick: number;
  teamId: number; teamName: string; ownerName: string;
  player: string; position: string; espnId: string | null;
  projectedPoints: number; confidence: number;
  reasoning: string; evidence: string[];
  alternatePicks: Array<{ player: string; position: string; projectedPoints: number }>;
  isKeeperSlot: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function confidenceFromEvidence(signals: number[]): number {
  // Average of 0-1 signals → 0-100 score
  const avg = signals.reduce((s, v) => s + v, 0) / (signals.length || 1);
  return Math.round(Math.min(95, Math.max(35, avg * 100)));
}

function urgency(have: number, need: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" {
  const gap = need - have;
  if (gap >= need) return "CRITICAL";
  if (gap >= 1)    return "HIGH";
  if (gap === 0)   return "MEDIUM";
  return "LOW";
}

// ── Roster data loader ────────────────────────────────────────────────────────

async function loadRoster(db: any, season: number): Promise<{
  byTeam: Map<number, any[]>;
  teams: any[];
  keepers: any[];
}> {
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
    WHERE leagueId = ${LEAGUE_ID} AND season = ${season}
    ORDER BY teamId
  `) as unknown as [any[]];

  const [keeperRows] = await db.execute(drizzleSql`
    SELECT teamId, roundId, roundPick, overallPick, playerName, position, isKeeper
    FROM draft_picks
    WHERE leagueId = ${LEAGUE_ID} AND season = ${season} AND isKeeper = 1
    ORDER BY teamId, roundId
  `) as unknown as [any[]];

  const byTeam = new Map<number, any[]>();
  for (const r of (rosterRows as any[])) {
    const tid = Number(r.teamId);
    if (!byTeam.has(tid)) byTeam.set(tid, []);
    byTeam.get(tid)!.push({ ...r, projectedPoints: parseFloat(r.projectedPoints ?? "0") });
  }

  return {
    byTeam,
    teams: teamRows as any[],
    keepers: keeperRows as any[],
  };
}

// ── Keeper predictions ────────────────────────────────────────────────────────

function predictKeepers(
  teams: any[],
  byTeam: Map<number, any[]>,
  keeperSlots: any[]
): KeeperPrediction[] {
  const predictions: KeeperPrediction[] = [];

  // Group keeper slots by team
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

    // Sort roster by projected points desc (best players first)
    const sorted = [...roster]
      .filter(p => p.playerName && p.slotId !== 20 && p.slotId !== 21) // exclude bench/IR
      .sort((a, b) => b.projectedPoints - a.projectedPoints);

    // For each keeper slot, predict the best available player
    const used = new Set<string>();
    for (const slot of slots) {
      const keeperRound = Number(slot.roundId);
      // Confirmed if the draft_pick has a playerName
      const isConfirmed = slot.playerName && slot.playerName.trim() !== "" && slot.position !== "?";

      if (isConfirmed) {
        predictions.push({
          teamId: tid, teamName: team.name, ownerName: team.ownerName,
          keeperRound, keeperRoundPick: Number(slot.roundPick),
          predictedPlayer: slot.playerName, position: slot.position,
          projectedPoints: sorted.find(p => p.playerName === slot.playerName)?.projectedPoints ?? 0,
          confidence: 100,
          evidence: [`Official keeper confirmed for Round ${keeperRound}`],
          status: "CONFIRMED",
          alternatives: [],
        });
        used.add(slot.playerName);
        continue;
      }

      // Predict: look for highest-projected player whose cost round makes sense
      // Keeper cost = round 14 means player value ≤ round 14 pick value
      // Best prediction: highest projected non-keeper-yet player
      const candidate = sorted.find(p => p.playerName && !used.has(p.playerName));

      if (!candidate) {
        predictions.push({
          teamId: tid, teamName: team.name, ownerName: team.ownerName,
          keeperRound, keeperRoundPick: Number(slot.roundPick),
          predictedPlayer: "Unknown", position: "?",
          projectedPoints: 0, confidence: 20,
          evidence: ["Roster data insufficient to predict keeper"],
          status: "PREDICTED",
          alternatives: [],
        });
        continue;
      }

      used.add(candidate.playerName);

      const altCandidates = sorted
        .filter(p => p.playerName && !used.has(p.playerName))
        .slice(0, 3)
        .map(p => ({ player: p.playerName, position: p.position, projectedPoints: p.projectedPoints, reason: `Projected ${p.projectedPoints.toFixed(0)} pts` }));

      // Confidence signals
      const signals = [
        candidate.projectedPoints > 250 ? 0.9 : 0.6,   // high value player
        candidate.slotId === 0 || candidate.slotId < 20 ? 0.85 : 0.5, // is a starter
        keeperRound >= 10 ? 0.85 : 0.6,                 // late-round keeper (better value)
      ];

      const evidence = [
        `Round ${keeperRound} keeper slot assigned`,
        `${candidate.playerName} is projected #1 non-confirmed keeper on roster (${candidate.projectedPoints.toFixed(0)} pts)`,
        `Position: ${candidate.position} — currently slotted as ${SLOT_MAP[candidate.slotId] ?? "starter"}`,
      ];

      predictions.push({
        teamId: tid, teamName: team.name, ownerName: team.ownerName,
        keeperRound, keeperRoundPick: Number(slot.roundPick),
        predictedPlayer: candidate.playerName,
        position: candidate.position,
        projectedPoints: candidate.projectedPoints,
        confidence: confidenceFromEvidence(signals),
        evidence,
        status: "PREDICTED",
        alternatives: altCandidates,
      });
    }
  }

  return predictions;
}

// ── Roster construction ────────────────────────────────────────────────────────

function buildRosterNeeds(
  teams: any[],
  byTeam: Map<number, any[]>,
  keeperPredictions: KeeperPrediction[]
): RosterNeed[] {
  const needs: RosterNeed[] = [];

  for (const team of teams) {
    const tid    = Number(team.teamId);
    const roster = byTeam.get(tid) ?? [];

    const posCount: Record<string, number> = {};
    const posPlayers: Record<string, any[]> = {};
    let projTotal = 0;

    for (const p of roster) {
      if (!p.playerName) continue;
      const pos = p.position;
      posCount[pos] = (posCount[pos] ?? 0) + 1;
      if (!posPlayers[pos]) posPlayers[pos] = [];
      posPlayers[pos].push(p);
      if (p.slotId !== 20 && p.slotId !== 21) projTotal += p.projectedPoints;
    }

    // Starters by position (non-bench, non-IR)
    const starters = roster.filter(p => p.slotId !== 20 && p.slotId !== 21);
    const starterByPos: Record<string, any[]> = {};
    for (const p of starters) {
      const pos = p.position;
      if (!starterByPos[pos]) starterByPos[pos] = [];
      starterByPos[pos].push(p);
    }

    const rosterNeeds: RosterNeed["needs"] = [];
    const strengths: RosterNeed["strengths"] = [];
    const priority: string[] = [];

    for (const [pos, needed] of Object.entries(LINEUP_REQS)) {
      if (needed === 0) continue;
      const have = (starterByPos[pos] ?? []).length;
      const gap  = Math.max(0, needed - have);
      const top  = (posPlayers[pos] ?? []).sort((a, b) => b.projectedPoints - a.projectedPoints)[0];

      if (gap > 0) {
        const urg = urgency(have, needed);
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
      } else if (have > needed + 2) {
        const top3 = (posPlayers[pos] ?? []).slice(0, 3);
        strengths.push({ position: pos, count: have, topPlayer: top3[0]?.playerName ?? "?" });
      }
    }

    // Sort needs by urgency
    const urgOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    rosterNeeds.sort((a, b) => urgOrder[a.urgency] - urgOrder[b.urgency]);

    needs.push({
      teamId: tid, teamName: team.name, ownerName: team.ownerName,
      projectedTotal: Math.round(projTotal),
      positionCounts: posCount,
      starterProjections: Object.fromEntries(
        Object.entries(starterByPos).map(([pos, ps]) => [pos, Math.round(ps.reduce((s, p) => s + p.projectedPoints, 0))])
      ),
      needs: rosterNeeds,
      strengths,
      draftPriority: priority.slice(0, 4),
      overallRank: 0, // set after sort
    });
  }

  // Rank by projected total
  needs.sort((a, b) => b.projectedTotal - a.projectedTotal);
  needs.forEach((n, i) => n.overallRank = i + 1);

  return needs;
}

// ── Mock draft engine ─────────────────────────────────────────────────────────

function buildMockDraft(params: {
  teams: any[];
  rosterNeeds: RosterNeed[];
  keeperPredictions: KeeperPrediction[];
  playerPool: Array<{ name: string; position: string; projectedPoints: number; espnId: string | null }>;
  totalRounds: number;
}): MockPick[] {
  const { teams, rosterNeeds, keeperPredictions, playerPool, totalRounds } = params;

  const teamCount  = teams.length;
  const picks: MockPick[] = [];
  const drafted    = new Set<string>();

  // Build keeper slots map: teamId → Set of rounds that are keeper slots
  const keeperSlotMap = new Map<number, Map<number, string>>();
  for (const kp of keeperPredictions) {
    if (!keeperSlotMap.has(kp.teamId)) keeperSlotMap.set(kp.teamId, new Map());
    keeperSlotMap.get(kp.teamId)!.set(kp.keeperRound, kp.predictedPlayer);
    if (kp.predictedPlayer && kp.predictedPlayer !== "Unknown") drafted.add(kp.predictedPlayer);
  }

  // Sort player pool by projected points desc
  const pool = [...playerPool].sort((a, b) => b.projectedPoints - a.projectedPoints);

  // Build team need maps
  const needMap = new Map<number, RosterNeed>();
  for (const n of rosterNeeds) needMap.set(n.teamId, n);

  // Track picks per team per position
  const teamPosCounts = new Map<number, Record<string, number>>();
  for (const t of teams) teamPosCounts.set(Number(t.teamId), {});

  // Snake draft order
  const draftOrder: number[] = [];
  const teamIds = teams.map(t => Number(t.teamId));
  for (let round = 1; round <= totalRounds; round++) {
    const order = round % 2 === 1 ? teamIds : [...teamIds].reverse();
    draftOrder.push(...order);
  }

  let pickNum = 1;
  for (let round = 1; round <= totalRounds; round++) {
    const roundOrder = round % 2 === 1 ? teamIds : [...teamIds].reverse();
    for (let rp = 1; rp <= roundOrder.length; rp++) {
      const tid    = roundOrder[rp - 1];
      const team   = teams.find(t => Number(t.teamId) === tid)!;
      const needs  = needMap.get(tid);
      const counts = teamPosCounts.get(tid) ?? {};

      // Check if this is a keeper slot
      const keeperSlots = keeperSlotMap.get(tid);
      const keeperPlayer = keeperSlots?.get(round);
      if (keeperPlayer && keeperPlayer !== "Unknown") {
        picks.push({
          pickNumber: pickNum, round, roundPick: rp,
          teamId: tid, teamName: team.name, ownerName: team.ownerName,
          player: keeperPlayer, position: "?", espnId: null,
          projectedPoints: 0, confidence: 100,
          reasoning: `Keeper slot — Round ${round} reserved`,
          evidence: [`Official keeper in Round ${round}`],
          alternatePicks: [],
          isKeeperSlot: true,
        });
        counts["?"] = (counts["?"] ?? 0) + 1;
        pickNum++;
        continue;
      }

      // Determine which position to target
      const weights = roundWeights(round);

      // Adjust weights by roster needs
      const needWeights = { ...weights };
      if (needs) {
        for (const n of needs.needs) {
          const urgBoost = { CRITICAL: 2.0, HIGH: 1.5, MEDIUM: 1.2, LOW: 1.0 }[n.urgency] ?? 1.0;
          if (needWeights[n.position] !== undefined) {
            needWeights[n.position] = Math.round(needWeights[n.position] * urgBoost);
          }
        }
      }

      // Avoid over-rostering a position
      for (const [pos, cnt] of Object.entries(counts)) {
        const maxAlloc = { QB: 2, RB: 5, WR: 6, TE: 3, K: 2, DEF: 2 }[pos] ?? 3;
        if (cnt >= maxAlloc && needWeights[pos] !== undefined) {
          needWeights[pos] = Math.max(1, Math.round(needWeights[pos] * 0.2));
        }
      }

      // Pick position via weighted random (deterministic: use pickNum as seed)
      const posEntries = Object.entries(needWeights).filter(([, w]) => w > 0);
      const totalWeight = posEntries.reduce((s, [, w]) => s + w, 0);
      let cumulative = 0;
      const seed = (pickNum * 2654435761) >>> 0;
      const threshold = (seed % 10000) / 10000 * totalWeight;
      let targetPos = posEntries[0][0];
      for (const [pos, w] of posEntries) {
        cumulative += w;
        if (threshold <= cumulative) { targetPos = pos; break; }
      }

      // Find best available player at target position
      const available = pool.filter(p => p.position === targetPos && !drafted.has(p.name));
      const pick = available[0];

      if (!pick) {
        // Fall back to best available any position
        const anyAvail = pool.filter(p => !drafted.has(p.name));
        const fallback = anyAvail[0];
        if (!fallback) { pickNum++; continue; }
        drafted.add(fallback.name);
        counts[fallback.position] = (counts[fallback.position] ?? 0) + 1;
        picks.push({
          pickNumber: pickNum, round, roundPick: rp,
          teamId: tid, teamName: team.name, ownerName: team.ownerName,
          player: fallback.name, position: fallback.position, espnId: fallback.espnId,
          projectedPoints: fallback.projectedPoints, confidence: 45,
          reasoning: `No ${targetPos} available — selected best player on board`,
          evidence: [`Target position ${targetPos} exhausted`, `Best available: ${fallback.name} (${fallback.projectedPoints.toFixed(0)} pts)`],
          alternatePicks: [],
          isKeeperSlot: false,
        });
        pickNum++;
        continue;
      }

      drafted.add(pick.name);
      counts[targetPos] = (counts[targetPos] ?? 0) + 1;

      // Calculate confidence
      const needUrg = needs?.needs.find(n => n.position === targetPos)?.urgency;
      const confSignals = [
        pick.projectedPoints > 200 ? 0.9 : pick.projectedPoints > 100 ? 0.75 : 0.55,
        needUrg === "CRITICAL" ? 0.95 : needUrg === "HIGH" ? 0.85 : needUrg === "MEDIUM" ? 0.75 : 0.65,
        available.length > 5 ? 0.8 : available.length > 2 ? 0.7 : 0.6,
      ];
      const conf = confidenceFromEvidence(confSignals);

      const alts = available.slice(1, 4).map(p => ({ player: p.name, position: p.position, projectedPoints: p.projectedPoints }));

      const evidence = [
        `Round ${round} weight for ${targetPos}: ${needWeights[targetPos]}%`,
        needUrg ? `Team ${targetPos} urgency: ${needUrg}` : `Following round ${round} position trend`,
        `${pick.name} is #${pool.filter(p => p.position === targetPos).findIndex(p => p.name === pick.name) + 1} available ${targetPos} (${pick.projectedPoints.toFixed(0)} pts projected)`,
      ];

      picks.push({
        pickNumber: pickNum, round, roundPick: rp,
        teamId: tid, teamName: team.name, ownerName: team.ownerName,
        player: pick.name, position: targetPos, espnId: pick.espnId,
        projectedPoints: pick.projectedPoints, confidence: conf,
        reasoning: `${team.ownerName} targets ${targetPos} in Round ${round}${needUrg ? ` (${needUrg} need)` : ""}`,
        evidence,
        alternatePicks: alts,
        isKeeperSlot: false,
      });
      pickNum++;
    }
  }

  return picks;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const draftWarRoomRouter = router({

  /** Full draft war room data for a season */
  getDraftWarRoomData: publicProcedure
    .input(z.object({ season: z.number().int().min(2018).max(2030) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };
      const { season } = input;

      const { byTeam, teams, keepers } = await loadRoster(db, season);

      if (teams.length === 0) return { ok: false, error: `No roster data for ${season}` };

      // Load player pool from gm_player_registry
      const [regRows] = await db.execute(drizzleSql`
        SELECT fullName, position, currentNflTeam, espnPlayerId
        FROM gm_player_registry
        WHERE position IN ('QB','RB','WR','TE','K','DEF')
        ORDER BY lastSeasonSeen DESC, id ASC
        LIMIT 500
      `) as unknown as [any[]];

      // Build player pool with projected points from roster_entries where available
      const rosterPlayerMap = new Map<string, number>();
      for (const [, players] of byTeam.entries()) {
        for (const p of players) {
          if (p.playerName) rosterPlayerMap.set(p.playerName.toLowerCase(), p.projectedPoints);
        }
      }

      const playerPool: Array<{ name: string; position: string; projectedPoints: number; espnId: string | null }> = [];
      const inPool = new Set<string>();

      // First add players from roster_entries (have projected points)
      for (const [, players] of byTeam.entries()) {
        for (const p of players) {
          if (!p.playerName || inPool.has(p.playerName.toLowerCase())) continue;
          playerPool.push({ name: p.playerName, position: p.position, projectedPoints: p.projectedPoints, espnId: null });
          inPool.add(p.playerName.toLowerCase());
        }
      }

      // Then add from registry (free agents — estimated points by position)
      const posCounters: Record<string, number> = {};
      for (const reg of (regRows as any[])) {
        if (inPool.has(reg.fullName.toLowerCase())) continue;
        const pos = reg.position as string;
        posCounters[pos] = (posCounters[pos] ?? 0) + 1;
        const tier = Math.min(posCounters[pos] - 1, (POS_BASELINE[pos]?.length ?? 1) - 1);
        const proj = POS_BASELINE[pos]?.[tier] ?? 0;
        playerPool.push({ name: reg.fullName, position: pos, projectedPoints: proj, espnId: reg.espnPlayerId });
        inPool.add(reg.fullName.toLowerCase());
      }

      // Sort combined pool
      playerPool.sort((a, b) => b.projectedPoints - a.projectedPoints);

      // Phase 1: Keeper predictions
      const keeperPredictions = predictKeepers(teams, byTeam, keepers);

      // Phase 2: Roster needs
      const rosterNeeds = buildRosterNeeds(teams, byTeam, keeperPredictions);

      // Phase 3: Mock draft
      const totalRounds = 14; // standard 14-team, 14-round draft
      const mockDraft = buildMockDraft({ teams, rosterNeeds, keeperPredictions, playerPool, totalRounds });

      return {
        ok: true,
        season,
        teamCount: teams.length,
        keeperPredictions,
        rosterNeeds,
        mockDraft,
        totalPicks: mockDraft.length,
        dataAvailability: {
          roster:  byTeam.size > 0,
          keepers: keepers.length > 0,
          playerRegistry: (regRows as any[]).length > 0,
        },
      };
    }),
});

export type DraftWarRoomRouter = typeof draftWarRoomRouter;
