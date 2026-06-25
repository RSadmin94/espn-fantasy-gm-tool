import type { ReactNode } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { Loader2, Trophy, Target, ArrowUpCircle, ShieldCheck, Crown, Route, Swords, ListChecks } from "lucide-react";
import { PlayoffPositionTruthPanel } from "@/components/PlayoffPositionTruthPanel";

const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};
const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

function Section({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className={cn(PANEL, "p-5 sm:p-6")}>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-lime-400">{icon}</span>
        <div>
          <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-white/45">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function GapBar({ position, ownerAvg, championAvg, gap }: { position: string; ownerAvg: number; championAvg: number; gap: number }) {
  const max = Math.max(ownerAvg, championAvg, 1) * 1.15;
  const ownerPct = (ownerAvg / max) * 100;
  const champPct = (championAvg / max) * 100;
  const deficit = gap > 0;
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="font-bold text-white/85">{position}</span>
        <span className={cn("tabular-nums font-semibold", deficit ? "text-amber-300" : "text-lime-400")}>
          {ownerAvg} <span className="text-white/30">vs</span> {championAvg}
          <span className="ml-2 text-[12px]">{deficit ? `−${gap}` : `+${Math.abs(gap)}`}</span>
        </span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", deficit ? "bg-violet-500/70" : "bg-lime-400/80")} style={{ width: `${ownerPct}%` }} />
        <div className="absolute inset-y-0 w-[2px] bg-amber-300" style={{ left: `${champPct}%` }} title={`Champion: ${championAvg}`} />
      </div>
    </div>
  );
}

function MiniCard({ icon, label, children, tone = "neutral" }: { icon: ReactNode; label: string; children: ReactNode; tone?: "neutral" | "warn" | "good" }) {
  const border = tone === "warn" ? "border-red-400/20 bg-red-500/[0.05]" : tone === "good" ? "border-lime-400/20 bg-lime-500/[0.05]" : "border-white/[0.06] bg-white/[0.02]";
  return (
    <div className={cn("rounded-xl border p-4", border)}>
      <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
        <span className="text-white/55">{icon}</span> {label}
      </div>
      {children}
    </div>
  );
}

function PathPaywall({ onUnlock, pending }: { onUnlock: () => void; pending: boolean }) {
  return (
    <div className={cn(PANEL, "p-8 text-center")}>
      <Route className="mx-auto mb-3 h-8 w-8 text-lime-400" />
      <p className="text-xl font-black text-white/95">Unlock your full Championship Path</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        The one-line verdict above is free. The plan that gets you there - your position-by-position
        gaps vs the average champion, the champion you most resemble, the rival blocking your path,
        and your ranked action plan - unlocks with Rivals Pro.
      </p>
      <button
        onClick={onUnlock}
        disabled={pending}
        className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-lime-400 px-6 py-3 text-sm font-extrabold text-[#0e0a10] transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Opening..." : "Unlock the Path"}
      </button>
    </div>
  );
}

export function ChampionshipPath() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const q = trpc.leagueIntel.championshipPath.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const data = leagueKeyReady ? q.data : undefined;
  const showPaidPath = Boolean(data && !data.gated);
  const playoffQ = trpc.leagueIntel.playoffPositionSplit.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady && showPaidPath },
  );
  const checkout = trpc.billing.createCheckoutSession.useMutation({
    onSuccess: (r) => {
      if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else toast.error("Checkout did not return a link. Try again or contact support.");
    },
    onError: (err) => {
      toast.error(err.message || "Could not start checkout. Please try again.");
    },
  });
  const startCheckout = () => {
    if (typeof window === "undefined") return;
    checkout.mutate({ origin: window.location.origin });
  };

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      <div className="px-6 py-6 max-w-[1400px]">
        {/* Hero */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
              <Route className="h-3.5 w-3.5" /> LeagueDNA Intelligence
            </div>
            <h1 className="text-[34px] font-black leading-[1.05] tracking-tight sm:text-[42px]">
              Championship Path<span className="text-lime-400">™</span>
            </h1>
            {data && <p className="mt-2 text-[15px] text-white/55">What <span className="font-semibold text-white/85">{data.ownerName}</span> must do to win — measured against the average champion.</p>}
          </div>
          {data && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                {data.historicalSeasonCount} season{data.historicalSeasonCount === 1 ? "" : "s"} in DB
              </span>
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                {data.teamCount > 0 ? `${data.teamCount}-Team League` : "League size pending sync"}
              </span>
              <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold", data.confidence === "High" ? "border-lime-400/30 bg-lime-500/10 text-lime-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300")}>Confidence: {data.confidence}</span>
            </div>
          )}
        </div>

        {(!leagueKeyReady || (q.isLoading && !data)) && (
          <div className={cn(PANEL, "flex items-center justify-center gap-3 p-16 text-white/50")}>
            <Loader2 className="h-5 w-5 animate-spin text-lime-400" />{" "}
            {!leagueKeyReady ? "Loading league…" : "Mapping your path to a title…"}
          </div>
        )}
        {leagueKeyReady && q.isError && (
          <div className={cn(PANEL, "p-8 text-center text-red-300")}>Couldn't compute the path. {String(q.error?.message ?? "")}</div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Headline */}
            <div className={cn(PANEL, "p-6 text-center")}>
              <div className="mb-2 flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-lime-400">
                <Target className="h-4 w-4" /> The One Thing
              </div>
              <p className="text-[22px] font-black leading-snug text-white/95 sm:text-[26px]">{data.headline}</p>
            </div>

            {data.gated && (
              <PathPaywall onUnlock={startCheckout} pending={checkout.isPending} />
            )}
            {!data.gated && (<>
            {/* Positional comparison */}
            <Section icon={<Trophy className="h-5 w-5" />} title="You vs the Champion Profile" subtitle="Starter points/game by position · amber line = champion benchmark">
              <div className="space-y-1">
                {data.positionGaps.map((g) => (
                  <GapBar key={g.position} position={g.position} ownerAvg={g.ownerAvg} championAvg={g.championAvg} gap={g.gap} />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[14px]">
                <span className="text-white/55">Season points-for</span>
                <span className="tabular-nums">
                  <span className="font-bold text-white/85">{data.ownerAvgPointsFor}</span>
                  <span className="mx-2 text-white/30">vs champion</span>
                  <span className="font-bold text-amber-300">{data.championAvgPointsFor}</span>
                  {data.pointsForGap > 0 && <span className="ml-2 text-amber-300">−{data.pointsForGap}</span>}
                </span>
              </div>
            </Section>

            <PlayoffPositionTruthPanel
              data={playoffQ.data}
              loading={playoffQ.isLoading}
              error={playoffQ.isError ? String(playoffQ.error?.message ?? "Couldn't load playoff split.") : undefined}
            />

            {/* Championship Profile: avg starter pts/game by position, per champion + all-champions combined */}
            <Section icon={<Crown className="h-5 w-5" />} title="Championship Profile" subtitle="Avg starter points/game by position - each season's champion, plus all champions combined">
              {data.championshipProfile.available ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="text-white/45">
                        <th className="px-3 py-2 text-left font-semibold">Season &middot; Champion</th>
                        {data.championshipProfile.positions.map((p) => (
                          <th key={p} className="px-3 py-2 text-right font-semibold tabular-nums">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.championshipProfile.seasons.map((row) => (
                        <tr key={row.season} className="border-t border-white/[0.06]">
                          <td className="px-3 py-2 text-left">
                            <span className="font-bold tabular-nums text-white/90">{row.season}</span>
                            <span className="ml-2 text-white/55">{row.champion ?? "-"}</span>
                            {row.source && row.source !== "medal" && (
                              <span className="ml-2 rounded border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300/90">est.</span>
                            )}
                          </td>
                          {data.championshipProfile.positions.map((p) => (
                            <td key={p} className="px-3 py-2 text-right tabular-nums text-white/85">{row.byPosition[p] ?? "-"}</td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-lime-400/30 bg-lime-500/[0.04]">
                        <td className="px-3 py-2 text-left font-bold text-lime-300">All champions &middot; avg</td>
                        {data.championshipProfile.positions.map((p) => (
                          <td key={p} className="px-3 py-2 text-right font-bold tabular-nums text-lime-300">{data.championshipProfile.combined[p] || "-"}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-[12px] text-white/35">Positions cover QB/RB/WR/TE starters. "est." marks a season whose champion came from final-standing fallback rather than a recorded title.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-[14px] text-white/55">
                  {data.championshipProfile.reason ?? "Player-level data isn't available for this league yet."}
                  <p className="mt-1 text-[12px] text-white/35">Position scoring populates once this league's weekly player stats are synced.</p>
                </div>
              )}
            </Section>
            {/* 3 mini cards: weakness | closest champ | biggest threat */}
            <div className="grid gap-3 md:grid-cols-3">
              <MiniCard icon={<ArrowUpCircle className="h-4 w-4" />} label="Biggest Gap" tone="warn">
                {data.biggestWeakness ? (
                  <>
                    <div className="text-[26px] font-black text-amber-300">{data.biggestWeakness.position}</div>
                    <p className="mt-1 text-[13px] text-white/55">−{data.biggestWeakness.gap} pts/game ({data.biggestWeakness.gapPct}%) vs champ {data.biggestWeakness.championAvg}</p>
                  </>
                ) : <p className="text-[13px] text-lime-400">Matches champions everywhere.</p>}
              </MiniCard>
              <MiniCard icon={<Crown className="h-4 w-4" />} label="Closest Champion" tone="good">
                {data.closestChampion ? (
                  <>
                    <div className="text-[18px] font-black text-white/90">{data.closestChampion.ownerName}</div>
                    <p className="mt-1 text-[13px] text-white/55">{data.closestChampion.season} champ · {data.closestChampion.similarity}% similar — the archetype to emulate.</p>
                  </>
                ) : <p className="text-[13px] text-white/50">No comparable champion.</p>}
              </MiniCard>
              <MiniCard icon={<Swords className="h-4 w-4" />} label="Biggest Threat" tone="warn">
                {data.biggestThreat ? (
                  <>
                    <div className="text-[18px] font-black text-white/90">{data.biggestThreat.ownerName}</div>
                    <p className="mt-1 text-[13px] text-white/55">You're {data.biggestThreat.record}{data.biggestThreat.playoffLosses > 0 ? ` · ${data.biggestThreat.playoffLosses} playoff loss${data.biggestThreat.playoffLosses > 1 ? "es" : ""}` : ""} — the rival blocking your path.</p>
                  </>
                ) : <p className="text-[13px] text-white/50">No dominant rival.</p>}
              </MiniCard>
            </div>

            {/* Top 3 required improvements */}
            <Section icon={<ListChecks className="h-5 w-5" />} title="Top 3 Required Improvements" subtitle="The highest-impact, deterministic levers">
              <ol className="space-y-2">
                {data.topImprovements.map((t, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[15px] text-white/85">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-400/15 text-[13px] font-bold text-lime-400">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </Section>

            {/* Recommended action plan */}
            <Section icon={<ShieldCheck className="h-5 w-5" />} title="Recommended Action Plan">
              <ul className="space-y-2">
                {data.recommendedActions.map((a, i) => (
                  <li key={i} className="flex gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[14px] text-white/70">
                    <span className="mt-0.5 text-lime-400">›</span><span>{a}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* Context from other engines + narrative */}
            <div className={cn(PANEL, "p-5 space-y-3")}>
              <p className="text-[15px] leading-relaxed text-white/75">{data.narrative}</p>
              <div className="flex flex-wrap gap-2">
                {data.pastReasonContext && (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/60">
                    Past pattern: {data.pastReasonContext}
                  </span>
                )}
                {data.draftContext && (
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/60">
                    {data.draftContext}
                  </span>
                )}
                <span className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", data.confidence === "High" ? "border-lime-400/30 bg-lime-500/10 text-lime-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300")}>
                  Confidence: {data.confidence}
                </span>
              </div>
            </div>

            <p className="px-1 text-[12px] text-white/30">
              Champion benchmark = average of league champions' starter scoring by position (real weekly data). Threat = worst head-to-head record, weighted by playoff losses. No projections.
            </p>
            </>)}
          </div>
        )}
      </div>
    </div>
  );
}

export default ChampionshipPath;
