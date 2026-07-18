/**
 * Draft Moment Engine — classifier.
 *
 * PURE: given the derived facts for one pick + config, produce independent, receipt-backed signals
 * and a level. No DB, no I/O. This is the promoted, validated recalibration from the harness.
 *
 * Rules (all tunable via MomentConfig, except REACH which uses centralized reachClassification):
 *  - REACH: phase-based pick-vs-ADP thresholds (see reachClassification.ts). Not pace-config ADP.
 *  - STEAL: ADP delta counts only through round `adp.maxRound`; moderate at `moderateDelta`, strong
 *    only through `strongMaxRound` at `strongDelta`. Late-round positive ADP delta contributes nothing.
 *  - Tier cliff counts through `tierCliff.maxRound`; moderate at `moderateGap`, strong at `strongGap`.
 *  - Pattern break: earliest-ever only, ≥ `minSeasons` tracked seasons AND ≥ `minRoundBreak` earlier.
 *  - Consequential run: ≥ `minRunInWindow` in the window AND (if required) a tier cliff.
 *  - IDP: scored ONLY via DP-timing deviation, never via offense ADP.
 *  - Latest-ever, position frequency, roster need, rivalry-without-impact: context only (no signal).
 */
import { DEFAULT_MOMENT_CONFIG, IDP_POSITIONS, type MomentConfig, type MomentLevel, type MomentSignal } from "./draftMomentTypes";
import {
  classifyReachFromLegacyAdpDelta,
  reachSignalIsStrong,
  type ReachClassification,
} from "./reachClassification";

export interface ClassifierInput {
  position: string;
  round: number;
  adpDelta: number | null;      // overall - adp; + = fell/value, - = reach
  /** Overall pick number when known — improves reach round/delta fidelity. */
  overallPick?: number | null;
  /** League size when known — used only if round derivation is needed. */
  teamCount?: number | null;
  tierCliffGap: number | null;  // ADP gap to next-best undrafted at position (offense only)
  positionRunIncludingThis: number;
  ownerTiming: { anomaly: "earliest_ever" | "latest_ever" | null; priorEarliest: number; seasons: number } | null;
  dpDeviation: number | null;   // |round - league-typical DP round| (IDP only)
}

export interface ClassifierResult {
  signals: MomentSignal[];
  strongCount: number;
  level: MomentLevel;
  /** Present when REACH was evaluated (including non-reach outcomes). */
  reach: ReachClassification | null;
}

export function classifyMoment(input: ClassifierInput, config: MomentConfig = DEFAULT_MOMENT_CONFIG): ClassifierResult {
  const pos = String(input.position ?? "").toUpperCase();
  const isIdp = IDP_POSITIONS.has(pos);
  const round = input.round;
  const signals: MomentSignal[] = [];
  let reach: ReachClassification | null = null;

  // REACH — offense only; centralized phase thresholds (not MomentConfig.adp).
  if (!isIdp && input.adpDelta != null && input.adpDelta < 0) {
    reach = classifyReachFromLegacyAdpDelta({
      adpDelta: input.adpDelta,
      round,
      pickNumber: input.overallPick ?? undefined,
      numberOfTeams: input.teamCount,
    });
    if (reach.isReach) {
      const strong = reachSignalIsStrong(reach);
      signals.push({
        name: "REACH",
        strong,
        why: `reach ${reach.reachDelta} vs ADP in R${reach.round} (${reach.severity})`,
      });
    }
  }

  // STEAL — offense only, through adp.maxRound (unchanged from prior steal rules).
  if (!isIdp && input.adpDelta != null && input.adpDelta > 0 && round <= config.adp.maxRound && input.adpDelta >= config.adp.moderateDelta) {
    const strong = round <= config.adp.strongMaxRound && input.adpDelta >= config.adp.strongDelta;
    signals.push({ name: "STEAL", strong, why: `value ${input.adpDelta} vs ADP in R${round}` });
  }

  // TIER CLIFF — offense only, through tierCliff.maxRound
  const cliff = !isIdp && input.tierCliffGap != null && input.tierCliffGap >= config.tierCliff.moderateGap && round <= config.tierCliff.maxRound;
  if (cliff) {
    signals.push({ name: "TIER_CLIFF", strong: (input.tierCliffGap as number) >= config.tierCliff.strongGap, why: `next ${pos} +${input.tierCliffGap} ADP` });
  }

  // PATTERN BREAK — earliest-ever that materially breaks a stable history
  if (input.ownerTiming && input.ownerTiming.anomaly === "earliest_ever" &&
      input.ownerTiming.seasons >= config.patternBreak.minSeasons &&
      (input.ownerTiming.priorEarliest - round) >= config.patternBreak.minRoundBreak) {
    signals.push({ name: "PATTERN_BREAK", strong: true, why: `earliest ${pos} ever (prev R${input.ownerTiming.priorEarliest}, ${input.ownerTiming.seasons} seasons)` });
  }

  // CONSEQUENTIAL RUN — a run that also created a tier cliff
  if (!isIdp && input.positionRunIncludingThis >= config.consequentialRun.minRunInWindow &&
      (!config.consequentialRun.requiresTierCliff || cliff)) {
    signals.push({ name: "CONSEQUENTIAL_RUN", strong: false, why: `${input.positionRunIncludingThis} ${pos}s in ${config.consequentialRun.window} picks + tier cliff` });
  }

  // DP TIMING — IDP only, via DP-timing authority
  if (isIdp && input.dpDeviation != null && input.dpDeviation >= config.dpTiming.moderateDeviation) {
    signals.push({ name: "DP_TIMING", strong: input.dpDeviation >= config.dpTiming.strongDeviation, why: `DP timing deviates ${input.dpDeviation} rounds from league-typical` });
  }

  const strongCount = signals.filter((s) => s.strong).length;
  const level: MomentLevel =
    strongCount >= 1 && signals.length >= 2 ? "historic" :
    strongCount >= 1 || signals.length >= 2 ? "major" :
    signals.length === 1 ? "notable" : "routine";

  return { signals, strongCount, level, reach };
}
