import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, Target, AlertTriangle, TrendingUp, TrendingDown,
  Zap, Shield, Activity, ChevronDown, ChevronUp, Search,
  Trophy, Clock, Users, BarChart2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types (mirrors server) ───────────────────────────────────────────────────

interface RodOpportunity {
  type: string;
  targetTeamId: number;
  targetOwner: string;
  action: string;
  urgency: "NOW" | "THIS_WEEK" | "MONITOR";
  reasoning: string;
  desperationScore?: number;
  exploitabilityScore?: number;
}

interface TeamAssessment {
  teamId: number;
  ownerName: string;
  teamName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  standingRank: number;
  playoffProbability: number;
  rosterHealthScore: number;
  positionalGaps: string[];
  gmArchetype: string;
  exploitabilityScore: number;
  desperationScore: number;
  desperationLabel: string;
  tiltLabel: string;
  tradeWindowStatus: string;
  lastWeekSummary: string;
  theirRecommendations: { priority: string; category: string; action: string; reasoning: string }[];
  rodOpportunities: RodOpportunity[];
  aiGMBriefing: string;
  week: number;
}

// ─── Helper components ────────────────────────────────────────────────────────

function DesperationBadge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 70 ? "bg-red-500/20 text-red-400 border-red-500/30" :
    score >= 45 ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
    score >= 25 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-slate-500/20 text-slate-400 border-slate-500/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {score >= 70 && <Zap className="w-3 h-3" />}
      {label} {score}/100
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, string> = {
    NOW: "bg-red-500/20 text-red-400 border-red-500/30",
    THIS_WEEK: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    MONITOR: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[urgency] ?? map.MONITOR}`}>
      {urgency === "NOW" && <AlertTriangle className="w-3 h-3 mr-1" />}
      {urgency}
    </span>
  );
}

function HealthBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{score}</span>
    </div>
  );
}

function TeamCard({ team, isRod }: { team: TeamAssessment; isRod: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`bg-slate-800/60 border-slate-700/50 hover:border-slate-600/70 transition-colors ${isRod ? "border-orange-500/40" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 text-sm font-mono">#{team.standingRank}</span>
              <CardTitle className="text-sm text-slate-100 truncate">{team.ownerName}</CardTitle>
              {isRod && <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">YOU</Badge>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{team.teamName}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold text-slate-100">{team.wins}–{team.losses}</div>
            <div className="text-xs text-slate-500">{team.pointsFor.toFixed(0)} pts</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Key metrics row */}
        <div className="flex flex-wrap gap-2">
          <DesperationBadge score={team.desperationScore} label={team.desperationLabel} />
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
            team.tradeWindowStatus === "OPEN"
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-slate-500/20 text-slate-400 border-slate-500/30"
          }`}>
            {team.tradeWindowStatus === "OPEN" ? "🟢 Trade Window Open" : "🔴 Window Closed"}
          </span>
        </div>

        {/* Roster health */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Roster Health</span>
            <span>{team.gmArchetype}</span>
          </div>
          <HealthBar score={team.rosterHealthScore} />
        </div>

        {/* Last week summary */}
        {team.lastWeekSummary && (
          <p className="text-xs text-slate-400 leading-relaxed">{team.lastWeekSummary}</p>
        )}

        {/* Rod opportunities */}
        {!isRod && team.rodOpportunities.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-orange-400 flex items-center gap-1">
              <Target className="w-3 h-3" /> Rod's Opportunities
            </div>
            {team.rodOpportunities.slice(0, expanded ? undefined : 1).map((opp, i) => (
              <div key={i} className="bg-slate-900/50 rounded p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <UrgencyBadge urgency={opp.urgency} />
                  <span className="text-xs text-slate-500">{opp.type.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-slate-300">{opp.action}</p>
                {expanded && <p className="text-xs text-slate-500 italic">{opp.reasoning}</p>}
              </div>
            ))}
          </div>
        )}

        {/* AI Briefing */}
        {expanded && team.aiGMBriefing && (
          <div className="bg-slate-900/50 rounded p-3 border border-slate-700/40">
            <div className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-1">
              <Activity className="w-3 h-3" /> GM Briefing
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{team.aiGMBriefing}</p>
          </div>
        )}

        {/* Positional gaps */}
        {expanded && team.positionalGaps.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Positional Gaps</div>
            <div className="flex flex-wrap gap-1">
              {team.positionalGaps.map((gap, i) => (
                <span key={i} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">
                  {gap}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Their recommendations */}
        {expanded && team.theirRecommendations.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">Their Recommended Moves</div>
            <div className="space-y-1">
              {team.theirRecommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${
                    rec.priority === "URGENT" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                    rec.priority === "HIGH" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                    "bg-slate-500/20 text-slate-400 border-slate-500/30"
                  }`}>{rec.priority}</span>
                  <p className="text-xs text-slate-300">{rec.action}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="w-full h-6 text-xs text-slate-500 hover:text-slate-300"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? <><ChevronUp className="w-3 h-3 mr-1" /> Less</> : <><ChevronDown className="w-3 h-3 mr-1" /> Full Briefing</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Opportunity Board ────────────────────────────────────────────────────────

function OpportunityBoard({ opportunities }: { opportunities: RodOpportunity[] }) {
  if (opportunities.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-8">No opportunities identified this week.</p>;
  }
  return (
    <div className="space-y-3">
      {opportunities.map((opp, i) => (
        <Card key={i} className={`bg-slate-800/60 border-slate-700/50 ${opp.urgency === "NOW" ? "border-red-500/40" : ""}`}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <UrgencyBadge urgency={opp.urgency} />
                <span className="text-xs text-slate-500">{opp.type.replace(/_/g, " ")}</span>
              </div>
              <span className="text-xs text-slate-500 shrink-0">{opp.targetOwner}</span>
            </div>
            <p className="text-sm text-slate-200 font-medium mb-1">{opp.action}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{opp.reasoning}</p>
            {(opp.desperationScore !== undefined || opp.exploitabilityScore !== undefined) && (
              <div className="flex gap-3 mt-2">
                {opp.desperationScore !== undefined && (
                  <span className="text-xs text-slate-500">Desperation: <span className="text-orange-400">{opp.desperationScore}/100</span></span>
                )}
                {opp.exploitabilityScore !== undefined && (
                  <span className="text-xs text-slate-500">Exploitability: <span className="text-orange-400">{opp.exploitabilityScore}/100</span></span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── League Pulse ─────────────────────────────────────────────────────────────

function LeaguePulse({ season }: { season: number }) {
  const { data, isLoading } = trpc.weeklyAssessment.leaguePulse.useQuery({ season });

  if (isLoading) return (
    <div className="space-y-2">
      {Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
  if (!data) return <p className="text-slate-500 text-sm text-center py-8">No data available.</p>;

  return (
    <div className="space-y-2">
      <div className="text-xs text-slate-500 mb-3">Week {data.week} — {data.teams.length} teams</div>
      {data.teams.map(team => (
        <div key={team.teamId} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/40">
          <span className="text-slate-500 text-xs font-mono w-5 shrink-0">#{team.standingRank}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-200 truncate">{team.ownerName}</span>
              <span className="text-xs text-slate-500">{team.wins}–{team.losses}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${team.desperationScore >= 70 ? "bg-red-500" : team.desperationScore >= 45 ? "bg-orange-500" : "bg-slate-500"}`}
                  style={{ width: `${team.desperationScore}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-20 shrink-0">{team.desperationLabel}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-slate-400">{team.pointsFor.toFixed(0)} pts</div>
            <div className="text-xs text-slate-500">{team.playoffProbability}% playoff</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WeeklyIntelligence() {
  const [season] = useState(2025);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"standing" | "desperation" | "exploitability">("standing");
  const [forceRefresh, setForceRefresh] = useState(false);
  const [activeTab, setActiveTab] = useState("teams");

  const { data, isLoading, refetch } = trpc.weeklyAssessment.fullReport.useQuery(
    { season, forceRefresh },
    { staleTime: 30 * 60 * 1000 }
  );

  const handleRefresh = () => {
    setForceRefresh(true);
    refetch().then(() => {
      setForceRefresh(false);
      toast.success("Weekly report refreshed");
    });
  };

  const rodTeamId = data?.rodTeamId ?? null;

  const filteredTeams = useMemo(() => {
    if (!data?.teams) return [];
    let teams = [...data.teams];
    if (search) {
      const q = search.toLowerCase();
      teams = teams.filter(t => t.ownerName.toLowerCase().includes(q) || t.teamName.toLowerCase().includes(q));
    }
    if (sortBy === "standing") teams.sort((a, b) => a.standingRank - b.standingRank);
    else if (sortBy === "desperation") teams.sort((a, b) => b.desperationScore - a.desperationScore);
    else if (sortBy === "exploitability") teams.sort((a, b) => b.exploitabilityScore - a.exploitabilityScore);
    return teams;
  }, [data?.teams, search, sortBy]);

  return (
    <AppLayout title="Weekly Intelligence" subtitle={`Season ${season} — Week ${data?.week ?? "…"} GM Briefing`}>
      <div className="space-y-4">

        {/* Header controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {data && (
              <span className="text-xs text-slate-500">
                Generated {new Date(data.generatedAt).toLocaleString()}
                {data.fromCache && " (cached)"}
              </span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "Generating…" : "Refresh Report"}
          </Button>
        </div>

        {/* League summary */}
        {data?.leagueSummary && (
          <Card className="bg-slate-800/60 border-orange-500/20">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <BarChart2 className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-medium text-orange-400">League Executive Summary</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{data.leagueSummary}</p>
            </CardContent>
          </Card>
        )}

        {/* Summary stats */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Teams Assessed", value: data.teams.length, icon: Users },
              { label: "Week", value: data.week, icon: Clock },
              { label: "Open Trade Windows", value: data.teams.filter(t => t.tradeWindowStatus === "OPEN").length, icon: TrendingUp },
              { label: "Top Opportunities", value: data.topOpportunities.length, icon: Target },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="bg-slate-800/40 border-slate-700/40">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <div>
                      <div className="text-lg font-bold text-slate-100">{value}</div>
                      <div className="text-xs text-slate-500">{label}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/60 border border-slate-700/40">
            <TabsTrigger value="teams" className="text-xs gap-1.5">
              <Users className="w-3.5 h-3.5" /> All Teams
            </TabsTrigger>
            <TabsTrigger value="opportunities" className="text-xs gap-1.5">
              <Target className="w-3.5 h-3.5" /> Rod's Opportunities
            </TabsTrigger>
            <TabsTrigger value="pulse" className="text-xs gap-1.5">
              <Activity className="w-3.5 h-3.5" /> League Pulse
            </TabsTrigger>
          </TabsList>

          {/* ── All Teams tab ── */}
          <TabsContent value="teams" className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <Input
                  placeholder="Search owner or team…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-800/60 border-slate-700/40"
                />
              </div>
              <div className="flex gap-1">
                {(["standing", "desperation", "exploitability"] as const).map(s => (
                  <Button
                    key={s}
                    variant={sortBy === s ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs capitalize"
                    onClick={() => setSortBy(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 14 }).map((_, i) => (
                  <Card key={i} className="bg-slate-800/40 border-slate-700/40">
                    <CardContent className="pt-4 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredTeams.map(team => (
                  <TeamCard key={team.teamId} team={team} isRod={team.teamId === rodTeamId} />
                ))}
                {filteredTeams.length === 0 && (
                  <p className="text-slate-500 text-sm col-span-full text-center py-8">No teams match your search.</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── Opportunities tab ── */}
          <TabsContent value="opportunities" className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : (
              <OpportunityBoard opportunities={data?.topOpportunities ?? []} />
            )}
          </TabsContent>

          {/* ── League Pulse tab ── */}
          <TabsContent value="pulse" className="mt-4">
            <LeaguePulse season={season} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
