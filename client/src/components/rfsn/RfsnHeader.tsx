import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";

export type RfsnHeaderProps = {
  round: number;
  pickInRound: number;
  overallPick: string;
  onClockTeam: string;
  onlineCount?: number;
  className?: string;
};

export function RfsnHeader({
  round,
  pickInRound,
  overallPick,
  onClockTeam,
  onlineCount = 10,
  className,
}: RfsnHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2 md:px-4",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg font-black tracking-tight text-white">
          RFS<span className="text-red-500">N</span>
        </span>
        <span className="hidden text-xs text-muted-foreground sm:inline">Rivals Fantasy Sports Network</span>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded bg-red-600/90 px-1.5 py-0.5 font-bold text-white">
            <Radio className="h-3 w-3" aria-hidden />
            Live
          </span>
          <span>Snake Draft</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">10-Team PPR</span>
        </div>
        <p className="text-sm font-semibold md:text-base">
          Round {round} · Pick {pickInRound}{" "}
          <span className="text-muted-foreground">({overallPick})</span>
        </p>
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-400 md:text-sm">
          On the clock: {onClockTeam}
        </p>
      </div>

      <div className="text-right text-[10px] text-muted-foreground md:text-xs">
        <p className="hidden md:block">Aug 24, 2024 · 8:15 PM ET</p>
        <p>{onlineCount} online</p>
        <p className="font-medium text-white/70">RFSN · Unfiltered</p>
      </div>
    </header>
  );
}
