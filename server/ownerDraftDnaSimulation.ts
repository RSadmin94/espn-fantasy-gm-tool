/**
 * ownerDraftDnaSimulation.ts — Grid search + Monte Carlo for Phase 2a tuning.
 */

import {
  buildMockDraft,
  type MockDraftInputs,
} from "./draftWarRoomRouter";
import type { OwnerDraftDnaContext, OwnerDraftDnaModel } from "./ownerDraftDnaModel";
import {
  computeOwnerAuthenticityReport,
  type MockPickRow,
  type OwnerAuthenticityReport,
} from "./ownerAuthenticityScore";
import {
  DEFAULT_OWNER_DNA_TUNING,
  tuningGrid,
  type OwnerDraftDnaTuning,
} from "./ownerDraftDnaTuning";

type RoundPosJson = Record<string, Record<string, number>>;

export interface SerializableMockFixture {
  allPicks: MockDraftInputs["allPicks"];
  rosterNeeds: MockDraftInputs["rosterNeeds"];
  keeperPredictions: MockDraftInputs["keeperPredictions"];
  tradedPicks: MockDraftInputs["tradedPicks"];
  playerPool: MockDraftInputs["playerPool"];
  dpTiming: MockDraftInputs["dpTiming"];
  registryPlayerCount: number;
  ownerDnaContext: {
    league: { totalPicks: number; roundPosRate: RoundPosJson };
    byOwnerKey: Record<string, Omit<OwnerDraftDnaModel, "roundPosRate"> & { roundPosRate: RoundPosJson }>;
  };
}

function roundPosToJson(m: Map<number, Map<string, number>>): RoundPosJson {
  const out: RoundPosJson = {};
  for (const [round, posMap] of m) out[String(round)] = Object.fromEntries(posMap);
  return out;
}

function roundPosFromJson(j: RoundPosJson): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const [round, posMap] of Object.entries(j)) {
    out.set(Number(round), new Map(Object.entries(posMap)));
  }
  return out;
}

export function serializeMockFixture(inputs: MockDraftInputs): SerializableMockFixture {
  const { ownerDnaContext } = inputs;
  if (!ownerDnaContext) throw new Error("ownerDnaContext required for fixture");
  const byOwnerKey: SerializableMockFixture["ownerDnaContext"]["byOwnerKey"] = {};
  for (const [key, model] of ownerDnaContext.byOwnerKey) {
    byOwnerKey[key] = {
      ...model,
      roundPosRate: roundPosToJson(model.roundPosRate),
    };
  }
  return {
    allPicks: inputs.allPicks,
    rosterNeeds: inputs.rosterNeeds,
    keeperPredictions: inputs.keeperPredictions,
    tradedPicks: inputs.tradedPicks,
    playerPool: inputs.playerPool,
    dpTiming: inputs.dpTiming,
    registryPlayerCount: inputs.registryPlayerCount,
    ownerDnaContext: {
      league: {
        totalPicks: ownerDnaContext.league.totalPicks,
        roundPosRate: roundPosToJson(ownerDnaContext.league.roundPosRate),
      },
      byOwnerKey,
    },
  };
}

export function deserializeMockFixture(raw: SerializableMockFixture): MockDraftInputs {
  const byOwnerKey = new Map<string, OwnerDraftDnaModel>();
  for (const [key, model] of Object.entries(raw.ownerDnaContext.byOwnerKey)) {
    byOwnerKey.set(key, {
      ...model,
      roundPosRate: roundPosFromJson(model.roundPosRate),
    });
  }
  const ownerDnaContext: OwnerDraftDnaContext = {
    league: {
      totalPicks: raw.ownerDnaContext.league.totalPicks,
      roundPosRate: roundPosFromJson(raw.ownerDnaContext.league.roundPosRate),
    },
    byOwnerKey,
  };
  return {
    allPicks: raw.allPicks,
    rosterNeeds: raw.rosterNeeds,
    keeperPredictions: raw.keeperPredictions,
    tradedPicks: raw.tradedPicks,
    playerPool: raw.playerPool,
    dpTiming: raw.dpTiming,
    registryPlayerCount: raw.registryPlayerCount ?? 0,
    ownerDnaContext,
  };
}

function toMockPickRows(picks: ReturnType<typeof buildMockDraft>): MockPickRow[] {
  return picks.map((p) => ({
    pickNumber: p.pickNumber,
    round: p.round,
    ownerName: p.ownerName,
    player: p.player,
    position: p.position,
    primaryFactor: p.pickIntelligence?.primaryFactor ?? null,
    isKeeperSlot: p.isKeeperSlot ?? false,
  }));
}

export function runMockDraftSimulation(
  inputs: MockDraftInputs,
  opts?: {
    dnaTuning?: OwnerDraftDnaTuning;
    stochasticSeed?: number;
    disableDna?: boolean;
  },
): MockPickRow[] {
  const mock = buildMockDraft({
    ...inputs,
    ownerDnaContext: opts?.disableDna ? null : inputs.ownerDnaContext,
    dnaTuning: opts?.dnaTuning ?? DEFAULT_OWNER_DNA_TUNING,
    stochasticSeed: opts?.stochasticSeed,
  });
  return toMockPickRows(mock);
}

export interface GridSearchResult {
  tuning: OwnerDraftDnaTuning;
  report: OwnerAuthenticityReport;
}

export function runTuningGridSearch(
  inputs: MockDraftInputs,
  baselinePicks: MockPickRow[],
  tunings: OwnerDraftDnaTuning[] = tuningGrid(),
): GridSearchResult[] {
  const phase1Top14 = baselinePicks.slice(0, 14);
  const ctx = inputs.ownerDnaContext;
  if (!ctx) throw new Error("ownerDnaContext required");

  const results: GridSearchResult[] = [];
  for (const tuning of tunings) {
    const mockPicks = runMockDraftSimulation(inputs, { dnaTuning: tuning });
    const report = computeOwnerAuthenticityReport({
      mockPicks,
      baselinePicks,
      phase1Top14Baseline: phase1Top14,
      ownerDnaContext: ctx,
    });
    results.push({ tuning, report });
  }
  results.sort((a, b) => b.report.compositeObjective - a.report.compositeObjective);
  return results;
}

export interface MonteCarloSummary {
  runs: number;
  meanLeagueScore: number;
  meanLeagueLift: number;
  meanDnaNudges: number;
  meanCompositeObjective: number;
  garrettPickModes: Record<number, number>;
  warnerPickModes: Record<number, number>;
}

export function runMonteCarloSimulation(
  inputs: MockDraftInputs,
  baselinePicks: MockPickRow[],
  opts: { runs: number; tuning: OwnerDraftDnaTuning; startSeed?: number },
): MonteCarloSummary {
  const phase1Top14 = baselinePicks.slice(0, 14);
  const ctx = inputs.ownerDnaContext;
  if (!ctx) throw new Error("ownerDnaContext required");

  let sumScore = 0;
  let sumLift = 0;
  let sumNudges = 0;
  let sumObjective = 0;
  const garrettModes: Record<number, number> = {};
  const warnerModes: Record<number, number> = {};

  for (let i = 0; i < opts.runs; i++) {
    const seed = (opts.startSeed ?? 1) + i;
    const mockPicks = runMockDraftSimulation(inputs, {
      dnaTuning: opts.tuning,
      stochasticSeed: seed,
    });
    const report = computeOwnerAuthenticityReport({
      mockPicks,
      baselinePicks,
      phase1Top14Baseline: phase1Top14,
      ownerDnaContext: ctx,
    });
    sumScore += report.leagueScore;
    sumLift += report.leagueLift;
    sumNudges += report.directDnaNudges;
    sumObjective += report.compositeObjective;
    if (report.garrettPick != null) garrettModes[report.garrettPick] = (garrettModes[report.garrettPick] ?? 0) + 1;
    if (report.warnerPick != null) warnerModes[report.warnerPick] = (warnerModes[report.warnerPick] ?? 0) + 1;
  }

  const n = opts.runs;
  return {
    runs: n,
    meanLeagueScore: sumScore / n,
    meanLeagueLift: sumLift / n,
    meanDnaNudges: sumNudges / n,
    meanCompositeObjective: sumObjective / n,
    garrettPickModes: garrettModes,
    warnerPickModes: warnerModes,
  };
}
