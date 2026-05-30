import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export type LeagueOverviewPayload = {
  readinessScore: number;
  ownerResolution: number;
  weeklyStatsExist: boolean;
  dataCompleteness?: number | null;
  matchupCoverage?: number | null;
  seasonRows: Array<{
    season: number;
    teams: number;
    draftPicks: number;
    matchups: number;
    medals: boolean;
    weeklyStats: boolean;
    apiSeason: boolean;
  }>;
};

function BarRow({ label, pct, tone }: { label: string; pct: number | null; tone: "emerald" | "zinc" }) {
  const fill =
    tone === "emerald"
      ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
      : "bg-gradient-to-r from-zinc-600 to-zinc-400";
  const w = pct == null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1">
      <div className="flex justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums text-zinc-300">{pct == null ? "—" : `${Math.round(w)}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn("h-full rounded-full transition-all", fill)} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

export function DashboardLeagueHealthCard({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: LeagueOverviewPayload | null | undefined;
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-[220px] flex-col rounded-xl border border-emerald-500/20 bg-[#0f131c]/95 p-5 shadow-[0_0_28px_-12px_rgba(16,185,129,0.25)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">League health</p>
        <div className="mt-6 flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-[220px] flex-col rounded-xl border border-emerald-500/20 bg-[#0f131c]/95 p-5 shadow-[0_0_28px_-12px_rgba(16,185,129,0.2)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">League health</p>
        <div className="mt-4 flex flex-1 flex-col justify-center text-sm text-zinc-500">
          <p className="font-medium text-zinc-300">Not Yet Available</p>
          <p className="mt-1 text-xs text-zinc-600">League overview could not be loaded.</p>
        </div>
        <Link to="/league-data-health" className="mt-4 text-xs font-medium text-emerald-400/90 hover:text-emerald-300">
          Open data health →
        </Link>
      </div>
    );
  }

  const apiSeasons = data.seasonRows.filter((s) => s.apiSeason);
  // Prefer server-computed breakdown values (avoid double-calculating)
  const dataCompleteness =
    data.dataCompleteness != null
      ? data.dataCompleteness
      : apiSeasons.length > 0
      ? Math.round((apiSeasons.filter((s) => s.teams > 0 && s.draftPicks > 0).length / apiSeasons.length) * 100)
      : null;
  const matchupCoverage =
    data.matchupCoverage != null
      ? data.matchupCoverage
      : apiSeasons.length > 0
      ? Math.round((apiSeasons.filter((s) => s.matchups > 0).length / apiSeasons.length) * 100)
      : null;
  const ownerResolution = Number.isFinite(data.ownerResolution) ? data.ownerResolution : null;
  const readiness = Number.isFinite(data.readinessScore) ? data.readinessScore : null;

  return (
    <div className="flex min-h-[220px] flex-col rounded-xl border border-emerald-500/20 bg-[#0f131c]/95 p-5 shadow-[0_0_32px_-12px_rgba(16,185,129,0.28)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400/90">League health</p>
          <p className="mt-1 text-xs text-zinc-500">Readiness &amp; coverage</p>
        </div>
        <div className="relative h-16 w-16 shrink-0">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(rgb(52 211 153) ${readiness ?? 0}%, rgba(39,39,42,0.9) 0deg)`,
            }}
          />
          <div className="absolute inset-[4px] flex flex-col items-center justify-center rounded-full bg-[#0f131c] text-center">
            <span className="text-lg font-black tabular-nums leading-none text-emerald-300">
              {readiness != null ? readiness : "—"}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500">ready</span>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-center space-y-3">
        <BarRow label="Data completeness" pct={dataCompleteness} tone="emerald" />
        <BarRow label="Matchup coverage" pct={matchupCoverage} tone="emerald" />
        <BarRow label="Owner resolution (2018+)" pct={ownerResolution} tone="emerald" />
        <div className="space-y-1">
          <div className="flex justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <span>Scoring accuracy</span>
            <span className="text-zinc-500">Not Yet Available</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.04]" />
          <p className="text-[9px] leading-snug text-zinc-600">
            No league-wide scoring-accuracy series is exposed on this endpoint.
          </p>
        </div>
      </div>

      <Link
        to="/league-data-health"
        className="mt-4 text-xs font-medium text-emerald-400/90 transition-colors hover:text-emerald-300"
      >
        Data health detail →
      </Link>
      <p className="mt-1 text-[9px] text-zinc-700">
        Score: {readiness ?? "—"}/100 · Matchup coverage: {matchupCoverage != null ? `${matchupCoverage}%` : "—"} · Source: dataHealth.leagueOverview
      </p>
    </div>
  );
}
