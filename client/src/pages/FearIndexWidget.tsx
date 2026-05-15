/**
 * FearIndexWidget.tsx
 * ───────────────────
 * Sprint 4: League Fear Index
 *
 * Displays a ranked table of all managers by fear score for the current week.
 * Each row shows: rank, owner name, fear score bar, heat label badge.
 * Hovering a row opens a rich tooltip with the exact 5-component formula
 * breakdown — raw value, weight, and weighted contribution for each component.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Skull,
  Zap,
  Info,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Heat label config ────────────────────────────────────────────────────────

const HEAT_CONFIG: Record<
  string,
  {
    color: string;
    bg: string;
    border: string;
    icon: React.ReactNode;
    description: string;
    barColor: string;
  }
> = {
  UNTOUCHABLE: {
    color: "text-red-400",
    bg: "bg-red-950/40",
    border: "border-red-800/50",
    icon: <Skull className="w-3 h-3" />,
    description: "Peak threat — avoid trading against this manager",
    barColor: "bg-red-500",
  },
  "RISING THREAT": {
    color: "text-orange-400",
    bg: "bg-orange-950/30",
    border: "border-orange-800/40",
    icon: <Flame className="w-3 h-3" />,
    description: "Momentum building — heating up fast",
    barColor: "bg-orange-500",
  },
  DANGEROUS: {
    color: "text-yellow-400",
    bg: "bg-yellow-950/20",
    border: "border-yellow-800/30",
    icon: <Zap className="w-3 h-3" />,
    description: "Solid threat — competitive in most matchups",
    barColor: "bg-yellow-500",
  },
  NEUTRAL: {
    color: "text-slate-300",
    bg: "bg-slate-800/30",
    border: "border-slate-700/30",
    icon: <Minus className="w-3 h-3" />,
    description: "Average threat — matchup-dependent",
    barColor: "bg-slate-400",
  },
  DECLINING: {
    color: "text-blue-400",
    bg: "bg-blue-950/20",
    border: "border-blue-800/30",
    icon: <TrendingDown className="w-3 h-3" />,
    description: "Fading — vulnerabilities are showing",
    barColor: "bg-blue-500",
  },
  COLLAPSING: {
    color: "text-slate-500",
    bg: "bg-slate-900/20",
    border: "border-slate-700/20",
    icon: <Shield className="w-3 h-3" />,
    description: "Low threat — potential trade target",
    barColor: "bg-slate-600",
  },
};

// ─── Formula component definitions ───────────────────────────────────────────

interface FormulaComponent {
  label: string;
  shortLabel: string;
  weight: number;
  getValue: (entry: FearEntry) => number;
  /** How to display the raw value */
  formatRaw: (v: number) => string;
  /** Colour class for the mini bar */
  barClass: string;
  /** Max raw value for the mini bar width calculation */
  maxRaw: number;
}

type FearEntry = {
  teamId: number;
  rank: number;
  ownerName: string;
  fearScore: number;
  heatLabel: string;
  avgPfLast4: number;
  winStreak: number;
  rosterHealthScore: number;
  tradeAggressionScore: number;
  exploitabilityInverse: number;
};

const FORMULA_COMPONENTS: FormulaComponent[] = [
  {
    label: "Avg PF (last 4 wks)",
    shortLabel: "Avg PF",
    weight: 0.30,
    getValue: (e) => e.avgPfLast4,
    formatRaw: (v) => `${v}/100`,
    barClass: "bg-emerald-500",
    maxRaw: 100,
  },
  {
    label: "Win Streak",
    shortLabel: "Streak",
    weight: 8,
    getValue: (e) => e.winStreak,
    formatRaw: (v) =>
      v > 0 ? `+${v}W` : v < 0 ? `${Math.abs(v)}L` : "—",
    barClass: "bg-green-400",
    maxRaw: 6,
  },
  {
    label: "Roster Health",
    shortLabel: "Health",
    weight: 0.20,
    getValue: (e) => e.rosterHealthScore,
    formatRaw: (v) => `${v}/100`,
    barClass: "bg-teal-500",
    maxRaw: 100,
  },
  {
    label: "Trade Aggression",
    shortLabel: "Trades",
    weight: 0.15,
    getValue: (e) => e.tradeAggressionScore,
    formatRaw: (v) => `${v}/100`,
    barClass: "bg-amber-500",
    maxRaw: 100,
  },
  {
    label: "Exploitability Inv.",
    shortLabel: "Exploit⁻¹",
    weight: 0.15,
    getValue: (e) => e.exploitabilityInverse,
    formatRaw: (v) => `${v}/100`,
    barClass: "bg-purple-500",
    maxRaw: 100,
  },
];

// ─── Weighted contribution calculator ────────────────────────────────────────

function calcContribution(comp: FormulaComponent, entry: FearEntry): number {
  const raw = comp.getValue(entry);
  // For winStreak: contribution = streak × 8, capped at 6 × 8 = 48
  if (comp.shortLabel === "Streak") {
    return Math.max(0, Math.min(raw, 6)) * comp.weight;
  }
  return raw * comp.weight;
}

// ─── Formula breakdown tooltip content ───────────────────────────────────────

function FormulaBreakdown({ entry }: { entry: FearEntry }) {
  const config = HEAT_CONFIG[entry.heatLabel] || HEAT_CONFIG["NEUTRAL"];
  const ownerDisplay = entry.ownerName.split(";")[0].trim();

  return (
    <div className="space-y-2 text-xs w-64">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-slate-100">{ownerDisplay}</span>
        <Badge
          variant="outline"
          className={`text-xs px-1.5 py-0 h-5 flex items-center gap-1 ${config.color} border-current/30`}
        >
          {config.icon}
          <span>{entry.heatLabel}</span>
        </Badge>
      </div>
      <p className={`text-xs ${config.color}`}>{config.description}</p>

      {/* Formula components */}
      <div className="border-t border-slate-700 pt-2 space-y-2">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">
          Formula Breakdown
        </p>
        {FORMULA_COMPONENTS.map((comp) => {
          const raw = comp.getValue(entry);
          const contribution = calcContribution(comp, entry);
          // Bar width: for streak, use capped positive value; for others, use raw
          const barRaw = comp.shortLabel === "Streak" ? Math.max(0, Math.min(raw, 6)) : Math.max(0, raw);
          const barPct = Math.round((barRaw / comp.maxRaw) * 100);

          return (
            <div key={comp.shortLabel} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{comp.label}</span>
                <div className="flex items-center gap-1.5 text-right">
                  <span className="text-slate-300">{comp.formatRaw(raw)}</span>
                  <span className="text-slate-600">×</span>
                  <span className="text-slate-500">
                    {comp.shortLabel === "Streak" ? "×8" : `${(comp.weight * 100).toFixed(0)}%`}
                  </span>
                  <span className="text-slate-600">=</span>
                  <span className={`font-mono font-semibold w-8 text-right ${config.color}`}>
                    {contribution.toFixed(1)}
                  </span>
                </div>
              </div>
              {/* Mini component bar */}
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${comp.barClass}`}
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="border-t border-slate-700 pt-1.5 flex items-center justify-between">
        <span className="text-slate-400 font-medium">Fear Score</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-xs">
            ={" "}
            {FORMULA_COMPONENTS.map((c) =>
              calcContribution(c, entry).toFixed(1)
            ).join(" + ")}
          </span>
          <span className={`font-bold text-sm ${config.color}`}>
            = {entry.fearScore}
          </span>
        </div>
      </div>

      {/* Hint */}
      <p className="text-slate-600 text-xs border-t border-slate-800 pt-1">
        Hover any row to see its breakdown
      </p>
    </div>
  );
}

// ─── Score bar component ──────────────────────────────────────────────────────

function ScoreBar({ score, heatLabel }: { score: number; heatLabel: string }) {
  const config = HEAT_CONFIG[heatLabel] || HEAT_CONFIG["NEUTRAL"];
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${config.barColor}`}
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
              <RefreshCw
                className={`w-3 h-3 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Compute Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              League Fear Index
              {/* Formula hint */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 text-slate-500 cursor-help" />
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  className="bg-slate-900 border-slate-700 text-slate-200 max-w-xs"
                >
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-slate-100">Fear Score Formula</p>
                    <p className="text-slate-400 font-mono leading-relaxed">
                      = (Avg PF × 0.30)<br />
                      + (Win Streak × 8, cap 6)<br />
                      + (Roster Health × 0.20)<br />
                      + (Trade Aggression × 0.15)<br />
                      + (Exploitability Inv. × 0.15)
                    </p>
                    <p className="text-slate-500 pt-0.5">
                      Hover any row for the exact breakdown.
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-500 hover:text-slate-300"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="space-y-1.5">
            {(entries as FearEntry[]).map((entry) => {
              const config = HEAT_CONFIG[entry.heatLabel] || HEAT_CONFIG["NEUTRAL"];
              return (
                <Tooltip key={entry.teamId}>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex items-center gap-3 px-2.5 py-1.5 rounded-lg border cursor-default transition-colors hover:bg-slate-800/50 ${config.bg} ${config.border}`}
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
                        <ScoreBar
                          score={entry.fearScore}
                          heatLabel={entry.heatLabel}
                        />
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

                  {/* Rich formula breakdown tooltip */}
                  <TooltipContent
                    side="left"
                    align="center"
                    className="bg-slate-950 border-slate-700 text-slate-200 p-3 shadow-xl"
                  >
                    <FormulaBreakdown entry={entry} />
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/50 flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(HEAT_CONFIG).map(([label, cfg]) => (
              <div
                key={label}
                className={`flex items-center gap-1 text-xs ${cfg.color}`}
              >
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
