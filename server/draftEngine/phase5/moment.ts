/**
 * Phase 5 — MOMENT: consideration set + drive competition + stochastic sample.
 */

import {
  computeDriveContributions,
  computeUtility,
  softmaxProbs,
  type PersonalityCoefficients,
} from "../phase3/discreteChoiceModel";
import {
  computeDriveFeatures,
  DRIVE_NAMES,
  type DriveName,
  type TerrainLookup,
} from "../phase3/driveFeatures";
import { normalizePlayerKey, normalizePosition, type ChoiceRecord } from "../phase1/types";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import { gumbelNoise, type Rng } from "./rng";
import type { DraftWeather, SimPlayer } from "./weather";
import type { LeagueRosterRules, RosterPosition } from "./leagueRosterRules";
import {
  isPositionBlocked,
  isPositionSaturatedForDraft,
  inSlotCompletionWindow,
  mandatoryFillPositions,
  mustForceFillThisPick,
  rosterConstructionUtility,
  simPositionToRosterPos,
  skillCountsForPersonality,
  unfilledRequiredSlots,
  type RosterCounts,
} from "./rosterConstruction";
import { timingDraftability, type PositionTimingProfile } from "./positionTiming";

/** Thrown when ADP-anchored scoring is requested but no consideration candidate has ADP. */
export class AdpScoringUnavailableError extends Error {
  constructor(message = "resolveMoment: ADP-anchored scoring requested but no candidate has ADP — refusing pick") {
    super(message);
    this.name = "AdpScoringUnavailableError";
  }
}

// --- Data-driven timing (Souls v2 gate fix) -------------------------------------------------
// K/DP/DST admission ramp opens this many rounds before the position's historical mean.
const TIMING_ADMIT_EARLINESS = 1.5;
// Utility bias applied to a late-slot candidate: negative before its window, positive after.
const TIMING_UTIL_WEIGHT = 5.0;
// Only honor the deterministic completion force for a late slot once it is genuinely in-window
// (draftability >= this) OR the owner is near pick-exhaustion (handled separately). Below this,
// the pick is left to the softmax so late slots spread across their real window, not a wall.
const FORCE_HONOR_THRESHOLD = 0.5;
const LATE_SLOTS = new Set<RosterPosition>(["K", "DP", "DST"]);

// --- ADP-anchored weighted scoring (Souls v2 step 4) ----------------------------------------
// score(c) = adp·adpScore + soul·soulScore + need·needScore + pos·posScore  (per-owner softmax)
// When `scoring` is supplied AND candidates carry ADP, this replaces the terrain-value utility.
export type ScoringWeights = { adp: number; soul: number; need: number; pos: number; T: number; N: number };

// Positional scarcity premium (0–100): RB dries up fastest, QB deepest. posScore in the formula.
const POS_SCARCITY: Record<string, number> = { RB: 100, WR: 75, TE: 55, QB: 35, K: 15, DP: 15, DST: 15 };

// Roster-need bucket → score. CRITICAL 100 · HIGH 70 · MEDIUM 40 · LOW 10.
function needLevelScore(
  pos: RosterPosition | null,
  roster: RosterCounts,
  rules: LeagueRosterRules,
  remaining: number,
): number {
  if (!pos) return 0;
  const min = rules.starterMinimum[pos] ?? rules.starters[pos] ?? 0;
  const have = roster[pos] ?? 0;
  const deficit = min - have;
  if (deficit > 0) return remaining <= deficit ? 100 : 70;
  const soft = rules.softCap[pos];
  if (soft != null && have < soft) return 40;
  return 10;
}

export type MomentCandidate = {
  player: SimPlayer;
  features: ReturnType<typeof computeDriveFeatures>;
  utility: number;
  pickProbability: number;
};

export type PickScoreDebug = {
  personalityUtility: number;
  valueContribution: number;
  needContribution: number;
  constructionUtility: number;
  finalUtility: number;
  marginOverRunnerUp: number;
};

export type MomentDecision = {
  chosen: SimPlayer;
  consideration: SimPlayer[];
  candidates: MomentCandidate[];
  winningDrive: DriveName;
  winningDriveLabel: string;
  /** When roster saturation/urgency overrides personality attribution. */
  rosterConstructionNote?: string;
  pickProbability: number;
  lowConfidencePick: boolean;
  takenOver: string[];
  /** Numeric breakdown for fidelity proof (R2/R3 in Bruce gate). */
  scoreDebug?: PickScoreDebug;
  forcedSlotFill?: boolean;
};

const DRIVE_WIN_LABELS: Record<DriveName, string> = {
  value: "board value",
  need: "roster need",
  scarcityTierCliff: "tier cliff",
  herdFomo: "joining the run",
  contrarian: "fading the run",
  homerAffinity: "homers",
  blockRevenge: "rivalry block",
  comfortAnchor: "comfort re-draft",
  panic: "tier urgency",
  rbEarlyRound: "early RB tilt",
  wrEarlyRound: "early WR tilt",
  rbEarlyLegacyEra: "legacy RB chapter",
  wrEarlyModernEra: "modern WR shift",
};

function stubRecord(args: {
  season: number;
  round: number;
  weather: DraftWeather;
}): ChoiceRecord {
  return {
    leagueId: args.weather.leagueId,
    season: args.season,
    round: args.round,
    roundPick: 1,
    overallPick: args.weather.picksCompleted + 1,
    chooserProfileKey: "",
    chooserDisplayName: "",
    chooserRole: "active",
    chosenPlayer: { playerName: "", position: "RB" },
    availableSet: args.weather.available.map((p) => ({ playerName: p.playerName, position: p.position })),
    roomState: args.weather.roomState,
  };
}

export function buildConsiderationSet(args: {
  weather: DraftWeather;
  ownerRoster: RosterCounts;
  rosterRules: LeagueRosterRules;
  ownerCoefficients: PersonalityCoefficients;
  ownerPriorKeys: Set<string>;
  round: number;
  totalRounds: number;
  ownerPicksRemaining: number;
  poolHas: Partial<Record<RosterPosition, boolean>>;
  positionTiming?: PositionTimingProfile;
  rng?: Rng;
  adpScoring?: boolean;
  minSize?: number;
  maxSize?: number;
}): SimPlayer[] {
  const minSize = args.minSize ?? 5;
  const maxSize = args.maxSize ?? 12;

  const unfilled = unfilledRequiredSlots(args.ownerRoster, args.rosterRules, args.poolHas);

  const rawMandatory = mandatoryFillPositions({
    roster: args.ownerRoster,
    rules: args.rosterRules,
    round: args.round,
    totalRounds: args.totalRounds,
    ownerPicksRemaining: args.ownerPicksRemaining,
    poolHas: args.poolHas,
    timing: args.positionTiming,
  });
  // Timing-soften the late slots: a K/DP/DST is only "mandatory" (restricting the whole
  // consideration set to it) once we're near pick-exhaustion or actually inside its historical
  // window. Before that it stays optional so skill players remain in play. Skill mandates
  // (QB / lineup legality) pass through unchanged.
  const mandatory = args.positionTiming
    ? rawMandatory.filter((p) => {
        if (!LATE_SLOTS.has(p)) return true;
        if (args.ownerPicksRemaining <= unfilled.length) return true;
        if (args.adpScoring) return false; // ADP path: never restrict the set to a late slot pre-exhaustion
        return timingDraftability(args.positionTiming![p], args.round) >= FORCE_HONOR_THRESHOLD;
      })
    : rawMandatory;
  const completionWindow = inSlotCompletionWindow({
    ownerPicksRemaining: args.ownerPicksRemaining,
    round: args.round,
    totalRounds: args.totalRounds,
    unfilled,
    timing: args.positionTiming,
  });

  // Data-driven ramp (replaces the old hard round gate): decide admission ONCE PER LATE POSITION
  // (not per candidate — there are ~14 filler copies of each K/DP/DST, so a per-copy draw would
  // make "at least one admitted" near-certain and flood them in early). A position is admitted
  // with probability = its draftability at this round, so it starts appearing around its real
  // historical window. No timing/rng -> old behavior (excluded until the completion window).
  const lateAdmit = new Set<RosterPosition>();
  for (const lp of LATE_SLOTS) {
    if (completionWindow) { lateAdmit.add(lp); continue; }
    const d = args.positionTiming ? timingDraftability(args.positionTiming[lp], args.round, TIMING_ADMIT_EARLINESS) : 0;
    if (d > 0 && args.rng && args.rng() < d) lateAdmit.add(lp);
  }

  let avail = args.weather.available.filter((p) => {
    const rosterPos = simPositionToRosterPos(p.position);
    if (!rosterPos) return false;
    const have = args.ownerRoster[rosterPos] ?? 0;
    if (mandatory.length > 0 && !mandatory.includes(rosterPos)) return false;
    if (LATE_SLOTS.has(rosterPos) && !lateAdmit.has(rosterPos)) return false;
    if (isPositionSaturatedForDraft(rosterPos, have, args.rosterRules)) return false;
    return true;
  });
  if (avail.length < minSize) {
    avail = args.weather.available.filter((p) => {
      const rosterPos = simPositionToRosterPos(p.position);
      if (!rosterPos) return false;
      const have = args.ownerRoster[rosterPos] ?? 0;
      if (mandatory.length > 0 && !mandatory.includes(rosterPos)) return false;
      if (isPositionSaturatedForDraft(rosterPos, have, args.rosterRules)) return false;
      return !isPositionBlocked(rosterPos, have, args.rosterRules);
    });
  }
  if (avail.length === 0) return [];

  const selected = new Map<string, SimPlayer>();
  const add = (p: SimPlayer) => {
    const rosterPos = simPositionToRosterPos(p.position);
    if (rosterPos && isPositionSaturatedForDraft(rosterPos, args.ownerRoster[rosterPos] ?? 0, args.rosterRules)) {
      return;
    }
    selected.set(normalizePlayerKey(p.playerKey), p);
  };

  const byValue = [...avail].sort((a, b) => b.valueScore - a.valueScore);
  for (const p of byValue.slice(0, 4)) add(p);

  const runPos = args.weather.roomState.runInProgress?.position;
  if (runPos) {
    for (const p of avail.filter((x) => normalizePosition(x.position) === runPos).sort((a, b) => b.valueScore - a.valueScore).slice(0, 2)) {
      add(p);
    }
  }

  const constructionSorted = [...avail].sort(
    (a, b) =>
      rosterConstructionUtility({
        player: b,
        roster: args.ownerRoster,
        rules: args.rosterRules,
        ownerPicksRemaining: args.ownerPicksRemaining,
      }) -
        rosterConstructionUtility({
          player: a,
          roster: args.ownerRoster,
          rules: args.rosterRules,
          ownerPicksRemaining: args.ownerPicksRemaining,
        }) || b.valueScore - a.valueScore,
  );
  for (const p of constructionSorted.slice(0, 3)) add(p);

  if (args.ownerCoefficients.comfortAnchor > 0.1) {
    for (const p of avail.filter((x) => args.ownerPriorKeys.has(normalizePlayerKey(x.playerKey))).slice(0, 2)) add(p);
  }

  if (args.weather.roomState.runInProgress && args.ownerCoefficients.contrarian > 0.08) {
    const fadePos = ["RB", "WR", "QB", "TE"].filter((pos) => pos !== args.weather.roomState.runInProgress!.position);
    for (const pos of fadePos) {
      const best = avail.filter((x) => normalizePosition(x.position) === pos).sort((a, b) => b.valueScore - a.valueScore)[0];
      if (best) add(best);
    }
  }

  const early = args.weather.picksCompleted < args.weather.teamCount * 2;
  if (early && args.ownerCoefficients.rbEarlyRound + args.ownerCoefficients.rbEarlyLegacyEra > 0.15) {
    const rb = avail.filter((x) => normalizePosition(x.position) === "RB").sort((a, b) => b.valueScore - a.valueScore)[0];
    if (rb) add(rb);
  }
  if (early && args.ownerCoefficients.wrEarlyRound + args.ownerCoefficients.wrEarlyModernEra > 0.08) {
    const wr = avail.filter((x) => normalizePosition(x.position) === "WR").sort((a, b) => b.valueScore - a.valueScore)[0];
    if (wr) add(wr);
  }

  for (const p of byValue) {
    if (selected.size >= maxSize) break;
    add(p);
  }

  let list = [...selected.values()];
  if (list.length < minSize) {
    for (const p of byValue) {
      if (list.length >= minSize) break;
      if (!selected.has(normalizePlayerKey(p.playerKey))) list.push(p);
    }
  }

  return list.slice(0, maxSize);
}

function centerNeedFeatures(
  alts: Array<{ features: ReturnType<typeof computeDriveFeatures> }>,
): void {
  const mean = alts.reduce((s, a) => s + a.features.need, 0) / (alts.length || 1);
  for (const a of alts) a.features.need -= mean;
}

function buildScoreDebug(args: {
  chosenAlt: { player: SimPlayer; features: ReturnType<typeof computeDriveFeatures> };
  coefficients: PersonalityCoefficients;
  invT: number;
  construction: number;
  finalUtility: number;
  allFinalUtils: number[];
}): PickScoreDebug {
  const sorted = [...args.allFinalUtils].sort((a, b) => b - a);
  const runnerUp = sorted[1] ?? sorted[0] ?? 0;
  return {
    personalityUtility: computeUtility(args.chosenAlt.features, args.coefficients) * args.invT,
    valueContribution: args.coefficients.value * args.chosenAlt.features.value,
    needContribution: args.coefficients.need * args.chosenAlt.features.need,
    constructionUtility: args.construction,
    finalUtility: args.finalUtility,
    marginOverRunnerUp: args.finalUtility - runnerUp,
  };
}

export function resolveMoment(args: {
  soul: OwnerSoulProfile;
  weather: DraftWeather;
  terrainLookup: TerrainLookup;
  season: number;
  round: number;
  totalRounds: number;
  ownerPicksRemaining: number;
  ownerRoster: RosterCounts;
  rosterRules: LeagueRosterRules;
  poolHas: Partial<Record<RosterPosition, boolean>>;
  ownerPriorKeys: Set<string>;
  rng: Rng;
  positionTiming?: PositionTimingProfile;
  scoring?: ScoringWeights;
  noiseScale?: number;
}): MomentDecision | null {
  const forcePos = mustForceFillThisPick({
    roster: args.ownerRoster,
    rules: args.rosterRules,
    poolHas: args.poolHas,
    ownerPicksRemaining: args.ownerPicksRemaining,
    round: args.round,
    totalRounds: args.totalRounds,
    timing: args.positionTiming,
  });
  // Loosen the completion force for late slots (Souls v2): only honor a forced K/DP/DST fill
  // when the owner is near pick-exhaustion (legality safety net) OR we're actually inside the
  // position's historical window. Otherwise fall through to the softmax so these spread across
  // their real window instead of every owner filling in the same round. No timing -> old force.
  const honorForce = (() => {
    if (!forcePos) return false;
    if (!args.positionTiming || !LATE_SLOTS.has(forcePos)) return true;
    const unfilledNow = unfilledRequiredSlots(args.ownerRoster, args.rosterRules, args.poolHas);
    if (args.ownerPicksRemaining <= unfilledNow.length) return true;
    if (args.scoring) return false; // ADP path: the synthetic-ADP softmax places late slots; force only at exhaustion
    return timingDraftability(args.positionTiming[forcePos], args.round) >= FORCE_HONOR_THRESHOLD;
  })();
  if (forcePos && honorForce) {
    const fillers = args.weather.available
      .filter((p) => simPositionToRosterPos(p.position) === forcePos)
      .sort((a, b) => b.valueScore - a.valueScore);
    if (fillers.length > 0) {
      const chosen = fillers[0]!;
      return {
        chosen,
        consideration: fillers.slice(0, 12),
        candidates: [],
        winningDrive: "need",
        winningDriveLabel: "roster slot fill (forced)",
        rosterConstructionNote: `must fill ${forcePos} before draft ends`,
        pickProbability: 1,
        lowConfidencePick: args.soul.personalityFitTier === "shrinkage_cold",
        takenOver: fillers.slice(1, 4).map((p) => `${p.playerName} (${p.position})`),
        forcedSlotFill: true,
      };
    }
  }

  const consideration = buildConsiderationSet({
    weather: args.weather,
    ownerRoster: args.ownerRoster,
    rosterRules: args.rosterRules,
    ownerCoefficients: args.soul.coefficients,
    ownerPriorKeys: args.ownerPriorKeys,
    round: args.round,
    totalRounds: args.totalRounds,
    ownerPicksRemaining: args.ownerPicksRemaining,
    poolHas: args.poolHas,
    positionTiming: args.positionTiming,
    rng: args.rng,
    adpScoring: !!args.scoring,
  });
  if (consideration.length === 0) return null;

  const personalityRoster = skillCountsForPersonality(args.ownerRoster);
  const record = stubRecord({ season: args.season, round: args.round, weather: args.weather });
  const alts = consideration.map((player) => {
    const features = computeDriveFeatures({
      record,
      candidateName: player.playerName,
      candidatePosition: player.position,
      terrainLookup: args.terrainLookup,
      ownerRosterCounts: personalityRoster,
      ownerPriorPlayerKeys: args.ownerPriorKeys,
    });
    return { player, features };
  });
  centerNeedFeatures(alts);

  const invT = args.soul.inverseTemperature;
  const noise = args.noiseScale ?? 0.06;
  const personalityUtils = alts.map((a) => computeUtility(a.features, args.soul.coefficients) * invT);
  const constructionUtils = alts.map((a) =>
    rosterConstructionUtility({
      player: a.player,
      roster: args.ownerRoster,
      rules: args.rosterRules,
      ownerPicksRemaining: args.ownerPicksRemaining,
    }),
  );
  const noises = alts.map(() => noise * gumbelNoise(args.rng));
  // Regularity guard — follow the REGULAR strategy, not a one-off. An owner who opens with RB/WR
  // as their habit (high observed earlyRoundRbPct/WrPct) shouldn't be pulled into an early QB/TE
  // just because the fitted lean is faint or the noise broke that way. Penalize off-habit early
  // QB/TE picks in proportion to how strongly this owner actually sticks to RB/WR early. Reads
  // observed frequency (not a single event) and leaves the fitted souls untouched. A genuine
  // early-QB owner (low RB/WR-early share) is not penalized.
  const stickRbWr = Math.max(0, (args.soul.earlyRoundRbPct ?? 0) + (args.soul.earlyRoundWrPct ?? 0) - 0.5);
  // Soft nudge (not a ban), ROUND 1, QB ONLY. This league drafts 0 QBs in round 1 historically, so
  // the faint one-off round-1 QB leans get damped. TEs are NOT damped — the league does take a tight
  // end in round 1 (~0.75/draft), so they're left free. Rounds 2+ are unconstrained for both. Scaled
  // by how strongly the owner opens RB/WR; preserves the possibility (a strong lean still breaks through).
  const earlyRound = args.round === 1;
  const regularityPenalty = (pos: string): number =>
    earlyRound && pos === "QB" ? 0.5 * stickRbWr : 0;
  // Timing bias for late slots (K/DP/DST): negative before the position's historical window,
  // positive after — so an admitted kicker/defender is only attractive around its real round,
  // and gumbel noise spreads the actual picks across that window instead of a single-round wall.
  const timingBias = (pos: string): number => {
    if (!args.positionTiming) return 0;
    const rp = simPositionToRosterPos(pos);
    if (!rp || !LATE_SLOTS.has(rp)) return 0;
    return (timingDraftability(args.positionTiming[rp], args.round) - 0.5) * TIMING_UTIL_WEIGHT;
  };
  let utils: number[];
  let probs: number[];
  if (args.scoring && alts.some((a) => a.player.adp != null)) {
    // --- ADP-anchored weighted formula ---
    const w = args.scoring;
    const N = Math.max(1, Math.floor(w.N || 10));
    // Band = top-N available by ADP, plus any admitted late slot (no ADP) so it stays pickable.
    const withAdp = alts.map((a, i) => ({ i, adp: a.player.adp })).filter((x) => x.adp != null).sort((a, b) => a.adp! - b.adp!);
    const bandIdx = new Set<number>(withAdp.slice(0, N).map((x) => x.i));
    alts.forEach((a, i) => { const rp = simPositionToRosterPos(a.player.position); if (rp && LATE_SLOTS.has(rp)) bandIdx.add(i); });
    if (bandIdx.size === 0) alts.forEach((_, i) => bandIdx.add(i));
    const bestAdp = withAdp.length ? withAdp[0]!.adp! : 0;
    // soulScore: personality utility renormalized to 0–100 within the band.
    const bandUtils = [...bandIdx].map((i) => personalityUtils[i]!);
    const uMin = Math.min(...bandUtils), uMax = Math.max(...bandUtils);
    const soul01 = (i: number) => (uMax > uMin ? ((personalityUtils[i]! - uMin) / (uMax - uMin)) * 100 : 50);
    utils = alts.map((a, i) => {
      if (!bandIdx.has(i)) return -1e9;
      const adp = a.player.adp;
      const rp = simPositionToRosterPos(a.player.position);
      // Skill players score on real ADP; late slots (no ADP) get a synthetic adpScore that ramps
      // with their timing window, so they compete for the pick around their real historical round
      // instead of only ever arriving via the completion force (which re-creates the wall).
      const adpScore =
        adp != null
          ? Math.max(0, Math.min(100, 100 - (adp - bestAdp)))
          : rp && LATE_SLOTS.has(rp) && args.positionTiming
            ? Math.min(100, 50 + 60 * timingDraftability(args.positionTiming[rp], args.round))
            : 0;
      const soulScore = soul01(i);
      const needScore = needLevelScore(rp, args.ownerRoster, args.rosterRules, args.ownerPicksRemaining);
      const posScore = rp ? (POS_SCARCITY[rp] ?? 30) : 30;
      return (
        w.adp * adpScore + w.soul * soulScore + w.need * needScore + w.pos * posScore +
        timingBias(a.player.position) + noises[i]! * 60
      );
    });
    const conf = Math.max(0, Math.min(1, args.soul.avgChosenProbability ?? 0.3));
    const tOwner = Math.max(1, w.T * (1.5 - conf));
    probs = softmaxProbs(utils.map((u) => u / tOwner));
  } else if (args.scoring) {
    // Scoring weights were requested but no candidate has ADP — refuse silent garbage picks
    // (e.g. 0-projection fullbacks at 1.01). Callers must attach ADP or omit scoring.
    throw new AdpScoringUnavailableError();
  } else {
    utils = alts.map(
      (_, i) =>
        personalityUtils[i]! + constructionUtils[i]! + noises[i]! -
        regularityPenalty(alts[i]!.player.position) + timingBias(alts[i]!.player.position),
    );
    probs = softmaxProbs(utils);
  }

  let chosenIdx = 0;
  const r = args.rng();
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i]!;
    if (r <= cum) {
      chosenIdx = i;
      break;
    }
  }

  const chosenAlt = alts[chosenIdx]!;
  const chosenConstruction = rosterConstructionUtility({
    player: chosenAlt.player,
    roster: args.ownerRoster,
    rules: args.rosterRules,
    ownerPicksRemaining: args.ownerPicksRemaining,
  });
  const chosenPersonality = computeUtility(chosenAlt.features, args.soul.coefficients) * invT;

  const contributions = computeDriveContributions(chosenAlt.features, args.soul.coefficients);
  const winning = contributions.find((c) => c.contribution > 0) ?? contributions[0]!;
  let winningDrive = winning.drive;
  let winningDriveLabel = DRIVE_WIN_LABELS[winningDrive] ?? winningDrive;
  let rosterConstructionNote: string | undefined;

  const chosenPos = simPositionToRosterPos(chosenAlt.player.position);
  const haveAtPos = chosenPos ? (args.ownerRoster[chosenPos] ?? 0) : 0;
  const mandatory = mandatoryFillPositions({
    roster: args.ownerRoster,
    rules: args.rosterRules,
    round: args.round,
    totalRounds: args.totalRounds,
    ownerPicksRemaining: args.ownerPicksRemaining,
    poolHas: args.poolHas,
    timing: args.positionTiming,
  });

  if (mandatory.length > 0 && chosenPos && mandatory.includes(chosenPos)) {
    winningDriveLabel = "roster slot fill";
    rosterConstructionNote = `must fill ${chosenPos} before draft ends`;
  } else if (chosenConstruction >= 2 && chosenConstruction > chosenPersonality * 0.5) {
    winningDriveLabel = "roster construction";
    rosterConstructionNote =
      chosenPos && haveAtPos >= (args.rosterRules.starters[chosenPos] ?? 0)
        ? `${chosenPos} depth / unfilled slots`
        : "lineup requirement";
  }

  const takenOver = alts
    .filter((_, i) => i !== chosenIdx)
    .sort((a, b) => {
      const ub =
        computeUtility(b.features, args.soul.coefficients) * invT +
        rosterConstructionUtility({ player: b.player, roster: args.ownerRoster, rules: args.rosterRules, ownerPicksRemaining: args.ownerPicksRemaining });
      const ua =
        computeUtility(a.features, args.soul.coefficients) * invT +
        rosterConstructionUtility({ player: a.player, roster: args.ownerRoster, rules: args.rosterRules, ownerPicksRemaining: args.ownerPicksRemaining });
      return ub - ua;
    })
    .slice(0, 3)
    .map((a) => `${a.player.playerName} (${a.player.position})`);

  const candidates: MomentCandidate[] = alts.map((a, i) => ({
    player: a.player,
    features: a.features,
    utility: computeUtility(a.features, args.soul.coefficients),
    pickProbability: probs[i]!,
  }));

  const scoreDebug = buildScoreDebug({
    chosenAlt,
    coefficients: args.soul.coefficients,
    invT,
    construction: chosenConstruction,
    finalUtility: utils[chosenIdx]!,
    allFinalUtils: utils,
  });

  return {
    chosen: chosenAlt.player,
    consideration: consideration.map((p) => p),
    candidates,
    winningDrive,
    winningDriveLabel,
    rosterConstructionNote,
    pickProbability: probs[chosenIdx]!,
    lowConfidencePick: args.soul.personalityFitTier === "shrinkage_cold",
    takenOver,
    scoreDebug,
  };
}

function rosterSaturationBlocked(player: SimPlayer, roster: RosterCounts, rules: LeagueRosterRules): boolean {
  const pos = simPositionToRosterPos(player.position);
  if (!pos) return true;
  return isPositionBlocked(pos, roster[pos] ?? 0, rules);
}

export { rosterSaturationBlocked };

export { DRIVE_WIN_LABELS };
