/**
 * Canonical V2 My Team hub at `/my-team`.
 * Curates authenticated-owner context from me.ownerHome + existing team signals.
 */
import { Link } from "react-router";
import {
  Bot,
  Route,
  Repeat2,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { displayOwnerName } from "@/lib/ownerName";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";

const DESTINATIONS = [
  { label: "Roster", href: "/my-team/roster", hint: "Lineup & players", icon: Users },
  { label: "Matchup", href: "/my-team/matchup", hint: "This week's battle", icon: Swords },
  { label: "Trades", href: "/my-team/trades", hint: "Trade analyzer", icon: Repeat2 },
  { label: "GM Advisor", href: "/my-team/advisor", hint: "Recommended actions", icon: Bot },
  { label: "My GM", href: "/my-team/profile", hint: "Your identity", icon: Trophy },
  { label: "Championship Path", href: "/my-team/championship-path", hint: "Title blockers", icon: Route },
] as const;

export function MyTeamHub() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const homeQ = trpc.me.ownerHome.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });
  const dnaQ = (trpc as any).dna.myProfile.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });
  const scoresQ = (trpc as any).rivalry.getScores.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 300_000,
    enabled: ready,
  });

  const owner = homeQ.data?.owner as
    | { ownerKey?: string; displayName?: string; isSetupComplete?: boolean }
    | null
    | undefined;
  const career = homeQ.data?.careerRecord as
    | {
        wins?: number;
        losses?: number;
        winPct?: number;
        seasonsActive?: number;
        playoffAppearances?: number;
      }
    | null
    | undefined;
  const titles = homeQ.data?.championships as { count?: number; seasons?: number[] } | null | undefined;
  const rival = homeQ.data?.rival as { rivalName?: string; heatLabel?: string } | null | undefined;
  const threat = homeQ.data?.threat?.primary as { rivalName?: string; reason?: string } | null | undefined;

  const rivalries = Array.isArray(scoresQ.data?.rivalries)
    ? scoresQ.data.rivalries
    : Array.isArray(scoresQ.data)
      ? scoresQ.data
      : [];
  const topRival = rivalries[0] as { rivalName?: string; heatLabel?: string } | undefined;

  const dna = dnaQ.data as
    | { archetype?: string; blindSpot?: string; primaryTrait?: string; ratings?: any }
    | null
    | undefined;

  const displayName = displayOwnerName(owner?.ownerKey, owner?.displayName);
  const loading = ready && (homeQ.isLoading || dnaQ.isLoading);

  const recordLine =
    career && career.wins != null
      ? `${career.wins}-${career.losses}${career.winPct != null ? ` · ${(career.winPct * 100).toFixed(0)}%` : ""}`
      : null;

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-my-team-hub>
      <CinematicPageHeader
        eyebrowMono="My Team"
        icon={Users}
        title="My Team"
        subtitle="What you need to know and do about your own team."
        className="mb-5"
        meta={
          owner?.isSetupComplete ? (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-label font-bold uppercase tracking-wider text-muted-foreground">
              {displayName}
            </span>
          ) : (
            <span className="rounded-full border border-amber-500/30 px-2.5 py-0.5 text-label font-bold uppercase tracking-wider text-amber-300">
              Setup needed
            </span>
          )
        }
      />

      <main className="mx-auto max-w-[1100px] space-y-6">
        {loading ? (
          <IntelPanel variant="card">
            <SectionLoading message="Loading your team…" className="justify-center py-12" />
          </IntelPanel>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Your identity
          </h2>
          <IntelPanel variant="card" className="px-4 py-4">
            {!owner?.isSetupComplete && !owner?.ownerKey ? (
              <p className="text-sm text-muted-foreground">
                Select your team in Settings so My Team can bind to your authenticated owner.
              </p>
            ) : (
              <>
                <div className="text-xl font-black text-foreground">{displayName}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {recordLine ? <span>Career {recordLine}</span> : null}
                  {titles?.count != null ? (
                    <span>
                      {titles.count} title{titles.count === 1 ? "" : "s"}
                      {titles.seasons?.length ? ` (${titles.seasons.join(", ")})` : ""}
                    </span>
                  ) : null}
                  {career?.playoffAppearances != null ? (
                    <span>{career.playoffAppearances} playoff runs</span>
                  ) : null}
                </div>
              </>
            )}
          </IntelPanel>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <IntelPanel variant="card" className="px-4 py-4">
            <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Current threat
            </div>
            {threat?.rivalName || rival?.rivalName || topRival?.rivalName ? (
              <>
                <div className="mt-2 text-base font-bold text-foreground">
                  {String(threat?.rivalName ?? rival?.rivalName ?? topRival?.rivalName)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {threat?.reason ||
                    (rival?.heatLabel || topRival?.heatLabel
                      ? `${rival?.heatLabel ?? topRival?.heatLabel} rivalry`
                      : "From your authenticated rivalry / threat context.")}
                </p>
                <Link
                  to="/my-team/matchup"
                  className="mt-2 inline-block text-xs font-medium text-violet-400 hover:text-violet-300"
                >
                  Open matchup →
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Rivalry and threat context appear after team setup and synced history.
              </p>
            )}
          </IntelPanel>

          <IntelPanel variant="card" className="px-4 py-4">
            <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Roster DNA pulse
            </div>
            {dna?.archetype ? (
              <>
                <div className="mt-2 text-base font-bold text-foreground">{dna.archetype}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dna.primaryTrait ? `Trait: ${dna.primaryTrait}` : ""}
                  {dna.blindSpot ? `${dna.primaryTrait ? " · " : ""}Blind spot: ${dna.blindSpot}` : ""}
                </p>
                <Link
                  to="/my-team/profile"
                  className="mt-2 inline-block text-xs font-medium text-violet-400 hover:text-violet-300"
                >
                  Open My GM →
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Manager DNA lights up after your owner profile and seasons sync.
              </p>
            )}
          </IntelPanel>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <Link
            to="/my-team/advisor"
            className="rounded-xl border border-border/70 bg-card/40 px-4 py-4 transition-colors hover:border-violet-500/40"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Bot className="h-4 w-4 text-violet-300" /> GM Advisor
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Action recommendations for your roster, matchup, and trades.
            </p>
          </Link>
          <Link
            to="/my-team/championship-path"
            className="rounded-xl border border-border/70 bg-card/40 px-4 py-4 transition-colors hover:border-violet-500/40"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Route className="h-4 w-4 text-violet-300" /> Championship Path
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Title blockers, gaps, and the moves that change your window.
            </p>
          </Link>
        </section>

        <section className="space-y-2 border-t border-border/60 pt-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            My Team tools
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
                  <div className="text-label text-muted-foreground">{d.hint}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </IntelPageShell>
  );
}
