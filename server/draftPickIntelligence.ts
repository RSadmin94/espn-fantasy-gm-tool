/**
 * draftPickIntelligence.ts — Phase 1 DP pick intelligence (timing guard + explanations).
 *
 * League history sets WHEN defenders are draftable; ESPN ADP sets WHO once the window opens.
 */

import type { PositionTimingProfile, TimingConfidence } from "./leagueDraftTimingProfile";

export type PickPrimaryFactor =
  | "LEAGUE_TIMING"
  | "ESPN_ADP"
  | "ROSTER_NEED"
  | "POSITION_CAP"
  | "KEEPER";

export interface PickIntelligenceFactor {
  name: "leagueHistory" | "espnAdp" | "rosterNeed" | "scarcity" | "projections" | "ownerDna";
  weight: number;
  detail: string;
}

export interface PickIntelligence {
  primaryFactor: PickPrimaryFactor;
  factors: PickIntelligenceFactor[];
  blockedOverrides: string[];
  timingConfidence: TimingConfidence | null;
  plainEnglish: string;
}

const ROUND_EARLY_OVERRIDE = 4;

/** Repeatable league evidence that early DP runs happen (≥2 seasons with first DP before pick 50). */
export function hasRepeatableEarlyDpEvidence(profile: PositionTimingProfile): boolean {
  return profile.seasonsWithEarlyFirst >= 2;
}

/** Confidence scales how many picks ≈4 rounds represents for override blocking (sparse = softer). */
function earlyOverridePickBudget(profile: PositionTimingProfile): number {
  const base = ROUND_EARLY_OVERRIDE * profile.teamCount;
  if (profile.confidence === "Low") return Math.round(base * 1.5);
  if (profile.confidence === "Medium") return base;
  return Math.round(base * 0.85);
}

/** Is this overall pick at or past the league's DP window open? */
export function isDpWindowOpen(pickNum: number, profile: PositionTimingProfile | null): boolean {
  if (!profile?.windowStartPick) return true;
  return pickNum >= profile.windowStartPick;
}

export interface DpDraftability {
  selectable: boolean;
  reason: string;
}

/** Can a DP be drafted at this pick under league timing rules? */
export function evaluateDpDraftability(
  pickNum: number,
  profile: PositionTimingProfile | null,
): DpDraftability {
  if (!profile || profile.baselineFirstPick == null) {
    return { selectable: true, reason: "No league DP history — ADP rules apply." };
  }
  if (isDpWindowOpen(pickNum, profile)) {
    return {
      selectable: true,
      reason: `Pick ${pickNum} is at or after league DP window open (pick ${profile.windowStartPick}).`,
    };
  }
  return {
    selectable: false,
    reason: `Pick ${pickNum} is before league DP window open (pick ${profile.windowStartPick}; median first-DP ${profile.baselineFirstPick}).`,
  };
}

export interface NeedReachGuardResult {
  allowed: boolean;
  blockedReason: string | null;
  evidenceUsed: string | null;
}

/**
 * CRITICAL/HIGH need cannot pull DP 4+ rounds earlier than league baseline without repeatable evidence.
 * Sparse confidence softens the pick budget (harder to trigger block).
 */
export function evaluateDpNeedReachGuard(params: {
  pickNum: number;
  urgency: string;
  profile: PositionTimingProfile;
}): NeedReachGuardResult {
  const { pickNum, urgency, profile } = params;
  const urg = urgency.toUpperCase();
  if (urg !== "CRITICAL" && urg !== "HIGH") {
    return { allowed: true, blockedReason: null, evidenceUsed: null };
  }

  const baseline = profile.baselineFirstPick;
  if (baseline == null) return { allowed: true, blockedReason: null, evidenceUsed: null };

  const picksEarly = baseline - pickNum;
  const budget = earlyOverridePickBudget(profile);

  if (picksEarly < budget) {
    return { allowed: true, blockedReason: null, evidenceUsed: null };
  }

  if (hasRepeatableEarlyDpEvidence(profile)) {
    return {
      allowed: true,
      blockedReason: null,
      evidenceUsed: `${profile.seasonsWithEarlyFirst} season(s) opened DP before pick 50 — early reach permitted.`,
    };
  }

  // Inside window but need triggered early relative to baseline — still block if before window
  if (!isDpWindowOpen(pickNum, profile)) {
    return {
      allowed: false,
      blockedReason: `Need reach blocked: ${urg} DP need at pick ${pickNum} is ${picksEarly} picks earlier than league median first-DP (${baseline}) without repeatable early-DP history.`,
      evidenceUsed: null,
    };
  }

  return { allowed: true, blockedReason: null, evidenceUsed: null };
}

export function buildDpPickIntelligence(params: {
  pickNum: number;
  round: number;
  playerName: string;
  playerAdp: number | null;
  primaryFactor: PickPrimaryFactor;
  profile: PositionTimingProfile | null;
  needUrgency: string | null;
  pickReason: string;
  blockedOverrides: string[];
}): PickIntelligence {
  const { pickNum, playerName, playerAdp, primaryFactor, profile, needUrgency, pickReason, blockedOverrides } = params;
  const factors: PickIntelligenceFactor[] = [];

  if (profile) {
    factors.push({
      name: "leagueHistory",
      weight: primaryFactor === "LEAGUE_TIMING" ? 0.5 : 0.35,
      detail: profile.interpretation.slice(0, 160),
    });
  }

  factors.push({
    name: "espnAdp",
    weight: primaryFactor === "ESPN_ADP" ? 0.45 : 0.3,
    detail: playerAdp != null
      ? `${playerName} — ESPN ADP ${playerAdp} (best available IDP by ADP in window).`
      : `${playerName} — no ESPN ADP on file.`,
  });

  if (needUrgency) {
    factors.push({
      name: "rosterNeed",
      weight: primaryFactor === "ROSTER_NEED" ? 0.4 : 0.2,
      detail: `${needUrgency} roster need at DP.`,
    });
  }

  const total = factors.reduce((s, f) => s + f.weight, 0);
  if (total > 0) {
    for (const f of factors) f.weight = Math.round((f.weight / total) * 100) / 100;
  }

  let plainEnglish = pickReason;
  if (profile?.baselineFirstPick != null) {
    plainEnglish += ` League first-DP median: pick ${profile.baselineFirstPick} (R${profile.baselineFirstRound ?? "?"}).`;
  }
  if (blockedOverrides.length) {
    plainEnglish += ` ${blockedOverrides.join(" ")}`;
  }

  return {
    primaryFactor,
    factors,
    blockedOverrides,
    timingConfidence: profile?.confidence ?? null,
    plainEnglish,
  };
}
