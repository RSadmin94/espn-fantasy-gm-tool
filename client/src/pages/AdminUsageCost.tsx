import { useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { IntelPageShell } from "@/components/layout/IntelPageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Legend, Tooltip } from "recharts";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { budgetTone, formatDelta, formatPct, formatTokens, formatUsd } from "@/lib/usageCostFormat";
import { cn } from "@/lib/utils";

type Preset = "today" | "last_7" | "last_30" | "mtd" | "previous_month" | "custom";
type UserSort = "cost" | "requests" | "tokens" | "activity";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "last_7", label: "Last 7 Days" },
  { id: "last_30", label: "Last 30 Days" },
  { id: "mtd", label: "Month to Date" },
  { id: "previous_month", label: "Previous Month" },
  { id: "custom", label: "Custom Range" },
];

const chartConfig = {
  costUsd: { label: "Cost", color: "hsl(var(--chart-1))" },
  requests: { label: "Requests", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

function ALL(v: string): string | undefined {
  return !v || v === "all" ? undefined : v;
}

export function AdminUsageCost() {
  const [preset, setPreset] = useState<Preset>("mtd");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [provider, setProvider] = useState("all");
  const [model, setModel] = useState("all");
  const [featureId, setFeatureId] = useState("all");
  const [intent, setIntent] = useState("all");
  const [leagueId, setLeagueId] = useState("all");
  const [userId, setUserId] = useState("");
  const [userSort, setUserSort] = useState<UserSort>("cost");
  const [budgetDraft, setBudgetDraft] = useState("");
  const [showCost, setShowCost] = useState(true);
  const [showRequests, setShowRequests] = useState(true);

  const input = {
    preset,
    start: preset === "custom" && customStart ? new Date(customStart + "T00:00:00.000Z").toISOString() : undefined,
    end: preset === "custom" && customEnd ? new Date(customEnd + "T23:59:59.999Z").toISOString() : undefined,
    provider: ALL(provider),
    model: ALL(model),
    featureId: ALL(featureId),
    intent: ALL(intent),
    leagueId: ALL(leagueId),
    userId: userId.trim() || undefined,
  };

  const q = trpc.usageCost.getDashboard.useQuery(input, { staleTime: 15_000 });
  const setBudget = trpc.usageCost.setBudget.useMutation({
    onSuccess: () => q.refetch(),
  });

  const data = q.data;
  const usersSorted = useMemo(() => {
    const rows = [...(data?.users ?? [])];
    rows.sort((a, b) => {
      if (userSort === "requests") return b.requests - a.requests;
      if (userSort === "tokens") return b.tokens - a.tokens;
      if (userSort === "activity") return (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "");
      return b.costUsd - a.costUsd;
    });
    return rows;
  }, [data?.users, userSort]);

  if (q.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading usage…
      </div>
    );
  }

  if (q.isError || !data) {
    const forbidden =
      q.error?.message === "Admin access required" || q.error?.data?.code === "FORBIDDEN";
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold">Usage & Cost</h1>
        <p className="mt-4 text-red-400">
          {forbidden ? "This page is for admins only." : q.error?.message ?? "Could not load usage data."}
        </p>
      </div>
    );
  }

  const tone = budgetTone(data.budgetHealth.percentUsed, data.budgetHealth.projectedOverUnderUsd);
  const spendDelta = formatDelta(data.kpis.spendDeltaPct);
  const reqDelta = formatDelta(data.kpis.requestsDeltaPct);

  return (
    <IntelPageShell width="wide" padding="compact">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage & Cost</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI usage, spend, efficiency, and budget health across Fantasy Football Rivals
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={preset === p.id ? "default" : "outline"}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap gap-3">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-40" />
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-40" />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <FilterSelect label="Provider" value={provider} onChange={setProvider} options={data.filterOptions.providers} />
          <FilterSelect label="Model" value={model} onChange={setModel} options={data.filterOptions.models} />
          <FilterSelect label="Feature" value={featureId} onChange={setFeatureId} options={data.filterOptions.features} />
          <FilterSelect label="Advisor Intent" value={intent} onChange={setIntent} options={data.filterOptions.intents} />
          <FilterSelect label="League" value={leagueId} onChange={setLeagueId} options={data.filterOptions.leagues} />
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">User</div>
            <Input placeholder="User id" value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
        </div>

        {data.empty && (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No AI usage has been recorded for this window. New requests will appear here after the
              provider boundary writes telemetry. Older rows may be missing cost, tokens, or attribution.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi title="AI Spend MTD" value={formatUsd(data.kpis.mtdSpendUsd)} />
          <Kpi title="Projected Monthly Spend" value={formatUsd(data.kpis.projectedMonthlyUsd)} />
          <Kpi
            title="Budget Used"
            value={
              data.budgetHealth.monthlyBudgetUsd == null
                ? "Not configured"
                : `${formatUsd(data.budgetHealth.mtdActualUsd)} / ${formatUsd(data.budgetHealth.monthlyBudgetUsd)}`
            }
            hint={formatPct(data.budgetHealth.percentUsed)}
            tone={tone}
          />
          <Kpi
            title="AI Requests"
            value={data.kpis.requests.toLocaleString()}
            hint={data.kpis.hasPrevious ? reqDelta.text : undefined}
            deltaTone={reqDelta.tone}
          />
          <Kpi title="Average Cost / Request" value={formatUsd(data.kpis.avgCostPerRequest, 4)} />
          <Kpi title="Cost / Active User" value={formatUsd(data.kpis.costPerActiveUser)} />
          <Kpi title="Input Tokens" value={formatTokens(data.kpis.inputTokens)} />
          <Kpi
            title="Output Tokens"
            value={formatTokens(data.kpis.outputTokens)}
            hint={data.kpis.hasPrevious ? `${formatUsd(data.kpis.spendUsd)} ${spendDelta.text}` : formatUsd(data.kpis.spendUsd)}
            deltaTone={spendDelta.tone}
          />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily spend + usage</CardTitle>
            <CardDescription>Hover a day for tokens and cost. Toggle series below.</CardDescription>
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant={showCost ? "default" : "outline"} onClick={() => setShowCost((v) => !v)}>Cost</Button>
              <Button size="sm" variant={showRequests ? "default" : "outline"} onClick={() => setShowRequests((v) => !v)}>Requests</Button>
            </div>
          </CardHeader>
          <CardContent>
            {data.daily.every((d) => d.requests === 0 && d.costUsd === 0) ? (
              <p className="py-8 text-sm text-muted-foreground">No daily series for this range.</p>
            ) : (
              <ChartContainer config={chartConfig} className="aspect-[16/5] w-full">
                <ComposedChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="cost" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                  <YAxis yAxisId="req" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as {
                        date: string;
                        requests: number;
                        inputTokens: number;
                        outputTokens: number;
                        costUsd: number;
                      };
                      return (
                        <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
                          <div className="font-medium">{String(label)}</div>
                          <div>Requests: {row.requests.toLocaleString()}</div>
                          <div>Input tokens: {formatTokens(row.inputTokens)}</div>
                          <div>Output tokens: {formatTokens(row.outputTokens)}</div>
                          <div>Cost: {formatUsd(row.costUsd)}</div>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  {showRequests && <Bar yAxisId="req" dataKey="requests" fill="var(--color-requests)" name="Requests" />}
                  {showCost && <Line yAxisId="cost" type="monotone" dataKey="costUsd" stroke="var(--color-costUsd)" name="Cost" dot={false} />}
                </ComposedChart>
              </ChartContainer>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Tooltip fields: date, requests, input tokens, output tokens, cost. Series values are in the chart hover.
            </p>
          </CardContent>
        </Card>

        <Section title="Feature cost breakdown">
          <DataTable
            empty="No feature-attributed AI calls in this window."
            headers={["Feature", "Requests", "Input Tokens", "Output Tokens", "Avg Prompt Tokens", "Cost", "% Total Cost", "Cost / Request"]}
            rows={data.features.map((r) => [
              r.featureLabel,
              r.requests.toLocaleString(),
              formatTokens(r.inputTokens),
              formatTokens(r.outputTokens),
              formatTokens(r.avgPromptTokens),
              formatUsd(r.costUsd),
              formatPct(r.pctTotalCost),
              formatUsd(r.costPerRequest, 4),
            ])}
          />
        </Section>

        <Section title="Advisor intent cost" description="Classifications actually stored on Advisor requests. UNATTRIBUTED means no intent was recorded — this repo does not currently classify Advisor questions.">
          <DataTable
            empty="No Advisor requests in this window."
            headers={["Intent", "Requests", "Avg Input Tokens", "Avg Output Tokens", "Total Tokens", "Cost", "Cost / Request", "% Advisor Cost"]}
            rows={data.intents.map((r) => [
              r.intent,
              r.requests.toLocaleString(),
              formatTokens(r.avgInputTokens),
              formatTokens(r.avgOutputTokens),
              formatTokens(r.totalTokens),
              formatUsd(r.costUsd),
              formatUsd(r.costPerRequest, 4),
              formatPct(r.pctAdvisorCost),
            ])}
          />
        </Section>

        <Section title="Provider / model">
          <DataTable
            empty="No provider usage in this window."
            headers={["Provider", "Model", "Requests", "Input", "Cached input", "Output", "Total", "Cost", "Cost / req", "Avg latency", "Error rate"]}
            rows={data.models.map((r) => [
              r.provider,
              r.model,
              r.requests.toLocaleString(),
              formatTokens(r.inputTokens),
              formatTokens(r.cachedInputTokens),
              formatTokens(r.outputTokens),
              formatTokens(r.totalTokens),
              formatUsd(r.costUsd),
              formatUsd(r.costPerRequest, 4),
              `${Math.round(r.avgLatencyMs)} ms`,
              formatPct(r.errorRate * 100),
            ])}
          />
        </Section>

        <Section
          title="User usage"
          description="Admin-only. High-usage rows are flagged when cost is 3× the cohort mean and above $0.50."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {(["cost", "requests", "tokens", "activity"] as UserSort[]).map((s) => (
              <Button key={s} size="sm" variant={userSort === s ? "default" : "outline"} onClick={() => setUserSort(s)}>
                Sort: {s}
              </Button>
            ))}
          </div>
          <DataTable
            empty="No user-attributed AI calls in this window."
            headers={["User", "League", "Requests", "Tokens", "Cost", "Avg Cost / Request", "Last Activity"]}
            rows={usersSorted.map((r) => [
              `${r.userLabel}${r.highUsage ? " ⚠" : ""}`,
              r.leagueLabel,
              r.requests.toLocaleString(),
              formatTokens(r.tokens),
              formatUsd(r.costUsd),
              formatUsd(r.avgCostPerRequest, 4),
              r.lastActivity ? new Date(r.lastActivity).toLocaleString() : "—",
            ])}
          />
        </Section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Value / waste</CardTitle>
              <CardDescription>Wasted cost is discarded responses plus failed requests that still incurred cost.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Generated" value={data.waste.generated.toLocaleString()} />
              <Metric label="Displayed" value={data.waste.displayed.toLocaleString()} />
              <Metric label="Suppressed" value={data.waste.suppressed.toLocaleString()} />
              <Metric label="Failed requests" value={data.waste.failed.toLocaleString()} />
              <Metric label="Retry requests" value={data.waste.retries.toLocaleString()} />
              <Metric label="Estimated wasted cost" value={formatUsd(data.waste.estimatedWastedCostUsd)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prompt efficiency</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Metric label="Avg input tokens / request" value={formatTokens(data.efficiency.avgInputTokens)} />
              <Metric label="Avg output tokens / request" value={formatTokens(data.efficiency.avgOutputTokens)} />
              <Metric label="Input / output ratio" value={data.efficiency.inputOutputRatio == null ? "—" : data.efficiency.inputOutputRatio.toFixed(2)} />
              <Metric label="P50 prompt tokens" value={formatTokens(data.efficiency.p50PromptTokens)} />
              <Metric label="P95 prompt tokens" value={formatTokens(data.efficiency.p95PromptTokens)} />
              {data.efficiency.highPromptFeatures.length > 0 && (
                <p className="text-amber-400">
                  High prompt features: {data.efficiency.highPromptFeatures.map((f) => f.featureId).join(", ")}
                </p>
              )}
              {data.efficiency.highPromptIntents.length > 0 && (
                <p className="text-amber-400">
                  High prompt intents: {data.efficiency.highPromptIntents.map((f) => f.intent).join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-lime-400">
                <CheckCircle2 className="h-4 w-4" /> No anomalies for this window.
              </p>
            ) : (
              data.alerts.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm",
                    a.severity === "critical" && "border-red-500/40 bg-red-500/10 text-red-300",
                    a.severity === "warning" && "border-amber-500/40 bg-amber-500/10 text-amber-300",
                    a.severity === "info" && "border-border bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {a.title}
                    <Badge variant="outline" className="ml-auto text-[10px] uppercase">{a.severity}</Badge>
                  </div>
                  <p className="mt-1 text-xs opacity-90">{a.detail}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Budget settings</CardTitle>
            <CardDescription>Stored in app_settings.monthly_ai_budget_usd (falls back to AI_MONTHLY_BUDGET_USD).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <Metric label="Monthly budget" value={formatUsd(data.budgetHealth.monthlyBudgetUsd)} />
            <Metric label="MTD actual" value={formatUsd(data.budgetHealth.mtdActualUsd)} />
            <Metric label="Remaining" value={formatUsd(data.budgetHealth.remainingUsd)} />
            <Metric label="Percent consumed" value={formatPct(data.budgetHealth.percentUsed)} />
            <Metric label="Projected month-end" value={formatUsd(data.budgetHealth.projectedMonthEndUsd)} />
            <Metric
              label="Projected over/under"
              value={
                data.budgetHealth.projectedOverUnderUsd == null
                  ? "—"
                  : `${data.budgetHealth.projectedOverUnderUsd >= 0 ? "Under" : "Over"} ${formatUsd(Math.abs(data.budgetHealth.projectedOverUnderUsd))}`
              }
            />
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-end gap-2 pt-2">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Set monthly budget (USD)</div>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  className="w-40"
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  placeholder={data.budgetHealth.monthlyBudgetUsd?.toString() ?? "e.g. 50"}
                />
              </div>
              <Button
                size="sm"
                disabled={setBudget.isPending || budgetDraft === ""}
                onClick={() => setBudget.mutate({ monthlyBudgetUsd: Number(budgetDraft) })}
              >
                Save budget
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </IntelPageShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Kpi({
  title,
  value,
  hint,
  tone,
  deltaTone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "healthy" | "watch" | "over";
  deltaTone?: "up" | "down" | "flat" | "none";
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
        <div
          className={cn(
            "mt-1 text-2xl font-bold tabular-nums",
            tone === "healthy" && "text-lime-400",
            tone === "watch" && "text-amber-400",
            tone === "over" && "text-red-400",
          )}
        >
          {value}
        </div>
        {hint ? (
          <div
            className={cn(
              "mt-1 text-xs tabular-nums",
              deltaTone === "up" && "text-red-400",
              deltaTone === "down" && "text-lime-400",
              !deltaTone && "text-muted-foreground",
            )}
          >
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h, i) => (
            <TableHead key={h} className={i === 0 ? "" : "text-right"}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, idx) => (
          <TableRow key={idx}>
            {row.map((cell, i) => (
              <TableCell key={i} className={cn("tabular-nums", i === 0 ? "font-medium" : "text-right")}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums">{value}</div>
    </div>
  );
}
