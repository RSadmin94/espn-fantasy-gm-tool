import { Volume2, VolumeX, Radio, Square, RotateCcw } from "lucide-react";
import type { RfsnAudioPlayback } from "@/hooks/useRfsnAudioPlayback";
import { cn } from "@/lib/utils";

type RfsnAudioControlsProps = {
  audio: RfsnAudioPlayback;
  ttsAvailable: boolean;
  className?: string;
};

export function RfsnAudioControls({ audio, ttsAvailable, className }: RfsnAudioControlsProps) {
  if (!ttsAvailable) return null;

  // "locked" = enabled preference but no user gesture yet this session (autoplay guard).
  const locked = !audio.unlocked && audio.state !== "disabled";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2",
        className,
      )}
    >
      {locked ? (
        <button
          type="button"
          onClick={audio.unlockAudio}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#a3e635]/15 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-[#a3e635] hover:bg-[#a3e635]/25"
        >
          <Radio className="h-3.5 w-3.5" aria-hidden />
          {audio.userEnabled ? "Tap to Enable Sound" : "Enable Broadcast Audio"}
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => audio.setMuted(!audio.muted)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#dbe4f0] hover:bg-white/5"
            aria-label={audio.muted ? "Unmute" : "Mute"}
          >
            {audio.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span>{audio.muted ? "Muted" : "Audio on"}</span>
          </button>
          <label className="inline-flex items-center gap-2 text-xs text-[#8b97a8]">
            Vol
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audio.volume}
              onChange={(e) => audio.setVolume(Number(e.target.value))}
              className="w-20 accent-[#a3e635]"
            />
          </label>
          <button
            type="button"
            onClick={audio.stopCurrent}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#dbe4f0] hover:bg-white/5"
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
            Stop
          </button>
          <button
            type="button"
            onClick={audio.replayCurrent}
            disabled={!audio.replayAvailable}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
              audio.replayAvailable
                ? "text-[#dbe4f0] hover:bg-white/5"
                : "text-[#5a6470] cursor-not-allowed opacity-60",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Replay
          </button>
        </>
      )}
    </div>
  );
}
