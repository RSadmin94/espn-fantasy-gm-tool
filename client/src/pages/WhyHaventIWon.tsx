import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { type ReactNode, type CSSProperties } from "react";
import {
  Loader2, HelpCircle, Trophy, Target, TrendingDown, Swords, Crown, Calendar, ShoppingCart,
  Medal, Activity, Shield, Sparkles, Flame, Gauge, AlertTriangle, CheckCircle2, ArrowDown, ArrowUp,
} from "lucide-react";

const PAGEBG: CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};
const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

const CATEGORY_ICON: Record<string, ReactNode> = {
  playoffs: <Calendar className="h-5 w-5" />,
  scoring: <TrendingDown className="h-5 w-5" />,
  position: <Target className="h-5 w-5" />,
  acquisitions: <ShoppingCart className="h-5 w-5" />,
  rivals: <Swords className="h-5 w-5" />,
  draft: <Crown className="h-5 w-5" />,
  close_games: <Target className="h-5 w-5" />,
};

const ARC_STYLE: Record<string, { grad: string; text: string; ring: string; icon: ReactNode; blurb: string }> = {
  "The Dynasty":     { grad: "from-amber-400/25 to-yellow-600/10", text: "text-amber-300", ring: "border-amber-400/40", icon: <Crown className="h-4 w-4" />, blurb: "Repeat champion" },
  "The Breakthrough":{ grad: "from-lime-400/25 to-emerald-600/10", text: "text-lime-300", ring: "border-lime-400/40", icon: <Sparkles className="h-4 w-4" />, blurb: "Reached the mountaintop" },
  "The Contender":   { grad: "from-violet-400/25 to-fuchsia-600/10", text: "text-violet-300", ring: "border-violet-400/40", icon: <Flame className="h-4 w-4" />, blurb: "Proven, chasing the next" },
  "The Gatekeeper":  { grad: "from-cyan-400/25 to-sky-600/10", text: "text-cyan-300", ring: "border-cyan-400/40", icon: <Shield className="h-4 w-4" />, blurb: "Perennial finalist, no trophy" },
  "The Challenger":  { grad: "from-orange-400/25 to-red-600/10", text: "text-orange-300", ring: "border-orange-400/40", icon: <Swords className="h-4 w-4" />, blurb: "Winning record, still chasing" },
  "The Builder":     { grad: "from-teal-400/25 to-emerald-600/10", text: "text-teal-300", ring: "border-teal-400/40", icon: <Activity className="h-4 w-4" />, blurb: "Active roster constructor" },
  "The Underdog":    { grad: "from-slate-300/20 to-slate-600/10", text: "text-slate-300", ring: "border-slate-400/40", icon: <Target className="h-4 w-4" />, blurb: "Persistent against the odds" },
};

const TIER_COLOR: Record<string, string> = {
  "Championship-Ready": "text-amber-300",
  "Contender": "text-lime-400",
  "Rising": "text-cyan-300",
  "Rebuilding": "text-orange-300",
  "Foundation": "text-white/60",
};

function scoreColor(n: number): string { return n >= 70 ? "text-lime-400" : n >= 50 ? "text-amber-300" : "text-red-400"; }
function scoreBar(n: number): string { return n >= 70 ? "bg-lime-400" : n >= 50 ? "bg-amber-400" : "bg-red-500"; }
function sevText(s: string): string { return s === "high" ? "text-red-400" : s === "medium" ? "text-orange-300" : s === "low" ? "text-lime-400" : "text-white/75"; }
function sevBorder(s: string): string { return s === "high" ? "border-red-500/25" : s === "medium" ? "border-orange-400/20" : "border-white/[0.06]"; }

function severityColor(s: number): string {
  if (s >= 80) return "text-red-400";
  if (s >= 55) return "text-orange-400";
  if (s >= 35) return "text-amber-300";
  return "text-white/60";
}
function severityBar(s: number): string {
  if (s >= 80) return "bg-red-500";
  if (s >= 55) return "bg-orange-500";
  if (s >= 35) return "bg-amber-400";
  return "bg-white/30";
}

function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
      <div className={cn("text-[22px] font-black leading-none tabular-nums", accent ?? "text-white/90")}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  );
}

function TimelineRow({ card }: { card: any }) {
  const champ = card.isChampion;
  const runner = card.isRunnerUp;
  const madePlayoffs = !champ && !runner && typeof card.finish === "number" && card.finish > 0 && card.finish <= 6;
  const inProgress = card.resultLabel === "In Progress";

  const dot = champ ? "bg-amber-400 ring-amber-400/30"
    : runner ? "bg-violet-400 ring-violet-400/30"
    : madePlayoffs ? "bg-cyan-400 ring-cyan-400/20"
    : inProgress ? "bg-white/30 ring-white/10"
    : "bg-white/15 ring-white/5";

  const labelColor = champ ? "text-amber-300"
    : runner ? "text-violet-300"
    : madePlayoffs ? "text-cyan-300"
    : "text-white/45";

  return (
    <div className="relative flex gap-4">
      <div className="relative flex w-12 shrink-0 flex-col items-center">
        <div className={cn("z-10 mt-1 h-3.5 w-3.5 rounded-full ring-4", dot)} />
        <div className="absolute top-1 bottom-[-20px] w-px bg-white/[0.08]" />
      </div>
      <div
        className={cn(
          "mb-3 flex-1 rounded-xl border bg-white/[0.02] p-3.5 sm:p-4",
          champ ? "border-amber-400/30 bg-amber-400/[0.04] shadow-[0_0_24px_-16px_rgba(245,197,24,0.7)]"
            : runner ? "border-violet-400/25"
            : "border-white/[0.06]",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[20px] font-black tabular-nums text-white/90">{card.season}</span>
            <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-bold", labelColor)}>
              {champ && <Trophy className="h-3.5 w-3.5" />}
              {runner && <Medal className="h-3.5 w-3.5" />}
              {card.resultLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[13px] tabular-nums text-white/55">
            <span className="font-semibold text-white/75">{card.record}</span>
            {card.pointsFor != null && <span className="hidden sm:inline">{card.pointsFor.toLocaleString()} PF</span>}
          </div>
        </div>
        {(champ || card.championName) && (
          <div className="mt-1.5 text-[12px] text-white/40">
            {champ ? (
              <span className="font-semibold text-amber-300/90">Your championship season</span>
            ) : card.championName ? (
              <>Champion that year: <span className="text-white/60">{card.championName}</span></>
            ) : null}
          </div>
        )}
        {!card.playerLevelAvailable && !inProgress && (
          <div className="mt-1.5 text-[11px] italic text-white/25">Player-level metrics unavailable before 2021. Team-level analysis available.</div>
        )}
      </div>
    </div>
  );
}

const POS_ORDER = ["QB", "RB", "WR", "TE"];

export function WhyHaventIWon() {
  const q = trpc.leagueIntel.careerReport.useQuery(undefined, { staleTime: 60_000 });
  const data = q.data;
  const snap = data?.snapshot ?? null;
  const arc = data?.careerArc ?? null;
  const arcStyle = (arc && ARC_STYLE[arc]) || null;
  const readiness = data?.readiness ?? null;
  const patterns = data?.patterns ?? [];
  const isWin = data?.mode === "why-you-won" || data?.mode === "why-you-broke-through";

  const reasonsHeading =
    data?.mode === "why-you-won" ? "Top Reasons You Won"
    : data?.mode === "why-you-broke-through" ? "Why You Broke Through"
    : "Top Reasons You Haven't Won";

  const sortedPositional = readiness
    ? [...readiness.positional].sort((a: any, b: any) => POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position))
    : [];

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">

        {q.isLoading && (
          <div className={cn(PANEL, "flex items-center justify-center gap-3 p-16 text-white/50")}>
            <Loader2 className="h-5 w-5 animate-spin text-lime-400" /> Reading your league history...
          </div>
        )}
        {q.isError && (
          <div className={cn(PANEL, "p-8 text-center text-red-300")}>Couldn't build your career report. {String(q.error?.message ?? "")}</div>
        )}

        {data && (
          <div className="space-y-6">

            {/* SECTION 0 - Career Story Header */}
            <div className={cn(PANEL, "overflow-hidden p-6 sm:p-8")}>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
                <HelpCircle className="h-3.5 w-3.5" /> LeagueDNA Intelligence
              </div>

              {arc && arcStyle && (
                <div className={cn("mb-3 inline-flex items-center gap-2 rounded-full border bg-gradient-to-r px-3.5 py-1.5 text-[13px] font-black uppercase tracking-wider", arcStyle.grad, arcStyle.text, arcStyle.ring)}>
                  {arcStyle.icon}
                  {arc}
                  <span className="font-medium normal-case text-white/45">&middot; {arcStyle.blurb}</span>
                </div>
              )}

              <h1 className="text-[32px] font-black leading-[1.04] tracking-tight sm:text-[44px]">
                {data.mode === "why-you-won" ? <>Why You Won<span className="align-super text-[0.4em] text-white/40">{"\u2122"}</span></>
                  : data.mode === "why-you-broke-through" ? <>Why You Broke Through<span className="align-super text-[0.4em] text-white/40">{"\u2122"}</span></>
                  : <>Why Haven't I Won<span className="text-lime-400">?</span><span className="align-super text-[0.4em] text-white/40">{"\u2122"}</span></>}
              </h1>
              <p className="mt-1.5 text-[14px] text-white/45">{data.subtitle}</p>

              {data.careerStory && (
                <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-white/85">{data.careerStory}</p>
              )}
              <div className="mt-4 text-[13px] text-white/40">
                <span className="font-semibold text-white/70">{data.ownerName}</span>
                {snap && <> &middot; {snap.seasonsPlayed} seasons of real league data &middot; confidence {data.confidence}</>}
              </div>
            </div>

            {/* SECTION 1 - Career Snapshot */}
            {snap && (
              <div className={cn(PANEL, "p-5 sm:p-6")}>
                <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-lime-400">
                  <Trophy className="h-4 w-4" /> Career Snapshot
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Seasons" value={snap.seasonsPlayed} />
                  <Stat label="Titles" value={snap.titles} accent={snap.titles > 0 ? "text-amber-300" : "text-white/90"} />
                  <Stat label="Runner-Ups" value={snap.runnerUps} accent={snap.runnerUps > 0 ? "text-violet-300" : "text-white/90"} />
                  <Stat label="Playoff Trips" value={snap.playoffTrips} />
                  <Stat label="Win %" value={`${Math.round(snap.careerWinRate * 100)}%`} accent={snap.careerWinRate >= 0.5 ? "text-lime-400" : "text-white/90"} />
                  <Stat label="Best Finish" value={snap.bestFinish ? `#${snap.bestFinish}` : "-"} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-white/50">
                  {snap.activityDna.primary && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                      <Activity className="h-3.5 w-3.5 text-lime-400" /> Activity DNA: <span className="font-semibold text-white/80">{snap.activityDna.primary}</span>
                      {snap.activityDna.secondary && <span className="text-white/40">/ {snap.activityDna.secondary}</span>}
                    </span>
                  )}
                  {readiness && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                      <Gauge className="h-3.5 w-3.5 text-lime-400" /> Championship Readiness:
                      <span className={cn("font-bold", scoreColor(readiness.score))}>{readiness.score}</span>
                      <span className="text-white/40">({readiness.tier})</span>
                    </span>
                  )}
                  {snap.titles > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-amber-300">
                      <Crown className="h-3.5 w-3.5" /> {snap.championSeasons.join(", ")}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* SECTION 2 - Season Timeline (centerpiece) */}
            {data.timeline.length > 0 && (
              <div className={cn(PANEL, "p-5 sm:p-6")}>
                <div className="mb-5 flex items-center gap-3">
                  <span className="text-lime-400"><Calendar className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-[20px] font-extrabold leading-tight">Season Timeline</h2>
                    <p className="text-[13px] text-white/45">Every season of your career, oldest to newest</p>
                  </div>
                </div>
                <div className="pl-1">
                  {data.timeline.map((c: any) => <TimelineRow key={c.season} card={c} />)}
                </div>
              </div>
            )}

            {/* SECTION 3 - Pattern Detection */}
            {patterns.length > 0 && (
              <div className={cn(PANEL, "p-5 sm:p-6")}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-orange-300"><AlertTriangle className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-[20px] font-extrabold leading-tight">Pattern Detection</h2>
                    <p className="text-[13px] text-white/45">The recurring signals in your league history</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {patterns.map((p: any) => (
                    <div key={p.id} className={cn("rounded-xl border bg-white/[0.02] p-4", sevBorder(p.severity))}>
                      <div className={cn("text-[26px] font-black leading-none tabular-nums", sevText(p.severity))}>{p.value}</div>
                      <div className="mt-1.5 text-[13px] font-semibold text-white/85">{p.label}</div>
                      <div className="mt-1 text-[11.5px] leading-snug text-white/40">{p.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 4 - Championship Readiness Score */}
            {readiness && (
              <div className={cn(PANEL, "p-5 sm:p-6")}>
                <div className="mb-5 flex items-center gap-3">
                  <span className="text-lime-400"><Gauge className="h-5 w-5" /></span>
                  <div>
                    <h2 className="text-[20px] font-extrabold leading-tight">Championship Readiness Score</h2>
                    <p className="text-[13px] text-white/45">Positional 40% &middot; Playoff 15% &middot; Acquisitions 15% &middot; Draft 15% &middot; Roster Mgmt 10% &middot; Activity 5%</p>
                  </div>
                </div>

                {/* score hero */}
                <div className="flex items-center gap-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="text-center">
                    <div className={cn("text-[56px] font-black leading-none tabular-nums", scoreColor(readiness.score))}>{readiness.score}</div>
                    <div className="text-[11px] uppercase tracking-wide text-white/40">out of 100</div>
                  </div>
                  <div className="flex-1">
                    <div className={cn("text-[18px] font-extrabold", TIER_COLOR[readiness.tier] ?? "text-white/80")}>{readiness.tier}</div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className={cn("h-full rounded-full", scoreBar(readiness.score))} style={{ width: `${readiness.score}%` }} />
                    </div>
                  </div>
                </div>

                {/* component breakdown */}
                <div className="mt-4 grid gap-2.5">
                  {readiness.components.map((c: any) => (
                    <div key={c.key} className="flex items-center gap-3">
                      <div className="w-40 shrink-0 text-[13px] text-white/60">{c.label} <span className="text-white/30">({Math.round(c.weight * 100)}%)</span></div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className={cn("h-full rounded-full", scoreBar(c.score))} style={{ width: `${c.score}%` }} />
                      </div>
                      <div className={cn("w-9 shrink-0 text-right text-[13px] font-bold tabular-nums", scoreColor(c.score))}>{c.score}</div>
                    </div>
                  ))}
                </div>

                {/* positional gap cards */}
                {sortedPositional.length > 0 && (
                  <>
                    <div className="mt-6 mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">Your starters vs the champion benchmark (pts/game)</div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {sortedPositional.map((g: any) => {
                        const behind = g.gap > 0.05;
                        const ahead = g.gap < -0.05;
                        return (
                          <div key={g.position} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                            <div className="text-[12px] font-bold uppercase tracking-wide text-white/50">{g.position}</div>
                            <div className="mt-1 text-[20px] font-black tabular-nums text-white/90">{g.ownerAvg.toFixed(1)}</div>
                            <div className="text-[11px] text-white/35">champ {g.championAvg.toFixed(1)}</div>
                            <div className={cn("mt-1 inline-flex items-center gap-1 text-[12px] font-bold tabular-nums", behind ? "text-red-400" : ahead ? "text-lime-400" : "text-white/50")}>
                              {behind ? <ArrowDown className="h-3 w-3" /> : ahead ? <ArrowUp className="h-3 w-3" /> : null}
                              {g.gap > 0 ? `-${g.gap.toFixed(1)}` : `+${Math.abs(g.gap).toFixed(1)}`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* action plan */}
                {readiness.topActions.length > 0 && (
                  <>
                    <div className="mt-6 mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-lime-400">
                      <CheckCircle2 className="h-4 w-4" /> Action Plan
                    </div>
                    <div className="space-y-2">
                      {readiness.topActions.map((a: string, i: number) => (
                        <div key={i} className="flex items-start gap-3 rounded-xl border border-lime-400/15 bg-lime-400/[0.03] p-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime-400/15 text-[11px] font-bold text-lime-400">{i + 1}</span>
                          <span className="text-[14px] text-white/80">{a}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SECTION 5 - Top Reasons (diagnostic) */}
            <div className={cn(PANEL, "p-5 sm:p-6")}>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-lime-400">{isWin ? <Trophy className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}</span>
                <div>
                  <h2 className="text-[20px] font-extrabold leading-tight">{reasonsHeading}</h2>
                  <p className="text-[13px] text-white/45">Ranked by deterministic severity from real league data</p>
                </div>
              </div>
              <div className="space-y-3">
                {data.topReasons.map((f: any, i: number) => (
                  <div key={f.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("mt-0.5 shrink-0", severityColor(f.severity))}>{CATEGORY_ICON[f.category] ?? <Target className="h-5 w-5" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-white/90"><span className="mr-2 text-white/35">{i + 1}.</span>{f.headline}</div>
                          <span className={cn("shrink-0 text-[13px] font-bold tabular-nums", severityColor(f.severity))}>{Math.round(f.severity)}</span>
                        </div>
                        <p className="mt-1 text-[14px] text-white/55">{f.detail}</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                          <div className={cn("h-full rounded-full", severityBar(f.severity))} style={{ width: `${Math.round(f.severity)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {data.topReasons.length === 0 && (
                  <p className="text-[14px] text-white/50">No standout weaknesses found in the data - a balanced resume.</p>
                )}
              </div>
            </div>

            <p className="px-1 text-[12px] text-white/30">
              Every number is computed deterministically from real league history (matchups, standings, drafts, championships). No estimates, no AI-generated facts.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default WhyHaventIWon;
