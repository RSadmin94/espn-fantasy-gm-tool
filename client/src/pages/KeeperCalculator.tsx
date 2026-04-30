import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Trophy,
  Calendar,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Users,
  ShieldAlert,
  Target,
  Zap,
  Eye,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";

// ── helpers ────────────────────────────────────────────────────────────────

const POSITION_COLORS: Record<string, string> = {
  QB:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  RB:  "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  TE:  "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K:   "bg-gray-500/20 text-gray-300 border-gray-500/30",
  DEF: "bg-red-500/20 text-red-300 border-red-500/30",
};

const VALUE_CONFIG: Record<string, { color: string; icon: React.ReactNode; bg: string }> = {
  elite:      { color: "text-emerald-400", icon: <Star className="w-3 h-3" />, bg: "bg-emerald-500/10 border-emerald-500/30" },
  good:       { color: "text-blue-400",    icon: <TrendingUp className="w-3 h-3" />, bg: "bg-blue-500/10 border-blue-500/30" },
  fair:       { color: "text-yellow-400",  icon: <Minus className="w-3 h-3" />, bg: "bg-yellow-500/10 border-yellow-500/30" },
  poor:       { color: "text-red-400",     icon: <TrendingDown className="w-3 h-3" />, bg: "bg-red-500/10 border-red-500/30" },
  ineligible: { color: "text-red-500",     icon: <XCircle className="w-3 h-3" />, bg: "bg-red-500/10 border-red-500/40" },
};

const THREAT_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: "CRITICAL", color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/40" },
  high:     { label: "HIGH",     color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/40" },
  medium:   { label: "MEDIUM",   color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/40" },
  low:      { label: "LOW",      color: "text-slate-400",  bg: "bg-slate-500/10",  border: "border-slate-500/40" },
};

function PlayerRow({
  player,
}: {
  player: {
    playerName: string;
    position: string;
    round2025: number;
    round2024: number | null;
    roundCost2026: number | null;
    consecutiveYears: number;
    isIneligible: boolean;
    valueTier: string;
    valueLabel: string;
  };
}) {
  const posClass = POSITION_COLORS[player.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
  const valCfg = VALUE_CONFIG[player.valueTier] ?? VALUE_CONFIG.fair;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        player.isIneligible
          ? "bg-red-500/5 border-red-500/20"
          : "bg-card/50 border-border/50 hover:bg-accent/20"
      }`}
    >
      <div className="flex-shrink-0">
        {player.isIneligible ? (
          <XCircle className="w-5 h-5 text-red-500" />
        ) : (
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold text-sm truncate ${player.isIneligible ? "text-red-300 line-through opacity-60" : "text-foreground"}`}>
            {player.playerName}
          </span>
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 flex-shrink-0 ${posClass}`}>
            {player.position || "?"}
          </Badge>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {player.isIneligible ? (
            <span className="text-red-400 font-medium">
              Kept in 2024 (Rd {player.round2024}) + 2025 (Rd {player.round2025}) — 2-year limit reached
            </span>
          ) : (
            <span>Kept in 2025 (Rd {player.round2025}) — Year {player.consecutiveYears} of 2</span>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        {player.isIneligible ? (
          <div className="text-xs font-bold text-red-500 uppercase tracking-wide">Must Return</div>
        ) : (
          <>
            <div className="text-lg font-bold text-primary leading-none">Rd {player.roundCost2026}</div>
            <div className="text-[10px] text-muted-foreground">2026 cost</div>
          </>
        )}
      </div>
      {!player.isIneligible && (
        <div className="flex-shrink-0">
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 flex items-center gap-1 ${valCfg.bg} ${valCfg.color}`}>
            {valCfg.icon}
            {player.valueLabel}
          </Badge>
        </div>
      )}
    </div>
  );
}

// ── Competitor Intelligence Tab ────────────────────────────────────────────

type CompetitorConstraint = {
  teamId: number;
  teamName: string;
  overallThreat: string;
  constraints: Array<{
    playerName: string;
    position: string;
    positionTier: string;
    round2024: number | null;
    round2025: number;
    replacementRound: number;
    threatLevel: string;
    draftAdvantage: string;
    yourOpportunity: string;
  }>;
};

type ReturningByPosition = Record<string, Array<{ playerName: string; teamName: string; round2025: number }>>;

function CompetitorIntelTab({
  constraints,
  returningByPosition,
  keyInsight,
}: {
  constraints: CompetitorConstraint[];
  returningByPosition: ReturningByPosition;
  keyInsight: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (constraints.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <div className="font-medium">No competitor constraints detected</div>
        <div className="text-xs mt-1">All league teams have eligible keepers for 2026</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Key Insight Banner */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-3">
            <Zap className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-xs font-semibold text-blue-300 mb-0.5">Draft Intelligence Summary</div>
              <div className="text-xs text-blue-200/80">{keyInsight}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Returning Players by Position */}
      {Object.keys(returningByPosition).length > 0 && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-400">
              <Target className="w-4 h-4" />
              Players Returning to the Draft Pool — Target These
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(returningByPosition).map(([pos, players]) => {
                const posClass = POSITION_COLORS[pos] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
                return (
                  <div key={pos} className="bg-slate-900/40 border border-slate-700/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${posClass}`}>{pos}</Badge>
                      <span className="text-xs text-muted-foreground">{players.length} player{players.length > 1 ? "s" : ""} returning</span>
                    </div>
                    {players.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                        <span className="font-semibold text-foreground">{p.playerName}</span>
                        <span className="text-muted-foreground text-[10px]">was Rd {p.round2025} · {p.teamName}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Team Constraint Cards */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Teams With Forced Replacement Needs
        </h3>
        <div className="space-y-3">
          {constraints.map((team) => {
            const threat = THREAT_CONFIG[team.overallThreat] ?? THREAT_CONFIG.medium;
            const isExpanded = expanded === team.teamId;
            return (
              <Card
                key={team.teamId}
                className={`border transition-all cursor-pointer ${threat.border} ${threat.bg}`}
                onClick={() => setExpanded(isExpanded ? null : team.teamId)}
              >
                <CardContent className="py-3 px-4">
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ShieldAlert className={`w-4 h-4 flex-shrink-0 ${threat.color}`} />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">{team.teamName}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {team.constraints.length} ineligible player{team.constraints.length > 1 ? "s" : ""} —
                          must draft {team.constraints.map(c => `${c.positionTier} in Rd ${c.replacementRound}`).join(", ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className={`text-[9px] px-1.5 font-bold ${threat.color} ${threat.border}`}>
                        {threat.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border/40 space-y-3">
                      {team.constraints.map((c, i) => {
                        const ct = THREAT_CONFIG[c.threatLevel] ?? THREAT_CONFIG.medium;
                        const posClass = POSITION_COLORS[c.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
                        return (
                          <div key={i} className="bg-slate-900/40 rounded-lg p-3 space-y-2">
                            {/* Player row */}
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                              <span className="font-semibold text-sm text-red-300">{c.playerName}</span>
                              <Badge variant="outline" className={`text-[9px] px-1.5 ${posClass}`}>{c.position}</Badge>
                              <Badge variant="outline" className={`text-[9px] px-1.5 font-bold ml-auto ${ct.color} ${ct.border}`}>
                                {ct.label}
                              </Badge>
                            </div>
                            {/* History */}
                            <div className="text-[10px] text-muted-foreground">
                              Kept Rd {c.round2024} (2024) → Rd {c.round2025} (2025) — 2-year limit reached
                            </div>
                            {/* Constraint */}
                            <div className="flex items-start gap-2 bg-slate-800/40 rounded p-2">
                              <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="text-[10px] font-semibold text-orange-300 mb-0.5">Their Constraint</div>
                                <div className="text-[10px] text-slate-400">{c.draftAdvantage}</div>
                              </div>
                            </div>
                            {/* Your opportunity */}
                            <div className="flex items-start gap-2 bg-emerald-900/20 rounded p-2">
                              <Target className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <div className="text-[10px] font-semibold text-emerald-300 mb-0.5">Your Opportunity</div>
                                <div className="text-[10px] text-slate-400">{c.yourOpportunity}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────

export default function KeeperCalculator() {
  const { data, isLoading, error } = trpc.espn.keeperEligibility2026.useQuery();

  const daysUntilDeadline = () => {
    const deadline = new Date("2026-08-18T00:00:00");
    const now = new Date();
    const diff = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const days = daysUntilDeadline();

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              2026 Keeper Eligibility Calculator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              2-consecutive-year rule enforced · Round cost = kept round − 1 · Deadline: August 18, 2026
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold ${
              days <= 30 ? "bg-red-500/10 border-red-500/30 text-red-400"
              : days <= 60 ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}>
              <Calendar className="w-4 h-4" />
              {days > 0 ? `${days} days until deadline` : "Deadline passed"}
            </div>
          </div>
        </div>

        {/* ── Rule Banner ── */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-200/80 leading-relaxed">
                <strong className="text-amber-300">Keeper Rule:</strong> Each team may keep 1 player per season.
                A player may be kept for a maximum of <strong className="text-amber-300">2 consecutive seasons</strong>.
                After being kept in both 2024 and 2025, the player must return to the draft pool for 2026.
                The round cost to keep a player is <strong className="text-amber-300">1 round earlier</strong> than the round they were drafted/kept the previous season.
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-card border-border">
                <CardHeader className="pb-3"><Skeleton className="h-5 w-40" /></CardHeader>
                <CardContent className="space-y-2"><Skeleton className="h-16 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="py-4">
              <p className="text-red-400 text-sm">Failed to load keeper eligibility data. Please refresh the page.</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* ── League Summary Stats ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-card border-border">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Teams</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{data.teams.length}</div>
                  <div className="text-xs text-muted-foreground">in the league</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Ineligible</span>
                  </div>
                  <div className="text-2xl font-bold text-red-400">{data.leagueSummary.totalIneligible}</div>
                  <div className="text-xs text-muted-foreground">must return to pool</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Eligible</span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">{data.leagueSummary.totalEligible}</div>
                  <div className="text-xs text-muted-foreground">can be kept in 2026</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardContent className="py-4 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-orange-400" />
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">Constrained Teams</span>
                  </div>
                  <div className="text-2xl font-bold text-orange-400">
                    {data.competitorIntelligence?.constraints.length ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground">forced replacements</div>
                </CardContent>
              </Card>
            </div>

            {/* ── Tabs ── */}
            <Tabs defaultValue="eligibility">
              <TabsList className="bg-slate-800/60 border border-slate-700/40">
                <TabsTrigger value="eligibility" className="data-[state=active]:bg-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Eligibility
                </TabsTrigger>
                <TabsTrigger value="intel" className="data-[state=active]:bg-slate-700">
                  <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                  Competitor Intel
                  {(data.competitorIntelligence?.constraints.filter(c => c.overallThreat === "critical").length ?? 0) > 0 && (
                    <Badge className="ml-1.5 text-[8px] px-1 py-0 h-3.5 bg-red-600 text-white border-0">
                      {data.competitorIntelligence?.constraints.filter(c => c.overallThreat === "critical").length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="top-value" className="data-[state=active]:bg-slate-700">
                  <Trophy className="w-3.5 h-3.5 mr-1.5" />
                  Top Value
                </TabsTrigger>
              </TabsList>

              {/* ── Eligibility Tab ── */}
              <TabsContent value="eligibility" className="mt-4 space-y-4">
                {/* Ineligible alert */}
                {data.leagueSummary.ineligiblePlayers.length > 0 && (
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-400">
                        <XCircle className="w-4 h-4" />
                        Players Hitting the 2-Year Limit — Must Return to Draft Pool
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.leagueSummary.ineligiblePlayers.map((p, i) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-red-300 truncate">{p.playerName}</div>
                              <div className="text-[10px] text-red-400/70">
                                {p.teamName} · Kept Rd {p.round2024} (2024) + Rd {p.round2025} (2025)
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[9px] px-1.5 border-red-500/40 text-red-400 flex-shrink-0">
                              {p.position}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Per-team cards */}
                <div>
                  <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    All 14 Teams — 2026 Keeper Eligibility
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {data.teams
                      .sort((a, b) => a.teamName.localeCompare(b.teamName))
                      .map(team => (
                        <Card
                          key={team.teamId}
                          className={`bg-card border-border transition-all ${
                            team.teamName?.toLowerCase().includes("str8") || team.teamName?.toLowerCase().includes("rod")
                              ? "border-primary/40 ring-1 ring-primary/20"
                              : ""
                          }`}
                        >
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-sm font-semibold text-foreground truncate">
                                  {team.teamName}
                                  {(team.teamName?.toLowerCase().includes("str8") || team.teamName?.toLowerCase().includes("rod")) && (
                                    <Badge className="ml-2 text-[9px] px-1.5 bg-primary/20 text-primary border-primary/30">YOUR TEAM</Badge>
                                  )}
                                </CardTitle>
                              </div>
                              <div className="flex gap-1.5 flex-shrink-0">
                                {team.ineligibleCount > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 bg-red-500/10 text-red-400 border-red-500/30">
                                    {team.ineligibleCount} ineligible
                                  </Badge>
                                )}
                                {team.eligibleCount > 0 && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                    {team.eligibleCount} eligible
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {team.players.length === 0 ? (
                              <div className="text-xs text-muted-foreground italic py-2">No keeper data for 2025</div>
                            ) : (
                              team.players.map((player, idx) => (
                                <PlayerRow key={idx} player={player} />
                              ))
                            )}
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>

                {/* Deadline reminder */}
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-amber-300">
                          Keeper Declaration Deadline: August 18, 2026
                        </div>
                        <div className="text-xs text-amber-200/70 mt-0.5">
                          All teams must submit their 2026 keeper selection by this date. Players not declared will enter the draft pool.
                          The draft is scheduled for <strong className="text-amber-300">August 29, 2026 @ 3:30 PM EDT</strong>.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Competitor Intel Tab ── */}
              <TabsContent value="intel" className="mt-4">
                <CompetitorIntelTab
                  constraints={data.competitorIntelligence?.constraints ?? []}
                  returningByPosition={data.competitorIntelligence?.returningByPosition ?? {}}
                  keyInsight={data.competitorIntelligence?.keyInsight ?? ""}
                />
              </TabsContent>

              {/* ── Top Value Tab ── */}
              <TabsContent value="top-value" className="mt-4">
                {data.leagueSummary.topValueKeepers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">No elite or good value keepers found</div>
                ) : (
                  <Card className="border-emerald-500/20 bg-emerald-500/5">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-400">
                        <Trophy className="w-4 h-4" />
                        Top Value Keepers League-Wide (Elite &amp; Good Value)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Player</th>
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Pos</th>
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Team</th>
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">2025 Round</th>
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">2026 Cost</th>
                              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.leagueSummary.topValueKeepers.map((p, i) => {
                              const valCfg = VALUE_CONFIG[p.valueTier] ?? VALUE_CONFIG.fair;
                              const posClass = POSITION_COLORS[p.position?.toUpperCase()] ?? "bg-gray-500/20 text-gray-300 border-gray-500/30";
                              return (
                                <tr key={i} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                                  <td className="py-2 px-3 font-semibold text-foreground">{p.playerName}</td>
                                  <td className="py-2 px-3">
                                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${posClass}`}>{p.position}</Badge>
                                  </td>
                                  <td className="py-2 px-3 text-muted-foreground truncate max-w-[140px]">{p.teamName}</td>
                                  <td className="py-2 px-3 text-muted-foreground">Rd {p.round2025}</td>
                                  <td className="py-2 px-3 font-bold text-primary">Rd {p.roundCost2026}</td>
                                  <td className="py-2 px-3">
                                    <Badge variant="outline" className={`text-[9px] px-1.5 flex items-center gap-1 w-fit ${valCfg.bg} ${valCfg.color}`}>
                                      {valCfg.icon}
                                      {p.valueLabel}
                                    </Badge>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}
