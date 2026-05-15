// FILE: client/src/pages/WaiverIntelligence.tsx
// Waiver Wire Intelligence — powered by the Phase 1-5 weekly assessment engine.
// Shows Rod's opportunity board (waiver steals, buy-low windows, exploit biases)
// alongside the league desperation snapshot so Rod can act before opponents do.
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Zap, TrendingUp, AlertTriangle, Shield,
  Users, Target, Clock, ChevronRight, BarChart2
} from "lucide-react";
import { cn } from "@/lib/utils";
import AppLayout from "@/components/AppLayout";

// ─── Types ────────────────────────────────────────────────────────────────────
type Urgency = "NOW" | "THIS_WEEK" | "MONITOR";
type OppType = "TRADE_WINDOW" | "WAIVER_STEAL" | "EXPLOIT_DRAFT_BIAS" | "BUY_LOW" | "SELL_HIGH";

interface RodOpportunity {
  type: OppType;
  targetTeamId: number;
  targetOwner: string;
  action: string;
  urgency: Urgency;
  reasoning: string;
  desperationScore?: number;
  exploitabilityScore?: number;
}

interface PulseTeam {
  teamId: number;
  ownerName: string;
  standingRank: number;
  wins: number;
  losses: number;
  pointsFor: number;
  lastWeekTransactionCount: number;
  desperationScore: number;
  desperationLabel: string;
  playoffProbability: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const URGENCY_CONFIG: Record<Urgency, { label: string; color: string; icon: React.ElementType }> = {
  NOW:       { label: "Act Now",   color: "text-red-400 border-red-500/40 bg-red-500/10",          icon: Zap },
  THIS_WEEK: { label: "This Week", color: "text-orange-400 border-orange-500/40 bg-orange-500/10", icon: Clock },
  MONITOR:   { label: "Monitor",  color: "text-blue-400 border-blue-500/40 bg-blue-500/10",        icon: Shield },
};

const OPP_TYPE_CONFIG: Record<OppType, { label: string; color: string }> = {
  WAIVER_STEAL:       { label: "Waiver Steal", color: "text-green-400 border-green-500/30 bg-green-500/10" },
  BUY_LOW:            { label: "Buy Low",       color: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
  TRADE_WINDOW:       { label: "Trade Window",  color: "text-purple-400 border-purple-500/30 bg-purple-500/10" },
  SELL_HIGH:          { label: "Sell High",     color: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
  EXPLOIT_DRAFT_BIAS: { label: "Exploit Bias",  color: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
};

function DesperationBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-red-500" :
    score >= 45 ? "bg-orange-400" :
    score >= 25 ? "bg-yellow-400" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold tabular-nums text-muted-foreground w-6 text-right">{score}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WaiverIntelligence() {
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | "ALL">("ALL");
  const [typeFilter, setTypeFilter]       = useState<OppType | "ALL">("ALL");
  const [search, setSearch]               = useState("");
  const [season]                          = useState(2025);

  const {
    data: oppData,
    isLoading: oppLoading,
    error: oppError,
    refetch: refetchOpp,
    isFetching: oppFetching,
  } = trpc.weeklyAssessment.rodOpportunities.useQuery(
    { season },
    { staleTime: 10 * 60 * 1000 }
  );

  const {
    data: pulseData,
    isLoading: pulseLoading,
    refetch: refetchPulse,
    isFetching: pulseFetching,
  } = trpc.weeklyAssessment.leaguePulse.useQuery(
    { season },
    { staleTime: 10 * 60 * 1000 }
  );

  const isLoading  = oppLoading || pulseLoading;
  const isFetching = oppFetching || pulseFetching;

  const handleRefresh = () => { void refetchOpp(); void refetchPulse(); };

  const filteredOpps = useMemo((): RodOpportunity[] => {
    const opps = (oppData?.opportunities ?? []) as RodOpportunity[];
    return opps.filter((o) => {
      if (urgencyFilter !== "ALL" && o.urgency !== urgencyFilter) return false;
      if (typeFilter !== "ALL" && o.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!o.targetOwner.toLowerCase().includes(q) && !o.action.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [oppData, urgencyFilter, typeFilter, search]);

  const sortedPulse = useMemo((): PulseTeam[] => {
    const teams = (pulseData?.teams ?? []) as PulseTeam[];
    return [...teams].sort((a, b) => b.desperationScore - a.desperationScore);
  }, [pulseData]);

  const nowCount      = (oppData?.opportunities as RodOpportunity[] | undefined)?.filter(o => o.urgency === "NOW").length ?? 0;
  const thisWeekCount = (oppData?.opportunities as RodOpportunity[] | undefined)?.filter(o => o.urgency === "THIS_WEEK").length ?? 0;

  const { user } = useAuth();
  const myFirstName = user?.name?.split(" ")[0] ?? "Your";

  return (
    <AppLayout
      title="Waiver Intelligence"
      subtitle={`Week ${pulseData?.week ?? "—"} · ${season} Season · ${myFirstName}'s Opportunity Board`}
    >
      <div className="space-y-6">

        {/* Header bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            {nowCount > 0 && (
              <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-sm px-3 py-1">
                <Zap className="w-3.5 h-3.5 mr-1" />
                {nowCount} Act Now
              </Badge>
            )}
            {thisWeekCount > 0 && (
              <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/40 text-sm px-3 py-1">
                <Clock className="w-3.5 h-3.5 mr-1" />
                {thisWeekCount} This Week
              </Badge>
            )}
            {oppData?.summary && (
              <span className="text-sm text-muted-foreground hidden md:block max-w-md truncate">
                {oppData.summary}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="border-border"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isFetching && "animate-spin")} />
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {/* Error state */}
        {oppError && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="pt-4 flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Could not load opportunity board</p>
                <p className="text-xs text-red-400/70 mt-0.5">
                  {oppError.message} — sync ESPN data first via Data Center.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Opportunity Board (2/3 width) */}
          <div className="xl:col-span-2 space-y-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  {myFirstName}'s Opportunity Board
                  {oppData && (
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      Week {oppData.week}
                    </span>
                  )}
                </CardTitle>

                {/* Filters */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <div className="relative">
                    <Input
                      placeholder="Search owner or action…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-8 text-xs w-48 bg-background border-border pl-7"
                    />
                    <Users className="absolute left-2 top-2 w-3.5 h-3.5 text-muted-foreground" />
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    {(["ALL", "NOW", "THIS_WEEK", "MONITOR"] as const).map((u) => (
                      <Button
                        key={u}
                        size="sm"
                        variant={urgencyFilter === u ? "default" : "outline"}
                        className={cn("h-8 text-xs px-2.5", urgencyFilter !== u && "border-border text-muted-foreground")}
                        onClick={() => setUrgencyFilter(u)}
                      >
                        {u === "ALL" ? "All Urgency" : u === "THIS_WEEK" ? "This Week" : u === "NOW" ? "Act Now" : "Monitor"}
                      </Button>
                    ))}
                  </div>

                  <div className="flex gap-1 flex-wrap">
                    {(["ALL", "WAIVER_STEAL", "BUY_LOW", "TRADE_WINDOW", "SELL_HIGH"] as const).map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant={typeFilter === t ? "default" : "outline"}
                        className={cn("h-8 text-xs px-2.5", typeFilter !== t && "border-border text-muted-foreground")}
                        onClick={() => setTypeFilter(t)}
                      >
                        {t === "ALL" ? "All Types" : OPP_TYPE_CONFIG[t].label}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-lg" />
                  ))
                ) : filteredOpps.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No opportunities match the current filters.</p>
                    {!oppData && (
                      <p className="text-xs mt-1">Sync ESPN data first via Data Center → Refresh.</p>
                    )}
                  </div>
                ) : (
                  filteredOpps.map((opp, idx) => {
                    const urgCfg = URGENCY_CONFIG[opp.urgency];
                    const typCfg = OPP_TYPE_CONFIG[opp.type];
                    const UrgIcon = urgCfg.icon;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "rounded-lg border p-3.5 space-y-2 transition-colors",
                          opp.urgency === "NOW"
                            ? "border-red-500/30 bg-red-500/5"
                            : opp.urgency === "THIS_WEEK"
                            ? "border-orange-500/20 bg-orange-500/5"
                            : "border-border bg-card/50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-xs px-2 py-0.5 border", urgCfg.color)}>
                              <UrgIcon className="w-3 h-3 mr-1" />
                              {urgCfg.label}
                            </Badge>
                            <Badge className={cn("text-xs px-2 py-0.5 border", typCfg.color)}>
                              {typCfg.label}
                            </Badge>
                            <span className="text-xs font-semibold text-foreground">
                              vs {opp.targetOwner}
                            </span>
                          </div>
                          {opp.desperationScore !== undefined && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              Desperation:{" "}
                              <span className="font-bold text-foreground">{opp.desperationScore}</span>
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium text-foreground flex items-start gap-1.5">
                          <ChevronRight className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
                          {opp.action}
                        </p>

                        <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                          {opp.reasoning}
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* League Desperation Pulse (1/3 width) */}
          <div className="space-y-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  League Desperation Pulse
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Most desperate teams are most open to trades and waiver moves.
                </p>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {pulseLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded" />
                  ))
                ) : sortedPulse.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No data — sync ESPN first.
                  </p>
                ) : (
                  sortedPulse.map((team) => (
                    <div key={team.teamId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-4 text-right shrink-0">
                            {team.standingRank}
                          </span>
                          <span className="text-xs font-medium text-foreground truncate">
                            {team.ownerName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {team.wins}-{team.losses}
                          </span>
                          <Badge
                            className={cn(
                              "text-[10px] px-1.5 py-0 border",
                              team.desperationScore >= 70
                                ? "text-red-400 border-red-500/30 bg-red-500/10"
                                : team.desperationScore >= 45
                                ? "text-orange-400 border-orange-500/30 bg-orange-500/10"
                                : team.desperationScore >= 25
                                ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                                : "text-green-400 border-green-500/30 bg-green-500/10"
                            )}
                          >
                            {team.desperationLabel}
                          </Badge>
                        </div>
                      </div>
                      <DesperationBar score={team.desperationScore} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Most active teams this week */}
            {!pulseLoading && sortedPulse.length > 0 && (
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                    Most Active This Week
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[...sortedPulse]
                    .sort((a, b) => b.lastWeekTransactionCount - a.lastWeekTransactionCount)
                    .slice(0, 5)
                    .map((team) => (
                      <div key={team.teamId} className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium truncate">
                          {team.ownerName}
                        </span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {team.lastWeekTransactionCount} move{team.lastWeekTransactionCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
