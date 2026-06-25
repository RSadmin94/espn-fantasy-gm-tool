import type { ReactNode } from "react";
import { HelpCircle, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelPanel, SectionLoading } from "@/components/layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type PosSplit = import("../../../server/playoffPositionSplit").PosSplit;
type PlayoffPositionSplitResult = import("../../../server/playoffPositionSplit").PlayoffPositionSplitResult;

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(1);
}

function fmtDelta(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

function verdictTone(row: PosSplit): "good" | "warn" | "neutral" {
  if (!row.verdict) return "neutral";
  if (row.verdict.includes("carried")) return "good";
  if (row.verdict.includes("let him down") || row.verdict.includes("disappeared")) return "warn";
  return "neutral";
}

const TONE_STYLES = {
  good: "border-lime-400/25 bg-lime-500/[0.06] text-lime-300",
  warn: "border-red-400/25 bg-red-500/[0.06] text-red-300",
  neutral: "border-white/10 bg-white/[0.03] text-white/55",
} as const;

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="More info" className="inline-flex align-middle text-white/30 transition hover:text-white/60">
          <HelpCircle className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] border border-white/10 bg-zinc-900 text-[11px] leading-snug text-white/85">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function HeroStat({
  label,
  value,
  tip,
  accent,
}: {
  label: string;
  value: number | null | undefined;
  tip: string;
  accent?: "lime" | "amber" | "violet";
}) {
  const accentClass =
    accent === "lime" ? "text-lime-300" : accent === "amber" ? "text-amber-300" : accent === "violet" ? "text-violet-300" : "text-white/90";
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center">
      <div className="mb-1 flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">
        {label}
        <InfoTip text={tip} />
      </div>
      <div className={cn("text-[28px] font-black tabular-nums leading-none", accentClass)}>{fmt(value)}</div>
      <div className="mt-1 text-[10px] text-white/30">pts/game</div>
    </div>
  );
}

function PositionCard({ row }: { row: PosSplit }) {
  const tone = verdictTone(row);
  return (
    <div className={cn("rounded-xl border p-4 transition", TONE_STYLES[tone])}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[18px] font-black tracking-tight text-white/95">{row.position}</span>
        {row.verdict ? (
          <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", TONE_STYLES[tone])}>
            {row.verdict}
          </span>
        ) : row.confidence === "low-sample" ? (
          <span className="text-[11px] text-white/35">{row.confidence}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCell label="Playoff avg" value={fmt(row.playoffAvg)} tip="Your starter points/game at this position in playoff games." />
        <MetricCell label="Regular avg" value={fmt(row.regularAvg)} tip="Your regular-season starter points/game at this position." />
        <MetricCell label="Champ avg" value={fmt(row.championFullAvg)} tip="Average starter points/game at this position across all league champions' full seasons." />
        <MetricCell label="Champ playoff" value={fmt(row.championPlayoffAvg)} tip="Average starter points/game at this position when league champions played in the playoffs." />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 border-t border-white/[0.06] pt-3 text-[12px] tabular-nums">
        <span className="text-white/45">
          vs regular <span className="font-bold text-white/80">{fmtDelta(row.vsOwnRegular)}</span>
        </span>
        <span className="text-white/45">
          vs champ <span className="font-bold text-white/80">{fmtDelta(row.vsChampionFull)}</span>
        </span>
      </div>
    </div>
  );
}

function MetricCell({ label, value, tip }: { label: string; value: string; tip: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">
        {label}
        <InfoTip text={tip} />
      </div>
      <div className="text-[16px] font-bold tabular-nums text-white/90">{value}</div>
    </div>
  );
}

function PanelShell({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <IntelPanel variant="elevated" className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="text-orange-400">{icon}</span>
        <div>
          <h2 className="text-[20px] font-extrabold leading-tight tracking-tight">{title}</h2>
          {subtitle && <p className="text-[13px] text-white/45">{subtitle}</p>}
        </div>
      </div>
      {children}
    </IntelPanel>
  );
}

export function PlayoffPositionTruthPanel({
  data,
  loading,
  error,
}: {
  data?: PlayoffPositionSplitResult;
  loading?: boolean;
  error?: string;
}) {
  if (loading) {
    return (
      <PanelShell icon={<Flame className="h-5 w-5" />} title="Playoff Position Truth" subtitle="Why your playoff lineup won or lost vs championship teams">
        <SectionLoading
          message="Reading playoff film…"
          className="justify-center py-10 text-white/45 [&_svg]:text-orange-400"
        />
      </PanelShell>
    );
  }

  if (error) {
    return (
      <PanelShell icon={<Flame className="h-5 w-5" />} title="Playoff Position Truth">
        <p className="text-center text-[14px] text-red-300/90">{error}</p>
      </PanelShell>
    );
  }

  if (!data) return null;

  if (!data.available) {
    return (
      <PanelShell icon={<Flame className="h-5 w-5" />} title="Playoff Position Truth">
        <p className="text-center text-[14px] text-white/55">{data.reason ?? data.narrative}</p>
      </PanelShell>
    );
  }

  const { overall } = data;

  return (
    <PanelShell
      icon={<Flame className="h-5 w-5" />}
      title="Playoff Position Truth"
      subtitle="Why your playoff lineup won or lost vs championship teams"
    >
      {/* Hero summary */}
      <div className="mb-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <HeroStat
          label="Playoff PPG"
          value={overall.playoffPF}
          accent="violet"
          tip="Combined QB+RB+WR+TE starter points per playoff game you played."
        />
        <HeroStat
          label="Regular PPG"
          value={overall.regularPF}
          tip="Combined QB+RB+WR+TE starter points per regular-season game."
        />
        <HeroStat
          label="Champion PPG"
          value={overall.championFullPF}
          accent="amber"
          tip="Average combined starter points per game across all league champions' full seasons."
        />
        <HeroStat
          label="Champ Playoff PPG"
          value={overall.championPlayoffPF}
          accent="lime"
          tip="Average combined starter points per game when league champions played in the playoffs."
        />
      </div>

      {/* Engine narrative — verbatim */}
      <blockquote className="mb-6 border-l-2 border-orange-400/50 bg-orange-500/[0.04] px-4 py-3 text-[15px] font-medium leading-relaxed text-white/85 sm:text-[16px]">
        {data.narrative}
      </blockquote>

      {/* Position comparison */}
      <div className="space-y-3">
        {data.positions.map((row) => (
          <PositionCard key={row.position} row={row} />
        ))}
      </div>

      {data.note && <p className="mt-4 text-[11px] leading-relaxed text-white/30">{data.note}</p>}
    </PanelShell>
  );
}
