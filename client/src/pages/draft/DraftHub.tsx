/**
 * Canonical V2 Draft hub at `/draft`.
 * Curates draft status from existing War Room / keeper / history signals.
 * Does not duplicate the War Room or invent projections.
 *
 * RFSN-013 — Live Draft is the real-draft entry; Mock Draft is practice only.
 */
import { Link } from "react-router";
import {
  Calendar,
  Clapperboard,
  Crown,
  Radio,
  ScrollText,
  Target,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { useLeagueContext } from "@/hooks/useLeagueContext";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";

const DESTINATIONS = [
  { label: "Live Draft", href: "/draft/live", hint: "RFSN draft or connected-league real draft → booth", icon: Radio },
  { label: "Mock Draft", href: "/draft/mock", hint: "External simulated drafts (FantasyPros)", icon: Target },
  { label: "Keeper Center", href: "/draft/keepers", hint: "Keeper Manager & forecast", icon: Crown },
  { label: "Draft History", href: "/draft/history", hint: "Past boards & picks", icon: ScrollText },
] as const;

export function DraftHub() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const { season } = useLeagueContext();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const warRoomQ = trpc.draftWarRoom.getDraftWarRoomData.useQuery(
    withLeagueSalt({ season }, leagueContextKey),
    { enabled: ready, staleTime: 60_000 },
  );
  const liveAccessQ = (trpc as any).rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled: ready,
    staleTime: 60_000,
  });
  const forecastQ = trpc.espn.leagueKeeperForecast.useQuery(
    withLeagueSalt({ draftYear: season }, leagueContextKey),
    { enabled: ready, staleTime: 120_000 },
  );

  const data = ready && warRoomQ.data?.ok ? warRoomQ.data : null;
  const loading = ready && warRoomQ.isLoading;
  const showLive = Boolean(liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess);

  const teamCount = data?.teamCount as number | undefined;
  const totalPicks = data?.totalPicks as number | undefined;
  const keepersOn = data?.leagueCapabilities?.keepers !== false;
  const draftBoardSummary = data?.draftBoardSummary as
    | { boardSlotCount?: number; openDraftPickCount?: number }
    | null
    | undefined;
  const forecastRows = Array.isArray((forecastQ.data as { forecast?: unknown[] } | undefined)?.forecast)
    ? ((forecastQ.data as { forecast: unknown[] }).forecast.length)
    : null;

  const statusLine = data
    ? [
        teamCount != null ? `${teamCount} teams` : null,
        totalPicks != null ? `${totalPicks} picks` : null,
        draftBoardSummary?.openDraftPickCount != null
          ? `${draftBoardSummary.openDraftPickCount} open draft slots`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const nextAction = !data
    ? {
        title: "Sync league data, then open Live Draft",
        href: "/draft/live",
        detail: "Live Draft monitors your connected league and feeds the RFSN booth.",
      }
    : keepersOn && (forecastRows == null || forecastRows === 0)
      ? {
          title: "Review keeper outlook",
          href: "/draft/keepers",
          detail: "Keeper Center is the official place to manage keepers for every team in your workspace.",
        }
      : {
          title: "Open Live Draft",
          href: "/draft/live",
          detail: "Real draft monitoring and booth coverage start here.",
        };

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-draft-hub>
      <CinematicPageHeader
        eyebrowMono="Draft"
        icon={Calendar}
        title="Draft"
        subtitle="Prepare, execute, understand, and review the draft."
        className="mb-5"
        meta={
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {season}
          </span>
        }
      />

      <main className="mx-auto max-w-[1100px] space-y-6">
        {loading ? (
          <IntelPanel variant="card">
            <SectionLoading message="Loading draft status…" className="justify-center py-12" />
          </IntelPanel>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Draft status
          </h2>
          <IntelPanel variant="card" className="px-4 py-4 space-y-2">
            {statusLine ? (
              <p className="text-sm text-foreground">{statusLine}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Draft board and prep signals appear after league sync.
              </p>
            )}
            {keepersOn ? (
              <p className="text-xs text-muted-foreground">
                Keepers enabled
                {forecastRows != null ? ` · ${forecastRows} forecast rows` : ""}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Redraft league — Keeper Center still available for tools when configured.</p>
            )}
          </IntelPanel>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Next action
          </h2>
          <IntelPanel variant="card" className="px-4 py-4">
            <p className="text-base font-semibold text-foreground">{nextAction.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{nextAction.detail}</p>
            <Link
              to={nextAction.href}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
            >
              Continue →
            </Link>
          </IntelPanel>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <IntelPanel variant="card" className="px-4 py-4">
            <div className="mb-2 flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-foreground">Live Draft</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Run the RFSN draft experience or connect to your real league draft.
            </p>
            <Link
              to="/draft/live"
              className="mt-3 inline-flex text-xs font-bold text-lime-400 hover:text-lime-300"
            >
              Switch to Live Draft →
            </Link>
          </IntelPanel>
          <IntelPanel variant="card" className="px-4 py-4">
            <div className="mb-2 flex items-center gap-2">
              <Clapperboard className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-bold text-foreground">Mock Draft</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Connect RFSN to an external simulated draft (FantasyPros Mock).
            </p>
            <Link
              to="/draft/mock"
              className="mt-3 inline-flex text-xs font-bold text-lime-400 hover:text-lime-300"
            >
              Switch to Mock Draft →
            </Link>
          </IntelPanel>
        </section>

        {showLive ? (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Live coverage
            </h2>
            <IntelPanel variant="card" className="px-4 py-4">
              <div className="flex items-start gap-2">
                <Radio className="mt-0.5 h-4 w-4 text-red-400" />
                <div>
                  <p className="text-sm text-foreground">
                    RFSN Live presents the draft booth. Controls stay in Live Draft.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    <Link to="/rfsn/live" className="text-xs font-bold text-lime-400 hover:text-lime-300">
                      Open RFSN Live →
                    </Link>
                    <Link to="/draft/live" className="text-xs font-bold text-muted-foreground hover:text-foreground">
                      Live Draft controls →
                    </Link>
                  </div>
                </div>
              </div>
            </IntelPanel>
          </section>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Draft destinations
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
          <Link
            to="/draft/war-room"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Zap className="h-3.5 w-3.5" />
            War Room prep desk →
          </Link>
        </section>
      </main>
    </IntelPageShell>
  );
}
