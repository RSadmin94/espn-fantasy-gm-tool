import React, { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, TrendingUp, TrendingDown, Clock, AlertTriangle } from "lucide-react";

const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
};

const ROI_CONFIG: Record<string, { color: string; icon: React.ReactElement; bg: string }> = {
  "Elite ROI":  { color: "text-yellow-400", bg: "border-yellow-500/30 bg-yellow-500/10", icon: <Star className="w-3.5 h-3.5 text-yellow-400" /> },
  "Strong ROI": { color: "text-emerald-400", bg: "border-emerald-500/30 bg-emerald-500/10", icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> },
  "Fair ROI":   { color: "text-blue-400", bg: "border-blue-500/30 bg-blue-500/10", icon: <TrendingUp className="w-3.5 h-3.5 text-blue-400" /> },
  "Poor ROI":   { color: "text-orange-400", bg: "border-orange-500/30 bg-orange-500/10", icon: <TrendingDown className="w-3.5 h-3.5 text-orange-400" /> },
  "Release":    { color: "text-red-400", bg: "border-red-500/30 bg-red-500/10", icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> },
};

const AGE_COLORS: Record<string, string> = {
  "Young (22-23)":   "text-emerald-400",
  "Prime (24-27)":   "text-blue-400",
  "Veteran (28-30)": "text-yellow-400",
  "Decline (31+)":   "text-red-400",
  "Unknown":         "text-muted-foreground",
};

interface KeeperFVResult {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  currentAvgPoints: number;
  keeperRoundCost: number;
  keeperPickValue: number;
  nextYearRoundCost: number;
  nextYearPickValue: number;
  currentYearSurplus: number;
  nextYearSurplus: number;
  combinedROI: number;
  roiScore: number;
  roiLabel: string;
  ageGroup: string;
  trajectoryMultiplier: number;
  recommendation: string;
}

function ROIBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-yellow-500" : score >= 65 ? "bg-emerald-500" : score >= 45 ? "bg-blue-500" : score >= 25 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
    </div>
  );
}

function KeeperCard({ keeper, maxRoi }: { keeper: KeeperFVResult; maxRoi: number }) {
  const roiCfg = ROI_CONFIG[keeper.roiLabel] || ROI_CONFIG["Fair ROI"];
  const posColor = POS_COLORS[keeper.position] || "";
  const surplusColor = (v: number) => v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <Card className="card-glow bg-card border-border">
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className={`text-[10px] shrink-0 ${posColor}`}>{keeper.position}</Badge>
            <span className="font-semibold text-sm truncate">{keeper.playerName}</span>
            <span className="text-xs text-muted-foreground truncate">{keeper.ownerName}</span>
          </div>
          <div className={`flex items-center gap-1.5 shrink-0 rounded-lg border px-2 py-1 ${roiCfg.bg}`}>
            {roiCfg.icon}
            <span className={`text-xs font-semibold ${roiCfg.color}`}>{keeper.roiLabel}</span>
          </div>
        </div>

        {/* ROI bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>ROI score</span>
            <span className={`font-bold ${roiCfg.color}`}>{keeper.roiScore}/100</span>
          </div>
          <ROIBar score={keeper.roiScore} />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-accent/20 p-2 space-y-0.5">
            <div className="text-muted-foreground">This year cost</div>
            <div className="font-semibold">Round {keeper.keeperRoundCost}</div>
            <div className="text-muted-foreground">{keeper.keeperPickValue.toLocaleString()} pick pts</div>
          </div>
          <div className="rounded-md bg-accent/20 p-2 space-y-0.5">
            <div className="text-muted-foreground">Next year cost</div>
            <div className="font-semibold">Round {keeper.nextYearRoundCost}</div>
            <div className="text-muted-foreground">{keeper.nextYearPickValue.toLocaleString()} pick pts</div>
          </div>
          <div className="rounded-md bg-accent/20 p-2 space-y-0.5">
            <div className="text-muted-foreground">Current surplus</div>
            <div className={`font-semibold ${surplusColor(keeper.currentYearSurplus)}`}>
              {keeper.currentYearSurplus > 0 ? "+" : ""}{keeper.currentYearSurplus.toLocaleString()}
            </div>
            <div className="text-muted-foreground">ADP vs cost gap</div>
          </div>
          <div className="rounded-md bg-accent/20 p-2 space-y-0.5">
            <div className="text-muted-foreground">Combined 2yr ROI</div>
            <div className={`font-semibold ${surplusColor(keeper.combinedROI)}`}>
              {keeper.combinedROI > 0 ? "+" : ""}{keeper.combinedROI.toLocaleString()}
            </div>
            <div className="text-muted-foreground">Total value surplus</div>
          </div>
        </div>

        {/* Age group */}
        <div className="flex items-center gap-2 text-xs">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className={`font-medium ${AGE_COLORS[keeper.ageGroup] || "text-muted-foreground"}`}>
            {keeper.ageGroup}
          </span>
          <span className="text-muted-foreground">
            · trajectory ×{keeper.trajectoryMultiplier.toFixed(2)}
          </span>
        </div>

        {/* Recommendation */}
        <div className={`rounded-lg border p-2.5 ${roiCfg.bg}`}>
          <div className="text-xs leading-relaxed">{keeper.recommendation}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function KeeperFutureValuePage() {
  const [season, setSeason] = useState(2025);
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"roi" | "surplus" | "combined">("roi");

  const { data: keeperFV, isLoading } = trpc.analytics.keeperFutureValue.useQuery({ season });
  const { data: teams } = trpc.espn.teams.useQuery({ season });

  const teamList = (teams as Record<string, unknown>[] | undefined) || [];
  const allKeepers = (keeperFV as KeeperFVResult[] | undefined) || [];

  const filtered = allKeepers
    .filter(k => filterTeam === "all" || k.ownerName === filterTeam)
    .sort((a, b) => {
      if (sortBy === "roi") return b.roiScore - a.roiScore;
      if (sortBy === "surplus") return b.currentYearSurplus - a.currentYearSurplus;
      return b.combinedROI - a.combinedROI;
    });

  const ownerNames = Array.from(new Set(allKeepers.map(k => k.ownerName))).sort();

  const eliteCount = filtered.filter(k => k.roiLabel === "Elite ROI" || k.roiLabel === "Strong ROI").length;
  const releaseCount = filtered.filter(k => k.roiLabel === "Release" || k.roiLabel === "Poor ROI").length;
  const avgScore = filtered.length > 0
    ? Math.round(filtered.reduce((s, k) => s + k.roiScore, 0) / filtered.length)
    : 0;

  return (
    <AppLayout title="Keeper Future Value" subtitle="2-year ROI scoring — current surplus + next-year projection with age trajectory">
      <div className="p-6 space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonSelector value={season} onChange={setSeason} />
          <Select value={filterTeam} onValueChange={setFilterTeam}>
            <SelectTrigger className="w-44 h-9 text-sm border-border bg-input">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {ownerNames.map(n => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-40 h-9 text-sm border-border bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="roi">Sort by ROI score</SelectItem>
              <SelectItem value="surplus">Sort by current surplus</SelectItem>
              <SelectItem value="combined">Sort by combined 2yr</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary metrics */}
        {!isLoading && allKeepers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">Total keepers</div>
              <div className="text-2xl font-bold">{filtered.length}</div>
            </div>
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">Elite/Strong ROI</div>
              <div className="text-2xl font-bold text-yellow-400">{eliteCount}</div>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">Should release</div>
              <div className="text-2xl font-bold text-red-400">{releaseCount}</div>
            </div>
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">Avg ROI score</div>
              <div className="text-2xl font-bold text-blue-400">{avgScore}</div>
            </div>
          </div>
        )}

        {/* ROI explanation */}
        <Card className="card-glow bg-card border-border border-blue-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
              {[
                ["Current surplus", "Draft value at current ADP round minus keeper round cost"],
                ["Next year cost", "Round + 1 if kept again — compounding cost over years"],
                ["Age trajectory", "Young players get ×1.08, veterans ×0.90, decline ×0.78"],
                ["Combined ROI", "Two-year total surplus — the real long-term keeper value"],
              ].map(([label, desc]) => (
                <div key={label} className="flex items-start gap-2">
                  <span className="font-semibold text-foreground shrink-0">{label}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Cards */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card className="card-glow bg-card border-border">
            <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
              No keeper data found for {season}. Sync ESPN data and make sure keepers are flagged in the draft.
            </CardContent>
          </Card>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(k => (
              <KeeperCard key={k.playerId} keeper={k} maxRoi={100} />
            ))}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
