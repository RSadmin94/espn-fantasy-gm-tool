/**
 * Draft Moment Engine — classifier.
 *
 * PURE: given the derived facts for one pick + config, produce independent, receipt-backed signals
 * and a level. No DB, no I/O.
 *
 * Core ADP/tier/pattern/run/DP rules retained. Editorial-intelligence signals promote genuine
 * draft moments that already had receipt context (late starter fill, positional runs without cliff,
 * QB/WR-TE stacks, strategy-shape landmarks, late patterns, early specialists) without changing
 * Sofia routing architecture.
 */
import { DEFAULT_MOMENT_CONFIG, IDP_POSITIONS, type MomentConfig, type MomentLevel, type MomentSignal } from "./draftMomentTypes";

export interface ClassifierInput {
  position: string;
  round: number;
  adpDelta: number | null; // overall - adp; + = fell/value, - = reach
  tierCliffGap: number | null;
  positionRunIncludingThis: number;
  ownerTiming: { anomaly: "earliest_ever" | "latest_ever" | null; priorEarliest: number; priorLatest?: number; seasons: number } | null;
  dpDeviation: number | null;
  /** True when this pick fills an open starter requirement at the position. */
  needsStarter: boolean;
  /** Count of this owner's prior picks from the same NFL team (before this pick). */
  sameNflTeamBefore: number;
  /** True when stack involves QB with WR/TE (or WR/TE with an existing QB from that team). */
  stackInvolvesQb: boolean;
  /** Roster counts before this pick. */
  rbBefore: number;
  wrBefore: number;
  teBefore: number;
  qbBefore: number;
  /** Current pick NFL team (when known). */
  nflTeam: string | null;
}

export interface ClassifierResult {
  signals: MomentSignal[];
  strongCount: number;
  level: MomentLevel;
}

export function classifyMoment(input: ClassifierInput, config: MomentConfig = DEFAULT_MOMENT_CONFIG): ClassifierResult {
  const pos = String(input.position ?? "").toUpperCase();
  const isIdp = IDP_POSITIONS.has(pos);
  const isSpecialist = pos === "K" || pos === "DEF" || pos === "DST";
  const round = input.round;
  const signals: MomentSignal[] = [];

  // REACH / STEAL — offense only, through adp.maxRound
  if (!isIdp && !isSpecialist && input.adpDelta != null && round <= config.adp.maxRound && Math.abs(input.adpDelta) >= config.adp.moderateDelta) {
    const strong = round <= config.adp.strongMaxRound && Math.abs(input.adpDelta) >= config.adp.strongDelta;
    signals.push({
      name: input.adpDelta < 0 ? "REACH" : "STEAL",
      strong,
      why: `${input.adpDelta < 0 ? "reach" : "value"} ${Math.abs(input.adpDelta)} vs ADP in R${round}`,
    });
  }

  // TIER CLIFF — offense only
  const cliff =
    !isIdp &&
    !isSpecialist &&
    input.tierCliffGap != null &&
    input.tierCliffGap >= config.tierCliff.moderateGap &&
    round <= config.tierCliff.maxRound;
  if (cliff) {
    signals.push({
      name: "TIER_CLIFF",
      strong: (input.tierCliffGap as number) >= config.tierCliff.strongGap,
      why: `next ${pos} +${input.tierCliffGap} ADP`,
    });
  }

  // PATTERN BREAK — earliest-ever
  if (
    input.ownerTiming &&
    input.ownerTiming.anomaly === "earliest_ever" &&
    input.ownerTiming.seasons >= config.patternBreak.minSeasons &&
    input.ownerTiming.priorEarliest - round >= config.patternBreak.minRoundBreak
  ) {
    signals.push({
      name: "PATTERN_BREAK",
      strong: true,
      why: `earliest ${pos} ever (prev R${input.ownerTiming.priorEarliest}, ${input.ownerTiming.seasons} seasons)`,
    });
  }

  // LATE PATTERN — latest-ever (mirror earliest; Sofia historical lane)
  if (
    input.ownerTiming &&
    input.ownerTiming.anomaly === "latest_ever" &&
    input.ownerTiming.seasons >= config.latePattern.minSeasons &&
    input.ownerTiming.priorLatest != null &&
    round - input.ownerTiming.priorLatest >= config.latePattern.minRoundBreak
  ) {
    signals.push({
      name: "LATE_PATTERN",
      strong: false,
      why: `latest ${pos} ever (prev R${input.ownerTiming.priorLatest}, ${input.ownerTiming.seasons} seasons)`,
    });
  }

  // CONSEQUENTIAL RUN — run that also created a tier cliff
  const runHitsConsequential =
    !isIdp &&
    !isSpecialist &&
    input.positionRunIncludingThis >= config.consequentialRun.minRunInWindow &&
    (!config.consequentialRun.requiresTierCliff || cliff);
  if (runHitsConsequential) {
    signals.push({
      name: "CONSEQUENTIAL_RUN",
      strong: false,
      why: `${input.positionRunIncludingThis} ${pos}s in ${config.consequentialRun.window} picks + tier cliff`,
    });
  }

  // POSITION RUN alone — fire when a run *begins* (hits threshold), not every pick inside it
  const runMin = config.positionRunAlone.minRunInWindow;
  if (
    !isIdp &&
    !isSpecialist &&
    !runHitsConsequential &&
    input.positionRunIncludingThis === runMin
  ) {
    signals.push({
      name: "POSITION_RUN",
      strong: false,
      why: `${input.positionRunIncludingThis} ${pos}s in the last ${config.positionRunWindow} picks`,
    });
  }

  // DP TIMING — IDP only
  if (isIdp && input.dpDeviation != null && input.dpDeviation >= config.dpTiming.moderateDeviation) {
    signals.push({
      name: "DP_TIMING",
      strong: input.dpDeviation >= config.dpTiming.strongDeviation,
      why: `DP timing deviates ${input.dpDeviation} rounds from league-typical`,
    });
  }

  // STARTER NEED — late fill of an open starter (Coach construction), not autopilot R1–2 fills
  const starterMinRound = config.starterNeed.minRoundByPos[pos] ?? 99;
  if (
    input.needsStarter &&
    !isSpecialist &&
    round <= config.starterNeed.maxRound &&
    round >= starterMinRound
  ) {
    signals.push({
      name: "STARTER_NEED",
      strong: false,
      why: `fills open starting ${pos} in R${round} (past typical early window)`,
    });
  }

  // NFL STACK — QB with WR/TE (or inverse) from same franchise
  if (
    config.nflStack.enabled &&
    input.nflTeam &&
    input.sameNflTeamBefore >= 1 &&
    input.stackInvolvesQb &&
    (pos === "QB" || pos === "WR" || pos === "TE")
  ) {
    signals.push({
      name: "NFL_STACK",
      strong: false,
      why: `QB/WR-TE stack with ${input.sameNflTeamBefore} prior ${input.nflTeam} player(s)`,
    });
  }

  // ZERO-RB shape — landmark rounds only while still 0 RB
  if (
    !isIdp &&
    !isSpecialist &&
    pos !== "RB" &&
    input.rbBefore === 0 &&
    config.strategyShape.zeroRbLandmarks.includes(round)
  ) {
    signals.push({
      name: "ZERO_RB",
      strong: false,
      why: `still 0 RB at landmark R${round} while taking ${pos}`,
    });
  }

  // QB waiting — landmark still without a QB
  if (
    !isIdp &&
    !isSpecialist &&
    pos !== "QB" &&
    input.qbBefore === 0 &&
    config.strategyShape.qbWaitingLandmarks.includes(round)
  ) {
    signals.push({
      name: "QB_WAITING",
      strong: false,
      why: `still 0 QB at landmark R${round} while taking ${pos}`,
    });
  }

  // TE waiting — landmark still without a TE
  if (
    !isIdp &&
    !isSpecialist &&
    pos !== "TE" &&
    input.teBefore === 0 &&
    config.strategyShape.teWaitingLandmarks.includes(round)
  ) {
    signals.push({
      name: "TE_WAITING",
      strong: false,
      why: `still 0 TE at landmark R${round} while taking ${pos}`,
    });
  }

  // HERO-RB — second early RB while room stays skill-light
  if (
    pos === "RB" &&
    input.rbBefore >= 1 &&
    round <= config.strategyShape.heroRbMaxRound &&
    input.wrBefore + input.teBefore <= 1
  ) {
    signals.push({
      name: "HERO_RB",
      strong: false,
      why: `second RB by R${round} with light WR/TE room`,
    });
  }

  // SPECIALIST EARLY — first K / DST ahead of norms
  if (isSpecialist) {
    const maxRound = pos === "K" ? config.specialistEarly.kMaxRound : config.specialistEarly.dstMaxRound;
    if (round <= maxRound) {
      signals.push({
        name: "SPECIALIST_EARLY",
        strong: false,
        why: `${pos} in R${round} (league norms later)`,
      });
    }
  }

  const strongCount = signals.filter((s) => s.strong).length;
  const level: MomentLevel =
    strongCount >= 1 && signals.length >= 2
      ? "historic"
      : strongCount >= 1 || signals.length >= 2
        ? "major"
        : signals.length === 1
          ? "notable"
          : "routine";

  return { signals, strongCount, level };
}
