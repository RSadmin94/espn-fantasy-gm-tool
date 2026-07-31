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
import { isEspnMirrorPublisherHandshake } from "@/lib/espnBookmarkletLivePath";
import {
  buildEspnLiveDraftId,
  toNotifyLockedPickRequest,
  type NormalizedPickBatch,
} from "@shared/draftSource";

export type EspnBmTransportCheckpoints = {
  extensionPresent: boolean;
  espnTabs: number | null;
  armSent: boolean;
  armReplyOk: boolean;
  armReached: number | null;
  mirrorHandshake: boolean;
  draftId: string | null;
  sessionNonce: string | null;
  lastRevision: number | null;
  lockedCount: number;
  /** Product gate for notifyLockedPick only — does not block ARM/board projection. */
  canNotify: boolean;
};

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
  /** Focused connection checkpoints for DevTools / support. */
  checkpoints: EspnBmTransportCheckpoints;
};

type Args = {
  enabled: boolean;
  leagueId: string | null | undefined;
  season: number;
  teamCount?: number;
  draftPace?: "broadcast" | "brisk" | "turbo";
  armExtension?: boolean;
  /**
   * Booth / wrap-up session id (includes run suffix). When set, notifyLockedPick
   * uses this instead of the provider batch draftId so ESPN Mock runs do not collide.
   */
  notifyDraftId?: string | null;
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
  checkpoints: {
    extensionPresent: false,
    espnTabs: null,
    armSent: false,
    armReplyOk: false,
    armReached: null,
    mirrorHandshake: false,
    draftId: draftId || null,
    sessionNonce: null,
    lastRevision: null,
    lockedCount: 0,
    canNotify: false,
  },
});

function checkpointLog(
  name: string,
  fields: Record<string, unknown>,
): void {
  try {
    console.info("[espn-bm-checkpoint]", name, fields);
  } catch {
    /* ignore */
  }
}
export function useEspnBookmarkletDraftMonitor({
  enabled,
  leagueId,
  season,
  teamCount = 12,
  draftPace = "broadcast",
  armExtension = true,
  notifyDraftId = null,
  onNormalizedBatch,
  onSessionReset,
}: Args): EspnBookmarkletMonitorStatus {
  const _trpc = trpc as any;
  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled,
    staleTime: 60_000,
  });
  /** Product authorization — booth notify only. Never blocks ARM / board projection. */
  const canNotify = Boolean(accessQ.data?.canAccess);
  const canNotifyRef = useRef(canNotify);
  useEffect(() => {
    canNotifyRef.current = canNotify;
  }, [canNotify]);
  const notifyDraftIdRef = useRef(notifyDraftId);
  useEffect(() => {
    notifyDraftIdRef.current = notifyDraftId;
  }, [notifyDraftId]);
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

  // Transport handshake must not wait on canAccess (or access query resolution).
  const canTransport = Boolean(enabled && leagueId);

  useEffect(() => {
    setStatus((s) => ({
      ...s,
      checkpoints: { ...s.checkpoints, canNotify },
    }));
  }, [canNotify]);

  // Arm / disarm extension + bookmarklet publisher session
  useEffect(() => {
    if (!canTransport || !armExtension) {
      if (enabled === false) {
        void postEspnBookmarkletDisarm().catch(() => {});
      }
      sessionNonceRef.current = null;
      ingestRef.current = createEspnBmIngestState();
      const ext = isGmWarRoomExtensionPresent();
      checkpointLog("transport_idle", {
        enabled,
        canTransport,
        armExtension,
        extensionPresent: ext,
        canNotify: canNotifyRef.current,
      });
      setStatus((s) => ({
        ...INITIAL(draftId),
        extensionPresent: ext,
        connectorStatus: enabled ? s.connectorStatus : "idle",
        checkpoints: {
          ...INITIAL(draftId).checkpoints,
          extensionPresent: ext,
          canNotify: canNotifyRef.current,
        },
      }));
      return;
    }

    let cancelled = false;
    const nonce = newEspnBookmarkletSessionNonce();
    sessionNonceRef.current = nonce;
    ingestRef.current = createEspnBmIngestState();

    (async () => {
      const ext = isGmWarRoomExtensionPresent();
      checkpointLog("extension_presence", { extensionPresent: ext, draftId });
      if (!ext) {
        setStatus({
          ...INITIAL(draftId),
          extensionPresent: false,
          connectorStatus: "extension_missing",
          lastError: "Install / enable the GM War Room extension for ESPN bookmarklet transport.",
          draftId,
          checkpoints: {
            ...INITIAL(draftId).checkpoints,
            extensionPresent: false,
            canNotify: canNotifyRef.current,
          },
        });
        return;
      }
      checkpointLog("arm_sent", {
        leagueId: String(leagueId),
        season,
        sessionNonce: nonce,
        draftPace,
        canNotify: canNotifyRef.current,
      });
      const arm = await postEspnBookmarkletArm({
        leagueId: String(leagueId),
        season,
        sessionNonce: nonce,
        draftPace,
      });
      if (cancelled) return;
      if (arm.sessionNonce) sessionNonceRef.current = arm.sessionNonce;
      const reached = arm.reached ?? 0;
      checkpointLog("arm_reply", {
        ok: arm.ok,
        error: arm.error ?? null,
        espnTabs: arm.espnTabs ?? null,
        reached,
        sessionNonce: arm.sessionNonce ?? nonce,
      });
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
        diagnostics: {
          armOk: arm.ok,
          armReached: reached,
          canNotify: canNotifyRef.current,
        },
        checkpoints: {
          extensionPresent: true,
          espnTabs: arm.espnTabs ?? null,
          armSent: true,
          armReplyOk: Boolean(arm.ok),
          armReached: reached,
          mirrorHandshake: false,
          draftId,
          sessionNonce: sessionNonceRef.current,
          lastRevision: null,
          lockedCount: 0,
          canNotify: canNotifyRef.current,
        },
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
      checkpointLog("arm_failed", {
        error: err instanceof Error ? err.message : "arm_failed",
      });
      setStatus({
        ...INITIAL(draftId),
        extensionPresent: isGmWarRoomExtensionPresent(),
        connectorStatus: "arm_failed",
        lastError: err instanceof Error ? err.message : "arm_failed",
        draftId,
        checkpoints: {
          ...INITIAL(draftId).checkpoints,
          extensionPresent: isGmWarRoomExtensionPresent(),
          armSent: true,
          armReplyOk: false,
          canNotify: canNotifyRef.current,
        },
      });
    });

    return () => {
      cancelled = true;
      void postEspnBookmarkletDisarm().catch(() => {});
    };
  }, [canTransport, armExtension, leagueId, season, enabled, draftId, draftPace]);

  // Listen for bridge events
  useEffect(() => {
    if (!canTransport || !leagueId) return;

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const raw = ev.data as Record<string, unknown> | null;
      if (raw && raw.type === "GMWR_ESPN_BM_PICK_BATCH") {
        console.info("[espn-bm-path]", "warroom_recv_PICK_BATCH", {
          hop: "warroom",
          sessionNonce: raw.sessionNonce != null ? String(raw.sessionNonce) : null,
          draftId: raw.draftId != null ? String(raw.draftId) : null,
          protocolVersion: raw.protocolVersion,
          revision: raw.revision,
          batchSize: Array.isArray(raw.picks) ? raw.picks.length : null,
          expectedNonce: sessionNonceRef.current,
        });
      }
      const parsed = parseEspnBookmarkletBridgeMessage(ev.data);
      if (!parsed) {
        if (raw && raw.type === "GMWR_ESPN_BM_PICK_BATCH") {
          const draftId = String(raw.draftId ?? "").trim();
          const leagueIdRaw = String(raw.leagueId ?? "").trim();
          const season = Math.floor(Number(raw.season));
          const sessionNonce = String(raw.sessionNonce ?? "").trim();
          const revision = Math.floor(Number(raw.revision));
          let reject = "parseEspnBookmarkletBridgeMessage:null";
          if (!/^espn-live-\d+-\d{4}$/.test(draftId) || draftId.endsWith("-na")) {
            reject = "invalid_draft_id";
          } else if (!/^\d+$/.test(leagueIdRaw)) {
            reject = "invalid_league_id";
          } else if (!Number.isFinite(season) || season < 2000 || season > 2100) {
            reject = "invalid_season";
          } else if (!sessionNonce || sessionNonce.length > 128) {
            reject = "invalid_session_nonce";
          } else if (!Number.isFinite(revision) || revision < 1) {
            reject = "invalid_revision";
          } else if (!Array.isArray(raw.picks) || raw.picks.length > 256) {
            reject = "picks_invalid_or_too_many";
          } else if (raw.picks.length === 0 && !raw.draftComplete) {
            reject = "empty_non_complete_batch";
          } else {
            reject = "no_valid_picks_or_source";
          }
          console.info("[espn-bm-path]", "warroom_drop_PICK_BATCH", {
            hop: "warroom",
            reject,
            line: "parseEspnBookmarkletBridgeMessage",
            sessionNonce: sessionNonce || null,
            draftId: draftId || null,
            protocolVersion: raw.protocolVersion,
            revision: raw.revision,
            batchSize: Array.isArray(raw.picks) ? raw.picks.length : null,
          });
        }
        return;
      }

      if (parsed.type === "GMWR_ESPN_BM_STATUS") {
        const publisherConfirmed = isEspnMirrorPublisherHandshake({
          status: parsed.status,
          sessionNonce: parsed.sessionNonce,
          leagueId: parsed.leagueId,
          draftId: parsed.draftId,
        });
        checkpointLog("status", {
          status: parsed.status,
          publisherConfirmed,
          leagueId: parsed.leagueId ?? null,
          draftId: parsed.draftId ?? null,
          sessionNonce: parsed.sessionNonce ?? null,
          espnTabs: parsed.espnTabs ?? null,
        });
        setStatus((s) => ({
          ...s,
          extensionPresent: true,
          transportActive: s.transportActive || publisherConfirmed,
          mirrorHandshake: s.mirrorHandshake || publisherConfirmed,
          connectorStatus: publisherConfirmed
            ? parsed.status === "complete"
              ? "complete"
              : "monitoring"
            : parsed.status === "ready" ||
                parsed.status === "waiting_for_espn_mirror" ||
                parsed.status === "waiting_for_espn_tab" ||
                parsed.status === "mirror_inject_failed"
              ? parsed.status === "ready"
                ? "waiting_for_espn_mirror"
                : parsed.status
              : parsed.status || s.connectorStatus,
          draftComplete: parsed.draftComplete ?? s.draftComplete,
          lastError:
            parsed.reason &&
            !publisherConfirmed
              ? String(parsed.reason)
              : publisherConfirmed
                ? null
                : s.lastError,
          espnTabs: parsed.espnTabs ?? s.espnTabs,
          diagnostics: {
            ...(parsed.diagnostics ?? s.diagnostics ?? {}),
            lastStatus: parsed.status,
            publisherConfirmed,
          },
          lastPollAt: new Date().toISOString(),
          lastRevision:
            parsed.revision != null && Number.isFinite(Number(parsed.revision))
              ? Math.max(s.lastRevision ?? 0, Math.floor(Number(parsed.revision)))
              : s.lastRevision,
          sessionNonce: parsed.sessionNonce ?? s.sessionNonce,
          checkpoints: {
            ...s.checkpoints,
            extensionPresent: true,
            espnTabs: parsed.espnTabs ?? s.checkpoints.espnTabs,
            mirrorHandshake: s.mirrorHandshake || publisherConfirmed,
            draftId: parsed.draftId ?? s.checkpoints.draftId,
            sessionNonce: parsed.sessionNonce ?? s.checkpoints.sessionNonce,
            canNotify: canNotifyRef.current,
          },
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
          checkpoints: {
            ...s.checkpoints,
            extensionPresent: true,
            mirrorHandshake: s.mirrorHandshake || Boolean(parsed.armed),
            sessionNonce: parsed.sessionNonce ?? s.checkpoints.sessionNonce,
            canNotify: canNotifyRef.current,
          },
        }));
        return;
      }

      if (parsed.type === "GMWR_ESPN_BM_SESSION_RESET") {
        ingestRef.current = createEspnBmIngestState();
        const resetDraftId = parsed.draftId || draftId;
        // resetLiveSession is access-gated on the server — only call when authorized.
        if (canNotifyRef.current) {
          void resetMutRef.current
            .mutateAsync({ leagueId: String(leagueId), draftId: resetDraftId })
            .catch(() => {});
        }
        onSessionResetRef.current?.(resetDraftId);
        setStatus((s) => ({
          ...s,
          lockedCount: 0,
          notifiedCount: 0,
          draftComplete: false,
          connectorStatus: "session_reset",
          lastError: null,
          checkpoints: {
            ...s.checkpoints,
            lockedCount: 0,
            lastRevision: null,
            canNotify: canNotifyRef.current,
          },
        }));
        return;
      }

      if (parsed.type === "GMWR_ESPN_BM_PICK_BATCH") {
        console.info("[espn-bm-path]", "warroom_parsed_PICK_BATCH", {
          hop: "warroom",
          sessionNonce: parsed.sessionNonce,
          draftId: parsed.draftId,
          protocolVersion: parsed.protocolVersion,
          revision: parsed.revision,
          batchSize: parsed.picks.length,
          expectedNonce: sessionNonceRef.current,
        });
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
        console.info("[espn-bm-path]", "warroom_drop_PICK_BATCH", {
          hop: "ingest",
          reject: "session_not_armed",
          line: "useEspnBookmarkletDraftMonitor.ts:!expectedNonce",
          sessionNonce: batch.sessionNonce,
          draftId: batch.draftId,
          protocolVersion: batch.protocolVersion,
          revision: batch.revision,
          batchSize: batch.picks.length,
        });
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
        console.info("[espn-bm-path]", "warroom_drop_PICK_BATCH", {
          hop: "ingest",
          reject: plan.error,
          line: "planEspnBookmarkletBatchIngest",
          sessionNonce: batch.sessionNonce,
          draftId: batch.draftId,
          protocolVersion: batch.protocolVersion,
          revision: batch.revision,
          batchSize: batch.picks.length,
          expectedNonce,
          expectedLeagueId: lid,
          expectedSeason: seas,
        });
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
        console.info("[espn-bm-path]", "warroom_applyNormalizedPickBatch", {
          hop: "apply",
          sessionNonce: batch.sessionNonce,
          draftId: batch.draftId,
          protocolVersion: batch.protocolVersion,
          revision: batch.revision,
          batchSize: batch.picks.length,
          projectionSize: plan.projectionBatch.picks.length,
        });
        checkpointLog("snapshot_applied", {
          draftId: batch.draftId,
          revision: batch.revision,
          batchSize: batch.picks.length,
          projectionSize: plan.projectionBatch.picks.length,
          baselineOnly: batch.baselineOnly,
          liveNotify: batch.liveNotify,
        });
        onNormalizedBatchRef.current?.(plan.projectionBatch);
      } else {
        console.info("[espn-bm-path]", "warroom_skip_apply_null_projection", {
          hop: "apply",
          sessionNonce: batch.sessionNonce,
          draftId: batch.draftId,
          protocolVersion: batch.protocolVersion,
          revision: batch.revision,
          batchSize: batch.picks.length,
        });
      }

      const teams = Math.max(1, teamCountRef.current || batch.teamCount || 12);
      let lastOverall: number | null = null;
      let lastName: string | null = null;
      let notified = 0;
      for (const event of plan.notifyEvents) {
        if (!canNotifyRef.current) {
          checkpointLog("notify_skipped_no_access", {
            overallPick: event.overallPick,
            playerName: event.playerName,
          });
          continue;
        }
        const request = toNotifyLockedPickRequest(
          {
            ...event,
            draftId: notifyDraftIdRef.current?.trim() || event.draftId,
          },
          {
            teamCount: teams,
            draftComplete: Boolean(event.metadata?.draftCompletePick),
            draftPace: pace,
          },
        );
        try {
          await notifyMutRef.current.mutateAsync(request);
          notified += 1;
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

      const locked = Math.max(
        lastOverall ?? ingestRef.current.maxOverallSeen,
        ingestRef.current.maxOverallSeen,
      );
      const rev = ingestRef.current.lastAcceptedRevision || batch.revision;
      checkpointLog("connected", {
        draftId: batch.draftId,
        revision: rev,
        lockedCount: locked,
        notified,
        canNotify: canNotifyRef.current,
        notifyEvents: plan.notifyEvents.length,
      });
      setStatus((s) => ({
        ...s,
        transportActive: true,
        mirrorHandshake: true,
        active: true,
        draftId: batch.draftId,
        lockedCount: Math.max(s.lockedCount, locked),
        notifiedCount: ingestRef.current.alreadyNotified.size,
        draftComplete:
          batch.draftComplete || ingestRef.current.draftCompleteApplied,
        lastPollAt: new Date().toISOString(),
        lastRevision: rev,
        diagnostics: batch.diagnostics ?? s.diagnostics,
        lastError: null,
        connectorStatus: "monitoring",
        checkpoints: {
          ...s.checkpoints,
          extensionPresent: true,
          mirrorHandshake: true,
          draftId: batch.draftId,
          sessionNonce: batch.sessionNonce ?? s.checkpoints.sessionNonce,
          lastRevision: rev,
          lockedCount: Math.max(s.lockedCount, locked),
          canNotify: canNotifyRef.current,
        },
      }));

      void lastName;
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canTransport, leagueId, season, draftPace, draftId]);

  useEffect(() => {
    if (!enabled) {
      sessionNonceRef.current = null;
      ingestRef.current = createEspnBmIngestState();
      setStatus(INITIAL(draftId));
    }
  }, [enabled, draftId]);

  return status;
}
