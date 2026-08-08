/**
 * Canonical `/rfsn/analysts` — present existing RFSN booth personas.
 * Source of truth: COMMENTATOR_META + BOOTH_ANALYST_ORDER (no second registry).
 * Does not alter prompts, TTS, routing, or broadcast behavior.
 */
import { useMemo } from "react";
import { Link } from "react-router";
import { Mic2, Radio, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { RfsnMediaShell } from "@/components/rfsn/RfsnMediaShell";
import { RFSN_ROUTES } from "@/lib/rfsnEditorial";
import { COMMENTATOR_META } from "@/lib/rfsnPresentation";
import { BOOTH_ANALYST_ORDER, boothStandbyLine } from "@/lib/rfsnBoothPresentation";
import { cn } from "@/lib/utils";

export function RfsnAnalysts() {
  const _trpc = trpc as any;
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(
    authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"),
  );

  const activeLeagueQ = _trpc.league.getActive.useQuery(undefined, { enabled: leagueKeyReady });
  const liveAccessQ = _trpc.rfsnBroadcast.getAccess.useQuery(undefined, {
    enabled: leagueKeyReady,
    staleTime: 60_000,
  });
  const showLiveNav = Boolean(liveAccessQ.data?.enabled && liveAccessQ.data?.canAccess);
  const leagueName = useMemo(
    () => (leagueKeyReady && activeLeagueQ.data?.leagueName ? activeLeagueQ.data.leagueName : ""),
    [activeLeagueQ.data?.leagueName, leagueKeyReady],
  );

  return (
    <RfsnMediaShell
      active="analysts"
      leagueName={leagueName}
      showLive={showLiveNav}
      data-v2-rfsn-analysts
    >
      <div className="mb-5">
        <h2 className="flex items-center gap-2 text-lg font-black tracking-tight text-white">
          <Mic2 className="h-5 w-5 text-lime-400" /> Analysts
        </h2>
        <p className="mt-1 text-xs text-[#8b97a8]">
          The RFSN booth — roles and portraits from the live broadcast registry. Commentary generation,
          voice assignment, and TTS behavior are unchanged.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {BOOTH_ANALYST_ORDER.map((id) => {
          const meta = COMMENTATOR_META[id];
          return (
            <article
              key={id}
              className={cn(
                "overflow-hidden rounded-[15px] border bg-white/[0.02]",
                meta.borderClass,
              )}
              data-testid={`rfsn-analyst-${id}`}
            >
              <div
                className="relative h-40 bg-zinc-900/80"
                style={
                  meta.portrait
                    ? {
                        backgroundImage: `url(${meta.portrait})`,
                        backgroundSize: "cover",
                        backgroundPosition: meta.portraitPosition ?? "center",
                      }
                    : undefined
                }
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[#0c0e12] via-transparent to-transparent" />
              </div>
              <div className="space-y-2 p-4">
                <p className={cn("text-[10px] font-black uppercase tracking-widest", meta.accentClass)}>
                  {meta.role}
                </p>
                <h3 className="text-xl font-black text-white">{meta.displayName}</h3>
                <p className="text-xs text-[#8b97a8]">{boothStandbyLine(id)}</p>
              </div>
            </article>
          );
        })}
      </div>

      <section className="mt-6 rounded-[15px] border border-white/[0.07] bg-white/[0.02] p-5">
        <div className="flex items-start gap-3">
          <Radio className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0 space-y-2">
            <h3 className="text-sm font-bold text-white">Live & replay</h3>
            <p className="text-xs leading-relaxed text-[#8b97a8]">
              Analysts speak during RFSN Live draft coverage. Replay and commentary logs stay on the
              live broadcast surface — this page introduces the desk, it does not re-host the booth
              controller.
            </p>
            {showLiveNav ? (
              <Link
                to={RFSN_ROUTES.live}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-lime-400 hover:text-lime-300"
              >
                Open Live coverage <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <p className="text-xs text-ink-tertiary">
                Live access is unavailable for this league session — written Wire and Stories remain
                open.
              </p>
            )}
          </div>
        </div>
      </section>
    </RfsnMediaShell>
  );
}
