// FILE: server/draftEngine/runSoulsDraftBoard.ts
// Cached server-side runner for the Phase 5 behavioral ("souls") draft. Ports the
// scripts/runDraftEnginePhase5Full.mts pipeline so the Draft War Room can serve a
// souls-simulated board behind a toggle. The run is heavy (~30-40s), so results are
// cached per league+season. League-gated: only leagues whose owners have fitted souls
// (currently the primary behavioral league). Callers get null for unsupported leagues
// and fall back to the heuristic mock.

import { confirmedActiveProfileKeySet } from "./activeOwners";
import { PRIMARY_BEHAVIORAL_LEAGUE_ID } from "./constants";
import { loadChoiceLedgerInputs } from "./phase1/loadChoiceLedgerInputs";
import { buildChoiceLedger } from "./phase1/choiceLedger";
import { loadSeasonTerrainInputs } from "./phase2/loadSeasonTerrainInputs";
import { buildSeasonTerrain } from "./phase2/buildSeasonTerrain";
import { buildTerrainLookup } from "./phase3/driveFeatures";
import { fitAllActiveSouls } from "./phase4/fitAllSouls";
import { resolveDraftOrderFromLedger, poolFromTerrain } from "./phase5/loadSimDraftSetup";
import { loadLeagueRosterRules } from "./phase5/loadLeagueRosterRules";
import { simulateDraft, type SimPickRecord } from "./phase5/simulateDraft";

type Db = Parameters<typeof loadChoiceLedgerInputs>[0]["db"];

export type SoulsBoardPick = {
  overall: number;
  round: number;
  pickInRound: number;
  ownerKey: string;
  ownerName: string;
  playerName: string;
  position: string;
  reason: string;
  lowConfidence: boolean;
};

export type SoulsDraftBoard = {
  leagueId: string;
  season: number;
  teamCount: number;
  rounds: number;
  picks: SoulsBoardPick[];
  picksCompleted: number;
  computedAt: number;
};

const cache = new Map<string, SoulsDraftBoard>();
const FRESH_MS = 6 * 60 * 60 * 1000; // 6h — completed-season inputs are stable

/** Only leagues with fitted behavioral souls can run the engine. */
export function soulsEngineSupportsLeague(leagueId: string): boolean {
  return String(leagueId) === String(PRIMARY_BEHAVIORAL_LEAGUE_ID);
}

/** Peek the cache without triggering a (slow) run. */
export function peekSoulsDraftBoard(leagueId: string, season = 2026): SoulsDraftBoard | null {
  const hit = cache.get(`${String(leagueId)}:${season}`);
  return hit && Date.now() - hit.computedAt < FRESH_MS ? hit : null;
}

export async function runSoulsDraftBoard(opts: {
  db: Db;
  leagueId: string;
  season?: number; // sim season (the upcoming draft); default 2026
  force?: boolean;
}): Promise<SoulsDraftBoard | null> {
  const leagueId = String(opts.leagueId);
  if (!soulsEngineSupportsLeague(leagueId)) return null;

  const simSeason = opts.season ?? 2026;
  const orderSeason = simSeason - 1;
  const seed = Number(leagueId) || 457622;
  const key = `${leagueId}:${simSeason}`;

  const hit = cache.get(key);
  if (hit && !opts.force && Date.now() - hit.computedAt < FRESH_MS) return hit;

  const db = opts.db;

  // 1. Choice ledger — every "chose X over {Y,Z}" event across league history.
  const { shared, draftRows } = await loadChoiceLedgerInputs({ db, leagueId });
  const ledger = buildChoiceLedger({
    leagueId,
    draftRows,
    allLeagueTeams: shared.allLeagueTeams,
    activeProfileKeys: confirmedActiveProfileKeySet(),
  });

  // 2. Terrain for the sim season (position-normalized player value board).
  const terrainInputs = await loadSeasonTerrainInputs({ db, leagueId, season: simSeason });
  let terrain = buildSeasonTerrain({ leagueId, season: simSeason, ...terrainInputs, teamCount: 14 });

  // 3. Merged draftable universe from recent seasons (fills the board out to a full draft).
  const mergedPicks: Awaited<ReturnType<typeof loadSeasonTerrainInputs>>["draftPicks"] = [];
  const seen = new Set<string>();
  for (const s of [orderSeason, orderSeason - 1, orderSeason - 2]) {
    const inp = await loadSeasonTerrainInputs({ db, leagueId, season: s });
    for (const p of inp.draftPicks) {
      const k = `${p.playerName}`.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      mergedPicks.push({ ...p, season: simSeason });
    }
  }

  // 4. If the sim-season pool is thin, rebuild terrain from the draft universe + value signals.
  if (poolFromTerrain(terrain).length < 180) {
    const priorInputs = await loadSeasonTerrainInputs({ db, leagueId, season: orderSeason });
    const simPriorInputs = await loadSeasonTerrainInputs({ db, leagueId, season: simSeason });
    terrain = buildSeasonTerrain({
      leagueId,
      season: simSeason,
      draftPicks:
        mergedPicks.length > 80
          ? mergedPicks
          : priorInputs.draftPicks.map((p) => ({ ...p, season: simSeason })),
      priorSeasonPoints: simPriorInputs.priorSeasonPoints.length
        ? simPriorInputs.priorSeasonPoints
        : priorInputs.priorSeasonPoints,
      playerCache: priorInputs.playerCache.length ? priorInputs.playerCache : simPriorInputs.playerCache,
      teamCount: 14,
    });
  }

  // 5. League roster rules (starters, bench, legality).
  const rosterRules = await loadLeagueRosterRules({ db, leagueId, season: simSeason });

  // 6. Terrain lookup across every historical season — the soul model is fit against this.
  const seasons = [...new Set(draftRows.map((r) => r.season))].sort();
  const terrainMap = new Map<number, ReturnType<typeof buildSeasonTerrain>>();
  for (const season of seasons) {
    const inputs = await loadSeasonTerrainInputs({ db, leagueId, season });
    terrainMap.set(season, buildSeasonTerrain({ leagueId, season, ...inputs }));
  }
  const terrainLookup = buildTerrainLookup(terrainMap);

  // 7. Fit each owner's soul + resolve the draft order from the prior-season ledger.
  const registry = fitAllActiveSouls({ leagueId, ledger, terrainLookup });
  const draftOrder = resolveDraftOrderFromLedger({ ledger, orderSeason });

  // 8. Simulate the full board — every owner drafts in-character.
  const result = simulateDraft({
    leagueId,
    season: simSeason,
    terrain,
    souls: registry.souls,
    draftOrder,
    ledger,
    rosterRules,
    fillerDraftPicks: mergedPicks,
    rounds: 16,
    seed,
  });

  const teamCount = draftOrder.length || 14;
  const picks: SoulsBoardPick[] = result.picks.map((p: SimPickRecord) => ({
    overall: p.overallPick,
    round: p.round,
    pickInRound: ((p.overallPick - 1) % teamCount) + 1,
    ownerKey: p.chooserProfileKey,
    ownerName: p.chooserDisplayName,
    playerName: p.chosen.playerName,
    position: p.chosen.position,
    reason: p.lowConfidencePick ? "Behavioral pick (thin signal)" : "Behavioral pick",
    lowConfidence: p.lowConfidencePick,
  }));

  const board: SoulsDraftBoard = {
    leagueId,
    season: simSeason,
    teamCount,
    rounds: result.rounds,
    picks,
    picksCompleted: result.picksCompleted,
    computedAt: Date.now(),
  };
  cache.set(key, board);
  return board;
}
