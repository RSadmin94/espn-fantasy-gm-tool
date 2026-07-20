/**
 * Phase 3 — ESPN bookmarklet transport → applyNormalizedPickBatch + notifyLockedPick.
 * Bookmarklet-primary ingest; legacy league-fetch remains fallback only when extension is missing.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { isGmWarRoomExtensionPresent } from "@/lib/espnApi";
import {
  newEspnBookmarkletSessionNonce,
  parseEspnBookmarkletBridgeMessage,
  postEspnBookmarkletArm,
  postEspnBookmarkletDisarm,
  postEspnBookmarkletReplayRequest,
  type EspnBmBridgePickBatch,
} from "@/lib/espnBookmarkletBridge";
import {
  createEspnBmIngestState,
  planEspnBookmarkletBatchIngest,
  type EspnBmIngestState,
} from "@/lib/espnBookmarkletIngest";
import {
  buildEspnLiveDraftId,
  toNotifyLockedPickRequest,
  type NormalizedPickBatch,
} from "@shared/draftSource";

export type EspnBookmarkletMonitorStatus = {
  active: boolean;
  /**
   * True when bookmarklet transport owns ingest (disable legacy league-fetch fallback).
   * Set as soon as ARM succeeds — waiting for ESPN tab/bookmarklet is still owned.
   */
  transportActive: boolean;
  /** True after STATUS/PICK_BATCH/PONG handshake from the ESPN Mirror publisher. */
  mirrorHandshake: boolean;
  extensionPresent: boolean;
  connectorStatus: string;
  lastError: string | null;
  draftId: string;
  lockedCount: number;
  notifiedCount: number;
  draftComplete: boolean;
  lastPollAt: string | null;
  sessionNonce: string | null;
  /** Last accepted PICK_BATCH revision (transport). */
  lastRevision: number | null;
  espnTabs: number | null;
  diagnostics: Record<string, unknown> | null;
};

type Args = {
  enabled: boolean;
  leagueId: string | null | undefined;
  season: number;
  teamCount?: number;
  draftPace?: "broadcast" | "brisk" | "turbo";
  armExtension?: boolean;
  onNormalizedBatch?: (batch: NormalizedPickBatch) => void;
  onSessionReset?: (draftId: string) => void;
};

const INITIAL = (draftId: string): EspnBookmarkletMonitorStatus => ({
  active: false,
  transportActive: false,
  mirrorHandshake: false,
  extensionPresent: false,
  connectorStatus: "idle",
  lastError: null,
  draftId,
  lockedCount: 0,
  notifiedCount: 0,
  draftComplete: false,
  lastPollAt: null,
  sessionNonce: null,
  lastRevision: null,
  espnTabs: null,
  diagnostics: null,
});

export function useEspnBookmarkletDraftMonitor({
  enabled,
  leagueId,
  season,
  teamCount = 12,
  draftPace = "broadcast",
  armExtension = true,
  onNormalizedBatch,
  onSessionReset,
}: Args): EspnBookmarkletMonitorStatus {
  const _trpc = trpc as any;
  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  const notifyMut = _trpc.rfsnBroadcast.notifyLockedPick.useMutation();
  const resetMut = _trpc.rfsnBroadcast.resetLiveSession.useMutation();
  const notifyMutRef = useRef(notifyMut);
  const resetMutRef = useRef(resetMut);
  useEffect(() => {
    notifyMutRef.current = notifyMut;
  }, [notifyMut]);
  useEffect(() => {
    resetMutRef.current = resetMut;
  }, [resetMut]);
  const onNormalizedBatchRef = useRef(onNormalizedBatch);
  useEffect(() => {
    onNormalizedBatchRef.current = onNormalizedBatch;
  }, [onNormalizedBatch]);
  const onSessionResetRef = useRef(onSessionReset);
  useEffect(() => {
    onSessionResetRef.current = onSessionReset;
  }, [onSessionReset]);

  const draftId = buildEspnLiveDraftId(String(leagueId ?? ""), season);
  const sessionNonceRef = useRef<string | null>(null);
  const ingestRef = useRef<EspnBmIngestState>(createEspnBmIngestState());
  const teamCountRef = useRef(teamCount);
  useEffect(() => {
    teamCountRef.current = teamCount;
  }, [teamCount]);

  const [status, setStatus] = useState<EspnBookmarkletMonitorStatus>(() =>
    INITIAL(draftId),
  );

  const canRun = Boolean(
    enabled &&
      leagueId &&
      accessQ.data?.enabled &&
      accessQ.data?.canAccess,
  );

  // Arm / disarm extension + bookmarklet publisher session
  useEffect(() => {
    if (!canRun || !armExtension) {
      if (enabled === false) {
        void postEspnBookmarkletDisarm().catch(() => {});
      }
      sessionNonceRef.current = null;
      ingestRef.current = createEspnBmIngestState();
      setStatus((s) => ({
        ...INITIAL(draftId),
        extensionPresent: isGmWarRoomExtensionPresent(),
        connectorStatus: enabled ? s.connectorStatus : "idle",
      }));
      return;
    }

    let cancelled = false;
    const nonce = newEspnBookmarkletSessionNonce();
    sessionNonceRef.current = nonce;
    ingestRef.current = createEspnBmIngestState();

    (async () => {
      const ext = isGmWarRoomExtensionPresent();
      if (!ext) {
        setStatus({
          ...INITIAL(draftId),
          extensionPresent: false,
          connectorStatus: "extension_missing",
          lastError: "Install / enable the GM War Room extension for ESPN bookmarklet transport.",
          draftId,
        });
        return;
      }
      const arm = await postEspnBookmarkletArm({
        leagueId: String(leagueId),
        season,
        sessionNonce: nonce,
        draftPace,
      });
      if (cancelled) return;
      if (arm.sessionNonce) sessionNonceRef.current = arm.sessionNonce;
      const reached = arm.reached ?? 0;
      // Own ingest as soon as ARM succeeds so legacy league-fetch polling never runs.
      const transportActive = Boolean(arm.ok);
      const mirrorHandshake = false;
      setStatus({
        active: true,
        transportActive,
        mirrorHandshake,
        extensionPresent: true,
        connectorStatus: !arm.ok
          ? "arm_failed"
          : reached > 0
            ? "waiting_for_espn_mirror"
            : "waiting_for_espn_tab",
        // Waiting for Mirror is not a reconnect error — keep lastError clean.
        lastError: arm.error ? String(arm.error) : null,
        draftId,
        lockedCount: 0,
        notifiedCount: 0,
        draftComplete: false,
        lastPollAt: null,
        sessionNonce: sessionNonceRef.current,
        lastRevision: null,
        espnTabs: arm.espnTabs ?? null,
        diagnostics: null,
      });

      // Phase 4 — after reconnect ARM, request idempotent board reconciliation.
      if (arm.ok && sessionNonceRef.current) {
        void postEspnBookmarkletReplayRequest({
          draftId,
          sessionNonce: sessionNonceRef.current,
          afterOverallPick: ingestRef.current.maxOverallSeen,
        }).catch(() => {});
      }
    })().catch((err) => {
      if (cancelled) return;
      setStatus({
        ...INITIAL(draftId),
        extensionPresent: isGmWarRoomExtensionPresent(),
        connectorStatus: "arm_failed",
        lastError: err instanceof Error ? err.message : "arm_failed",
        draftId,
      });
    });

    return () => {
      cancelled = true;
      void postEspnBookmarkletDisarm().catch(() => {});
    };
  }, [canRun, armExtension, leagueId, season, enabled, draftId, draftPace]);

  // Listen for bridge events
  useEffect(() => {
    if (!canRun || !leagueId) return;

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const parsed = parseEspnBookmarkletBridgeMessage(ev.data);
      if (!parsed) return;

      if (parsed.type === "GMWR_ESPN_BM_STATUS") {
        const handshook =
          parsed.status === "monitoring" ||
          parsed.status === "armed" ||
          parsed.status === "complete" ||
          parsed.status === "ready";
        setStatus((s) => ({
          ...s,
          extensionPresent: true,
          transportActive: s.transportActive || handshook,
          mirrorHandshake: s.mirrorHandshake || handshook,
          connectorStatus: handshook
            ? parsed.status === "complete"
              ? "complete"
              : "monitoring"
            : parsed.status || s.connectorStatus,
          draftComplete: parsed.draftComplete ?? s.draftComplete,
          lastError:
            parsed.reason &&
            !handshook
              ? String(parsed.reason)
              : handshook
                ? null
                : s.lastError,
          espnTabs: parsed.espnTabs ?? s.espnTabs,
          diagnostics: parsed.diagnostics ?? s.diagnostics,
          lastPollAt: new Date().toISOString(),
          lastRevision:
            parsed.revision != null && Number.isFinite(Number(parsed.revision))
              ? Math.max(s.lastRevision ?? 0, Math.floor(Number(parsed.revision)))
              : s.lastRevision,
        }));
        return;
      }

      if (parsed.type === "GMWR_ESPN_BM_PONG") {
        setStatus((s) => ({
          ...s,
          extensionPresent: true,
          transportActive: s.transportActive || Boolean(parsed.armed),
          mirrorHandshake: s.mirrorHandshake || Boolean(parsed.armed),
          connectorStatus: parsed.armed ? "monitoring" : s.connectorStatus,
          sessionNonce: parsed.sessionNonce ?? s.sessionNonce,
        }));
        return;
      }

      if (parsed.type === "GMWR_ESPN_BM_SESSION_RESET") {
        ingestRef.current = createEspnBmIngestState();
        const resetDraftId = parsed.draftId || draftId;
        void resetMutRef.current
          .mutateAsync({ leagueId: String(leagueId), draftId: resetDraftId })
          .catch(() => {});
        onSessionResetRef.current?.(resetDraftId);
        setStatus((s) => ({
          ...s,
          lockedCount: 0,
          notifiedCount: 0,
          draftComplete: false,
          connectorStatus: "session_reset",
          lastError: null,
        }));
        return;
      }

      if (parsed.type === "GMWR_ESPN_BM_PICK_BATCH") {
        void ingestBatch(parsed, String(leagueId), season, draftPace);
      }
    };

    async function ingestBatch(
      batch: EspnBmBridgePickBatch,
      lid: string,
      seas: number,
      pace: "broadcast" | "brisk" | "turbo",
    ) {
      const expectedNonce = sessionNonceRef.current;
      if (!expectedNonce) {
        setStatus((s) => ({
          ...s,
          lastError: "session_not_armed",
        }));
        return;
      }

      const plan = planEspnBookmarkletBatchIngest({
        batch,
        expectedLeagueId: lid,
        expectedSeason: seas,
        expectedSessionNonce: expectedNonce,
        state: ingestRef.current,
      });
      ingestRef.current = plan.next;

      if (!plan.ok) {
        if (import.meta.env.DEV) {
          console.debug("[espn-bm] ingest rejected", plan.error, {
            draftId: batch.draftId,
            sessionNonce: batch.sessionNonce,
          });
        }
        setStatus((s) => ({
          ...s,
          lastError:
            plan.error === "wrong_session_nonce" ||
            plan.error === "unknown_draft_id"
              ? plan.error
              : s.lastError,
          lastPollAt: new Date().toISOString(),
        }));
        return;
      }

      setStatus((s) => ({
        ...s,
        transportActive: true,
        mirrorHandshake: true,
        active: true,
        extensionPresent: true,
        connectorStatus: "monitoring",
        lastError: null,
        lastPollAt: new Date().toISOString(),
        lastRevision: ingestRef.current.lastAcceptedRevision || s.lastRevision,
      }));

      if (plan.projectionBatch) {
        onNormalizedBatchRef.current?.(plan.projectionBatch);
      }

      const teams = Math.max(1, teamCountRef.current || batch.teamCount || 12);
      let lastOverall: number | null = null;
      let lastName: string | null = null;
      for (const event of plan.notifyEvents) {
        const request = toNotifyLockedPickRequest(event, {
          teamCount: teams,
          draftComplete: Boolean(event.metadata?.draftCompletePick),
          draftPace: pace,
        });
        try {
          await notifyMutRef.current.mutateAsync(request);
          lastOverall = event.overallPick;
          lastName = event.playerName;
          if (import.meta.env.DEV) {
            console.debug("[espn-bm] pick → notifyLockedPick", {
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
        }
      }

      // Completion-only empty batch: still mark complete on booth via a no-op path —
      // projection already applied draftComplete. No notify without picks.

      setStatus((s) => ({
        ...s,
        transportActive: true,
        mirrorHandshake: true,
        active: true,
        draftId: batch.draftId,
        lockedCount: Math.max(
          s.lockedCount,
          lastOverall ?? ingestRef.current.maxOverallSeen,
          s.lockedCount,
        ),
        notifiedCount: ingestRef.current.alreadyNotified.size,
        draftComplete:
          batch.draftComplete || ingestRef.current.draftCompleteApplied,
        lastPollAt: new Date().toISOString(),
        lastRevision: ingestRef.current.lastAcceptedRevision || batch.revision,
        diagnostics: batch.diagnostics ?? s.diagnostics,
        lastError: null,
        connectorStatus: "monitoring",
      }));

      void lastName;
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canRun, leagueId, season, draftPace, draftId]);

  useEffect(() => {
    if (!enabled) {
      sessionNonceRef.current = null;
      ingestRef.current = createEspnBmIngestState();
      setStatus(INITIAL(draftId));
    }
  }, [enabled, draftId]);

  return status;
}
