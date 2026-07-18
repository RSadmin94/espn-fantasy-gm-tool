/**
 * Pure helpers for RFSN Live locked-pick notifications from Draft War Room.
 */

export type LockedPickScheduleSlot = {
  pickNumber: number;
  round: number;
  roundPick?: number;
  teamId: string | number;
  ownerName?: string;
  isKeeperSlot?: boolean;
};

export type LockedPickPlayerResult = {
  name?: string;
  position?: string;
  id?: string | number;
  nflTeam?: string | null;
  adp?: number | null;
};

export type LockedPickNotifyInput = {
  leagueId: string;
  draftId: string;
  slot: LockedPickScheduleSlot;
  player: LockedPickPlayerResult;
  teamCount: number;
  draftComplete?: boolean;
  draftPace?: "broadcast" | "brisk" | "turbo";
};

export function lockedPickNotifyKey(
  draftId: string,
  pickNumber: number,
  player: Pick<LockedPickPlayerResult, "id" | "name">,
): string {
  const playerId = String(player.id ?? `pick:${pickNumber}`);
  const playerName = player.name?.trim().toLowerCase() ?? "";
  return `${draftId}:${pickNumber}:${playerId}:${playerName}`;
}

export function buildLockedPickNotifyPayload(input: LockedPickNotifyInput) {
  const roundPick =
    input.slot.roundPick ??
    ((input.slot.pickNumber - 1) % Math.max(1, input.teamCount)) + 1;
  const ownerName = input.slot.ownerName?.trim() || "Unknown Owner";
  const playerName = input.player.name?.trim() || "Unknown Player";
  const position = String(input.player.position ?? "?").toUpperCase();

  return {
    leagueId: input.leagueId,
    draftId: input.draftId,
    pick: {
      overallPick: input.slot.pickNumber,
      round: input.slot.round,
      roundPick,
      teamId: String(input.slot.teamId),
      ownerName,
      playerId: String(input.player.id ?? `pick:${input.slot.pickNumber}`),
      playerName,
      position,
      nflTeam: input.player.nflTeam ?? null,
      adp: input.player.adp ?? null,
    },
    draftComplete: input.draftComplete ?? false,
    draftPace: input.draftPace,
    teamCount: input.teamCount,
  };
}

/** Returns pick keys newly finalized since the previous results map. */
export function detectNewlyLockedPicks(
  prev: Readonly<Record<number, LockedPickPlayerResult>>,
  next: Readonly<Record<number, LockedPickPlayerResult>>,
  schedule: readonly LockedPickScheduleSlot[],
): LockedPickNotifyInput[] {
  const out: LockedPickNotifyInput[] = [];
  const teamCount = schedule.length > 0
    ? Math.max(...schedule.map((s) => Number(s.roundPick ?? 1)), 14)
    : 14;

  for (const slot of schedule) {
    if (slot.isKeeperSlot) continue;
    const pn = slot.pickNumber;
    const player = next[pn];
    if (!player?.name) continue;
    const prevPlayer = prev[pn];
    if (prevPlayer?.name === player.name) continue;

    out.push({
      leagueId: "",
      draftId: "",
      slot,
      player,
      teamCount,
    });
  }
  return out;
}

export function filterUnnotifiedPicks(
  picks: LockedPickNotifyInput[],
  alreadyNotified: ReadonlySet<string>,
): { toNotify: LockedPickNotifyInput[]; nextNotified: Set<string> } {
  const nextNotified = new Set(alreadyNotified);
  const toNotify: LockedPickNotifyInput[] = [];
  for (const pick of picks) {
    const name = pick.player.name?.trim();
    if (!name) continue;
    const key = lockedPickNotifyKey(pick.draftId, pick.slot.pickNumber, pick.player);
    if (nextNotified.has(key)) continue;
    nextNotified.add(key);
    toNotify.push(pick);
  }
  return { toNotify, nextNotified };
}
