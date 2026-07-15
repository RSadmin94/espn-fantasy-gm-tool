import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RfsnDraftPickRow } from "@/lib/rfsnPresentation";
import { isOnClockRowLive } from "@/lib/rfsnBroadcastProduction";
import type { BroadcastFocusState } from "@/lib/rfsnBroadcastProduction";

const POS_COLORS: Record<RfsnDraftPickRow["position"], string> = {
  QB: "text-red-400",
  RB: "text-emerald-400",
  WR: "text-amber-400",
  TE: "text-violet-400",
  K: "text-slate-400",
  DST: "text-slate-400",
};

export type RfsnDraftBoardProps = {
  rows: RfsnDraftPickRow[];
  onClockTeam: string;
  overallPick: string;
  broadcastFocus?: BroadcastFocusState;
  className?: string;
};

function isPlaceholderRow(row: RfsnDraftPickRow): boolean {
  return row.player === "—" || row.team === "—";
}

export function RfsnDraftBoard({
  rows,
  onClockTeam,
  overallPick,
  broadcastFocus = "ambient",
  className,
}: RfsnDraftBoardProps) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-white/10 bg-black/40 shadow-inner",
        className,
      )}
      aria-label="Draft board"
      data-rfsn-focus-target
    >
      <div className="border-b border-white/10 bg-white/[0.04] px-3 py-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-white/75">
          Draft Board
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[360px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#0a0a10] text-[9px] font-bold uppercase tracking-[0.18em] text-white/40">
            <tr className="border-b border-white/10">
              <th className="w-12 px-3 py-2">Rank</th>
              <th className="px-3 py-2">Player</th>
              <th className="w-12 px-2 py-2">Pos</th>
              <th className="hidden w-14 px-2 py-2 sm:table-cell">Team</th>
              <th className="hidden w-12 px-2 py-2 md:table-cell">Bye</th>
              <th className="w-14 px-3 py-2 text-right">ADP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const placeholder = isPlaceholderRow(row);
              const rowLive = isOnClockRowLive(broadcastFocus, Boolean(row.isOnClock));
              return (
                <tr
                  key={`${row.rank}-${row.player}`}
                  className={cn(
                    "border-b border-white/[0.04] transition-colors duration-500",
                    idx % 2 === 0 ? "bg-white/[0.015]" : "bg-transparent",
                    row.isOnClock &&
                      "bg-emerald-500/20 shadow-[inset_3px_0_0_0_rgba(52,211,153,0.9)]",
                    rowLive && "rfsn-row-live",
                    placeholder && "text-white/25",
                  )}
                >
                  <td className="px-3 py-2 font-mono text-xs text-white/45">{row.rank}</td>
                  <td className={cn("px-3 py-2", row.isOnClock ? "py-3" : "py-2")}>
                    <span
                      className={cn(
                        "block font-semibold tracking-tight",
                        row.isOnClock ? "text-base text-white" : "text-sm text-white/90",
                        placeholder && "font-normal italic",
                      )}
                    >
                      {placeholder ? "Available" : row.player}
                    </span>
                    {row.isOnClock && (
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-wider text-emerald-400">
                        On the clock: {onClockTeam}
                        <span className="mx-1 text-white/20">·</span>
                        Pick {overallPick}
                      </span>
                    )}
                  </td>
                  <td className={cn("px-2 py-2 text-sm font-black", POS_COLORS[row.position])}>
                    {row.position}
                  </td>
                  <td className="hidden px-2 py-2 text-sm text-white/50 sm:table-cell">
                    {row.team}
                  </td>
                  <td className="hidden px-2 py-2 font-mono text-sm text-white/40 md:table-cell">
                    {placeholder ? "—" : row.bye}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-sm text-white/45">
                    {row.adp}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-center gap-1 border-t border-white/10 bg-black/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/35">
        Show more players
        <ChevronDown className="h-3 w-3" aria-hidden />
      </div>
    </section>
  );
}
