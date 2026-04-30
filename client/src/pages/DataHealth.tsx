import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronRight, Shield, Database, Wifi, WifiOff } from "lucide-react";

const HEALTH_COLORS = {
  healthy: "text-emerald-400",
  warning: "text-yellow-400",
  degraded: "text-orange-400",
  critical: "text-red-400",
};

const HEALTH_BG = {
  healthy: "bg-emerald-500/10 border-emerald-500/30",
  warning: "bg-yellow-500/10 border-yellow-500/30",
  degraded: "bg-orange-500/10 border-orange-500/30",
  critical: "bg-red-500/10 border-red-500/30",
};

const STATUS_ICON = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  error: <XCircle className="w-4 h-4 text-red-400" />,
  stale: <Clock className="w-4 h-4 text-yellow-400" />,
  empty: <AlertTriangle className="w-4 h-4 text-orange-400" />,
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  partial: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />,
  unknown: <Clock className="w-4 h-4 text-slate-400" />,
};

const STATUS_BADGE: Record<string, string> = {
  ok: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  error: "bg-red-500/20 text-red-300 border-red-500/30",
  stale: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  empty: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  success: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  partial: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/30",
  unknown: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export default function DataHealth() {
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [refreshingSeason, setRefreshingSeason] = useState<number | null>(null);

  const { data: health, isLoading, refetch } = trpc.pipeline.health.useQuery({});
  const refreshMutation = trpc.espn.refresh.useMutation({
    onSuccess: () => { refetch(); setRefreshingSeason(null); },
    onError: () => setRefreshingSeason(null),
  });

  const toggleSeason = (season: number) => {
    setExpandedSeasons(prev => {
      const next = new Set(prev);
      if (next.has(season)) next.delete(season);
      else next.add(season);
      return next;
    });
  };

  const handleRefresh = (season: number) => {
    setRefreshingSeason(season);
    refreshMutation.mutate({ season });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-slate-700/50 rounded animate-pulse w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-700/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const overallHealth = health?.overallHealth ?? "unknown";
  const healthColor = HEALTH_COLORS[overallHealth as keyof typeof HEALTH_COLORS] ?? "text-slate-400";
  const healthBg = HEALTH_BG[overallHealth as keyof typeof HEALTH_BG] ?? "bg-slate-500/10 border-slate-500/30";

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-red-400" />
            Data Health
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            ESPN pipeline status, per-view health, and data quality gates
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="border-slate-600 text-slate-300 hover:bg-slate-700"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Status
        </Button>
      </div>

      {/* Overall Health Banner */}
      <div className={`rounded-lg border p-4 ${healthBg}`}>
        <div className="flex items-center gap-3">
          {overallHealth === "healthy" && <CheckCircle2 className={`w-6 h-6 ${healthColor}`} />}
          {overallHealth === "warning" && <AlertTriangle className={`w-6 h-6 ${healthColor}`} />}
          {overallHealth === "degraded" && <AlertTriangle className={`w-6 h-6 ${healthColor}`} />}
          {overallHealth === "critical" && <XCircle className={`w-6 h-6 ${healthColor}`} />}
          <div>
            <div className={`font-semibold text-lg capitalize ${healthColor}`}>
              Pipeline {overallHealth}
            </div>
            <div className="text-slate-400 text-sm">
              {health?.totalSeasons ?? 0} seasons cached
              {(health?.staleSeasons ?? 0) > 0 && ` · ${health?.staleSeasons} stale (>7 days)`}
              {(health?.failedSeasons ?? 0) > 0 && ` · ${health?.failedSeasons} failed`}
              {(health?.partialSeasons ?? 0) > 0 && ` · ${health?.partialSeasons} partial`}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {health?.cookiesPresent ? (
              <div className="flex items-center gap-1 text-emerald-400 text-sm">
                <Wifi className="w-4 h-4" /> ESPN Auth Active
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-400 text-sm">
                <WifiOff className="w-4 h-4" /> No ESPN Cookies
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="p-4">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Seasons Cached</div>
            <div className="text-2xl font-bold text-white">{health?.totalSeasons ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="p-4">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Stale Seasons</div>
            <div className={`text-2xl font-bold ${(health?.staleSeasons ?? 0) > 0 ? "text-yellow-400" : "text-emerald-400"}`}>
              {health?.staleSeasons ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="p-4">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Failed Seasons</div>
            <div className={`text-2xl font-bold ${(health?.failedSeasons ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {health?.failedSeasons ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/60 border-slate-700">
          <CardContent className="p-4">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Partial Seasons</div>
            <div className={`text-2xl font-bold ${(health?.partialSeasons ?? 0) > 0 ? "text-orange-400" : "text-emerald-400"}`}>
              {health?.partialSeasons ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cookie Warning */}
      {!health?.cookiesPresent && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-red-300 font-semibold">ESPN Authentication Missing</div>
            <div className="text-red-400/80 text-sm mt-1">
              ESPN_SWID and ESPN_S2 cookies are not configured. All ESPN data fetches will fail.
              Update these in your project Secrets settings.
            </div>
          </div>
        </div>
      )}

      {/* Season-by-Season Health */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Database className="w-5 h-5 text-slate-400" />
          Season Health
        </h2>
        <div className="space-y-2">
          {(health?.seasonHealth ?? []).map((sh) => {
            const isExpanded = expandedSeasons.has(sh.season);
            const isRefreshing = refreshingSeason === sh.season;

            return (
              <Card key={sh.season} className="bg-slate-800/60 border-slate-700">
                <Collapsible open={isExpanded} onOpenChange={() => toggleSeason(sh.season)}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/30 rounded-t-lg transition-colors">
                      <div className="flex items-center gap-3">
                        {STATUS_ICON[sh.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.unknown}
                        <span className="font-semibold text-white">{sh.season}</span>
                        <Badge className={`text-xs border ${STATUS_BADGE[sh.status] ?? STATUS_BADGE.unknown}`}>
                          {sh.status}
                        </Badge>
                        {sh.staleFlag && (
                          <Badge className="text-xs border bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                            Stale ({sh.staleAge})
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden md:flex gap-4 text-xs text-slate-400">
                          <span>{sh.teamCount} teams</span>
                          <span>{sh.rosterCount} players</span>
                          <span>{sh.matchupCount} matchups</span>
                          <span>{sh.draftPickCount} picks</span>
                          <span>{sh.transactionCount} txs</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleRefresh(sh.season); }}
                          disabled={isRefreshing}
                          className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs"
                        >
                          {isRefreshing ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                        </Button>
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 border-t border-slate-700/50 pt-3 space-y-3">
                      {/* Error message */}
                      {sh.errorMessage && (
                        <div className="rounded bg-red-500/10 border border-red-500/30 p-3 text-red-300 text-sm">
                          <strong>Error:</strong> {sh.errorMessage}
                        </div>
                      )}

                      {/* Data counts */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[
                          { label: "Teams", value: sh.teamCount, expected: 14 },
                          { label: "Roster Entries", value: sh.rosterCount, expected: 200 },
                          { label: "Matchups", value: sh.matchupCount, expected: 100 },
                          { label: "Draft Picks", value: sh.draftPickCount, expected: 180 },
                          { label: "Transactions", value: sh.transactionCount, expected: 50 },
                        ].map(({ label, value, expected }) => (
                          <div key={label} className="bg-slate-900/40 rounded p-2">
                            <div className="text-slate-400 text-xs">{label}</div>
                            <div className={`font-bold text-sm ${value >= expected ? "text-emerald-400" : value > 0 ? "text-yellow-400" : "text-red-400"}`}>
                              {value}
                            </div>
                            <Progress
                              value={Math.min(100, (value / expected) * 100)}
                              className="h-1 mt-1 bg-slate-700"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Per-view health */}
                      {sh.viewHealth.length > 0 && (
                        <div>
                          <div className="text-slate-400 text-xs uppercase tracking-wide mb-2">Per-View Status</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {sh.viewHealth.map((vh) => (
                              <div key={vh.viewName} className="flex items-center gap-2 bg-slate-900/40 rounded p-2">
                                {STATUS_ICON[vh.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.unknown}
                                <div>
                                  <div className="text-white text-xs font-mono">{vh.viewName}</div>
                                  <div className="text-slate-500 text-xs">{vh.recordCount ?? 0} records</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Last refreshed */}
                      <div className="text-slate-500 text-xs">
                        Last refreshed: {sh.lastRefreshedAt
                          ? new Date(sh.lastRefreshedAt).toLocaleString()
                          : "Never"}
                        {sh.staleFlag && " · Data may be outdated"}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}

          {(health?.seasonHealth ?? []).length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <div className="text-lg">No seasons cached yet</div>
              <div className="text-sm mt-1">Use the refresh button to fetch ESPN data for any season</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
