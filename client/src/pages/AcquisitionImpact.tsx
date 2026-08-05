import type { ReactNode } from "react";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { COMMERCIAL } from "@/lib/commercialCopy";
import { setLastFreeFeature } from "@/lib/lastFreeFeature";
import { useUpgradeDialog } from "@/hooks/useUpgradeDialog";
import {
  CinematicMetaPill,
  CinematicPageHeader,
  IntelPageShell,
  IntelPanel,
  PageError,
  PageLoading,
  ProGate,
} from "@/components/layout";
import { ShoppingCart, TrendingUp, Trophy, Layers, Info, Crown, Hammer, BookOpen, Sparkles } from "lucide-react";

type AcqResult = import("../../../server/acquisitionImpact").AcquisitionImpactResult;
type AcqOwner = import("../../../server/acquisitionImpact").AcquisitionOwner;

function Section({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <IntelPanel variant="elevated" className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-lime-400">{icon}</span>
        <div>
          <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-white/45">{subtitle}</p>}
        </div>
      </div>
      {children}
    </IntelPanel>
  );
}

// Circular impact meter
function ImpactMeter({ value, label }: { value: number; label: string }) {
  const r = 34, c = 2 * Math.PI * r, off = c - (value / 100) * c;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[92px] w-[92px]">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
          <circle cx="40" cy="40" r={r} fill="none" stroke="url(#acqgrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
          <defs>
            <linearGradient id="acqgrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#a3e635" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[24px] font-black tabular-nums">{value}</div>
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-white/45">{label}</div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: ReactNode; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
        <span className="text-white/55">{icon}</span> {label}
      </div>
      <div className="text-[26px] font-black tabular-nums text-white/90">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-white/45">{sub}</div>}
    </div>
  );
}

// Ranking row with comparison bar
function RankRow({ rank, name, value, max, suffix, highlight, barClass }: { rank: number; name: string; value: number; max: number; suffix?: string; highlight?: boolean; barClass?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", highlight && "bg-lime-400/[0.08] ring-1 ring-lime-400/20")}>
      <span className="w-5 shrink-0 text-right text-[12px] font-bold text-white/35">{rank}</span>
      <span className={cn("w-32 shrink-0 truncate text-[13px]", highlight ? "font-bold text-lime-300" : "text-white/80")}>{name}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn("h-full rounded-full", barClass ?? "bg-gradient-to-r from-violet-500 to-lime-400")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums text-white/75">{value}{suffix}</span>
    </div>
  );
}

export function AcquisitionImpact() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));
  const q = trpc.leagueIntel.acquisitionImpact.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const data = (leagueKeyReady ? q.data : undefined) as AcqResult | undefined;
  const f = data?.focal;
  const gated = Boolean((data as any)?.gated);
  const { openUpgrade, upgradeDialog } = useUpgradeDialog({
    title: COMMERCIAL.upgradeCtaUnderstandWhy,
    description:
      "Your own dashboard above is free — the who. Rivals Pro explains why some managers consistently add value and how the rest of the league compares.",
  });
  const startCheckout = () => {
    if (typeof window === "undefined") return;
    openUpgrade();
  };

  useEffect(() => {
    if (data) setLastFreeFeature("acquisition_impact");
  }, [data]);

  return (
    <>
    {upgradeDialog}
    <IntelPageShell
      minHeight="screen"
      width="wide"
      background="cinematic"
      padding="default"
    >
      <CinematicPageHeader
        title="Acquisition Impact™"
        subtitle="How much of your season was built after draft day?"
        titleSize="large"
        badge={{ label: "LeagueDNA Intelligence", icon: ShoppingCart, tone: "violet" }}
        className="mb-0"
        meta={
          data ? (
            <>
              <CinematicMetaPill tone="neutral">{data.qualifiedCount} Owners</CinematicMetaPill>
              <CinematicMetaPill tone="neutral">17 Seasons</CinematicMetaPill>
              <CinematicMetaPill tone={data.confidence === "High" ? "good" : "warn"}>
                Confidence: {data.confidence}
              </CinematicMetaPill>
            </>
          ) : undefined
        }
      />

      {(!leagueKeyReady || (q.isLoading && !data)) && (
        <PageLoading
          message={
            !leagueKeyReady ? "Loading league…" : "Tracing every non-drafted starter…"
          }
        />
      )}
      {leagueKeyReady && q.isError && (
        <PageError
          message={`Couldn't compute acquisition impact. ${String(q.error?.message ?? "")}`}
        />
      )}

      {data && f && (
        <>
          <IntelPanel variant="elevated" className="p-5 sm:p-6">
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-6">
                  <ImpactMeter value={f.acquisitionImpactScore} label="Impact Score" />
                  <div>
                    <div className="text-[13px] uppercase tracking-wide text-white/45">{f.ownerName}</div>
                    <div className="text-[15px] text-white/70">
                      {data.focalRankImpact ? <>Ranked <span className="font-bold text-lime-400">#{data.focalRankImpact}</span> of {data.qualifiedCount} in acquisition value</> : "Not enough history to rank"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ImpactMeter value={Math.round(f.lineupDependency)} label="Lineup Dependency" />
                  <div className="flex flex-col justify-center gap-2">
                    <div className="text-center">
                      <div className="text-[12px] uppercase tracking-wide text-white/45">Draft Reliance</div>
                      <div className="text-[20px] font-black text-violet-300">{f.draftRelianceScore}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[12px] uppercase tracking-wide text-white/45">Roster Builder</div>
                      <div className="text-[20px] font-black text-lime-400">{f.rosterBuilderScore}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Points Added" value={f.pointsAdded.toLocaleString()} sub={`${f.pointsAddedPerSeason}/season`} />
                <StatCard icon={<Trophy className="h-4 w-4" />} label="Wins Added" value={f.decisiveAcqWins} sub={`of ${f.totalWins} wins (acq. decisive)`} />
                <StatCard icon={<Layers className="h-4 w-4" />} label="Lineup Dependency" value={`${f.lineupDependency}%`} sub="of starting points" />
              </div>
            </IntelPanel>

            <Section icon={<Sparkles className="h-5 w-5" />} title="LeagueDNA Insights">
              <ul className="space-y-2">
                {data.insights.map((t, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[14px] text-white/80">
                    <span className="mt-0.5 text-lime-400">›</span><span>{t}</span>
                  </li>
                ))}
              </ul>
            </Section>

            {gated && (
              <ProGate
                icon={ShoppingCart}
                heading="Understand why certain GMs always win the wire"
                description="Your own dashboard above is free — the who. Rivals Pro explains why some managers consistently add value and how the rest of the league compares."
                ctaLabel={COMMERCIAL.upgradeCtaUnderstandWhy}
                onUnlock={startCheckout}
                pending={false}
              />
            )}
            {!gated && (<>
            {/* Best Acquisition Managers */}
            <Section icon={<ShoppingCart className="h-5 w-5" />} title="Best Acquisition Managers" subtitle="League-relative acquisition impact (0–100)">
              <div className="space-y-1">
                {data.bestAcquisitionManagers.map((o, i) => (
                  <RankRow key={o.ownerKey} rank={i + 1} name={o.ownerName} value={o.acquisitionImpactScore} max={100} highlight={o.ownerKey === data.ownerKey} />
                ))}
              </div>
            </Section>

            {/* Draft Reliance vs Roster Builder side by side */}
            <div className="grid gap-6 md:grid-cols-2">
              <Section icon={<BookOpen className="h-5 w-5" />} title="Most Draft-Reliant" subtitle="Leaned on draft skill">
                <div className="space-y-1">
                  {data.draftRelianceRanking.slice(0, 8).map((o, i) => (
                    <RankRow key={o.ownerKey} rank={i + 1} name={o.ownerName} value={o.draftRelianceScore} max={100} highlight={o.ownerKey === data.ownerKey} barClass="bg-gradient-to-r from-violet-600 to-violet-400" />
                  ))}
                </div>
              </Section>
              <Section icon={<Hammer className="h-5 w-5" />} title="Top Roster Builders" subtitle="Rebuilt through the season">
                <div className="space-y-1">
                  {data.rosterBuilderRanking.slice(0, 8).map((o, i) => (
                    <RankRow key={o.ownerKey} rank={i + 1} name={o.ownerName} value={o.rosterBuilderScore} max={100} highlight={o.ownerKey === data.ownerKey} barClass="bg-gradient-to-r from-lime-600 to-lime-400" />
                  ))}
                </div>
              </Section>
            </div>

            {/* Biggest Acquisition Seasons */}
            <Section icon={<Crown className="h-5 w-5" />} title="Biggest Acquisition Seasons" subtitle="Most points ever added after draft day — league history">
              <div className="space-y-1">
                {data.topAcquisitionSeasons.map((s, i) => (
                  <RankRow key={`${s.ownerKey}:${s.season}`} rank={i + 1} name={`${s.season} ${s.ownerName}`} value={s.acquiredPoints} max={data.topAcquisitionSeasons[0]?.acquiredPoints ?? 1} suffix="" highlight={s.ownerKey === data.ownerKey} />
                ))}
              </div>
            </Section>

            {/* Limitation label — clearly disclosed */}
            <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.06] p-4">
              <div className="flex gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div>
                  <div className="text-[13px] font-bold uppercase tracking-wide text-amber-300">Data Limitation</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/65">{data.limitationNote}</p>
                </div>
              </div>
            </div>

            <p className="px-1 text-[12px] text-white/30">
              Deterministic: a "non-drafted player" is any starter not on that owner's draft board that season. Wins Added counts games won where acquired starters exceeded the margin of victory. Confidence: {data.confidence}.
            </p>
            </>)}
        </>
      )}
    </IntelPageShell>
    </>
  );
}

export default AcquisitionImpact;
