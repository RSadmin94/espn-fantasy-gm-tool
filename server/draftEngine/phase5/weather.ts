/**
 * Phase 5 — WEATHER: live draft room state each pick reads and mutates.
 */

import { buildRoomState } from "../phase1/roomState";
import { normalizePlayerKey, normalizePosition, type ChoicePlayer } from "../phase1/types";
import type { RoomState } from "../phase1/types";

export type SimPlayer = ChoicePlayer & {
  playerKey: string;
  valueScore: number;
  tier: string;
  /** Real live ESPN ADP when known (Souls v2 draft anchor); null for late slots / unranked. */
  adp?: number | null;
};

export type RivalryLedgerEntry = {
  blockerProfileKey: string;
  blockedProfileKey: string;
  playerName: string;
  overallPick: number;
};

export type DraftWeather = {
  leagueId: string;
  season: number;
  teamCount: number;
  picksCompleted: number;
  /** Full player pool at draft start (skill positions). */
  universe: SimPlayer[];
  /** Still on the board. */
  available: SimPlayer[];
  drafted: SimPlayer[];
  draftedKeys: Set<string>;
  recentBoardPositions: string[];
  roomState: RoomState;
  /** Position tempo — shifts when runs stack. */
  tempo: "slow" | "normal" | "run-heavy";
  /** Simple cross-owner blocks (board-context grudges). */
  rivalryLedger: RivalryLedgerEntry[];
};

function computeTempo(recent: string[], run: RoomState["runInProgress"]): DraftWeather["tempo"] {
  if (run && run.countInLastFour >= 3) return "run-heavy";
  const last6 = recent.slice(-6);
  const uniq = new Set(last6);
  if (last6.length >= 5 && uniq.size <= 2) return "run-heavy";
  if (last6.length >= 4 && uniq.size >= 4) return "slow";
  return "normal";
}

export function createInitialWeather(args: {
  leagueId: string;
  season: number;
  teamCount: number;
  pool: SimPlayer[];
}): DraftWeather {
  const available = [...args.pool];
  const roomState = buildRoomState({
    picksSoFar: 0,
    teamCount: args.teamCount,
    draftedSoFar: [],
    seasonUniverse: args.pool,
    availableSet: available,
    recentBoardPositions: [],
  });
  return {
    leagueId: args.leagueId,
    season: args.season,
    teamCount: args.teamCount,
    picksCompleted: 0,
    universe: args.pool,
    available,
    drafted: [],
    draftedKeys: new Set(),
    recentBoardPositions: [],
    roomState,
    tempo: "normal",
    rivalryLedger: [],
  };
}

export function readWeatherSnapshot(weather: DraftWeather): {
  roomState: RoomState;
  available: SimPlayer[];
  tempo: DraftWeather["tempo"];
  picksCompleted: number;
} {
  return {
    roomState: weather.roomState,
    available: weather.available,
    tempo: weather.tempo,
    picksCompleted: weather.picksCompleted,
  };
}

export function mutateWeatherAfterPick(args: {
  weather: DraftWeather;
  chosen: SimPlayer;
  chooserProfileKey: string;
  overallPick: number;
  /** Optional: owners who had this player high on need — for rivalry ledger. */
  nearMissOwners?: string[];
}): DraftWeather {
  const w = args.weather;
  const key = normalizePlayerKey(args.chosen.playerKey);
  if (w.draftedKeys.has(key)) return w;

  const drafted = [...w.drafted, args.chosen];
  const available = w.available.filter((p) => normalizePlayerKey(p.playerKey) !== key);
  const recentBoardPositions = [...w.recentBoardPositions, normalizePosition(args.chosen.position)];
  const roomState = buildRoomState({
    picksSoFar: w.picksCompleted + 1,
    teamCount: w.teamCount,
    draftedSoFar: drafted,
    seasonUniverse: w.universe,
    availableSet: available,
    recentBoardPositions,
  });
  const tempo = computeTempo(recentBoardPositions, roomState.runInProgress);

  const rivalryLedger = [...w.rivalryLedger];
  for (const blocked of args.nearMissOwners ?? []) {
    if (blocked === args.chooserProfileKey) continue;
    rivalryLedger.push({
      blockerProfileKey: args.chooserProfileKey,
      blockedProfileKey: blocked,
      playerName: args.chosen.playerName,
      overallPick: args.overallPick,
    });
  }

  return {
    ...w,
    picksCompleted: w.picksCompleted + 1,
    drafted,
    available,
    draftedKeys: new Set([...w.draftedKeys, key]),
    recentBoardPositions,
    roomState,
    tempo,
    rivalryLedger,
  };
}

export function availableAtPosition(weather: DraftWeather, position: string): SimPlayer[] {
  const pos = normalizePosition(position);
  return weather.available.filter((p) => normalizePosition(p.position) === pos);
}
