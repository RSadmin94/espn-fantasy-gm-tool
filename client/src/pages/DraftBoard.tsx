// FILE: client/src/pages/DraftBoard.tsx
// 2026 Draft Board — FantasyPros ECR + ADP + PFR 2025 stats
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  RefreshCw, Search, TrendingUp, TrendingDown, Minus, Info, Star,
  ChevronDown, ChevronUp, Filter
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerDetailDrawer } from "./PlayerDetailDrawer";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "K", "DST"];
const TIER_COLORS: Record<number, string> = {
  1: "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
  2: "bg-orange-500/20 border-orange-500/40 text-orange-300",
  3: "bg-blue-500/20 border-blue-500/40 text-blue-300",
  4: "bg-purple-500/20 border-purple-500/40 text-purple-300",
  5: "bg-green-500/20 border-green-500/40 text-green-300",
  6: "bg-slate-500/20 border-slate-500/40 text-slate-300",
  7: "bg-slate-600/20 border-slate-600/40 text-slate-400",
};
const TIER_LABELS: Record<number, string> = {
  1: "Elite", 2: "Studs", 3: "Strong", 4: "Solid", 5: "Depth", 6: "Streamers", 7: "Handcuffs"
};
const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  K: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  DST: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

function GapBadge({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-slate-500 text-xs">—</span>;
  if (gap >= 5) return (
    <span className="flex items-center gap-1 text-emerald-400 font-semibold text-xs">
      <TrendingDown className="w-3 h-3" />+{gap}
    </span>
  );
  if (gap <= -5) return (
    <span className="flex items-center gap-1 text-red-400 font-semibold text-xs">
      <TrendingUp className="w-3 h-3" />{gap}
    </span>
  );
  return <span className="flex items-center gap-1 text-slate-400 text-xs"><Minus className="w-3 h-3" />{gap > 0 ? `+${gap}` : gap}</span>;
}

export default function DraftBoard() {
  const [posFilter, setPosFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showPFR, setShowPFR] = useState(false);
  const [tierFilter, setTierFilter] = useState<number | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [drawerPlayer, setDrawerPlayer] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading, error, refetch, isFetching } = trpc.draftBoard.getPlayers.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );

  const players = useMemo(() => {
    if (!data?.players) return [];
    let list = data.players;
    if (posFilter !== "ALL") list = list.filter((p) => p.position === posFilter);
    if (tierFilter !== null) list = list.filter((p) => p.tier === tierFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    return list;
  }, [data?.players, posFilter, tierFilter, search]);

  // Group by tier for display
  const byTier = useMemo(() => {
    const map = new Map<number, typeof players>();
    for (const p of players) {
      if (!map.has(p.tier)) map.set(p.tier, []);
      map.get(p.tier)!.push(p);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [players]);

  const pfrCount = useMemo(() => data?.players.filter((p) => p.pfr2025).length ?? 0, [data]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">2026 Draft Board</h1>
          <p className="text-muted-foreground text-sm mt-1">
            FantasyPros Expert Consensus Rankings + ADP + Pro Football Reference 2025 stats
          </p>
          {data && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <Badge variant="outline" className="text-xs text-slate-400">
                {data.players.length} players ranked
              </Badge>
              <Badge variant="outline" className="text-xs text-slate-400">
                {pfrCount} with 2025 PFR stats
              </Badge>
              {data.fromCache && (
                <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                  Cached · {new Date(data.fetchedAt).toLocaleTimeString()}
                </Badge>
              )}
              {!data.fromCache && (
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                  Live · {new Date(data.fetchedAt).toLocaleTimeString()}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            variant={showPFR ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPFR(!showPFR)}
            className="gap-2"
          >
            <Star className="w-4 h-4" />
            {showPFR ? "Hide PFR Stats" : "Show PFR Stats"}
          </Button>
        </div>
      </div>

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
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((t) => (
            <Button
              key={t}
              variant={tierFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTierFilter(tierFilter === t ? null : t)}
              className={cn(
                "h-8 px-3 text-xs font-medium",
                tierFilter !== t && "bg-transparent border-slate-700 text-slate-400 hover:text-foreground"
              )}
            >
              T{t}
            </Button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-emerald-400" /> Value pick (ADP later than ECR)</span>
        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-red-400" /> Reach (ADP earlier than ECR)</span>
        <span className="flex items-center gap-1"><Info className="w-3 h-3" /> Gap = ADP − ECR rank</span>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading draft board…
        </div>
      )}
      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="p-4 text-red-400 text-sm">
            Failed to load draft board: {error.message}. Click Refresh to retry.
          </CardContent>
        </Card>
      )}

      {/* Board by Tier */}
      {!isLoading && !error && byTier.map(([tier, tierPlayers]) => (
        <div key={tier} className="space-y-1">
          {/* Tier header */}
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-lg border text-sm font-semibold",
            TIER_COLORS[tier] ?? "bg-slate-700/30 border-slate-600/30 text-slate-300"
          )}>
            <span>Tier {tier} — {TIER_LABELS[tier] ?? "Other"}</span>
            <span className="text-xs font-normal opacity-70">{tierPlayers.length} players</span>
          </div>

          {/* Table header */}
          <div className={cn(
            "grid text-xs font-medium text-muted-foreground px-4 py-1",
            showPFR
              ? "grid-cols-[3rem_2rem_1fr_5rem_4rem_4rem_4rem_4rem_4rem_4rem_4rem]"
              : "grid-cols-[3rem_2rem_1fr_5rem_4rem_4rem_4rem_4rem]"
          )}>
            <span>ECR</span>
            <span></span>
            <span>Player</span>
            <span>Pos Rank</span>
            <span>ADP</span>
            <span>Gap</span>
            <span>Bye</span>
            <span>Own%</span>
            {showPFR && <>
              <span>2025 Pts</span>
              <span>VBD</span>
              <span>Rank</span>
            </>}
          </div>

          {/* Player rows */}
          {tierPlayers.map((p) => (
            <div key={p.fpId} className="space-y-0">
              <div
                className={cn(
                  "group grid items-center px-4 py-2 rounded-md cursor-pointer transition-colors",
                  showPFR
                    ? "grid-cols-[3rem_2rem_1fr_5rem_4rem_4rem_4rem_4rem_4rem_4rem_4rem]"
                    : "grid-cols-[3rem_2rem_1fr_5rem_4rem_4rem_4rem_4rem]",
                  expandedPlayer === p.fpId
                    ? "bg-slate-700/60 border border-slate-600/50"
                    : "hover:bg-slate-800/50"
                )}
                onClick={() => setExpandedPlayer(expandedPlayer === p.fpId ? null : p.fpId)}
              >

                {/* ECR Rank */}
                <span className="text-sm font-bold text-foreground">{p.ecrRank}</span>
                {/* Position badge */}
                <Badge
                  variant="outline"
                  className={cn("text-xs px-1 py-0 h-5 font-semibold", POS_COLORS[p.position] ?? "")}
                >
                  {p.position}
                </Badge>
                {/* Name + team */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-sm text-foreground truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{p.team}</span>
                  {p.pfr2025 && <span className="text-xs text-emerald-500/70 shrink-0">●</span>}
                </div>
                {/* Pos rank */}
                <span className="text-xs text-muted-foreground">{p.posRank}</span>
                {/* ADP */}
                <span className="text-xs text-muted-foreground">
                  {p.adp !== null ? p.adp.toFixed(1) : "—"}
                </span>
                {/* Gap */}
                <GapBadge gap={p.ecrAdpGap} />
                {/* Bye */}
                <span className="text-xs text-muted-foreground">{p.byeWeek ?? "—"}</span>
                {/* Own% */}
                <span className="text-xs text-muted-foreground">{p.ownedPct > 0 ? `${p.ownedPct.toFixed(0)}%` : "—"}</span>
                {/* Detail button — only visible on hover */}
                <button
                  className="hidden group-hover:flex ml-auto items-center justify-center w-6 h-6 rounded hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setDrawerPlayer(p as unknown as Record<string, unknown>); }}
                  title="View player details"
                >
                  <Info className="w-3.5 h-3.5" />
                </button>
                {/* PFR columns */}
                {showPFR && <>
                  <span className="text-xs text-muted-foreground">
                    {p.pfr2025 ? p.pfr2025.pprPoints.toFixed(1) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.pfr2025 ? p.pfr2025.vbd : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.pfr2025 ? `#${p.pfr2025.overallRank}` : "—"}
                  </span>
                </>}
              </div>

              {/* Expanded detail row */}
              {expandedPlayer === p.fpId && (
                <div className="mx-4 mb-2 p-4 bg-slate-800/80 rounded-b-lg border border-slate-600/40 border-t-0 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-1">ECR Range</p>
                    <p className="font-semibold text-foreground">{p.ecrMin}–{p.ecrMax} <span className="text-muted-foreground font-normal">(avg {p.ecrAvg.toFixed(1)}, σ {p.ecrStd.toFixed(1)})</span></p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">ADP vs ECR</p>
                    <p className="font-semibold text-foreground">
                      {p.adp !== null ? `ADP ${p.adp.toFixed(1)}` : "No ADP data"}
                      {p.ecrAdpGap !== null && (
                        <span className={cn("ml-2", p.ecrAdpGap >= 5 ? "text-emerald-400" : p.ecrAdpGap <= -5 ? "text-red-400" : "text-muted-foreground")}>
                          ({p.ecrAdpGap > 0 ? `+${p.ecrAdpGap}` : p.ecrAdpGap} spots)
                        </span>
                      )}
                    </p>
                  </div>
                  {p.pfr2025 ? (
                    <>
                      <div>
                        <p className="text-muted-foreground mb-1">2025 Offense</p>
                        <p className="font-semibold text-foreground">
                          {p.position === "QB"
                            ? `${p.pfr2025.passYds} yds, ${p.pfr2025.passTDs} TD, ${p.pfr2025.passInts} INT`
                            : p.position === "RB"
                            ? `${p.pfr2025.rushYds} rush / ${p.pfr2025.recYds} rec`
                            : `${p.pfr2025.targets} tgt, ${p.pfr2025.receptions} rec, ${p.pfr2025.recYds} yds`}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">2025 Fantasy</p>
                        <p className="font-semibold text-foreground">
                          {p.pfr2025.pprPoints.toFixed(1)} PPR pts · {p.pfr2025.totalTDs} TDs · VBD {p.pfr2025.vbd}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">No 2025 PFR stats available (new player or position change)</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {!isLoading && !error && players.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          No players match the current filters.
        </div>
      )}

      {/* Player Detail Drawer */}
      {drawerPlayer && (
        <PlayerDetailDrawer
          player={{
            fpId: drawerPlayer.fpId as number,
            name: drawerPlayer.name as string,
            team: drawerPlayer.team as string,
            position: drawerPlayer.position as string,
            ecrRank: drawerPlayer.ecrRank as number,
            ecrTier: drawerPlayer.ecrTier as number,
            posRank: drawerPlayer.posRank as string,
            adp: drawerPlayer.adp as number | null,
            adpGap: drawerPlayer.ecrAdpGap as number | null,
            byeWeek: drawerPlayer.byeWeek as number | null,
            ownedPct: drawerPlayer.ownedPct as number | null,
            ecrMin: drawerPlayer.ecrMin as number | null,
            ecrMax: drawerPlayer.ecrMax as number | null,
            ecrAvg: drawerPlayer.ecrAvg as number | null,
            ecrStd: drawerPlayer.ecrStd as number | null,
            pfr2025: drawerPlayer.pfr2025
              ? {
                  rushYds: (drawerPlayer.pfr2025 as Record<string, unknown>).rushYds as number | null,
                  rushTd: (drawerPlayer.pfr2025 as Record<string, unknown>).rushTDs as number | null,
                  recYds: (drawerPlayer.pfr2025 as Record<string, unknown>).recYds as number | null,
                  recTd: (drawerPlayer.pfr2025 as Record<string, unknown>).recTDs as number | null,
                  rec: (drawerPlayer.pfr2025 as Record<string, unknown>).receptions as number | null,
                  targets: (drawerPlayer.pfr2025 as Record<string, unknown>).targets as number | null,
                  passYds: (drawerPlayer.pfr2025 as Record<string, unknown>).passYds as number | null,
                  passTd: (drawerPlayer.pfr2025 as Record<string, unknown>).passTDs as number | null,
                  pprPts: (drawerPlayer.pfr2025 as Record<string, unknown>).pprPoints as number | null,
                  vbd: (drawerPlayer.pfr2025 as Record<string, unknown>).vbd as number | null,
                  fantasyRank: (drawerPlayer.pfr2025 as Record<string, unknown>).overallRank as number | null,
                }
              : null,
          }}
          onClose={() => setDrawerPlayer(null)}
        />
      )}
    </div>
  );
}
