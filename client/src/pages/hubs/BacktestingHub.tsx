/**
 * client/src/pages/hubs/BacktestingHub.tsx
 *
 * Backtesting & Accuracy Dashboard
 *
 * Tabs:
 *   Overview     — summary accuracy cards + quick-status badges
 *   Start/Sit    — hit-rate gauge, by-position breakdown, decision log
 *   Monte Carlo  — win-probability calibration chart, Brier score
 *   Trades       — trade decision log, verdict breakdown, outcome ratings
 *   Champ Equity — champ % calibration, Rod's prediction history
 *   Log Decision — manual entry forms for each decision type
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  Target,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Clock,
  BarChart2,
  Zap,
  Trophy,
  ArrowLeftRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SEASONS = [2025, 2024, 2023, 2022, 2021, 2020];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function AccuracyGauge({ value, label, size = "md" }: { value: number; label: string; size?: "sm" | "md" | "lg" }) {
  const color =
    value >= 70 ? "text-emerald-400" :
    value >= 55 ? "text-amber-400" :
    value > 0   ? "text-red-400" :
                  "text-zinc-500";
  const sizeClass = size === "lg" ? "text-5xl" : size === "md" ? "text-3xl" : "text-xl";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn("font-bold tabular-nums", sizeClass, color)}>
        {value > 0 ? `${value}%` : "—"}
      </span>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <Badge variant="outline" className="text-zinc-400 border-zinc-600">Pending</Badge>;
  if (outcome === "CORRECT" || outcome === "GREAT" || outcome === "GOOD")
    return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">{outcome}</Badge>;
  if (outcome === "INCORRECT" || outcome === "BAD" || outcome === "TERRIBLE")
    return <Badge className="bg-red-600/20 text-red-400 border-red-600/30">{outcome}</Badge>;
  if (outcome === "PUSH" || outcome === "NEUTRAL" || outcome === "FAIR")
    return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">{outcome}</Badge>;
  return <Badge variant="outline">{outcome}</Badge>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  if (verdict === "WIN") return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">WIN</Badge>;
  if (verdict === "LOSS") return <Badge className="bg-red-600/20 text-red-400 border-red-600/30">LOSS</Badge>;
  return <Badge className="bg-amber-600/20 text-amber-400 border-amber-600/30">FAIR</Badge>;
}

function DecisionBadge({ decision }: { decision: string }) {
  if (decision === "ACCEPTED") return <Badge className="bg-blue-600/20 text-blue-400 border-blue-600/30">ACCEPTED</Badge>;
  if (decision === "REJECTED") return <Badge className="bg-zinc-600/20 text-zinc-400 border-zinc-600/30">REJECTED</Badge>;
  return <Badge variant="outline" className="text-zinc-400">PENDING</Badge>;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ season }: { season: number | undefined }) {
  const { data: summary, isLoading } = trpc.backtest.summary.useQuery({ season });
  const { data: ss } = trpc.backtest.startSitAccuracy.useQuery({ season });
  const { data: mc } = trpc.backtest.monteCarloCalibration.useQuery({ season });
  const { data: td } = trpc.backtest.tradeReport.useQuery({ season });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse bg-zinc-800/40 border-zinc-700/50 h-32" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      icon: <Target className="w-5 h-5 text-blue-400" />,
      title: "Start/Sit Hit Rate",
      value: summary?.startSitHitRate ?? 0,
      sub: `${ss?.correct ?? 0}/${(ss?.correct ?? 0) + (ss?.incorrect ?? 0)} decisive calls`,
      color: "blue",
    },
    {
      icon: <BarChart2 className="w-5 h-5 text-purple-400" />,
      title: "Monte Carlo Accuracy",
      value: summary?.monteCarloAccuracy ?? 0,
      sub: `Brier score: ${summary?.monteCarloBrierScore ?? "—"}`,
      color: "purple",
    },
    {
      icon: <ArrowLeftRight className="w-5 h-5 text-emerald-400" />,
      title: "Trade Win Rate",
      value: summary?.tradeAcceptedWinRate ?? 0,
      sub: `${td?.accepted ?? 0} accepted, ${td?.rejected ?? 0} rejected`,
      color: "emerald",
    },
    {
      icon: <Clock className="w-5 h-5 text-amber-400" />,
      title: "Pending Resolution",
      value: summary?.pendingResolution ?? 0,
      sub: `${summary?.totalDecisionsLogged ?? 0} total logged`,
      color: "amber",
      raw: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title} className="bg-zinc-900/60 border-zinc-700/50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                {c.icon}
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.title}</span>
              </div>
              {c.raw ? (
                <div className="text-3xl font-bold tabular-nums text-amber-400">{c.value}</div>
              ) : (
                <AccuracyGauge value={c.value} label="" size="md" />
              )}
              <p className="text-xs text-muted-foreground mt-2">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Status explanation */}
      <Card className="bg-zinc-900/40 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-300">How Accuracy Is Measured</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-zinc-300 mb-1">Start/Sit Hit Rate</p>
            <p>Percentage of decisive start/sit calls where the recommended player outscored the alternative. Pushes (within 0.5 pts) are excluded from the decisive count.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-300 mb-1">Monte Carlo Accuracy</p>
            <p>Percentage of matchup win-probability predictions where the team predicted to win (≥50%) actually won. Brier score measures calibration — lower is better, 0 is perfect.</p>
          </div>
          <div>
            <p className="font-medium text-zinc-300 mb-1">Trade Win Rate</p>
            <p>Among trades Rod accepted, the percentage where the AI verdict was WIN (received more value than given). Tracks whether Rod acts on favorable valuations.</p>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {(summary?.totalDecisionsLogged ?? 0) === 0 && (
        <Card className="bg-amber-900/20 border-amber-700/40">
          <CardContent className="pt-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-300">No decisions logged yet</p>
              <p className="text-sm text-amber-400/80 mt-1">
                Use the <strong>Log Decision</strong> tab to manually record start/sit calls, trade evaluations, and Monte Carlo predictions. Once the season ends, use the resolve tools to score each decision and compute accuracy metrics.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Start/Sit Tab ────────────────────────────────────────────────────────────

function StartSitTab({ season }: { season: number | undefined }) {
  const { data: acc, isLoading } = trpc.backtest.startSitAccuracy.useQuery({ season });
  const { data: list } = trpc.backtest.startSitList.useQuery({ season });
  const resolveStartSit = trpc.backtest.resolveStartSit.useMutation();
  const autoResolve = trpc.backtest.autoResolveStartSit.useMutation();
  const utils = trpc.useUtils();
  const positionData = useMemo(() => {
    if (!acc?.byPosition) return [];
    return Object.entries(acc.byPosition).map(([pos, stats]) => ({
      position: pos,
      hitRate: stats.hitRate,
      total: stats.total,
      correct: stats.correct,
    }));
  }, [acc?.byPosition]);

  const handleAutoResolve = async () => {
    if (!season) return;
    const currentWeek = 17; // could be dynamic
    const result = await autoResolve.mutateAsync({ season, week: currentWeek });
    toast(`Auto-resolved ${result.resolved} decisions`);
    utils.backtest.startSitAccuracy.invalidate();
    utils.backtest.startSitList.invalidate();
  };

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-800/40 rounded-lg" />;

  return (
    <div className="space-y-6">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Hit Rate", value: acc?.hitRate ?? 0, pct: true, color: "blue" },
          { label: "Hit Rate (w/ Push)", value: acc?.hitRateWithPush ?? 0, pct: true, color: "purple" },
          { label: "Correct", value: acc?.correct ?? 0, pct: false, color: "emerald" },
          { label: "Incorrect", value: acc?.incorrect ?? 0, pct: false, color: "red" },
          { label: "Pending", value: acc?.pending ?? 0, pct: false, color: "amber" },
        ].map((s) => (
          <Card key={s.label} className="bg-zinc-900/60 border-zinc-700/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className={cn(
                "text-2xl font-bold tabular-nums",
                s.color === "blue" ? "text-blue-400" :
                s.color === "purple" ? "text-purple-400" :
                s.color === "emerald" ? "text-emerald-400" :
                s.color === "red" ? "text-red-400" : "text-amber-400"
              )}>
                {s.pct ? (s.value > 0 ? `${s.value}%` : "—") : s.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* By-position chart */}
      {positionData.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-300">Hit Rate by Position</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={positionData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="position" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                  formatter={(v: number) => [`${v}%`, "Hit Rate"]}
                />
                <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 4" />
                <Bar dataKey="hitRate" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Decision log */}
      <Card className="bg-zinc-900/60 border-zinc-700/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-zinc-300">Decision Log</CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={handleAutoResolve}
            disabled={autoResolve.isPending}
          >
            <RefreshCw className={cn("w-3 h-3", autoResolve.isPending && "animate-spin")} />
            Auto-Resolve
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!list || list.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">No start/sit decisions logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700/50 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs">Wk</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Start</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Sit</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Proj</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Actual</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Win%</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((d) => (
                    <TableRow key={d.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                      <TableCell className="text-xs text-zinc-400">{d.week}</TableCell>
                      <TableCell className="text-xs font-medium text-zinc-200">{d.playerAName}</TableCell>
                      <TableCell className="text-xs text-zinc-400">{d.playerBName}</TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {(d.playerAProjection / 100).toFixed(1)} vs {(d.playerBProjection / 100).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {d.playerAActualPoints !== null
                          ? `${(d.playerAActualPoints / 100).toFixed(1)} vs ${((d.playerBActualPoints ?? 0) / 100).toFixed(1)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">{d.winProbabilityA}%</TableCell>
                      <TableCell><OutcomeBadge outcome={d.outcome} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Monte Carlo Tab ──────────────────────────────────────────────────────────

function MonteCarloTab({ season }: { season: number | undefined }) {
  const { data: report, isLoading } = trpc.backtest.monteCarloCalibration.useQuery({ season });
  const { data: list } = trpc.backtest.mcList.useQuery({ season });

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-800/40 rounded-lg" />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Overall Accuracy", value: report?.overallAccuracy ?? 0, pct: true, color: "purple" },
          { label: "Brier Score", value: report?.brierScore ?? 0, pct: false, color: report?.brierScore && report.brierScore < 0.2 ? "emerald" : "amber", note: "lower = better" },
          { label: "Predictions Logged", value: report?.total ?? 0, pct: false, color: "blue" },
          { label: "Pending", value: report?.pending ?? 0, pct: false, color: "amber" },
        ].map((s) => (
          <Card key={s.label} className="bg-zinc-900/60 border-zinc-700/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className={cn(
                "text-2xl font-bold tabular-nums",
                s.color === "purple" ? "text-purple-400" :
                s.color === "emerald" ? "text-emerald-400" :
                s.color === "blue" ? "text-blue-400" : "text-amber-400"
              )}>
                {s.pct ? (s.value > 0 ? `${s.value}%` : "—") : s.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              {s.note && <div className="text-xs text-zinc-500">{s.note}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calibration chart */}
      {report && report.calibrationBuckets.some((b) => b.count > 0) && (
        <Card className="bg-zinc-900/60 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-300">Win Probability Calibration</CardTitle>
            <p className="text-xs text-muted-foreground">
              Bars show actual win rate in each prediction bucket. The diagonal line is perfect calibration.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={report.calibrationBuckets} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="bucket" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                  formatter={(v: number, name: string) => [`${v}%`, name === "actual" ? "Actual Win Rate" : "Predicted"]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                <Bar dataKey="predicted" name="Predicted" fill="#7c3aed" opacity={0.4} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Prediction log */}
      <Card className="bg-zinc-900/60 border-zinc-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-300">Prediction Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!list || list.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">No Monte Carlo predictions logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700/50 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs">Wk</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Team</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Opponent</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Pred Win%</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Proj Score</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Actual</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((d) => {
                    const correct = d.actualWon !== null
                      ? (d.predictedWinPct >= 50 ? d.actualWon === 1 : d.actualWon === 0)
                      : null;
                    return (
                      <TableRow key={d.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                        <TableCell className="text-xs text-zinc-400">{d.week}</TableCell>
                        <TableCell className="text-xs font-medium text-zinc-200">{d.teamName}</TableCell>
                        <TableCell className="text-xs text-zinc-400">{d.opponentName}</TableCell>
                        <TableCell className="text-xs">
                          <span className={d.predictedWinPct >= 60 ? "text-emerald-400" : d.predictedWinPct <= 40 ? "text-red-400" : "text-amber-400"}>
                            {d.predictedWinPct}%
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400">{(d.projectedScore / 100).toFixed(1)}</TableCell>
                        <TableCell className="text-xs text-zinc-400">
                          {d.actualScore !== null
                            ? `${(d.actualScore / 100).toFixed(1)} – ${((d.actualOpponentScore ?? 0) / 100).toFixed(1)}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {correct === null ? (
                            <Badge variant="outline" className="text-zinc-400 border-zinc-600 text-xs">Pending</Badge>
                          ) : correct ? (
                            <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30 text-xs">✓</Badge>
                          ) : (
                            <Badge className="bg-red-600/20 text-red-400 border-red-600/30 text-xs">✗</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Trades Tab ───────────────────────────────────────────────────────────────

function TradesTab({ season }: { season: number | undefined }) {
  const { data: report, isLoading } = trpc.backtest.tradeReport.useQuery({ season });
  const { data: list } = trpc.backtest.tradeList.useQuery({ season });
  const updateTrade = trpc.backtest.updateTrade.useMutation();
  const utils = trpc.useUtils();

  const handleDecision = async (id: number, rodDecision: "ACCEPTED" | "REJECTED") => {
    await updateTrade.mutateAsync({ id, rodDecision });
    toast(`Trade marked as ${rodDecision}`);
    utils.backtest.tradeReport.invalidate();
    utils.backtest.tradeList.invalidate();
  };

  const verdictData = useMemo(() => {
    if (!report?.byVerdict) return [];
    return Object.entries(report.byVerdict).map(([verdict, stats]) => ({
      verdict,
      total: stats.total,
      accepted: stats.accepted,
      rejected: stats.rejected,
    }));
  }, [report?.byVerdict]);

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-800/40 rounded-lg" />;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Evaluated", value: report?.total ?? 0, color: "blue" },
          { label: "Accepted", value: report?.accepted ?? 0, color: "emerald" },
          { label: "Rejected", value: report?.rejected ?? 0, color: "zinc" },
          { label: "Accepted WIN Rate", value: report?.total ? Math.round(((report?.acceptedWins ?? 0) / Math.max(report?.accepted ?? 1, 1)) * 100) : 0, pct: true, color: "purple" },
        ].map((s) => (
          <Card key={s.label} className="bg-zinc-900/60 border-zinc-700/50">
            <CardContent className="pt-4 pb-3 text-center">
              <div className={cn(
                "text-2xl font-bold tabular-nums",
                s.color === "blue" ? "text-blue-400" :
                s.color === "emerald" ? "text-emerald-400" :
                s.color === "purple" ? "text-purple-400" : "text-zinc-400"
              )}>
                {(s as { pct?: boolean }).pct ? (s.value > 0 ? `${s.value}%` : "—") : s.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Verdict breakdown chart */}
      {verdictData.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-300">Decisions by Verdict</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={verdictData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="verdict" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                <Bar dataKey="accepted" name="Accepted" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rejected" name="Rejected" fill="#71717a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Trade log */}
      <Card className="bg-zinc-900/60 border-zinc-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-zinc-300">Trade Decision Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!list || list.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">No trade decisions logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700/50 hover:bg-transparent">
                    <TableHead className="text-zinc-400 text-xs">Wk</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Gave</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Received</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Verdict</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Rod's Call</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Outcome</TableHead>
                    <TableHead className="text-zinc-400 text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((d) => (
                    <TableRow key={d.id} className="border-zinc-800/50 hover:bg-zinc-800/30">
                      <TableCell className="text-xs text-zinc-400">{d.week}</TableCell>
                      <TableCell className="text-xs text-zinc-400 max-w-[120px] truncate">
                        {Array.isArray(d.assetsGiven) ? (d.assetsGiven as string[]).join(", ") : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-200 max-w-[120px] truncate">
                        {Array.isArray(d.assetsReceived) ? (d.assetsReceived as string[]).join(", ") : "—"}
                      </TableCell>
                      <TableCell><VerdictBadge verdict={d.verdict} /></TableCell>
                      <TableCell><DecisionBadge decision={d.rodDecision} /></TableCell>
                      <TableCell><OutcomeBadge outcome={d.outcomeRating} /></TableCell>
                      <TableCell>
                        {d.rodDecision === "PENDING" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2 text-emerald-400 border-emerald-700/50 hover:bg-emerald-900/20"
                              onClick={() => handleDecision(d.id, "ACCEPTED")}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2 text-zinc-400 border-zinc-700/50"
                              onClick={() => handleDecision(d.id, "REJECTED")}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Champ Equity Tab ─────────────────────────────────────────────────────────

function ChampEquityTab({ season }: { season: number | undefined }) {
  const { data: report, isLoading } = trpc.backtest.champEquityReport.useQuery({ season });

  if (isLoading) return <div className="animate-pulse h-64 bg-zinc-800/40 rounded-lg" />;

  const rodData = report?.rodPredictions ?? [];

  return (
    <div className="space-y-6">
      {/* Rod's champ % over time */}
      {rodData.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-300">Rod's Championship % Over Season</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rodData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="week" label={{ value: "Week", position: "insideBottom", fill: "#71717a", fontSize: 11 }} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis domain={[0, 10000]} tickFormatter={(v) => `${(v / 100).toFixed(0)}%`} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                  formatter={(v: number) => [`${(v / 100).toFixed(1)}%`, "Predicted Champ %"]}
                />
                <Line type="monotone" dataKey="predictedChampPct" stroke="#f59e0b" strokeWidth={2} dot={{ fill: "#f59e0b", r: 3 }} name="Predicted Champ %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Calibration */}
      {report && report.champCalibration.some((b) => b.count > 0) && (
        <Card className="bg-zinc-900/60 border-zinc-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-zinc-300">Championship % Calibration</CardTitle>
            <p className="text-xs text-muted-foreground">How often teams in each predicted champ % bucket actually won the championship.</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={report.champCalibration} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="bucket" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} formatter={(v: number) => [`${v}%`]} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
                <Bar dataKey="predicted" name="Predicted" fill="#f59e0b" opacity={0.4} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actualChampRate" name="Actual" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {(report?.total ?? 0) === 0 && (
        <div className="text-center text-muted-foreground py-16 text-sm">
          No championship equity predictions logged yet. Use the Log Decision tab to start tracking.
        </div>
      )}
    </div>
  );
}

// ─── Log Decision Tab ─────────────────────────────────────────────────────────

function LogDecisionTab({ season }: { season: number | undefined }) {
  const [activeForm, setActiveForm] = useState<"startSit" | "trade" | "monteCarlo">("startSit");
  const [week, setWeek] = useState("1");
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const [posA, setPosA] = useState("WR");
  const [projA, setProjA] = useState("");
  const [projB, setProjB] = useState("");
  const [floorA, setFloorA] = useState("");
  const [ceilA, setCeilA] = useState("");
  const [floorB, setFloorB] = useState("");
  const [ceilB, setCeilB] = useState("");
  const [bustA, setBustA] = useState("");
  const [bustB, setBustB] = useState("");
  const [rec, setRec] = useState<"A" | "B" | "TOSS_UP">("A");
  const [winPct, setWinPct] = useState("");

  // Trade form
  const [assetsGiven, setAssetsGiven] = useState("");
  const [assetsReceived, setAssetsReceived] = useState("");
  const [valueGiven, setValueGiven] = useState("");
  const [valueReceived, setValueReceived] = useState("");
  const [verdict, setVerdict] = useState<"WIN" | "FAIR" | "LOSS">("FAIR");
  const [rodDecision, setRodDecision] = useState<"ACCEPTED" | "REJECTED" | "PENDING">("PENDING");

  // MC form
  const [teamName, setTeamName] = useState("");
  const [opponentName, setOpponentName] = useState("");
  const [mcWinPct, setMcWinPct] = useState("");
  const [mcProj, setMcProj] = useState("");
  const [mcFloor, setMcFloor] = useState("");
  const [mcCeil, setMcCeil] = useState("");

  const logStartSit = trpc.backtest.logStartSit.useMutation();
  const logTrade = trpc.backtest.logTrade.useMutation();
  const logMC = trpc.backtest.logMonteCarlo.useMutation();
  const utils = trpc.useUtils();

  const handleLogStartSit = async () => {
    if (!season || !playerA || !playerB) return;
    await logStartSit.mutateAsync({
      season,
      week: parseInt(week),
      playerAName: playerA,
      playerAPosition: posA,
      playerAProjection: Math.round(parseFloat(projA) * 100),
      playerAFloor: Math.round(parseFloat(floorA) * 100),
      playerACeiling: Math.round(parseFloat(ceilA) * 100),
      playerABustPct: parseInt(bustA),
      playerBName: playerB,
      playerBPosition: posA,
      playerBProjection: Math.round(parseFloat(projB) * 100),
      playerBFloor: Math.round(parseFloat(floorB) * 100),
      playerBCeiling: Math.round(parseFloat(ceilB) * 100),
      playerBBustPct: parseInt(bustB),
      recommendation: rec,
      winProbabilityA: parseInt(winPct),
    });
    toast("Start/Sit decision logged");
    utils.backtest.startSitList.invalidate();
    utils.backtest.startSitAccuracy.invalidate();
    utils.backtest.summary.invalidate();
    setPlayerA(""); setPlayerB("");
  };

  const handleLogTrade = async () => {
    if (!season || !assetsGiven || !assetsReceived) return;
    await logTrade.mutateAsync({
      season,
      week: parseInt(week),
      assetsGiven: assetsGiven.split(",").map((s) => s.trim()),
      assetsReceived: assetsReceived.split(",").map((s) => s.trim()),
      valueGiven: Math.round(parseFloat(valueGiven) * 100),
      valueReceived: Math.round(parseFloat(valueReceived) * 100),
      verdict,
      rodDecision,
    });
    toast("Trade decision logged");
    utils.backtest.tradeList.invalidate();
    utils.backtest.tradeReport.invalidate();
    utils.backtest.summary.invalidate();
    setAssetsGiven(""); setAssetsReceived("");
  };

  const handleLogMC = async () => {
    if (!season || !teamName || !opponentName) return;
    await logMC.mutateAsync({
      season,
      week: parseInt(week),
      teamName,
      opponentName,
      predictedWinPct: parseInt(mcWinPct),
      projectedScore: Math.round(parseFloat(mcProj) * 100),
      projectedFloor: Math.round(parseFloat(mcFloor) * 100),
      projectedCeiling: Math.round(parseFloat(mcCeil) * 100),
    });
    toast("Monte Carlo prediction logged");
    utils.backtest.mcList.invalidate();
    utils.backtest.monteCarloCalibration.invalidate();
    utils.backtest.summary.invalidate();
    setTeamName(""); setOpponentName("");
  };

  const inputClass = "w-full bg-zinc-800/60 border border-zinc-700/60 rounded-md px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["startSit", "trade", "monteCarlo"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={activeForm === f ? "default" : "outline"}
            onClick={() => setActiveForm(f)}
            className="text-xs"
          >
            {f === "startSit" ? "Start/Sit" : f === "trade" ? "Trade" : "Monte Carlo"}
          </Button>
        ))}
      </div>

      <Card className="bg-zinc-900/60 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-zinc-300">
            {activeForm === "startSit" ? "Log Start/Sit Decision" : activeForm === "trade" ? "Log Trade Evaluation" : "Log Monte Carlo Prediction"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Week</label>
              <input className={inputClass} type="number" min="1" max="18" value={week} onChange={(e) => setWeek(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Season</label>
              <input className={inputClass} value={season ?? "—"} disabled />
            </div>
          </div>

          {activeForm === "startSit" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">START Player (A)</label>
                  <input className={inputClass} placeholder="e.g. Justin Jefferson" value={playerA} onChange={(e) => setPlayerA(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">SIT Player (B)</label>
                  <input className={inputClass} placeholder="e.g. Davante Adams" value={playerB} onChange={(e) => setPlayerB(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Position</label>
                  <select className={inputClass} value={posA} onChange={(e) => setPosA(e.target.value)}>
                    {["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Proj A</label>
                  <input className={inputClass} type="number" placeholder="14.5" value={projA} onChange={(e) => setProjA(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Proj B</label>
                  <input className={inputClass} type="number" placeholder="12.0" value={projB} onChange={(e) => setProjB(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div><label className="text-xs text-zinc-400 mb-1 block">Floor A</label><input className={inputClass} type="number" value={floorA} onChange={(e) => setFloorA(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Ceil A</label><input className={inputClass} type="number" value={ceilA} onChange={(e) => setCeilA(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Floor B</label><input className={inputClass} type="number" value={floorB} onChange={(e) => setFloorB(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Ceil B</label><input className={inputClass} type="number" value={ceilB} onChange={(e) => setCeilB(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-zinc-400 mb-1 block">Bust% A</label><input className={inputClass} type="number" value={bustA} onChange={(e) => setBustA(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Bust% B</label><input className={inputClass} type="number" value={bustB} onChange={(e) => setBustB(e.target.value)} /></div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Recommendation</label>
                  <select className={inputClass} value={rec} onChange={(e) => setRec(e.target.value as "A" | "B" | "TOSS_UP")}>
                    <option value="A">Start A</option>
                    <option value="B">Start B</option>
                    <option value="TOSS_UP">Toss-Up</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Win Probability A (%)</label>
                <input className={inputClass} type="number" min="0" max="100" placeholder="65" value={winPct} onChange={(e) => setWinPct(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleLogStartSit} disabled={logStartSit.isPending || !playerA || !playerB}>
                {logStartSit.isPending ? "Logging..." : "Log Start/Sit Decision"}
              </Button>
            </>
          )}

          {activeForm === "trade" && (
            <>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Assets Given (comma-separated)</label>
                <input className={inputClass} placeholder="e.g. Ja'Marr Chase, 2026 R1" value={assetsGiven} onChange={(e) => setAssetsGiven(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Assets Received (comma-separated)</label>
                <input className={inputClass} placeholder="e.g. CeeDee Lamb, 2026 R2" value={assetsReceived} onChange={(e) => setAssetsReceived(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-400 mb-1 block">Value Given</label><input className={inputClass} type="number" placeholder="85" value={valueGiven} onChange={(e) => setValueGiven(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Value Received</label><input className={inputClass} type="number" placeholder="90" value={valueReceived} onChange={(e) => setValueReceived(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">AI Verdict</label>
                  <select className={inputClass} value={verdict} onChange={(e) => setVerdict(e.target.value as "WIN" | "FAIR" | "LOSS")}>
                    <option value="WIN">WIN (received more)</option>
                    <option value="FAIR">FAIR</option>
                    <option value="LOSS">LOSS (gave more)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Rod's Decision</label>
                  <select className={inputClass} value={rodDecision} onChange={(e) => setRodDecision(e.target.value as "ACCEPTED" | "REJECTED" | "PENDING")}>
                    <option value="PENDING">Pending</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
              </div>
              <Button className="w-full" onClick={handleLogTrade} disabled={logTrade.isPending || !assetsGiven || !assetsReceived}>
                {logTrade.isPending ? "Logging..." : "Log Trade Decision"}
              </Button>
            </>
          )}

          {activeForm === "monteCarlo" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-400 mb-1 block">My Team</label><input className={inputClass} placeholder="Atlantas" value={teamName} onChange={(e) => setTeamName(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Opponent</label><input className={inputClass} placeholder="Jan Graham" value={opponentName} onChange={(e) => setOpponentName(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-400 mb-1 block">Predicted Win %</label><input className={inputClass} type="number" min="0" max="100" placeholder="68" value={mcWinPct} onChange={(e) => setMcWinPct(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Projected Score</label><input className={inputClass} type="number" placeholder="118.5" value={mcProj} onChange={(e) => setMcProj(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-zinc-400 mb-1 block">Floor</label><input className={inputClass} type="number" placeholder="98" value={mcFloor} onChange={(e) => setMcFloor(e.target.value)} /></div>
                <div><label className="text-xs text-zinc-400 mb-1 block">Ceiling</label><input className={inputClass} type="number" placeholder="145" value={mcCeil} onChange={(e) => setMcCeil(e.target.value)} /></div>
              </div>
              <Button className="w-full" onClick={handleLogMC} disabled={logMC.isPending || !teamName || !opponentName}>
                {logMC.isPending ? "Logging..." : "Log Monte Carlo Prediction"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Hub ─────────────────────────────────────────────────────────────────

export default function BacktestingHub() {
  const [selectedSeason, setSelectedSeason] = useState<string>("2025");
  const season = selectedSeason === "all" ? undefined : parseInt(selectedSeason);

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
              <Target className="w-6 h-6 text-blue-400" />
              Backtesting & Accuracy
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track AI recommendation accuracy, Monte Carlo calibration, and decision outcomes over time.
            </p>
          </div>
          <Select value={selectedSeason} onValueChange={setSelectedSeason}>
            <SelectTrigger className="w-32 bg-zinc-800/60 border-zinc-700/60 text-zinc-200 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="all">All Seasons</SelectItem>
              {SEASONS.map((s) => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="bg-zinc-800/60 border border-zinc-700/50 h-9">
            {[
              { value: "overview", label: "Overview", icon: <BarChart2 className="w-3.5 h-3.5" /> },
              { value: "startsit", label: "Start/Sit", icon: <Zap className="w-3.5 h-3.5" /> },
              { value: "montecarlo", label: "Monte Carlo", icon: <TrendingUp className="w-3.5 h-3.5" /> },
              { value: "trades", label: "Trades", icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
              { value: "champ", label: "Champ Equity", icon: <Trophy className="w-3.5 h-3.5" /> },
              { value: "log", label: "Log Decision", icon: <CheckCircle className="w-3.5 h-3.5" /> },
            ].map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs gap-1.5 data-[state=active]:bg-zinc-700">
                {t.icon}{t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab season={season} />
          </TabsContent>
          <TabsContent value="startsit" className="mt-4">
            <StartSitTab season={season} />
          </TabsContent>
          <TabsContent value="montecarlo" className="mt-4">
            <MonteCarloTab season={season} />
          </TabsContent>
          <TabsContent value="trades" className="mt-4">
            <TradesTab season={season} />
          </TabsContent>
          <TabsContent value="champ" className="mt-4">
            <ChampEquityTab season={season} />
          </TabsContent>
          <TabsContent value="log" className="mt-4">
            <LogDecisionTab season={season} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
