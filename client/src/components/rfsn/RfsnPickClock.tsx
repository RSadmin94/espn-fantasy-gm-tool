import React from "react";
import { Clock, Radio, Pause, User, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPACE_CARD } from "@/lib/density";
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
  /**
   * Most recently locked player name (confirmed pick only).
   * When null/empty, shows DRAFT READY.
   */
  lastLockedPlayerName?: string | null;
};

/** Decorative stars wrap the name for sighted users; a11y uses aria-label only. */
export function formatPlayerTicker(name: string | null | undefined): {
  display: string;
  accessible: string;
} {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    return { display: "******** DRAFT READY ********", accessible: "Draft ready" };
  }
  const upper = trimmed.toUpperCase();
  return {
    display: `******** ${upper} ********`,
    accessible: `Last pick: ${upper}`,
  };
}

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
  lastLockedPlayerName,
}: RfsnPickClockProps) {
  const Icon =
    state === "paused_for_broadcast" ? Radio
      : state === "manual_team_wait" ? User
      : state === "complete" ? Trophy
      : state === "urgent" ? Pause
      : Clock;
  const showCountdown = state === "running" || state === "urgent";
  const ticker = formatPlayerTicker(lastLockedPlayerName);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border text-sm flex-wrap", SPACE_CARD,
        TONE[state],
        state === "urgent" && "animate-pulse",
        className,
      )}
      data-clock-state={state}
      aria-label={`Draft clock: ${CLOCK_STATE_LABEL[state]}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-secondary">Round</span>
        <span className="font-extrabold tabular-nums text-base">{round}</span>
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-secondary ml-2">Pick</span>
        <span className="font-extrabold tabular-nums text-base">
          {overallPick}
          {totalPicks ? <span className="opacity-50">/{totalPicks}</span> : null}
        </span>
      </div>

      {state !== "complete" && (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-2xs font-semibold uppercase tracking-wide text-ink-secondary shrink-0">On the clock</span>
          <span className="font-semibold truncate text-sm">{onClockTeam}</span>
          {onClockOwner ? <span className="text-label text-ink-secondary truncate hidden sm:inline">{onClockOwner}</span> : null}
        </div>
      )}

      <div
        className="min-w-0 max-w-[min(100%,28rem)] flex-1 basis-[12rem] truncate text-center font-semibold tracking-wide text-label sm:text-xs uppercase opacity-90"
        data-player-ticker
        aria-label={ticker.accessible}
        title={ticker.display}
      >
        <span aria-hidden>{ticker.display}</span>
      </div>

      <div className="ml-auto flex items-center gap-2 shrink-0">
        {showCountdown ? (
          <span className="font-extrabold tabular-nums text-lg">{formatClock(remainingMs)}</span>
        ) : (
          <span className="text-2xs font-semibold uppercase tracking-wide">
            {CLOCK_STATE_LABEL[state]}
          </span>
        )}
      </div>
    </div>
  );
}
