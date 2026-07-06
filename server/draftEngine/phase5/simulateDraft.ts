/**
 * Phase 5 — sequential draft simulation (weather + moment).
 */

import { BRUCE_PROFILE_OWNER_KEY } from "../activeOwners";
import { buildTerrainLookup } from "../phase3/driveFeatures";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import type { SeasonTerrain } from "../phase2/types";
import type { TerrainDraftPickRow } from "../phase2/types";
import {
  buildOwnerPriorKeys,
  chooserAtPick,
  poolFromTerrain,
  roundForPick,
  type DraftSlot,
} from "./loadSimDraftSetup";
import { resolveMoment, type MomentDecision } from "./moment";
import { mulberry32, type Rng } from "./rng";
import type { LeagueRosterRules } from "./leagueRosterRules";
import {
  addToRoster,
  assessRosterLegality,
  augmentPoolWithRosterFillers,
  emptyRosterCounts,
  type RosterCounts,
  type RosterLegalityReport,
} from "./rosterConstruction";
import {
  createInitialWeather,
  mutateWeatherAfterPick,
  type DraftWeather,
  type SimPlayer,
} from "./weather";
import type { ChoiceLedger } from "../phase1/types";
import type { RosterPosition } from "./leagueRosterRules";

export type SimPickRecord = {
  overallPick: number;
  round: number;
  chooserProfileKey: string;
  chooserDisplayName: string;
  chosen: SimPlayer;
  moment?: MomentDecision;
  lowConfidencePick: boolean;
};

export type DraftSimulationResult = {
  leagueId: string;
  season: number;
  seed: number;
  rounds: number;
  picks: SimPickRecord[];
  brucePicks: SimPickRecord[];
  finalWeather: DraftWeather;
  rosterRules: LeagueRosterRules;
  bruceRosterLegality: RosterLegalityReport;
  poolHas: Partial<Record<RosterPosition, boolean>>;
  picksCompleted: number;
  poolExhaustedAtPick: number | null;
};

export function simulateDraft(args: {
  leagueId: string;
  season: number;
  terrain: SeasonTerrain;
  souls: OwnerSoulProfile[];
  draftOrder: DraftSlot[];
  ledger: ChoiceLedger;
  rosterRules: LeagueRosterRules;
  fillerDraftPicks?: TerrainDraftPickRow[];
  rounds?: number;
  seed?: number;
}): DraftSimulationResult {
  const teamCount = args.draftOrder.length;
  const rounds = args.rounds ?? 16;
  const totalPicks = teamCount * rounds;
  const seed = args.seed ?? 457622;
  const rng: Rng = mulberry32(seed);

  const soulByKey = new Map(args.souls.map((s) => [s.profileOwnerKey, s]));
  const priorKeys = buildOwnerPriorKeys({ ledger: args.ledger });
  const terrainLookup = buildTerrainLookup(new Map([[args.season, args.terrain]]));
  const skillPool = poolFromTerrain(args.terrain);
  const { pool, poolHas } = augmentPoolWithRosterFillers({
    skillPool,
    draftPicks: args.fillerDraftPicks ?? [],
    teamCount,
  });

  let weather = createInitialWeather({
    leagueId: args.leagueId,
    season: args.season,
    teamCount,
    pool,
  });

  const rosters = new Map<string, RosterCounts>();
  for (const slot of args.draftOrder) {
    rosters.set(slot.profileOwnerKey, emptyRosterCounts());
  }

  const picks: SimPickRecord[] = [];

  for (let overallPick = 1; overallPick <= totalPicks && weather.available.length > 0; overallPick++) {
    const chooser = chooserAtPick({ overallPick, draftOrder: args.draftOrder });
    const soul = soulByKey.get(chooser.profileOwnerKey);
    if (!soul) continue;

    const round = roundForPick(overallPick, teamCount);
    const roster = rosters.get(chooser.profileOwnerKey) ?? emptyRosterCounts();
    const priors = priorKeys.get(chooser.profileOwnerKey) ?? new Set<string>();
    const ownerPicksMade = picks.filter((p) => p.chooserProfileKey === chooser.profileOwnerKey).length;
    const ownerPicksRemaining = rounds - ownerPicksMade;

    const moment = resolveMoment({
      soul,
      weather,
      terrainLookup,
      season: args.season,
      round,
      totalRounds: rounds,
      ownerPicksRemaining,
      ownerRoster: roster,
      rosterRules: args.rosterRules,
      poolHas,
      ownerPriorKeys: priors,
      rng,
    });
    if (!moment) break;

    const chosen = moment.chosen;
    picks.push({
      overallPick,
      round,
      chooserProfileKey: chooser.profileOwnerKey,
      chooserDisplayName: chooser.displayName,
      chosen,
      moment,
      lowConfidencePick: moment.lowConfidencePick,
    });

    rosters.set(chooser.profileOwnerKey, addToRoster(roster, chosen));
    weather = mutateWeatherAfterPick({
      weather,
      chosen,
      chooserProfileKey: chooser.profileOwnerKey,
      overallPick,
    });
  }

  const brucePicks = picks.filter((p) => p.chooserProfileKey === BRUCE_PROFILE_OWNER_KEY);
  const bruceRoster = rosters.get(BRUCE_PROFILE_OWNER_KEY) ?? emptyRosterCounts();
  const bruceRosterLegality = assessRosterLegality({
    roster: bruceRoster,
    rules: args.rosterRules,
    poolHas,
  });

  return {
    leagueId: args.leagueId,
    season: args.season,
    seed,
    rounds,
    picks,
    brucePicks,
    finalWeather: weather,
    rosterRules: args.rosterRules,
    bruceRosterLegality,
    poolHas,
    picksCompleted: picks.length,
    poolExhaustedAtPick: picks.length < totalPicks && weather.available.length === 0 ? picks.length + 1 : null,
  };
}
