/**
 * ReputationTimeline.tsx
 * ──────────────────────
 * Sprint 4: Reputation System
 *
 * Displays a chronological timeline of reputation events for a specific
 * manager (by memberId), or a league-wide view of all events.
 *
 * Used in the Owner Stats page to show a manager's reputation history.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Award, AlertTriangle, TrendingUp, Target, Zap, Shield, Swords, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Event type config ────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, {
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}> = {
  PANIC_SELLER: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: "text-red-400",
    bg: "bg-red-950/30",
    border: "border-red-800/40",
  },
  SILENT_ASSASSIN: {
    icon: <Shield className="w-3.5 h-3.5" />,
    color: "text-purple-400",
    bg: "bg-purple-950/30",
    border: "border-purple-800/40",
  },
  TRADE_SHARK: {
    icon: <Target className="w-3.5 h-3.5" />,
    color: "text-emerald-400",
    bg: "bg-emerald-950/30",
    border: "border-emerald-800/40",
  },
  WAIVER_GRINDER: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: "text-blue-400",
    bg: "bg-blue-950/30",
    border: "border-blue-800/40",
  },
  PLAYOFF_CHOKER: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: "text-orange-400",
    bg: "bg-orange-950/30",
    border: "border-orange-800/40",
  },
  DYNASTY_BUILDER: {
    icon: <Award className="w-3.5 h-3.5" />,
    color: "text-yellow-400",
    bg: "bg-yellow-950/30",
    border: "border-yellow-800/40",
  },
  REVENGE_SEEKER: {
    icon: <Swords className="w-3.5 h-3.5" />,
    color: "text-pink-400",
    bg: "bg-pink-950/30",
    border: "border-pink-800/40",
  },
  CHAOS_AGENT: {
    icon: <Zap className="w-3.5 h-3.5" />,
    color: "text-amber-400",
    bg: "bg-amber-950/30",
    border: "border-amber-800/40",
  },
};

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const config =
    severity === "LEGENDARY"
      ? { label: "Legendary", className: "bg-yellow-900/40 text-yellow-300 border-yellow-700/40" }
      : severity === "DEFINING"
      ? { label: "Defining", className: "bg-purple-900/40 text-purple-300 border-purple-700/40" }
      : { label: "Notable", className: "bg-slate-800/40 text-slate-400 border-slate-700/40" };

  return (
    <Badge variant="outline" className={`text-xs px-1.5 py-0 h-4 ${config.className}`}>
      {config.label}
    </Badge>
  );
}

// ─── Single event card ────────────────────────────────────────────────────────

function EventCard({ event }: {
  event: {
    memberId: string;
    ownerName: string;
    season: number;
    eventType: string;
    eventLabel: string;
    eventSentence: string | null;
    supportingStat: string | null;
    severity: string;
    detectedAt: Date;
  };
}) {
  const config = EVENT_CONFIG[event.eventType] || {
    icon: <Award className="w-3.5 h-3.5" />,
    color: "text-slate-400",
    bg: "bg-slate-800/30",
    border: "border-slate-700/30",
  };

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${config.bg} ${config.border}`}>
      {/* Icon + year column */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${config.bg} border ${config.border} ${config.color}`}>
          {config.icon}
        </div>
        <span className="text-xs font-mono text-slate-500">{event.season}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`text-xs font-semibold ${config.color}`}>{event.eventLabel}</span>
          <SeverityBadge severity={event.severity} />
        </div>

        {event.eventSentence && (
          <p className="text-xs text-slate-300 leading-relaxed mb-1">
            {event.eventSentence}
          </p>
        )}

        {event.supportingStat && (
          <p className="text-xs text-slate-500 italic">{event.supportingStat}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ReputationTimelineProps {
  /** If provided, show events for a specific member only */
  memberId?: string;
  /** If provided, show events for a specific season only */
  season?: number;
  /** Display mode: 'timeline' (single member) or 'league' (all members) */
  mode?: "timeline" | "league";
  /** Max number of events to show (default: 20) */
  limit?: number;
}

export function ReputationTimeline({
  memberId,
  season,
  mode = "timeline",
  limit = 20,
}: ReputationTimelineProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch events based on mode
  const memberQuery = trpc.reputation.getByMember.useQuery(
    { memberId: memberId || "" },
    { enabled: mode === "timeline" && !!memberId, staleTime: 5 * 60_000 }
  );

  const seasonQuery = trpc.reputation.getBySeason.useQuery(
    { season: season || 2025 },
    { enabled: mode === "league" && !!season, staleTime: 5 * 60_000 }
  );

  const allQuery = trpc.reputation.getAll.useQuery(
    undefined,
    { enabled: mode === "league" && !season, staleTime: 5 * 60_000 }
  );

  const refreshMutation = trpc.reputation.refresh.useMutation({
    onSuccess: (result) => {
      toast.success(`Reputation events updated — ${result.processed} events processed`);
      memberQuery.refetch();
      seasonQuery.refetch();
      allQuery.refetch();
    },
    onError: () => toast.error("Failed to refresh reputation events"),
    onSettled: () => setIsRefreshing(false),
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshMutation.mutate();
  };

  const isLoading = memberQuery.isLoading || seasonQuery.isLoading || allQuery.isLoading;

  const rawEvents =
    mode === "timeline" && memberId
      ? (memberQuery.data || [])
      : mode === "league" && season
      ? (seasonQuery.data || [])
      : (allQuery.data || []);

  // Sort by season desc, then limit
  const events = [...rawEvents]
    .sort((a, b) => b.season - a.season)
    .slice(0, limit);

  if (isLoading) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />
            Reputation Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-800/50 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />
            Reputation Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No reputation events yet</p>
            <p className="text-xs text-slate-600 mt-1">
              Events are detected after each weekly data refresh
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3 h-3 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Detect Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/60 border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-400" />
            Reputation Timeline
            <span className="text-xs text-slate-500 font-normal">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
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
        {/* Group by season */}
        {(() => {
          const bySeason: Record<number, typeof events> = {};
          for (const e of events) {
            if (!bySeason[e.season]) bySeason[e.season] = [];
            bySeason[e.season].push(e);
          }
          const seasons = Object.keys(bySeason)
            .map(Number)
            .sort((a, b) => b - a);

          return (
            <div className="space-y-4">
              {seasons.map((s) => (
                <div key={s}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-slate-800" />
                    <span className="text-xs font-mono text-slate-500 px-2">{s}</span>
                    <div className="h-px flex-1 bg-slate-800" />
                  </div>
                  <div className="space-y-2">
                    {bySeason[s].map((event, idx) => (
                      <EventCard key={`${event.memberId}-${event.eventType}-${idx}`} event={event} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

export default ReputationTimeline;
