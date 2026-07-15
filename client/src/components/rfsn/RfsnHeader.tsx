import { cn } from "@/lib/utils";
import { Clock, Radio, Users } from "lucide-react";

export type RfsnHeaderProps = {
  round: number;
  pickInRound: number;
  overallPick: string;
  onClockTeam: string;
  clockSeconds?: number;
  momentScore?: number | null;
  onlineCount?: number;
  className?: string;
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RfsnHeader({
  round,
  overallPick,
  onClockTeam,
  clockSeconds = 90,
  momentScore = null,
  onlineCount = 10,
  className,
}: RfsnHeaderProps) {
  return (
    <header
      className={cn("rfsn-score-bug px-2 py-2 md:px-3", className)}
      aria-label="Broadcast score bug"
    >
      <div className="flex flex-wrap items-stretch justify-between gap-y-2 md:flex-nowrap md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-lg font-black tracking-tighter text-white md:text-xl">
            RFS<span className="text-red-500">N</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-sm bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-[0_0_10px_rgba(220,38,38,0.4)]">
            <Radio className="h-3 w-3 rfsn-mic-live" aria-hidden />
            Live
          </span>
        </div>

        <div className="flex flex-1 flex-wrap items-center justify-center gap-0 md:justify-center">
          <div className="rfsn-score-bug-segment text-center">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Round</span>
            <span className="text-sm font-black tabular-nums text-white md:text-base">{round}</span>
          </div>
          <div className="rfsn-score-bug-segment text-center">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Pick</span>
            <span className="text-sm font-black tabular-nums text-white md:text-base">{overallPick}</span>
          </div>
          <div className="rfsn-score-bug-segment hidden text-center sm:flex">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">League</span>
            <span className="text-xs font-bold text-white/80">10T PPR</span>
          </div>
          <div className="rfsn-score-bug-segment text-center">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Clock</span>
            <span className="inline-flex items-center gap-1 text-sm font-black tabular-nums text-emerald-400">
              <Clock className="h-3 w-3" aria-hidden />
              {formatClock(clockSeconds)}
            </span>
          </div>
          {momentScore != null && (
            <div className="rfsn-score-bug-segment text-center" data-rfsn-focus-target>
              <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Moment</span>
              <span className="text-sm font-black tabular-nums text-amber-400">{momentScore}</span>
            </div>
          )}
          <div className="rfsn-score-bug-segment text-center">
            <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">On clock</span>
            <span className="max-w-[5.5rem] truncate text-xs font-bold text-emerald-400 md:max-w-none">
              {onClockTeam}
            </span>
          </div>
        </div>

        <div className="rfsn-score-bug-segment items-end border-r-0 text-right">
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-white/40">Viewers</span>
          <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-white">
            <Users className="h-3 w-3 text-white/50" aria-hidden />
            {onlineCount}
          </span>
        </div>
      </div>
    </header>
  );
}
