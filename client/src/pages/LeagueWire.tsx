import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ChevronDown, Trophy, Zap, ArrowRight,
  Share2, AlertCircle, TrendingUp, Swords, Radio,
} from "lucide-react";

// ── Types (mirrors server MatchupReport) ─────────────────────────────────────

interface TeamSide { teamId: number; name: string; ownerName: string; score: number }
interface MatchupReport {
  matchupId: number; season: number; week: number;
  isPlayoff: boolean; isCompleted: boolean;
  winner: TeamSide | null; loser: TeamSide | null;
  margin: number | null; combinedScore: number | null;
  gameType: "blowout" | "comfortable" | "close" | "nailbiter" | null;
  headline: string; shortRecap: string; shareableLine: string;
  keyStat: { label: string; value: string; evidence: string } | null;
  playerOfGame: null; benchRegret: null;
  rivalryNote: { seriesRecord: string; winnerLeads: boolean; evidence: string } | null;
  playoffImpact: { summary: string; winnerRecord: string; loserRecord: string; evidence: string } | null;
}

// ── Game type config ──────────────────────────────────────────────────────────

const GAME_TYPE_CFG = {
  blowout:     { color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30",     label: "BLOWOUT"    },
  comfortable: { color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30", label: "COMFORTABLE"},
  close:       { color: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/30",     label: "CLOSE GAME" },
  nailbiter:   { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", label: "NAIL-BITER" },
};

// ── Score box ─────────────────────────────────────────────────────────────────

function ScoreBox({ team, isWinner }: { team: TeamSide; isWinner: boolean }) {
  return (
    <div className={cn("flex flex-col items-center gap-1 px-4 py-3 rounded-lg min-w-[100px]",
      isWinner ? "bg-emerald-500/10 border border-emerald-500/25" : "bg-zinc-800/40 border border-zinc-700/40"
    )}>
      {isWinner && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-0.5">WINNER</span>}
      <span className={cn("text-3xl font-black tabular-nums tracking-tight",
        isWinner ? "text-white" : "text-zinc-500"
      )}>{team.score.toFixed(2)}</span>
      <span className={cn("text-[11px] font-bold text-center leading-tight max-w-[110px] truncate",
        isWinner ? "text-zinc-200" : "text-zinc-500"
      )}>{team.name}</span>
      <span className={cn("text-[10px] text-center leading-tight max-w-[110px] truncate",
        isWinner ? "text-zinc-400" : "text-zinc-600"
      )}>{team.ownerName.replace(/[()]/g, "")}</span>
    </div>
  );
}

// ── Single matchup card ───────────────────────────────────────────────────────

function MatchupCard({ report }: { report: MatchupReport }) {
  const [copied, setCopied] = useState(false);
  const gtCfg = report.gameType ? GAME_TYPE_CFG[report.gameType] : null;

  function copyShareable() {
    navigator.clipboard?.writeText(report.shareableLine);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!report.isCompleted || !report.winner || !report.loser) {
    return (
      <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-5">
        <p className="text-zinc-500 text-sm">Matchup not yet completed.</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-xl border bg-zinc-900/50 overflow-hidden",
      report.isPlayoff ? "border-amber-500/30" : "border-zinc-800/60"
    )}>
      {/* Playoff banner */}
      {report.isPlayoff && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 flex items-center gap-2">
          <Trophy className="h-3 w-3 text-amber-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">Playoff Game</span>
        </div>
      )}

      {/* Score header */}
      <div className="p-5">
        <div className="flex items-center justify-between gap-4 mb-4">
          <ScoreBox team={report.winner} isWinner={true} />
          <div className="flex flex-col items-center gap-1">
            {gtCfg && (
              <span className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border", gtCfg.bg, gtCfg.color)}>
                {gtCfg.label}
              </span>
            )}
            <ArrowRight className="h-4 w-4 text-zinc-600" />
            <span className="text-xs text-zinc-600 font-mono">+{report.margin?.toFixed(2)}</span>
          </div>
          <ScoreBox team={report.loser} isWinner={false} />
        </div>

        {/* Headline */}
        <h3 className="text-sm font-bold text-zinc-100 leading-snug mb-2">{report.headline}</h3>

        {/* Short recap */}
        <p className="text-xs text-zinc-400 leading-relaxed">{report.shortRecap}</p>
      </div>

      {/* Stats strip */}
      {report.keyStat && (
        <div className="border-t border-zinc-800/40 px-5 py-3 flex items-center gap-3 bg-zinc-900/30">
          <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{report.keyStat.label}:</span>
            <span className="text-xs font-bold text-zinc-200 ml-1.5">{report.keyStat.value}</span>
            <span className="text-[10px] text-zinc-600 ml-1.5">— {report.keyStat.evidence}</span>
          </div>
        </div>
      )}

      {/* Conditional insight cards */}
      <div className="border-t border-zinc-800/40 divide-y divide-zinc-800/30">

        {/* Rivalry note */}
        {report.rivalryNote && (
          <div className="px-5 py-3 flex items-start gap-3">
            <Swords className="h-3.5 w-3.5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-violet-400">Series Record</span>
              <p className="text-xs text-zinc-400 mt-0.5">
                {report.winner.name} now leads {report.loser.name}{" "}
                <span className="font-bold text-zinc-200">{report.rivalryNote.seriesRecord}</span> in their H2H series.{" "}
                <span className="text-zinc-600">({report.rivalryNote.evidence})</span>
              </p>
            </div>
          </div>
        )}

        {/* Playoff impact */}
        {report.playoffImpact && (
          <div className="px-5 py-3 flex items-start gap-3">
            <TrendingUp className="h-3.5 w-3.5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-sky-400">Standings Impact</span>
              <p className="text-xs text-zinc-400 mt-0.5">
                <span className="text-zinc-200 font-semibold">{report.winner.name}</span>{" "}
                moves to <span className="font-bold text-emerald-400">{report.playoffImpact.winnerRecord}</span>.{" "}
                <span className="text-zinc-200 font-semibold">{report.loser.name}</span>{" "}
                falls to <span className="font-bold text-rose-400">{report.playoffImpact.loserRecord}</span>.{" "}
                <span className="text-zinc-600">({report.playoffImpact.evidence})</span>
              </p>
            </div>
          </div>
        )}

        {/* Hidden sections with guardrail note */}
        <div className="px-5 py-2.5 flex items-center gap-2">
          <AlertCircle className="h-3 w-3 text-zinc-700 shrink-0" />
          <span className="text-[10px] text-zinc-700">
            Player of the game &amp; bench regret hidden — weekly player stats not yet populated.
          </span>
        </div>
      </div>

      {/* Shareable footer */}
      <div className="border-t border-zinc-800/40 px-5 py-3 flex items-center justify-between gap-3 bg-zinc-900/20">
        <span className="text-[10px] text-zinc-600 font-mono truncate flex-1">{report.shareableLine}</span>
        <button onClick={copyShareable}
          className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors shrink-0">
          <Share2 className="h-3 w-3" />
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ── Week selector ─────────────────────────────────────────────────────────────

function WeekSelector({
  weeks, season, week,
  onSelect
}: {
  weeks: { season: number; week: number; count: number }[];
  season: number; week: number;
  onSelect: (s: number, w: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const seasons = [...new Set(weeks.map(w => w.season))].sort((a, b) => b - a);

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-200 hover:border-zinc-500 transition-colors font-medium">
        <Radio className="h-3.5 w-3.5 text-emerald-400" />
        Season {season} — Week {week}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 w-60 rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl z-20 overflow-hidden max-h-80 overflow-y-auto">
          {seasons.map(s => (
            <div key={s}>
              <div className="px-3 py-1.5 bg-zinc-800/60 text-[10px] font-black uppercase tracking-widest text-zinc-500 sticky top-0">
                {s} Season
              </div>
              {weeks.filter(w => w.season === s).map(w => (
                <button key={`${w.season}-${w.week}`}
                  onClick={() => { onSelect(w.season, w.week); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2 text-sm transition-colors hover:bg-zinc-800",
                    w.season === season && w.week === week
                      ? "text-emerald-400 font-bold bg-emerald-500/5"
                      : "text-zinc-400"
                  )}>
                  Week {w.week} <span className="text-zinc-600 text-xs">({w.count} games)</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function LeagueWire() {
  const _trpc = trpc as any;

  const { data: availableWeeks = [], isLoading: weeksLoading } =
    _trpc.leagueWire.getAvailableWeeks.useQuery();

  // Default to most recent completed week
  const defaultWeek = availableWeeks[0] ?? null;
  const [season, setSeason] = useState<number | null>(null);
  const [week, setWeek]     = useState<number | null>(null);

  const activeSeason = season ?? defaultWeek?.season ?? null;
  const activeWeek   = week   ?? defaultWeek?.week   ?? null;

  const { data: reports = [], isLoading: reportsLoading } =
    _trpc.leagueWire.getPostgameReports.useQuery(
      { season: activeSeason!, week: activeWeek! },
      { enabled: activeSeason !== null && activeWeek !== null }
    );

  const isLoading = weeksLoading || reportsLoading;

  function handleSelect(s: number, w: number) {
    setSeason(s); setWeek(w);
  }

  return (
    <div className="min-h-screen bg-[#09090e] text-zinc-100">

      {/* Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/50 px-6 py-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Radio className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <h1 className="text-xl font-black tracking-tight text-white">League Wire</h1>
            </div>
            <p className="text-xs text-zinc-500 ml-9">
              Deterministic ESPN-style postgame reports · verified DB data only
            </p>
          </div>

          {availableWeeks.length > 0 && activeSeason !== null && activeWeek !== null && (
            <WeekSelector
              weeks={availableWeeks}
              season={activeSeason}
              week={activeWeek}
              onSelect={handleSelect}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">

        {isLoading && (
          <div className="flex items-center justify-center py-24 gap-2 text-zinc-500 text-sm">
            <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
            Loading reports…
          </div>
        )}

        {!isLoading && availableWeeks.length === 0 && (
          <div className="text-center py-24 space-y-3">
            <Radio className="h-8 w-8 text-zinc-700 mx-auto" />
            <p className="text-zinc-400 font-semibold">No completed matchups found</p>
            <p className="text-zinc-600 text-sm">Run a Full Import to bring in historical season data.</p>
          </div>
        )}

        {!isLoading && reports.length > 0 && (
          <>
            {/* Week summary bar */}
            <div className="flex items-center gap-3 mb-5">
              <div className="text-sm font-black text-zinc-300">
                Season {activeSeason} — Week {activeWeek}
              </div>
              <div className="flex-1 h-px bg-zinc-800/60" />
              <div className="text-xs text-zinc-500">{reports.length} matchups</div>
              <div className="text-xs text-zinc-500">
                High: <span className="text-zinc-300 font-bold">
                  {Math.max(...reports.flatMap((r: MatchupReport) => [r.winner?.score ?? 0, r.loser?.score ?? 0])).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Matchup cards grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {(reports as MatchupReport[]).map(r => (
                <MatchupCard key={r.matchupId} report={r} />
              ))}
            </div>

            {/* Data sources note */}
            <div className="mt-6 p-3 rounded-lg border border-zinc-800/40 bg-zinc-900/20 flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-zinc-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                All reports generated deterministically from verified database records (matchups · teams · standings).
                Player of the game and bench regret sections are hidden until <code className="text-zinc-500">gm_weekly_player_stats</code> is populated via weekly sync.
                No LLM inference. No estimated values.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
