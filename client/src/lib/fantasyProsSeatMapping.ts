/**
 * Map FantasyPros ownerPos seats onto FFR draft-order teams.
 * User confirms their seat; remaining seats follow draft order.
 */
export type FantasyProsSeatMapping = {
  /** FantasyPros ownerPos for the user's seat */
  userOwnerPos: number;
  /** ownerPos → FFR owner display name */
  seatNameByPos: Map<number, string>;
  /** ownerPos → FFR teamId string */
  seatTeamIdByPos: Map<number, string>;
  mappingConfirmed: boolean;
};

export type LeagueDraftSeat = {
  teamId: string | number;
  ownerName?: string | null;
  teamName?: string | null;
  /** 1-based draft slot if known */
  draftSlot?: number | null;
};

/**
 * Build seat map: user picks FantasyPros ownerPos; remaining FFR teams
 * fill other seats in draft-slot order (or teamId order as fallback).
 */
export function buildFantasyProsSeatMapping(args: {
  teams: readonly LeagueDraftSeat[];
  userOwnerPos: number;
  userTeamId: string | number;
  teamCount?: number;
}): FantasyProsSeatMapping {
  const teamCount = Math.max(
    args.teamCount ?? args.teams.length,
    args.teams.length,
    2,
  );
  const seats = [...args.teams].sort((a, b) => {
    const sa = a.draftSlot != null ? Number(a.draftSlot) : Number(a.teamId);
    const sb = b.draftSlot != null ? Number(b.draftSlot) : Number(b.teamId);
    return sa - sb;
  });

  const seatNameByPos = new Map<number, string>();
  const seatTeamIdByPos = new Map<number, string>();

  const userTeam = seats.find((t) => String(t.teamId) === String(args.userTeamId));
  const userLabel =
    String(userTeam?.ownerName || userTeam?.teamName || "Your Team").trim() || "Your Team";

  const others = seats.filter((t) => String(t.teamId) !== String(args.userTeamId));
  let otherIdx = 0;

  for (let pos = 0; pos < teamCount; pos++) {
    if (pos === args.userOwnerPos) {
      seatNameByPos.set(pos, userLabel);
      seatTeamIdByPos.set(pos, String(args.userTeamId));
      continue;
    }
    const t = others[otherIdx++];
    if (t) {
      const label = String(t.ownerName || t.teamName || `FantasyPros Seat ${pos + 1}`).trim();
      seatNameByPos.set(pos, label);
      seatTeamIdByPos.set(pos, String(t.teamId));
    } else {
      seatNameByPos.set(pos, `FantasyPros Seat ${pos + 1}`);
    }
  }

  return {
    userOwnerPos: args.userOwnerPos,
    seatNameByPos,
    seatTeamIdByPos,
    mappingConfirmed: Boolean(userTeam),
  };
}
