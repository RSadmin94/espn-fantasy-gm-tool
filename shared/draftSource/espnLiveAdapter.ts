/**
 * ESPN Live League adapter — wraps shared/espnLiveDraftMonitor parse+diff.
 * Emits NormalizedPickEvent only; does not call notifyLockedPick / booth.
 */
import {
  buildEspnLiveDraftId,
  diffEspnLiveLockedPicks,
  espnLiveLockedPickNotifyKey,
  parseEspnLiveDraftSnapshot,
  selectEspnLivePicksToNotify,
  type EspnLiveDraftSnapshot,
  type EspnLiveLockedPick,
} from "../espnLiveDraftMonitor";
import type {
  DraftSourceAdapter,
  NormalizedPickBatch,
  NormalizedPickEvent,
} from "./types";

export type EspnLiveObservation = {
  leagueId: string;
  season: number;
  /** Raw mDraftDetail payload (or null if fetch failed upstream). */
  rawPayload: unknown;
  prevPicks: readonly EspnLiveLockedPick[];
  alreadyNotified: ReadonlySet<string>;
  ownerNameByTeamId?: ReadonlyMap<string, string>;
  draftPace?: "broadcast" | "brisk" | "turbo";
};

export type EspnLiveObserveResult = {
  batch: NormalizedPickBatch | null;
  /** Full snapshot projection for shared board (idempotent; includes reconnect baseline). */
  projectionBatch: NormalizedPickBatch | null;
  snapshot: EspnLiveDraftSnapshot | null;
  nextPrevPicks: EspnLiveLockedPick[];
  nextNotified: Set<string>;
  /** True when cold-start seeded history without emitting notify events. */
  seededBaseline?: boolean;
};

export function normalizeEspnLivePick(
  pick: EspnLiveLockedPick,
  args: { leagueId: string; draftId: string; timestamp?: string },
): NormalizedPickEvent {
  return {
    provider: "espn-live",
    draftType: "live",
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
    nflTeam: pick.nflTeam,
    adp: pick.adp,
    metadata: {
      adapter: "espn-live",
      isKeeper: pick.isKeeper,
    },
  };
}

export function observeEspnLive(
  observation: EspnLiveObservation,
  nowIso: string = new Date().toISOString(),
): EspnLiveObserveResult {
  const draftId = buildEspnLiveDraftId(observation.leagueId, observation.season);
  const snap = parseEspnLiveDraftSnapshot(observation.rawPayload, {
    ownerNameByTeamId: observation.ownerNameByTeamId,
  });
  if (!snap) {
    return {
      batch: null,
      projectionBatch: null,
      snapshot: null,
      nextPrevPicks: [...observation.prevPicks],
      nextNotified: new Set(observation.alreadyNotified),
    };
  }

  const toProjectionBatch = (
    locked: readonly EspnLiveLockedPick[],
  ): NormalizedPickBatch | null => {
    const events = locked
      .filter((p) => !p.isKeeper)
      .map((p) =>
        normalizeEspnLivePick(p, {
          leagueId: observation.leagueId,
          draftId,
          timestamp: nowIso,
        }),
      );
    if (events.length === 0) return null;
    return {
      provider: "espn-live",
      draftType: "live",
      draftId,
      leagueId: observation.leagueId,
      teamCount: snap.teamCount,
      draftComplete: snap.draftComplete,
      draftPace: observation.draftPace,
      picks: events,
    };
  };

  // Cold start / remount: adopt current board as baseline — do not re-notify history.
  if (
    observation.prevPicks.length === 0 &&
    observation.alreadyNotified.size === 0 &&
    snap.picks.length > 0
  ) {
    const seeded = new Set<string>();
    for (const p of snap.picks) {
      seeded.add(espnLiveLockedPickNotifyKey(draftId, p));
    }
    return {
      batch: null,
      projectionBatch: toProjectionBatch(snap.picks),
      snapshot: snap,
      nextPrevPicks: snap.picks,
      nextNotified: seeded,
      seededBaseline: true,
    };
  }

  const newly = diffEspnLiveLockedPicks(observation.prevPicks, snap.picks);
  const { toNotify, nextNotified } = selectEspnLivePicksToNotify(
    draftId,
    newly,
    observation.alreadyNotified,
  );

  const lastOverall =
    snap.picks.length > 0 ? Math.max(...snap.picks.map((p) => p.overallPick)) : 0;

  const picks = toNotify
    .filter((p) => !p.isKeeper)
    .map((p) =>
      normalizeEspnLivePick(p, {
        leagueId: observation.leagueId,
        draftId,
        timestamp: nowIso,
      }),
    );

  for (const ev of picks) {
    if (snap.draftComplete && ev.overallPick === lastOverall) {
      ev.metadata = { ...ev.metadata, draftCompletePick: true };
    }
  }

  const batch: NormalizedPickBatch | null =
    picks.length === 0
      ? null
      : {
          provider: "espn-live",
          draftType: "live",
          draftId,
          leagueId: observation.leagueId,
          teamCount: snap.teamCount,
          draftComplete: snap.draftComplete,
          draftPace: observation.draftPace,
          picks,
        };

  return {
    batch,
    projectionBatch: toProjectionBatch(snap.picks),
    snapshot: snap,
    nextPrevPicks: snap.picks,
    nextNotified,
  };
}

export class EspnLiveAdapter implements DraftSourceAdapter<EspnLiveObservation> {
  readonly provider = "espn-live" as const;
  readonly draftType = "live" as const;

  observe(observation: EspnLiveObservation): NormalizedPickBatch | null {
    return observeEspnLive(observation).batch;
  }
}

export { buildEspnLiveDraftId };
