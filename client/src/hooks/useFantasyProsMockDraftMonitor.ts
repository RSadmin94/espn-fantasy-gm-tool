/**
 * RFSN-030C — FantasyPros solo mock → notifyLockedPick monitor (FFR side).
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { isGmWarRoomExtensionPresent } from "@/lib/espnApi";
import {
  parseFantasyProsBridgeMessage,
  postFantasyProsMockArm,
  postFantasyProsMockDisarm,
  type FantasyProsBridgePickBatch,
} from "@/lib/fantasyProsMockBridge";
import {
  fantasyProsPickDedupeKey,
  mapFantasyProsDraftedPick,
  type FantasyProsLockedPick,
} from "@shared/fantasyProsMockDraftMonitor";
import {
  observeFantasyProsMock,
  toNotifyLockedPickRequest,
  type NormalizedPickBatch,
} from "@shared/draftSource";

export type FantasyProsMockMonitorStatus = {
  active: boolean;
  extensionPresent: boolean;
  connectorStatus: string;
  lastError: string | null;
  draftId: string | null;
  providerDraftId: string | null;
  lockedCount: number;
  notifiedCount: number;
  lastIngestedPick: number | null;
  lastPlayerName: string | null;
  fantasyProsTabs: number | null;
  diagnostics: Record<string, unknown> | null;
};

type SeatMap = ReadonlyMap<number, string>;

type Args = {
  enabled: boolean;
  leagueId: string | null | undefined;
  season: number;
  teamCount: number;
  /** FantasyPros ownerPos → FFR owner display name */
  seatNameByPos?: SeatMap | null;
  /** FantasyPros ownerPos → FFR teamId (when mapping confirmed) */
  seatTeamIdByPos?: SeatMap | null;
  draftPace?: "broadcast" | "brisk" | "turbo";
  voiceEnabled?: boolean;
  commentaryEnabled?: boolean;
  /** When true, arm extension observer. */
  armExtension?: boolean;
  /** Booth session id (run-suffixed). Overrides provider draftId on notify. */
  notifyDraftId?: string | null;
  /** Shared board projection — idempotent NormalizedPickBatch (may include reconnect baseline). */
  onNormalizedBatch?: (batch: NormalizedPickBatch) => void;
  /** Fired when FantasyPros starts a new draft session (board must reset). */
  onSessionReset?: (draftId: string) => void;
};

const INITIAL: FantasyProsMockMonitorStatus = {
  active: false,
  extensionPresent: false,
  connectorStatus: "idle",
  lastError: null,
  draftId: null,
  providerDraftId: null,
  lockedCount: 0,
  notifiedCount: 0,
  lastIngestedPick: null,
  lastPlayerName: null,
  fantasyProsTabs: null,
  diagnostics: null,
};

export function useFantasyProsMockDraftMonitor({
  enabled,
  leagueId,
  season,
  teamCount,
  seatNameByPos,
  seatTeamIdByPos,
  draftPace = "broadcast",
  armExtension = true,
  notifyDraftId = null,
  onNormalizedBatch,
  onSessionReset,
}: Args): FantasyProsMockMonitorStatus {
  const _trpc = trpc as any;
  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  const notifyMut = _trpc.rfsnBroadcast.notifyLockedPick.useMutation();
  const resetMut = _trpc.rfsnBroadcast.resetLiveSession.useMutation();
  const notifyMutRef = useRef(notifyMut);
  const resetMutRef = useRef(resetMut);
  const notifyDraftIdRef = useRef(notifyDraftId);
  useEffect(() => {
    notifyMutRef.current = notifyMut;
  }, [notifyMut]);
  useEffect(() => {
    resetMutRef.current = resetMut;
  }, [resetMut]);
  useEffect(() => {
    notifyDraftIdRef.current = notifyDraftId;
  }, [notifyDraftId]);
  const onNormalizedBatchRef = useRef(onNormalizedBatch);
  useEffect(() => {
    onNormalizedBatchRef.current = onNormalizedBatch;
  }, [onNormalizedBatch]);
  const onSessionResetRef = useRef(onSessionReset);
  useEffect(() => {
    onSessionResetRef.current = onSessionReset;
  }, [onSessionReset]);

  const notifiedRef = useRef<Set<string>>(new Set());
  const draftIdRef = useRef<string | null>(null);
  const seatRef = useRef(seatNameByPos);
  const seatTeamRef = useRef(seatTeamIdByPos);
  useEffect(() => {
    seatRef.current = seatNameByPos;
  }, [seatNameByPos]);
  useEffect(() => {
    seatTeamRef.current = seatTeamIdByPos;
  }, [seatTeamIdByPos]);

  const [status, setStatus] = useState<FantasyProsMockMonitorStatus>(INITIAL);

  const canRun = Boolean(
    enabled &&
      leagueId &&
      accessQ.data?.enabled &&
      accessQ.data?.canAccess,
  );

  // Arm / disarm extension with session lifecycle
  useEffect(() => {
    if (!canRun || !armExtension) {
      if (enabled === false) {
        void postFantasyProsMockDisarm().catch(() => {});
      }
      setStatus((s) => ({
        ...s,
        active: false,
        extensionPresent: isGmWarRoomExtensionPresent(),
        connectorStatus: enabled ? s.connectorStatus : "idle",
      }));
      return;
    }

    let cancelled = false;
    (async () => {
      const ext = isGmWarRoomExtensionPresent();
      if (!ext) {
        setStatus((s) => ({
          ...s,
          active: false,
          extensionPresent: false,
          connectorStatus: "extension_missing",
          lastError: "Install / enable the GM War Room extension (v1.10+).",
        }));
        return;
      }
      const arm = await postFantasyProsMockArm({
        leagueId: String(leagueId),
        season,
        forceNewSession: false,
      });
      if (cancelled) return;
      setStatus((s) => ({
        ...s,
        active: true,
        extensionPresent: true,
        connectorStatus:
          (arm.reached ?? 0) > 0
            ? "monitoring"
            : arm.ok
              ? "waiting_for_fantasypros_tab"
              : "arm_failed",
        lastError: arm.error || ((arm.reached ?? 0) > 0 ? null : "Open the FantasyPros mock live room."),
        fantasyProsTabs: arm.fantasyProsTabs ?? null,
      }));
    })().catch((err) => {
      if (cancelled) return;
      setStatus((s) => ({
        ...s,
        active: false,
        lastError: err instanceof Error ? err.message : "arm_failed",
        connectorStatus: "arm_failed",
      }));
    });

    return () => {
      cancelled = true;
      void postFantasyProsMockDisarm().catch(() => {});
    };
  }, [canRun, armExtension, leagueId, season, enabled]);

  // Listen for bridge events
  useEffect(() => {
    if (!canRun || !leagueId) return;

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const parsed = parseFantasyProsBridgeMessage(ev.data);
      if (!parsed) return;

      if (parsed.type === "GMWR_FP_MOCK_STATUS") {
        setStatus((s) => ({
          ...s,
          extensionPresent: true,
          connectorStatus: parsed.status || s.connectorStatus,
          draftId: parsed.draftId ?? s.draftId,
          providerDraftId: parsed.providerDraftId ?? s.providerDraftId,
          fantasyProsTabs: parsed.fantasyProsTabs ?? s.fantasyProsTabs,
          lastError:
            parsed.reason && parsed.status !== "monitoring" && parsed.status !== "armed"
              ? String(parsed.reason)
              : parsed.status === "monitoring"
                ? null
                : s.lastError,
          diagnostics: parsed.diagnostics ?? s.diagnostics,
        }));
        if (parsed.draftId) draftIdRef.current = parsed.draftId;
        return;
      }

      if (parsed.type === "GMWR_FP_MOCK_SESSION_RESET") {
        notifiedRef.current = new Set();
        draftIdRef.current = parsed.draftId;
        void resetMutRef.current
          .mutateAsync({ leagueId: String(leagueId), draftId: parsed.draftId })
          .catch(() => {});
        onSessionResetRef.current?.(parsed.draftId);
        setStatus((s) => ({
          ...s,
          draftId: parsed.draftId,
          providerDraftId: parsed.providerDraftId,
          lockedCount: 0,
          notifiedCount: 0,
          lastIngestedPick: null,
          lastPlayerName: null,
          connectorStatus: "session_reset",
          lastError: null,
        }));
        return;
      }

      if (parsed.type === "GMWR_FP_MOCK_PICK_BATCH") {
        void ingestBatch(parsed, String(leagueId), teamCount, draftPace);
      }
    };

    async function ingestBatch(
      batch: FantasyProsBridgePickBatch,
      lid: string,
      teams: number,
      pace: "broadcast" | "brisk" | "turbo",
    ) {
      draftIdRef.current = batch.draftId;
      const mapped: FantasyProsLockedPick[] = [];
      for (const row of batch.picks) {
        const pick = mapFantasyProsDraftedPick(
          {
            id: row.id,
            pick: row.pick,
            round: row.round,
            posInRound: row.posInRound,
            ownerPos: row.ownerPos,
            owner: row.owner,
            isKeeper: row.isKeeper,
          },
          batch.playerMapSlice,
          {
            providerDraftId: batch.providerDraftId,
            observedAt: batch.observedAt,
            seatNameByPos: seatRef.current,
          },
        );
        if (!pick) continue;
        const ffrTeamId = seatTeamRef.current?.get(row.ownerPos);
        if (ffrTeamId) {
          mapped.push({ ...pick, teamId: String(ffrTeamId) });
        } else {
          mapped.push(pick);
        }
      }
      mapped.sort((a, b) => a.overallPick - b.overallPick);

      const teamCountResolved = teams || Number(batch.room?.teamCount) || 12;
      const observed = observeFantasyProsMock({
        leagueId: lid,
        draftId: batch.draftId,
        teamCount: teamCountResolved,
        draftComplete: Boolean(batch.room?.draftComplete),
        draftPace: pace,
        newlyLocked: mapped,
        alreadyNotified: notifiedRef.current,
      });
      notifiedRef.current = observed.nextNotified;

      if (observed.projectionBatch?.picks.length) {
        onNormalizedBatchRef.current?.(observed.projectionBatch);
      }

      let lastPick: FantasyProsLockedPick | null = null;
      for (const event of observed.batch?.picks ?? []) {
        const request = toNotifyLockedPickRequest(
          {
            ...event,
            draftId: notifyDraftIdRef.current?.trim() || event.draftId,
          },
          {
            teamCount: teamCountResolved,
            draftComplete: Boolean(event.metadata?.draftCompletePick),
            draftPace: pace,
          },
        );
        try {
          await notifyMutRef.current.mutateAsync(request);
          lastPick = mapped.find((p) => p.overallPick === event.overallPick) ?? lastPick;
          if (import.meta.env.DEV) {
            console.debug("[rfsn-030c] FantasyPros pick → notifyLockedPick", {
              provider: event.provider,
              overallPick: event.overallPick,
              playerName: event.playerName,
              draftId: batch.draftId,
            });
          }
        } catch (err) {
          setStatus((s) => ({
            ...s,
            lastError: err instanceof Error ? err.message : "notify_failed",
          }));
          if (import.meta.env.DEV) {
            console.debug("[rfsn-030c] notifyLockedPick failed", err);
          }
        }
      }

      setStatus((s) => ({
        ...s,
        active: true,
        extensionPresent: true,
        connectorStatus: "monitoring",
        draftId: batch.draftId,
        providerDraftId: batch.providerDraftId,
        lockedCount: Math.max(s.lockedCount, mapped[mapped.length - 1]?.overallPick ?? s.lockedCount),
        notifiedCount: notifiedRef.current.size,
        lastIngestedPick: lastPick?.overallPick ?? s.lastIngestedPick,
        lastPlayerName: lastPick?.playerName ?? s.lastPlayerName,
        diagnostics: batch.diagnostics ?? s.diagnostics,
        lastError: null,
      }));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canRun, leagueId, teamCount, draftPace]);

  // Clear dedupe when disabled
  useEffect(() => {
    if (!enabled) {
      notifiedRef.current = new Set();
      draftIdRef.current = null;
      setStatus(INITIAL);
    }
  }, [enabled]);

  return status;
}

export function fantasyProsDedupeKeyForTests(
  draftId: string,
  overallPick: number,
  playerId: string,
): string {
  return fantasyProsPickDedupeKey(draftId, overallPick, playerId);
}
