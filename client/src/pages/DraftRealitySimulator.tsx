import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Loader2,
  FlaskConical,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from "lucide-react";

/* ── Fantasy Football Rivals design system ─────────────────────────────── */
const PAGEBG: React.CSSProperties = {
  background:
    "radial-gradient(circle at 80% -10%,rgba(139,92,246,.20),transparent 42%),linear-gradient(180deg,#0e0a10,#080609)",
  color: "#f3f8ff",
};
const PANEL =
  "rounded-2xl border border-white/[0.07] bg-[linear-gradient(180deg,#1b131f,#140e17)] shadow-[0_0_28px_-14px_rgba(0,0,0,0.65)]";

const SEASONS = [2025, 2024, 2023, 2022, 2021];

/* ── helpers ───────────────────────────────────────────────────────────── */
function gradeColor(g: number): string {
  if (g >= 80) return "text-lime-400";
  if (g >= 60) return "text-emerald-300";
  if (g >= 40) return "text-amber-300";
  if (g >= 20) return "text-orange-400";
  return "text-red-400";
}
function gradeBar(g: number): string {
  if (g >= 80) return "bg-lime-400";
  if (g >= 60) return "bg-emerald-400";
  if (g >= 40) return "bg-amber-400";
  if (g >= 20) return "bg-orange-500";
  return "bg-red-500";
}

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

function RankDelta({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-white/30">—</span>;
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-1 font-bold text-lime-400">
        <TrendingUp className="h-4 w-4" /> +{delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center gap-1 font-bold text-red-400">
        <TrendingDown className="h-4 w-4" /> {delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-white/40">
      <Minus className="h-4 w-4" /> 0
    </span>
  );
}

/* ── main page ─────────────────────────────────────────────────────────── */
export function DraftRealitySimulator() {
  const [season, setSeason] = useState<number>(2025);
  const simQ = trpc.draftReality.simulate.useQuery({ season }, { staleTime: 60_000 });
  const data = simQ.data;

  return (
    <div className="min-h-screen w-full" style={PAGEBG}>
      <div className="px-6 py-6 max-w-[1400px]">
        {/* Hero */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-wider text-violet-300">
              <FlaskConical className="h-3.5 w-3.5" /> Draft Reality Simulator™
            </div>
            <h1 className="text-[34px] font-black leading-[1.05] tracking-tight sm:text-[42px]">
              What if nobody touched <span className="text-lime-400">their roster?</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-white/55">
              We freeze every team on draft day, play the optimal best-ball lineup each week from only their drafted
              players, and replay the real schedule. The result separates <span className="text-white/80">draft skill</span> from{" "}
              <span className="text-white/80">in-season roster management</span>.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">14-Team League</span>
            <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-[11px] font-semibold text-zinc-300">Best-Ball Sim</span>
          </div>
        </div>

        {/* Season selector + confidence */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {SEASONS.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={cn(
                  "rounded-lg px-4 py-2 text-[14px] font-bold transition",
                  s === season
                    ? "bg-lime-400 text-black shadow-[0_0_20px_-6px_rgba(163,230,53,0.6)]"
                    : "border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {data && (
            <div
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] font-semibold",
                data.confidence === "High"
                  ? "border-lime-400/30 bg-lime-500/10 text-lime-300"
                  : data.confidence === "Medium"
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-300"
                    : "border-orange-400/30 bg-orange-500/10 text-orange-300",
              )}
              title={data.confidenceReason}
            >
              Simulation confidence: {data.confidence}
            </div>
          )}
        </div>

        {simQ.isLoading && (
          <div className={cn(PANEL, "flex items-center justify-center gap-3 p-16 text-white/50")}>
            <Loader2 className="h-5 w-5 animate-spin text-lime-400" /> Running {season} simulation…
          </div>
        )}
        {simQ.isError && (
          <div className={cn(PANEL, "p-8 text-center text-red-300")}>
            Couldn't run the simulation for {season}. {String(simQ.error?.message ?? "")}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Standings side-by-side */}
            <div className="grid gap-6 lg:grid-cols-2">
              <StandingsTable
                title="Actual Standings"
                subtitle="How the season really finished"
                accent="violet"
                rows={data.actualStandings.map((r) => ({ rank: r.rank, name: r.ownerName, record: `${r.wins}-${r.losses}${r.ties ? "-" + r.ties : ""}`, pf: r.pointsFor }))}
              />
              <StandingsTable
                title="Draft-Only Standings"
                subtitle="Best-ball from draft picks · no moves"
                accent="lime"
                rows={data.draftOnlyStandings.map((r) => ({ rank: r.rank, name: r.ownerName, record: `${r.wins}-${r.losses}${r.ties ? "-" + r.ties : ""}`, pf: r.pointsFor }))}
              />
            </div>

            <RankChanges data={data} />
            <Superlatives data={data} />
            <OwnerImpactCards data={data} />
            <Insights data={data} />
          </div>
        )}
      </div>
    </div>
  );
}

type SimData = import("../../../server/draftRealitySimulator").DraftRealityResult;

/* ── Standings table ───────────────────────────────────────────────────── */
function StandingsTable({
  title,
  subtitle,
  accent,
  rows,
}: {
  title: string;
  subtitle: string;
  accent: "violet" | "lime";
  rows: { rank: number; name: string; record: string; pf: number }[];
}) {
  const accentText = accent === "lime" ? "text-lime-400" : "text-violet-300";
  return (
    <Section icon={<Trophy className="h-5 w-5" />} title={title} subtitle={subtitle}>
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="bg-white/[0.03] text-left text-[12px] uppercase tracking-wide text-white/40">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Owner</th>
              <th className="px-3 py-2 text-right font-semibold">Record</th>
              <th className="px-3 py-2 text-right font-semibold">PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.rank} className="border-t border-white/[0.05]">
                <td className={cn("px-3 py-2 font-extrabold tabular-nums", r.rank <= 3 ? accentText : "text-white/50")}>{r.rank}</td>
                <td className="px-3 py-2 font-medium text-white/90">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/70">{r.record}</td>
                <td className="px-3 py-2 text-right tabular-nums text-white/55">{r.pf.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ── Rank changes ──────────────────────────────────────────────────────── */
function RankChanges({ data }: { data: SimData }) {
  const rows = useMemo(
    () =>
      [...data.ownerImpacts]
        .filter((o) => o.rankDelta != null)
        .sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0)),
    [data],
  );
  return (
    <Section
      icon={<ArrowUpRight className="h-5 w-5" />}
      title="Rank Changes"
      subtitle="Draft-only finish → actual finish (positive = roster management lifted them)"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((o) => (
          <div key={o.ownerKey} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="text-[13px] tabular-nums text-white/40">
                #{o.draftRank} <span className="text-white/25">→</span> #{o.actualRank}
              </span>
              <span className="font-medium text-white/90">{o.ownerName}</span>
            </div>
            <RankDelta delta={o.rankDelta} />
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Superlatives ──────────────────────────────────────────────────────── */
function Superlatives({ data }: { data: SimData }) {
  const s = data.superlatives;
  const cards: { key: string; label: string; emoji: string; v: { ownerName: string; value: number } | null; tone: "good" | "bad" | "neutral" }[] = [
    { key: "bestDrafter", label: "Best Drafter", emoji: "🎯", v: s.bestDrafter, tone: "good" },
    { key: "bestManager", label: "Best Roster Manager", emoji: "🧠", v: s.bestManager, tone: "good" },
    { key: "mostImproved", label: "Most Improved by Moves", emoji: "📈", v: s.mostImproved, tone: "good" },
    { key: "draftFraud", label: "Draft Fraud™", emoji: "📉", v: s.draftFraud, tone: "bad" },
    { key: "pointsAddedKing", label: "Most Points Added", emoji: "💰", v: s.pointsAddedKing, tone: "neutral" },
    { key: "draftSteal", label: "Best Draft on Paper", emoji: "💎", v: s.draftSteal, tone: "neutral" },
  ];
  return (
    <Section icon={<Sparkles className="h-5 w-5" />} title="Biggest Movers" subtitle="Awards from the draft-vs-reality gap">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className={cn(
              "rounded-xl border p-4",
              c.tone === "good"
                ? "border-lime-400/20 bg-lime-500/[0.06]"
                : c.tone === "bad"
                  ? "border-red-400/20 bg-red-500/[0.06]"
                  : "border-violet-400/20 bg-violet-500/[0.06]",
            )}
          >
            <div className="text-[12px] font-semibold uppercase tracking-wide text-white/45">
              {c.emoji} {c.label}
            </div>
            <div className="mt-1 text-[18px] font-extrabold text-white/90">{c.v?.ownerName ?? "—"}</div>
            {c.v && <div className="text-[13px] text-white/45 tabular-nums">{c.v.value}</div>}
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Owner impact cards ────────────────────────────────────────────────── */
function OwnerImpactCards({ data }: { data: SimData }) {
  return (
    <Section
      icon={<FlaskConical className="h-5 w-5" />}
      title="Owner Impact Cards"
      subtitle="Draft grade · roster-management grade · overall — sorted by overall"
    >
      <div className="grid gap-3 md:grid-cols-2">
        {data.ownerImpacts.map((o) => (
          <div key={o.ownerKey} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-extrabold text-white/90">{o.ownerName}</div>
              <div className={cn("text-[22px] font-black tabular-nums", gradeColor(o.overallGrade))}>{o.overallGrade}</div>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center text-[12px]">
              <div className="rounded-lg bg-white/[0.03] py-2">
                <div className="text-white/40">Actual</div>
                <div className="font-bold text-white/85">#{o.actualRank ?? "—"}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] py-2">
                <div className="text-white/40">Draft</div>
                <div className="font-bold text-white/85">#{o.draftRank ?? "—"}</div>
              </div>
              <div className="rounded-lg bg-white/[0.03] py-2">
                <div className="text-white/40">Δ Rank</div>
                <div className="font-bold"><RankDelta delta={o.rankDelta} /></div>
              </div>
            </div>
            <GradeRow label="Draft" grade={o.draftGrade} />
            <GradeRow label="Roster Mgmt" grade={o.rosterMgmtGrade} />
            <div className="mt-2 flex items-center justify-between text-[12px] text-white/45">
              <span>Points added by moves</span>
              <span className={cn("font-semibold tabular-nums", o.pointsAddedByMgmt >= 0 ? "text-lime-400" : "text-red-400")}>
                {o.pointsAddedByMgmt >= 0 ? "+" : ""}
                {o.pointsAddedByMgmt.toFixed(1)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function GradeRow({ label, grade }: { label: string; grade: number }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-white/50">{label}</span>
        <span className={cn("font-bold tabular-nums", gradeColor(grade))}>{grade}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn("h-full rounded-full", gradeBar(grade))} style={{ width: `${grade}%` }} />
      </div>
    </div>
  );
}

/* ── Insights ──────────────────────────────────────────────────────────── */
function Insights({ data }: { data: SimData }) {
  if (!data.insights.length) return null;
  return (
    <Section icon={<Sparkles className="h-5 w-5" />} title="LeagueDNA Insights" subtitle="What the numbers reveal">
      <ul className="space-y-2">
        {data.insights.map((i, idx) => (
          <li key={idx} className="flex gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[14px] text-white/75">
            <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default DraftRealitySimulator;
