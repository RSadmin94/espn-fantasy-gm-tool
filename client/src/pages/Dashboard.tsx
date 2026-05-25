import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  Plug,
  RefreshCw,
  Trophy,
  Users,
  Repeat2,
  Settings,
  LayoutDashboard,
  XCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeagueRow {
  id: number;
  leagueId: string;
  leagueName: string;
  season: number;
  syncStatus: string | null;
  lastSyncedAt: Date | string | null;
}

interface ManifestRow {
  season: number;
  status?: string | null;
  transactionCount?: number | null;
  teamCount?: number | null;
  lastRefreshedAt?: Date | string | null;
}

interface PulseTeam {
  teamId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  desperationScore: number;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    pending: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
    syncing: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    failed: "bg-red-500/15 text-red-400 border-red-500/20",
    partial: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  };
  return (
    <span className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
      map[status] ?? "bg-muted text-muted-foreground border-border"
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function HealthIcon({ health }: { health: string }) {
  if (health === "healthy") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (health === "warning" || health === "degraded") return <AlertTriangle className="h-5 w-5 text-yellow-400" />;
  return <XCircle className="h-5 w-5 text-red-400" />;
}

// ── Active League Card ────────────────────────────────────────────────────────

function ActiveLeagueCard({ resolvedSeason }: { resolvedSeason: number }) {
  const activeQ = trpc.league.getActive.useQuery();
  const leaguesQ = trpc.league.getMyLeagues.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();
  const cachedSeasons: number[] = cachedQ.data ?? [];
  const latestSeasonForTeams = resolvedSeason;
  const probeTeams =
    activeQ.isFetched &&
    !activeQ.data &&
    !cachedQ.isLoading &&
    cachedSeasons.length === 0;
  const teamsQ = trpc.espn.teams.useQuery(
    { season: latestSeasonForTeams },
    { enabled: probeTeams }
  );

  if (activeQ.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading league…
        </CardContent>
      </Card>
    );
  }

  if (!activeQ.data) {
    if (cachedQ.isLoading) {
      return (
        <Card>
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading sync status…
          </CardContent>
        </Card>
      );
    }

    const teamsBusy = probeTeams && (teamsQ.isLoading || teamsQ.isFetching);
    const teamsHasResults = probeTeams && (teamsQ.data?.length ?? 0) > 0;
    const hideNoLeagueBanner =
      cachedSeasons.length > 0 || teamsBusy || teamsHasResults;

    if (hideNoLeagueBanner) {
      if (teamsBusy) {
        return (
          <Card>
            <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading league data…
            </CardContent>
          </Card>
        );
      }
      return (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="flex flex-col gap-3 py-6">
            <div className="flex items-center gap-2 text-sm text-emerald-200/90">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Synced fantasy data is available.
            </div>
            <p className="text-xs text-muted-foreground">
              Choose your active league from the sidebar switcher, or manage ESPN connections below.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link to="/connect">
                  <Plug className="h-3.5 w-3.5" /> ESPN connections
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
                <Link to="/sync">
                  <RefreshCw className="h-3 w-3" /> Sync
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-dashed border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            No active league connected.
          </div>
          <Button asChild size="sm" className="self-start gap-1.5">
            <Link to="/connect">
              <Plug className="h-3.5 w-3.5" /> Connect ESPN League
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const league = activeQ.data;
  const allLeagues = leaguesQ.data ?? [];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{league.leagueName || `League ${league.leagueId}`}</CardTitle>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>ESPN · League {league.leagueId}</span>
              <span>·</span>
              <SyncBadge status={league.syncStatus} />
            </div>
          </div>
          <Trophy className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {league.lastSyncedAt && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Last synced:{" "}
            {new Date(league.lastSyncedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        )}
        {allLeagues.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {allLeagues.length - 1} other connected league{allLeagues.length - 1 !== 1 ? "s" : ""}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
            <Link to="/sync"><RefreshCw className="h-3 w-3" /> Sync Now</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground">
            <Link to="/connect"><Settings className="h-3 w-3" /> Manage</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Pipeline Health Card ──────────────────────────────────────────────────────

function PipelineHealthCard() {
  const healthQ = trpc.pipeline.health.useQuery({});
  const manifestsQ = trpc.espn.manifests.useQuery();
  const cachedQ = trpc.espn.cachedSeasons.useQuery();

  if (healthQ.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking data health…
        </CardContent>
      </Card>
    );
  }

  const health = healthQ.data;
  const manifests = (manifestsQ.data as ManifestRow[] | undefined) ?? [];
  const cachedSeasons = cachedQ.data ?? [];

  // Pick the latest manifest to show recent sync detail
  const latest = [...manifests].sort((a, b) => b.season - a.season)[0];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Data Health
          </CardTitle>
          {health && <HealthIcon health={health.overallHealth} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border border-border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Seasons</div>
            <div className="mt-0.5 text-xl font-bold text-foreground">{cachedSeasons.length}</div>
          </div>
          <div className="rounded border border-border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Stale</div>
            <div className={cn("mt-0.5 text-xl font-bold", (health?.staleSeasons ?? 0) > 0 ? "text-yellow-400" : "text-foreground")}>
              {health?.staleSeasons ?? 0}
            </div>
          </div>
          <div className="rounded border border-border bg-muted/30 px-3 py-2 text-center">
            <div className="text-xs text-muted-foreground">Failed</div>
            <div className={cn("mt-0.5 text-xl font-bold", (health?.failedSeasons ?? 0) > 0 ? "text-red-400" : "text-foreground")}>
              {health?.failedSeasons ?? 0}
            </div>
          </div>
        </div>
        {latest && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Latest: <span className="font-medium text-foreground">{latest.season}</span></span>
            <SyncBadge status={latest.status} />
          </div>
        )}
        {health?.overallHealth === "healthy" ? null : health && (
          <div className="flex items-center gap-2 rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {health.overallHealth === "critical"
              ? "One or more seasons failed to sync."
              : health.staleSeasons > 0
                ? `${health.staleSeasons} season${health.staleSeasons !== 1 ? "s" : ""} may be stale.`
                : "Partial data on some seasons."}
            {" "}
            <Link to="/sync" className="underline underline-offset-2">Sync now</Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── League Pulse (standings snapshot) ────────────────────────────────────────

function LeaguePulseCard({ season }: { season: number }) {
  const pulseQ = trpc.weeklyAssessment.leaguePulse.useQuery(
    { season },
    { retry: false }
  );

  if (pulseQ.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            League Pulse · {season}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading standings…
        </CardContent>
      </Card>
    );
  }

  if (pulseQ.isError || !pulseQ.data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            League Pulse · {season}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            <LayoutDashboard className="mx-auto mb-2 h-6 w-6 opacity-40" />
            Standings available after first sync.
            <div className="mt-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
                <Link to="/sync"><RefreshCw className="h-3 w-3" /> Sync Data</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const pulse = pulseQ.data as {
    week: number;
    isSeasonComplete: boolean;
    teams: PulseTeam[];
  };

  const top5 = (pulse.teams ?? []).slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            League Pulse · {season}
            {pulse.isSeasonComplete
              ? " (Final)"
              : pulse.week ? ` · Week ${pulse.week}` : ""}
          </CardTitle>
          <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground">
            <Link to="/standings">
              All <ChevronRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {top5.map((team, idx) => (
          <div
            key={team.teamId}
            className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className={cn(
                "w-5 text-center text-xs font-bold",
                idx === 0 ? "text-primary" : "text-muted-foreground"
              )}>
                {idx + 1}
              </span>
              <div>
                <div className="text-sm font-medium text-foreground leading-tight">
                  {team.teamName}
                </div>
                <div className="text-xs text-muted-foreground">{team.ownerName}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">
                {team.wins}–{team.losses}
              </div>
              <div className="text-xs text-muted-foreground">
                {Number(team.pointsFor || 0).toFixed(0)} pts
              </div>
            </div>
          </div>
        ))}
        {(pulse.teams?.length ?? 0) > 5 && (
          <p className="pt-1 text-center text-xs text-muted-foreground">
            +{pulse.teams.length - 5} more teams
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "Connect ESPN", href: "/connect", icon: Plug, description: "Link your league" },
  { label: "Sync Data", href: "/sync", icon: RefreshCw, description: "Refresh season data" },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, description: "Adds, drops & trades" },
  { label: "Standings", href: "/standings", icon: Trophy, description: "League rankings" },
  { label: "Roster", href: "/roster", icon: Users, description: "Team rosters" },
  { label: "Trades", href: "/trades", icon: Repeat2, description: "Trade history & tools" },
  { label: "AI Advisor", href: "/advisor", icon: Bot, description: "GM strategy chat" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Preferences" },
] as const;

function QuickActionsGrid() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {QUICK_ACTIONS.map(({ label, href, icon: Icon, description }) => (
        <Link
          key={href}
          to={href}
          className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:bg-primary/5"
        >
          <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
          <ChevronRight className="mt-auto h-3.5 w-3.5 self-end text-muted-foreground/40 transition-colors group-hover:text-primary/60" />
        </Link>
      ))}
    </div>
  );
}

// ── Dashboard (root export) ───────────────────────────────────────────────────

export function Dashboard() {
  const leagueCtx = useLeagueContext();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Your GM War Room overview.
        </p>
      </div>

      {/* Top row: league + health */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActiveLeagueCard resolvedSeason={leagueCtx.season} />
        <PipelineHealthCard />
      </div>

      {/* League pulse */}
      <LeaguePulseCard season={leagueCtx.season} />

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Actions
        </h2>
        <QuickActionsGrid />
      </div>
    </div>
  );
}
