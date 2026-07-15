import { normalizePosition, type ChoicePlayer, type PositionTierSnapshot, type RoomState } from "./types";

const SKILL_POSITIONS = ["RB", "WR", "QB", "TE"] as const;

function countByPosition(players: ChoicePlayer[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of players) {
    const pos = normalizePosition(p.position);
    out[pos] = (out[pos] ?? 0) + 1;
  }
  return out;
}

function detectRun(recentPositions: string[]): RoomState["runInProgress"] {
  const lastFour = recentPositions.slice(-4);
  if (lastFour.length < 3) return null;
  const counts = countByPosition(lastFour.map((pos) => ({ playerName: "", position: pos })));
  let bestPos = "";
  let best = 0;
  for (const [pos, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      bestPos = pos;
    }
  }
  if (best >= 3 && SKILL_POSITIONS.includes(bestPos as (typeof SKILL_POSITIONS)[number])) {
    return { position: bestPos, countInLastFour: best };
  }
  return null;
}

export function buildRoomState(args: {
  picksSoFar: number;
  teamCount: number;
  draftedSoFar: ChoicePlayer[];
  seasonUniverse: ChoicePlayer[];
  availableSet: ChoicePlayer[];
  recentBoardPositions: string[];
}): RoomState {
  const positionCounts = countByPosition(args.draftedSoFar);
  const availableByPos = countByPosition(args.availableSet);

  const tierByPosition: Record<string, PositionTierSnapshot> = {};
  for (const pos of SKILL_POSITIONS) {
    tierByPosition[pos] = {
      drafted: positionCounts[pos] ?? 0,
      remaining: availableByPos[pos] ?? 0,
    };
  }

  return {
    picksSoFar: args.picksSoFar,
    teamCount: args.teamCount,
    positionCounts,
    recentBoardPositions: args.recentBoardPositions.slice(-6),
    runInProgress: detectRun(args.recentBoardPositions),
    tierByPosition,
  };
}

export function formatRoomStatePlain(room: RoomState): string {
  const parts: string[] = [];
  const rb = room.positionCounts.RB ?? 0;
  const wr = room.positionCounts.WR ?? 0;
  parts.push(`${wr} WR / ${rb} RB already gone`);

  if (room.runInProgress) {
    parts.push(`${room.runInProgress.position} run in progress (${room.runInProgress.countInLastFour} of last 4)`);
  }

  const wrRem = room.tierByPosition.WR?.remaining ?? 0;
  const rbRem = room.tierByPosition.RB?.remaining ?? 0;
  if (wrRem <= 3 && wrRem > 0) parts.push("WR tier thinning");
  else if (wrRem > 0 && rbRem <= 3) parts.push("RB tier thinning");
  else if (room.runInProgress?.position === "WR") parts.push("WR tier about to break");

  return parts.join("; ");
}
