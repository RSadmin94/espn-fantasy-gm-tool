/**
 * FearIndexWidget.tsx
 * ───────────────────
 * Sprint 4: League Fear Index
 *
 * Displays a ranked table of all managers by fear score for the current week.
 * Each row shows: rank, owner name, fear score bar, heat label badge, and
 * the component breakdown on hover.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { RefreshCw, Flame, TrendingUp, TrendingDown, Minus, Shield, Skull, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Heat label config ────────────────────────────────────────────────────────

const HEAT_CONFIG: Record<string, {
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  description: string;
}> = {
  "UNTOUCHABLE": {
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800/50",
    icon: <Skull className="w-3 h-3" />,
    description: "Peak threat level — avoid trading with or against this manager",
  },
  "RISING THREAT": {
    color: "text-orange-400",
    bg: "bg-orange-950/30",
    border: "border-orange-800/40",
    icon: <Flame className="w-3 h-3" />,
    description: "Momentum building — this manager is heating up fast",
  },
  "DANGEROUS": {
    color: "text-yellow-400",
    bg: "bg-yellow-950/20",
    border: "border-yellow-800/30",
    icon: <Zap className="w-3 h-3" />,
    description: "Solid threat — competitive in most matchups",
  },
  "NEUTRAL": {
    color: "text-slate-300",
    bg: "bg-slate-800/30",
    border: "border-slate-700/30",
    icon: <Minus className="w-3 h-3" />,
    description: "Average threat level — matchup-dependent",
  },
  "DECLINING": {
    color: "text-blue-400",
    bg: "bg-blue-950/20",
    border: "border-blue-800/30",
    icon: <TrendingDown className="w-3 h-3" />,
    description: "Fading — vulnerabilities are showing",
  },
  "COLLAPSING": {
    color: "text-slate-500",
    bg: "bg-slate-900/20",
    border: "border-slate-700/20",
    icon: <Shield className="w-3 h-3" />,
    description: "Low threat — potential trade target",
  },
};

// ─── Score bar component ──────────────────────────────────────────────────────

function ScoreBar({ score, heatLabel }: { score: number; heatLabel: string }) {
  const config = HEAT_CONFIG[heatLabel] || HEAT_CONFIG["NEUTRAL"];
  const barColor =
    score >= 85 ? "bg-red-500" :
    score >= 70 ? "bg-orange-500" :
    score >= 55 ? "bg-yellow-500" :
    score >= 40 ? "bg-slate-400" :
    score >= 25 ? "bg-blue-500" :
    "bg-slate-600";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-mono font-bold w-7 text-right ${config.color}`}>
        {score}
      </span>
    </div>
  );
}

// ─── Rank medal ───────────────────────────────────────────────────────────────

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">🥇</span>;
  if (rank === 2) return <span className="text-base">🥈</span>;
  if (rank === 3) return <span className="text-base">🥉</span>;
  return (
    <span className="text-xs font-mono text-slate-500 w-5 text-center">
      {rank}
    </span>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function FearIndexWidget({ season = 2025 }: { season?: number }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: entries = [], isLoading, refetch } = trpc.fearIndex.getLatest.useQuery(
    { season },
    { staleTime: 5 * 60_000 }
  );

  const refreshMutation = trpc.fearIndex.refresh.useMutation({
    onSuccess: (result) => {
      toast.success(`Fear index updated — ${result.count} teams computed`);
      refetch();
    },
    onError: () => toast.error("Failed to refresh fear index"),
    onSettled: () => setIsRefreshing(false),
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshMutation.mutate({ season });
  };

  if (isLoading) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            League Fear Index
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-slate-800/50 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-400" />
            League Fear Index
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Flame className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No fear index data yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3 h-3 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Compute Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              League Fear Index
              <span className="text-xs text-slate-500 font-normal">Week {entries[0] ? "current" : ""}</span>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-1.5">
            {entries.map((entry) => {
              const config = HEAT_CONFIG[entry.heatLabel] || HEAT_CONFIG["NEUTRAL"];
              return (
                <Tooltip key={entry.teamId}>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex items-center gap-3 px-2.5 py-1.5 rounded-lg border cursor-default transition-colors hover:bg-slate-800/40 ${config.bg} ${config.border}`}
                    >
                      {/* Rank */}
                      <div className="w-6 flex justify-center flex-shrink-0">
                        <RankMedal rank={entry.rank} />
                      </div>

                      {/* Owner name */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">
                          {entry.ownerName.split(";")[0].trim()}
                        </p>
                      </div>

                      {/* Score bar */}
                      <div className="w-28 flex-shrink-0">
                        <ScoreBar score={entry.fearScore} heatLabel={entry.heatLabel} />
                      </div>

                      {/* Heat label badge */}
                      <Badge
                        variant="outline"
                        className={`text-xs px-1.5 py-0 h-5 flex-shrink-0 flex items-center gap-1 ${config.color} border-current/30`}
                      >
                        {config.icon}
                        <span className="hidden sm:inline">{entry.heatLabel}</span>
                      </Badge>

                      {/* Streak indicator */}
                      {entry.winStreak >= 2 && (
                        <TrendingUp className="w-3 h-3 text-green-400 flex-shrink-0" />
                      )}
                      {entry.winStreak <= -2 && (
                        <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="left"
                    className="bg-slate-900 border-slate-700 text-slate-200 max-w-xs"
                  >
                    <div className="space-y-1.5 text-xs">
                      <p className="font-semibold text-sm">{entry.ownerName.split(";")[0].trim()}</p>
                      <p className={`font-medium ${config.color}`}>{config.description}</p>
                      <div className="border-t border-slate-700 pt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                        <span className="text-slate-500">Avg PF last 4</span>
                        <span className="text-right">{entry.avgPfLast4}/100</span>
                        <span className="text-slate-500">Win streak</span>
                        <span className={`text-right ${entry.winStreak > 0 ? "text-green-400" : entry.winStreak < 0 ? "text-red-400" : ""}`}>
                          {entry.winStreak > 0 ? `+${entry.winStreak}W` : entry.winStreak < 0 ? `${Math.abs(entry.winStreak)}L` : "—"}
                        </span>
                        <span className="text-slate-500">Roster health</span>
                        <span className="text-right">{entry.rosterHealthScore}/100</span>
                        <span className="text-slate-500">Trade aggression</span>
                        <span className="text-right">{entry.tradeAggressionScore}/100</span>
                        <span className="text-slate-500">Exploitability inv.</span>
                        <span className="text-right">{entry.exploitabilityInverse}/100</span>
                      </div>
                      <div className="border-t border-slate-700 pt-1.5 flex justify-between">
                        <span className="text-slate-500">Fear Score</span>
                        <span className={`font-bold ${config.color}`}>{entry.fearScore}/100</span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/50 flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(HEAT_CONFIG).map(([label, cfg]) => (
              <div key={label} className={`flex items-center gap-1 text-xs ${cfg.color}`}>
                {cfg.icon}
                <span className="text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default FearIndexWidget;
