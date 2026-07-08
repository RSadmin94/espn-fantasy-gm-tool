// FILE: server/draftEngine/runSoulsDraftBoard.ts
// Cached server-side runner for the Phase 5 behavioral ("souls") draft. Ports the
// scripts/runDraftEnginePhase5Full.mts pipeline so the Draft War Room can serve a
// souls-simulated board behind a toggle. The run is heavy (~30-40s), so results are
// cached per league+season. League-gated: only leagues whose owners have fitted souls
// (currently the primary behavioral league). Callers get null for unsupported leagues
// and fall back to the heuristic mock.

import { sql } from "drizzle-orm";
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
  teamId: number;
  teamName: string;
  ownerKey: string;
  ownerName: string;
  playerName: string;
  position: string;
  reason: string;
  lowConfidence: boolean;
  isKeeperSlot: boolean;
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

export type SoulsKeeperInput = { teamId: number; keeperRound: number; player: string; position: string };

export async function runSoulsDraftBoard(opts: {
  db: Db;
  leagueId: string;
  season?: number; // sim season (the upcoming draft); default 2026
  force?: boolean;
  keepers?: SoulsKeeperInput[];
}): Promise<SoulsDraftBoard | null> {
  const leagueId = String(opts.leagueId);
  if (!soulsEngineSupportsLeague(leagueId)) return null;

  const simSeason = opts.season ?? 2026;
  const orderSeason = simSeason - 1;
  const seed = Number(leagueId) || 457622;
  const keeperSig = (opts.keepers ?? [])
    .map((k) => `${k.teamId}:${k.keeperRound}:${String(k.player).toLowerCase().trim()}`)
    .sort()
    .join("|");
  const key = `${leagueId}:${simSeason}:${keeperSig}`;

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
  for (const s of [orderSeason, orderSeason - 1, orderSeason - 2, orderSeason - 3, orderSeason - 4, orderSeason - 5]) {
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

  // 7. Fit each owner's soul + resolve the fallback (snake) draft order.
  const registry = fitAllActiveSouls({ leagueId, ledger, terrainLookup });
  const draftOrder = resolveDraftOrderFromLedger({ ledger, orderSeason });

  // 7b. Build the REAL, trade-aware pick order from the SAME 2026 draft data the mock uses, so the
  // souls draft steps through the identical order: owners who traded FOR extra picks pick more than
  // once in a round; owners who traded theirs away skip that slot. Each draft slot's team maps to its
  // owner via the team's ESPN owner id (profile key = "id:{ownerId}"), reusing the resolved slots.
  const slotByKey = new Map(draftOrder.map((s) => [s.profileOwnerKey, s]));
  const slotByName = new Map(draftOrder.map((s) => [s.displayName.trim().toLowerCase(), s]));
  const [seqRows] = (await db.execute(sql`
    SELECT dp.overallPick, dp.roundId, dp.teamId, t.ownerId, t.ownerName, t.name AS teamName
    FROM draft_picks dp
    LEFT JOIN teams t ON t.leagueId = dp.leagueId AND t.season = dp.season AND t.teamId = dp.teamId
    WHERE dp.leagueId = ${leagueId} AND dp.season = ${simSeason}
    ORDER BY dp.overallPick
  `)) as unknown as [Array<Record<string, unknown>>];
  const pickSequence: Array<(typeof draftOrder)[number] | undefined> = [];
  const teamByProfileKey = new Map<string, { teamId: number; teamName: string }>();
  let maxRound = 0;
  for (const r of seqRows) {
    const overall = Number(r.overallPick);
    if (!Number.isFinite(overall) || overall < 1) continue;
    maxRound = Math.max(maxRound, Number(r.roundId) || 0);
    // Prefer the ESPN owner id; fall back to owner name (an owner's GUID can change across seasons).
    const ownerId = r.ownerId ? String(r.ownerId) : "";
    const byGuid = ownerId ? slotByKey.get(`id:${ownerId}`) : undefined;
    const byName = !byGuid && r.ownerName ? slotByName.get(String(r.ownerName).trim().toLowerCase()) : undefined;
    const slot = byGuid ?? byName;
    pickSequence[overall - 1] = slot;
    if (slot && !teamByProfileKey.has(slot.profileOwnerKey)) {
      teamByProfileKey.set(slot.profileOwnerKey, { teamId: Number(r.teamId) || 0, teamName: String(r.teamName ?? slot.displayName) });
    }
  }
  const mapped = pickSequence.filter(Boolean).length;
  const useRealOrder = seqRows.length > 0 && mapped >= Math.floor(seqRows.length * 0.9);

  // 7c. Reserve keepers: pull kept players out of the pool and lock each keeper's slot (the team's
  // pick at its keeper round) — exactly like the mock, so no kept player is ever drafted twice.
  const overallByTeamRound = new Map<string, number[]>();
  const overallByTeam = new Map<number, number[]>();
  for (const r of seqRows) {
    const tid = Number(r.teamId);
    const rnd = Number(r.roundId);
    const overall = Number(r.overallPick);
    if (!tid || !rnd || !overall) continue;
    const kkey = `${tid}:${rnd}`;
    const arr = overallByTeamRound.get(kkey) ?? [];
    arr.push(overall);
    overallByTeamRound.set(kkey, arr);
    const tarr = overallByTeam.get(tid) ?? [];
    tarr.push(overall);
    overallByTeam.set(tid, tarr);
  }
  const keeperByOverall = new Map<number, { player: string; position: string }>();
  const excludeNames = new Set<string>();
  for (const k of opts.keepers ?? []) {
    const name = String(k.player ?? "").trim();
    if (!name || name.toLowerCase() === "unknown") continue;
    const teamId = Number(k.teamId);
    const preferred = (overallByTeamRound.get(`${teamId}:${Number(k.keeperRound)}`) ?? []).slice().sort((a, b) => a - b);
    const anyTeam = (overallByTeam.get(teamId) ?? []).slice().sort((a, b) => a - b);
    // Place the keeper on its round slot if the team has one there; otherwise any of the team's picks.
    const overall = preferred.find((o) => !keeperByOverall.has(o)) ?? anyTeam.find((o) => !keeperByOverall.has(o));
    if (overall) {
      keeperByOverall.set(overall, { player: name, position: k.position || "?" });
      excludeNames.add(name.toLowerCase()); // only exclude from the pool once we've actually reserved a slot
    }
  }

  // 8. Simulate the full board — every owner drafts in-character, in the real trade-aware order,
  //    with kept players removed from the pool so they can't be drafted.
  const result = simulateDraft({
    leagueId,
    season: simSeason,
    terrain,
    souls: registry.souls,
    draftOrder,
    ledger,
    rosterRules,
    fillerDraftPicks: mergedPicks,
    rounds: useRealOrder && maxRound > 0 ? maxRound : 16,
    seed,
    pickSequence: useRealOrder ? pickSequence : undefined,
    excludePlayers: excludeNames,
  });

  const teamCount = draftOrder.length || 14;
  const picks: SoulsBoardPick[] = result.picks.map((p: SimPickRecord) => {
    const team = teamByProfileKey.get(p.chooserProfileKey);
    const keeper = keeperByOverall.get(p.overallPick);
    return {
      overall: p.overallPick,
      round: p.round,
      pickInRound: ((p.overallPick - 1) % teamCount) + 1,
      teamId: team?.teamId ?? 0,
      teamName: team?.teamName ?? p.chooserDisplayName,
      ownerKey: p.chooserProfileKey,
      ownerName: p.chooserDisplayName,
      playerName: keeper ? keeper.player : p.chosen.playerName,
      position: keeper ? keeper.position : p.chosen.position,
      reason: keeper
        ? `Keeper — Round ${p.round} reserved`
        : p.lowConfidencePick
          ? "Behavioral pick (thin signal)"
          : "Behavioral pick",
      lowConfidence: keeper ? false : p.lowConfidencePick,
      isKeeperSlot: !!keeper,
    };
  });

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
