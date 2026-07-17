/**
 * Owner-behavior slice of League DNA for Rivals surfaces.
 * Reuses `dna.myProfile` only — does not mount league-structural DNA sections.
 * Legacy `/league-dna` remains intact for Commit 7 structural ownership.
 */
import { Link } from "react-router";
import { Dna, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { IntelPanel, SectionLoading } from "@/components/layout";

export function OwnerBehaviorDnaInsight() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const ready = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const q = (trpc as any).dna.myProfile.useQuery(withLeagueSalt({}, leagueContextKey), {
    staleTime: 60_000,
    enabled: ready,
  });
  const data = q.data;

  return (
    <section className="space-y-2" data-rivals-behavior-dna>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Behavioral patterns
        </h2>
        <Link to="/rivals/owners" className="text-xs font-medium text-violet-400 hover:text-violet-300">
          Owner dossiers →
        </Link>
      </div>

      {!ready || q.isLoading ? (
        <IntelPanel variant="card">
          <SectionLoading message="Reading manager DNA…" className="justify-center py-8" />
        </IntelPanel>
      ) : !data ? (
        <IntelPanel variant="card" className="px-4 py-5 text-sm text-muted-foreground">
          Set your owner profile and sync seasons to surface manager archetypes and blind spots.
        </IntelPanel>
      ) : (
        <IntelPanel variant="card" className="space-y-4 px-4 py-4">
          <div className="flex items-start gap-3">
            <Dna className="mt-0.5 h-5 w-5 shrink-0 text-lime-400" />
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime-400/90">
                Manager archetype
              </div>
              <div className="mt-1 text-xl font-black tracking-tight text-foreground">{data.archetype}</div>
              {data.archetypeReceipt ? (
                <p className="mt-1 text-sm text-muted-foreground">{data.archetypeReceipt}</p>
              ) : data.archetypeDesc ? (
                <p className="mt-1 text-sm text-muted-foreground">{data.archetypeDesc}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Primary trait
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">{data.primaryTrait ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Blind spot
              </div>
              <p className="mt-1 text-sm font-semibold text-foreground">{data.blindSpot ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-3">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Users className="h-3 w-3" /> League twin
              </div>
              {data.leagueTwin ? (
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {data.leagueTwin.ownerName}
                  {data.leagueTwin.similarityPct != null
                    ? ` · ${data.leagueTwin.similarityPct}%`
                    : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Not enough data yet.</p>
              )}
            </div>
          </div>

          {data.ratings ? (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>
                Trading{" "}
                <b className="text-foreground">{data.ratings.trading?.overall?.grade ?? "—"}</b>
              </span>
              <span>
                Drafting{" "}
                <b className="text-foreground">{data.ratings.drafting?.overall?.grade ?? "—"}</b>
              </span>
              <span>
                Roster{" "}
                <b className="text-foreground">{data.ratings.roster?.overall?.grade ?? "—"}</b>
              </span>
            </div>
          ) : null}
        </IntelPanel>
      )}
    </section>
  );
}
