/**
 * Phase 5 — sequential draft simulation (weather + moment).
 */

import { BRUCE_PROFILE_OWNER_KEY } from "../activeOwners";
import type { SeasonTerrain } from "../phase2/types";
import { buildTerrainLookup, type TerrainLookup } from "../phase3/driveFeatures";
import type { OwnerSoulProfile } from "../phase4/fitAllSouls";
import {
  buildOwnerPriorKeys,
  chooserAtPick,
  roundForPick,
  type DraftSlot,
} from "./loadSimDraftSetup";
import { resolveMoment, type MomentDecision } from "./moment";
import { mulberry32, type Rng } from "./rng";
import type { LeagueRosterRules } from "./leagueRosterRules";
import {
  addToRoster,
  assessRosterLegality,
  emptyRosterCounts,
  type RosterCounts,
  type RosterLegalityReport,
} from "./rosterConstruction";
import type { SimTimingReport } from "./simTiming";
import { SimTimer } from "./simTiming";
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
  poolSize: number;
  timing?: SimTimingReport;
};

export function simulateDraft(args: {
  leagueId: string;
  season: number;
  terrain: SeasonTerrain;
  souls: OwnerSoulProfile[];
  draftOrder: DraftSlot[];
  ledger: ChoiceLedger;
  rosterRules: LeagueRosterRules;
  /** Pre-built player pool (ESPN + terrain). When set, skips historical filler augmentation. */
  playerPool?: SimPlayer[];
  poolHas?: Partial<Record<RosterPosition, boolean>>;
  terrainLookup?: TerrainLookup;
  rounds?: number;
  seed?: number;
  profile?: boolean;
}): DraftSimulationResult {
  const teamCount = args.draftOrder.length;
  const rounds = args.rounds ?? 16;
  const totalPicks = teamCount * rounds;
  const seed = args.seed ?? 457622;
  const rng: Rng = mulberry32(seed);
  const timer = new SimTimer(args.profile ?? false);

  const soulByKey = new Map(args.souls.map((s) => [s.profileOwnerKey, s]));
  const priorKeys = buildOwnerPriorKeys({ ledger: args.ledger });
  const terrainLookup =
    args.terrainLookup ?? buildTerrainLookup(new Map([[args.season, args.terrain]]));

  const pool = args.playerPool ?? [];
  const poolHas = args.poolHas ?? { QB: true, RB: true, WR: true, TE: true };
  if (!args.playerPool) {
    throw new Error("simulateDraft requires playerPool — build via loadEspnSimPlayerPool or loadPhase5SimContext");
  }

  let weather = createInitialWeather({
    leagueId: args.leagueId,
    season: args.season,
    teamCount,
    pool,
  });

  const rosters = new Map<string, RosterCounts>();
  const picksMade = new Map<string, number>();
  for (const slot of args.draftOrder) {
    rosters.set(slot.profileOwnerKey, emptyRosterCounts());
    picksMade.set(slot.profileOwnerKey, 0);
  }

  const picks: SimPickRecord[] = [];

  for (let overallPick = 1; overallPick <= totalPicks && weather.available.length > 0; overallPick++) {
    const pickT0 = args.profile ? performance.now() : 0;
    const chooser = chooserAtPick({ overallPick, draftOrder: args.draftOrder });
    const soul = soulByKey.get(chooser.profileOwnerKey);
    if (!soul) continue;

    const round = roundForPick(overallPick, teamCount);
    const roster = rosters.get(chooser.profileOwnerKey) ?? emptyRosterCounts();
    const priors = priorKeys.get(chooser.profileOwnerKey) ?? new Set<string>();
    const ownerPicksMade = picksMade.get(chooser.profileOwnerKey) ?? 0;
    const ownerPicksRemaining = rounds - ownerPicksMade;

    const moment = timer.time("pick:resolveMoment", () =>
      resolveMoment({
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
      }),
    );
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
    picksMade.set(chooser.profileOwnerKey, ownerPicksMade + 1);
    weather = timer.time("pick:mutateWeather", () =>
      mutateWeatherAfterPick({
        weather,
        chosen,
        chooserProfileKey: chooser.profileOwnerKey,
        overallPick,
      }),
    );

    if (args.profile) timer.recordPick(performance.now() - pickT0);
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
    poolSize: pool.length,
    timing: args.profile ? timer.report() : undefined,
  };
}
