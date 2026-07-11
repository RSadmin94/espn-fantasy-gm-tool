import { cn } from "@/lib/utils";
import type { RfsnDraftPickRow } from "@/lib/rfsnPresentation";

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
  className?: string;
};

export function RfsnDraftBoard({
  rows,
  onClockTeam,
  overallPick,
  className,
}: RfsnDraftBoardProps) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-white/10 bg-black/30",
        className,
      )}
      aria-label="Draft board"
    >
      <div className="border-b border-white/10 bg-white/5 px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-white/80">Draft Board</h2>
      </div>
      <div className="overflow-x-auto overflow-y-auto flex-1">
        <table className="w-full min-w-[320px] text-left text-sm">
          <thead className="sticky top-0 bg-[#0c0c14] text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Player</th>
              <th className="px-3 py-2 font-medium">Pos</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Team</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Bye</th>
              <th className="px-3 py-2 font-medium">ADP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.rank}
                className={cn(
                  "border-t border-white/5 transition-colors",
                  row.isOnClock && "bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/40",
                )}
              >
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.rank}</td>
                <td className="px-3 py-2.5 font-semibold">
                  {row.player}
                  {row.isOnClock && (
                    <span className="mt-0.5 block text-[10px] font-bold uppercase text-emerald-400">
                      On the clock: {onClockTeam} · Pick {overallPick}
                    </span>
                  )}
                </td>
                <td className={cn("px-3 py-2.5 font-bold", POS_COLORS[row.position])}>
                  {row.position}
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell text-muted-foreground">
                  {row.team}
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell text-muted-foreground">
                  {row.bye}
                </td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.adp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
