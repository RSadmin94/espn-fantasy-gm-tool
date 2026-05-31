import { trpc } from "@/lib/trpc";
import { Loader2, AlertTriangle, CheckCircle, Lock, Unlock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const trpcA = () => (trpc as any);

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block w-2.5 h-2.5 rounded-full flex-shrink-0",
        ok ? "bg-emerald-500" : "bg-muted-foreground/30"
      )}
    />
  );
}

function GateRow({ name, status, reason }: { name: string; status: string; reason: string }) {
  const isUnlocked = status === "unlocked";
  const isWarning  = status === "warning";
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0 text-sm">
      {isUnlocked ? (
        <Unlock className="h-4 w-4 text-emerald-500 flex-shrink-0" />
      ) : isWarning ? (
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
      ) : (
        <Lock className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
      )}
      <span className={cn("flex-1 font-medium", isUnlocked ? "text-foreground" : "text-muted-foreground")}>
        {name}
      </span>
      <span className="text-xs text-muted-foreground">{reason}</span>
    </div>
  );
}

export function LeagueDataHealth() {
  const q = trpcA().dataHealth.leagueOverview.useQuery(undefined, { staleTime: 60_000 });
  const d = q.data as any;

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Scanning league data…
      </div>
    );
  }
  if (!d) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <AlertTriangle className="mr-2 h-5 w-5" /> Unable to load data health report. Run Sync first.
      </div>
    );
  }

  const seasons: any[]     = d.seasonRows ?? [];
  const gates: any[]       = d.featureGates ?? [];
  const readiness: number  = d.readinessScore ?? 0;
  const ownerRes: number   = d.ownerResolution ?? 0;

  const apiSeasons   = seasons.filter((s: any) => s.apiSeason);
  const legacySeasons = seasons.filter((s: any) => !s.apiSeason);
  const fullCount    = apiSeasons.filter((s: any) => s.teams > 0 && s.draftPicks > 0 && s.matchups > 0).length;

  const ringColor = readiness >= 85 ? "#10b981" : readiness >= 65 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 40;
  const dash = (readiness / 100) * circumference;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">League Data Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Atlantas Finest FF · League {d.leagueId}
        </p>
      </div>

      {/* Top row: readiness ring + summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center p-5 sm:col-span-1">
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
            <circle
              cx="48" cy="48" r="40" fill="none"
              stroke={ringColor} strokeWidth="10"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="mt-3 text-center">
            <div className="text-2xl font-bold text-foreground">{readiness}</div>
            <div className="text-xs text-muted-foreground">readiness score</div>
          </div>
        </div>

        {[
          { label: "API Seasons (2018+)", value: `${fullCount} / ${apiSeasons.length} complete` },
          { label: "Owner Resolution", value: `${ownerRes}% resolved` },
          { label: "Legacy Seasons", value: `${legacySeasons.filter((s:any)=>s.draftPicks>0).length} / ${legacySeasons.length} with draft data` },
        ].map(stat => (
          <div key={stat.label} className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{stat.label}</div>
            <div className="text-base font-semibold text-foreground">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Season coverage table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Season Coverage</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-4">Season</th>
                <th className="text-center px-3">Type</th>
                <th className="text-center px-3">Teams</th>
                <th className="text-center px-3">Draft Picks</th>
                <th className="text-center px-3">Matchups</th>
                <th className="text-center px-3">Medals</th>
                <th className="text-center px-3">Weekly Stats</th>
              </tr>
            </thead>
            <tbody>
              {[...seasons].reverse().map((s: any, i: number) => {
                const full = s.teams > 0 && s.draftPicks > 0 && (s.apiSeason ? s.matchups > 0 : true);
                return (
                  <tr key={s.season} className={cn("border-b border-border/30 hover:bg-muted/10", i % 2 === 0 ? "" : "bg-muted/5")}>
                    <td className="py-2 px-4 font-medium text-foreground">{s.season}</td>
                    <td className="text-center px-3">
                      <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px] font-medium",
                        s.apiSeason ? "bg-blue-900/30 text-blue-300 border border-blue-700" : "bg-muted/40 text-muted-foreground border border-border")}>
                        {s.apiSeason ? "API" : "Legacy"}
                      </span>
                    </td>
                    <td className="text-center px-3 text-muted-foreground">{s.teams > 0 ? s.teams : "—"}</td>
                    <td className="text-center px-3 text-muted-foreground">{s.draftPicks > 0 ? s.draftPicks : "—"}</td>
                    <td className="text-center px-3 text-muted-foreground">{s.matchups > 0 ? s.matchups : "—"}</td>
                    <td className="text-center px-3"><StatusDot ok={s.medals} /></td>
                    <td className="text-center px-3"><StatusDot ok={s.weeklyStats} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Feature gates */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-2.5 border-b border-border bg-muted/20">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Feature Gates</h2>
        </div>
        <div className="px-4 py-2">
          {gates.map((g: any) => (
            <GateRow key={g.name} name={g.name} status={g.status} reason={g.reason} />
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-border bg-muted/10">
          <p className="text-xs text-muted-foreground">
            Blocked features require the <span className="font-medium text-foreground">gmWeeklyPlayerStats</span> pipeline (Phase 2). All unlocked features use existing stored data.
          </p>
        </div>
      </div>
    </div>
  );
}
