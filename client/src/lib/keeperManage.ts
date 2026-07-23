/**
 * Pure helpers for Keeper Center management UI.
 * Persistence stays on espn.setManualKeeperSelection — no second state.
 */
export type ManualKeeperRow = {
  ownerKey: string;
  playerId: number;
  playerName: string;
  position: string;
  keeperRoundPick: number;
};

export function countKeepersForOwner(
  selections: ReadonlyArray<{ ownerKey: string }>,
  ownerKey: string,
): number {
  return selections.filter((s) => s.ownerKey === ownerKey).length;
}

export function isPlayerAlreadyKept(
  selections: ReadonlyArray<{ playerId: number }>,
  playerId: number,
): boolean {
  return selections.some((s) => s.playerId === playerId);
}

/** Returns null when add is allowed; otherwise a short reason. */
export function keeperAddBlockReason(args: {
  selections: ReadonlyArray<{ ownerKey: string; playerId: number }>;
  ownerKey: string;
  playerId: number;
  keeperLimit: number | null;
}): string | null {
  if (!args.ownerKey.trim()) return "Pick a team";
  if (!Number.isFinite(args.playerId) || args.playerId <= 0) return "Pick a player";
  if (isPlayerAlreadyKept(args.selections, args.playerId)) {
    return "That player is already a keeper in your workspace";
  }
  const limit = args.keeperLimit;
  if (limit == null || limit <= 0) return null;
  const count = countKeepersForOwner(args.selections, args.ownerKey);
  if (limit === 1) return null; // server replaces
  if (count >= limit) {
    return `Keeper limit reached (${count}/${limit}). Remove one first.`;
  }
  return null;
}

export function keeperSlotsLabel(count: number, limit: number | null): string {
  if (limit == null || limit <= 0) return `${count} keeper${count === 1 ? "" : "s"} selected`;
  return `${count} of ${limit} keeper slot${limit === 1 ? "" : "s"} used`;
}

export function formatKeeperRoundPick(pick: number | null | undefined): string {
  const n = Number(pick ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "Auto (later pick)";
  if (n === 1) return "1st pick in round";
  if (n === 2) return "2nd pick in round";
  if (n === 3) return "3rd pick in round";
  return `${n}th pick in round`;
}
