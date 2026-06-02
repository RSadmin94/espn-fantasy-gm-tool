import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2, HelpCircle, Trophy, Target, TrendingDown, Swords, Crown, Calendar, ShoppingCart } from "lucide-react";

const PAGEBG: React.CSSProperties = {
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
      <div className={cn("text-[24px] font-black leading-none tabular-nums", accent ?? "text-white/90")}>{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-white/40">{label}</div>
    </div>
  );
}

export function WhyHaventIWon() {
  const q = trpc.leagueIntel.whyHaventIWon.useQuery(undefined, { staleTime: 60_000 });
  const data = q.data;

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Hero */}
        <div className="mb-6">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
            <HelpCircle className="h-3.5 w-3.5" /> LeagueDNA Intelligence
          </div>
          <h1 className="text-[34px] font-black leading-[1.05] tracking-tight sm:text-[42px]">
            Why Haven't I Won<span className="text-lime-400">?</span>™
          </h1>
          {data && (
            <p className="mt-2 max-w-2xl text-[15px] text-white/55">
              A deterministic diagnosis for <span className="font-semibold text-white/85">{data.ownerName}</span> across{" "}
              {data.seasonsPlayed} season{data.seasonsPlayed === 1 ? "" : "s"} of real league data.
            </p>
          )}
        </div>

        {q.isLoading && (
          <div className={cn(PANEL, "flex items-center justify-center gap-3 p-16 text-white/50")}>
            <Loader2 className="h-5 w-5 animate-spin text-lime-400" /> Analyzing your league history…
          </div>
        )}
        {q.isError && (
          <div className={cn(PANEL, "p-8 text-center text-red-300")}>Couldn't run the analysis. {String(q.error?.message ?? "")}</div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Titles" value={data.titles} accent={data.titles > 0 ? "text-amber-300" : "text-white/90"} />
              <Stat label="Best Finish" value={data.bestFinish ? `#${data.bestFinish}` : "—"} />
              <Stat label="Playoff Trips" value={`${data.playoffAppearances}/${data.seasonsPlayed}`} />
              <Stat label="Confidence" value={data.confidence} accent={data.confidence === "High" ? "text-lime-400" : "text-amber-300"} />
            </div>

            {/* Narrative */}
            <div className={cn(PANEL, "p-5 sm:p-6")}>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-lime-400">
                <Crown className="h-4 w-4" /> The Verdict
              </div>
              <p className="text-[16px] leading-relaxed text-white/85">{data.narrative}</p>
              {data.hasWon && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[12px] font-semibold text-amber-300">
                  <Trophy className="h-3.5 w-3.5" /> Champion — {data.titles} title{data.titles > 1 ? "s" : ""}
                </div>
              )}
            </div>

            {/* Top reasons */}
            <div className={cn(PANEL, "p-5 sm:p-6")}>
              <div className="mb-4 flex items-center gap-3">
                <span className="text-lime-400"><TrendingDown className="h-5 w-5" /></span>
                <div>
                  <h2 className="text-[20px] font-extrabold leading-tight">Top {data.findings.length} Reasons</h2>
                  <p className="text-[13px] text-white/45">Ranked by deterministic severity</p>
                </div>
              </div>
              <div className="space-y-3">
                {data.findings.map((f, i) => (
                  <div key={f.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <span className={cn("mt-0.5 shrink-0", severityColor(f.severity))}>{CATEGORY_ICON[f.category] ?? <Target className="h-5 w-5" />}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-bold text-white/90">
                            <span className="mr-2 text-white/35">{i + 1}.</span>
                            {f.headline}
                          </div>
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
                {data.findings.length === 0 && (
                  <p className="text-[14px] text-white/50">No standout weaknesses found in the data — a balanced résumé.</p>
                )}
              </div>
            </div>

            <p className="px-1 text-[12px] text-white/30">
              All findings are computed deterministically from real league data (matchups, weekly scoring, drafts, championships). No estimates.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default WhyHaventIWon;
