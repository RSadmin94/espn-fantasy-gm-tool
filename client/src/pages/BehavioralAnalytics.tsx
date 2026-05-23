/**
 * BehavioralAnalytics — Admin-only dashboard answering 6 key questions:
 * 1. Which leagues are active?
 * 2. Which features retain users?
 * 3. Which tabs are ignored?
 * 4. How often do users switch leagues?
 * 5. What drives return visits?
 * 6. Where do users disappear?
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from "recharts";
import {
  Activity,
  Users,
  ArrowLeftRight,
  Eye,
  EyeOff,
  TrendingUp,
  LogOut,
  Trophy,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import AppLayout from "@/components/AppLayout";

const COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#10b981", "#6366f1",
];

function SectionHeader({
  icon: Icon,
  title,
  description,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="p-2 rounded-lg bg-primary/10 text-primary mt-0.5">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {badge && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
      <Activity className="w-8 h-8 opacity-30" />
      <p className="text-sm">{message}</p>
      <p className="text-xs opacity-60">Events will appear here as users interact with the app.</p>
    </div>
  );
}

// ─── Panel 1: Active Leagues ──────────────────────────────────────────────────
function ActiveLeaguesPanel({ days }: { days: number }) {
  const { data, isLoading } = trpc.usageMonitor.getActiveLeagueStats.useQuery({ days });
  if (isLoading) return <LoadingCard />;
  if (!data?.length) return <EmptyState message="No league activity recorded yet." />;

  return (
    <div className="space-y-3">
      {data.map((league, i) => (
        <div
          key={league.leagueId}
          className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ background: COLORS[i % COLORS.length] }}
          >
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{league.leagueName}</div>
            <div className="text-xs text-muted-foreground capitalize">{league.provider} · ID {league.leagueId}</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-semibold text-foreground">{league.uniqueUsers} users</div>
            <div className="text-xs text-muted-foreground">{league.sessionCount} sessions</div>
          </div>
          <div className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
            {league.lastActiveAt
              ? new Date(league.lastActiveAt).toLocaleDateString()
              : "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Panel 2: Feature Retention ───────────────────────────────────────────────
function FeatureRetentionPanel({ days }: { days: number }) {
  const { data, isLoading } = trpc.usageMonitor.getFeatureRetention.useQuery({ days });
  if (isLoading) return <LoadingCard />;
  if (!data?.length) return <EmptyState message="No feature retention data yet." />;

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="featureName"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(v: number) => [`${v}%`, "7-day retention"]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
            }}
          />
          <Bar dataKey="retentionRate" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={entry.featureName}
                fill={entry.retentionRate >= 50 ? "#22c55e" : entry.retentionRate >= 25 ? "#f59e0b" : "#ef4444"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {data.slice(0, 6).map((row) => (
          <div key={row.featureName} className="flex items-center justify-between p-2 rounded border border-border text-sm">
            <span className="text-muted-foreground capitalize">{row.featureName.replace(/_/g, " ")}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{row.returnedWithin7d}/{row.totalUsers}</span>
              <Badge
                variant={row.retentionRate >= 50 ? "default" : row.retentionRate >= 25 ? "secondary" : "destructive"}
                className="text-xs"
              >
                {row.retentionRate}%
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Panel 3: Ignored Tabs ────────────────────────────────────────────────────
function IgnoredTabsPanel({ days }: { days: number }) {
  const { data, isLoading } = trpc.usageMonitor.getIgnoredTabs.useQuery({ days });
  if (isLoading) return <LoadingCard />;
  if (!data?.length) {
    return <EmptyState message="No tab_view events recorded yet. Tab tracking fires automatically once users click tabs." />;
  }

  const sorted = [...data].sort((a, b) => a.viewCount - b.viewCount);
  const ignored = sorted.filter((t) => t.viewRate < 10);

  return (
    <div className="space-y-4">
      {ignored.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium text-destructive">Low-traffic tabs: </span>
            <span className="text-muted-foreground">
              {ignored.map((t) => t.tabName).join(", ")} — seen in &lt;10% of sessions
            </span>
          </div>
        </div>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 40, left: 60, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis
            type="category"
            dataKey="tabName"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            width={56}
          />
          <Tooltip
            formatter={(v: number, name: string) => [v, name === "viewCount" ? "Views" : "Users"]}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
            }}
          />
          <Bar dataKey="viewCount" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Panel 4: League Switching ────────────────────────────────────────────────
function LeagueSwitchPanel({ weeks }: { weeks: number }) {
  const { data, isLoading } = trpc.usageMonitor.getLeagueSwitchFrequency.useQuery({ weeks });
  if (isLoading) return <LoadingCard />;
  if (!data?.length) return <EmptyState message="No league switch events recorded yet." />;

  const totalSwitches = data.reduce((s, r) => s + r.switchCount, 0);
  const avgPerWeek = data.length > 0 ? (totalSwitches / data.length).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3">
          <div className="text-2xl font-bold text-primary">{totalSwitches}</div>
          <div className="text-xs text-muted-foreground">Total switches ({weeks}w)</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-primary">{avgPerWeek}</div>
          <div className="text-xs text-muted-foreground">Avg switches / week</div>
        </Card>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
            }}
          />
          <Line type="monotone" dataKey="switchCount" stroke="#22c55e" strokeWidth={2} dot={false} name="Switches" />
          <Line type="monotone" dataKey="uniqueSwitchers" stroke="#3b82f6" strokeWidth={2} dot={false} name="Unique switchers" strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Panel 5: Return Visit Drivers ────────────────────────────────────────────
function ReturnVisitDriversPanel({ days }: { days: number }) {
  const { data, isLoading } = trpc.usageMonitor.getReturnVisitDrivers.useQuery({ days });
  if (isLoading) return <LoadingCard />;
  if (!data?.length) return <EmptyState message="No return visit data yet. Needs 24h+ between sessions." />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        The feature a user last interacted with before returning to the app — a proxy for what keeps them coming back.
      </p>
      {data.map((row, i) => (
        <div key={row.featureName} className="flex items-center gap-3">
          <div className="w-6 text-xs text-muted-foreground text-right flex-shrink-0">{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium capitalize">{row.featureName.replace(/_/g, " ")}</span>
              <span className="text-xs text-muted-foreground">{row.pct}% · {row.precedingReturnVisits} returns</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${row.pct}%`,
                  background: COLORS[i % COLORS.length],
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Panel 6: Drop-off Map ────────────────────────────────────────────────────
function DropOffMapPanel({ days }: { days: number }) {
  const { data, isLoading } = trpc.usageMonitor.getDropOffMap.useQuery({ days });
  if (isLoading) return <LoadingCard />;
  if (!data?.length) return <EmptyState message="No drop-off data yet. Fires on page unload / tab close." />;

  const maxCount = Math.max(...data.map((r) => r.exitCount), 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Pages where user sessions end — high exit rates indicate friction or natural stopping points.
      </p>
      {data.slice(0, 15).map((row, i) => (
        <div key={row.exitPage} className="flex items-center gap-3 p-2 rounded border border-border">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: row.exitRate > 20 ? "#ef4444" : row.exitRate > 10 ? "#f59e0b" : "#22c55e" }}
          />
          <code className="text-xs text-muted-foreground flex-1 min-w-0 truncate">{row.exitPage}</code>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(row.exitCount / maxCount) * 100}%`,
                  background: row.exitRate > 20 ? "#ef4444" : row.exitRate > 10 ? "#f59e0b" : "#22c55e",
                }}
              />
            </div>
            <span className="text-xs font-medium w-12 text-right">{row.exitCount} exits</span>
            <Badge
              variant={row.exitRate > 20 ? "destructive" : "secondary"}
              className="text-xs w-12 justify-center"
            >
              {row.exitRate}%
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BehavioralAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [weeks, setWeeks] = useState(12);

  if (authLoading) {
    return (
      <AppLayout>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => <LoadingCard key={i} />)}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="w-12 h-12 text-destructive opacity-60" />
          <h2 className="text-xl font-semibold">Admin Access Required</h2>
          <p className="text-muted-foreground text-sm">This dashboard is only visible to admins.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Behavioral Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Six questions that tell you exactly what's working and where users disappear.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Active Leagues", icon: Trophy, color: "text-yellow-500" },
            { label: "Feature Retention", icon: TrendingUp, color: "text-green-500" },
            { label: "Ignored Tabs", icon: EyeOff, color: "text-red-500" },
            { label: "League Switches", icon: ArrowLeftRight, color: "text-blue-500" },
            { label: "Return Drivers", icon: RefreshCw, color: "text-purple-500" },
            { label: "Drop-off Map", icon: LogOut, color: "text-orange-500" },
          ].map(({ label, icon: Icon, color }) => (
            <div key={label} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
              <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
              <span className="text-xs font-medium text-foreground leading-tight">{label}</span>
            </div>
          ))}
        </div>

        {/* 6 panels in a 2-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 1. Active Leagues */}
          <Card>
            <CardHeader className="pb-2">
              <SectionHeader
                icon={Trophy}
                title="Which leagues are active?"
                description={`Leagues ranked by unique users in the last ${days} days.`}
              />
            </CardHeader>
            <CardContent>
              <ActiveLeaguesPanel days={days} />
            </CardContent>
          </Card>

          {/* 2. Feature Retention */}
          <Card>
            <CardHeader className="pb-2">
              <SectionHeader
                icon={TrendingUp}
                title="Which features retain users?"
                description="% of users who returned within 7 days after first using each feature."
              />
            </CardHeader>
            <CardContent>
              <FeatureRetentionPanel days={days} />
            </CardContent>
          </Card>

          {/* 3. Ignored Tabs */}
          <Card>
            <CardHeader className="pb-2">
              <SectionHeader
                icon={EyeOff}
                title="Which tabs are ignored?"
                description="Tab views sorted ascending — lowest bars = most ignored."
              />
            </CardHeader>
            <CardContent>
              <IgnoredTabsPanel days={days} />
            </CardContent>
          </Card>

          {/* 4. League Switching */}
          <Card>
            <CardHeader className="pb-2">
              <SectionHeader
                icon={ArrowLeftRight}
                title="How often do users switch leagues?"
                description="League switch events per week — spikes indicate multi-league users are active."
              />
            </CardHeader>
            <CardContent>
              <LeagueSwitchPanel weeks={weeks} />
            </CardContent>
          </Card>

          {/* 5. Return Visit Drivers */}
          <Card>
            <CardHeader className="pb-2">
              <SectionHeader
                icon={RefreshCw}
                title="What drives return visits?"
                description="Last feature touched before a user returned after 24h+ away."
              />
            </CardHeader>
            <CardContent>
              <ReturnVisitDriversPanel days={days} />
            </CardContent>
          </Card>

          {/* 6. Drop-off Map */}
          <Card>
            <CardHeader className="pb-2">
              <SectionHeader
                icon={LogOut}
                title="Where do users disappear?"
                description="Pages with the most session exits — red = high drop-off risk."
              />
            </CardHeader>
            <CardContent>
              <DropOffMapPanel days={days} />
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
