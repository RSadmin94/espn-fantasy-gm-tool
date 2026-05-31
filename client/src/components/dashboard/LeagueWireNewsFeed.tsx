/**
 * LeagueWireNewsFeed — compact news feed widget for the Dashboard.
 * Shows the most recent completed week's postgame reports.
 */
import { useMemo } from "react";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Radio, ArrowRight, TrendingUp, Swords } from "lucide-react";

interface TeamSide { name: string; score: number }
interface MatchupReport {
  matchupId: number; week: number; season: number;
  winner: TeamSide | null; loser: TeamSide | null;
  margin: number | null; gameType: string | null;
  headline: string; shareableLine: string;
  rivalryNote: { seriesRecord: string } | null;
  playoffImpact: { winnerRecord: string; loserRecord: string } | null;
}

const GAME_BADGE: Record<string, { cls: string; label: string }> = {
  blowout:     { cls: "text-red-400 bg-red-500/10 border-red-500/20",       label: "BLOWOUT" },
  comfortable: { cls: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "WIN" },
  close:       { cls: "text-sky-400 bg-sky-500/10 border-sky-500/20",       label: "CLOSE" },
  nailbiter:   { cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", label: "NAIL-BITER" },
};

function WireCard({ report }: { report: MatchupReport }) {
  if (!report.winner || !report.loser) return null;
  const badge = report.gameType ? GAME_BADGE[report.gameType] : null;

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3 space-y-2 hover:border-zinc-700/60 transition-colors">
      {/* Scores */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-zinc-100 text-xs truncate">{report.winner.name}</div>
          <div className="text-zinc-500 text-xs truncate">{report.loser.name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-black text-emerald-400 text-sm tabular-nums">{report.winner.score.toFixed(2)}</div>
          <div className="text-zinc-600 text-xs tabular-nums">{report.loser.score.toFixed(2)}</div>
        </div>
        {badge && (
          <span className={cn("text-[9px] font-black uppercase border px-1.5 py-0.5 rounded ml-1 shrink-0", badge.cls)}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Icons row */}
      <div className="flex items-center gap-3 text-[10px] text-zinc-600">
        {report.rivalryNote && (
          <span className="flex items-center gap-1 text-violet-500">
            <Swords className="h-2.5 w-2.5" />
            {report.rivalryNote.seriesRecord}
          </span>
        )}
        {report.playoffImpact && (
          <span className="flex items-center gap-1 text-sky-500">
            <TrendingUp className="h-2.5 w-2.5" />
            {report.playoffImpact.winnerRecord}
          </span>
        )}
        <span className="ml-auto text-zinc-700">+{report.margin?.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function LeagueWireNewsFeed() {
  const _trpc = trpc as any;

  const { data: weeks = [] } = _trpc.leagueWire.getAvailableWeeks.useQuery();

  // Pick most recent week
  const latest = useMemo(() => weeks[0] ?? null, [weeks]);

  const { data: reports = [], isLoading } = _trpc.leagueWire.getPostgameReports.useQuery(
    { season: latest?.season, week: latest?.week },
    { enabled: latest !== null }
  );

  if (!latest || (isLoading && reports.length === 0)) return null;
  if (!Array.isArray(reports) || reports.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/40">
        <div className="flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-sm font-black text-zinc-200 tracking-tight">League Wire</span>
          <span className="text-[10px] text-zinc-600 font-medium">
            S{latest.season} · Wk{latest.week}
          </span>
        </div>
        <Link
          to="/league-wire"
          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          All reports <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Report cards - horizontal scroll on mobile */}
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {(reports as MatchupReport[]).map(r => (
          <WireCard key={r.matchupId} report={r} />
        ))}
      </div>
    </div>
  );
}
