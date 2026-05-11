// FILE: client/src/pages/ChampionshipEquity.tsx
/**
 * Phase 5 — Championship Equity Dashboard
 * Full report: champ probability, league rankings, variance mode advice.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Shield,
  Activity,
  Target,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Brain,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Minus,
} from "lucide-react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct: number) {
  if (pct >= 25) return "text-emerald-400";
  if (pct >= 12) return "text-yellow-400";
  if (pct >= 5) return "text-orange-400";
  return "text-red-400";
}

function labelColor(label: string) {
  if (label === "Championship Contender") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (label === "Playoff Lock") return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  if (label === "Bubble") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  if (label === "Long Shot") return "bg-orange-500/20 text-orange-300 border-orange-500/30";
  return "bg-red-500/20 text-red-300 border-red-500/30";
}

function resilienceColor(label: string) {
  if (label === "Deep Roster") return "text-emerald-400";
  if (label === "Adequate Depth") return "text-blue-400";
  if (label === "Fragile") return "text-orange-400";
  return "text-red-400";
}

function scheduleColor(label: string) {
  if (label === "Favorable Draw") return "text-emerald-400";
  if (label === "Neutral") return "text-yellow-400";
  return "text-red-400";
}

function uniquenessColor(label: string) {
  if (label === "Highly Unique") return "text-purple-400";
  if (label === "Differentiated") return "text-blue-400";
  if (label === "Chalk") return "text-yellow-400";
  return "text-orange-400";
}

function ScoreBar({ value, max = 100, color = "bg-primary" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta > 1) return (
    <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-bold">
      <ChevronUp className="w-3 h-3" />+{delta.toFixed(1)}%
    </span>
  );
  if (delta < -1) return (
    <span className="flex items-center gap-0.5 text-red-400 text-xs font-bold">
      <ChevronDown className="w-3 h-3" />{delta.toFixed(1)}%
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="w-3 h-3" />~0%
    </span>
  );
}

// ─── Sub-panels ───────────────────────────────────────────────────────────────

function FullReportPanel() {
  const { data, isLoading, error, refetch } = trpc.champ.fullReport.useQuery({ season: 2025, simCount: 2000 });

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
    </div>
  );
  if (error || !data) return (
    <div className="text-center py-12 text-muted-foreground">
      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-400" />
      <p className="text-sm">Championship data unavailable — sync ESPN data first.</p>
    </div>
  );

  const { equity, uniqueness, resilience, playoffSchedule, champEquityScore, champAdvice } = data;

  return (
    <div className="space-y-6">
      {/* Composite score hero */}
      <Card className="card-glow bg-card border-border border-primary/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Championship Equity Score</div>
              <div className={`text-5xl font-black ${pctColor(champEquityScore)}`}>{champEquityScore}<span className="text-2xl text-muted-foreground">/100</span></div>
            </div>
            <div className="text-right space-y-1">
              <Badge variant="outline" className={`text-xs px-2 py-1 ${labelColor(equity.champLabel)}`}>{equity.champLabel}</Badge>
              <div className="text-xs text-muted-foreground">Seed #{equity.projectedSeed} projected</div>
            </div>
          </div>
          <ScoreBar value={champEquityScore} color={champEquityScore >= 50 ? "bg-emerald-500" : champEquityScore >= 25 ? "bg-yellow-500" : "bg-orange-500"} />
          <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-foreground leading-relaxed">{champAdvice}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4 metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Championship probability */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" /> Championship Probability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-black ${pctColor(equity.champProbabilityAbsolute)}`}>{equity.champProbabilityAbsolute.toFixed(1)}%</span>
              <span className="text-xs text-muted-foreground mb-1">absolute</span>
            </div>
            <ScoreBar value={equity.champProbabilityAbsolute} max={50} color="bg-yellow-500" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-muted/50">
                <div className="text-muted-foreground">Playoff %</div>
                <div className="font-bold text-blue-400">{equity.playoffProbability.toFixed(1)}%</div>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <div className="text-muted-foreground">If in playoffs</div>
                <div className="font-bold text-emerald-400">{equity.champProbabilityConditional.toFixed(1)}%</div>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <div className="text-muted-foreground">Expected wins</div>
                <div className="font-bold text-foreground">{equity.expectedWins.toFixed(1)}</div>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <div className="text-muted-foreground">Projected seed</div>
                <div className="font-bold text-foreground">#{equity.projectedSeed}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Roster uniqueness */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-400" /> Roster Uniqueness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-black ${uniquenessColor(uniqueness.uniquenessLabel)}`}>{uniqueness.uniquenessScore}<span className="text-base">/100</span></span>
              <Badge variant="outline" className="text-[10px] mb-1">{uniqueness.uniquenessLabel}</Badge>
            </div>
            <ScoreBar value={uniqueness.uniquenessScore} color="bg-purple-500" />
            <div className="text-xs text-muted-foreground">
              Equity multiplier: <span className={`font-bold ${uniqueness.uniquenessMultiplier >= 1 ? "text-emerald-400" : "text-orange-400"}`}>{uniqueness.uniquenessMultiplier.toFixed(2)}×</span>
            </div>
            {uniqueness.uniquePlayers.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Unique to your roster</div>
                <div className="flex flex-wrap gap-1">
                  {uniqueness.uniquePlayers.slice(0, 4).map(p => (
                    <Badge key={p} variant="outline" className="text-[9px] bg-purple-500/10 text-purple-300 border-purple-500/30">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Injury resilience */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" /> Injury Resilience
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-black ${resilienceColor(resilience.resilienceLabel)}`}>{resilience.resilienceScore}<span className="text-base">/100</span></span>
              <Badge variant="outline" className="text-[10px] mb-1">{resilience.resilienceLabel}</Badge>
            </div>
            <ScoreBar value={resilience.resilienceScore} color="bg-blue-500" />
            <div className="text-xs text-muted-foreground">
              Worst-case loss: <span className="font-bold text-orange-400">−{resilience.worstCaseLoss.toFixed(1)} pts/wk</span>
            </div>
            <div className="space-y-1">
              {Object.entries(resilience.backupDepth).slice(0, 3).map(([pos, depth]) => (
                <div key={pos} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{depth.starter}</span>
                  <span className={depth.dropoff > 10 ? "text-red-400" : "text-emerald-400"}>
                    {depth.backup ? `→ ${depth.backup}` : "No backup"} (−{depth.dropoff.toFixed(0)})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Playoff schedule */}
        <Card className="card-glow bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-400" /> Playoff Schedule (Wks 14–17)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={`text-3xl font-black ${scheduleColor(playoffSchedule.playoffScheduleLabel)}`}>{playoffSchedule.playoffScheduleScore.toFixed(0)}<span className="text-base">/100</span></span>
              <Badge variant="outline" className="text-[10px] mb-1">{playoffSchedule.playoffScheduleLabel}</Badge>
            </div>
            <ScoreBar value={100 - playoffSchedule.playoffScheduleScore} color="bg-orange-500" />
            <div className="space-y-1">
              {playoffSchedule.playoffWeeks.map(wk => (
                <div key={wk.week} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Wk {wk.week} vs {wk.opponentOwner.split(" ")[0]}</span>
                  <Badge variant="outline" className={`text-[9px] ${wk.difficultyLabel === "Easy" ? "text-emerald-400 border-emerald-500/30" : wk.difficultyLabel === "Hard" ? "text-red-400 border-red-500/30" : "text-yellow-400 border-yellow-500/30"}`}>
                    {wk.difficultyLabel}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs gap-1.5">
          <RefreshCw className="w-3 h-3" /> Re-simulate
        </Button>
      </div>
    </div>
  );
}

function LeagueRankingsPanel() {
  const { data, isLoading, error } = trpc.champ.leagueRankings.useQuery({ season: 2025 });

  if (isLoading) return <div className="space-y-2">{[...Array(14)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error || !data) return (
    <div className="text-center py-12 text-muted-foreground">
      <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-400" />
      <p className="text-sm">Rankings unavailable — sync ESPN data first.</p>
    </div>
  );

  const sorted = [...data].sort((a, b) => b.champProbabilityAbsolute - a.champProbabilityAbsolute);
  const maxChamp = Math.max(...sorted.map(t => t.champProbabilityAbsolute), 1);

  return (
    <div className="space-y-4">
      <Card className="card-glow bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            League Championship Probability Rankings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.map((team, idx) => (
            <div
              key={team.teamId}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                (team as any).isRod
                  ? "bg-primary/10 border-primary/30"
                  : "bg-muted/30 border-border hover:bg-muted/50"
              }`}
            >
              <span className="text-xs font-bold text-muted-foreground w-5 text-center">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${(team as any).isRod ? "text-primary" : "text-foreground"}`}>
                    {team.ownerName}
                    {(team as any).isRod && <Badge className="ml-1.5 text-[9px] px-1 py-0 h-3.5 espn-gradient text-white border-0">YOU</Badge>}
                  </span>
                  <Badge variant="outline" className={`text-[9px] px-1.5 ${labelColor(team.champLabel)}`}>{team.champLabel}</Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${(team as any).isRod ? "bg-primary" : "bg-blue-500"}`}
                      style={{ width: `${(team.champProbabilityAbsolute / maxChamp) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-sm font-bold ${pctColor(team.champProbabilityAbsolute)}`}>
                  {team.champProbabilityAbsolute.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">playoff: {team.playoffProbability.toFixed(0)}%</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function VarianceModePanel() {
  const [advice, setAdvice] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const mutation = trpc.champ.varianceModeAdvice.useMutation({
    onSuccess: (data) => setAdvice(typeof data.advice === 'string' ? data.advice : null),
    onError: () => toast.error("Failed to generate variance mode advice"),
  });

  return (
    <div className="space-y-4">
      <Card className="card-glow bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            Variance Mode Advisor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The AI analyzes your championship equity report and answers the single most important question:
            given your current probability, should you play it safe or swing for variance? Optionally add a specific question.
          </p>
          <textarea
            className="w-full h-20 rounded-lg bg-muted border border-border text-sm p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
            placeholder="Optional: ask a specific question, e.g. 'Should I trade Gibbs for a WR1?'"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button
            onClick={() => mutation.mutate({ season: 2025, specificQuestion: question || undefined })}
            disabled={mutation.isPending}
            className="w-full espn-gradient text-white border-0 gap-2"
          >
            {mutation.isPending ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Analyzing championship equity…</>
            ) : (
              <><Brain className="w-4 h-4" /> Get Variance Mode Advice</>
            )}
          </Button>
          {advice && (
            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <Brain className="w-3.5 h-3.5" /> Variance Mode Verdict
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{advice}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChampionshipEquity() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Championship Equity Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Phase 5 — Optimizing for the right target: championship probability, not weekly points.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-300 border-yellow-500/30">
          Phase 5
        </Badge>
      </div>

      <Tabs defaultValue="full-report">
        <TabsList className="bg-card border border-border h-9 p-1 gap-0.5">
          {[
            { value: "full-report", label: "Full Report" },
            { value: "league-rankings", label: "League Rankings" },
            { value: "variance-mode", label: "Variance Mode Advice" },
          ].map(tab => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="text-xs font-medium px-3 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="full-report" className="mt-4">
          <FullReportPanel />
        </TabsContent>
        <TabsContent value="league-rankings" className="mt-4">
          <LeagueRankingsPanel />
        </TabsContent>
        <TabsContent value="variance-mode" className="mt-4">
          <VarianceModePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
