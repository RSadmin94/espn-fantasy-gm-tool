import { playerIdentityKeys } from "./names";
import type { HistoricalPick, RankedPlayer } from "./types";

export function nextUserOverallPick(
  picks: readonly HistoricalPick[],
  userTeamId: number,
  currentOverall: number,
): number | null {
  const next = picks
    .filter((p) => p.teamId === userTeamId && p.overallPick > currentOverall)
    .sort((a, b) => a.overallPick - b.overallPick)[0];
  return next?.overallPick ?? null;
}

/**
 * Historical recap already answers this. Do not simulate other teams' rerolls.
 * Returns null when the user's next slot is unknown.
 */
export function playerSurvivesUntilNextPick(args: {
  player: Pick<RankedPlayer, "playerId" | "name" | "position">;
  picks: readonly HistoricalPick[];
  afterOverall: number;
  untilOverall: number | null;
}): boolean | null {
  if (args.untilOverall == null || args.untilOverall <= args.afterOverall) return null;
  const keys = new Set(
    playerIdentityKeys({
      playerId: args.player.playerId,
      name: args.player.name,
      position: args.player.position,
    }),
  );
  for (const pick of [...args.picks].sort((a, b) => a.overallPick - b.overallPick)) {
    if (pick.overallPick <= args.afterOverall) continue;
    if (pick.overallPick >= args.untilOverall) break;
    const hit = playerIdentityKeys({
      playerId: pick.playerId,
      name: pick.playerName,
      position: pick.position,
    }).some((k) => keys.has(k));
    if (hit) return false;
  }
  return true;
}
