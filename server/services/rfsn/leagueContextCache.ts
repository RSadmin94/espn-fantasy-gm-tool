/**
 * League context cache — load once per draft session.
 * Reads existing authorities only; never invents history.
 */

import { normalizePlayerKey } from "../../draftEngine/phase1/types";

export type CachedChampionship = {
  ownerKey: string;
  displayName: string;
  titles: number;
  titleSeasons: number[];
};

export type CachedChoicePick = {
  season: number;
  round: number;
  overallPick: number;
  ownerKey: string;
  ownerDisplayName: string;
  playerKey: string;
  playerName: string;
  position: string;
};

export type CachedRivalry = {
  focalOwnerName: string;
  rivalOwnerName: string;
  /** e.g. "14-7" (rival wins - rival losses from focal perspective, or labeled). */
  h2hRecord: string;
  rivalWins: number;
  rivalLosses: number;
  playoffEliminations: number;
  heatLabel?: string;
};

export type LeagueContextSnapshot = {
  leagueId: string;
  draftId: string;
  loadedAt: number;
  championships: CachedChampionship[];
  choices: CachedChoicePick[];
  rivalries: CachedRivalry[];
};

const cache = new Map<string, LeagueContextSnapshot>();

export function cacheKey(leagueId: string, draftId: string): string {
  return `${leagueId}:${draftId}`;
}

export function getLeagueContextCache(leagueId: string, draftId: string): LeagueContextSnapshot | null {
  return cache.get(cacheKey(leagueId, draftId)) ?? null;
}

/** Test / inject path — seed a snapshot without I/O. */
export function seedLeagueContextCache(snapshot: LeagueContextSnapshot): void {
  cache.set(cacheKey(snapshot.leagueId, snapshot.draftId), {
    ...snapshot,
    loadedAt: snapshot.loadedAt || Date.now(),
  });
}

export function resetLeagueContextCacheForTests(): void {
  cache.clear();
}

export function clearLeagueContextCache(leagueId: string, draftId: string): void {
  cache.delete(cacheKey(leagueId, draftId));
}

export function normOwnerLabel(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findChampionshipForOwner(
  snapshot: LeagueContextSnapshot,
  ownerName: string,
): CachedChampionship | null {
  const target = normOwnerLabel(ownerName);
  if (!target) return null;
  for (const c of snapshot.championships) {
    if (normOwnerLabel(c.displayName) === target) return c;
    if (normOwnerLabel(c.ownerKey) === target) return c;
  }
  // Fuzzy: display name contains / contained by
  for (const c of snapshot.championships) {
    const d = normOwnerLabel(c.displayName);
    if (d && (d.includes(target) || target.includes(d))) return c;
  }
  return null;
}

export function choicesForOwner(snapshot: LeagueContextSnapshot, ownerName: string): CachedChoicePick[] {
  const target = normOwnerLabel(ownerName);
  if (!target) return [];
  return snapshot.choices.filter(
    (c) =>
      normOwnerLabel(c.ownerDisplayName) === target ||
      normOwnerLabel(c.ownerKey) === target ||
      normOwnerLabel(c.ownerDisplayName).includes(target) ||
      target.includes(normOwnerLabel(c.ownerDisplayName)),
  );
}

export function priorPlayerConnections(
  snapshot: LeagueContextSnapshot,
  ownerName: string,
  playerName: string,
): CachedChoicePick[] {
  const pKey = normalizePlayerKey(playerName);
  if (!pKey) return [];
  return choicesForOwner(snapshot, ownerName).filter((c) => c.playerKey === pKey);
}

export function rivalryForOwner(
  snapshot: LeagueContextSnapshot,
  ownerName: string,
): CachedRivalry | null {
  const target = normOwnerLabel(ownerName);
  if (!target) return null;
  for (const r of snapshot.rivalries) {
    if (normOwnerLabel(r.rivalOwnerName) === target) return r;
    if (normOwnerLabel(r.focalOwnerName) === target) return r;
  }
  for (const r of snapshot.rivalries) {
    const rival = normOwnerLabel(r.rivalOwnerName);
    const focal = normOwnerLabel(r.focalOwnerName);
    if (rival.includes(target) || target.includes(rival)) return r;
    if (focal.includes(target) || target.includes(focal)) return r;
  }
  return null;
}

/**
 * Load snapshot from existing authorities (Hall of Fame + choice ledger + rivalry).
 * Failures degrade to empty evidence — never invent.
 */
export async function loadLeagueContextSnapshot(args: {
  leagueId: string;
  draftId: string;
  userId?: number | null;
}): Promise<LeagueContextSnapshot> {
  const empty: LeagueContextSnapshot = {
    leagueId: args.leagueId,
    draftId: args.draftId,
    loadedAt: Date.now(),
    championships: [],
    choices: [],
    rivalries: [],
  };

  try {
    const { getDb } = await import("../../db");
    const db = await getDb();
    if (!db) return empty;

    const championships: CachedChampionship[] = [];
    try {
      const { buildHallOfFamePayload } = await import("../../hallOfFameService");
      const hof = await buildHallOfFamePayload({
        db,
        leagueId: args.leagueId,
        userId: args.userId ?? 0,
      });
      for (const row of hof.championships.leaderboard) {
        championships.push({
          ownerKey: row.ownerKey,
          displayName: row.displayName,
          titles: row.titles,
          titleSeasons: [...row.titleSeasons],
        });
      }
    } catch {
      /* no invented championships */
    }

    const choices: CachedChoicePick[] = [];
    try {
      const { loadChoiceLedgerInputs } = await import("../../draftEngine/phase1/loadChoiceLedgerInputs");
      const { buildChoiceLedger } = await import("../../draftEngine/phase1/choiceLedger");
      const { confirmedActiveProfileKeySet } = await import("../../draftEngine/activeOwners");
      const { shared, draftRows } = await loadChoiceLedgerInputs({ db, leagueId: args.leagueId });
      const ledger = buildChoiceLedger({
        leagueId: args.leagueId,
        draftRows,
        allLeagueTeams: shared.allLeagueTeams,
        activeProfileKeys: confirmedActiveProfileKeySet(),
      });
      for (const rec of ledger.choiceRecords) {
        choices.push({
          season: rec.season,
          round: rec.round,
          overallPick: rec.overallPick,
          ownerKey: rec.chooserProfileKey,
          ownerDisplayName: rec.chooserDisplayName,
          playerKey: normalizePlayerKey(rec.chosenPlayer.playerName),
          playerName: rec.chosenPlayer.playerName,
          position: rec.chosenPlayer.position,
        });
      }
    } catch {
      /* no invented choices */
    }

    const rivalries: CachedRivalry[] = [];
    try {
      if (args.userId != null) {
        const { computeRivalryScores } = await import("../../rivalryService");
        const pairs = await computeRivalryScores(args.userId, args.leagueId);
        for (const p of pairs) {
          const rivalWins = p.h2hWins ?? 0;
          const rivalLosses = p.h2hLosses ?? 0;
          rivalries.push({
            focalOwnerName: String(p.ownerName ?? "").trim() || "Focal",
            rivalOwnerName: String(p.rivalName ?? "").trim(),
            h2hRecord: `${rivalWins}-${rivalLosses}`,
            rivalWins,
            rivalLosses,
            playoffEliminations: p.playoffEliminations ?? 0,
            heatLabel: p.heatLabel,
          });
        }
      }
    } catch {
      /* no invented rivalries */
    }

    return {
      leagueId: args.leagueId,
      draftId: args.draftId,
      loadedAt: Date.now(),
      championships,
      choices,
      rivalries,
    };
  } catch {
    return empty;
  }
}

/** Get cached snapshot or load once and store. */
export async function getOrLoadLeagueContextCache(args: {
  leagueId: string;
  draftId: string;
  userId?: number | null;
}): Promise<LeagueContextSnapshot> {
  const hit = getLeagueContextCache(args.leagueId, args.draftId);
  if (hit) return hit;
  const loaded = await loadLeagueContextSnapshot(args);
  seedLeagueContextCache(loaded);
  return loaded;
}
