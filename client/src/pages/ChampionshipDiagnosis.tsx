import { useMemo, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { RivalrySummaryCard } from "@/components/RivalrySummaryCard";
import {
  Loader2, Trophy, Target, Crown, Swords, ShieldCheck, ListChecks,
  Route, AlertTriangle, TrendingDown, Gauge, Activity, ArrowUpCircle,
} from "lucide-react";

/**
 * Championship Diagnosis — the merged replacement for "Why Haven't I Won?" + "Championship Path".
 * Primary spine: leagueIntel.careerReport (mode-adaptive, readiness, blockers, action plan).
 * Secondary (2 unique cards only): leagueIntel.championshipPath → Closest Champion + Championship Profile.
 * Pure presentation composition of existing outputs — no new scoring.
 */
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

  const cr: any = leagueKeyReady ? careerQ.data : undefined;
  const cp: any = leagueKeyReady ? pathQ.data : undefined;

  const mode: string = cr?.mode ?? "why-havent-won";
  const isChampionMode = mode === "why-you-won" || mode === "why-you-broke-through";
  const snapshot = cr?.snapshot ?? null;
  const readiness = cr?.readiness ?? null;
  const positional: any[] = readiness?.positional ?? [];
  const biggestGap = useMemo(
    () => [...positional].filter((p) => p.gap > 0).sort((a, b) => b.gap - a.gap)[0] ?? null,
    [positional],
  );
  // Blockers: champion modes surface "obstacles overcome"; everyone else gets the raw reasons.
  const blockers: any[] = isChampionMode
    ? (cr?.obstaclesOvercome?.findings ?? cr?.topReasons ?? [])
    : (cr?.topReasons ?? []);
  const blockersLabel = isChampionMode ? "Obstacles you overcame" : "Why it hasn't happened";

  // Championship Benchmark — hoisted so "why-havent-won" can lead with it (the answer to the page's question).
  // Champion modes keep it lower as supporting evidence (Phase 2 builds their "Your Edge" hero).
  const benchmarkSection = (
    <Section icon={<Activity className="h-5 w-5" />} title="Championship Benchmark" subtitle="How your starters measure against the average champion, position by position">
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

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      <div className="px-6 py-6 max-w-[1200px]">
        {/* Hero */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
              <Trophy className="h-3.5 w-3.5" /> Championship Diagnosis
            </div>
            <h1 className="text-[34px] font-black leading-[1.05] tracking-tight sm:text-[42px]">
              Championship Diagnosis
            </h1>
            {cr && <p className="mt-2 text-[15px] text-white/55">{taglineFor(mode, cr.ownerName)}</p>}
          </div>
          {cr && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
              {cr.careerArc && (
                <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold text-violet-200">{cr.careerArc}</span>
              )}
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">
                {snapshot?.seasonsPlayed ?? 0} seasons
              </span>
              {cr.teamCount > 0 && (
                <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">{cr.teamCount}-Team League</span>
              )}
              <span className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold", cr.confidence === "High" ? "border-lime-400/30 bg-lime-500/10 text-lime-300" : "border-amber-400/30 bg-amber-500/10 text-amber-300")}>Confidence: {cr.confidence}</span>
            </div>
          )}
        </div>

        {/* States */}
        {(!leagueKeyReady || (careerQ.isLoading && !cr)) && (
          <div className={cn(PANEL, "flex items-center justify-center gap-3 p-16 text-white/50")}>
            <Loader2 className="h-5 w-5 animate-spin text-lime-400" />{" "}
            {!leagueKeyReady ? "Loading league…" : "Diagnosing your path to a title…"}
          </div>
        )}
        {leagueKeyReady && careerQ.isError && (
          <div className={cn(PANEL, "p-8 text-center text-red-300")}>Couldn't run the diagnosis. {String(careerQ.error?.message ?? "")}</div>
        )}
        {cr?.needsOwnerSelection && (
          <div className={cn(PANEL, "p-8 text-center")}>
            <Crown className="mx-auto mb-3 h-7 w-7 text-lime-400" />
            <p className="text-[18px] font-black text-white/90">Select your team for this league</p>
            <p className="mt-1 text-[14px] text-white/55">Pick your owner in Settings to run a personalized championship diagnosis.</p>
          </div>
        )}

        {cr && !cr.needsOwnerSelection && (
          <div className="space-y-6">

            {/* why-havent-won leads with the benchmark — it is the answer to "Why haven't I won?" */}
            {mode === "why-havent-won" && benchmarkSection}

            {/* SECTION 1 — Title Gap Summary */}
            <Section icon={<Target className="h-5 w-5" />} title="Title Gap Summary" subtitle="The clearest read on how far you are from a championship">
              {cr.careerStory && <p className="mb-4 text-[15px] leading-relaxed text-white/75">{cr.careerStory}</p>}
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

            {/* SECTION 2 — Historical Blockers */}
            <Section icon={<TrendingDown className="h-5 w-5" />} title="Historical Blockers" subtitle={blockersLabel}>
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

            {/* SECTION 3 — Championship Benchmark. Champion modes keep it here as evidence; why-havent-won hoists it to the top. */}
            {mode !== "why-havent-won" && benchmarkSection}

            {/* SECTION 4 — Rival / Playoff Obstacles */}
            <Section icon={<Swords className="h-5 w-5" />} title="Rival / Playoff Obstacles" subtitle="The owners and brackets standing in your way">
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

            {/* SECTION 5 — Most Realistic Path */}
            <Section icon={<Route className="h-5 w-5" />} title="Most Realistic Path" subtitle="The champion you most resemble, and the moves that close the gap">
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
                <div className="mb-4 flex items-center gap-2 text-[13px] text-white/45"><Loader2 className="h-4 w-4 animate-spin" /> Finding your closest champion…</div>
              ) : null}

              {cr.titlePath?.moves?.length > 0 ? (
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
                cr.titlePath?.summary && <p className="text-[14px] text-white/55">{cr.titlePath.summary}</p>
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

            {/* SECTION 6 — Action Plan */}
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

            <p className="px-1 text-[12px] text-white/30">
              Every number is computed deterministically from real league history — matchups, standings, drafts, championships, and champion starter scoring. No projections. Champion benchmark = average of league champions' starter scoring by position.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChampionshipDiagnosis;
