import { Link } from "react-router";
import { Loader2 } from "lucide-react";

export type MarqueeTeam = {
  teamId: number;
  teamName: string;
  ownerName: string;
  displayRank: number;
  wins: number;
  losses: number;
  logoUrl?: string;
};

export type ScoreboardLite = {
  homeTeamId: number;
  awayTeamId: number;
  homeProjected: number | null;
  awayProjected: number | null;
};

function Avatar({ label, url }: { label: string; url?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-14 w-14 shrink-0 rounded-full border border-white/[0.1] object-cover sm:h-[72px] sm:w-[72px]"
      />
    );
  }
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-gradient-to-br from-zinc-700 to-zinc-900 text-sm font-bold text-zinc-200 sm:h-[72px] sm:w-[72px] sm:text-base">
      {initials}
    </div>
  );
}

export function DashboardMatchupMarquee({
  isLoading,
  weekLabel,
  teamA,
  teamB,
  board,
  winProbPct,
  winProbCaption,
}: {
  isLoading: boolean;
  weekLabel: string;
  teamA: MarqueeTeam | null;
  teamB: MarqueeTeam | null;
  board: ScoreboardLite | null;
  /** 0–100 for team A side of bar when sourced from pulse; null = unavailable */
  winProbPct: number | null;
  winProbCaption?: string | null;
}) {
  const aPct = winProbPct != null ? Math.round(Math.min(100, Math.max(0, winProbPct))) : null;

  return (
    <div className="relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-red-500/15 bg-gradient-to-b from-[#121722] via-[#0f131c] to-[#0b0e14] p-5 shadow-[0_0_48px_-16px_rgba(239,68,68,0.35)] sm:p-7">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-red-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/5 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-400/90">This week&apos;s matchup</p>
          <p className="mt-1 text-xs text-zinc-500">{weekLabel}</p>
        </div>
        <Link to="/matchups" className="text-xs font-medium text-red-400/90 hover:text-red-300">
          All matchups →
        </Link>
      </div>

      {isLoading ? (
        <div className="relative mt-10 flex flex-1 items-center justify-center gap-2 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading matchup…
        </div>
      ) : !teamA || !teamB ? (
        <div className="relative mt-10 flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-sm font-medium text-zinc-300">Not Yet Available</p>
          <p className="max-w-sm text-xs leading-relaxed text-zinc-600">
            Connect ESPN sync and ensure league pulse can resolve a featured matchup for this week.
          </p>
        </div>
      ) : (
        <div className="relative mt-8 flex flex-1 flex-col justify-between gap-8">
          <div className="flex flex-col items-stretch justify-between gap-6 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              <Avatar label={teamA.ownerName || teamA.teamName} url={teamA.logoUrl} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400/80">
                  #{teamA.displayRank} {teamA.ownerName || teamA.teamName}
                </p>
                <p className="mt-0.5 truncate text-lg font-bold text-zinc-50">{teamA.teamName}</p>
                <p className="text-xs text-zinc-500">
                  {teamA.wins}–{teamA.losses}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center justify-center gap-2 px-2">
              <span className="rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-300">
                vs
              </span>
            </div>

            <div className="flex flex-1 flex-col items-center gap-3 text-center sm:items-end sm:text-right">
              <Avatar label={teamB.ownerName || teamB.teamName} url={teamB.logoUrl} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  #{teamB.displayRank} {teamB.ownerName || teamB.teamName}
                </p>
                <p className="mt-0.5 truncate text-lg font-bold text-zinc-50">{teamB.teamName}</p>
                <p className="text-xs text-zinc-500">
                  {teamB.wins}–{teamB.losses}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/25 px-4 py-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Projected</p>
                {board?.homeProjected != null && board?.awayProjected != null ? (
                  <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight text-zinc-100 sm:text-3xl">
                    {teamA.teamId === board.homeTeamId
                      ? `${board.homeProjected.toFixed(1)} – ${board.awayProjected.toFixed(1)}`
                      : `${board.awayProjected.toFixed(1)} – ${board.homeProjected.toFixed(1)}`}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-zinc-500">Not Yet Available</p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                <span>Team outlook (pulse)</span>
                {aPct != null ? <span className="tabular-nums text-zinc-300">{aPct}%</span> : <span>—</span>}
              </div>
              {aPct != null ? (
                <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="bg-gradient-to-r from-red-500 to-red-400" style={{ width: `${aPct}%` }} />
                  <div className="flex-1 bg-blue-500/25" />
                </div>
              ) : (
                <div className="rounded-md border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-center text-[11px] text-zinc-500">
                  Not Yet Available — no outlook score for this featured pairing in the current pulse payload.
                  {winProbCaption ? ` ${winProbCaption}` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
