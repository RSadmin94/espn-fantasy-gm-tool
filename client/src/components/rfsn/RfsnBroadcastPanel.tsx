/**
 * RfsnBroadcastPanel — compact booth + audio, embeddable in the Draft War Room.
 *
 * Reuses the EXACT RFSN Live wiring (useRfsnBoothController + useRfsnAudioPlayback
 * + RfsnAnalystBooth + RfsnAudioControls) so the War Room's Live Draft screen shows
 * the Sofia/Coach/Roxanne booth and plays audio from the same live session — no
 * board duplication (the War Room already renders its own board), no broadcast
 * redesign. Polls the same getLiveSnapshot(draftId) RFSN Live polls.
 */
import { skipToken } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useRfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import { useRfsnBoothController } from "@/hooks/useRfsnBoothController";
import { buildBoothCommentarySequence } from "@/lib/rfsnBoothPresentation";
import { RfsnAnalystBooth } from "./RfsnAnalystBooth";
import { RfsnAudioControls } from "./RfsnAudioControls";
import {
  liveSessionStatusLabel,
  resolveBoothFeedSnapshot,
  shouldRenderLiveCommentary,
  type RfsnLivePublicPayload,
} from "@/lib/rfsnLiveState";
import { warRoomAudioSessionKey } from "@/lib/rfsnWarRoomAudioSession";
import { cn } from "@/lib/utils";

const PANEL_POLL_MS = 2000;

export type RfsnBroadcastPanelProps = {
  leagueId?: string | null;
  draftId: string;
  /** Bumps when the draft resets or league/schedule identity changes — clears stale replay clips. */
  sessionResetKey?: string | number;
  layout?: "desktop" | "mobile";
  className?: string;
  /** Reports whether a broadcast moment is generating or on air (drives the draft pause). */
  onBusyChange?: (busy: boolean) => void;
};

export function RfsnBroadcastPanel({
  leagueId,
  draftId,
  sessionResetKey,
  layout = "desktop",
  className,
  onBusyChange,
}: RfsnBroadcastPanelProps) {
  const _trpc = trpc as any;

  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, { staleTime: 60_000 });
  const ttsAvailable = Boolean(accessQ.data?.ttsEnabled);
  const enabled = Boolean(accessQ.data?.canAccess);

  const snapshotQ = _trpc.rfsnBroadcast.getLiveSnapshot.useQuery(
    leagueId && enabled ? { leagueId, draftId } : skipToken,
    { refetchInterval: PANEL_POLL_MS, refetchIntervalInBackground: true },
  );

  const payload = snapshotQ.data as RfsnLivePublicPayload | undefined;

  // Hooks run unconditionally (before any early return) — Rules of Hooks.
  const persistKey =
    leagueId && draftId ? warRoomAudioSessionKey(leagueId, draftId) : undefined;
  const audio = useRfsnAudioPlayback(ttsAvailable, payload?.audioStatus ?? null, {
    persistKey,
    sessionEpoch: sessionResetKey,
  });

  const displaySnapshot = resolveBoothFeedSnapshot(payload, "");
  const boothSnapshot = displaySnapshot;
  const booth = useRfsnBoothController(boothSnapshot, { audio });
  const sequence = buildBoothCommentarySequence(boothSnapshot);
  const isMobile = layout === "mobile";

  // A broadcast moment is "busy" (should hold the draft) while it is generating
  // (commentary_pending) or while the booth sequence is still playing (sequenceIndex >= 0).
  // When the sequence completes / is dismissed / all voices fail, the controller returns
  // sequenceIndex to -1, so busy clears and the engine resumes.
  const busy = Boolean(
    enabled && payload && (payload.sessionState === "commentary_pending" || booth.sequenceIndex >= 0),
  );
  const lastBusyRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastBusyRef.current === busy) return;
    lastBusyRef.current = busy;
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  if (!enabled) return null; // broadcast disabled → render nothing; War Room board unaffected

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-black/25 p-3 md:p-4",
        className,
      )}
      data-rfsn-warroom-broadcast
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-[#a3e635]">
          RFSN Booth
        </span>
        <span className="text-[11px] uppercase tracking-wider text-[#8b97a8]">
          {payload ? liveSessionStatusLabel(payload.sessionState) : "Standing by"}
        </span>
      </div>

      {ttsAvailable && (
        <div className="mb-3">
          <RfsnAudioControls audio={audio} ttsAvailable={ttsAvailable} />
        </div>
      )}

      <RfsnAnalystBooth
        cardStates={booth.cardStates}
        activeCommentator={booth.activeCommentator}
        activeCard={booth.activeCard}
        sequence={sequence}
        onDismiss={booth.dismissFor}
        layout={isMobile ? "mobile" : "desktop"}
      />
    </div>
  );
}
