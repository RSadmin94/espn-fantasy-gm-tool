/**
 * RFSN Local Mock adapter — normalizes in-app locked picks into NormalizedPickEvent.
 * Diff/dedupe stay in the existing rfsnLivePickNotify helpers; this boundary only
 * maps the notify-shaped pick into the shared event.
 */
import type {
  DraftSourceAdapter,
  NormalizedPickBatch,
  NormalizedPickEvent,
} from "./types";

/** Pick shape already produced by buildLockedPickNotifyPayload / LockedPickInput. */
export type RfsnLocalMockLockedPick = {
  overallPick: number;
  round: number;
  roundPick: number;
  teamId: string;
  ownerName: string;
  playerId: string;
  playerName: string;
  position: string;
  nflTeam?: string | null;
  adp?: number | null;
};

export type RfsnLocalMockObservation = {
  leagueId: string;
  draftId: string;
  teamCount: number;
  draftComplete: boolean;
  draftPace?: "broadcast" | "brisk" | "turbo";
  picks: readonly RfsnLocalMockLockedPick[];
  /** Per-pick draftComplete override (last pick of draft). */
  pickDraftComplete?: ReadonlyMap<number, boolean>;
};

export function normalizeRfsnLocalMockPick(
  pick: RfsnLocalMockLockedPick,
  args: { leagueId: string; draftId: string; timestamp?: string },
): NormalizedPickEvent {
  return {
    provider: "rfsn-local-mock",
    draftType: "mock",
    draftId: args.draftId,
    leagueId: args.leagueId,
    round: pick.round,
    pick: pick.roundPick,
    overallPick: pick.overallPick,
    teamId: pick.teamId,
    ownerId: pick.teamId,
    ownerName: pick.ownerName,
    playerId: pick.playerId,
    playerName: pick.playerName,
    position: pick.position,
    timestamp: args.timestamp ?? new Date().toISOString(),
    nflTeam: pick.nflTeam ?? null,
    adp: pick.adp ?? null,
    metadata: { adapter: "rfsn-local-mock" },
  };
}

export function observeRfsnLocalMock(
  observation: RfsnLocalMockObservation,
  nowIso: string = new Date().toISOString(),
): NormalizedPickBatch | null {
  if (!observation.picks.length) return null;
  const picks = observation.picks.map((p) =>
    normalizeRfsnLocalMockPick(p, {
      leagueId: observation.leagueId,
      draftId: observation.draftId,
      timestamp: nowIso,
    }),
  );
  return {
    provider: "rfsn-local-mock",
    draftType: "mock",
    draftId: observation.draftId,
    leagueId: observation.leagueId,
    teamCount: observation.teamCount,
    draftComplete: observation.draftComplete,
    draftPace: observation.draftPace,
    picks,
  };
}

export class RfsnLocalMockAdapter
  implements DraftSourceAdapter<RfsnLocalMockObservation>
{
  readonly provider = "rfsn-local-mock" as const;
  readonly draftType = "mock" as const;

  observe(observation: RfsnLocalMockObservation): NormalizedPickBatch | null {
    return observeRfsnLocalMock(observation);
  }
}
