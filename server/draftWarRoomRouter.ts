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
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, resolvePremiumAccess } from "./_core/trpc";
import { getDb, resolveActiveLeagueId, getCachedView } from "./db";
import { sql as drizzleSql }       from "drizzle-orm";
import {
  calcKeeperCompression, calcScarcityAlerts, calcPositionRunAlerts,
  calcDraftBoardPressure, buildDraftEnvironmentDashboard,
} from "./draftWarRoomPhase175";
import { resolveKeeperDraftGeometryForSeason } from "./keeperDraftGeometry";
import { enrichDraftPickDbRow, summarizeDraftBoardCounts } from "./draftWarRoomPickClassification";
import { buildLeagueCapabilities } from "./leagueCapabilities";
// Phase 1 foundation: Draft War Room consumes the platform's authoritative engines only.
import { getEspnPlayerInfoMap, getEspnDefensiveInfoMap } from "./playerStatsRouter";          // real ADP + projection + percentStarted (single ESPN source) + IDP feed
import { computeMarketValues, type MarketValueInput } from "./marketValue"; // sole player-value engine (0–100)
import { rosterRulesFromLineupSlotCounts } from "./draftEngine/phase5/leagueRosterRules";
import { computeKeeperValuations, type KeeperPoolRowLite } from "./keeperValuationService"; // sole keeper engine
import { getManualKeeperSelections } from "./manualKeeperSelections"; // user keeper overrides (degrades safely if table absent)
import { computeLeaguePositionTimingProfiles, type PositionTimingProfile } from "./leagueDraftTimingProfile";
import { buildDraftDecisionFromResolvedPick } from "./draftDecisionBridge";
import {
  evaluateDpDraftability,
  evaluateDpNeedReachGuard,
  isDpWindowOpen,
  type PickIntelligence,
} from "./draftPickIntelligence";
import {
  evaluateCloseDecisionGate,
  evaluateOwnerDnaNudge,
  loadOwnerDraftDnaContext,
  normOwnerKey,
  OFFENSE_DNA_POSITIONS,
  ownerDnaDecayMultiplier,
  resolveOwnerDnaModel,
  type DraftPoolPlayer,
  type OwnerDraftDnaContext,
} from "./ownerDraftDnaModel";
import type { OwnerDraftDnaTuning } from "./ownerDraftDnaTuning";

// Phase B1: LEAGUE_ID constant removed — leagueId is resolved per-request via resolveActiveLeagueId.

/** League rule: no draft history row for player → keeper cost defaults to this round (not draft slot roundId). */
const DEFAULT_KEEPER_ROUND = 7;

// ── Slot → position ───────────────────────────────────────────────────────────
const SLOT_MAP: Record<number, string> = {
  0: "QB", 2: "RB", 4: "WR", 6: "TE",
  15: "RB", 16: "DEF", 17: "K", 20: "BE", 21: "IR", 23: "FLEX",
};

const LINEUP_REQS: Record<string, number> = {
  QB: 1, RB: 1, WR: 2, TE: 1, FLEX: 2, DP: 1, K: 1,
  // This league starts an individual defensive player in a DP slot (ESPN slot 15), not team D/ST.
  // IDP positions (DL/LB/DB/S/CB/DE/DT) are normalized to "DP" in the draft pool so they fill it.
};

// Every individual-defensive position fills the single DP lineup slot — collapse them to "DP"
// for the draft pool so the DP need is matched and drafted like any other slot.
const IDP_POSITIONS = new Set(["DL", "LB", "DB", "S", "CB", "DE", "DT"]);
const normalizeDraftPos = (pos: string): string => (IDP_POSITIONS.has(pos) ? "DP" : pos);

// Per-league starting lineup. Reuses the exact ESPN-slot parser the souls engine uses, so non-IDP
// leagues (e.g. team D/ST) no longer inherit the hardcoded IDP "DP" slot. SAFE BY DESIGN: the
// primary league (457622) always keeps the hardcoded LINEUP_REQS, and any league whose settings
// don't parse cleanly falls back to it too — so nothing changes for leagues that work today.
function leagueLineupReqs(leagueId: string, payload: Record<string, unknown> | null): Record<string, number> {
  if (String(leagueId) === "457622") return LINEUP_REQS; // primary league: untouched, guaranteed
  const counts = (payload as any)?.settings?.rosterSettings?.lineupSlotCounts;
  if (!counts) return LINEUP_REQS;
  try {
    const s = rosterRulesFromLineupSlotCounts({ leagueId: String(leagueId), lineupSlotCounts: counts }).starters;
    if (!(s.QB > 0 && s.WR > 0 && s.TE > 0)) return LINEUP_REQS; // degenerate parse → fall back, don't touch
    const reqs: Record<string, number> = { QB: s.QB, RB: s.RB, WR: s.WR, TE: s.TE, FLEX: s.FLEX, K: s.K };
    if (s.DP > 0) reqs.DP = s.DP;   // IDP league
    if (s.DST > 0) reqs.DEF = s.DST; // team D/ST league (Teco's): key under "DEF" so the pool/need/cap/counts (which use the registry's "DEF" label) all reconcile — DEF players satisfy the team-defense requirement
    return reqs;
  } catch {
    return LINEUP_REQS;
  }
}

// Phase 1 foundation cleanup: the hardcoded value tables (POS_ROUND_VALUE, POS_SCARCITY,
// ROUND_POS_WEIGHTS, VBD_BASELINE), vorp(), roundWeights(), and calcKVS() were REMOVED.
// Player value now comes from computeMarketValues; keeper value from computeKeeperValuations;
// ADP + projection from getEspnPlayerInfoMap. No parallel valuation logic lives here anymore.

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
  teams: any[],
): TradedPickInfo[] {
  const teamIds = teams.map(t => Number(t.teamId));
  const totalRounds = picks.length > 0 ? Math.max(...picks.map(p => p.roundId), 1) : 1;
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
  bestKeeperValue:   { teamName: string; ownerName: string; player: string; recommendation: string; valueTier: string; roundSavings: number | null; marketValue: number | null; reason: string } | null;
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

  // Best keeper value = best keeperValuationService valuation among predicted keepers.
  const rankedKeepers = keeperPredictions
    .filter((k: any) => k.predictedPlayer && k.predictedPlayer !== "Unknown" && k.roundSavings != null)
    .sort((a: any, b: any) => (b.roundSavings - a.roundSavings) || ((b.marketValue ?? 0) - (a.marketValue ?? 0)));
  const bk = rankedKeepers[0];
  const bestKeeperValue = bk ? {
    teamName: bk.teamName, ownerName: bk.ownerName,
    player: bk.predictedPlayer,
    recommendation: bk.recommendation, valueTier: bk.valueTier,
    roundSavings: bk.roundSavings, marketValue: bk.marketValue,
    reason: bk.explanation,
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

async function loadRoster(db: any, season: number, leagueId: string) {
  const [rosterRows] = await db.execute(drizzleSql`
    SELECT r.teamId, r.playerName, r.position, r.slotId,
           r.projectedPoints, r.injuryStatus, r.acquisitionType,
           t.name as teamName, t.ownerName
    FROM roster_entries r
    JOIN teams t ON t.leagueId = r.leagueId AND t.season = r.season AND t.teamId = r.teamId
    WHERE r.leagueId = ${leagueId} AND r.season = ${season} AND r.week = 0
    ORDER BY r.teamId, r.projectedPoints DESC
  `) as unknown as [any[]];

  const [teamRows] = await db.execute(drizzleSql`
    SELECT teamId, name, ownerName FROM teams
    WHERE leagueId = ${leagueId} AND season = ${season} ORDER BY teamId
  `) as unknown as [any[]];

  // §9.1 off-season owner-name carry-forward: in the off-season the draft season's `teams`
  // rows have blank ownerName/ownerId (rosters not yet assigned). Resolve each team's name
  // from the most recent season that HAS a populated ownerName for the same teamId — the
  // authoritative `teams.ownerName` (API era, 2018+) — so downstream consumers (shock meters /
  // Owner DNA Snapshot) never render the literal "Owner". Only blanks are filled; in-season
  // names are left untouched.
  const [ownerNameHistory] = await db.execute(drizzleSql`
    SELECT teamId, ownerName FROM teams
    WHERE leagueId = ${leagueId} AND ownerName IS NOT NULL AND ownerName != ''
    ORDER BY season DESC
  `) as unknown as [any[]];
  const latestOwnerByTeam = new Map<number, string>();
  for (const r of (ownerNameHistory as any[])) {
    const tid = Number(r.teamId);
    if (!latestOwnerByTeam.has(tid)) latestOwnerByTeam.set(tid, String(r.ownerName));
  }
  const fillOwnerName = (teamId: unknown, current: unknown): string => {
    const cur = String(current ?? "").trim();
    return cur || latestOwnerByTeam.get(Number(teamId)) || "";
  };
  for (const t of (teamRows as any[])) { t.ownerName = fillOwnerName(t.teamId, t.ownerName); }
  for (const r of (rosterRows as any[])) { r.ownerName = fillOwnerName(r.teamId, r.ownerName); }

  const [seasonPickRows] = await db.execute(drizzleSql`
    SELECT teamId, roundId, roundPick, overallPick, playerName, position, isKeeper, rawPick
    FROM draft_picks
    WHERE leagueId = ${leagueId} AND season = ${season}
    ORDER BY overallPick
  `) as unknown as [Record<string, unknown>[]];

  const allPickRows = (seasonPickRows as Record<string, unknown>[]).map((r) => enrichDraftPickDbRow(r));
  const keeperRows = allPickRows.filter((r) => r.keeperSlot);

  // Prior year roster for keeper repeat detection
  const [prevRosterRows] = await db.execute(drizzleSql`
    SELECT r.teamId, r.playerName
    FROM roster_entries r
    WHERE r.leagueId = ${leagueId} AND r.season = ${season - 1} AND r.week = 0
      AND r.playerName IS NOT NULL AND r.playerName != ''
  `) as unknown as [any[]];
  const prevByTeam = new Map<number, Set<string>>();
  for (const p of (prevRosterRows as any[])) {
    const tid = Number(p.teamId);
    if (!prevByTeam.has(tid)) prevByTeam.set(tid, new Set());
    prevByTeam.get(tid)!.add(String(p.playerName).toLowerCase().trim());
  }

  // Draft round history: open-draft (analytics) rows only — not keeper/retained board slots
  const [histPicks] = await db.execute(drizzleSql`
    SELECT playerName, roundId, season, rawPick, isKeeper
    FROM draft_picks
    WHERE leagueId = ${leagueId}
      AND playerName IS NOT NULL AND playerName != ''
    ORDER BY season DESC
  `) as unknown as [Record<string, unknown>[]];
  const playerDraftRoundMap = new Map<string, number>();
  for (const p of histPicks as Record<string, unknown>[]) {
    const t = enrichDraftPickDbRow(p);
    if (!t.draftedForAnalytics) continue;
    const key = String(p.playerName).toLowerCase().trim();
    if (!key || playerDraftRoundMap.has(key)) continue;
    playerDraftRoundMap.set(key, Number(p.roundId));
  }

  // Consecutive keeper check: keeper-slot rows (keeper + retained) in recent seasons
  const [keeperHistRows] = await db.execute(drizzleSql`
    SELECT playerName, season, rawPick, isKeeper FROM draft_picks
    WHERE leagueId = ${leagueId} AND season >= ${season - 2}
  `) as unknown as [Record<string, unknown>[]];
  const keptByYear = new Map<number, Set<string>>();
  for (const row of keeperHistRows as Record<string, unknown>[]) {
    const t = enrichDraftPickDbRow(row);
    if (!t.keeperSlot) continue;
    const yr = Number((row as any).season);
    if (!keptByYear.has(yr)) keptByYear.set(yr, new Set());
    keptByYear.get(yr)!.add(String((row as any).playerName).toLowerCase().trim());
  }
  const yr1kept = keptByYear.get(season - 1) ?? new Set<string>();
  const yr2kept = keptByYear.get(season - 2) ?? new Set<string>();
  const consecutiveKeptPlayers = new Set<string>([...yr1kept].filter(n => yr2kept.has(n)));

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
    prevByTeam,
    playerDraftRoundMap,
    consecutiveKeptPlayers,  // players kept 2 years straight — ineligible this year
  };
}

// ── Keeper predictions (Phase 1.5: with KVS) ─────────────────────────────────
// keeperRound = keeper *cost* (draft round from history or default R7), never the 2026 draft board slot.
// Positions eligible to be kept. K and DEF/D/ST are NEVER keeper candidates.
const KEEPER_ELIGIBLE_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
// keeperSlotRound = ESPN's current-season keeper-slot round (informational only). The mock
// draft slots keepers by keeperRound (the round drafted previously), NOT by keeperSlotRound.

async function predictKeepers(
  teams: any[],
  byTeam: Map<number, any[]>,
  keeperSlots: any[],
  playerDraftRoundMap: Map<string, number>,
  prevByTeam: Map<number, Set<string>>,
  consecutiveKeptPlayers: Set<string>,
  nameToPlayerId: Map<string, number>,
  espnAdpByPlayerId: Map<number, number | null>,
  season: number,
  leagueId: string,
  userId: number | undefined,
  teamCount: number,
) {
  const nameKey = (n: string) => n.toLowerCase().trim();
  const slotsByTeam = new Map<number, any[]>();
  for (const k of keeperSlots) {
    const tid = Number(k.teamId);
    if (!slotsByTeam.has(tid)) slotsByTeam.set(tid, []);
    slotsByTeam.get(tid)!.push(k);
  }

  // Keeper cost: league draft history → real ESPN ADP round (by playerId) → default R7.
  const inferAdpRound = (name: string): number | null => {
    const pid = nameToPlayerId.get(nameKey(name));
    const adp = pid != null ? espnAdpByPlayerId.get(pid) ?? null : null;
    if (!adp || adp <= 0) return null;
    return Math.min(teamCount, Math.max(1, Math.ceil(adp / teamCount)));
  };
  const costFor = (name: string): { cost: number; source: string } => {
    const actual = playerDraftRoundMap.get(nameKey(name));
    if (actual != null) return { cost: actual, source: "history" };
    const adpR = inferAdpRound(name);
    if (adpR != null) return { cost: adpR, source: "adp" };
    return { cost: DEFAULT_KEEPER_ROUND, source: "default" };
  };

  type Cand = {
    tid: number; ownerName: string; teamName: string; playerName: string; position: string;
    slotId: number; projectedPoints: number; cost: number; costSource: string;
    wasKeptLastYear: boolean; playerId: number | null;
  };
  const candsByTeam = new Map<number, Cand[]>();
  const poolRows: KeeperPoolRowLite[] = [];
  const seenPid = new Set<number>();
  const pushPool = (pid: number | null, name: string, pos: string, tid: number, owner: string, nflTeam: string, cost: number) => {
    if (pid != null && pid > 0 && !seenPid.has(pid)) {
      seenPid.add(pid);
      poolRows.push({ playerId: pid, playerName: name, ownerKey: `team:${tid}`, ownerName: owner, position: pos, nflTeam, keeperRoundCost: cost });
    }
  };

  // 1) Every keeper-eligible roster player across the league, with cost + identity.
  for (const team of teams) {
    const tid = Number(team.teamId);
    const roster = byTeam.get(tid) ?? [];
    const prevRoster = prevByTeam.get(tid) ?? new Set<string>();
    const list: Cand[] = [];
    for (const p of roster) {
      if (!p.playerName) continue;
      if (!KEEPER_ELIGIBLE_POSITIONS.has(p.position)) continue; // no K/DEF/IDP keepers
      if (p.slotId === 20 || p.slotId === 21) continue;          // no bench/IR
      if (!(p.projectedPoints > 0)) continue;
      if (consecutiveKeptPlayers.has(nameKey(p.playerName))) continue; // max 2 straight
      const { cost, source } = costFor(p.playerName);
      const pid = nameToPlayerId.get(nameKey(p.playerName)) ?? null;
      list.push({
        tid, ownerName: team.ownerName, teamName: team.name,
        playerName: p.playerName, position: p.position, slotId: p.slotId,
        projectedPoints: p.projectedPoints, cost, costSource: source,
        wasKeptLastYear: prevRoster.has(nameKey(p.playerName)), playerId: pid,
      });
      pushPool(pid, p.playerName, p.position, tid, team.ownerName, String(p.nflTeam ?? ""), cost);
    }
    candsByTeam.set(tid, list);
    // Confirmed keepers may be excluded from candidates (already kept) — value them too.
    for (const slot of slotsByTeam.get(tid) ?? []) {
      if (slot.playerName?.trim() && slot.position !== "?") {
        const pid = nameToPlayerId.get(nameKey(slot.playerName)) ?? null;
        pushPool(pid, slot.playerName, slot.position, tid, team.ownerName, "", costFor(slot.playerName).cost);
      }
    }
  }

  // 2) Sole keeper engine — value every eligible player via keeperValuationService (by playerId).
  type KV = Awaited<ReturnType<typeof computeKeeperValuations>>[number];
  let valByPid = new Map<number, KV>();
  if (poolRows.length > 0) {
    const vals = await computeKeeperValuations({ pool: poolRows, season, leagueId, userId, leagueSize: teamCount });
    valByPid = new Map(vals.map((v) => [v.playerId, v]));
  }

  const valFields = (pid: number | null) => {
    const v = pid != null ? valByPid.get(pid) : undefined;
    return {
      recommendation: v?.recommendation ?? "Unrated",
      valueTier: v?.valueTier ?? "borderline",
      roundSavings: v?.roundSavings ?? null,
      marketValue: v?.marketValue ?? null,
      adp: v?.adp ?? null,
      adpRound: v?.adpRound ?? null,
      explanation: v?.explanation ?? "No keeper valuation available.",
    };
  };
  const rsOf = (c: Cand) => (c.playerId != null ? valByPid.get(c.playerId)?.roundSavings ?? -Infinity : -Infinity);
  const mvOf = (c: Cand) => (c.playerId != null ? valByPid.get(c.playerId)?.marketValue ?? -Infinity : -Infinity);
  const sortCands = (arr: Cand[]) =>
    [...arr].sort((a, b) => {
      const ra = rsOf(a), rb = rsOf(b);
      if (rb !== ra) return rb - ra;
      const ma = mvOf(a), mb = mvOf(b);
      if (mb !== ma) return mb - ma;
      return b.projectedPoints - a.projectedPoints;
    });
  const tierConf = (tier: string) =>
    tier === "elite" ? 0.92 : tier === "strong" ? 0.82 : tier === "viable" ? 0.7 : tier === "pass" ? 0.45 : 0.6;
  const costEvidence = (source: string, cost: number) =>
    source === "history" ? `Drafted Round ${cost} (from league history)`
      : source === "adp" ? `Keeper cost inferred from real ADP → Round ${cost}`
      : `No draft history — keeper cost defaults to Round ${DEFAULT_KEEPER_ROUND}`;
  const altOf = (c: Cand) => {
    const vf = valFields(c.playerId);
    return { player: c.playerName, position: c.position, projectedPoints: c.projectedPoints, recommendation: vf.recommendation, valueTier: vf.valueTier, roundSavings: vf.roundSavings, keeperRound: c.cost, reason: vf.explanation };
  };

  // ── Manual keeper override ──────────────────────────────────────────────────
  // If the user has manually marked keepers, those WIN over predicted keepers for
  // that team — matched by playerId via the eligible pool (never by ownerKey, whose
  // convention differs between Keeper Advisor and the War Room). Teams with no manual
  // selection fall through to the predicted logic below, unchanged.
  const manualSels = await getManualKeeperSelections({ userId, leagueId, season });
  const manualPickByPid = new Map<number, number>();
  for (const s of manualSels) manualPickByPid.set(s.playerId, s.keeperRoundPick ?? 0);
  const poolByPid = new Map(poolRows.map((r) => [r.playerId, r]));
  const manualByTid = new Map<number, number[]>();
  for (const s of manualSels) {
    const pid = s.playerId;
    const row = poolByPid.get(pid);
    if (!row) continue;
    const mtid = Number(String(row.ownerKey).replace("team:", ""));
    if (!Number.isFinite(mtid)) continue;
    if (!manualByTid.has(mtid)) manualByTid.set(mtid, []);
    manualByTid.get(mtid)!.push(pid);
  }

  const predictions: any[] = [];
  for (const team of teams) {
    const tid = Number(team.teamId);
    const slots = slotsByTeam.get(tid);
    const cands = candsByTeam.get(tid) ?? [];

    // Manual selections fully replace predicted keepers for this team (override).
    const manualForTeam = manualByTid.get(tid);
    if (manualForTeam && manualForTeam.length > 0) {
      for (const pid of manualForTeam) {
        const row = poolByPid.get(pid);
        if (!row) continue;
        const vf = valFields(pid);
        predictions.push({
          teamId: tid, teamName: team.name, ownerName: team.ownerName, playerId: pid,
          keeperRound: row.keeperRoundCost, keeperSlotRound: null, keeperRoundPick: manualPickByPid.get(pid) ?? 0,
          predictedPlayer: row.playerName, position: row.position,
          projectedPoints: 0, ...vf,
          wasKeptLastYear: false, draftRoundSource: "manual", confidence: 100,
          evidence: ["Manual keeper selection (your override)", vf.explanation].filter(Boolean),
          status: "MANUAL" as const,
          alternatives: [],
          hasOfficialSlot: false,
        });
      }
      continue;
    }

    if (slots?.length) {
      const used = new Set<string>();
      for (const slot of slots) {
        const keeperSlotRound = Number(slot.roundId);
        const isConfirmed = slot.playerName?.trim() && slot.position !== "?";
        if (isConfirmed) {
          const pid = nameToPlayerId.get(nameKey(slot.playerName)) ?? null;
          const vf = valFields(pid);
          const actualRound = playerDraftRoundMap.get(nameKey(slot.playerName)) ?? DEFAULT_KEEPER_ROUND;
          const hist = playerDraftRoundMap.has(nameKey(slot.playerName));
          predictions.push({
            teamId: tid, teamName: team.name, ownerName: team.ownerName, playerId: pid,
            keeperRound: actualRound, keeperSlotRound, keeperRoundPick: Number(slot.roundPick),
            predictedPlayer: slot.playerName, position: slot.position,
            projectedPoints: 0, confidence: 100, ...vf,
            draftRoundSource: hist ? "history" : "default",
            evidence: ["Official keeper confirmed", costEvidence(hist ? "history" : "default", actualRound), vf.explanation].filter(Boolean),
            status: "CONFIRMED", alternatives: [], hasOfficialSlot: true,
          });
          used.add(slot.playerName);
          continue;
        }

        const ranked = sortCands(cands.filter((c) => !used.has(c.playerName)));
        const best = ranked[0];
        if (!best) {
          predictions.push({
            teamId: tid, teamName: team.name, ownerName: team.ownerName, playerId: null,
            keeperRound: DEFAULT_KEEPER_ROUND, keeperSlotRound, keeperRoundPick: Number(slot.roundPick),
            predictedPlayer: "Unknown", position: "?", projectedPoints: 0, confidence: 20,
            recommendation: "Unrated", valueTier: "borderline", roundSavings: null, marketValue: null, adp: null, adpRound: null,
            explanation: "Insufficient roster data.",
            evidence: ["Insufficient roster data"], status: "PREDICTED", alternatives: [], hasOfficialSlot: true,
          });
          continue;
        }
        used.add(best.playerName);
        const vf = valFields(best.playerId);
        const confidence = Math.round(Math.min(95, Math.max(35, ((tierConf(vf.valueTier) + (best.slotId < 20 ? 0.85 : 0.55) + (best.wasKeptLastYear ? 0.9 : 0.65)) / 3) * 100)));
        predictions.push({
          teamId: tid, teamName: team.name, ownerName: team.ownerName, playerId: best.playerId,
          keeperRound: best.cost, keeperSlotRound, keeperRoundPick: Number(slot.roundPick),
          predictedPlayer: best.playerName, position: best.position,
          projectedPoints: best.projectedPoints, ...vf,
          wasKeptLastYear: best.wasKeptLastYear, draftRoundSource: best.costSource, confidence,
          evidence: [
            costEvidence(best.costSource, best.cost),
            best.wasKeptLastYear ? "Was on this roster last season — repeat keeper signal" : "",
            vf.explanation,
            `Selected over ${ranked.length - 1} other candidates`,
          ].filter(Boolean),
          status: "PREDICTED" as const,
          alternatives: ranked.slice(1, 4).map(altOf),
          hasOfficialSlot: true,
        });
      }
    } else {
      const ranked = sortCands(cands);
      const best = ranked[0];
      if (!best) continue;
      const vf = valFields(best.playerId);
      const confidence = Math.round(Math.min(85, Math.max(25, ((tierConf(vf.valueTier) + (best.wasKeptLastYear ? 0.8 : 0.5) + 0.55) / 3) * 100)));
      predictions.push({
        teamId: tid, teamName: team.name, ownerName: team.ownerName, playerId: best.playerId,
        keeperRound: best.cost, keeperSlotRound: null, keeperRoundPick: 0,
        predictedPlayer: best.playerName, position: best.position,
        projectedPoints: best.projectedPoints, ...vf,
        wasKeptLastYear: best.wasKeptLastYear, draftRoundSource: best.costSource, confidence,
        evidence: [
          "Hypothetical — no official keeper slot this team",
          costEvidence(best.costSource, best.cost),
          best.wasKeptLastYear ? "Was on this roster last season" : "",
          vf.explanation,
        ].filter(Boolean),
        status: "HYPOTHETICAL" as const,
        alternatives: ranked.slice(1, 3).map(altOf),
        hasOfficialSlot: false,
      });
    }
  }
  return predictions;
}

// ── Roster needs ──────────────────────────────────────────────────────────────

function buildRosterNeeds(teams: any[], byTeam: Map<number, any[]>, keeperPredictions: any[], lineupReqs: Record<string, number> = LINEUP_REQS) {
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
      // Count IDP starters (LB/DL/DB/S/CB/DE/DT) toward the single DP requirement: a rostered
      // defender satisfies the DP starter slot, so the DP need no longer reads as CRITICAL.
      const sp = normalizeDraftPos(p.position);
      if (!starterByPos[sp]) starterByPos[sp] = [];
      starterByPos[sp].push(p);
    }

    const rosterNeeds: any[] = [];
    const strengths: any[] = [];
    const priority: string[] = [];

    for (const [pos, needed] of Object.entries(lineupReqs)) {
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
      draftPriority: priority.slice(0, 4),
      allPlayers: [...roster]
        .filter(p => p.playerName && p.slotId !== 20 && p.slotId !== 21)
        .map((p: any) => p.playerName as string),
      overallRank: 0,
    });
  }

  needs.sort((a, b) => b.projectedTotal - a.projectedTotal);
  needs.forEach((n, i) => n.overallRank = i + 1);
  return needs;
}

// ── Mock draft ────────────────────────────────────────────────────────────────

export type MockDraftInputs = {
  allPicks: any[];
  rosterNeeds: any[];
  keeperPredictions: any[];
  tradedPicks: TradedPickInfo[];
  playerPool: Array<{
    name: string;
    position: string;
    projectedPoints: number;
    espnId: string | null;
    adp: number | null;
    marketValue: number | null;
  }>;
  /** Phase 1 league-intelligence: DP timing baseline from draft history. */
  dpTiming?: PositionTimingProfile | null;
  /** Phase 2a: probabilistic owner offense tendencies (QB/RB/WR/TE). */
  ownerDnaContext?: OwnerDraftDnaContext | null;
  /** Validation harness — tuning override (ignored by production mock path when unset). */
  dnaTuning?: OwnerDraftDnaTuning;
  /** Validation harness — reproducible stochastic draws. */
  stochasticSeed?: number;
  /** Fixture metadata for simulation replay. */
  registryPlayerCount?: number;
  /** Per-league starting-lineup requirements (drives position caps). Defaults to the hardcoded
   *  457622 table when unset, so leagues that work today are unchanged. */
  lineupReqs?: Record<string, number>;
};

// ── Roster-completion guarantee ────────────────────────────────────────────────
// A mock roster may not finish with an unfilled required STARTING slot while an eligible player
// remains available. When a team's remaining open picks all have to go to required starters
// (deficit >= remaining picks), we force the best-available player at an unfilled required position.
const FLEX_ELIGIBLE = new Set(["RB", "WR", "TE"]);
const NON_STARTER_SLOTS = new Set(["FLEX", "BENCH", "BE", "IR", "OP"]);
const normReqPos = (p: string): string => {
  const u = String(p ?? "").toUpperCase();
  return u === "DST" || u === "D/ST" ? "DEF" : u;
};

export function evaluateRosterCompletion(args: {
  counts: Record<string, number>;
  lineupReqs: Record<string, number>;
  undrafted: Array<{ name: string; position: string; adp: number | null }>;
  remainingOpenPicks: number;
}): { player: any; position: string; reason: string } | null {
  const { counts, lineupReqs, undrafted, remainingOpenPicks } = args;

  // Per-position required starters (excluding the FLEX meta-slot and bench/IR).
  const unfilled: string[] = [];
  let baseDeficit = 0;
  for (const [posRaw, reqRaw] of Object.entries(lineupReqs)) {
    const pos = normReqPos(posRaw);
    if (NON_STARTER_SLOTS.has(pos)) continue;
    const d = Math.max(0, (Number(reqRaw) || 0) - (counts[pos] ?? 0));
    if (d > 0) { baseDeficit += d; unfilled.push(pos); }
  }
  // FLEX slots are filled by RB/WR/TE beyond their per-position minimums.
  const flexReq = Number(lineupReqs.FLEX ?? 0);
  let flexSurplus = 0;
  for (const pos of FLEX_ELIGIBLE) flexSurplus += Math.max(0, (counts[pos] ?? 0) - (Number((lineupReqs as Record<string, number>)[pos]) || 0));
  const flexDeficit = Math.max(0, flexReq - flexSurplus);
  const totalDeficit = baseDeficit + flexDeficit;

  // Only force when every remaining pick is needed to fill a required starter.
  if (totalDeficit <= 0 || totalDeficit < remainingOpenPicks) return null;

  const wanted = new Set(unfilled);
  let candidates = undrafted.filter((p) => wanted.has(normReqPos(p.position)));
  let label = [...wanted].join("/");
  if (candidates.length === 0 && flexDeficit > 0) {
    candidates = undrafted.filter((p) => FLEX_ELIGIBLE.has(normReqPos(p.position)));
    label = "FLEX";
  }
  if (candidates.length === 0) return null; // no eligible player available — fail honestly, don't corrupt the draft

  const best = candidates[0]; // undrafted is ADP/board-ordered → best available first
  return {
    player: best,
    position: best.position,
    reason: `required starter had to be filled because remaining starter needs (${totalDeficit}) equaled remaining picks (${remainingOpenPicks}) — filled ${label}`,
  };
}

export function buildMockDraft(params: MockDraftInputs) {
  const { allPicks, rosterNeeds, keeperPredictions, tradedPicks, playerPool, dpTiming = null, ownerDnaContext = null, lineupReqs = LINEUP_REQS } = params;
  const picks: any[] = [];
  const drafted = new Set<string>();

  // Pre-mark keeper players — removed from the draftable pool by playerId (never by name).
  const keeperPlayerIds = new Set<number>();
  // Resolve each keeper to the EXACT pick it occupies in its cost round, clamped to what the team
  // actually holds. 0 = Auto → later / less valuable pick; N>0 → the explicit Nth pick. This lets a
  // keeper sit on, e.g., the team's 2nd 2nd-round pick when they hold two picks in that round.
  const teamRoundPicksSorted = new Map<string, number[]>(); // "team_round" -> [overallPick asc]
  for (const dp of allPicks) {
    const k = `${Number(dp.teamId)}_${Number(dp.roundId)}`;
    const arr = teamRoundPicksSorted.get(k) ?? [];
    arr.push(Number(dp.overallPick));
    teamRoundPicksSorted.set(k, arr);
  }
  for (const arr of teamRoundPicksSorted.values()) arr.sort((a, b) => a - b);
  const keeperByOverallPick = new Map<number, string>(); // overallPick -> keeper player name
  for (const kp of keeperPredictions) {
    if (!kp.predictedPlayer || kp.predictedPlayer === "Unknown") continue;
    if (kp.playerId != null) keeperPlayerIds.add(Number(kp.playerId));
    const slotR = Number(kp.keeperRound);
    const arr = teamRoundPicksSorted.get(`${kp.teamId}_${slotR}`);
    if (!arr || arr.length === 0) continue;
    // 0/auto → the team's LATER (less-valuable) pick in the round; N>0 → the explicit Nth pick.
    const explicit = Number(kp.keeperRoundPick) || 0;
    const ordinal = explicit > 0 ? Math.min(explicit, arr.length) : arr.length;
    keeperByOverallPick.set(arr[ordinal - 1], kp.predictedPlayer);
  }

  // Only draft players at positions the league actually rosters. At draft time every starting
  // slot surfaces as a need, so the union of need positions IS the league's position set — this
  // drops team D/ST in leagues that don't roster it (e.g. IDP leagues), which otherwise leaked in
  // as late-round filler. FLEX implies RB/WR/TE are draftable.
  const leaguePositions = new Set<string>();
  for (const t of rosterNeeds) for (const n of (t.needs || [])) leaguePositions.add(String(n.position));
  if (leaguePositions.has("FLEX")) { leaguePositions.add("RB"); leaguePositions.add("WR"); leaguePositions.add("TE"); }
  const draftablePool = leaguePositions.size > 0
    ? playerPool.filter(p => leaguePositions.has(String(p.position)))
    : playerPool;
  const pool = [...draftablePool]; // already ordered by real ESPN ADP upstream (nulls last); do not re-sort
  const needMap = new Map(rosterNeeds.map(n => [n.teamId, n]));
  const teamPosCounts = new Map<number, Record<string, number>>();
  for (const p of allPicks) teamPosCounts.set(Number(p.teamId), {});
  // Per-team OPEN-draft picks (keeper-assigned slots excluded) — powers the roster-completion guarantee.
  const teamOpenPicks = new Map<number, number[]>();
  for (const p of allPicks) {
    const op = Number(p.overallPick);
    if (keeperByOverallPick.has(op)) continue;
    const arr = teamOpenPicks.get(Number(p.teamId)) ?? [];
    arr.push(op);
    teamOpenPicks.set(Number(p.teamId), arr);
  }
  /** Phase 2a: consecutive applied DNA nudges per owner (resets on value pick). */
  const ownerDnaNudgeStreak = new Map<string, number>();

  // Traded pick context
  const tradedPickMap = new Map<string, TradedPickInfo>();
  for (const tp of tradedPicks) {
    if (tp.pickNumber) tradedPickMap.set(`${tp.round}_${tp.teamId}`, tp);
  }

  // Total rounds in the draft — used for starter-aware position caps (backup QB, K, DEF come late).
  const maxRound = Math.max(1, ...allPicks.map((p: any) => Number(p.roundId) || 1));

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

    // Keeper slot? — this specific overall pick is a keeper's assigned pick.
    const keeperPlayer = keeperByOverallPick.get(pickNum);
    if (keeperPlayer && keeperPlayer !== "Unknown") {
      const kp = keeperPredictions.find(k =>
        k.teamId === tid && k.predictedPlayer === keeperPlayer,
      );
      const tradeCtx = tradedPickMap.get(`${round}_${tid}`);
      const keeperDecision = buildDraftDecisionFromResolvedPick({
        pickNum,
        round,
        ownerName,
        teamName,
        pick: {
          name: keeperPlayer,
          position: kp?.position ?? "?",
          adp: null,
          projectedPoints: kp?.projectedPoints ?? 0,
          marketValue: null,
        },
        targetPosition: kp?.position ?? "?",
        primaryFactor: "KEEPER",
        pickReason: `Keeper slot — Round ${round} reserved`,
        blockedOverrides: [],
        bpa: {
          name: keeperPlayer,
          position: kp?.position ?? "?",
          adp: null,
          projectedPoints: kp?.projectedPoints ?? 0,
          marketValue: null,
        },
        needUrgency: null,
        teamNeeds: [],
        dpTiming,
        ownerDnaMeta: null,
        ownerConfidence: null,
        legacyReason: `Keeper slot — Round ${round} reserved`,
        confidenceScore: 100,
        isKeeper: true,
        keeperRound: round,
      });
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
        pickIntelligence: keeperDecision.pickIntelligence,
        draftDecision: keeperDecision,
        tradedPickContext: tradeCtx ? {
          type: tradeCtx.type, evidence: tradeCtx.evidence
        } : null,
      });
      counts[kp?.position ?? "?"] = (counts[kp?.position ?? "?"] ?? 0) + 1;
      continue;
    }

    // Check if this is a traded pick
    const tradeCtx = tradedPickMap.get(`${round}_${tid}`);

    // Real-ADP draft model: the pool is ESPN-ADP-ordered, so the best player available is the
    // first undrafted player. Bias toward the team's actual roster needs with a need-driven
    // reach window. No hardcoded position-by-round weights, no VORP — ordering is ESPN ADP.
    // Starter-aware caps by round: a single-QB league never drafts a 2nd QB early (nor a
    // starting-caliber 2nd TE), and K/DEF only come off the board in the final rounds — matching
    // how managers actually draft. Backups/streamers become allowed only in the last few rounds.
    const lateWindow = round > maxRound - 3;
    const cap = (pos: string): number => {
      switch (pos) {
        case "QB":  return lateWindow ? 2 : 1;
        case "TE":  return lateWindow ? 3 : 1;
        // Drive the IDP (DP) cap from the league's real DP starter requirement, same as DEF —
        // no hardcoded assumption. 457622 has DP:1; team-D/ST leagues (no DP) get 0.
        case "DP":  return lineupReqs.DP ?? 0;
        case "K":   return round >= maxRound - 1 ? 1 : 0;
        case "DEF": return lineupReqs.DEF ?? 0; // team D/ST cap driven by the league's real DST starter requirement (keyed "DEF" to match the pool/registry label)
        case "RB":  return 6;
        case "WR":  return 7;
        default:    return 3;
      }
    };
    const undrafted = pool.filter(p => !drafted.has(p.name) && !keeperPlayerIds.has(Number(p.espnId)));
    if (undrafted.length === 0) { continue; }

    // Phase 1 DP intelligence: defenders are not draftable before the league timing window opens.
    const dpSelectable = (p: typeof undrafted[0]) =>
      p.position !== "DP" || evaluateDpDraftability(pickNum, dpTiming).selectable;
    const undraftedForBpa = undrafted.filter(dpSelectable);
    const bpa = undraftedForBpa[0] ?? undrafted.find(p => p.position !== "DP");
    if (!bpa) { continue; }

    const URG_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    const REACH_BY_URG: Record<string, number> = { CRITICAL: 18, HIGH: 12, MEDIUM: 6, LOW: 0 };
    const teamNeeds = (needs?.needs ?? [])
      .filter((n: any) => (counts[n.position] ?? 0) < cap(n.position))
      .sort((a: any, b: any) => (URG_RANK[b.urgency] ?? 0) - (URG_RANK[a.urgency] ?? 0));

    const blockedOverrides: string[] = [];
    let pick = bpa;
    let targetPos = bpa.position;
    let pickReason = "Best player available by ADP";
    let primaryFactor: PickIntelligence["primaryFactor"] = "ESPN_ADP";

    for (const n of teamNeeds) {
      if (n.position === "DP" && dpTiming) {
        const draftability = evaluateDpDraftability(pickNum, dpTiming);
        if (!draftability.selectable) {
          const guard = evaluateDpNeedReachGuard({
            pickNum, urgency: String(n.urgency), profile: dpTiming,
          });
          if (!guard.allowed) {
            if (guard.blockedReason) blockedOverrides.push(guard.blockedReason);
            continue;
          }
        }
      }
      const idx = undrafted.findIndex(p => p.position === n.position);
      if (idx < 0) continue;
      if (idx <= (REACH_BY_URG[n.urgency] ?? 0)) {
        if (n.position === "DP" && dpTiming && !evaluateDpDraftability(pickNum, dpTiming).selectable) {
          continue;
        }
        pick = undrafted[idx]; targetPos = n.position;
        pickReason = `${n.urgency} need at ${n.position} (within reach of best available)`;
        primaryFactor = "ROSTER_NEED";
        break;
      }
    }
    // If BPA's own position is already capped, slide to the best uncapped player by ADP.
    if (pick === bpa && (counts[bpa.position] ?? 0) >= cap(bpa.position)) {
      const alt = undraftedForBpa.find(p => (counts[p.position] ?? 0) < cap(p.position))
        ?? undrafted.find(p => (counts[p.position] ?? 0) < cap(p.position) && dpSelectable(p));
      if (alt) {
        pick = alt; targetPos = alt.position;
        pickReason = `Best available by ADP (${bpa.position} roster slots full)`;
        primaryFactor = "POSITION_CAP";
      }
    }

    // Late-draft safety: once past league baseline, allow best DP by ADP if slot uncapped and window open.
    if (
      dpTiming
      && (counts["DP"] ?? 0) < cap("DP")
      && isDpWindowOpen(pickNum, dpTiming)
      && dpTiming.baselineFirstPick != null
      && pickNum >= dpTiming.baselineFirstPick
      && pick.position !== "DP"
    ) {
      const dpNeed = teamNeeds.find((n: any) => n.position === "DP");
      const bestDp = undrafted.find(p => p.position === "DP");
      if (bestDp && dpNeed) {
        pick = bestDp;
        targetPos = "DP";
        pickReason = `League DP window open (median first-DP pick ${dpTiming.baselineFirstPick}) — best IDP by ESPN ADP`;
        primaryFactor = "LEAGUE_TIMING";
      }
    }

    // Phase 2a: owner DNA nudge — offense only, probability signal inside ADP band (DP path unchanged).
    const legacyPick = pick;
    const legacyReason = pickReason;
    const legacyPrimary = primaryFactor;
    let ownerDnaMeta: {
      applied: boolean;
      closeBlocked: boolean;
      positionProbabilities: Array<{ position: string; probability: number }>;
      explanation: string | null;
      blockedReason: string | null;
      structuredSections: Array<{ title: string; lines: string[] }>;
    } | null = null;

    const ownerKey = normOwnerKey(ownerName);
    const toPoolPlayer = (p: typeof bpa): DraftPoolPlayer => ({
      name: p.name,
      position: p.position,
      adp: p.adp,
      projectedPoints: p.projectedPoints,
      marketValue: p.marketValue ?? null,
    });

    if (
      ownerDnaContext
      && legacyPick
      && legacyPrimary !== "ROSTER_NEED"
      && legacyPrimary !== "LEAGUE_TIMING"
      && OFFENSE_DNA_POSITIONS.has(String(legacyPick.position))
    ) {
      const ownerModel = resolveOwnerDnaModel(ownerDnaContext, ownerName);
      const reachSlots = Math.max(
        12,
        ...teamNeeds.map((n: { urgency: string }) => REACH_BY_URG[n.urgency] ?? 0),
      );
      const undraftedPool = (undraftedForBpa.length ? undraftedForBpa : undrafted.filter((p) => p.position !== "DP"))
        .map(toPoolPlayer);
      const bpaPool = toPoolPlayer(bpa);
      const closeDecision = evaluateCloseDecisionGate({
        undrafted: undraftedPool,
        bpa: bpaPool,
        reachSlots,
        counts,
        cap,
        teamNeeds: teamNeeds.map((n: { position: string; urgency: string }) => ({
          position: n.position,
          urgency: String(n.urgency),
        })),
      });

      if (closeDecision.isClose) {
        const streak = ownerDnaNudgeStreak.get(ownerKey) ?? 0;
        const decayMultiplier = ownerDnaDecayMultiplier(streak);
        const dnaResult = evaluateOwnerDnaNudge({
          ownerName,
          ownerModel,
          dnaContext: ownerDnaContext,
          round,
          pickNum,
          undrafted: undraftedPool,
          bpa: bpaPool,
          legacyPick: toPoolPlayer(legacyPick),
          closeDecision,
          decayMultiplier,
          consecutiveAppliedNudges: streak,
          teamNeeds: teamNeeds.map((n: { position: string; urgency: string }) => ({
            position: n.position,
            urgency: String(n.urgency),
          })),
          reachSlots,
          counts,
          cap,
        });
        ownerDnaMeta = {
          applied: dnaResult.applied,
          closeBlocked: dnaResult.closeBlocked,
          positionProbabilities: dnaResult.positionProbabilities.map((p) => ({
            position: p.position,
            probability: p.probability,
          })),
          explanation: dnaResult.explanation,
          blockedReason: dnaResult.blockedReason,
          structuredSections: dnaResult.structuredSections,
        };
        if (dnaResult.applied && dnaResult.player) {
          const dnaPlayer = undrafted.find((p) => p.name === dnaResult.player!.name);
          if (dnaPlayer && OFFENSE_DNA_POSITIONS.has(dnaPlayer.position)) {
            pick = dnaPlayer;
            targetPos = dnaPlayer.position;
            pickReason = dnaResult.explanation ?? legacyReason;
            primaryFactor = "OWNER_DNA";
          }
        }
      }
    }

    // Decay streak: reset on any non-DNA pick; increment on applied DNA nudge.
    if (ownerDnaContext && OFFENSE_DNA_POSITIONS.has(String(pick?.position ?? ""))) {
      if (primaryFactor === "OWNER_DNA") {
        ownerDnaNudgeStreak.set(ownerKey, (ownerDnaNudgeStreak.get(ownerKey) ?? 0) + 1);
      } else {
        ownerDnaNudgeStreak.set(ownerKey, 0);
      }
    }

    // Roster-completion guarantee (highest-priority override): when this team's remaining OPEN picks
    // all have to become required starters, force the best-available player at an unfilled required
    // position. Uses the raw undrafted board (so it can override the DP timing window when it must),
    // fills only up to the requirement (never exceeds caps), and never touches keepers.
    {
      const remainingOpenPicks = (teamOpenPicks.get(tid) ?? []).filter((op) => op >= pickNum).length;
      const completion = evaluateRosterCompletion({ counts, lineupReqs, undrafted, remainingOpenPicks });
      if (completion) {
        pick = completion.player;
        targetPos = completion.position;
        pickReason = completion.reason;
        primaryFactor = "ROSTER_COMPLETION";
        ownerDnaMeta = null;
      }
    }

    if (!pick) { continue; }
    drafted.add(pick.name);
    counts[pick.position] = (counts[pick.position] ?? 0) + 1;

    const available = undrafted.filter(p => p.position === targetPos && p.name !== pick.name);
    const needUrg = needs?.needs.find((n: any) => n.position === targetPos)?.urgency;

    const mv = pick.marketValue;
    const confSignals = [
      mv != null ? (mv >= 70 ? 0.9 : mv >= 45 ? 0.75 : 0.6) : 0.6,
      needUrg === "CRITICAL" ? 0.95 : needUrg === "HIGH" ? 0.85 : 0.70,
      pick.adp != null ? 0.8 : 0.6,
    ];
    const conf = Math.round(Math.min(95, Math.max(35, (confSignals.reduce((s,v)=>s+v,0)/confSignals.length)*100)));

    const draftDecision = buildDraftDecisionFromResolvedPick({
      pickNum,
      round,
      ownerName,
      teamName,
      pick: {
        name: pick.name,
        position: pick.position,
        adp: pick.adp,
        projectedPoints: pick.projectedPoints,
        marketValue: pick.marketValue ?? null,
      },
      targetPosition: targetPos,
      primaryFactor,
      pickReason,
      blockedOverrides,
      bpa: {
        name: bpa.name,
        position: bpa.position,
        adp: bpa.adp,
        projectedPoints: bpa.projectedPoints,
        marketValue: bpa.marketValue ?? null,
      },
      needUrgency: needUrg ?? null,
      teamNeeds: teamNeeds.map((n: { position: string; urgency: string }) => ({
        position: n.position,
        urgency: String(n.urgency),
      })),
      dpTiming,
      ownerDnaMeta: ownerDnaMeta,
      ownerConfidence: resolveOwnerDnaModel(ownerDnaContext, ownerName)?.confidence ?? null,
      legacyReason,
      confidenceScore: conf,
      cappedPosition: primaryFactor === "POSITION_CAP" ? bpa.position : undefined,
    });
    const pickIntelligence = draftDecision.pickIntelligence;

    const tradeNote = tradeCtx
      ? tradeCtx.type === "ACQUIRED"
        ? `[TRADED PICK] Acquired pick — ${ownerName} has extra Round ${round} capital`
        : `[TRADED PICK] This pick was traded in`
      : null;

    const adpTxt = pick.adp != null ? `ADP ${pick.adp}` : "no current ADP";
    const mvTxt = pick.marketValue != null ? `, market value ${Math.round(pick.marketValue)}/100` : "";
    const evidence = [
      pickIntelligence?.plainEnglish ?? pickReason,
      needUrg ? `${teamName} ${targetPos} need: ${needUrg}` : `No pressing ${targetPos} need — value pick`,
      `${pick.name} — ${adpTxt}${mvTxt}`,
      ...(tradeNote ? [tradeNote] : []),
    ];

    picks.push({
      pickNumber: pickNum, round, roundPick: rp,
      teamId: tid, teamName, ownerName,
      player: pick.name, position: pick.position, espnId: pick.espnId,
      projectedPoints: pick.projectedPoints, marketValue: pick.marketValue ?? null, adp: pick.adp ?? null,
      confidence: conf,
      reasoning: `${ownerName} takes ${targetPos} in Round ${round}${needUrg ? ` [${needUrg} need]` : " [BPA]"}${tradeCtx ? " [TRADED PICK]" : ""}`,
      evidence,
      pickIntelligence,
      draftDecision,
      alternatePicks: available.slice(0, 3).map(p => ({ player: p.name, position: p.position, projectedPoints: p.projectedPoints, marketValue: p.marketValue ?? null, adp: p.adp ?? null })),
      isKeeperSlot: false,
      tradedPickContext: tradeCtx ? { type: tradeCtx.type, evidence: tradeCtx.evidence } : null,
    });
  }

  return picks;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const draftWarRoomRouter = router({

  getDraftWarRoomData: protectedProcedure
    .input(z.object({
      season: z.number().int().min(2018).max(2030),
      activeLeagueKey: z.string().optional(),
      keeperOverrides: z.array(z.object({
        teamId:      z.number().int(),
        playerName:  z.string(),
        position:    z.string(),
        keeperRound: z.number().int(),
        keeperRoundPick: z.number().int().optional(),
      })).optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!(await resolvePremiumAccess(ctx.user))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Draft Intelligence requires Rivals. Upgrade to unlock the Draft War Room.",
        });
      }
      const db = await getDb();
      if (!db) return { ok: false, error: "DB unavailable" };
      const { season } = input;
      void input.activeLeagueKey;

      // Phase B1: resolve leagueId per-request — no module-level constant.
      if (!ctx.user?.id) return { ok: false, error: "setup_required", requiresSetup: true };
      const { leagueId } = await resolveActiveLeagueId(
        { user: { id: ctx.user.id } },
        null,
        season,
      );
      if (!leagueId || leagueId === "default") {
        return { ok: false, error: "setup_required", requiresSetup: true };
      }

      const { byTeam, teams, keepers, allPicks, prevByTeam, playerDraftRoundMap, consecutiveKeptPlayers } = await loadRoster(db, season, leagueId);
      if (teams.length === 0) return { ok: false, error: `No roster data for ${season}` };

      const cached = await getCachedView(season, "combined", leagueId, { userId: ctx.user.id });
      const payload = cached?.payload ? (cached.payload as Record<string, unknown>) : null;
      const leagueCapabilities = buildLeagueCapabilities(leagueId, season, payload);
      // Per-league starting-lineup requirements (drives the pool filter, roster needs, and caps).
      const leagueReqs = leagueLineupReqs(leagueId, payload);
      const rostersTeamDefense = (leagueReqs.DEF ?? 0) > 0;
      const geo = await resolveKeeperDraftGeometryForSeason(leagueId, season, ctx.user.id, payload);
      const totalRounds = Math.max(1, geo.roundCount || 1);
      const draftBoardSummary = summarizeDraftBoardCounts(allPicks);
      // ── Draft pool: registry × the single ESPN source (real ADP + projection),
      //    valued by computeMarketValues. No synthetic projection table, no name-joined ADP, no VORP.
      const [regRows] = await db.execute(drizzleSql`
        SELECT fullName, position, espnPlayerId
        FROM gm_player_registry
        WHERE espnPlayerId IS NOT NULL
          AND position IN ('QB','RB','WR','TE','K','DL','LB','DB','DEF')
        ORDER BY lastSeasonSeen DESC, id ASC LIMIT 2000
      `) as unknown as [any[]];

      const espnInfo = await getEspnPlayerInfoMap();
      const espnDefInfo = await getEspnDefensiveInfoMap(leagueId, ctx.user.id); // IDP feed from the league's authenticated data (real ADP)
      const infoFor = (espnId: string) => espnInfo.get(espnId) ?? espnDefInfo.get(espnId);

      // Identity crosswalk for the keeper engine (name → ESPN playerId) + real ADP by playerId.
      const nameToPlayerId = new Map<string, number>();
      const espnAdpByPlayerId = new Map<number, number | null>();
      for (const reg of (regRows as any[])) {
        const espnId = String(reg.espnPlayerId ?? "").trim();
        if (!espnId) continue;
        const pid = Number(espnId);
        const nameLc = String(reg.fullName).toLowerCase().trim();
        if (nameLc && !nameToPlayerId.has(nameLc)) nameToPlayerId.set(nameLc, pid);
        if (!espnAdpByPlayerId.has(pid)) espnAdpByPlayerId.set(pid, infoFor(espnId)?.adp ?? null);
      }

      // Build market-value inputs over the ESPN-ranked draftable universe (by playerId).
      const seenPool = new Set<string>();
      const poolMeta: Array<{ name: string; position: string; espnId: string; playerId: number; adp: number | null; projection: number | null }> = [];
      const mvInputs: MarketValueInput[] = [];
      for (const reg of (regRows as any[])) {
        const espnId = String(reg.espnPlayerId ?? "").trim();
        if (!espnId) continue;
        const info = infoFor(espnId);
        if (!info) continue;                         // not in ESPN's ranked pool (offense or IDP) → not draftable
        const nameLc = String(reg.fullName).toLowerCase().trim();
        if (seenPool.has(nameLc)) continue;
        seenPool.add(nameLc);
        const pid = Number(espnId);
        const draftPos = normalizeDraftPos(String(reg.position || "?"));
        if (draftPos === "DEF" && !rostersTeamDefense) continue; // team defenses only enter the pool for leagues that roster one (457622 stays DEF-free)
        mvInputs.push({
          playerId: pid, position: draftPos, adpRank: null,
          projection: info.projection ?? null, keeperRoundSavings: null,
          percentStarted: info.percentStarted ?? null,
          currentSeasonWeekly: [], history: [], currentSeason: season,
        });
        poolMeta.push({ name: reg.fullName, position: draftPos, espnId, playerId: pid, adp: info.adp ?? null, projection: info.projection ?? null });
      }
      const mvMap = computeMarketValues(mvInputs, { playedWeeks: 0 });

      const playerPool: any[] = poolMeta.map((m) => {
        const v = mvMap.get(m.playerId);
        return {
          name: m.name, position: m.position, espnId: m.espnId,
          projectedPoints: m.projection ?? 0,
          adp: m.adp,
          marketValue: v ? Math.round(v.value * 10) / 10 : null,
        };
      });
      // Order by real ESPN ADP (nulls last), then market value.
      playerPool.sort((a, b) => {
        if (a.adp != null && b.adp != null) { if (a.adp !== b.adp) return a.adp - b.adp; }
        else if (a.adp != null) return -1;
        else if (b.adp != null) return 1;
        return (b.marketValue ?? -1) - (a.marketValue ?? -1);
      });

      // Apply keeper overrides if provided
      let effectiveKeepers = keepers;
      if (input.keeperOverrides?.length) {
        const overrideKeys = new Set(
          input.keeperOverrides.map(o => `${o.teamId}_${o.keeperRound}`),
        );
        effectiveKeepers = [
          ...keepers.filter(k => !overrideKeys.has(`${Number(k.teamId)}_${Number(k.roundId)}`)),
          ...input.keeperOverrides.map(o =>
            enrichDraftPickDbRow({
              teamId: o.teamId,
              roundId: o.keeperRound,
              roundPick: o.keeperRoundPick ?? 1,
              overallPick: 0,
              playerName: o.playerName,
              position: o.position,
              isKeeper: 1,
              rawPick: JSON.stringify({ keeper: true, reservedForKeeper: false }),
              isManualOverride: true,
            }),
          ),
        ];
      }

      // Phase 1: Keeper + Roster (no hypothetical keepers when ESPN reports 0 keeper slots)
      const keeperPredictions = leagueCapabilities.keepers
        ? await predictKeepers(teams, byTeam, effectiveKeepers, playerDraftRoundMap, prevByTeam, consecutiveKeptPlayers, nameToPlayerId, espnAdpByPlayerId, season, leagueId, ctx.user.id, teams.length)
        : [];
      const rosterNeeds       = buildRosterNeeds(teams, byTeam, keeperPredictions, leagueReqs);

      // Traded picks: count only open-draft selections (keeper/retained slots are not tradable snake picks)
      const openDraftPicksForTrades = allPicks.filter((p: { draftedForAnalytics?: boolean }) => p.draftedForAnalytics);
      const tradedPicks = detectTradedPicks(openDraftPicksForTrades, teams);

      // Build draft slot map (position in round 1 snake) from open-draft round-1 order only
      const round1 = openDraftPicksForTrades.filter((p: { roundId: number }) => p.roundId === 1).sort((a: { roundPick: number }, b: { roundPick: number }) => a.roundPick - b.roundPick);
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

      // Phase 1 league-intelligence: DP timing baseline from draft_picks history.
      const leagueTimingProfiles = await computeLeaguePositionTimingProfiles({ db, sql: drizzleSql, leagueId });

      // Phase 2a: owner draft DNA (offense slice) from historical draft_picks.
      const ownerDraftDna = await loadOwnerDraftDnaContext({
        db, sql: drizzleSql, leagueId, currentSeason: season,
      });

      // Phase 1.5 Mock draft with traded pick awareness + DP timing + owner DNA intelligence
      const mockDraft = buildMockDraft({
        allPicks, rosterNeeds, keeperPredictions, tradedPicks, playerPool,
        dpTiming: leagueTimingProfiles.dp,
        ownerDnaContext: ownerDraftDna,
        lineupReqs: leagueReqs,
      });

      // Phase 1.75 — Pressure Engine (keeper compression only when league supports keepers)
      const keeperCompression = leagueCapabilities.keepers
        ? calcKeeperCompression(keeperPredictions, playerPool)
        : [];
      const scarcityAlerts    = calcScarcityAlerts({ rosterNeeds, playerPool, keeperPredictions, totalTeams: teams.length, totalRounds });
      const positionRunAlerts = calcPositionRunAlerts({ rosterNeeds, scarcityAlerts, keeperPredictions, mockDraft, totalTeams: teams.length });
      const pressureByRound   = calcDraftBoardPressure({ rosterNeeds, scarcityAlerts, keeperPredictions, totalTeams: teams.length, totalRounds });
      const draftEnvironment  = buildDraftEnvironmentDashboard({ scarcityAlerts, runAlerts: positionRunAlerts, compression: keeperCompression, pressureByRound, playerPool });

      // ── Draft After Keepers — authoritative removed-player list (Deliverable A) ──
      // Source priority is already encoded in keeperPredictions (manual override runs
      // first per team, then ESPN slots → CONFIRMED, then PREDICTED/HYPOTHETICAL). All
      // joins are by playerId — never by name.
      const sourceOf = (status: string): "MANUAL" | "CONFIRMED" | "PREDICTED" =>
        status === "MANUAL" ? "MANUAL" : status === "CONFIRMED" ? "CONFIRMED" : "PREDICTED";
      const removedKeepers: Array<{ playerId: number; playerName: string; position: string; source: "MANUAL" | "CONFIRMED" | "PREDICTED"; ownerName: string; ownerKey: string; keeperRound?: number }> = [];
      const removedKeeperIds = new Set<number>();
      for (const kp of keeperPredictions) {
        const pid = kp.playerId != null ? Number(kp.playerId) : null;
        if (pid == null || !Number.isFinite(pid)) continue;
        if (!kp.predictedPlayer || kp.predictedPlayer === "Unknown") continue;
        if (removedKeeperIds.has(pid)) continue; // dedupe by playerId (no duplicate removals)
        removedKeeperIds.add(pid);
        removedKeepers.push({
          playerId: pid,
          playerName: kp.predictedPlayer,
          position: kp.position,
          source: sourceOf(kp.status),
          ownerName: kp.ownerName,
          ownerKey: `team:${kp.teamId}`,
          keeperRound: kp.keeperRound ?? undefined,
        });
      }

      // Draft After Keepers summary (Deliverable D) — top removed by real ADP (most valuable first)
      const draftAfterKeepers = {
        totalRemoved: removedKeepers.length,
        manual: removedKeepers.filter((r) => r.source === "MANUAL").length,
        confirmed: removedKeepers.filter((r) => r.source === "CONFIRMED").length,
        predicted: removedKeepers.filter((r) => r.source === "PREDICTED").length,
        topRemoved: [...removedKeepers]
          .sort((a, b) => (espnAdpByPlayerId.get(a.playerId) ?? 9999) - (espnAdpByPlayerId.get(b.playerId) ?? 9999))
          .slice(0, 6)
          .map((r) => ({ playerId: r.playerId, playerName: r.playerName, position: r.position, source: r.source })),
      };

      // Board-reality pool — keepers removed by playerId (Deliverable B). Replaces the
      // previous name-based removal. availablePool and availablePoolAfterKeepers are the
      // SAME single board (Rule 4: no duplicate boards), named explicitly for clarity.
      // Include DP (IDP) and DEF (team D/ST) so defenders surface in the Available Players board.
      // The upstream playerPool is already league-scoped (DEF only for leagues that roster a team
      // defense, DP only for IDP leagues), so this static allow-list stays league-correct.
      const DRAFT_POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DP", "DEF"]);
      const availablePoolAfterKeepers = playerPool
        .filter((p) => !removedKeeperIds.has(Number(p.espnId)) && DRAFT_POSITIONS.has(p.position))
        .slice(0, 320)
        .map((p, idx) => ({
          id: p.espnId ? `espn:${p.espnId}` : `name:${p.name.toLowerCase().trim()}`,
          espnId: p.espnId ?? null,
          playerId: p.espnId ? Number(p.espnId) : null,
          name: p.name, position: p.position,
          projectedPoints: p.projectedPoints,
          adp: p.adp ?? null,
          marketValue: p.marketValue ?? null,
          rank: idx + 1,
        }));
      const availablePool = availablePoolAfterKeepers;

      return {
        ok: true, season,
        leagueCapabilities,
        teamCount: teams.length,
        draftBoardSummary,
        keeperPredictions,
        availablePool,
        availablePoolAfterKeepers,
        removedKeepers,
        draftAfterKeepers,
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
