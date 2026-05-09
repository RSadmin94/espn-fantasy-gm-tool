// FILE: client/src/pages/WeeklyProjections.tsx
// Weekly Projections — FantasyPros ECR + PFR 2025 stats as a projection reference
// Shows top players by position with ECR consensus, PFR 2025 production, and tier context
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, TrendingUp, TrendingDown, Star, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];
const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

export default function WeeklyProjections() {
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = trpc.draftBoard.getPlayers.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const players = useMemo(() => {
    if (!data?.players) return [];
    let list = data.players.filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position));
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    return list;
  }, [data?.players, posFilter, search]);

  const displayPlayers = showAll ? players : players.slice(0, 60);

  // Group by position for summary stats
  const posStats = useMemo(() => {
    if (!data?.players) return {};
    const stats: Record<string, { count: number; withPfr: number; avgEcr: number }> = {};
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const posPlayers = data.players.filter((p) => p.position === pos);
      stats[pos] = {
        count: posPlayers.length,
        withPfr: posPlayers.filter((p) => p.pfr2025).length,
        avgEcr: posPlayers.length > 0 ? posPlayers.reduce((s, p) => s + p.ecrRank, 0) / posPlayers.length : 0,
      };
    }
    return stats;
  }, [data?.players]);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Weekly Projections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            FantasyPros Expert Consensus Rankings with 2025 PFR production as a baseline projection reference.
          </p>
          {data && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs text-slate-400">
                {data.players.filter((p) => ["QB","RB","WR","TE"].includes(p.position)).length} skill players
              </Badge>
              {data.fromCache && (
                <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                  Cached · {new Date(data.fetchedAt).toLocaleTimeString()}
                </Badge>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {/* Position summary cards */}
      {!isLoading && data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {["QB", "RB", "WR", "TE"].map((pos) => {
            const s = posStats[pos];
            if (!s) return null;
            return (
              <Card
                key={pos}
                className={cn(
                  "border cursor-pointer transition-colors",
                  posFilter === pos ? "border-primary bg-primary/10" : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600"
                )}
                onClick={() => setPosFilter(posFilter === pos ? "ALL" : pos)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={cn("text-xs font-bold", POS_COLORS[pos] ?? "")}>
                      {pos}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{s.count} ranked</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{s.withPfr}</p>
                  <p className="text-xs text-muted-foreground">with 2025 stats</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search player or team…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-56 h-9 bg-slate-800/50 border-slate-700"
          />
        </div>
        <div className="flex items-center gap-1">
          {POSITIONS.map((pos) => (
            <Button
              key={pos}
              variant={posFilter === pos ? "default" : "outline"}
              size="sm"
              onClick={() => setPosFilter(pos)}
              className={cn(
                "h-8 px-3 text-xs font-medium",
                posFilter !== pos && "bg-transparent border-slate-700 text-slate-400 hover:text-foreground"
              )}
            >
              {pos}
            </Button>
          ))}
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          <strong>Note:</strong> These are 2026 draft-season ECR rankings, not weekly game projections. Use the ECR rank and 2025 PFR production as a baseline for player value. For game-week start/sit decisions, use the <strong>Start/Sit</strong> tab which uses AI analysis of matchups.
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading projections…
        </div>
      )}

      {/* Player table */}
      {!isLoading && !error && (
        <div className="space-y-1">
          {/* Table header */}
          <div className="grid grid-cols-[3rem_2.5rem_1fr_4rem_4rem_4rem_5rem_5rem_5rem_5rem] text-xs font-medium text-muted-foreground px-4 py-2 border-b border-slate-700/50">
            <span>ECR</span>
            <span></span>
            <span>Player</span>
            <span>Tier</span>
            <span>ADP</span>
            <span>Gap</span>
            <span>2025 Pts</span>
            <span>2025 TDs</span>
            <span>VBD</span>
            <span>Pos Rank</span>
          </div>

          {displayPlayers.map((p) => (
            <div
              key={p.fpId}
              className="grid grid-cols-[3rem_2.5rem_1fr_4rem_4rem_4rem_5rem_5rem_5rem_5rem] items-center px-4 py-2 rounded-md hover:bg-slate-800/50 transition-colors"
            >
              <span className="text-sm font-bold text-foreground">{p.ecrRank}</span>
              <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 font-semibold", POS_COLORS[p.position] ?? "")}>
                {p.position}
              </Badge>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm text-foreground truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{p.team}</span>
                {p.pfr2025 && <span className="text-xs text-emerald-500/70 shrink-0" title="Has 2025 PFR stats">●</span>}
              </div>
              <span className="text-xs text-muted-foreground">T{p.tier}</span>
              <span className="text-xs text-muted-foreground">{p.adp !== null ? p.adp.toFixed(1) : "—"}</span>
              <span className={cn(
                "text-xs font-medium",
                (p.ecrAdpGap ?? 0) >= 5 ? "text-emerald-400" :
                (p.ecrAdpGap ?? 0) <= -5 ? "text-red-400" : "text-muted-foreground"
              )}>
                {p.ecrAdpGap !== null ? (p.ecrAdpGap > 0 ? `+${p.ecrAdpGap}` : p.ecrAdpGap) : "—"}
              </span>
              <span className="text-xs text-muted-foreground">{p.pfr2025 ? p.pfr2025.pprPoints.toFixed(1) : "—"}</span>
              <span className="text-xs text-muted-foreground">{p.pfr2025 ? p.pfr2025.totalTDs : "—"}</span>
              <span className="text-xs text-muted-foreground">{p.pfr2025 ? p.pfr2025.vbd : "—"}</span>
              <span className="text-xs text-muted-foreground">{p.pfr2025 ? `#${p.pfr2025.posRank}` : "—"}</span>
            </div>
          ))}

          {players.length > 60 && !showAll && (
            <div className="text-center pt-4">
              <Button variant="outline" size="sm" onClick={() => setShowAll(true)} className="gap-2">
                Show all {players.length} players
              </Button>
            </div>
          )}

          {players.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No players match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
