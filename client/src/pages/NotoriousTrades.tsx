// FILE: client/src/pages/NotoriousTrades.tsx
// Sprint 2 UI Surface 2: Most Notorious Trades — ranked by verdictMargin,
// filtered to high-drama labels (League-Altering, Quiet Fleece, etc.)

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Zap, AlertTriangle } from "lucide-react";

// ── Narrative label meta (mirrors tradeNarrativeService.ts) ──────────────────
const NARRATIVE_META: Record<string, { color: string; bg: string; border: string; emoji: string }> = {
  "Quiet Fleece":          { color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/30", emoji: "🤫" },
  "Panic Move":            { color: "text-red-300",     bg: "bg-red-500/15",     border: "border-red-500/30",     emoji: "😱" },
  "Future Sacrificed":     { color: "text-orange-300",  bg: "bg-orange-500/15",  border: "border-orange-500/30",  emoji: "⏳" },
  "Win-Now Desperation":   { color: "text-yellow-300",  bg: "bg-yellow-500/15",  border: "border-yellow-500/30",  emoji: "🔥" },
  "Calculated Gamble":     { color: "text-blue-300",    bg: "bg-blue-500/15",    border: "border-blue-500/30",    emoji: "🎯" },
  "League-Altering Trade": { color: "text-purple-300",  bg: "bg-purple-500/15",  border: "border-purple-500/30",  emoji: "⚡" },
  "Mutual Destruction":    { color: "text-slate-300",   bg: "bg-slate-500/15",   border: "border-slate-500/30",   emoji: "💥" },
  "Phantom Trade":         { color: "text-slate-400",   bg: "bg-slate-700/30",   border: "border-slate-600/30",   emoji: "👻" },
};

// ── Rank medal ────────────────────────────────────────────────────────────────
function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-base">🥇</span>;
  if (rank === 2) return <span className="text-base">🥈</span>;
  if (rank === 3) return <span className="text-base">🥉</span>;
  return <span className="text-xs font-bold text-slate-500 w-5 text-center">#{rank}</span>;
}

// ── Single notorious trade row ────────────────────────────────────────────────
type NotoriousRow = {
  tradeId: string;
  season: number;
  narrativeLabel: string;
  narrativeSentence: string | null;
  sideAOwner: string;
  sideBOwner: string;
  verdict: string;
  verdictMargin: number;
  proposedDate: number | null;
};

function NotoriousTradeRow({ row, rank }: { row: NotoriousRow; rank: number }) {
  const meta = NARRATIVE_META[row.narrativeLabel];
  const date = row.proposedDate
    ? new Date(row.proposedDate * 1000).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  const winnerName =
    row.verdict === "sideA" ? row.sideAOwner
    : row.verdict === "sideB" ? row.sideBOwner
    : null;

  return (
    <div className="flex gap-4 items-start py-4 border-b border-slate-800/60 last:border-0">
      {/* Rank */}
      <div className="flex-shrink-0 w-8 flex items-center justify-center pt-0.5">
        <RankMedal rank={rank} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Label badge + season + date */}
        <div className="flex items-center flex-wrap gap-2">
          {meta && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
              <span>{meta.emoji}</span>
              <span>{row.narrativeLabel}</span>
            </span>
          )}
          <span className="text-[10px] text-slate-500 font-mono">{row.season}</span>
          {date && <span className="text-[10px] text-slate-600">{date}</span>}
        </div>

        {/* Owners */}
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-medium ${row.verdict === "sideA" ? "text-emerald-400" : "text-slate-300"}`}>
            {row.sideAOwner}
          </span>
          <span className="text-slate-600 text-xs">vs</span>
          <span className={`font-medium ${row.verdict === "sideB" ? "text-emerald-400" : "text-slate-300"}`}>
            {row.sideBOwner}
          </span>
        </div>

        {/* Narrative sentence */}
        {row.narrativeSentence && (
          <p className="text-xs text-slate-400 italic leading-relaxed">
            "{row.narrativeSentence}"
          </p>
        )}

        {/* Verdict chip */}
        {winnerName && row.verdictMargin > 0 && (
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3 h-3 text-yellow-400" />
            <span className="text-xs text-slate-400">
              <span className="text-emerald-400 font-medium">{winnerName}</span> won by {row.verdictMargin} value pts
            </span>
          </div>
        )}
        {row.verdict === "even" && (
          <span className="text-xs text-slate-500 italic">Even trade</span>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function NotoriousTrades() {
  const { data: narratives, isLoading, error } = trpc.tradeNarrative.getNarratives.useQuery(
    { limit: 20 },
    { staleTime: 10 * 60_000 }
  );

  const sorted = useMemo(() => {
    if (!narratives) return [];
    // Already sorted by verdictMargin desc from the server, but re-sort client-side for safety
    return [...narratives].sort((a, b) => (b.verdictMargin ?? 0) - (a.verdictMargin ?? 0));
  }, [narratives]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="space-y-1 mb-4">
          <Skeleton className="h-5 w-48 bg-slate-700/50" />
          <Skeleton className="h-3 w-72 bg-slate-700/30" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 py-4 border-b border-slate-800/60">
            <Skeleton className="w-8 h-8 rounded-full bg-slate-700/50 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 bg-slate-700/50" />
              <Skeleton className="h-3 w-56 bg-slate-700/30" />
              <Skeleton className="h-3 w-full bg-slate-700/20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center space-y-3">
        <AlertTriangle className="w-8 h-8 mx-auto text-slate-600" />
        <p className="text-sm text-slate-400">Could not load notorious trades.</p>
        <p className="text-xs text-slate-600">Sync ESPN data and wait for narratives to generate.</p>
      </div>
    );
  }

  if (!sorted.length) {
    return (
      <div className="p-6 text-center space-y-3 py-16">
        <Zap className="w-10 h-10 mx-auto text-slate-700 mb-3" />
        <p className="font-medium text-slate-400 text-sm">No notorious trades yet</p>
        <p className="text-xs text-slate-600 max-w-xs mx-auto">
          Sync ESPN data to populate trade history. Narratives are generated automatically after each sync.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-2">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-200 flex items-center gap-2">
          <span>⚡</span> Hall of Notorious Trades
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          The most dramatic, lopsided, and league-defining trades in Atlantas Finest history — ranked by impact.
        </p>
      </div>

      {/* Trades list */}
      <Card className="bg-slate-900/60 border-slate-700/50">
        <CardContent className="px-4 py-2">
          {sorted.map((row, idx) => (
            <NotoriousTradeRow
              key={row.tradeId}
              row={{
                tradeId: row.tradeId,
                season: row.season,
                narrativeLabel: row.narrativeLabel,
                narrativeSentence: row.narrativeSentence,
                sideAOwner: row.sideAOwner,
                sideBOwner: row.sideBOwner,
                verdict: row.verdict,
                verdictMargin: row.verdictMargin ?? 0,
                proposedDate: row.proposedDate,
              }}
              rank={idx + 1}
            />
          ))}
        </CardContent>
      </Card>

      <p className="text-[10px] text-slate-600 text-right">
        Showing top {sorted.length} trades · Narratives auto-generated after ESPN sync
      </p>
    </div>
  );
}
