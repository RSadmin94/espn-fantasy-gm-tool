/**
 * Canonical V2 League hub at `/league`.
 * Factual overview + shortcuts — does not duplicate League Archives or Home.
 */
import { Link } from "react-router";
import {
  Award,
  Building2,
  Crown,
  History,
  ShoppingCart,
  Shield,
  Trophy,
  ArrowLeftRight,
  Gem,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";

const DESTINATIONS = [
  { label: "Standings", href: "/league/standings", hint: "Current season record", icon: Trophy },
  { label: "Power Rankings", href: "/league/standings/power-rankings", hint: "Roster strength", icon: Gem },
  { label: "History", href: "/league/history", hint: "Full league archive", icon: History },
  { label: "Champions", href: "/league/history/champions", hint: "Title authority", icon: Crown },
  { label: "Hall of Fame", href: "/league/history/hall-of-fame", hint: "Archive honor roll", icon: Award },
  { label: "Records", href: "/league/history/records", hint: "Record book", icon: Trophy },
  { label: "Dynasties", href: "/league/history/dynasties", hint: "Legacy spans", icon: Building2 },
  { label: "Timeline", href: "/league/history/timeline", hint: "Milestones", icon: History },
  { label: "Transactions", href: "/league/history/transactions", hint: "Factual trade archive", icon: ArrowLeftRight },
  { label: "Acquisition Impact", href: "/league/acquisition-impact", hint: "Post-draft impact", icon: ShoppingCart },
  { label: "Commissioner", href: "/league/commissioner", hint: "League command", icon: Shield },
] as const;

export function LeagueHub() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const activeQ = trpc.league.getActive.useQuery(undefined, { enabled: ready, staleTime: 60_000 });
  const hofQ = trpc.espn.hallOfFame.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 120_000,
  });
  const cachedQ = trpc.espn.cachedSeasons.useQuery(withLeagueSalt({}, leagueContextKey), {
    enabled: ready,
    staleTime: 120_000,
  });

  const loading = ready && (activeQ.isLoading || hofQ.isLoading);
  const leagueName = activeQ.data?.leagueName ? String(activeQ.data.leagueName) : null;
  const seasons: number[] = ready ? ((cachedQ.data as number[] | undefined) ?? []) : [];
  const seasonSpan =
    seasons.length > 0 ? `${Math.min(...seasons)}–${Math.max(...seasons)}` : null;

  const hof = hofQ.data as
    | {
        championships?: {
          leaderboard?: Array<{ displayName?: string; titles?: number }>;
        };
        coverage?: { seasonsTouched?: number[] };
      }
    | undefined;

  const lb = hof?.championships?.leaderboard ?? [];
  // Presentation-only: sum rows already returned by esp.hallOfFame — not a stored or reusable authority.
  const totalTitles = lb.reduce((s, r) => s + (r.titles ?? 0), 0);
  const reigning =
    lb[0]?.displayName != null
      ? `${lb[0].displayName}${lb[0].titles != null ? ` · ${lb[0].titles} titles` : ""}`
      : null;
  const coverageSeasons =
    Array.isArray(hof?.coverage?.seasonsTouched) && hof!.coverage!.seasonsTouched!.length > 0
      ? hof!.coverage!.seasonsTouched!
      : seasons;
  const leagueAge =
    coverageSeasons.length > 0
      ? Math.max(...coverageSeasons) - Math.min(...coverageSeasons) + 1
      : null;
  const seasonSpanDisplay =
    coverageSeasons.length > 0
      ? `${Math.min(...coverageSeasons)}–${Math.max(...coverageSeasons)}`
      : seasonSpan;

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-league-hub>
      <CinematicPageHeader
        eyebrowMono="League"
        icon={Building2}
        title="League"
        subtitle="What is true about this league, how it is structured, and what has happened across its history."
        className="mb-5"
        meta={
          leagueName ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {leagueName}
            </span>
          ) : null
        }
      />

      <main className="mx-auto max-w-[1100px] space-y-6">
        {loading ? (
          <IntelPanel variant="card">
            <SectionLoading message="Loading league overview…" className="justify-center py-12" />
          </IntelPanel>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            League identity
          </h2>
          <IntelPanel variant="card" className="grid gap-3 px-4 py-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Name</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{leagueName ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Coverage</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{seasonSpanDisplay ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">League age</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {leagueAge != null ? `${leagueAge} seasons` : "—"}
              </p>
            </div>
          </IntelPanel>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <IntelPanel variant="card" className="px-4 py-4">
            <h3 className="text-sm font-bold text-foreground">Titles on record</h3>
            <p className="mt-1 text-2xl font-black tabular-nums text-amber-300">
              {lb.length > 0 ? totalTitles : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Hub preview only — summed from the Hall of Fame championship leaderboard response, not a separate title
              authority.
            </p>
            {reigning ? (
              <p className="mt-2 text-xs text-muted-foreground">Leaderboard lead: {reigning}</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Championship facts load from League Archives.</p>
            )}
            <Link
              to="/league/history/champions"
              className="mt-3 inline-flex text-xs font-bold text-lime-400 hover:text-lime-300"
            >
              Open Champions →
            </Link>
          </IntelPanel>
          <IntelPanel variant="card" className="px-4 py-4">
            <h3 className="text-sm font-bold text-foreground">Current season</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Standings and factual transactions live under League — not RFSN Wire.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link to="/league/standings" className="text-xs font-bold text-lime-400 hover:text-lime-300">
                Standings →
              </Link>
              <Link
                to="/league/history/transactions"
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Transactions →
              </Link>
            </div>
          </IntelPanel>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Archive & administration
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {DESTINATIONS.map((d) => {
              const Icon = d.icon;
              return (
                <Link
                  key={d.href}
                  to={d.href}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition-colors hover:border-lime-500/30 hover:bg-card/70"
                >
                  <Icon className="h-4 w-4 shrink-0 text-lime-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{d.label}</p>
                    <p className="text-xs text-muted-foreground">{d.hint}</p>
                  </div>
                </Link>
              );
            })}
          </div>
          <p className="pt-2 text-[11px] text-muted-foreground">
            Account sync and league rules remain under header utilities:{" "}
            <Link to="/league-settings" className="font-medium text-foreground underline-offset-2 hover:underline">
              League Settings
            </Link>
            ,{" "}
            <Link to="/sync" className="font-medium text-foreground underline-offset-2 hover:underline">
              Sync Data
            </Link>
            .
          </p>
        </section>
      </main>
    </IntelPageShell>
  );
}
