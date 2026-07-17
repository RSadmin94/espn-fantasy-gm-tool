/**
 * Canonical Relationship Map at `/rivals/relationships`.
 * Surfaces existing rivalry scores, H2H volume, and DNA league-twin — no invented relationship score.
 */
import { Link } from "react-router";
import { useMemo } from "react";
import { Network, Swords, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { CinematicPageHeader, IntelPageShell, IntelPanel, SectionLoading } from "@/components/layout";

export function RivalsRelationships() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const scoresQ = (trpc as any).rivalry.getScores.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 300_000,
    enabled: ready,
  });
  const h2hQ = (trpc as any).rivalry.h2h.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 600_000,
    enabled: ready,
  });
  const dnaQ = (trpc as any).dna.myProfile.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });

  const strongest = useMemo(() => {
    const raw = scoresQ.data;
    const arr: any[] = Array.isArray(raw?.rivalries) ? raw.rivalries : Array.isArray(raw) ? raw : [];
    return [...arr]
      .filter((p) => p && (p.rivalName || p.rivalId))
      .sort((a, b) => Number(b.rivalryScore ?? 0) - Number(a.rivalryScore ?? 0))
      .slice(0, 8);
  }, [scoresQ.data]);

  const byVolume = useMemo(() => {
    const pairs: any[] = Array.isArray(h2hQ.data?.pairs) ? h2hQ.data.pairs : [];
    return [...pairs]
      .filter((p) => Number(p.meetings ?? 0) > 0)
      .sort((a, b) => Number(b.meetings ?? 0) - Number(a.meetings ?? 0))
      .slice(0, 8);
  }, [h2hQ.data]);

  const playoffNemeses = useMemo(() => {
    return strongest
      .filter((p) => Number(p.playoffEliminations ?? 0) > 0)
      .sort((a, b) => Number(b.playoffEliminations ?? 0) - Number(a.playoffEliminations ?? 0))
      .slice(0, 6);
  }, [strongest]);

  const twin = dnaQ.data?.leagueTwin as { ownerName?: string; similarityPct?: number } | null | undefined;
  const loading = ready && (scoresQ.isLoading || h2hQ.isLoading || dnaQ.isLoading);

  return (
    <IntelPageShell bleed minHeight="full" background="cinematic-token" padding="default" data-v2-rivals-relationships>
      <CinematicPageHeader
        eyebrowMono="Rivals"
        icon={Network}
        title="Relationship Map"
        subtitle="How owners relate — strongest rivalries, frequent series, and behavioral twins from existing data."
        className="mb-5"
      />

      <main className="mx-auto max-w-[1100px] space-y-6">
        {loading ? (
          <IntelPanel variant="card">
            <SectionLoading message="Mapping relationships…" className="justify-center py-12" />
          </IntelPanel>
        ) : null}

        {twin?.ownerName ? (
          <IntelPanel variant="card" className="px-4 py-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-lime-400">
              <Users className="h-3.5 w-3.5" /> Behavioral twin
            </div>
            <p className="mt-2 text-lg font-black text-foreground">
              You manage most like {twin.ownerName}
              {twin.similarityPct != null ? (
                <span className="ml-2 text-sm font-semibold text-muted-foreground">
                  ({twin.similarityPct}% DNA match)
                </span>
              ) : null}
            </p>
            <Link to="/rivals/owners" className="mt-2 inline-block text-xs font-medium text-violet-400 hover:text-violet-300">
              Open owner dossiers →
            </Link>
          </IntelPanel>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              <Swords className="h-3.5 w-3.5 text-violet-300" /> Strongest rivalries
            </h2>
            <Link to="/rivals/rivalries" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Rivalries →
            </Link>
          </div>
          {strongest.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Personalized rivalry scores appear after rivalry generation / sync.
            </IntelPanel>
          ) : (
            <div className="space-y-2">
              {strongest.map((p, i) => (
                <IntelPanel key={`${p.rivalId ?? p.rivalName ?? i}`} variant="card" className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">
                        vs {String(p.rivalName ?? "Rival")}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.heatLabel ? `${p.heatLabel} · ` : ""}
                        Score {Number(p.rivalryScore ?? 0)}
                        {p.h2hWins != null
                          ? ` · H2H ${Number(p.h2hWins)}–${Number(p.h2hLosses ?? 0)}`
                          : ""}
                      </div>
                    </div>
                    <span className="text-lg font-black text-amber-400">{i + 1}</span>
                  </div>
                </IntelPanel>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Playoff nemeses
          </h2>
          {playoffNemeses.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              Playoff elimination relationships appear when rivalry scores include elimination counts.
            </IntelPanel>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {playoffNemeses.map((p, i) => (
                <IntelPanel key={`nem-${p.rivalName ?? i}`} variant="card" className="px-4 py-3">
                  <div className="text-sm font-bold text-foreground">{String(p.rivalName)}</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Number(p.playoffEliminations)} playoff elimination
                    {Number(p.playoffEliminations) === 1 ? "" : "s"}
                  </p>
                </IntelPanel>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Closest by matchup volume
            </h2>
            <Link to="/rivals/head-to-head" className="text-xs font-medium text-violet-400 hover:text-violet-300">
              Ledger →
            </Link>
          </div>
          {byVolume.length === 0 ? (
            <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
              High-volume series appear from `rivalry.h2h` meeting counts.
            </IntelPanel>
          ) : (
            <div className="space-y-2">
              {byVolume.map((p) => (
                <IntelPanel key={`${p.a}::${p.b}`} variant="card" className="px-4 py-3">
                  <div className="text-sm font-bold text-foreground">
                    {String(p.a)} <span className="text-muted-foreground">vs</span> {String(p.b)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {Number(p.meetings)} meetings · {Number(p.aWins)}–{Number(p.aLosses)}
                    {Number(p.playoff ?? 0) > 0 ? ` · ${Number(p.playoff)} playoff` : ""}
                  </p>
                </IntelPanel>
              ))}
            </div>
          )}
        </section>

        <p className="text-[11px] text-muted-foreground">
          Data sources: `rivalry.getScores` (existing rivalry scores), `rivalry.h2h` (meeting volume),
          and `dna.myProfile.leagueTwin` (behavioral similarity). No opaque relationship score is invented.
        </p>
      </main>
    </IntelPageShell>
  );
}
