/**
 * Canonical V2 Rivals hub at `/rivals`.
 * Curates existing Cast, rivalry, DNA behavior, and H2H signals — no new calculations.
 */
import { Link } from "react-router";
import { Clapperboard, Map as MapIcon, Network, Swords, Users, Award } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { castMemberDossierOwnerKey, rivalsOwnerDossierPath } from "@/lib/ownerIdentity";
import { RivalrySummaryCard } from "@/components/RivalrySummaryCard";
import { OwnerBehaviorDnaInsight } from "@/components/rivals/OwnerBehaviorDnaInsight";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";

const DESTINATIONS = [
  { label: "The Cast", href: "/rivals/cast", hint: "League characters", icon: Clapperboard },
  { label: "Owner Dossier", href: "/rivals/owners", hint: "Manager scouting", icon: Users },
  { label: "Award Catalog", href: "/rivals/awards", hint: "What awards mean", icon: Award },
  { label: "Rivalries", href: "/rivals/rivalries", hint: "Heat, feuds & series records", icon: Swords },
] as const;

export function RivalsHub() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const castQ = (trpc as any).dna.leagueCast.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });
  const scoresQ = (trpc as any).rivalry.getScores.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 300_000,
    enabled: ready,
  });
  const h2hQ = (trpc as any).rivalry.h2h.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 600_000,
    enabled: ready,
  });
  const listQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });

  const cast = (castQ.data?.cast ?? []) as Array<{
    memberId: string;
    ownerKey?: string;
    ownerName: string;
    archetype: string;
    isYou?: boolean;
  }>;
  const castPreview = cast.slice(0, 6);
  const leagueName = String(castQ.data?.leagueName ?? "Your league");

  const rivalries = Array.isArray(scoresQ.data?.rivalries)
    ? scoresQ.data.rivalries
    : Array.isArray(scoresQ.data)
      ? scoresQ.data
      : [];
  const topRival = rivalries[0] as
    | { rivalName?: string; heatLabel?: string; loreSentence?: string; rivalryScore?: number }
    | undefined;

  const h2hPairs = Array.isArray(h2hQ.data?.pairs) ? h2hQ.data.pairs : [];
  const topMeeting = [...h2hPairs]
    .sort((a: any, b: any) => Number(b.meetings ?? 0) - Number(a.meetings ?? 0))[0] as
    | { a?: string; b?: string; meetings?: number; aWins?: number; aLosses?: number }
    | undefined;

  const activeCount = Array.isArray(listQ.data?.active) ? listQ.data.active.length : cast.length;
  const loading = ready && (castQ.isLoading || scoresQ.isLoading);

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-rivals-hub>
      <CinematicPageHeader
        eyebrowMono="Rivals"
        icon={Swords}
        title="Rivals"
        subtitle={`${leagueName} — who they are, how they behave, and what history you share.`}
        className="mb-5"
        meta={
          <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {activeCount ? `${activeCount} owners` : "League cast"}
          </span>
        }
      />

      <main className="mx-auto max-w-[1100px] space-y-6">
        {loading ? (
          <IntelPanel variant="card">
            <SectionLoading message="Loading rivals intelligence…" className="justify-center py-12" />
          </IntelPanel>
        ) : null}

        {/* Featured rival / current threat */}
        {(topRival?.rivalName || !loading) && (
          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Featured rival
              </h2>
              <Link to="/rivals/rivalries" className="text-xs font-medium text-violet-400 hover:text-violet-300">
                Open Rivalries →
              </Link>
            </div>
            {topRival?.rivalName ? (
              <RivalrySummaryCard />
            ) : (
              <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
                Rivalry heat appears after synced head-to-head history.
              </IntelPanel>
            )}
            {topRival?.loreSentence ? (
              <p className="text-sm text-muted-foreground">{String(topRival.loreSentence)}</p>
            ) : null}
          </section>
        )}

        {/* Cast preview */}
        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">The Cast</h2>
            <Link to="/rivals/cast" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Full cast →
            </Link>
          </div>
          {castPreview.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Cast cards appear once league DNA and owner profiles are ready.
            </IntelPanel>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {castPreview.map((m) => (
                <Link
                  key={m.memberId}
                  to={rivalsOwnerDossierPath(castMemberDossierOwnerKey(m))}
                  className="rounded-xl border border-border/70 bg-card/40 px-3 py-3 transition-colors hover:border-violet-500/40 hover:bg-card/70"
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300/90">
                    {m.archetype}
                  </div>
                  <div className="mt-1 text-sm font-bold text-foreground">
                    {m.ownerName}
                    {m.isYou ? <span className="ml-2 text-[10px] font-black text-lime-400">YOU</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Behavioral DNA insight (owner-behavior slice of League DNA) */}
        <OwnerBehaviorDnaInsight />

        {/* H2H snapshot */}
        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Head-to-head snapshot
            </h2>
            <Link to="/rivals/rivalries" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Full rivalries →
            </Link>
          </div>
          {topMeeting ? (
            <IntelPanel variant="card" className="px-4 py-4">
              <div className="text-base font-bold text-foreground">
                {String(topMeeting.a)} <span className="text-muted-foreground">vs</span> {String(topMeeting.b)}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Most meetings in league history: <b className="text-foreground">{Number(topMeeting.meetings ?? 0)}</b>
                {topMeeting.aWins != null && topMeeting.aLosses != null
                  ? ` · series ${Number(topMeeting.aWins)}–${Number(topMeeting.aLosses)}`
                  : ""}
              </p>
            </IntelPanel>
          ) : (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Head-to-head series light up after matchup history syncs.
            </IntelPanel>
          )}
        </section>

        {/* Map previews */}
        <section className="grid gap-3 md:grid-cols-2">
          <Link
            to="/rivals/league-map"
            className="rounded-xl border border-border/70 bg-card/40 px-4 py-4 transition-colors hover:border-violet-500/40"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <MapIcon className="h-4 w-4 text-violet-300" /> League Map
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Owner landscape, championship hierarchy, and rivalry clusters from existing league data.
            </p>
          </Link>
          <Link
            to="/rivals/relationships"
            className="rounded-xl border border-border/70 bg-card/40 px-4 py-4 transition-colors hover:border-violet-500/40"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Network className="h-4 w-4 text-violet-300" /> Relationship Map
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Strongest rivalries, playoff nemeses, and high-volume series — no invented scores.
            </p>
          </Link>
        </section>

        {/* Destination links */}
        <section className="space-y-2 border-t border-border/60 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Explore Rivals
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.href}
                to={d.href}
                className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-3 transition-colors hover:border-violet-500/40 hover:bg-card/50"
              >
                <d.icon className="h-4 w-4 shrink-0 text-violet-300" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{d.label}</div>
                  <div className="text-[11px] text-muted-foreground">{d.hint}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </IntelPageShell>
  );
}
