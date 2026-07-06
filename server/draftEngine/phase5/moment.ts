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
  minSize?: number;
  maxSize?: number;
}): SimPlayer[] {
  const minSize = args.minSize ?? 5;
  const maxSize = args.maxSize ?? 12;

  const mandatory = mandatoryFillPositions({
    roster: args.ownerRoster,
    rules: args.rosterRules,
    round: args.round,
    totalRounds: args.totalRounds,
    ownerPicksRemaining: args.ownerPicksRemaining,
    poolHas: args.poolHas,
  });

  const unfilled = unfilledRequiredSlots(args.ownerRoster, args.rosterRules, args.poolHas);
  const completionWindow = inSlotCompletionWindow({
    ownerPicksRemaining: args.ownerPicksRemaining,
    round: args.round,
    totalRounds: args.totalRounds,
    unfilled,
  });

  let avail = args.weather.available.filter((p) => {
    const rosterPos = simPositionToRosterPos(p.position);
    if (!rosterPos) return false;
    const have = args.ownerRoster[rosterPos] ?? 0;
    if (mandatory.length > 0 && !mandatory.includes(rosterPos)) return false;
    if ((rosterPos === "K" || rosterPos === "DP" || rosterPos === "DST") && !completionWindow) return false;
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
  noiseScale?: number;
}): MomentDecision | null {
  const forcePos = mustForceFillThisPick({
    roster: args.ownerRoster,
    rules: args.rosterRules,
    poolHas: args.poolHas,
    ownerPicksRemaining: args.ownerPicksRemaining,
    round: args.round,
    totalRounds: args.totalRounds,
  });
  if (forcePos) {
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
  const utils = alts.map((_, i) => personalityUtils[i]! + constructionUtils[i]! + noises[i]!);
  const probs = softmaxProbs(utils);

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
