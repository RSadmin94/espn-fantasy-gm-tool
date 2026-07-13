import React from "react";
import { Clock, Radio, Pause, User, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLOCK_STATE_LABEL, formatClock, type DraftClockState } from "@/lib/draftClock";

export type RfsnPickClockProps = {
  state: DraftClockState;
  round: number;
  overallPick: number;
  totalPicks?: number;
  onClockTeam: string;
  onClockOwner?: string;
  remainingMs: number;
  className?: string;
};

const TONE: Record<DraftClockState, string> = {
  running: "border-zinc-700 bg-white/[0.03] text-zinc-100",
  urgent: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  paused_for_broadcast: "border-[#a3e635]/50 bg-[#a3e635]/10 text-[#a3e635]",
  manual_team_wait: "border-violet-500/50 bg-violet-500/10 text-violet-200",
  complete: "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
};

export function RfsnPickClock({
  state,
  round,
  overallPick,
  totalPicks,
  onClockTeam,
  onClockOwner,
  remainingMs,
  className,
}: RfsnPickClockProps) {
  const Icon =
    state === "paused_for_broadcast" ? Radio
      : state === "manual_team_wait" ? User
      : state === "complete" ? Trophy
      : state === "urgent" ? Pause
      : Clock;
  const showCountdown = state === "running" || state === "urgent";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm flex-wrap",
        TONE[state],
        state === "urgent" && "animate-pulse",
        className,
      )}
      data-clock-state={state}
      aria-label={`Draft clock: ${CLOCK_STATE_LABEL[state]}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] uppercase tracking-wider opacity-70">Round</span>
        <span className="font-black tabular-nums">{round}</span>
        <span className="text-[11px] uppercase tracking-wider opacity-70 ml-2">Pick</span>
        <span className="font-black tabular-nums">
          {overallPick}
          {totalPicks ? <span className="opacity-50">/{totalPicks}</span> : null}
        </span>
      </div>

      {state !== "complete" && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] uppercase tracking-wider opacity-70 shrink-0">On the clock</span>
          <span className="font-bold truncate">{onClockTeam}</span>
          {onClockOwner ? <span className="text-[11px] opacity-60 truncate hidden sm:inline">{onClockOwner}</span> : null}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {showCountdown ? (
          <span className="font-black tabular-nums text-base">{formatClock(remainingMs)}</span>
        ) : (
          <span className="text-[11px] font-black uppercase tracking-wider">
            {CLOCK_STATE_LABEL[state]}
          </span>
        )}
      </div>
    </div>
  );
}
