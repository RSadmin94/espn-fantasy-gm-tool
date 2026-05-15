/**
 * UsageMonitor.tsx
 * ─────────────────
 * Admin-only backend usage and cost monitor dashboard.
 *
 * Surfaces:
 *   1. Cost summary cards (total cost, LLM calls, ESPN calls, tRPC hits)
 *   2. Daily trend bar chart (calls + cost over last N days)
 *   3. Per-feature breakdown table (sorted by cost)
 *   4. Top callers by cost
 *   5. Recent LLM call log
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
import { DollarSign, Zap, Activity, Users, RefreshCw, TrendingUp } from "lucide-react";

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
};

const CATEGORY_ICON: Record<string, string> = {
  llm: "🤖",
  espn: "🏈",
  trpc: "⚡",
};

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
  const [refreshKey, setRefreshKey] = useState(0);

  const queryOpts = useMemo(() => ({ days }), [days]);

  const { data: summary, isLoading: loadingSummary } = trpc.usageMonitor.getCostSummary.useQuery(queryOpts);
  const { data: features, isLoading: loadingFeatures } = trpc.usageMonitor.getFeatureSummary.useQuery(queryOpts);
  const { data: trend, isLoading: loadingTrend } = trpc.usageMonitor.getDailyTrend.useQuery(queryOpts);
  const { data: callers, isLoading: loadingCallers } = trpc.usageMonitor.getTopCallers.useQuery(queryOpts);
  const { data: llmLog, isLoading: loadingLog } = trpc.usageMonitor.getLLMCallLog.useQuery({ limit: 100 });

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

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usage Monitor</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Backend feature usage, LLM costs, and API call tracking</p>
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

      {/* Tabs: Feature breakdown / Top callers / LLM log */}
      <Tabs defaultValue="features">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="features" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Feature Breakdown
          </TabsTrigger>
          <TabsTrigger value="callers" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            Top Callers
          </TabsTrigger>
          <TabsTrigger value="log" className="data-[state=active]:bg-zinc-800 text-zinc-400 data-[state=active]:text-white">
            LLM Call Log
          </TabsTrigger>
        </TabsList>

        {/* Feature breakdown */}
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

        {/* Top callers */}
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

        {/* LLM call log */}
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
