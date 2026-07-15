import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { V1 } from "@/lib/v1Copy";
import { Loader2 } from "lucide-react";

export type TimelineChamp = {
  season: number;
  label: string;
  isCurrentSeason: boolean;
};

export function DashboardTimelineStrip({
  isLoading,
  rows,
  currentSeason,
  hideHeader = false,
}: {
  isLoading: boolean;
  rows: TimelineChamp[];
  currentSeason: number;
  hideHeader?: boolean;
}) {
  return (
    <section className="space-y-3" aria-label={V1.home.championsTimeline}>
      {!hideHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-4 w-0.5 rounded-full bg-amber-500" aria-hidden />
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {V1.home.championsTimeline}
            </h2>
          </div>
          <Link to="/history" className="text-xs font-medium text-amber-400/90 hover:text-amber-300">
            {V1.features.leagueHistory} →
          </Link>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card/90 px-2 py-4 shadow-inner shadow-black/40 sm:px-4">
        {isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            <p className="font-medium text-muted-foreground">Not Yet Available</p>
            <p className="mt-1 text-xs text-muted-foreground">Import championship history to populate the timeline.</p>
          </div>
        ) : (
          <div className="flex min-w-max gap-3 pb-1 pt-1">
            {rows.map((row) => {
              const mark = row.label.slice(0, 2).toUpperCase();
              const isFuture = row.season >= currentSeason && !row.isCurrentSeason;
              return (
                <div
                  key={row.season}
                  className={cn(
                    "flex w-[100px] shrink-0 flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors",
                    row.isCurrentSeason
                      ? "border-violet-500/40 bg-violet-500/[0.07] shadow-[0_0_20px_-8px_rgba(139,92,246,0.45)]"
                      : "border-border bg-foreground/[0.02]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-black tabular-nums tracking-widest",
                      row.isCurrentSeason ? "text-violet-300" : "text-muted-foreground",
                    )}
                  >
                    {row.season}
                  </span>
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full border text-[11px] font-bold",
                      row.isCurrentSeason
                        ? "border-violet-400/50 bg-violet-500/15 text-violet-100"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-100",
                    )}
                  >
                    {isFuture ? "?" : mark}
                  </div>
                  <p className="line-clamp-3 min-h-[2.5rem] text-[10px] font-medium leading-tight text-muted-foreground">
                    {row.label}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
