/**
 * RFSN dashboard widget — latest weekly wire reports and link to the network home.
 */
import { useMemo } from "react";
import { skipToken } from "@tanstack/react-query";
import { Link } from "react-router";
import { trpc } from "@/lib/trpc";
import { useLeagueActiveGate } from "@/hooks/useLeagueActiveGate";
import { withLeagueSalt } from "@/lib/leagueQuerySalt";
import { cn } from "@/lib/utils";
import { TYPE_BADGE, TYPE_CAPTION, TYPE_META } from "@/lib/typeScale";
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
  close:       { cls: "text-violet-400 bg-violet-500/10 border-violet-500/20",       label: "CLOSE" },
  nailbiter:   { cls: "text-lime-400 bg-lime-500/10 border-lime-500/20", label: "NAIL-BITER" },
};

function WireCard({ report }: { report: MatchupReport }) {
  if (!report.winner || !report.loser) return null;
  const badge = report.gameType ? GAME_BADGE[report.gameType] : null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-2 hover:border-border/60 transition-colors">
      {/* Scores */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-foreground text-xs truncate">{report.winner.name}</div>
          <div className="text-ink-secondary text-xs truncate">{report.loser.name}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-black text-lime-400 text-sm tabular-nums">{report.winner.score.toFixed(2)}</div>
          <div className="text-ink-secondary text-xs tabular-nums">{report.loser.score.toFixed(2)}</div>
        </div>
        {badge && (
          <span className={cn(TYPE_BADGE, "uppercase border px-1.5 py-0.5 rounded ml-1 shrink-0", badge.cls)}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Icons row */}
      <div className={cn("flex items-center gap-3 text-ink-secondary", TYPE_META)}>
        {report.rivalryNote && (
          <span className="flex items-center gap-1 text-violet-500">
            <Swords className="h-2.5 w-2.5" />
            {report.rivalryNote.seriesRecord}
          </span>
        )}
        {report.playoffImpact && (
          <span className="flex items-center gap-1 text-violet-500">
            <TrendingUp className="h-2.5 w-2.5" />
            {report.playoffImpact.winnerRecord}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">+{report.margin?.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function LeagueWireNewsFeed() {
  const _trpc = trpc as any;
  const { leagueContextKey } = useLeagueActiveGate();

  const { data: weeks = [] } = _trpc.leagueWire.getAvailableWeeks.useQuery(
    withLeagueSalt({}, leagueContextKey),
  );

  // Pick most recent week
  const latest = useMemo(() => weeks[0] ?? null, [weeks]);

  const { data: reports = [], isLoading } = _trpc.leagueWire.getPostgameReports.useQuery(
    latest != null
      ? withLeagueSalt({ season: latest.season, week: latest.week }, leagueContextKey)
      : skipToken,
  );

  if (!latest || (isLoading && reports.length === 0)) return null;
  if (!Array.isArray(reports) || reports.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="h-3.5 w-3.5 text-lime-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-black text-foreground tracking-tight block">RFSN</span>
            <span className={cn(TYPE_CAPTION, "text-ink-secondary font-medium block truncate")}>
              Latest league stories and weekly coverage
            </span>
          </div>
          {latest && (
            <span className={cn(TYPE_META, "text-ink-secondary font-medium shrink-0 hidden sm:inline")}>
              · S{latest.season} Wk{latest.week}
            </span>
          )}
        </div>
        <Link
          to="/rfsn"
          className={cn("flex items-center gap-1 text-ink-secondary hover:text-foreground transition-colors shrink-0", TYPE_META)}
        >
          View all <ArrowRight className="h-3 w-3" />
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
