import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Loader2 } from "lucide-react";

function standingClass(place: number | null | undefined): string {
  if (!place) return "text-muted-foreground/40";
  if (place === 1) return "bg-yellow-500/20 text-yellow-300 font-bold";
  if (place === 2) return "bg-slate-400/15 text-slate-300 font-semibold";
  if (place === 3) return "bg-amber-700/15 text-amber-500 font-semibold";
  if (place <= 6) return "text-foreground";
  return "text-muted-foreground";
}

export function LeagueHistory() {
  const [tab, setTab] = useState<"standings" | "h2h">("standings");

  const histQ = trpc.espn.standingsHistory.useQuery(undefined, { staleTime: 60_000 });
  const h2hQ = trpc.espn.allTimeH2H.useQuery(undefined, {
    staleTime: 60_000,
    enabled: tab === "h2h",
  });

  const seasons = histQ.data?.seasons ?? [];
  const history = histQ.data?.history ?? [];

  // owner → season → { finalStanding, wins, losses }
  const ownerSeasonMap = new Map<
    string,
    Map<number, { finalStanding: number | null; wins: number; losses: number }>
  >();
  for (const { season, teams } of history) {
    for (const t of teams) {
      const owner = (t.ownerName || t.name || `Team ${t.teamId}`).trim();
      if (!ownerSeasonMap.has(owner)) ownerSeasonMap.set(owner, new Map());
      ownerSeasonMap.get(owner)!.set(season, {
        finalStanding: t.finalStanding,
        wins: t.wins,
        losses: t.losses,
      });
    }
  }

  // sort owners: most titles first, then total wins
  const owners = [...ownerSeasonMap.keys()].sort((a, b) => {
    const vA = ownerSeasonMap.get(a)!;
    const vB = ownerSeasonMap.get(b)!;
    const tA = [...vA.values()].filter((v) => v.finalStanding === 1).length;
    const tB = [...vB.values()].filter((v) => v.finalStanding === 1).length;
    if (tB !== tA) return tB - tA;
    const wA = [...vA.values()].reduce((s, v) => s + v.wins, 0);
    const wB = [...vB.values()].reduce((s, v) => s + v.wins, 0);
    return wB - wA;
  });

  const h2hOwners = h2hQ.data?.owners ?? [];
  const h2hMatrix = h2hQ.data?.matrix ?? [];

  const loading = tab === "standings" ? histQ.isLoading : h2hQ.isLoading;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-1">
      <div>
        <h1 className="text-3xl font-bold text-foreground">League History</h1>
        <p className="mt-1 text-muted-foreground">
          All-time standings and head-to-head records across every season.
        </p>
      </div>

      <ToggleGroup
        type="single"
        value={tab}
        onValueChange={(v) => {
          if (v === "standings" || v === "h2h") setTab(v);
        }}
        variant="outline"
        size="sm"
      >
        <ToggleGroupItem value="standings">Season Standings</ToggleGroupItem>
        <ToggleGroupItem value="h2h">All-Time H2H</ToggleGroupItem>
      </ToggleGroup>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      )}

      {/* ── Season standings history ── */}
      {tab === "standings" && !histQ.isLoading && (
        seasons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
            No historical standings yet. Sync seasons via the extension on the Sync Data page.
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Final standings by season — {seasons[0]}–{seasons[seasons.length - 1]}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[150px]">
                        Owner
                      </th>
                      {seasons.map((s) => (
                        <th
                          key={s}
                          className="px-1.5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[46px]"
                        >
                          {s}
                        </th>
                      ))}
                      <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-yellow-400 min-w-[36px]">
                        🏆
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.map((owner) => {
                      const smap = ownerSeasonMap.get(owner)!;
                      const titles = [...smap.values()].filter((v) => v.finalStanding === 1).length;
                      return (
                        <tr
                          key={owner}
                          className="border-b border-border/50 hover:bg-accent/10 transition-colors"
                        >
                          <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground truncate max-w-[150px]">
                            {owner}
                          </td>
                          {seasons.map((s) => {
                            const d = smap.get(s);
                            if (!d) {
                              return (
                                <td key={s} className="px-1.5 py-2 text-center text-[10px] text-muted-foreground/25">
                                  —
                                </td>
                              );
                            }
                            return (
                              <td
                                key={s}
                                className={cn("px-1.5 py-2 text-center text-xs tabular-nums rounded-sm", standingClass(d.finalStanding))}
                              >
                                <div>{d.finalStanding ?? "—"}</div>
                                <div className="text-[10px] text-muted-foreground leading-none mt-0.5">
                                  {d.wins}-{d.losses}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-2 py-2 text-center font-bold text-yellow-400 text-sm">
                            {titles > 0 ? titles : <span className="text-muted-foreground/30">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {/* ── All-time H2H matrix ── */}
      {tab === "h2h" && !h2hQ.isLoading && (
        h2hOwners.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
            No H2H data yet. Sync seasons via the extension on the Sync Data page.
          </div>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                All-time head-to-head records (row beats column: W-L)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[130px]">
                        ↓ vs →
                      </th>
                      {h2hOwners.map((o) => (
                        <th
                          key={o}
                          className="px-1.5 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[64px]"
                        >
                          <div className="truncate max-w-[64px]" title={o}>
                            {o.split(" ")[0]}
                          </div>
                        </th>
                      ))}
                      <th className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground min-w-[52px]">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2hMatrix.map(({ owner, vs }) => {
                      let tw = 0, tl = 0, tt = 0;
                      for (const r of Object.values(vs)) {
                        tw += r.wins;
                        tl += r.losses;
                        tt += r.ties;
                      }
                      return (
                        <tr
                          key={owner}
                          className="border-b border-border/50 hover:bg-accent/10 transition-colors"
                        >
                          <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground truncate max-w-[130px]" title={owner}>
                            {owner}
                          </td>
                          {h2hOwners.map((rival) => {
                            if (rival === owner) {
                              return (
                                <td key={rival} className="px-1.5 py-2 text-center text-muted-foreground/20 bg-muted/10">
                                  —
                                </td>
                              );
                            }
                            const rec = vs[rival] ?? { wins: 0, losses: 0, ties: 0 };
                            const winning = rec.wins > rec.losses;
                            const losing = rec.losses > rec.wins;
                            return (
                              <td
                                key={rival}
                                className={cn(
                                  "px-1.5 py-2 text-center font-mono text-xs tabular-nums",
                                  winning && "text-emerald-400",
                                  losing && "text-red-400",
                                  !winning && !losing && "text-muted-foreground",
                                )}
                              >
                                {rec.wins}-{rec.losses}
                                {rec.ties > 0 && `-${rec.ties}`}
                              </td>
                            );
                          })}
                          <td
                            className={cn(
                              "px-2 py-2 text-center font-mono text-xs font-semibold tabular-nums",
                              tw > tl && "text-emerald-400",
                              tl > tw && "text-red-400",
                              tw === tl && "text-muted-foreground",
                            )}
                          >
                            {tw}-{tl}
                            {tt > 0 && `-${tt}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
