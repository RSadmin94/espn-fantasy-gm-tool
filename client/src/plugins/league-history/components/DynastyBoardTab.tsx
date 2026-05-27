import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { LeagueHistoryTab, SortKey, OwnerWithTitles } from "../hooks/useLeagueHistoryModel";

function ordinal(n: number): string {
  if (n === 11 || n === 12 || n === 13) return `${n}th`;
  const s = ["th", "st", "nd", "rd"];
  return `${n}${s[n % 10] ?? "th"}`;
}

function winPct(w: number, l: number, t: number): string {
  const g = w + l + t;
  return g === 0 ? "—" : ((w / g) * 100).toFixed(1) + "%";
}

function chipStyle(place: number | null | undefined): string {
  if (!place) return "bg-muted/30 text-muted-foreground/40 border-transparent";
  if (place === 1) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40 font-bold";
  if (place === 2) return "bg-slate-400/15 text-slate-300 border-slate-400/30";
  if (place === 3) return "bg-amber-700/15 text-amber-500 border-amber-600/30";
  if (place <= 6) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  return "bg-muted/20 text-muted-foreground/50 border-transparent";
}

type Props = {
  owners: OwnerWithTitles[];
  sortBy: SortKey;
  setSortBy: (s: SortKey) => void;
  expandedOwner: string | null;
  setExpandedOwner: (k: string | null) => void;
  setSelectedSeason: (s: number) => void;
  setTab: (t: LeagueHistoryTab) => void;
  isLoading: boolean;
};

export function DynastyBoardTab({
  owners,
  sortBy,
  setSortBy,
  expandedOwner,
  setExpandedOwner,
  setSelectedSeason,
  setTab,
  isLoading,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        {(["titles", "wins", "winpct"] as SortKey[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSortBy(s)}
            className={cn(
              "rounded border px-2.5 py-1 text-xs transition-colors",
              sortBy === s
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
            )}
          >
            {s === "titles" ? "Titles" : s === "wins" ? "Wins" : "Win %"}
          </button>
        ))}
      </div>

      {owners.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
          No standings data yet. Sync seasons on the Sync Data page.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {owners.map((owner) => {
          const totalW = owner.allTimeWins;
          const totalL = owner.allTimeLosses;
          const totalT = owner.allTimeTies;
          const best = owner.seasons.reduce((b, r) => Math.min(b, r.entry.finalStanding ?? 99), 99);
          const isOpen = expandedOwner === owner.ownerKey;

          return (
            <Card key={owner.ownerKey} className={cn("transition-all", isOpen && "ring-1 ring-primary/25")}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold leading-tight text-foreground">{owner.displayName}</div>
                  {owner.titleCount > 0 && (
                    <div className="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-300">
                      🏆&nbsp;{owner.titleCount}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-muted-foreground">📈 Seasons</span>
                  <span className="text-right tabular-nums">{owner.seasons.length}</span>

                  <span className="text-muted-foreground">🔥 Best Finish</span>
                  <span
                    className={cn(
                      "text-right font-medium tabular-nums",
                      best === 1 && "text-yellow-300",
                      best === 2 && "text-slate-300",
                      best === 3 && "text-amber-500",
                    )}
                  >
                    {best < 99 ? ordinal(best) : "—"}
                  </span>

                  <span className="text-muted-foreground">📊 Record</span>
                  <span className="text-right tabular-nums">
                    {totalW}–{totalL}
                    {totalT > 0 ? `–${totalT}` : ""}
                  </span>

                  <span className="text-muted-foreground">💯 Win %</span>
                  <span className="text-right tabular-nums">
                    {totalW + totalL + totalT > 0 ? owner.allTimeWinPct.toFixed(1) + "%" : "—"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedOwner(isOpen ? null : owner.ownerKey)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {isOpen ? (
                    <>
                      <ChevronUp className="h-3 w-3" /> Hide seasons
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" /> Show seasons
                    </>
                  )}
                </button>

                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {owner.seasons.map(({ season, entry }) => (
                      <button
                        key={season}
                        type="button"
                        title={`${season}: ${entry.wins}–${entry.losses}, Place ${entry.finalStanding ?? "?"}`}
                        onClick={() => {
                          setSelectedSeason(season);
                          setTab("seasons");
                        }}
                        className={cn(
                          "rounded border px-2 py-0.5 text-[11px] tabular-nums transition-opacity hover:opacity-80",
                          chipStyle(entry.finalStanding),
                        )}
                      >
                        {season}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
