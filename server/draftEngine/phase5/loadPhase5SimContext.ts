/**
 * Phase 5 — shared startup: ledger, souls, terrain lookup, ESPN-augmented pool.
 * Loads terrain per ledger season once (parallel) and caches in memory.
 */

import type { AppDb } from "../../db";
import { confirmedActiveProfileKeySet } from "../activeOwners";
import { buildChoiceLedger } from "../phase1/choiceLedger";
import { loadChoiceLedgerInputs } from "../phase1/loadChoiceLedgerInputs";
import type { ChoiceLedger } from "../phase1/types";
import { buildSeasonTerrain } from "../phase2/buildSeasonTerrain";
import { loadSeasonTerrainInputs } from "../phase2/loadSeasonTerrainInputs";
import type { SeasonTerrain, TerrainDraftPickRow } from "../phase2/types";
import { buildTerrainLookup, type TerrainLookup } from "../phase3/driveFeatures";
import { fitAllActiveSouls, type LeagueSoulRegistry } from "../phase4/fitAllSouls";
import { loadEspnSimPlayerPool, type EspnSimPoolStats } from "./loadEspnSimPool";
import { loadLeagueRosterRules } from "./loadLeagueRosterRules";
import type { LeagueRosterRules } from "./leagueRosterRules";
import {
  poolFromTerrain,
  resolveDraftOrderFromLedger,
  type DraftSlot,
} from "./loadSimDraftSetup";
import { SimTimer } from "./simTiming";
import type { SimPlayer } from "./weather";

export type Phase5SimContext = {
  leagueId: string;
  season: number;
  ledger: ChoiceLedger;
  terrain: SeasonTerrain;
  terrainLookup: TerrainLookup;
  registry: LeagueSoulRegistry;
  draftOrder: DraftSlot[];
  rosterRules: LeagueRosterRules;
  playerPool: SimPlayer[];
  poolHas: Partial<Record<string, boolean>>;
  poolStats: EspnSimPoolStats;
  skillPoolSize: number;
};

export async function loadPhase5SimContext(args: {
  db: AppDb;
  leagueId: string;
  season: number;
  orderSeason: number;
  userId?: number;
  timer?: SimTimer;
}): Promise<Phase5SimContext> {
  const timer = args.timer ?? new SimTimer(false);

  const { shared, draftRows } = await timer.timeAsync("startup:choiceLedger", () =>
    loadChoiceLedgerInputs({ db: args.db, leagueId: args.leagueId }),
  );
  const ledger = buildChoiceLedger({
    leagueId: args.leagueId,
    draftRows,
    allLeagueTeams: shared.allLeagueTeams,
    activeProfileKeys: confirmedActiveProfileKeySet(),
  });

  const seasonsNeeded = [
    ...new Set([...ledger.choiceRecords.map((r) => r.season), args.season]),
  ].sort((a, b) => a - b);
  const terrainInputsBySeason = new Map<
    number,
    Awaited<ReturnType<typeof loadSeasonTerrainInputs>>
  >();

  await timer.timeAsync("startup:terrainInputs", async () => {
    await Promise.all(
      seasonsNeeded.map(async (season) => {
        const inputs = await loadSeasonTerrainInputs({
          db: args.db,
          leagueId: args.leagueId,
          season,
        });
        terrainInputsBySeason.set(season, inputs);
      }),
    );
  });

  const buildTerrain = (season: number) => {
    const inputs = terrainInputsBySeason.get(season);
    if (!inputs) throw new Error(`Missing terrain inputs for season ${season}`);
    return buildSeasonTerrain({
      leagueId: args.leagueId,
      season,
      ...inputs,
      teamCount: 14,
    });
  };

  let terrain = timer.time("startup:simTerrain", () => buildTerrain(args.season));

  const poolSeasons = [args.orderSeason, args.orderSeason - 1, args.orderSeason - 2];
  const mergedPicks: TerrainDraftPickRow[] = [];
  const seen = new Set<string>();
  for (const s of poolSeasons) {
    const inp = terrainInputsBySeason.get(s) ?? (await loadSeasonTerrainInputs({ db: args.db, leagueId: args.leagueId, season: s }));
    terrainInputsBySeason.set(s, inp);
    for (const p of inp.draftPicks) {
      const key = `${p.playerName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      mergedPicks.push({ ...p, season: args.season });
    }
  }

  if (poolFromTerrain(terrain).length < 180) {
    const priorInputs = terrainInputsBySeason.get(args.orderSeason)!;
    const simInputs = terrainInputsBySeason.get(args.season)!;
    terrain = buildSeasonTerrain({
      leagueId: args.leagueId,
      season: args.season,
      draftPicks:
        mergedPicks.length > 80
          ? mergedPicks
          : priorInputs.draftPicks.map((p) => ({ ...p, season: args.season })),
      priorSeasonPoints: simInputs.priorSeasonPoints.length
        ? simInputs.priorSeasonPoints
        : priorInputs.priorSeasonPoints,
      playerCache: priorInputs.playerCache.length ? priorInputs.playerCache : simInputs.playerCache,
      teamCount: 14,
    });
  }

  const terrainMap = timer.time("startup:terrainMap", () => {
    const m = new Map<number, SeasonTerrain>();
    for (const season of seasonsNeeded) m.set(season, buildTerrain(season));
    return m;
  });
  const terrainLookup = buildTerrainLookup(terrainMap);

  const registry = timer.time("startup:fitSouls", () =>
    fitAllActiveSouls({ leagueId: args.leagueId, ledger, terrainLookup }),
  );

  const skillPlayers = poolFromTerrain(terrain);
  const { pool, poolHas, stats } = await timer.timeAsync("startup:espnPool", () =>
    loadEspnSimPlayerPool({
      db: args.db,
      leagueId: args.leagueId,
      skillPlayers,
      userId: args.userId,
      draftPickFallback: mergedPicks,
    }),
  );

  const rosterRules = await timer.timeAsync("startup:rosterRules", () =>
    loadLeagueRosterRules({ db: args.db, leagueId: args.leagueId, season: args.season }),
  );

  const draftOrder = resolveDraftOrderFromLedger({ ledger, orderSeason: args.orderSeason });

  return {
    leagueId: args.leagueId,
    season: args.season,
    ledger,
    terrain,
    terrainLookup,
    registry,
    draftOrder,
    rosterRules,
    playerPool: pool,
    poolHas,
    poolStats: stats,
    skillPoolSize: skillPlayers.length,
  };
}
