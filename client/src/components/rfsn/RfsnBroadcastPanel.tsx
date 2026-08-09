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
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import { useRfsnBoothController } from "@/hooks/useRfsnBoothController";
import { buildBoothCommentarySequence } from "@/lib/rfsnBoothPresentation";
import {
  appendCommentaryLogEntry,
  type RfsnCommentaryLogEntry,
} from "@/lib/rfsnCommentaryLog";
import { RfsnAnalystBooth } from "./RfsnAnalystBooth";
import { RfsnAudioControls } from "./RfsnAudioControls";
import { RfsnCommentaryLog } from "./RfsnCommentaryLog";
import {
  liveSessionStatusLabel,
  resolveBoothFeedSnapshot,
  shouldRenderLiveCommentary,
  type RfsnLivePublicPayload,
} from "@/lib/rfsnLiveState";
import { warRoomAudioSessionKey } from "@/lib/rfsnWarRoomAudioSession";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import {
  liveDraftAudioStateLabel,
  liveDraftBoothPresenceLine,
} from "@/lib/liveDraftUx";
import { cn } from "@/lib/utils";

const PANEL_POLL_MS = 2000;

export type RfsnBroadcastPanelProps = {
  leagueId?: string | null;
  draftId: string;
  /**
   * When false, skip getLiveSnapshot polling (Mock Draft / Live Draft off).
   * Required so the shared War Room mount cannot leak polls after leaving Live Draft.
   */
  active?: boolean;
  /** Bumps when the draft resets or league/schedule identity changes — clears stale replay clips. */
  sessionResetKey?: string | number;
  /** War Room Pause — stops analyst speech and booth equalizer immediately. */
  draftPaused?: boolean;
  layout?: "desktop" | "mobile";
  className?: string;
  /** Reports whether a broadcast moment is generating or on air (drives the draft pause). */
  onBusyChange?: (busy: boolean) => void;
};

export function RfsnBroadcastPanel({
  leagueId,
  draftId,
  active = false,
  sessionResetKey,
  draftPaused = false,
  layout = "desktop",
  className,
  onBusyChange,
}: RfsnBroadcastPanelProps) {
  const _trpc = trpc as any;

  const accessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, { staleTime: 60_000 });
  const ttsAvailable = Boolean(accessQ.data?.ttsEnabled);
  const enabled = Boolean(accessQ.data?.canAccess);
  const snapshotEnabled = Boolean(active && leagueId && enabled);

  const snapshotQ = _trpc.rfsnBroadcast.getLiveSnapshot.useQuery(
    snapshotEnabled ? { leagueId: leagueId as string, draftId } : skipToken,
    {
      enabled: snapshotEnabled,
      refetchInterval: snapshotEnabled ? PANEL_POLL_MS : false,
    },
  );

  const payload = snapshotQ.data as RfsnLivePublicPayload | undefined;

  // Hooks run unconditionally (before any early return) — Rules of Hooks.
  const persistKey =
    leagueId && draftId ? warRoomAudioSessionKey(leagueId, draftId) : undefined;
  const audio = useRfsnAudioPlayback(ttsAvailable, payload?.audioStatus ?? null, {
    persistKey,
    sessionEpoch: sessionResetKey,
    draftPaused,
  });

  const displaySnapshot = resolveBoothFeedSnapshot(payload, "");
  const boothSnapshot = displaySnapshot;
  const booth = useRfsnBoothController(boothSnapshot, { audio, draftPaused });
  const sequence = buildBoothCommentarySequence(boothSnapshot);
  const isMobile = layout === "mobile";
  const audioIsSpeaking = audio.state === "playing" && Boolean(booth.activeCommentator);
  const analystName = booth.activeCommentator
    ? COMMENTATOR_META[booth.activeCommentator].displayName
    : null;
  const boothPresence = liveDraftBoothPresenceLine({
    speaking: audioIsSpeaking,
    analystName,
  });
  const audioLabel = liveDraftAudioStateLabel({
    speaking: audioIsSpeaking,
    audioState: audio.state,
  });
  const [commentaryLog, setCommentaryLog] = useState<RfsnCommentaryLogEntry[]>([]);
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const logResetAtRef = useRef<number>(Date.now());

  // A broadcast moment is "busy" (should hold the draft) while it is generating
  // (commentary_pending) or while the booth sequence is still playing (sequenceIndex >= 0).
  // When the sequence completes / is dismissed / all voices fail, the controller returns
  // sequenceIndex to -1, so busy clears and the engine resumes.
  const busy = Boolean(
    enabled &&
      !draftPaused &&
      payload &&
      (payload.sessionState === "commentary_pending" || booth.sequenceIndex >= 0),
  );
  const lastBusyRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastBusyRef.current === busy) return;
    lastBusyRef.current = busy;
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    audio.clearReplay();
    setCommentaryLog([]);
    seenLogIdsRef.current = new Set();
    logResetAtRef.current = Date.now();
  }, [draftId, sessionResetKey, audio.clearReplay]);

  useEffect(() => {
    if (!payload || !payload.snapshot || !shouldRenderLiveCommentary(payload)) return;
    if (payload.generatedAt) {
      const generatedAt = Date.parse(payload.generatedAt);
      if (Number.isFinite(generatedAt) && generatedAt < logResetAtRef.current) return;
    }
    if (sequence.length === 0) return;

    setCommentaryLog((prev) => {
      let next = prev;
      for (const card of sequence) {
        const id = `${payload.activePickIdentity?.pickId ?? payload.snapshot?.overallPick ?? "pick"}:${card.id}`;
        if (seenLogIdsRef.current.has(id)) continue;
        seenLogIdsRef.current.add(id);
        next = appendCommentaryLogEntry(next, {
          id,
          pickLabel: String(payload.snapshot?.overallPick ?? payload.activePickIdentity?.pickNumber ?? "—"),
          commentator: card.commentator,
          text: card.text,
        });
      }
      return next;
    });
  }, [payload, sequence]);

  if (!enabled) return null; // broadcast disabled → render nothing; War Room board unaffected

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-black/25 p-3 md:p-4",
        className,
      )}
      data-rfsn-warroom-broadcast
    >
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-label font-black uppercase tracking-wider text-[#a3e635]">
          RFSN Booth
        </span>
        <span className="text-label uppercase tracking-wider text-[#8b97a8]">
          {payload ? liveSessionStatusLabel(payload.sessionState) : "Standing by"}
        </span>
      </div>

      <div
        className="mb-3 rounded-md border border-white/[0.06] bg-black/35 px-2.5 py-2"
        data-rfsn-booth-status
        data-rfsn-024
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-label font-semibold",
              audioIsSpeaking ? "text-[#a3e635]" : "text-zinc-300",
            )}
            data-booth-presence
          >
            {boothPresence}
          </span>
          <span
            className={cn(
              "text-label font-black uppercase tracking-wider",
              audioIsSpeaking ? "text-[#a3e635]" : "text-ink-secondary",
            )}
            data-booth-audio-state
          >
            {audioLabel}
          </span>
        </div>
        {!audioIsSpeaking && (
          <p className="mt-1 text-label text-ink-secondary">
            Silence is editorial — coverage fires on significant moments.
          </p>
        )}
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
        audioIsSpeaking={audioIsSpeaking}
      />

      <RfsnCommentaryLog entries={commentaryLog} />
    </div>
  );
}
