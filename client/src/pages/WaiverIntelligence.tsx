// FILE: client/src/pages/WaiverIntelligence.tsx
// Waiver Wire Intelligence — Combines FantasyPros ECR with opponent draft tendencies
// to identify which waiver targets your opponents are most likely to also pick up.
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Users, AlertTriangle, TrendingUp, Zap, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  K: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  DST: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

// Waiver priority tiers based on ECR rank
function getWaiverPriority(ecrRank: number): { label: string; color: string } {
  if (ecrRank <= 50) return { label: "Must Add", color: "text-red-400 border-red-500/30 bg-red-500/10" };
  if (ecrRank <= 100) return { label: "High Priority", color: "text-orange-400 border-orange-500/30 bg-orange-500/10" };
  if (ecrRank <= 150) return { label: "Solid Add", color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" };
  if (ecrRank <= 200) return { label: "Depth Add", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" };
  return { label: "Stash", color: "text-slate-400 border-slate-500/30 bg-slate-500/10" };
}

export default function WaiverIntelligence() {
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<number | null>(null);

  const { data: boardData, isLoading, error, refetch, isFetching } = trpc.draftBoard.getPlayers.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: tendenciesData } = trpc.leagueDraftTendencies.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });

  // Build opponent positional tendency map: pos -> list of opponent names who heavily target it
  const opponentPosTendencies = useMemo(() => {
    if (!tendenciesData) return {} as Record<string, string[]>;
    const owners = ((tendenciesData as { owners?: { name: string; topPositions: { pos: string; pct: number }[] }[] }).owners ?? []);
    const map: Record<string, string[]> = {};
    for (const owner of owners) {
      for (const tp of owner.topPositions ?? []) {
        if (tp.pct >= 25) {
          if (!map[tp.pos]) map[tp.pos] = [];
          map[tp.pos].push(owner.name.split(" ")[0]);
        }
      }
    }
    return map;
  }, [tendenciesData]);

  // Compute competition score: how many opponents heavily target this position
  const competitionScore = useMemo(() => {
    const scores: Record<string, number> = {};
    for (const [pos, names] of Object.entries(opponentPosTendencies)) {
      scores[pos] = names.length;
    }
    return scores;
  }, [opponentPosTendencies]);

  const players = useMemo(() => {
    if (!boardData?.players) return [];
    // Focus on waiver-relevant range (ECR 51-200, excluding top-end starters)
    let list = boardData.players.filter((p) => p.ecrRank >= 51 && p.ecrRank <= 250);
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter);
    if (tierFilter !== null) list = list.filter((p) => p.tier === tierFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    return list;
  }, [boardData?.players, posFilter, tierFilter, search]);

  const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Waiver Wire Intelligence</h1>
          <p className="text-muted-foreground text-sm mt-1">
            FantasyPros ECR waiver targets cross-referenced with opponent positional tendencies. Know who else wants the same players.
          </p>
          {boardData && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs text-slate-400">
                {players.length} waiver targets (ECR 51–250)
              </Badge>
              {boardData.fromCache && (
                <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                  Cached · {new Date(boardData.fetchedAt).toLocaleTimeString()}
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

      {/* Opponent competition overview */}
      {Object.keys(opponentPosTendencies).length > 0 && (
        <Card className="border-slate-700/50 bg-slate-800/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              Opponent Positional Competition
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              Based on historical draft tendencies — managers who target each position in 25%+ of their early picks.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {["RB", "WR", "QB", "TE", "K", "DST"].map((pos) => {
                const competitors = opponentPosTendencies[pos] ?? [];
                const score = competitionScore[pos] ?? 0;
                return (
                  <div key={pos} className="flex items-start gap-3 p-3 rounded-lg bg-slate-700/30 border border-slate-600/30">
                    <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 font-bold shrink-0 mt-0.5", POS_COLORS[pos] ?? "")}>
                      {pos}
                    </Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground">{score} competitors</span>
                        {score >= 6 && <AlertTriangle className="w-3 h-3 text-red-400" />}
                        {score >= 4 && score < 6 && <AlertTriangle className="w-3 h-3 text-orange-400" />}
                      </div>
                      {competitors.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {competitors.slice(0, 5).map((name) => (
                            <span key={name} className="text-xs text-slate-400">{name}</span>
                          ))}
                          {competitors.length > 5 && (
                            <span className="text-xs text-slate-500">+{competitors.length - 5}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Low competition</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading waiver targets…
        </div>
      )}

      {/* Player table */}
      {!isLoading && !error && (
        <div className="space-y-1">
          {/* Table header */}
          <div className="grid grid-cols-[3rem_2.5rem_1fr_7rem_4rem_4rem_5rem_6rem] text-xs font-medium text-muted-foreground px-4 py-2 border-b border-slate-700/50">
            <span>ECR</span>
            <span></span>
            <span>Player</span>
            <span>Priority</span>
            <span>ADP</span>
            <span>Gap</span>
            <span>2025 Pts</span>
            <span>Competition</span>
          </div>

          {players.map((p) => {
            const priority = getWaiverPriority(p.ecrRank);
            const competitors = opponentPosTendencies[p.position] ?? [];
            const competitorCount = competitors.length;
            return (
              <div
                key={p.fpId}
                className="grid grid-cols-[3rem_2.5rem_1fr_7rem_4rem_4rem_5rem_6rem] items-center px-4 py-2 rounded-md hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-sm font-bold text-foreground">{p.ecrRank}</span>
                <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 font-semibold", POS_COLORS[p.position] ?? "")}>
                  {p.position}
                </Badge>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm text-foreground truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{p.team}</span>
                </div>
                <Badge variant="outline" className={cn("text-xs h-5 px-2", priority.color)}>
                  {priority.label}
                </Badge>
                <span className="text-xs text-muted-foreground">{p.adp !== null ? p.adp.toFixed(1) : "—"}</span>
                <span className={cn(
                  "text-xs font-medium",
                  (p.ecrAdpGap ?? 0) >= 5 ? "text-emerald-400" :
                  (p.ecrAdpGap ?? 0) <= -5 ? "text-red-400" : "text-muted-foreground"
                )}>
                  {p.ecrAdpGap !== null ? (p.ecrAdpGap > 0 ? `+${p.ecrAdpGap}` : p.ecrAdpGap) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">{p.pfr2025 ? p.pfr2025.pprPoints.toFixed(1) : "—"}</span>
                <div className="flex items-center gap-1">
                  {competitorCount >= 6 ? (
                    <span className="flex items-center gap-1 text-xs text-red-400">
                      <AlertTriangle className="w-3 h-3" /> High ({competitorCount})
                    </span>
                  ) : competitorCount >= 4 ? (
                    <span className="flex items-center gap-1 text-xs text-orange-400">
                      <Users className="w-3 h-3" /> Med ({competitorCount})
                    </span>
                  ) : competitorCount >= 2 ? (
                    <span className="flex items-center gap-1 text-xs text-yellow-400">
                      <Users className="w-3 h-3" /> Low ({competitorCount})
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <Shield className="w-3 h-3" /> Clear
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {players.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              No waiver targets match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
