/**
 * Phase 4 — fit all active owner souls (league 457622 only).
 * Phase 4.5 uses souls; clustering retained internally but not surfaced at Gate 4.5.
 */

import type { ActiveOwnerEntry } from "../activeOwners";
import { CONFIRMED_ACTIVE_OWNERS } from "../activeOwners";
import type { ChoiceLedger, ChoiceRecord } from "../phase1/types";
import { choiceRecordsForOwner } from "../phase1/choiceLedger";
import { buildChoiceEventsForFit, type TerrainLookup } from "../phase3/driveFeatures";
import {
  fitMultinomialLogit,
  SOUL_FIT_OPTIONS,
  type PersonalityCoefficients,
  type PersonalityFitResult,
} from "../phase3/discreteChoiceModel";
import {
  averageCoefficients,
  clusterBehavioralSouls,
  hierarchicalShrink,
  nearestCluster,
  type BehavioralCluster,
} from "./shrinkage";
import {
  archetypeFromDeviation,
  deviationFromLeague,
  distinctiveDriveRankings,
} from "./personalityDeviations";

function earlyRoundMix(records: ChoiceRecord[]) {
  const early = records.filter((r) => r.round <= 2);
  const n = early.length || 1;
  const rb = Math.round((early.filter((r) => r.chosenPlayer.position === "RB").length / n) * 100);
  const wr = Math.round((early.filter((r) => r.chosenPlayer.position === "WR").length / n) * 100);
  return { rb, wr, n: early.length };
}

export type OwnerSoulProfile = {
  leagueId: string;
  profileOwnerKey: string;
  displayName: string;
  personalityFitTier: "full" | "shrinkage_cold";
  choiceEventCount: number;
  earlyRoundRbPct: number;
  earlyRoundWrPct: number;
  earlyRoundPickCount: number;
  coefficients: PersonalityCoefficients;
  deviationCoefficients: PersonalityCoefficients;
  /** @deprecated Gate 4.5 uses decision rules, not archetypes */
  distinctiveArchetype: string;
  distinctiveDrives: Array<{ drive: string; delta: number }>;
  inverseTemperature: number;
  avgChosenProbability: number;
  rawFit: PersonalityFitResult;
  /** @deprecated not surfaced at Gate 4.5 */
  clusterId: string;
  /** @deprecated not surfaced at Gate 4.5 */
  clusterLabel: string;
  shrinkage?: {
    ownWeight: number;
    clusterWeight: number;
    leagueWeight: number;
  };
  boardScopeNote: string;
  records: ChoiceRecord[];
};

export type LeagueSoulRegistry = {
  leagueId: string;
  souls: OwnerSoulProfile[];
  clusters: BehavioralCluster[];
  leagueMeanCoefficients: PersonalityCoefficients;
};

export function fitAllActiveSouls(args: {
  leagueId: string;
  ledger: ChoiceLedger;
  terrainLookup: TerrainLookup;
  activeOwners?: readonly ActiveOwnerEntry[];
}): LeagueSoulRegistry {
  const owners = args.activeOwners ?? CONFIRMED_ACTIVE_OWNERS;
  const rawFits: Array<{
    owner: ActiveOwnerEntry;
    records: ChoiceRecord[];
    rawFit: PersonalityFitResult;
  }> = [];

  for (const owner of owners) {
    const records = choiceRecordsForOwner(args.ledger, owner.profileOwnerKey);
    if (records.length === 0) continue;
    const events = buildChoiceEventsForFit({ records, terrainLookup: args.terrainLookup });
    const rawFit = fitMultinomialLogit(events, 400, SOUL_FIT_OPTIONS);
    rawFits.push({ owner, records, rawFit });
  }

  const fullFits = rawFits.filter((r) => r.owner.personalityFitTier === "full");
  const leagueMeanCoefficients = averageCoefficients(fullFits.map((f) => f.rawFit.coefficients));

  const clusters = clusterBehavioralSouls({
    souls: fullFits.map((f) => ({
      profileOwnerKey: f.owner.profileOwnerKey,
      coefficients: deviationFromLeague(f.rawFit.coefficients, leagueMeanCoefficients),
    })),
    k: 4,
  });

  const souls: OwnerSoulProfile[] = [];

  for (const { owner, records, rawFit } of rawFits) {
    const ownerDeviation = deviationFromLeague(rawFit.coefficients, leagueMeanCoefficients);
    const cluster = nearestCluster(ownerDeviation, clusters);
    let coefficients = rawFit.coefficients;
    let shrinkage: OwnerSoulProfile["shrinkage"];

    if (owner.personalityFitTier === "shrinkage_cold") {
      const shrunk = hierarchicalShrink({
        rawFit,
        clusterMean: cluster.centroid,
        leagueMean: leagueMeanCoefficients,
      });
      coefficients = shrunk.coefficients;
      shrinkage = {
        ownWeight: shrunk.ownWeight,
        clusterWeight: shrunk.clusterWeight,
        leagueWeight: shrunk.leagueWeight,
      };
    }

    const earlyMix = earlyRoundMix(records);
    const finalDeviation = deviationFromLeague(coefficients, leagueMeanCoefficients);
    const distinctive = distinctiveDriveRankings(finalDeviation, { topN: 3 });

    souls.push({
      leagueId: args.leagueId,
      profileOwnerKey: owner.profileOwnerKey,
      displayName: owner.displayName,
      personalityFitTier: owner.personalityFitTier,
      choiceEventCount: rawFit.choiceEventCount,
      earlyRoundRbPct: earlyMix.rb,
      earlyRoundWrPct: earlyMix.wr,
      earlyRoundPickCount: earlyMix.n,
      coefficients,
      deviationCoefficients: finalDeviation,
      distinctiveArchetype: archetypeFromDeviation(finalDeviation),
      distinctiveDrives: distinctive.map((d) => ({ drive: d.drive, delta: d.delta })),
      inverseTemperature: rawFit.inverseTemperature,
      avgChosenProbability: rawFit.avgChosenProbability,
      rawFit,
      clusterId: cluster.id,
      clusterLabel: cluster.label,
      shrinkage,
      boardScopeNote: rawFit.boardScopeNote,
      records,
    });
  }

  souls.sort((a, b) => b.choiceEventCount - a.choiceEventCount);

  return {
    leagueId: args.leagueId,
    souls,
    clusters,
    leagueMeanCoefficients,
  };
}
