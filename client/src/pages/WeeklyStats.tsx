import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, TrendingUp, Target, Activity, AlertTriangle, CheckCircle, Database } from "lucide-react";
import { toast } from "sonner";

const ALL_SEASONS = [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018];
const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "D/ST"];

function StatBadge({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color ?? "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function TrendBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-muted rounded-full h-1.5 mt-1">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function WeeklyStats() {
  const [season, setSeason] = useState(2025);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchingWeek, setFetchingWeek] = useState<number | null>(null);

  // Cached weeks
  const { data: cachedWeeksData, refetch: refetchCachedWeeks } = trpc.weeklyStats.getCachedWeeks.useQuery({ season });

  // Season data (only load when we have cached weeks)
  const { data: seasonData, refetch: refetchSeason, isLoading: loadingSeason } = trpc.weeklyStats.getBySeason.useQuery(
    { season },
    { enabled: (cachedWeeksData?.weekCount ?? 0) > 0 }
  );

  // Week data
  const { data: weekData, isLoading: loadingWeek } = trpc.weeklyStats.getByWeek.useQuery(
    { season, week: selectedWeek! },
    { enabled: selectedWeek !== null }
  );

  const fetchAndCache = trpc.weeklyStats.fetchAndCache.useMutation({
    onSuccess: (result) => {
      if (result.status === "error") {
        toast.error(result.message);
      } else {
        toast.success(result.message);
      }
      refetchCachedWeeks();
      refetchSeason();
      setFetchingAll(false);
      setFetchingWeek(null);
    },
    onError: (err) => {
      toast.error(`Fetch failed: ${err.message}`);
      setFetchingAll(false);
      setFetchingWeek(null);
    },
  });

  const cachedWeeks = cachedWeeksData?.cachedWeeks ?? [];
  const allWeeks = Array.from({ length: 17 }, (_, i) => i + 1);

  // Filter rows for display
  const displayRows = useMemo(() => {
    const rows = selectedWeek !== null ? (weekData?.rows ?? []) : (seasonData?.rows ?? []);
    return rows.filter(r => {
      if (posFilter !== "ALL" && r.position !== posFilter) return false;
      if (search && !r.playerName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [weekData, seasonData, selectedWeek, posFilter, search]);

  // Aggregate season stats per player (avg per week)
  const playerSeasonAggs = useMemo(() => {
    if (!seasonData?.rows) return [];
    const map = new Map<number, { playerName: string; position: string; proTeam: string; ownerName: string | null; weeks: number; totalTargets: number; totalSnaps: number; totalFP: number; totalRec: number; totalRecYds: number; }>();
    for (const r of seasonData.rows) {
      const existing = map.get(r.playerId);
      if (existing) {
        existing.weeks++;
        existing.totalTargets += r.targets ?? 0;
        existing.totalSnaps += r.snapCount ?? 0;
        existing.totalFP += r.fantasyPoints ?? 0;
        existing.totalRec += r.receptions ?? 0;
        existing.totalRecYds += r.receivingYards ?? 0;
      } else {
        map.set(r.playerId, {
          playerName: r.playerName, position: r.position, proTeam: r.proTeam,
          ownerName: r.ownerName, weeks: 1,
          totalTargets: r.targets ?? 0, totalSnaps: r.snapCount ?? 0,
          totalFP: r.fantasyPoints ?? 0, totalRec: r.receptions ?? 0, totalRecYds: r.receivingYards ?? 0,
        });
      }
    }
    return Array.from(map.values())
      .map(p => ({ ...p, avgTargets: p.totalTargets / p.weeks, avgSnaps: p.totalSnaps / p.weeks, avgFP: p.totalFP / p.weeks, avgRec: p.totalRec / p.weeks }))
      .filter(p => posFilter === "ALL" || p.position === posFilter)
      .filter(p => !search || p.playerName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.avgFP - a.avgFP)
      .slice(0, 100);
  }, [seasonData, posFilter, search]);

  const posColor: Record<string, string> = { QB: "bg-red-500", RB: "bg-green-500", WR: "bg-blue-500", TE: "bg-yellow-500", K: "bg-purple-500", "D/ST": "bg-orange-500" };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Stats Cache</h1>
          <p className="text-sm text-muted-foreground mt-1">Per-week targets, snap counts, yards, and fantasy points from ESPN</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(season)} onValueChange={v => { setSeason(Number(v)); setSelectedWeek(null); }}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{ALL_SEASONS.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Button
            onClick={() => { setFetchingAll(true); fetchAndCache.mutate({ season, maxWeek: 17 }); }}
            disabled={fetchingAll || fetchAndCache.isPending}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${fetchingAll ? "animate-spin" : ""}`} />
            {fetchingAll ? "Fetching…" : "Fetch All Weeks"}
          </Button>
        </div>
      </div>

      {/* Cache Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Cache Status — {season}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {allWeeks.map(w => {
              const cached = cachedWeeks.includes(w);
              return (
                <button
                  key={w}
                  onClick={() => setSelectedWeek(selectedWeek === w ? null : w)}
                  className={`relative w-10 h-10 rounded-lg text-sm font-medium transition-all border ${
                    selectedWeek === w
                      ? "bg-primary text-primary-foreground border-primary"
                      : cached
                      ? "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30"
                      : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                  }`}
                >
                  {w}
                  {cached && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-green-400" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Cached ({cachedWeeks.length} weeks)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" /> Not cached ({17 - cachedWeeks.length} weeks)</span>
            <span>Click a week to view • Click again to deselect</span>
          </div>
          {/* Per-week fetch buttons for uncached weeks */}
          {allWeeks.filter(w => !cachedWeeks.includes(w)).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {allWeeks.filter(w => !cachedWeeks.includes(w)).map(w => (
                <Button
                  key={w}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={fetchingWeek === w || fetchAndCache.isPending}
                  onClick={() => { setFetchingWeek(w); fetchAndCache.mutate({ season, week: w }); }}
                >
                  {fetchingWeek === w ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
                  Fetch Wk {w}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search player..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-48"
        />
        <div className="flex gap-1">
          {POSITIONS.map(pos => (
            <Button
              key={pos}
              variant={posFilter === pos ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setPosFilter(pos)}
            >
              {pos}
            </Button>
          ))}
        </div>
        {selectedWeek && (
          <Badge variant="secondary" className="gap-1">
            Week {selectedWeek}
            <button onClick={() => setSelectedWeek(null)} className="ml-1 hover:text-destructive">×</button>
          </Badge>
        )}
      </div>

      {/* Data Table */}
      <Tabs defaultValue="table">
        <TabsList>
          <TabsTrigger value="table">Player Table</TabsTrigger>
          {!selectedWeek && <TabsTrigger value="season">Season Averages</TabsTrigger>}
          <TabsTrigger value="leaders">Target Leaders</TabsTrigger>
          <TabsTrigger value="snaps">Snap Leaders</TabsTrigger>
        </TabsList>

        {/* Weekly / All Rows Table */}
        <TabsContent value="table">
          {(loadingSeason || loadingWeek) ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground">Loading stats…</div>
          ) : displayRows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-40 gap-3">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">
                  {cachedWeeks.length === 0
                    ? `No data cached for ${season}. Click "Fetch All Weeks" to pull stats from ESPN.`
                    : "No players match the current filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {selectedWeek && <th className="text-left p-3 font-medium text-muted-foreground">Wk</th>}
                    <th className="text-left p-3 font-medium text-muted-foreground">Player</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Pos</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Owner</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Tgts</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Rec</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">RecYds</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">RushAtt</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">RushYds</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Snaps</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Snap%</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">FPts</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.slice(0, 200).map((r, i) => (
                    <tr key={`${r.playerId}-${r.week}-${i}`} className="border-b hover:bg-muted/30 transition-colors">
                      {selectedWeek && <td className="p-3 text-muted-foreground">{r.week}</td>}
                      <td className="p-3 font-medium">{r.playerName}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${posColor[r.position] ? `border-0 text-white ${posColor[r.position]}` : ""}`}>
                          {r.position}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{r.ownerName ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{r.targets ?? 0}</td>
                      <td className="p-3 text-right font-mono">{r.receptions ?? 0}</td>
                      <td className="p-3 text-right font-mono">{r.receivingYards ?? 0}</td>
                      <td className="p-3 text-right font-mono">{r.rushingAttempts ?? 0}</td>
                      <td className="p-3 text-right font-mono">{r.rushingYards ?? 0}</td>
                      <td className="p-3 text-right font-mono">{r.snapCount ?? 0}</td>
                      <td className="p-3 text-right font-mono">{r.snapPct != null ? `${(r.snapPct * 100).toFixed(0)}%` : "—"}</td>
                      <td className={`p-3 text-right font-mono font-semibold ${(r.fantasyPoints ?? 0) >= 20 ? "text-green-400" : (r.fantasyPoints ?? 0) >= 10 ? "text-yellow-400" : ""}`}>
                        {(r.fantasyPoints ?? 0).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayRows.length > 200 && (
                <div className="p-3 text-center text-xs text-muted-foreground">Showing 200 of {displayRows.length} rows. Use filters to narrow down.</div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Season Averages */}
        {!selectedWeek && (
          <TabsContent value="season">
            {playerSeasonAggs.length === 0 ? (
              <Card><CardContent className="flex items-center justify-center h-40 text-muted-foreground">No season data cached.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {playerSeasonAggs.map(p => (
                  <Card key={p.playerName} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold">{p.playerName}</div>
                          <div className="text-xs text-muted-foreground">{p.proTeam} · {p.weeks} weeks</div>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="outline" className={`text-xs border-0 text-white ${posColor[p.position] ?? "bg-muted"}`}>{p.position}</Badge>
                          {p.ownerName && <Badge variant="secondary" className="text-xs">{p.ownerName}</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <StatBadge value={p.avgFP.toFixed(1)} label="Avg FPts" color={p.avgFP >= 20 ? "text-green-400" : p.avgFP >= 12 ? "text-yellow-400" : "text-foreground"} />
                        <StatBadge value={p.avgTargets.toFixed(1)} label="Avg Tgts" />
                        <StatBadge value={p.avgRec.toFixed(1)} label="Avg Rec" />
                        <StatBadge value={p.avgSnaps.toFixed(0)} label="Avg Snaps" />
                      </div>
                      <TrendBar value={p.avgFP} max={40} color="bg-primary" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Target Leaders */}
        <TabsContent value="leaders">
          <TargetLeaders season={season} cachedWeeks={cachedWeeks} posFilter={posFilter} search={search} />
        </TabsContent>

        {/* Snap Leaders */}
        <TabsContent value="snaps">
          <SnapLeaders season={season} cachedWeeks={cachedWeeks} posFilter={posFilter} search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TargetLeaders({ season, cachedWeeks, posFilter, search }: { season: number; cachedWeeks: number[]; posFilter: string; search: string }) {
  const { data } = trpc.weeklyStats.getBySeason.useQuery({ season }, { enabled: cachedWeeks.length > 0 });
  const leaders = useMemo(() => {
    if (!data?.rows) return [];
    const map = new Map<number, { playerName: string; position: string; proTeam: string; ownerName: string | null; totalTargets: number; weeks: number; }>();
    for (const r of data.rows) {
      const ex = map.get(r.playerId);
      if (ex) { ex.totalTargets += r.targets ?? 0; ex.weeks++; }
      else map.set(r.playerId, { playerName: r.playerName, position: r.position, proTeam: r.proTeam, ownerName: r.ownerName, totalTargets: r.targets ?? 0, weeks: 1 });
    }
    return Array.from(map.values())
      .filter(p => posFilter === "ALL" || p.position === posFilter)
      .filter(p => !search || p.playerName.toLowerCase().includes(search.toLowerCase()))
      .map(p => ({ ...p, avgTargets: p.totalTargets / p.weeks }))
      .sort((a, b) => b.avgTargets - a.avgTargets)
      .slice(0, 30);
  }, [data, posFilter, search]);

  if (leaders.length === 0) return <Card><CardContent className="flex items-center justify-center h-40 text-muted-foreground">No target data cached.</CardContent></Card>;

  const maxAvg = leaders[0]?.avgTargets ?? 1;
  return (
    <div className="space-y-2">
      {leaders.map((p, i) => (
        <div key={p.playerName} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
          <div className="w-6 text-center text-sm font-bold text-muted-foreground">#{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{p.playerName}</div>
            <div className="text-xs text-muted-foreground">{p.proTeam} · {p.ownerName ?? "FA"}</div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(p.avgTargets / maxAvg) * 100}%` }} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-blue-400">{p.avgTargets.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">avg/wk</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SnapLeaders({ season, cachedWeeks, posFilter, search }: { season: number; cachedWeeks: number[]; posFilter: string; search: string }) {
  const { data } = trpc.weeklyStats.getBySeason.useQuery({ season }, { enabled: cachedWeeks.length > 0 });
  const leaders = useMemo(() => {
    if (!data?.rows) return [];
    const map = new Map<number, { playerName: string; position: string; proTeam: string; ownerName: string | null; totalSnaps: number; weeks: number; }>();
    for (const r of data.rows) {
      const ex = map.get(r.playerId);
      if (ex) { ex.totalSnaps += r.snapCount ?? 0; ex.weeks++; }
      else map.set(r.playerId, { playerName: r.playerName, position: r.position, proTeam: r.proTeam, ownerName: r.ownerName, totalSnaps: r.snapCount ?? 0, weeks: 1 });
    }
    return Array.from(map.values())
      .filter(p => posFilter === "ALL" || p.position === posFilter)
      .filter(p => !search || p.playerName.toLowerCase().includes(search.toLowerCase()))
      .map(p => ({ ...p, avgSnaps: p.totalSnaps / p.weeks }))
      .sort((a, b) => b.avgSnaps - a.avgSnaps)
      .slice(0, 30);
  }, [data, posFilter, search]);

  if (leaders.length === 0) return <Card><CardContent className="flex items-center justify-center h-40 text-muted-foreground">No snap data cached.</CardContent></Card>;

  const maxAvg = leaders[0]?.avgSnaps ?? 1;
  return (
    <div className="space-y-2">
      {leaders.map((p, i) => (
        <div key={p.playerName} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
          <div className="w-6 text-center text-sm font-bold text-muted-foreground">#{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{p.playerName}</div>
            <div className="text-xs text-muted-foreground">{p.proTeam} · {p.ownerName ?? "FA"}</div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${(p.avgSnaps / maxAvg) * 100}%` }} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-orange-400">{p.avgSnaps.toFixed(0)}</div>
            <div className="text-xs text-muted-foreground">avg/wk</div>
          </div>
        </div>
      ))}
    </div>
  );
}
