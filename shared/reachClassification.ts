/**
 * Phase 4 — centralized reach classification (pick vs ADP).
 * Single source of truth for thresholds, severity, and persona ownership.
 * Shared by server (draft moments / wrap-up) and client (Live Draft Wrap-Up).
 *
 * Convention:
 *   reachDelta = playerAdp - actualPickNumber
 *   Positive = selected earlier than ADP (picks early).
 *   Negative or zero = never a reach.
 *
 * (Legacy draft-moment `adpDelta` is overall − ADP; picks-early = −adpDelta.)
 */
export type ReachSeverity = "normal" | "mild" | "big" | "massive";
export type ReachPhase = "early" | "middle" | "late";
export type ReachPersonaOwner = "coach" | "roxanne" | null;

export type ReachClassification = {
  isReach: boolean;
  severity: ReachSeverity;
  /** Picks earlier than ADP; positive means a reach candidate. */
  reachDelta: number;
  round: number;
  phase: ReachPhase;
  minimumThreshold: number;
  personaOwner: ReachPersonaOwner;
};

/** Roxanne may own a reach only when massive AND at least this many picks early. */
export const OUTRAGEOUS_REACH_MIN_DELTA = 40;

export type ReachPhaseThresholds = {
  /** Inclusive max for normal (not a reach). */
  normalMax: number;
  mildMin: number;
  mildMax: number;
  bigMin: number;
  bigMax: number;
  massiveMin: number;
};

/** Authoritative phase bands (picks early). */
export const REACH_THRESHOLDS_BY_PHASE: Record<ReachPhase, ReachPhaseThresholds> = {
  early: { normalMax: 7, mildMin: 8, mildMax: 14, bigMin: 15, bigMax: 24, massiveMin: 25 },
  middle: { normalMax: 9, mildMin: 10, mildMax: 17, bigMin: 18, bigMax: 29, massiveMin: 30 },
  late: { normalMax: 14, mildMin: 15, mildMax: 24, bigMin: 25, bigMax: 39, massiveMin: 40 },
};

export function reachPhaseForRound(round: number): ReachPhase {
  if (round <= 6) return "early";
  if (round <= 12) return "middle";
  return "late";
}

/**
 * Preferred: ceil(pickNumber / numberOfTeams).
 * If an authoritative existing round is provided (>0), use it.
 */
export function resolveDraftRound(input: {
  pickNumber: number;
  numberOfTeams?: number | null;
  existingRound?: number | null;
}): number {
  const existing = input.existingRound;
  if (existing != null && Number.isFinite(existing) && existing > 0) {
    return Math.floor(existing);
  }
  const teams = input.numberOfTeams;
  const pick = input.pickNumber;
  if (!Number.isFinite(pick) || pick < 1) return 1;
  if (teams == null || !Number.isFinite(teams) || teams <= 0) {
    return 1;
  }
  return Math.ceil(pick / teams);
}

export function computeReachDelta(actualPickNumber: number, playerAdp: number): number {
  return playerAdp - actualPickNumber;
}

/**
 * Legacy classifier delta is overallPick − ADP (negative = early).
 * Convert to picks-early (positive = early).
 */
export function reachDeltaFromLegacyAdpDelta(adpDelta: number): number {
  return -adpDelta;
}

function severityForDelta(delta: number, phase: ReachPhase): ReachSeverity {
  const t = REACH_THRESHOLDS_BY_PHASE[phase];
  // Strict floors: anything below mildMin is normal (covers decimals between normalMax and mildMin).
  if (delta < t.mildMin) return "normal";
  if (delta <= t.mildMax) return "mild";
  if (delta <= t.bigMax) return "big";
  return "massive";
}

function personaForSeverity(severity: ReachSeverity, reachDelta: number): ReachPersonaOwner {
  if (severity === "normal") return null;
  if (severity === "massive" && reachDelta >= OUTRAGEOUS_REACH_MIN_DELTA) return "roxanne";
  return "coach";
}

export type ClassifyReachInput = {
  /** Overall pick number (1-based). */
  pickNumber: number;
  /** Player ADP. Missing/invalid → not a reach. */
  playerAdp: number | null | undefined;
  /** Authoritative round when already known. */
  round?: number | null;
  /** League size for round derivation when round is absent. */
  numberOfTeams?: number | null;
};

function classifyReachFromDelta(reachDelta: number, round: number): ReachClassification {
  const phase = reachPhaseForRound(round);
  const minimumThreshold = REACH_THRESHOLDS_BY_PHASE[phase].mildMin;

  if (!Number.isFinite(reachDelta) || reachDelta <= 0) {
    return {
      isReach: false,
      severity: "normal",
      reachDelta: Number.isFinite(reachDelta) ? reachDelta : 0,
      round,
      phase,
      minimumThreshold,
      personaOwner: null,
    };
  }

  const severity = severityForDelta(reachDelta, phase);
  const isReach = severity !== "normal";
  return {
    isReach,
    severity,
    reachDelta,
    round,
    phase,
    minimumThreshold,
    personaOwner: isReach ? personaForSeverity(severity, reachDelta) : null,
  };
}

/**
 * Central reach classifier — use this everywhere for pick-vs-ADP reaches.
 */
export function classifyReach(input: ClassifyReachInput): ReachClassification {
  const round = resolveDraftRound({
    pickNumber: input.pickNumber,
    numberOfTeams: input.numberOfTeams,
    existingRound: input.round,
  });
  const phase = reachPhaseForRound(round);
  const minimumThreshold = REACH_THRESHOLDS_BY_PHASE[phase].mildMin;

  const adp = input.playerAdp;
  if (adp == null || !Number.isFinite(adp) || !Number.isFinite(input.pickNumber)) {
    return {
      isReach: false,
      severity: "normal",
      reachDelta: 0,
      round,
      phase,
      minimumThreshold,
      personaOwner: null,
    };
  }

  return classifyReachFromDelta(computeReachDelta(input.pickNumber, adp), round);
}

/**
 * Classify from legacy `adpDelta = overall − ADP` plus round.
 * Prefer {@link classifyReach} when pick + ADP are available.
 */
export function classifyReachFromLegacyAdpDelta(input: {
  adpDelta: number | null | undefined;
  round: number;
  pickNumber?: number;
  numberOfTeams?: number | null;
}): ReachClassification {
  const round = resolveDraftRound({
    pickNumber: input.pickNumber ?? 1,
    numberOfTeams: input.numberOfTeams,
    existingRound: input.round,
  });

  if (input.adpDelta == null || !Number.isFinite(input.adpDelta)) {
    return classifyReachFromDelta(0, round);
  }

  if (input.pickNumber != null && Number.isFinite(input.pickNumber)) {
    return classifyReach({
      pickNumber: input.pickNumber,
      playerAdp: input.pickNumber - input.adpDelta,
      round: input.round,
      numberOfTeams: input.numberOfTeams,
    });
  }

  return classifyReachFromDelta(reachDeltaFromLegacyAdpDelta(input.adpDelta), round);
}

/** Editorial plan hint from severity / persona (does not force speaking). */
export function editorialPlanForReach(
  reach: ReachClassification,
): "slight_reach" | "major_reach" | "historic_reach" | null {
  if (!reach.isReach) return null;
  if (reach.personaOwner === "roxanne") return "historic_reach";
  if (reach.severity === "mild") return "slight_reach";
  return "major_reach";
}

/** Strong REACH signal for moment encoding: big or massive. */
export function reachSignalIsStrong(reach: ReachClassification): boolean {
  return reach.isReach && (reach.severity === "big" || reach.severity === "massive");
}

/** Candidate row for wrap-up / UI biggest-reach selection. */
export type ReachWrapUpCandidate = {
  name: string;
  teamName: string;
  pickNumber: number;
  adp?: number | null;
  /** Authoritative round when known; otherwise derived from pick + team count. */
  round?: number | null;
};

export type BiggestClassifiedReach = {
  name: string;
  team: string;
  pickNumber: number;
  adp: number;
  /** Picks early (positive). */
  reachDelta: number;
  classification: ReachClassification;
};

/**
 * Select the classified reach with the greatest reachDelta.
 * Returns null when no candidate passes phase floors (never falls back to raw ADP gap).
 */
export function selectBiggestClassifiedReach(
  candidates: readonly ReachWrapUpCandidate[],
  numberOfTeams: number,
): BiggestClassifiedReach | null {
  let best: BiggestClassifiedReach | null = null;
  for (const c of candidates) {
    const classification = classifyReach({
      pickNumber: c.pickNumber,
      playerAdp: c.adp,
      round: c.round,
      numberOfTeams,
    });
    if (!classification.isReach) continue;
    if (!best || classification.reachDelta > best.reachDelta) {
      best = {
        name: c.name,
        team: c.teamName,
        pickNumber: c.pickNumber,
        adp: Number(c.adp),
        reachDelta: classification.reachDelta,
        classification,
      };
    }
  }
  return best;
}
