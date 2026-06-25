import { useMemo, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { RivalrySummaryCard } from "@/components/RivalrySummaryCard";
import { PlayoffPositionTruthPanel } from "@/components/PlayoffPositionTruthPanel";
import {
  CinematicMetaPill,
  CinematicPageHeader,
  EmptyState,
  IntelPageShell,
  IntelPanel,
  PageError,
  PageLoading,
  SectionLoading,
} from "@/components/layout";
import {
  Trophy, Target, Crown, Swords, ShieldCheck, ListChecks,
  Route, TrendingDown, Gauge, Activity, ArrowUpCircle,
} from "lucide-react";

/**
 * Championship Diagnosis — the merged replacement for "Why Haven't I Won?" + "Championship Path".
 * Primary spine: leagueIntel.careerReport (mode-adaptive, readiness, blockers, action plan).
 * Secondary (2 unique cards only): leagueIntel.championshipPath → Closest Champion + Championship Profile.
 * Pure presentation composition of existing outputs — no new scoring.
 */
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
        <div className="absolute inset-y-0 w-[2px] bg-amber-300" style={{ left: `${champPct}%` }} />
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

const IMPACT_TONE: Record<string, string> = {
  high: "border-red-400/25 bg-red-500/10 text-red-300",
  medium: "border-amber-400/25 bg-amber-500/10 text-amber-300",
  low: "border-white/15 bg-white/[0.04] text-white/60",
};

/** Mode-adaptive hero tagline — narrative changes, the diagnosis stays. */
function taglineFor(mode: string | undefined, owner: string): string {
  switch (mode) {
    case "why-you-won":
      return `${owner} is the reigning champion. Here's what still stands between them and a repeat.`;
    case "why-you-broke-through":
      return `${owner} has won before. Here's what stands between them and the next title.`;
    default:
      return `What stands between ${owner} and a championship.`;
  }
}

export function ChampionshipDiagnosis() {
  const { leagueContextKey, authLoaded, userLoaded, isSignedIn } = useLeagueActiveGate();
  const leagueKeyReady = Boolean(authLoaded && userLoaded && isSignedIn && !leagueContextKey.startsWith("__"));

  const careerQ = trpc.leagueIntel.careerReport.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  // Secondary source — used ONLY for Closest Champion + Championship Profile.
  const pathQ = trpc.leagueIntel.championshipPath.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady },
  );
  const cp: any = leagueKeyReady ? pathQ.data : undefined;
  const showPlayoffPanel = Boolean(cp && !cp.gated);
  const playoffQ = trpc.leagueIntel.playoffPositionSplit.useQuery(
    withLeagueSalt({}, leagueContextKey),
    { staleTime: 60_000, enabled: leagueKeyReady && showPlayoffPanel },
  );

  const cr: any = leagueKeyReady ? careerQ.data : undefined;

  const mode: string = cr?.mode ?? "why-havent-won";
  const isChampionMode = mode === "why-you-won" || mode === "why-you-broke-through";
  const snapshot = cr?.snapshot ?? null;
  const readiness = cr?.readiness ?? null;
  const positional: any[] = readiness?.positional ?? [];
  const biggestGap = useMemo(
    () => [...positional].filter((p) => p.gap > 0).sort((a, b) => b.gap - a.gap)[0] ?? null,
    [positional],
  );

  // Champion "edge" — the top strengths (components) and the positive drivers behind the title.
  const edgeComponents = useMemo(
    () => [...(readiness?.components ?? [])].sort((a: any, b: any) => b.score - a.score).slice(0, 3),
    [readiness],
  );
  const edgeDrivers = useMemo(() => {
    const ranked = [...(cr?.topReasons ?? [])].sort((a: any, b: any) => (b.severity ?? 0) - (a.severity ?? 0));
    const seen = new Set<string>();
    const out: any[] = [];
    for (const d of ranked) {
      const cat = String(d.category ?? d.id ?? out.length);
      if (seen.has(cat)) continue;
      seen.add(cat);
      out.push(d);
      if (out.length >= 2) break;
    }
    return out;
  }, [cr]);
  // Blockers: champion modes surface "obstacles overcome"; everyone else gets the raw reasons.
  const blockers: any[] = isChampionMode
    ? (cr?.obstaclesOvercome?.findings ?? cr?.topReasons ?? [])
    : (cr?.topReasons ?? []);
  const blockersLabel = isChampionMode ? "Obstacles you overcame" : "Why it hasn't happened";

  // Championship Benchmark — hoisted so "why-havent-won" can lead with it (the answer to the page's question).
  // Champion modes keep it lower as supporting evidence (Phase 2 builds their "Your Edge" hero).
  const benchmarkSection = (
    <Section icon={<Activity className="h-5 w-5" />} title="Championship Benchmark" subtitle={mode === "why-you-won" ? "Where your title profile still trails the champion average" : "How your starters measure against the average champion, position by position"}>
      {positional.length > 0 ? (
        <div className="space-y-1">
          <p className="mb-1 text-[12px] uppercase tracking-wide text-white/40">Starter points/game by position · amber line = champion benchmark</p>
          {positional.map((g: any) => (
            <GapBar key={g.position} position={g.position} ownerAvg={g.ownerAvg} championAvg={g.championAvg} gap={g.gap} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center text-[14px] text-white/55">Position scoring populates once weekly player stats are synced.</div>
      )}
      {readiness?.components?.length > 0 && (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {readiness.components.map((c: any) => (
            <div key={c.key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="mb-1.5 flex items-center justify-between text-[12px]">
                <span className="font-semibold text-white/70">{c.label}</span>
                <span className="tabular-nums font-bold text-white/85">{c.score}<span className="text-white/35"> · {Math.round(c.weight * 100)}%</span></span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className={cn("h-full rounded-full", c.score >= 70 ? "bg-lime-400/80" : c.score >= 45 ? "bg-amber-400/80" : "bg-red-500/70")} style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );

  const playoffTruthSection = showPlayoffPanel ? (
    <PlayoffPositionTruthPanel
      data={playoffQ.data}
      loading={playoffQ.isLoading}
      error={playoffQ.isError ? String(playoffQ.error?.message ?? "Couldn't load playoff split.") : undefined}
    />
  ) : null;

  const titleGapSection = (
      <Section icon={<Target className="h-5 w-5" />} title="Title Gap Summary" subtitle="The clearest read on how far you are from a championship">
              {cr?.careerStory && <p className="mb-4 text-[15px] leading-relaxed text-white/75">{cr.careerStory}</p>}
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniCard icon={<ArrowUpCircle className="h-4 w-4" />} label="Biggest Gap" tone="warn">
                  {biggestGap ? (
                    <>
                      <div className="text-[26px] font-black text-amber-300">{biggestGap.position}</div>
                      <p className="mt-1 text-[13px] text-white/55">−{biggestGap.gap} pts/game ({biggestGap.gapPct}%) vs champ {biggestGap.championAvg}</p>
                    </>
                  ) : <p className="text-[13px] text-lime-400">Matches champions at every position.</p>}
                </MiniCard>
                <MiniCard icon={<Gauge className="h-4 w-4" />} label="Championship Readiness" tone={readiness && readiness.score >= 70 ? "good" : "neutral"}>
                  {readiness ? (
                    <>
                      <div className="text-[26px] font-black text-white/90">{readiness.score}<span className="text-[15px] text-white/40">/100</span></div>
                      <p className="mt-1 text-[13px] text-white/55">{readiness.tier}</p>
                    </>
                  ) : <p className="text-[13px] text-white/50">Needs more synced history.</p>}
                </MiniCard>
                <MiniCard icon={<Trophy className="h-4 w-4" />} label={snapshot && snapshot.championshipDrought > 0 ? "Title Drought" : "Career Titles"}>
                  {snapshot ? (
                    <>
                      <div className="text-[26px] font-black text-white/90">{snapshot.championshipDrought > 0 ? snapshot.championshipDrought : snapshot.titles}</div>
                      <p className="mt-1 text-[13px] text-white/55">{snapshot.championshipDrought > 0 ? "seasons since your last title" : (snapshot.titles === 1 ? "championship" : "championships")}</p>
                    </>
                  ) : <p className="text-[13px] text-white/50">—</p>}
                </MiniCard>
              </div>
            </Section>
  );
  const blockersSection = (
      <Section icon={<TrendingDown className="h-5 w-5" />} title={mode === "why-you-won" ? "Historical Context" : "Historical Blockers"} subtitle={mode === "why-you-won" ? "What you had to overcome on the way to the title" : blockersLabel}>
              {blockers.length === 0 ? (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center text-[14px] text-white/55">No clear blockers in the synced history.</div>
              ) : (
                <ol className="space-y-2.5">
                  {blockers.slice(0, 6).map((b: any, i: number) => {
                    const sev = Math.round(Number(b.severity ?? 0));
                    return (
                      <li key={b.id ?? i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                        <div className="flex items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-400/15 text-[13px] font-bold text-violet-300">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[15px] font-bold text-white/90">{b.headline}</p>
                              {sev > 0 && <span className="shrink-0 text-[12px] font-semibold tabular-nums text-amber-300">{sev}</span>}
                            </div>
                            {b.detail && <p className="mt-1 text-[13px] leading-relaxed text-white/55">{b.detail}</p>}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Section>
  );
  const rivalSection = (
      <Section icon={<Swords className="h-5 w-5" />} title={mode === "why-you-won" ? "Biggest Threat to Repeat" : "Rival / Playoff Obstacles"} subtitle={mode === "why-you-won" ? "The owner most likely to deny your repeat" : "The owners and brackets standing in your way"}>
              {/* Canonical rivalry summary — single source of truth (Rivalry Center). Replaces the legacy careerReport threat/rival cards. */}
              <RivalrySummaryCard title="Your Top Rivalry" />
              {(() => {
                const obstacles = blockers.filter((b: any) => ["rivals", "playoffs", "close_games"].includes(b.category));
                if (obstacles.length === 0) return null;
                return (
                  <ul className="mt-3 space-y-2">
                    {obstacles.slice(0, 4).map((o: any, i: number) => (
                      <li key={o.id ?? i} className="flex gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-[13px] text-white/70">
                        <span className="mt-0.5 text-amber-300">›</span>
                        <span><span className="font-semibold text-white/85">{o.headline}</span>{o.detail ? ` — ${o.detail}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </Section>
  );
  const pathSection = (
      <Section icon={<Route className="h-5 w-5" />} title={mode === "why-you-won" ? "Closest Champion Archetype" : "Most Realistic Path"} subtitle={mode === "why-you-won" ? "The champion your profile most resembles" : "The champion you most resemble, and the moves that close the gap"}>
              {cp?.closestChampion ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-lime-400/20 bg-lime-500/[0.06] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Crown className="h-5 w-5 text-lime-400" />
                    <div>
                      <div className="text-[16px] font-black text-white/90">{cp.closestChampion.ownerName}</div>
                      <p className="text-[13px] text-white/55">{cp.closestChampion.season} champion · the archetype to emulate</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[22px] font-black tabular-nums text-lime-300">{cp.closestChampion.similarity}%</div>
                    <p className="text-[11px] uppercase tracking-wide text-white/40">similar profile</p>
                  </div>
                </div>
              ) : pathQ.isLoading ? (
                <SectionLoading
                  size="sm"
                  message="Finding your closest champion…"
                  className="mb-4 text-[13px] text-white/45"
                />
              ) : null}

              {cr?.titlePath?.moves?.length > 0 ? (
                <ol className="space-y-2">
                  {cr.titlePath.moves.map((m: any, i: number) => (
                    <li key={m.rank ?? i} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-400/15 text-[13px] font-bold text-lime-400">{m.rank ?? i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[15px] font-bold text-white/90">{m.title}</p>
                          {m.impact && <span className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", IMPACT_TONE[m.impact] ?? IMPACT_TONE.low)}>{m.impact}</span>}
                        </div>
                        {m.detail && <p className="mt-1 text-[13px] leading-relaxed text-white/55">{m.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                cr?.titlePath?.summary && <p className="text-[14px] text-white/55">{cr.titlePath.summary}</p>
              )}

              {cp?.championshipProfile?.available && (
                <details className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <summary className="cursor-pointer px-4 py-3 text-[13px] font-semibold text-white/70">Champion benchmark by season ▾</summary>
                  <div className="overflow-x-auto px-4 pb-4">
                    <table className="w-full border-collapse text-[13px]">
                      <thead>
                        <tr className="text-white/45">
                          <th className="px-3 py-2 text-left font-semibold">Season · Champion</th>
                          {cp.championshipProfile.positions.map((p: string) => <th key={p} className="px-3 py-2 text-right font-semibold tabular-nums">{p}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {cp.championshipProfile.seasons.map((row: any) => (
                          <tr key={row.season} className="border-t border-white/[0.06]">
                            <td className="px-3 py-2 text-left"><span className="font-bold tabular-nums text-white/90">{row.season}</span><span className="ml-2 text-white/55">{row.champion ?? "—"}</span></td>
                            {cp.championshipProfile.positions.map((p: string) => <td key={p} className="px-3 py-2 text-right tabular-nums text-white/85">{row.byPosition?.[p] ?? "—"}</td>)}
                          </tr>
                        ))}
                        <tr className="border-t-2 border-lime-400/30 bg-lime-500/[0.04]">
                          <td className="px-3 py-2 text-left font-bold text-lime-300">All champions · avg</td>
                          {cp.championshipProfile.positions.map((p: string) => <td key={p} className="px-3 py-2 text-right font-bold tabular-nums text-lime-300">{cp.championshipProfile.combined?.[p] || "—"}</td>)}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </Section>
  );
  const actionSection = (
      <Section icon={<ListChecks className="h-5 w-5" />} title="Action Plan" subtitle="Your highest-impact moves, in order">
              {readiness?.topActions?.length > 0 ? (
                <ol className="space-y-2">
                  {readiness.topActions.map((a: string, i: number) => (
                    <li key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[15px] text-white/85">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-400/15 text-[13px] font-bold text-lime-400">{i + 1}</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-center text-[14px] text-white/55">Action plan populates once readiness scoring has enough synced data.</div>
              )}
            </Section>
  );
  const edgeSection = (
      <Section icon={<Crown className="h-5 w-5" />} title="Your Championship Edge" subtitle="The dimensions where your profile out-performs the field — how you got here">
        <p className="mb-4 text-[15px] leading-relaxed text-white/80">
          You won because your profile carried title-winning traits — not because every position was perfect.
        </p>
        {cr?.careerStory && <p className="mb-4 text-[13px] leading-relaxed text-white/55">{cr.careerStory}</p>}
        {edgeComponents.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {edgeComponents.map((c: any) => (
              <div key={c.key} className="rounded-xl border border-lime-400/20 bg-lime-500/[0.06] p-4">
                <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">
                  <ShieldCheck className="h-4 w-4 text-lime-400" /> {c.label}
                </div>
                <div className="text-[30px] font-black tabular-nums text-lime-300">{c.score}<span className="text-[14px] text-white/35">/100</span></div>
              </div>
            ))}
          </div>
        )}
        {edgeDrivers.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/45">Why it mattered</p>
            <ul className="space-y-2">
              {edgeDrivers.map((d: any, i: number) => (
                <li key={d.id ?? i} className="rounded-xl border border-lime-400/15 bg-lime-500/[0.04] p-4">
                  <p className="text-[15px] font-bold text-white/90">{d.headline}</p>
                  {d.detail && <p className="mt-1 text-[13px] leading-relaxed text-white/60">{d.detail}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>
  );

  return (
    <IntelPageShell
      minHeight="screen"
      width="diagnosis"
      background="cinematic"
      padding="diagnosis"
    >
      <CinematicPageHeader
        title="Championship Diagnosis"
        subtitle={cr ? taglineFor(mode, cr.ownerName) : undefined}
        titleSize="large"
        badge={{ label: "Championship Diagnosis", icon: Trophy, tone: "violet" }}
        className="mb-0"
        meta={
          cr ? (
            <>
              {cr.careerArc ? (
                <CinematicMetaPill tone="violet">{cr.careerArc}</CinematicMetaPill>
              ) : null}
              <CinematicMetaPill tone="neutral">
                {snapshot?.seasonsPlayed ?? 0} seasons
              </CinematicMetaPill>
              {cr.teamCount > 0 ? (
                <CinematicMetaPill tone="neutral">{cr.teamCount}-Team League</CinematicMetaPill>
              ) : null}
              <CinematicMetaPill tone={cr.confidence === "High" ? "good" : "warn"}>
                Confidence: {cr.confidence}
              </CinematicMetaPill>
            </>
          ) : undefined
        }
      />

      {(!leagueKeyReady || (careerQ.isLoading && !cr)) && (
        <PageLoading
          message={
            !leagueKeyReady ? "Loading league…" : "Diagnosing your path to a title…"
          }
        />
      )}
      {leagueKeyReady && careerQ.isError && (
        <PageError
          message={`Couldn't run the diagnosis. ${String(careerQ.error?.message ?? "")}`}
        />
      )}
      {cr?.needsOwnerSelection && (
        <EmptyState
          icon={Crown}
          title="Select your team for this league"
          description="Pick your owner in Settings to run a personalized championship diagnosis."
        />
      )}

      {cr && !cr.needsOwnerSelection && (
        <>
          {/* Three modes, three hierarchies: why-you-won leads with the edge, why-havent-won with the benchmark, breakthrough keeps the interim order. */}
          {mode === "why-you-won" ? (
            <>
              {edgeSection}
              {rivalSection}
              {pathSection}
              {benchmarkSection}
              {playoffTruthSection}
              {blockersSection}
              {actionSection}
            </>
          ) : mode === "why-havent-won" ? (
            <>
              {benchmarkSection}
              {playoffTruthSection}
              {titleGapSection}
              {blockersSection}
              {rivalSection}
              {pathSection}
              {actionSection}
            </>
          ) : (
            <>
              {titleGapSection}
              {blockersSection}
              {benchmarkSection}
              {playoffTruthSection}
              {rivalSection}
              {pathSection}
              {actionSection}
            </>
          )}

          <p className="px-1 text-[12px] text-white/30">
            Every number is computed deterministically from real league history — matchups, standings, drafts, championships, and champion starter scoring. No projections. Champion benchmark = average of league champions' starter scoring by position.
          </p>
        </>
      )}
    </IntelPageShell>
  );
}

export default ChampionshipDiagnosis;
