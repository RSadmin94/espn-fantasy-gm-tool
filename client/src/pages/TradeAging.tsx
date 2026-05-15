// FILE: client/src/pages/TradeAging.tsx
// Trade Aging — shows all completed trades across seasons, scores each side,
// and renders a verdict (who won the trade based on season stats).

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus, Trophy, Calendar } from "lucide-react";

// ── Types inferred from the tradeAging procedure ──────────────────────────────
type TradeSide = {
  teamId: number;
  ownerName: string;
  players: { playerId: number; playerName: string; position: string; avgPoints: number; seasonPoints: number; compositeValue: number }[];
  picks: { label: string; round: number; pickInRound: number; value: number }[];
  totalValue: number;
};
type TradeRecord = {
  season: number;
  tradeId: string;
  proposedDate: number;
  sideA: TradeSide;
  sideB: TradeSide;
  verdict: "sideA" | "sideB" | "even";
  verdictMargin: number;
};

// ── Position badge color ──────────────────────────────────────────────────────
const POS_COLOR: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-green-500/20 text-green-300 border-green-500/30",
  WR: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TE: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  K:  "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "D/ST": "bg-purple-500/20 text-purple-300 border-purple-500/30",
};
function posBadge(pos: string) {
  return POS_COLOR[pos] || "bg-slate-500/20 text-slate-300 border-slate-500/30";
}

// ── Verdict helpers ───────────────────────────────────────────────────────────
function VerdictBadge({ verdict, sideA, sideB, winner }: { verdict: TradeRecord["verdict"]; sideA: TradeSide; sideB: TradeSide; winner: "A" | "B" | null }) {
  if (verdict === "even") return (
    <span className="flex items-center gap-1 text-xs text-slate-400 font-medium">
      <Minus className="w-3 h-3" /> Even
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
      <Trophy className="w-3 h-3 text-yellow-400" />
      {winner === "A" ? sideA.ownerName.split(";")[0].trim() : sideB.ownerName.split(";")[0].trim()} won
    </span>
  );
}

// ── Player row ────────────────────────────────────────────────────────────────
function PlayerItem({ p }: { p: TradeSide["players"][number] }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${posBadge(p.position)}`}>{p.position}</span>
      <span className="text-sm text-slate-200 flex-1 truncate">{p.playerName}</span>
      <span className="text-xs text-slate-400 tabular-nums">{p.avgPoints > 0 ? `${p.avgPoints.toFixed(1)} ppg` : "—"}</span>
      <span className="text-xs text-slate-500 tabular-nums w-14 text-right">{p.compositeValue > 0 ? `${p.compositeValue} val` : "—"}</span>
    </div>
  );
}

// ── Pick row ──────────────────────────────────────────────────────────────────
function PickItem({ pk }: { pk: TradeSide["picks"][number] }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-orange-500/20 text-orange-300 border-orange-500/30">PICK</span>
      <span className="text-sm text-slate-200 flex-1">{pk.label}</span>
      <span className="text-xs text-slate-500 tabular-nums w-14 text-right">{pk.value} val</span>
    </div>
  );
}

// ── Trade card ────────────────────────────────────────────────────────────────
function TradeCard({ trade }: { trade: TradeRecord }) {
  const winner: "A" | "B" | null =
    trade.verdict === "sideA" ? "A" : trade.verdict === "sideB" ? "B" : null;

  const date = trade.proposedDate
    ? new Date(trade.proposedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Unknown date";

  const sideAWon = winner === "A";
  const sideBWon = winner === "B";

  return (
    <Card className="bg-slate-900/60 border-slate-700/50 hover:border-slate-600/70 transition-colors">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Calendar className="w-3 h-3" />
            <span>{date}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-600 text-slate-400">
              {trade.season}
            </Badge>
          </div>
          <VerdictBadge verdict={trade.verdict} sideA={trade.sideA} sideB={trade.sideB} winner={winner} />
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-start">
          {/* Side A */}
          <div className={`rounded-lg p-3 border ${sideAWon ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700/40 bg-slate-800/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px]">
                {trade.sideA.ownerName.split(";")[0].trim()}
              </span>
              {sideAWon && <Trophy className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
            </div>
            <div className="space-y-0.5">
              {trade.sideA.players.map((p) => <PlayerItem key={p.playerId} p={p} />)}
              {trade.sideA.picks.map((pk) => <PickItem key={pk.label} pk={pk} />)}
              {trade.sideA.players.length === 0 && trade.sideA.picks.length === 0 && (
                <span className="text-xs text-slate-600 italic">No items</span>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-700/40 flex items-center justify-between">
              <span className="text-xs text-slate-500">Total value</span>
              <span className={`text-sm font-bold tabular-nums ${sideAWon ? "text-emerald-400" : "text-slate-400"}`}>
                {trade.sideA.totalValue}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center justify-center pt-8">
            <ArrowLeftRight className="w-4 h-4 text-slate-600" />
          </div>

          {/* Side B */}
          <div className={`rounded-lg p-3 border ${sideBWon ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700/40 bg-slate-800/30"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px]">
                {trade.sideB.ownerName.split(";")[0].trim()}
              </span>
              {sideBWon && <Trophy className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
            </div>
            <div className="space-y-0.5">
              {trade.sideB.players.map((p) => <PlayerItem key={p.playerId} p={p} />)}
              {trade.sideB.picks.map((pk) => <PickItem key={pk.label} pk={pk} />)}
              {trade.sideB.players.length === 0 && trade.sideB.picks.length === 0 && (
                <span className="text-xs text-slate-600 italic">No items</span>
              )}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-700/40 flex items-center justify-between">
              <span className="text-xs text-slate-500">Total value</span>
              <span className={`text-sm font-bold tabular-nums ${sideBWon ? "text-emerald-400" : "text-slate-400"}`}>
                {trade.sideB.totalValue}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ trades }: { trades: TradeRecord[] }) {
  if (!trades.length) return null;

  // Count wins per owner across all trades
  const winMap: Record<string, number> = {};
  for (const t of trades) {
    if (t.verdict === "even") continue;
    const winner = t.verdict === "sideA" ? t.sideA.ownerName.split(";")[0].trim() : t.sideB.ownerName.split(";")[0].trim();
    winMap[winner] = (winMap[winner] || 0) + 1;
  }
  const sorted = Object.entries(winMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {sorted.map(([owner, wins]) => (
        <div key={owner} className="flex items-center gap-1.5 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/40">
          <Trophy className="w-3 h-3 text-yellow-400" />
          <span className="text-xs text-slate-300 font-medium">{owner}</span>
          <span className="text-xs text-yellow-400 font-bold">{wins}W</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TradeAging() {
  const [seasonFilter, setSeasonFilter] = useState<string>("all");

  const { data: cachedSeasons } = trpc.espn.cachedSeasons.useQuery();
  const { data: rawTrades, isLoading, error } = trpc.espn.tradeAging.useQuery(
    { season: seasonFilter !== "all" ? Number(seasonFilter) : undefined },
    { staleTime: 5 * 60_000 }
  );

  const trades = useMemo(() => rawTrades ?? [], [rawTrades]);

  const seasonOptions = useMemo(() => {
    const seasons = cachedSeasons ? [...cachedSeasons].sort((a, b) => b - a) : [];
    return seasons;
  }, [cachedSeasons]);

  if (error) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">
        Failed to load trade history. Sync ESPN data first.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-200">Trade Aging</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Completed trades scored by season stats — see who won each deal.
          </p>
        </div>
        <Select value={seasonFilter} onValueChange={setSeasonFilter}>
          <SelectTrigger className="w-32 h-8 text-xs bg-slate-800 border-slate-700 text-slate-300">
            <SelectValue placeholder="All seasons" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-xs text-slate-300">All seasons</SelectItem>
            {seasonOptions.map((s) => (
              <SelectItem key={s} value={String(s)} className="text-xs text-slate-300">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary bar */}
      {!isLoading && trades.length > 0 && <SummaryBar trades={trades} />}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-slate-900/60 border-slate-700/50">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-32 mb-3 bg-slate-700/50" />
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3">
                  <Skeleton className="h-24 bg-slate-700/50 rounded-lg" />
                  <div className="w-4" />
                  <Skeleton className="h-24 bg-slate-700/50 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && trades.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm space-y-2">
          <ArrowLeftRight className="w-8 h-8 mx-auto text-slate-700 mb-3" />
          <p className="font-medium text-slate-400">No completed trades found</p>
          <p className="text-xs">
            {seasonFilter !== "all"
              ? `No trades recorded for the ${seasonFilter} season.`
              : "Sync ESPN data to populate trade history."}
          </p>
        </div>
      )}

      {/* Trade cards */}
      {!isLoading && trades.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{trades.length} trade{trades.length !== 1 ? "s" : ""} found</p>
          {trades.map((trade) => (
            <TradeCard key={`${trade.season}-${trade.tradeId}`} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}
