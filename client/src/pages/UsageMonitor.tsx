/**
 * UsageMonitor.tsx
 * ─────────────────
 * Admin-only backend usage and cost monitor dashboard.
 *
 * Tabs:
 *   1. Overview       — cost cards + daily trend chart
 *   2. Feature Breakdown — per-feature cost table (backend events)
 *   3. Feature Usage  — UI event counts per feature (top/ignored)
 *   4. AI by Feature  — LLM call breakdown per feature
 *   5. User Retention — unique users per ISO week
 *   6. Onboarding Funnel — step completion counts
 *   7. Top Callers    — by cost
 *   8. LLM Call Log   — raw recent calls
 *
 * Access: admin role only — non-admins see a 403 message.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DollarSign, Zap, Activity, Users, RefreshCw, TrendingUp, Eye, AlertCircle } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${(usd * 1_000_000).toFixed(2)}µ`;
  if (usd < 0.01) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const CATEGORY_COLOR: Record<string, string> = {
  llm: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  espn: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  trpc: "bg-green-500/20 text-green-400 border-green-500/30",
  ui: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const CATEGORY_ICON: Record<string, string> = {
  llm: "🤖",
  espn: "🏈",
  trpc: "⚡",
  ui: "👆",
};

const FUNNEL_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe", "#ede9fe", "#f5f3ff"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  title, value, sub, icon: Icon, color,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${color.replace("text-", "bg-").replace("-400", "-500/10")}`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function UsageMonitor() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [weeks, setWeeks] = useState(12);
  const [, setRefreshKey] = useState(0);

  const queryOpts = useMemo(() => ({ days }), [days]);
  const weeksOpts = useMemo(() => ({ weeks }), [weeks]);

  const { data: summary, isLoading: loadingSummary } = trpc.usageMonitor.getCostSummary.useQuery(queryOpts);
  const { data: features, isLoading: loadingFeatures } = trpc.usageMonitor.getFeatureSummary.useQuery(queryOpts);
  const { data: trend, isLoading: loadingTrend } = trpc.usageMonitor.getDailyTrend.useQuery(queryOpts);
  const { data: callers, isLoading: loadingCallers } = trpc.usageMonitor.getTopCallers.useQuery(queryOpts);
  const { data: llmLog, isLoading: loadingLog } = trpc.usageMonitor.getLLMCallLog.useQuery({ limit: 100 });

  // New analytics queries
  const { data: featureUtil, isLoading: loadingUtil } = trpc.usageMonitor.getFeatureUtilization.useQuery(queryOpts);
  const { data: aiByFeature, isLoading: loadingAI } = trpc.usageMonitor.getAIUsageByFeature.useQuery(queryOpts);
  const { data: retention, isLoading: loadingRetention } = trpc.usageMonitor.getRetentionByWeek.useQuery(weeksOpts);
  const { data: funnel, isLoading: loadingFunnel } = trpc.usageMonitor.getOnboardingFunnel.useQuery();

  // Non-admin guard
  if (user && user.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium">Admin access required</p>
          <p className="text-sm mt-1">This page is only visible to the league owner.</p>
        </div>
      </div>
    );
  }

  const trendData = (trend ?? []).map(r => ({
    date: r.date.slice(5), // "MM-DD"
    calls: Number(r.callCount),
    cost: Number(r.totalCostUsd),
    tokens: Number(r.totalTokens),
  }));

  const retentionData = (retention ?? []).map(r => ({
    week: r.week,
    users: Number(r.uniqueUsers),
    events: Number(r.totalEvents),
  }));

  const funnelData = (funnel ?? []).map((s, i) => ({
    name: s.step,
    value: Number(s.completions),
    fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
  }));

  const ignoredFeatures = (featureUtil ?? []).filter(f => f.isIgnored);
  const activeFeatures = (featureUtil ?? []).filter(f => !f.isIgnored);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usage Monitor</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Backend feature usage, LLM costs, API calls, and user analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-32 bg-zinc-900 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="7">Last 7d</SelectItem>
              <SelectItem value="14">Last 14d</SelectItem>
              <SelectItem value="30">Last 30d</SelectItem>
              <SelectItem value="90">Last 90d</SelectItem>
              <SelectItem value="365">Last 365d</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey(k => k + 1)}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          title="Total Cost"
          value={loadingSummary ? "…" : formatCost(summary?.totalCostUsd ?? 0)}
          sub={`${days}d window`}
          icon={DollarSign}
          color="text-yellow-400"
        />
        <SummaryCard
          title="LLM Cost"
          value={loadingSummary ? "…" : formatCost(summary?.llmCostUsd ?? 0)}
          sub={`${summary?.llmCalls ?? 0} calls`}
          icon={TrendingUp}
          color="text-purple-400"
        />
        <SummaryCard
          title="Total Calls"
          value={loadingSummary ? "…" : String(summary?.totalCalls ?? 0)}
          sub="all categories"
          icon={Activity}
          color="text-blue-400"
        />
        <SummaryCard
          title="LLM Calls"
          value={loadingSummary ? "…" : String(summary?.llmCalls ?? 0)}
          sub="AI generations"
          icon={Zap}
          color="text-purple-400"
        />
        <SummaryCard
          title="ESPN Calls"
          value={loadingSummary ? "…" : String(summary?.espnCalls ?? 0)}
          sub="API fetches"
          icon={Activity}
          color="text-blue-400"
        />
        <SummaryCard
          title="tRPC Hits"
          value={loadingSummary ? "…" : String(summary?.trpcCalls ?? 0)}
          sub="procedure calls"
          icon={Users}
          color="text-green-400"
        />
      </div>

      {/* Daily trend chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400">Daily Trend — Calls &amp; Cost</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTrend ? (
            <div className="h-48 flex items-center justify-center text-zinc-600">Loading chart…</div>
          ) : trendData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-zinc-600">No data yet — events will appear here after first use.</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis yAxisId="calls" tick={{ fill: "#71717a", fontSize: 11 }} />
                <YAxis yAxisId="cost" orientation="right" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={v => `$${Number(v).toFixed(4)}`} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6 }}
                  labelStyle={{ color: "#e4e4e7" }}
                  formatter={(value: number, name: string) =>
                    name === "cost" ? [formatCost(value), "Cost"] : [value, "Calls"]
                  }
                />
                <Legend wrapperStyle={{ color: "#71717a", fontSize: 12 }} />
                <Bar yAxisId="calls" dataKey="calls" fill="#6366f1" radius={[2, 2, 0, 0]} name="Calls" />
                <Bar yAxisId="cost" dataKey="cost" fill="#f59e0b" radius={[2, 2, 0, 0]} name="Cost ($)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* All tabs */}
      <Tabs defaultValue="feature-usage">
        <TabsList className="bg-zinc-900 border border-zinc-800 flex-wrap h-auto gap-1">
          <TabsTrigger value="feature-usage" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Feature Usage
          </TabsTrigger>
          <TabsTrigger value="ai-by-feature" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            AI by Feature
          </TabsTrigger>
          <TabsTrigger value="retention" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            User Retention
          </TabsTrigger>
          <TabsTrigger value="funnel" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Onboarding Funnel
          </TabsTrigger>
          <TabsTrigger value="ignored" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Ignored Features
          </TabsTrigger>
          <TabsTrigger value="features" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Backend Breakdown
          </TabsTrigger>
          <TabsTrigger value="callers" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Top Callers
          </TabsTrigger>
          <TabsTrigger value="log" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            LLM Call Log
          </TabsTrigger>
        </TabsList>

        {/* ── Feature Usage (UI events) ── */}
        <TabsContent value="feature-usage">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Eye className="w-4 h-4" /> Top-Used Features (UI Events — Last {days}d)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingUtil ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : !activeFeatures.length ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">No UI events tracked yet. Events appear after users interact with features.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-500">Feature</TableHead>
                      <TableHead className="text-zinc-500 text-right">Total Events</TableHead>
                      <TableHead className="text-zinc-500 text-right">Unique Users</TableHead>
                      <TableHead className="text-zinc-500 text-right">Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeFeatures.map((f, i) => (
                      <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50">
                        <TableCell className="font-mono text-xs text-zinc-300">{f.featureName}</TableCell>
                        <TableCell className="text-right text-zinc-300">{Number(f.totalEvents).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-zinc-400">{Number(f.uniqueUsers)}</TableCell>
                        <TableCell className="text-right text-zinc-500 text-xs">
                          {f.lastSeenAt ? new Date(f.lastSeenAt).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AI by Feature ── */}
        <TabsContent value="ai-by-feature">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Zap className="w-4 h-4" /> AI (LLM) Usage by Feature — Last {days}d
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAI ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : !aiByFeature || aiByFeature.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">No LLM calls recorded yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-500">Feature</TableHead>
                      <TableHead className="text-zinc-500 text-right">LLM Calls</TableHead>
                      <TableHead className="text-zinc-500 text-right">Total Tokens</TableHead>
                      <TableHead className="text-zinc-500 text-right">Est. Cost</TableHead>
                      <TableHead className="text-zinc-500 text-right">Avg ms</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aiByFeature.map((f, i) => (
                      <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50">
                        <TableCell className="font-mono text-xs text-zinc-300">{f.featureName}</TableCell>
                        <TableCell className="text-right text-zinc-300">{Number(f.llmCalls).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-zinc-400">{formatTokens(Number(f.totalTokens))}</TableCell>
                        <TableCell className="text-right font-medium text-yellow-400">{formatCost(Number(f.totalCostUsd))}</TableCell>
                        <TableCell className="text-right text-zinc-500 text-xs">{Math.round(Number(f.avgDurationMs))}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── User Retention ── */}
        <TabsContent value="retention">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Users className="w-4 h-4" /> Unique Users per Week
              </CardTitle>
              <Select value={String(weeks)} onValueChange={v => setWeeks(Number(v))}>
                <SelectTrigger className="w-28 bg-zinc-900 border-zinc-700 text-white text-xs h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="4">Last 4w</SelectItem>
                  <SelectItem value="8">Last 8w</SelectItem>
                  <SelectItem value="12">Last 12w</SelectItem>
                  <SelectItem value="26">Last 26w</SelectItem>
                  <SelectItem value="52">Last 52w</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {loadingRetention ? (
                <div className="h-48 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : retentionData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-zinc-600">No retention data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={retentionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="week" tick={{ fill: "#71717a", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6 }}
                      labelStyle={{ color: "#e4e4e7" }}
                    />
                    <Legend wrapperStyle={{ color: "#71717a", fontSize: 12 }} />
                    <Bar dataKey="users" fill="#10b981" radius={[2, 2, 0, 0]} name="Unique Users" />
                    <Bar dataKey="events" fill="#6366f1" radius={[2, 2, 0, 0]} name="Total Events" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Onboarding Funnel ── */}
        <TabsContent value="funnel">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Onboarding Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingFunnel ? (
                <div className="h-48 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : !funnel || funnel.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-zinc-600">No funnel data yet.</div>
              ) : (
                <div className="space-y-3">
                  {funnel.map((step, i) => {
                    const maxVal = funnel[0]?.completions ?? 1;
                    const pct = maxVal > 0 ? Math.round((Number(step.completions) / Number(maxVal)) * 100) : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300">{step.step}</span>
                          <span className="text-zinc-500">{Number(step.completions).toLocaleString()} completions ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ignored Features ── */}
        <TabsContent value="ignored">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-400" /> Ignored Features (0 UI Events in Last {days}d)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingUtil ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : ignoredFeatures.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-green-500">
                  🎉 All tracked features have been used in the last {days} days!
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {ignoredFeatures.map((f, i) => (
                    <div key={i} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
                      <span className="font-mono text-xs text-zinc-400">{f.featureName}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Backend Feature Breakdown ── */}
        <TabsContent value="features">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              {loadingFeatures ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : !features || features.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">No feature data yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-500">Feature</TableHead>
                      <TableHead className="text-zinc-500">Category</TableHead>
                      <TableHead className="text-zinc-500 text-right">Calls</TableHead>
                      <TableHead className="text-zinc-500 text-right">Tokens</TableHead>
                      <TableHead className="text-zinc-500 text-right">Est. Cost</TableHead>
                      <TableHead className="text-zinc-500 text-right">Avg ms</TableHead>
                      <TableHead className="text-zinc-500 text-right">Last Used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features.map((f, i) => (
                      <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50">
                        <TableCell className="font-mono text-xs text-zinc-300">{f.featureName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${CATEGORY_COLOR[f.eventCategory] ?? "bg-zinc-800 text-zinc-400"}`}>
                            {CATEGORY_ICON[f.eventCategory] ?? "•"} {f.eventCategory}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-zinc-300">{Number(f.callCount).toLocaleString()}</TableCell>
                        <TableCell className="text-right text-zinc-400">{formatTokens(Number(f.totalTokens))}</TableCell>
                        <TableCell className="text-right font-medium text-yellow-400">{formatCost(Number(f.totalCostUsd))}</TableCell>
                        <TableCell className="text-right text-zinc-400">{Math.round(Number(f.avgDurationMs))}ms</TableCell>
                        <TableCell className="text-right text-zinc-500 text-xs">
                          {f.lastUsedAt ? new Date(f.lastUsedAt).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Top Callers ── */}
        <TabsContent value="callers">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              {loadingCallers ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : !callers || callers.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">No caller data yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-500">Rank</TableHead>
                      <TableHead className="text-zinc-500">User ID</TableHead>
                      <TableHead className="text-zinc-500 text-right">Calls</TableHead>
                      <TableHead className="text-zinc-500 text-right">Est. Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {callers.map((c, i) => (
                      <TableRow key={i} className="border-zinc-800 hover:bg-zinc-800/50">
                        <TableCell className="text-zinc-500 font-mono text-xs">#{i + 1}</TableCell>
                        <TableCell className="font-mono text-xs text-zinc-300">{c.userId ?? "anonymous"}</TableCell>
                        <TableCell className="text-right text-zinc-300">{Number(c.callCount).toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium text-yellow-400">{formatCost(Number(c.totalCostUsd))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LLM Call Log ── */}
        <TabsContent value="log">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              {loadingLog ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">Loading…</div>
              ) : !llmLog || llmLog.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-zinc-600">No LLM calls logged yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-500">Feature</TableHead>
                        <TableHead className="text-zinc-500">Model</TableHead>
                        <TableHead className="text-zinc-500">Type</TableHead>
                        <TableHead className="text-zinc-500 text-right">Prompt</TableHead>
                        <TableHead className="text-zinc-500 text-right">Completion</TableHead>
                        <TableHead className="text-zinc-500 text-right">Cost</TableHead>
                        <TableHead className="text-zinc-500 text-right">ms</TableHead>
                        <TableHead className="text-zinc-500 text-right">Stream</TableHead>
                        <TableHead className="text-zinc-500 text-right">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...llmLog].reverse().map((row) => (
                        <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/50">
                          <TableCell className="font-mono text-xs text-zinc-300 max-w-32 truncate">{row.featureName}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-400 max-w-28 truncate">{row.model ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-zinc-500">{row.callType ?? "—"}</TableCell>
                          <TableCell className="text-right text-zinc-400 text-xs">{formatTokens(row.promptTokens)}</TableCell>
                          <TableCell className="text-right text-zinc-400 text-xs">{formatTokens(row.completionTokens)}</TableCell>
                          <TableCell className="text-right text-yellow-400 text-xs font-medium">{formatCost(Number(row.estimatedCostUsd))}</TableCell>
                          <TableCell className="text-right text-zinc-500 text-xs">{row.durationMs}</TableCell>
                          <TableCell className="text-right text-xs">
                            {row.streaming ? (
                              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">stream</Badge>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-zinc-500 text-xs whitespace-nowrap">
                            {new Date(row.createdAt).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
