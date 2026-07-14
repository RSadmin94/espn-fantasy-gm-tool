/**
 * RfsnBroadcastPanel — compact booth + audio, embeddable in the Draft War Room.
 *
 * Written commentary is the launch path (RFSN_VOICE_BETA=false): cards, running log,
 * and wrap-up render without Enable Sound / clip readiness / TTS.
 */
import { skipToken } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import { useRfsnBoothController } from "@/hooks/useRfsnBoothController";
import { buildBoothCommentarySequence, RFSN_VOICE_BETA } from "@/lib/rfsnBoothPresentation";
import { appendCommentaryLogEntry, type RfsnCommentaryLogEntry } from "@/lib/rfsnCommentaryLog";
import { RfsnAnalystBooth } from "./RfsnAnalystBooth";
import { RfsnAudioControls } from "./RfsnAudioControls";
import { RfsnCommentaryLog } from "./RfsnCommentaryLog";
import {
  liveSessionStatusLabel,
  resolveRfsnLiveDisplaySnapshot,
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
  /** Reports whether a broadcast moment is on air (drives the draft pause). */
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
  const ttsAvailable = RFSN_VOICE_BETA && Boolean(accessQ.data?.ttsEnabled);
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

  const displaySnapshot = resolveRfsnLiveDisplaySnapshot(payload, "");
  const boothSnapshot =
    payload && shouldRenderLiveCommentary(payload) && payload.snapshot
      ? payload.snapshot
      : displaySnapshot;
  // Voice off (written broadcast default): pass no audio so the booth advances on text
  // timers only — written commentary never waits for TTS / unlock / clip readiness.
  const booth = useRfsnBoothController(boothSnapshot, { audio: RFSN_VOICE_BETA ? audio : null });
  const sequence = buildBoothCommentarySequence(boothSnapshot);
  const isMobile = layout === "mobile";

  const [logEntries, setLogEntries] = useState<RfsnCommentaryLogEntry[]>([]);
  const lastLoggedIdRef = useRef<string | null>(null);
  const lastSessionResetRef = useRef(sessionResetKey);

  useEffect(() => {
    if (sessionResetKey === lastSessionResetRef.current) return;
    lastSessionResetRef.current = sessionResetKey;
    setLogEntries([]);
    lastLoggedIdRef.current = null;
  }, [sessionResetKey]);

  useEffect(() => {
    const card = booth.activeCard;
    if (!card?.text?.trim()) return;
    if (card.id === lastLoggedIdRef.current) return;
    lastLoggedIdRef.current = card.id;
    setLogEntries((prev) =>
      appendCommentaryLogEntry(prev, {
        id: card.id,
        pickLabel: boothSnapshot.overallPick,
        commentator: card.commentator,
        text: card.text,
      }),
    );
  }, [booth.activeCard, boothSnapshot.overallPick]);

  // Hold only while a written card is actually on air — never freeze for pending generation.
  const busy = Boolean(enabled && booth.sequenceIndex >= 0);
  const lastBusyRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastBusyRef.current === busy) return;
    lastBusyRef.current = busy;
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  if (!enabled) return null;

  const statusLabel = payload
    ? liveSessionStatusLabel(payload.sessionState)
    : "Standing by";
  const wrapUpOnAir =
    payload?.sessionState === "draft_complete" && Boolean(boothSnapshot.primary || booth.activeCard);

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-black/25 p-3 md:p-4",
        className,
      )}
      data-rfsn-warroom-broadcast
      data-rfsn-wrap-up={wrapUpOnAir ? "true" : "false"}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-[#a3e635]">
          RFSN Booth
        </span>
        <span className="text-[11px] uppercase tracking-wider text-[#8b97a8]">
          {statusLabel}
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

      <RfsnCommentaryLog entries={logEntries} />
    </div>
  );
}
