import { useEffect, useRef } from "react";
import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import {
  buildLockedPickNotifyPayload,
  detectNewlyLockedPicks,
  filterUnnotifiedPicks,
  lockedPickNotifyKey,
  type LockedPickPlayerResult,
  type LockedPickScheduleSlot,
} from "@/lib/rfsnLivePickNotify";

type UseRfsnLiveLockedPickNotifyArgs = {
  enabled: boolean;
  leagueId: string | null | undefined;
  draftId: string;
  schedule: readonly LockedPickScheduleSlot[];
  results: Record<number, LockedPickPlayerResult>;
  draftComplete: boolean;
  teamCount: number;
  draftPace?: "broadcast" | "brisk" | "turbo";
  resetKey?: string;
  baselineResults?: Record<number, LockedPickPlayerResult>;
  /** Arm draft hold immediately after notify so Turbo cannot race past booth start. */
  onNotified?: (pickNumber: number) => void;
};

/**
 * Fire-and-forget locked-pick notifications for RFSN Live.
 * Never throws; failures are swallowed so the draft UI keeps working.
 */
export function useRfsnLiveLockedPickNotify({
  enabled,
  leagueId,
  draftId,
  schedule,
  results,
  draftComplete,
  teamCount,
  draftPace,
  resetKey,
  baselineResults = {},
  onNotified,
}: UseRfsnLiveLockedPickNotifyArgs): void {
  const _trpc = trpc as any;
  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  const notifyMut = _trpc.rfsnBroadcast.notifyLockedPick.useMutation();
  const utils = trpc.useUtils() as any;

  const canNotify = Boolean(
    enabled &&
      leagueId &&
      accessQ.data?.enabled &&
      accessQ.data?.canAccess,
  );

  const prevResultsRef = useRef<Record<number, LockedPickPlayerResult>>({});
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    prevResultsRef.current = { ...baselineResults };
    notifiedRef.current = new Set();
    for (const [pickNum, player] of Object.entries(baselineResults)) {
      if (player?.name) {
        notifiedRef.current.add(lockedPickNotifyKey(draftId, Number(pickNum), player));
      }
    }
  }, [draftId, resetKey, baselineResults]);

  useEffect(() => {
    if (!canNotify || !leagueId) return;

    const prev = prevResultsRef.current;
    const detected = detectNewlyLockedPicks(prev, results, schedule);
    prevResultsRef.current = { ...results };

    const withIdentity = detected.map((item) => ({ ...item, leagueId, draftId }));
    const { toNotify, nextNotified } = filterUnnotifiedPicks(withIdentity, notifiedRef.current);
    notifiedRef.current = nextNotified;

    const lastPickNumber = schedule.length
      ? Math.max(...schedule.map((s) => s.pickNumber))
      : 0;

    for (const item of toNotify) {
      const payload = buildLockedPickNotifyPayload({
        ...item,
        leagueId,
        draftId,
        teamCount,
        draftPace,
        draftComplete: draftComplete && item.slot.pickNumber === lastPickNumber,
      });
      void notifyMut
        .mutateAsync(payload)
        .then(() => {
          onNotified?.(payload.pick.overallPick);
          void utils.rfsnBroadcast.getLiveSnapshot.invalidate({ leagueId, draftId });
        })
        .catch((err: unknown) => {
          if (import.meta.env.DEV) {
            console.debug("[rfsn] notifyLockedPick failed", {
              pickNumber: payload.pick.overallPick,
              draftId: payload.draftId,
              message: err instanceof Error ? err.message : "unknown",
            });
          }
        });
    }
  }, [canNotify, draftComplete, draftId, draftPace, leagueId, notifyMut, onNotified, results, schedule, teamCount, utils]);
}

export function useRfsnLivePickNotifyAccess(enabled: boolean) {
  const _trpc = trpc as any;
  return _trpc.rfsnBroadcast.getAccess.useQuery(enabled ? undefined : skipToken, {
    staleTime: 60_000,
  });
}