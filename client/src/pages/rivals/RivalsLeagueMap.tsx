/**
 * Canonical League Map at `/rivals/league-map`.
 * First implementation from existing owner list + rivalry H2H pairs — no geographic invention.
 */
import { Link } from "react-router";
import { useMemo } from "react";
import { Crown, Map as MapIcon, Swords } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { displayOwnerName } from "@/lib/ownerName";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";

export function RivalsLeagueMap() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const listQ = (trpc as any).owners.ownerList.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });
  const h2hQ = (trpc as any).rivalry.h2h.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 600_000,
    enabled: ready,
  });

  const active = (listQ.data?.active ?? []) as Array<{
    ownerKey: string;
    ownerName?: string;
    championships?: number;
    seasons?: number[];
  }>;
  const graveyard = (listQ.data?.graveyard ?? []) as Array<{
    ownerKey: string;
    ownerName?: string;
    championships?: number;
  }>;

  const champHierarchy = useMemo(() => {
    return [...active]
      .map((o) => ({
        ownerKey: o.ownerKey,
        name: displayOwnerName(o.ownerKey, o.ownerName),
        championships: Number(o.championships ?? 0),
        seasons: Array.isArray(o.seasons) ? o.seasons.length : 0,
      }))
      .sort((a, b) => b.championships - a.championships || b.seasons - a.seasons || a.name.localeCompare(b.name));
  }, [active]);

  const clusters = useMemo(() => {
    const pairs: any[] = Array.isArray(h2hQ.data?.pairs) ? h2hQ.data.pairs : [];
    return [...pairs]
      .map((p) => ({
        a: String(p.a ?? ""),
        b: String(p.b ?? ""),
        meetings: Number(p.meetings ?? 0),
        playoff: Number(p.playoff ?? 0),
        aWins: Number(p.aWins ?? 0),
        aLosses: Number(p.aLosses ?? 0),
      }))
      .filter((p) => p.a && p.b && p.meetings > 0)
      .sort((a, b) => b.meetings - a.meetings || b.playoff - a.playoff)
      .slice(0, 8);
  }, [h2hQ.data]);

  const loading = ready && (listQ.isLoading || h2hQ.isLoading);

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-rivals-league-map>
      <CinematicPageHeader
        eyebrowMono="Rivals"
        icon={MapIcon}
        title="League Map"
        subtitle="Owner landscape, championship hierarchy, and high-volume rivalry clusters from existing league data."
        className="mb-5"
      />

      <main className="mx-auto max-w-[1100px] space-y-6">
        {loading ? (
          <IntelPanel variant="card">
            <SectionLoading message="Mapping the league…" className="justify-center py-12" />
          </IntelPanel>
        ) : null}

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Active roster map
          </h2>
          {active.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Owner directory appears after the league connection and owner list sync.
            </IntelPanel>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.map((o) => (
                <Link
                  key={o.ownerKey}
                  to={`/rivals/owners/${encodeURIComponent(o.ownerKey)}`}
                  className="rounded-xl border border-border/70 bg-card/40 px-3 py-3 transition-colors hover:border-violet-500/40"
                >
                  <div className="text-sm font-bold text-foreground">
                    {displayOwnerName(o.ownerKey, o.ownerName)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {Number(o.championships ?? 0) > 0
                      ? `${o.championships}× champion`
                      : "No titles yet"}
                    {Array.isArray(o.seasons) && o.seasons.length
                      ? ` · ${o.seasons.length} season${o.seasons.length === 1 ? "" : "s"}`
                      : ""}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            <Crown className="h-3.5 w-3.5 text-amber-400" /> Championship hierarchy
          </h2>
          {champHierarchy.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Championship hierarchy needs owner career data.
            </IntelPanel>
          ) : (
            <IntelPanel variant="card" className="divide-y divide-border/50 p-0">
              {champHierarchy.slice(0, 12).map((o, i) => (
                <Link
                  key={o.ownerKey}
                  to={`/rivals/owners/${encodeURIComponent(o.ownerKey)}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-card/50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-center text-sm font-black text-muted-foreground">{i + 1}</span>
                    <span className="truncate text-sm font-semibold text-foreground">{o.name}</span>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-amber-400/90">
                    {o.championships > 0 ? `${o.championships} titles` : "—"}
                  </span>
                </Link>
              ))}
            </IntelPanel>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <Swords className="h-3.5 w-3.5 text-violet-300" /> Rivalry clusters
            </h2>
            <Link to="/rivals/rivalries" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Rivalries →
            </Link>
          </div>
          {clusters.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Rivalry clusters appear from `rivalry.h2h` meeting volume once history is synced.
            </IntelPanel>
          ) : (
            <div className="space-y-2">
              {clusters.map((c) => (
                <IntelPanel key={`${c.a}::${c.b}`} variant="card" className="px-4 py-3">
                  <div className="text-sm font-bold text-foreground">
                    {c.a} <span className="text-muted-foreground">vs</span> {c.b}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.meetings} meetings · {c.aWins}–{c.aLosses}
                    {c.playoff > 0 ? ` · ${c.playoff} playoff` : ""}
                  </p>
                </IntelPanel>
              ))}
            </div>
          )}
        </section>

        {graveyard.length > 0 ? (
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Departed owners
            </h2>
            <p className="text-xs text-muted-foreground">
              Graveyard owners from the existing owner list — still part of league history.
            </p>
            <div className="flex flex-wrap gap-2">
              {graveyard.map((o) => (
                <Link
                  key={o.ownerKey}
                  to={`/rivals/owners/${encodeURIComponent(o.ownerKey)}`}
                  className="rounded-lg border border-dashed border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {displayOwnerName(o.ownerKey, o.ownerName)}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Data sources: `owners.ownerList` (directory, titles, seasons) and `rivalry.h2h` (meeting clusters).
          No geographic coordinates are invented.
        </p>
      </main>
    </IntelPageShell>
  );
}
