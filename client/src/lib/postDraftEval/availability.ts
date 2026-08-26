import { playerIdentitiesOverlap, playerIdentityKeys } from "./names";
import { UNAVAILABLE_PLAYER_LABEL } from "./playerDisplay";
import type { HistoricalPick, RankedPlayer } from "./types";

export type TakenIndex = {
  keys: Set<string>;
  byKey: Map<string, HistoricalPick>;
};

export function buildTakenBefore(picks: readonly HistoricalPick[], overallPick: number): TakenIndex {
  const keys = new Set<string>();
  const byKey = new Map<string, HistoricalPick>();
  for (const pick of picks) {
    if (pick.overallPick >= overallPick) continue;
    for (const key of playerIdentityKeys({
      playerId: pick.playerId,
      name: pick.playerName,
      position: pick.position,
    })) {
      keys.add(key);
      if (!byKey.has(key)) byKey.set(key, pick);
    }
  }
  return { keys, byKey };
}

export function isPlayerTaken(player: {
  playerId?: number | null;
  name?: string | null;
  position?: string | null;
}, taken: TakenIndex): HistoricalPick | null {
  for (const key of playerIdentityKeys(player)) {
    if (taken.keys.has(key)) return taken.byKey.get(key) ?? null;
  }
  return null;
}

/**
 * A ranked player may be recommended only when draft history proves they
 * were not already selected before this overall pick.
 */
export function availableBoardPlayers(
  board: readonly RankedPlayer[],
  taken: TakenIndex,
  extraTakenKeys?: ReadonlySet<string>,
): RankedPlayer[] {
  const out: RankedPlayer[] = [];
  for (const player of board) {
    if (!player.name.trim()) continue;
    if (isPlayerTaken({ playerId: player.playerId, name: player.name, position: player.position }, taken)) {
      continue;
    }
    if (extraTakenKeys && extraTakenKeys.size > 0) {
      const keys = playerIdentityKeys({
        playerId: player.playerId,
        name: player.name,
        position: player.position,
      });
      if (keys.some((k) => extraTakenKeys.has(k))) continue;
    }
    out.push(player);
  }
  return out;
}

export type AvailabilityReason =
  | "AVAILABLE"
  | "KEEPER"
  | "ALREADY_DRAFTED"
  | "ALREADY_ON_RIVALS_ROSTER";

export type PlayerRef = {
  playerId?: number | null;
  name?: string | null;
  position?: string | null;
};

export type PlayerAvailability = {
  player: RankedPlayer;
  keeper: boolean;
  historicalOverallPick: number | null;
  alreadyOnRivalsRoster: boolean;
  available: boolean;
  reason: AvailabilityReason;
};

/**
 * Conservative policy: DB `isKeeper` wins. A keeper is pre-draft unavailable
 * regardless of the stored overall pick or a conflicting raw ESPN keeper flag.
 */
export function leagueKeeperPicks(picks: readonly HistoricalPick[]): HistoricalPick[] {
  return picks.filter((pick) => pick.isKeeper);
}

function matchingHistoricalPicks(draft: readonly HistoricalPick[], player: PlayerRef): HistoricalPick[] {
  return draft.filter((pick) =>
    playerIdentitiesOverlap(
      { playerId: pick.playerId, name: pick.playerName, position: pick.position },
      player,
    ),
  );
}

function alreadyOnRivalsRoster(player: PlayerRef, rivalsRosterKeys?: ReadonlySet<string>): boolean {
  if (!rivalsRosterKeys || rivalsRosterKeys.size === 0) return false;
  return playerIdentityKeys(player).some((key) => rivalsRosterKeys.has(key));
}

/**
 * Counterfactual availability at a user slot.
 *
 * Keepers (user + opponents) are removed before Pick 1.
 * Other teams stay on their historical selections: a non-keeper is unavailable
 * only when another team selected them at overallPick < N.
 * A player historically selected AFTER N is still available at N.
 * The user's replaced original selection is released back into the pool unless
 * Rivals already rostered that player. Never select the same player twice.
 */
export function playerAvailabilityAtPick(args: {
  player: PlayerRef;
  overallPick: number;
  historicalDraft: readonly HistoricalPick[];
  userTeamId: number;
  rivalsRosterKeys?: ReadonlySet<string>;
  /**
   * Actual-decision path: the user's own earlier live picks remain taken.
   * Rivals redraft path: those replaced originals are released (default false).
   */
  treatUserHistoricalAsTaken?: boolean;
}): Omit<PlayerAvailability, "player"> {
  const matches = matchingHistoricalPicks(args.historicalDraft, args.player);
  const keeperHit = matches.find((pick) => pick.isKeeper) ?? null;
  const onRivals = alreadyOnRivalsRoster(args.player, args.rivalsRosterKeys);
  const draftedEarlier = matches.find((pick) => {
    if (pick.isKeeper) return false;
    if (pick.overallPick >= args.overallPick) return false;
    if (args.treatUserHistoricalAsTaken) return true;
    return pick.teamId !== args.userTeamId;
  }) ?? null;
  const historicalOverallPick =
    keeperHit?.overallPick ??
    (matches.length > 0 ? Math.min(...matches.map((pick) => pick.overallPick)) : null);

  if (keeperHit) {
    return {
      keeper: true,
      historicalOverallPick,
      alreadyOnRivalsRoster: onRivals,
      available: false,
      reason: "KEEPER",
    };
  }
  if (onRivals) {
    return {
      keeper: false,
      historicalOverallPick,
      alreadyOnRivalsRoster: true,
      available: false,
      reason: "ALREADY_ON_RIVALS_ROSTER",
    };
  }
  if (draftedEarlier) {
    return {
      keeper: false,
      historicalOverallPick,
      alreadyOnRivalsRoster: false,
      available: false,
      reason: "ALREADY_DRAFTED",
    };
  }
  return {
    keeper: false,
    historicalOverallPick,
    alreadyOnRivalsRoster: false,
    available: true,
    reason: "AVAILABLE",
  };
}

export function getAvailablePlayersAtPick(args: {
  overallPick: number;
  historicalDraft: readonly HistoricalPick[];
  userTeamId: number;
  rivalsRosterKeys?: ReadonlySet<string>;
  treatUserHistoricalAsTaken?: boolean;
  board: readonly RankedPlayer[];
}): { available: RankedPlayer[]; debug: PlayerAvailability[] } {
  const debug: PlayerAvailability[] = [];
  const available: RankedPlayer[] = [];
  for (const player of args.board) {
    if (!player.name.trim()) continue;
    const status = playerAvailabilityAtPick({
      player: { playerId: player.playerId, name: player.name, position: player.position },
      overallPick: args.overallPick,
      historicalDraft: args.historicalDraft,
      userTeamId: args.userTeamId,
      rivalsRosterKeys: args.rivalsRosterKeys,
      treatUserHistoricalAsTaken: args.treatUserHistoricalAsTaken,
    });
    const row: PlayerAvailability = { player, ...status };
    debug.push(row);
    if (row.available) available.push(player);
  }
  return { available, debug };
}

export function addPlayerIdentityKeys(
  set: Set<string>,
  player: PlayerRef,
): void {
  for (const key of playerIdentityKeys(player)) set.add(key);
}

export function pickToRankedPlayer(pick: HistoricalPick, board: readonly RankedPlayer[]): RankedPlayer {
  const takenSelf: TakenIndex = { keys: new Set(), byKey: new Map() };
  void takenSelf;
  const match = board.find((p) =>
    playerIdentityKeys({ playerId: pick.playerId, name: pick.playerName, position: pick.position }).some((k) =>
      playerIdentityKeys({ playerId: p.playerId, name: p.name, position: p.position }).includes(k),
    ),
  );
  if (match) {
    return {
      ...match,
      playerId: match.playerId ?? pick.playerId,
      name: pick.playerName.trim() || match.name || UNAVAILABLE_PLAYER_LABEL,
      position: pick.position || match.position,
    };
  }
  return {
    playerId: pick.playerId,
    fpId: null,
    name: pick.playerName.trim() || UNAVAILABLE_PLAYER_LABEL,
    position: pick.position || "UNK",
    ecrRank: null,
    adp: null,
    tier: null,
    projectedPoints: null,
    marketValue: null,
  };
}

export function auditDraftIntegrity(picks: readonly HistoricalPick[]): {
  uniqueOverallPicks: number;
  duplicateOverallPicks: number;
  missingPlayerIdCount: number;
  missingPlayerNameCount: number;
  warnings: string[];
} {
  const seen = new Set<number>();
  let duplicateOverallPicks = 0;
  let missingPlayerIdCount = 0;
  let missingPlayerNameCount = 0;
  let missingTeamIdCount = 0;
  const warnings: string[] = [];
  for (const pick of picks) {
    if (seen.has(pick.overallPick)) duplicateOverallPicks += 1;
    else seen.add(pick.overallPick);
    if (!(Number(pick.playerId) > 0)) missingPlayerIdCount += 1;
    if (!(Number(pick.teamId) > 0)) missingTeamIdCount += 1;
    if (!pick.playerName.trim()) {
      missingPlayerNameCount += 1;
      if (!(Number(pick.playerId) > 0)) {
        warnings.push(`Pick ${pick.overallPick} has no player name — availability at that slot cannot be proven by identity.`);
      }
    }
  }
  if (duplicateOverallPicks > 0) {
    warnings.push(`${duplicateOverallPicks} duplicate overall pick number(s) after ingest.`);
  }
  if (picks.length > 0 && missingTeamIdCount / picks.length >= 0.5) {
    warnings.push(
      "This season's historical recap is missing team identity, so Rivals cannot evaluate a specific owner's draft.",
    );
  }
  return {
    uniqueOverallPicks: seen.size,
    duplicateOverallPicks,
    missingPlayerIdCount,
    missingPlayerNameCount,
    warnings,
  };
}
