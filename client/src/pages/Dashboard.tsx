import { useMemo } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowLeftRight,
  Bot,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Plug,
  RefreshCw,
  Trophy,
  Users,
  Repeat2,
  Settings,
} from "lucide-react";

import { DevBuildDiagnostics } from "@/components/DevBuildDiagnostics";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PulseTeam {
  teamId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  desperationScore: number;
}

/** Defensive normalized row for standings payloads that may vary by shape/version. */
interface NormalizedStanding {
  teamId: number;
  teamName: string;
  ownerName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** ESPN final rank when present */
  rankFinal: number | null;
  displayRank: number;
}

type StandingWithoutDisplayRank = Omit<NormalizedStanding, "displayRank">;

// ── Standings helpers (aligned with Standings page tie-break logic) ───────────

function num(n: number | undefined | null): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function pickNum(...vals: unknown[]): number {
  for (const v of vals) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function winPct(t: Pick<NormalizedStanding, "wins" | "losses" | "ties">): number {
  const w = num(t.wins);
  const l = num(t.losses);
  const ti = num(t.ties);
  const g = w + l + ti;
  return g > 0 ? (w + 0.5 * ti) / g : 0;
}

function compareRegular(a: StandingWithoutDisplayRank, b: StandingWithoutDisplayRank): number {
  const dPct = winPct(b) - winPct(a);
  if (Math.abs(dPct) > 1e-9) return dPct;
  return num(b.pointsFor) - num(a.pointsFor);
}

function compareFinal(a: StandingWithoutDisplayRank, b: StandingWithoutDisplayRank): number {
  const ra = a.rankFinal != null && Number.isFinite(a.rankFinal) ? a.rankFinal : 999;
  const rb = b.rankFinal != null && Number.isFinite(b.rankFinal) ? b.rankFinal : 999;
  if (ra !== rb) return ra - rb;
  return compareRegular(a, b);
}

function normalizeStandingRow(raw: unknown): Omit<NormalizedStanding, "displayRank"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const teamId = pickNum(r.teamId, r.id);
  if (!Number.isFinite(teamId) || teamId <= 0) return null;
  const teamName = String(r.teamName ?? r.name ?? `Team ${teamId}`).trim() || `Team ${teamId}`;
  const ownerName = String(r.owners ?? r.ownerName ?? r.owner ?? "").trim();
  const wins = pickNum(r.wins);
  const losses = pickNum(r.losses);
  const ties = pickNum(r.ties);
  const pointsFor = pickNum(r.pointsFor, r.PF);
  const pointsAgainst = pickNum(r.pointsAgainst, r.PA);
  let rankFinal: number | null = null;
  for (const key of ["rankFinal", "rank", "standing"]) {
    const v = r[key];
    if (v != null && Number.isFinite(Number(v)) && Number(v) > 0) {
      rankFinal = Number(v);
      break;
    }
  }
  if (rankFinal == null) {
    const ps = r.playoffSeed;
    if (ps != null && Number.isFinite(Number(ps)) && Number(ps) > 0) {
      rankFinal = Number(ps);
    }
  }
  return {
    teamId,
    teamName,
    ownerName,
    wins,
    losses,
    ties,
    pointsFor,
    pointsAgainst,
    rankFinal,
  };
}

function rankStandings(rows: Omit<NormalizedStanding, "displayRank">[]): NormalizedStanding[] {
  const sorted = [...rows].sort(compareFinal);
  return sorted.map((t, i) => ({ ...t, displayRank: i + 1 }));
}

function threatTone(rank: number): { label: string; className: string } {
  if (rank <= 3) return { label: "High threat", className: "border-red-500/35 bg-red-500/10 text-red-300" };
  if (rank <= 6) return { label: "Elevated", className: "border-yellow-500/35 bg-yellow-500/10 text-yellow-200" };
  return { label: "Normal", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200/90" };
}

function formatRecord(t: NormalizedStanding): string {
  return `${num(t.wins)}-${num(t.losses)}-${num(t.ties)}`;
}

// ── Executive Summary ─────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  sub,
  valueClassName,
}: {
  title: string;
  value: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <Card className="border-border/80">
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        <div className={cn("text-2xl font-bold tabular-nums tracking-tight text-foreground", valueClassName)}>
          {value}
        </div>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

function ExecutiveSummarySkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border/60">
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutiveSummary() {
  const leagueCtx = useLeagueContext();
  const effectiveSeason =
    leagueCtx.season > 0 ? leagueCtx.season : 2026;

  const standingsQ = trpc.espn.standings.useQuery(
    { season: effectiveSeason },
    { enabled: !leagueCtx.isLoading, staleTime: 60_000 }
  );

  const ranked = useMemo(() => {
    const raw = standingsQ.data;
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const base = raw
      .map(normalizeStandingRow)
      .filter((r): r is NonNullable<typeof r> => r != null);
    return rankStandings(base);
  }, [standingsQ.data]);

  const myRow = useMemo(() => {
    if (leagueCtx.myTeamId == null) return null;
    return ranked.find((t) => t.teamId === leagueCtx.myTeamId) ?? null;
  }, [ranked, leagueCtx.myTeamId]);

  const leagueAvgPf = useMemo(() => {
    if (ranked.length === 0) return 0;
    const sum = ranked.reduce((a, t) => a + num(t.pointsFor), 0);
    return sum / ranked.length;
  }, [ranked]);

  const diff = useMemo(() => {
    if (!myRow) return null;
    return num(myRow.pointsFor) - num(myRow.pointsAgainst);
  }, [myRow]);

  const showSkeleton = leagueCtx.isLoading || standingsQ.isLoading || standingsQ.isFetching;

  if (showSkeleton) {
    return (
      <section className="space-y-4" aria-busy="true" aria-label="Executive summary loading">
        <ExecutiveSummarySkeleton />
      </section>
    );
  }

  if (standingsQ.isError) {
    return (
      <section className="space-y-4" aria-label="Executive summary error">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Executive Summary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Season <span className="font-medium text-foreground">{effectiveSeason}</span>
          </p>
        </div>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center text-sm">
            <AlertCircle className="h-8 w-8 text-destructive/80" />
            <p className="text-foreground">Could not load standings.</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Check your connection and try again. If the problem persists, confirm ESPN sync completed for this season.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => void standingsQ.refetch()}
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const emptyStandings = !standingsQ.isLoading && ranked.length === 0;

  return (
    <section className="space-y-6" aria-label="Executive summary">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Executive Summary</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {leagueCtx.leagueId ? (
            <>
              League <span className="font-mono text-foreground/90">{leagueCtx.leagueId}</span>
              <span className="mx-1.5">·</span>
            </>
          ) : null}
          Season <span className="font-medium text-foreground">{effectiveSeason}</span>
        </p>
      </div>

      {emptyStandings ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
            <p>No standings data for {effectiveSeason}.</p>
            <p className="max-w-md text-xs">
              Sync your league from ESPN, then open the Standings page to confirm data is cached for this season.
            </p>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link to="/sync">
                <RefreshCw className="h-4 w-4" /> Sync data
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Your rank"
              value={myRow ? String(myRow.displayRank) : "—"}
              sub={myRow ? `of ${ranked.length}` : leagueCtx.myTeamId == null ? "Team not linked to profile" : undefined}
            />
            <MetricCard
              title="Points for"
              value={myRow ? num(myRow.pointsFor).toFixed(1) : "—"}
            />
            <MetricCard
              title="Points against"
              value={myRow ? num(myRow.pointsAgainst).toFixed(1) : "—"}
            />
            <MetricCard
              title="Point differential"
              value={
                diff == null
                  ? "—"
                  : (() => {
                      const z = Math.abs(diff) < 0.05;
                      const sign = z ? "" : diff > 0 ? "+" : "";
                      return `${sign}${diff.toFixed(1)}`;
                    })()
              }
              valueClassName={
                diff == null
                  ? undefined
                  : Math.abs(diff) < 0.05
                    ? "text-muted-foreground"
                    : diff > 0
                      ? "text-emerald-400"
                      : "text-red-400"
              }
            />
            <MetricCard
              title="League avg PF"
              value={leagueAvgPf.toFixed(1)}
              sub={`Across ${ranked.length} teams`}
            />
            <MetricCard
              title="Record"
              value={myRow ? formatRecord(myRow) : "—"}
              sub={myRow ? "W-L-T" : undefined}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-foreground">Threat assessment</CardTitle>
              <p className="text-xs text-muted-foreground">
                Full board sorted by standing. Top 3: high threat. Ranks 4–6: elevated. Rest: normal.
              </p>
            </CardHeader>
            <CardContent className="space-y-0 p-0 sm:px-0">
              {/* Mobile: stacked rows */}
              <div className="divide-y divide-border sm:hidden">
                {ranked.map((t) => {
                  const isMine = leagueCtx.myTeamId != null && t.teamId === leagueCtx.myTeamId;
                  const tone = threatTone(t.displayRank);
                  return (
                    <div
                      key={t.teamId}
                      className={cn(
                        "flex flex-col gap-2 px-4 py-3",
                        isMine && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-lg font-bold text-foreground tabular-nums">#{t.displayRank}</span>
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            tone.className
                          )}
                        >
                          {tone.label}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">{t.teamName}</div>
                        <div className="text-xs text-muted-foreground">{t.ownerName || "—"}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-muted-foreground">Record</span>
                        <span className="font-mono font-medium text-foreground">{formatRecord(t)}</span>
                        <span className="text-muted-foreground">PF</span>
                        <span className="font-mono font-medium text-foreground">{num(t.pointsFor).toFixed(1)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* sm+: table-style grid */}
              <div className="hidden sm:block overflow-x-auto">
                <div
                  className="min-w-[640px] grid grid-cols-[2.5rem_1.2fr_1fr_5.5rem_4rem_7rem] gap-x-2 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  role="row"
                >
                  <div>#</div>
                  <div>Team</div>
                  <div>Owner</div>
                  <div className="text-right">Rec</div>
                  <div className="text-right">PF</div>
                  <div className="text-center">Threat</div>
                </div>
                {ranked.map((t) => {
                  const isMine = leagueCtx.myTeamId != null && t.teamId === leagueCtx.myTeamId;
                  const tone = threatTone(t.displayRank);
                  return (
                    <div
                      key={t.teamId}
                      role="row"
                      className={cn(
                        "min-w-[640px] grid grid-cols-[2.5rem_1.2fr_1fr_5.5rem_4rem_7rem] gap-x-2 items-center border-b border-border/70 px-4 py-2.5 text-sm",
                        isMine && "bg-blue-500/10 ring-1 ring-inset ring-blue-500/25"
                      )}
                    >
                      <div className="font-bold tabular-nums text-foreground">{t.displayRank}</div>
                      <div className="min-w-0 font-medium text-foreground truncate">{t.teamName}</div>
                      <div className="min-w-0 text-muted-foreground truncate text-xs">{t.ownerName || "—"}</div>
                      <div className="text-right font-mono text-xs text-foreground">{formatRecord(t)}</div>
                      <div className="text-right font-mono text-xs text-foreground">{num(t.pointsFor).toFixed(1)}</div>
                      <div className="flex justify-center">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            tone.className
                          )}
                        >
                          {tone.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </section>
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
  const pulseSeason = leagueCtx.season > 0 ? leagueCtx.season : 2026;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Your GM War Room command center.
        </p>
      </div>

      <DevBuildDiagnostics />

      <ExecutiveSummary />

      <LeaguePulseCard season={pulseSeason} />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick Actions
        </h2>
        <QuickActionsGrid />
      </div>
    </div>
  );
}
