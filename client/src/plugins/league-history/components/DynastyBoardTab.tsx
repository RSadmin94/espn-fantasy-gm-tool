import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { SortKey, OwnerWithTitles } from "../hooks/useLeagueHistoryModel";
import type { StandingsSeasonEntry } from "../utils/seasonTabChampions";

function seasonChipTitle(season: number, entry: StandingsSeasonEntry): string {
  if (entry.recordBasis === "pf_only") {
    return `${season}: PF ${entry.pointsFor.toFixed(1)} · PA ${entry.pointsAgainst.toFixed(1)} · Place ${entry.finalStanding ?? "?"}`;
  }
  const w = entry.wins ?? 0;
  const l = entry.losses ?? 0;
  const t = entry.ties ?? 0;
  return `${season}: ${w}–${l}${t ? `–${t}` : ""}, Place ${entry.finalStanding ?? "?"}`;
}

function ordinal(n: number): string {
  if (n === 11 || n === 12 || n === 13) return `${n}th`;
  const s = ["th", "st", "nd", "rd"];
  return `${n}${s[n % 10] ?? "th"}`;
}

function chipStyle(place: number | null | undefined): string {
  if (!place) return "bg-muted/30 text-muted-foreground/40 border-transparent";
  if (place === 1) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40 font-bold";
  if (place === 2) return "bg-slate-400/15 text-slate-300 border-slate-400/30";
  if (place === 3) return "bg-amber-700/15 text-amber-500 border-amber-600/30";
  if (place <= 6) return "bg-lime-500/10 text-lime-400 border-lime-500/20";
  return "bg-muted/20 text-muted-foreground/50 border-transparent";
}

type Props = {
  owners: OwnerWithTitles[];
  sortBy: SortKey;
  setSortBy: (s: SortKey) => void;
  expandedOwner: string | null;
  setExpandedOwner: (k: string | null) => void;
  isLoading: boolean;
};

export function DynastyBoardTab({
  owners,
  sortBy,
  setSortBy,
  expandedOwner,
  setExpandedOwner,
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
        {(["titles", "wins", "winpct", "draft"] as SortKey[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSortBy(s)}
            className={cn(
              "rounded border px-2.5 py-1 text-label transition-colors",
              sortBy === s
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground",
            )}
          >
            {s === "titles" ? "Titles" : s === "wins" ? "Wins" : s === "winpct" ? "Win %" : "Draft order"}
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
          const hasRecord = owner.allTimeGamesPlayed > 0;
          const totalW = owner.allTimeWins;
          const totalL = owner.allTimeLosses;
          const totalT = owner.allTimeTies;
          // Ignore invalid/unplayed finishes: ESPN stores finalStanding 0 for seasons
          // with no recorded final rank (e.g. an in-progress season), and legacy rows
          // may be null. Counting those would poison the min to "0th". Only positive
          // standings count; if none are valid, best stays 99 and renders as "—".
          const best = owner.seasons.reduce((b, r) => {
            const fs = Number(r.entry.finalStanding);
            return Number.isFinite(fs) && fs > 0 ? Math.min(b, fs) : b;
          }, 99);
          const isOpen = expandedOwner === owner.ownerKey;

          return (
            <Card key={owner.ownerKey} className={cn("transition-all", isOpen && "ring-1 ring-primary/25")}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold leading-tight text-foreground">{owner.displayName}</div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {sortBy === "draft" && owner.draftSlot != null && (
                      <div className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-label font-bold text-cyan-300">
                        Pick {owner.draftSlot}
                      </div>
                    )}
                    {owner.titleCount > 0 && (
                      <div className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-300">
                        🏆&nbsp;{owner.titleCount}
                      </div>
                    )}
                  </div>
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
                    {hasRecord
                      ? `${totalW}–${totalL}${totalT > 0 ? `–${totalT}` : ""}`
                      : "—"}
                  </span>

                  <span className="text-muted-foreground">💯 Win %</span>
                  <span className="text-right tabular-nums">
                    {hasRecord ? `${owner.allTimeWinPct.toFixed(1)}%` : "—"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedOwner(isOpen ? null : owner.ownerKey)}
                  className="flex items-center gap-1 text-label text-muted-foreground transition-colors hover:text-foreground"
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
                      <span
                        key={season}
                        title={seasonChipTitle(season, entry)}
                        className={cn(
                          "rounded border px-2 py-0.5 text-label tabular-nums",
                          chipStyle(entry.finalStanding),
                        )}
                      >
                        {season}
                      </span>
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
