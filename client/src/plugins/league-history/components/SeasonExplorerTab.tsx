import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { StandingsSeasonEntry } from "../utils/seasonTabChampions";

type SeasonRow = { owner: string } & StandingsSeasonEntry;

type Props = {
  allSeasons: number[];
  activeSeason: number | null;
  setSelectedSeason: (s: number) => void;
  seasonRows: SeasonRow[];
  medalChampion: string | null;
  medalRunnerUp: string | null;
  medalThird: string | null;
  topScorer: SeasonRow | null;
  showTopScorer: boolean;
  isLoading: boolean;
};

export function SeasonExplorerTab({
  allSeasons,
  activeSeason,
  setSelectedSeason,
  seasonRows,
  medalChampion,
  medalRunnerUp,
  medalThird,
  topScorer,
  showTopScorer,
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
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
          {allSeasons.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSelectedSeason(s)}
              className={cn(
                "whitespace-nowrap rounded border px-3 py-1.5 text-sm font-medium transition-colors",
                activeSeason === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {activeSeason && seasonRows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No standings data for {activeSeason}.
        </div>
      )}

      {activeSeason && seasonRows.length > 0 && (
        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="text-xl font-bold text-foreground">{activeSeason} Season</div>

            <div className="flex gap-3">
              <div className="flex-1 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3 text-center">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-yellow-400">Champion</div>
                <div className="font-bold text-yellow-300">{medalChampion ?? "—"}</div>
              </div>
              <div className="flex-1 rounded-lg border border-slate-400/15 bg-slate-400/10 p-3 text-center">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Runner-Up</div>
                <div className="font-semibold text-slate-300">{medalRunnerUp ?? "—"}</div>
              </div>
              {medalThird ? (
                <div className="flex-1 rounded-lg border border-amber-600/30 bg-amber-700/15 p-3 text-center">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-500">Third</div>
                  <div className="font-semibold text-amber-400">{medalThird}</div>
                </div>
              ) : null}
              {showTopScorer && topScorer ? (
                <div className="flex-1 rounded-lg border border-blue-500/15 bg-blue-500/10 p-3 text-center">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-blue-400">Top Scorer</div>
                  <div className="font-semibold text-blue-300">{topScorer.owner}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{topScorer.pointsFor.toFixed(1)} pts</div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Final Standings
                </div>
                {seasonRows[0]?.recordBasis === "pf_only" ? (
                  <span className="text-[10px] text-muted-foreground">PF / PA only (no RS matchup record in DB)</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Reg. season W–L–T (completed RS matchups)</span>
                )}
              </div>
              <div className="space-y-1">
                {seasonRows.map((row, idx) => (
                  <div
                    key={row.owner}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                      idx === 0 && "bg-yellow-500/8",
                      idx === 1 && "bg-slate-400/6",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-5 text-center text-xs font-semibold tabular-nums",
                          idx === 0 && "text-yellow-400",
                          idx === 1 && "text-slate-400",
                          idx === 2 && "text-amber-500",
                          idx >= 3 && "text-muted-foreground",
                        )}
                      >
                        {row.finalStanding ?? idx + 1}
                      </span>
                      <span className="text-foreground">{row.owner}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs tabular-nums text-muted-foreground">
                      {row.recordBasis === "rs_matchups" ? (
                        <span>
                          {(row.wins ?? 0)}–{(row.losses ?? 0)}
                          {(row.ties ?? 0) > 0 ? `–${row.ties}` : ""}
                        </span>
                      ) : (
                        <span>
                          PF {row.pointsFor.toFixed(1)} · PA {row.pointsAgainst.toFixed(1)}
                        </span>
                      )}
                      {row.recordBasis === "rs_matchups" ? (
                        <span className="text-muted-foreground/80">PF {row.pointsFor.toFixed(1)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
