/**
 * League-scoped draft geometry for keeper ROI / pick-value math.
 * Team count and round count come from settings + observed draft data — no fixed 10/12/14/16.
 */
import { resolveSeasonTeamCount } from "./draftBoardHelpers";
import { normalizeDraftPicks } from "./espnService";

export type KeeperDraftGeometry = {
  teamCount: number;
  roundCount: number;
  draftSlotCount: number;
};

/**
 * Derives draft geometry from league settings + that season's combined cache payload.
 */
export async function resolveKeeperDraftGeometryForSeason(
  leagueId: string,
  season: number,
  userId: number | undefined,
  seasonPayload: Record<string, unknown> | null,
): Promise<KeeperDraftGeometry> {
  let teamCount = await resolveSeasonTeamCount(leagueId, season, userId);
  let maxRound = 0;
  let nPicks = 0;

  if (seasonPayload) {
    const picks = normalizeDraftPicks(seasonPayload);
    nPicks = picks.length;
    for (const p of picks) {
      const row = p as Record<string, unknown>;
      const r = Number(row.roundId ?? 0);
      if (Number.isFinite(r) && r > maxRound) maxRound = r;
    }
    if (teamCount <= 0) {
      const tids = new Set<number>();
      for (const p of picks) {
        const tid = Number((p as Record<string, unknown>).teamId ?? 0);
        if (tid > 0) tids.add(tid);
      }
      if (tids.size > 0) teamCount = tids.size;
    }
  }

  let roundCount = maxRound;
  if (roundCount <= 0 && teamCount > 0 && nPicks > 0) {
    roundCount = Math.ceil(nPicks / teamCount);
  }
  if (roundCount <= 0) roundCount = 1;

  const draftSlotCount = teamCount > 0 ? teamCount * roundCount : 0;
  return { teamCount, roundCount, draftSlotCount };
}

/** Mid-round pick index for decay-style round value (1..teamCount). */
export function defaultMidPickInRound(teamCount: number): number {
  if (teamCount <= 0) return 1;
  return Math.max(1, Math.min(teamCount, Math.ceil(teamCount / 2)));
}

/** Round-level keeper chart value (geometric decay vs overall pick). */
export function keeperDecayRoundValue(
  round: number,
  teamCount: number,
  midPick: number,
  baseValue: number,
  decay: number,
): number {
  if (teamCount <= 0 || round < 1) return 0;
  const overall = (round - 1) * teamCount + midPick;
  return Math.round(baseValue * Math.pow(decay, overall - 1));
}

/** Overall pick number in a snake draft (1-based). */
export function snakeOverallPick(teamCount: number, round: number, pickInRound: number): number {
  if (teamCount <= 0 || round < 1 || pickInRound < 1) return 0;
  return (round - 1) * teamCount + (round % 2 === 1 ? pickInRound : teamCount + 1 - pickInRound);
}

/** Inverse of sequential overall index → snake (round, pickInRound). */
export function snakeRoundAndPickFromOverall(overall: number, teamCount: number): { round: number; pickInRound: number } {
  if (overall <= 0 || teamCount <= 0) return { round: 1, pickInRound: 1 };
  const round = Math.ceil(overall / teamCount);
  const positionInRound = overall - (round - 1) * teamCount;
  const pickInRound = round % 2 === 1 ? positionInRound : teamCount + 1 - positionInRound;
  return { round, pickInRound };
}

/** Exponential pick value used by pickValueChart / pickTradeEval (same formula, league-sized snake). */
export function expPickValueFromSnakeRound(
  round: number,
  pickInRound: number,
  teamCount: number,
  base = 3000,
  k = 0.028,
): number {
  const overall = snakeOverallPick(teamCount, round, pickInRound);
  if (overall <= 0) return 0;
  return Math.round(base * Math.exp(-k * (overall - 1)));
}
