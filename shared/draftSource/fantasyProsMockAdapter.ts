/**
 * FantasyPros Mock adapter — wraps shared/fantasyProsMockDraftMonitor mapping.
 * Emits NormalizedPickEvent only; does not call notifyLockedPick / booth.
 */
import {
  fantasyProsPickDedupeKey,
  selectFantasyProsPicksToNotify,
  type FantasyProsLockedPick,
} from "../fantasyProsMockDraftMonitor";
import type {
  DraftSourceAdapter,
  NormalizedPickBatch,
  NormalizedPickEvent,
} from "./types";

export type FantasyProsMockObservation = {
  leagueId: string;
  draftId: string;
  teamCount: number;
  draftComplete: boolean;
  draftPace?: "broadcast" | "brisk" | "turbo";
  /** Already-mapped FP locked picks newly observed this tick. */
  newlyLocked: readonly FantasyProsLockedPick[];
  alreadyNotified: ReadonlySet<string>;
};

export type FantasyProsMockObserveResult = {
  batch: NormalizedPickBatch | null;
  /** Board projection batch (includes reconnect baseline when notify batch is null). */
  projectionBatch: NormalizedPickBatch | null;
  nextNotified: Set<string>;
};

export function normalizeFantasyProsMockPick(
  pick: FantasyProsLockedPick,
  args: { leagueId: string; draftId: string; timestamp?: string },
): NormalizedPickEvent {
  return {
    provider: "fantasypros-mock",
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
    timestamp: args.timestamp ?? pick.observedAt ?? new Date().toISOString(),
    nflTeam: pick.nflTeam,
    adp: pick.adp,
    metadata: {
      adapter: "fantasypros-mock",
      providerPlayerId: pick.providerPlayerId,
      providerDraftId: pick.providerDraftId,
      source: pick.source,
      identityConfidence: pick.identityConfidence,
      isKeeper: pick.isKeeper,
    },
  };
}

export function observeFantasyProsMock(
  observation: FantasyProsMockObservation,
  nowIso: string = new Date().toISOString(),
): FantasyProsMockObserveResult {
  // Remount / reconnect dump: if we have no prior notified set and receive more
  // than one pick at once, treat the batch as baseline history (do not re-emit).
  if (
    observation.alreadyNotified.size === 0 &&
    observation.newlyLocked.length > 1
  ) {
    const seeded = new Set<string>();
    const projectionPicks: NormalizedPickEvent[] = [];
    for (const pick of observation.newlyLocked) {
      if (pick.isKeeper) continue;
      seeded.add(
        fantasyProsPickDedupeKey(
          observation.draftId,
          pick.overallPick,
          pick.providerPlayerId,
        ),
      );
      projectionPicks.push(
        normalizeFantasyProsMockPick(pick, {
          leagueId: observation.leagueId,
          draftId: observation.draftId,
          timestamp: nowIso,
        }),
      );
    }
    return {
      batch: null,
      projectionBatch:
        projectionPicks.length === 0
          ? null
          : {
              provider: "fantasypros-mock",
              draftType: "mock",
              draftId: observation.draftId,
              leagueId: observation.leagueId,
              teamCount: observation.teamCount,
              draftComplete: observation.draftComplete,
              draftPace: observation.draftPace,
              picks: projectionPicks,
            },
      nextNotified: seeded,
    };
  }

  const { toNotify, nextNotified } = selectFantasyProsPicksToNotify(
    observation.draftId,
    observation.newlyLocked,
    observation.alreadyNotified,
  );

  const lastOverall =
    toNotify.length > 0 ? Math.max(...toNotify.map((p) => p.overallPick)) : 0;

  const picks = toNotify.map((p) => {
    const ev = normalizeFantasyProsMockPick(p, {
      leagueId: observation.leagueId,
      draftId: observation.draftId,
      timestamp: nowIso,
    });
    if (observation.draftComplete && p.overallPick === lastOverall) {
      ev.metadata = { ...ev.metadata, draftCompletePick: true };
    }
    return ev;
  });

  const batch: NormalizedPickBatch | null =
    picks.length === 0
      ? null
      : {
          provider: "fantasypros-mock",
          draftType: "mock",
          draftId: observation.draftId,
          leagueId: observation.leagueId,
          teamCount: observation.teamCount,
          draftComplete: observation.draftComplete,
          draftPace: observation.draftPace,
          picks,
        };

  return { batch, projectionBatch: batch, nextNotified };
}

export class FantasyProsMockAdapter
  implements DraftSourceAdapter<FantasyProsMockObservation>
{
  readonly provider = "fantasypros-mock" as const;
  readonly draftType = "mock" as const;

  observe(observation: FantasyProsMockObservation): NormalizedPickBatch | null {
    return observeFantasyProsMock(observation).batch;
  }
}
