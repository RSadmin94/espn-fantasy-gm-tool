/**
 * BeatReporterPanel
 *
 * Displays structured beat reporter signals for one or two players.
 * Used in Start/Sit and Waiver Wire.
 *
 * Props:
 *   playerName  — player to show signals for
 *   signals     — pre-loaded signals (from startSit mutation response)
 *   adjustment  — net projection adjustment (e.g. 0.12 = +12%)
 *   compact     — if true, shows only top signal per player (for cards)
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Activity,
  ChevronRight,
  RefreshCw,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BeatSignal {
  id: number;
  playerName: string;
  nflTeam?: string | null;
  position?: string | null;
  signalType: string;
  magnitude: number;       // 0–100
  projectionImpactPct: number; // -25 to +25
  summary: string;
  confidence: number;      // 0–100
  headline?: string | null;
  sourceType?: string | null;
  publishedAt?: Date | string | null;
  cachedAt?: Date | string | null;
}

interface BeatReporterPanelProps {
  playerName: string;
  signals: BeatSignal[];
  adjustment?: number; // fractional, e.g. 0.12 = +12%
  compact?: boolean;
  className?: string;
}

// ─── Signal type config ───────────────────────────────────────────────────────

const SIGNAL_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  role_up: {
    label: "Role ↑",
    icon: <TrendingUp className="h-3 w-3" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  role_down: {
    label: "Role ↓",
    icon: <TrendingDown className="h-3 w-3" />,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
  injury_risk: {
    label: "Injury Risk",
    icon: <AlertTriangle className="h-3 w-3" />,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
  },
  workload_risk: {
    label: "Workload Risk",
    icon: <Activity className="h-3 w-3" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10 border-yellow-500/20",
  },
  hidden_opportunity: {
    label: "Hidden Opp",
    icon: <Zap className="h-3 w-3" />,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
  },
  depth_chart_change: {
    label: "Depth Chart",
    icon: <ChevronRight className="h-3 w-3" />,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10 border-purple-500/20",
  },
  coach_trust_up: {
    label: "Coach Trust ↑",
    icon: <TrendingUp className="h-3 w-3" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  coach_trust_down: {
    label: "Coach Trust ↓",
    icon: <TrendingDown className="h-3 w-3" />,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
  return_from_injury: {
    label: "Returning",
    icon: <RefreshCw className="h-3 w-3" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  neutral: {
    label: "Neutral",
    icon: <Newspaper className="h-3 w-3" />,
    color: "text-slate-400",
    bgColor: "bg-slate-500/10 border-slate-500/20",
  },
};

function getSignalConfig(signalType: string) {
  return (
    SIGNAL_CONFIG[signalType] ?? {
      label: signalType.replace(/_/g, " "),
      icon: <Newspaper className="h-3 w-3" />,
      color: "text-slate-400",
      bgColor: "bg-slate-500/10 border-slate-500/20",
    }
  );
}

// ─── Individual signal row ────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: BeatSignal }) {
  const cfg = getSignalConfig(signal.signalType);
  const isPositive = signal.projectionImpactPct > 0;
  const impactStr = `${isPositive ? "+" : ""}${signal.projectionImpactPct}%`;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        cfg.bgColor
      )}
    >
      <span className={cn("mt-0.5 flex-shrink-0", cfg.color)}>
        {cfg.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn("h-4 px-1.5 text-[10px] font-medium", cfg.color, "border-current/30")}
          >
            {cfg.label}
          </Badge>
          <span
            className={cn(
              "text-[11px] font-semibold",
              isPositive ? "text-emerald-400" : "text-red-400"
            )}
          >
            {impactStr}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {signal.confidence}% conf
          </span>
        </div>
        <p className="mt-0.5 text-xs text-foreground/80 leading-snug">
          {signal.summary}
        </p>
        {signal.headline && signal.headline !== signal.summary && (
          <p className="mt-0.5 text-[10px] text-muted-foreground italic truncate">
            {signal.headline}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function BeatReporterPanel({
  playerName,
  signals,
  adjustment = 0,
  compact = false,
  className,
}: BeatReporterPanelProps) {
  if (signals.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border/50 px-3 py-2 text-xs text-muted-foreground",
          className
        )}
      >
        <span className="flex items-center gap-1.5">
          <Newspaper className="h-3 w-3" />
          No active beat reporter signals for {playerName}
        </span>
      </div>
    );
  }

  const displaySignals = compact ? signals.slice(0, 1) : signals;
  const netImpact = adjustment * 100;
  const netStr = `${netImpact > 0 ? "+" : ""}${netImpact.toFixed(1)}%`;

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Newspaper className="h-3 w-3" />
          Beat Reporter · {playerName}
        </span>
        {Math.abs(netImpact) >= 1 && (
          <span
            className={cn(
              "text-xs font-semibold",
              netImpact > 0 ? "text-emerald-400" : "text-red-400"
            )}
          >
            Net: {netStr} projection
          </span>
        )}
      </div>

      {/* Signal rows */}
      <div className="space-y-1">
        {displaySignals.map((s) => (
          <SignalRow key={s.id} signal={s} />
        ))}
        {compact && signals.length > 1 && (
          <p className="text-[10px] text-muted-foreground pl-1">
            +{signals.length - 1} more signal{signals.length - 1 > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Two-player comparison panel ─────────────────────────────────────────────

interface TwoPlayerBeatPanelProps {
  playerA: { name: string; signals: BeatSignal[]; adjustment?: number };
  playerB: { name: string; signals: BeatSignal[]; adjustment?: number };
  className?: string;
}

export function TwoPlayerBeatPanel({
  playerA,
  playerB,
  className,
}: TwoPlayerBeatPanelProps) {
  const hasAny =
    playerA.signals.length > 0 || playerB.signals.length > 0;

  if (!hasAny) return null;

  return (
    <Card className={cn("border-border/50 bg-card/50", className)}>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Newspaper className="h-4 w-4 text-muted-foreground" />
          Beat Reporter Intelligence
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-3">
        {playerA.signals.length > 0 && (
          <BeatReporterPanel
            playerName={playerA.name}
            signals={playerA.signals}
            adjustment={playerA.adjustment}
          />
        )}
        {playerA.signals.length > 0 && playerB.signals.length > 0 && (
          <Separator className="opacity-30" />
        )}
        {playerB.signals.length > 0 && (
          <BeatReporterPanel
            playerName={playerB.name}
            signals={playerB.signals}
            adjustment={playerB.adjustment}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─── Top signals feed (for Waiver Wire and standalone use) ───────────────────

interface TopSignalsFeedProps {
  signals: BeatSignal[];
  title?: string;
  className?: string;
}

export function TopSignalsFeed({
  signals,
  title = "Beat Reporter Feed",
  className,
}: TopSignalsFeedProps) {
  if (signals.length === 0) {
    return (
      <div
        className={cn(
          "rounded-md border border-dashed border-border/50 px-4 py-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        <Newspaper className="h-6 w-6 mx-auto mb-2 opacity-40" />
        <p>No active signals. Trigger a refresh to fetch the latest NFL news.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Newspaper className="h-4 w-4" />
          {title}
        </h3>
      )}
      {signals.map((s) => (
        <SignalRow key={s.id} signal={s} />
      ))}
    </div>
  );
}
