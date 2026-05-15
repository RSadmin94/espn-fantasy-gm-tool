/**
 * TradeAging.tsx
 *
 * Dedicated "How Did This Trade Age?" screen.
 * Evaluates every league trade using actual season fantasy points scored,
 * with an AI weekly narrative explaining WHY each trade aged the way it did.
 * Refreshes every 6 hours (aligned with weekly ESPN data sync).
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Clock, Zap, ArrowRightLeft, RefreshCw
} from "lucide-react";
import AppLayout from "@/components/AppLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerAgeStat {
  name: string;
  position: string;
  fantasyPoints: number | null;
  pprPoints: number | null;
  games: number | null;
  rushYds: number | null;
  recYds: number | null;
  tds: number | null;
  targets: number | null;
  passYds: number | null;
  passTDs: number | null;
}

interface TradeSideAge {
  ownerName: string;
  players: PlayerAgeStat[];
  totalFantasyPoints: number;
}

interface TradeAgeResult {
  transactionId: string;
  season: number;
  dateLabel: string;
  weekEvaluated: number;
  lastUpdated: number;
  teamA: TradeSideAge;
  teamB: TradeSideAge;
  pointDifferential: number;
  agingGrade: "AGED WELL" | "FAIR" | "AGED POORLY";
  agingScore: number;
  verdict: string;
  narrative: string;
  teamANarrative: string;
  teamBNarrative: string;
  keyFactor: string;
}

// ─── Aging grade badge ────────────────────────────────────────────────────────

function AgingBadge({ grade }: { grade: "AGED WELL" | "FAIR" | "AGED POORLY" }) {
  if (grade === "AGED WELL") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/40">
        <TrendingUp className="w-3 h-3" /> AGED WELL
      </span>
    );
  }
  if (grade === "AGED POORLY") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/40">
        <TrendingDown className="w-3 h-3" /> AGED POORLY
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
      <Minus className="w-3 h-3" /> FAIR
    </span>
  );
}

// ─── Player stat row ──────────────────────────────────────────────────────────

function PlayerStatRow({ player }: { player: PlayerAgeStat }) {
  const pts = player.fantasyPoints ?? player.pprPoints;
  const statParts: string[] = [];
  if (player.games != null) statParts.push(`${player.games}G`);
  if (player.tds != null && player.tds > 0) statParts.push(`${player.tds} TD`);
  if (player.rushYds != null && player.rushYds > 0) statParts.push(`${player.rushYds} RuYd`);
  if (player.recYds != null && player.recYds > 0) statParts.push(`${player.recYds} RecYd`);
  if (player.passYds != null && player.passYds > 0) statParts.push(`${player.passYds} PaYd`);
  if (player.targets != null && player.targets > 0) statParts.push(`${player.targets} Tgt`);

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded font-mono w-8 text-center flex-shrink-0">
          {player.position}
        </span>
        <span className="text-sm text-foreground truncate">{player.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        {statParts.length > 0 && (
          <span className="text-xs text-muted-foreground hidden sm:block">{statParts.join(" · ")}</span>
        )}
        <span className={`text-sm font-bold tabular-nums ${pts != null ? (pts > 150 ? "text-green-400" : pts > 80 ? "text-yellow-400" : "text-red-400") : "text-muted-foreground"}`}>
          {pts != null ? `${pts.toFixed(1)}` : "—"} <span className="text-xs font-normal text-muted-foreground">pts</span>
        </span>
      </div>
    </div>
  );
}

// ─── Points bar ───────────────────────────────────────────────────────────────

function PointsBar({ teamA, teamB }: { teamA: TradeSideAge; teamB: TradeSideAge }) {
  const total = teamA.totalFantasyPoints + teamB.totalFantasyPoints;
  if (total === 0) return null;
  const pctA = Math.round((teamA.totalFantasyPoints / total) * 100);
  const pctB = 100 - pctA;
  const aWins = teamA.totalFantasyPoints >= teamB.totalFantasyPoints;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate max-w-[120px]">{teamA.ownerName.split(" ")[0]}</span>
        <span className="truncate max-w-[120px] text-right">{teamB.ownerName.split(" ")[0]}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        <div
          className={`h-full rounded-l-full transition-all ${aWins ? "bg-green-500" : "bg-red-500/70"}`}
          style={{ width: `${pctA}%` }}
        />
        <div
          className={`h-full rounded-r-full transition-all ${!aWins ? "bg-green-500" : "bg-red-500/70"}`}
          style={{ width: `${pctB}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs font-bold tabular-nums">
        <span className={aWins ? "text-green-400" : "text-red-400"}>{teamA.totalFantasyPoints.toFixed(1)}</span>
        <span className={!aWins ? "text-green-400" : "text-red-400"}>{teamB.totalFantasyPoints.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ─── Single trade aging card ──────────────────────────────────────────────────

function TradeAgingCard({ result }: { result: TradeAgeResult }) {
  const [expanded, setExpanded] = useState(false);
  const lastUpdated = new Date(result.lastUpdated).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <Card className="bg-card border-border overflow-hidden">
      {/* Color accent bar at top */}
      <div className={`h-1 w-full ${result.agingGrade === "AGED WELL" ? "bg-green-500" : result.agingGrade === "AGED POORLY" ? "bg-red-500" : "bg-yellow-500"}`} />

      <CardHeader className="pb-3 pt-4">
        {/* Top row: date + season + aging badge */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground">{result.dateLabel}</span>
            <Badge variant="outline" className="text-xs">{result.season}</Badge>
            <span className="text-xs text-muted-foreground hidden sm:block">· Wk {result.weekEvaluated}</span>
          </div>
          <div className="flex items-center gap-2">
            <AgingBadge grade={result.agingGrade} />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Verdict */}
        <p className="text-sm font-semibold text-foreground mt-2">{result.verdict}</p>

        {/* Points bar */}
        <div className="mt-3">
          <PointsBar teamA={result.teamA} teamB={result.teamB} />
        </div>

        {/* Key factor pill */}
        <div className="flex items-center gap-1.5 mt-2">
          <Zap className="w-3 h-3 text-primary flex-shrink-0" />
          <span className="text-xs text-muted-foreground">Key factor: <span className="text-foreground">{result.keyFactor}</span></span>
        </div>
      </CardHeader>

      {/* Expanded detail */}
      {expanded && (
        <CardContent className="pt-0 pb-4 space-y-4">
          {/* AI narrative */}
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-xs font-semibold text-primary mb-1.5">AI Weekly Analysis</p>
            <p className="text-sm text-foreground leading-relaxed">{result.narrative}</p>
          </div>

          {/* Per-team player stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Team A */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">{result.teamA.ownerName}</p>
                <span className="text-xs font-bold tabular-nums text-foreground">{result.teamA.totalFantasyPoints.toFixed(1)} pts total</span>
              </div>
              <div className="bg-muted/20 rounded-lg px-3 py-1">
                {result.teamA.players.length > 0
                  ? result.teamA.players.map(p => <PlayerStatRow key={p.name} player={p} />)
                  : <p className="text-xs text-muted-foreground py-2">No players tracked</p>
                }
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{result.teamANarrative}</p>
            </div>

            {/* Team B */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-foreground">{result.teamB.ownerName}</p>
                <span className="text-xs font-bold tabular-nums text-foreground">{result.teamB.totalFantasyPoints.toFixed(1)} pts total</span>
              </div>
              <div className="bg-muted/20 rounded-lg px-3 py-1">
                {result.teamB.players.length > 0
                  ? result.teamB.players.map(p => <PlayerStatRow key={p.name} player={p} />)
                  : <p className="text-xs text-muted-foreground py-2">No players tracked</p>
                }
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{result.teamBNarrative}</p>
            </div>
          </div>

          {/* Last updated */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Last evaluated: {lastUpdated}</span>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Summary stats bar ────────────────────────────────────────────────────────

function SummaryBar({ results }: { results: TradeAgeResult[] }) {
  const agedWell = results.filter(r => r.agingGrade === "AGED WELL").length;
  const fair = results.filter(r => r.agingGrade === "FAIR").length;
  const agedPoorly = results.filter(r => r.agingGrade === "AGED POORLY").length;
  const total = results.length;
  if (total === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-green-400">{agedWell}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Aged Well</p>
      </div>
      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-yellow-400">{fair}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Fair</p>
      </div>
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
        <p className="text-2xl font-bold text-red-400">{agedPoorly}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Aged Poorly</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TradeAging() {
  const [season, setSeason] = useState("0");
  const [filterGrade, setFilterGrade] = useState<"ALL" | "AGED WELL" | "FAIR" | "AGED POORLY">("ALL");

  const cachedSeasonsQuery = trpc.espn.cachedSeasons.useQuery();
  const cachedSeasons = (cachedSeasonsQuery.data ?? []) as number[];

  const utils = trpc.useUtils();

  const allAgedQuery = trpc.tradeHistory.allAged.useQuery(
    { season: Number(season) },
    { enabled: cachedSeasons.length > 0 }
  );

  const results = (allAgedQuery.data ?? []) as TradeAgeResult[];

  const filtered = useMemo(() => {
    if (filterGrade === "ALL") return results;
    return results.filter(r => r.agingGrade === filterGrade);
  }, [results, filterGrade]);

  function handleRefresh() {
    utils.tradeHistory.allAged.invalidate();
  }

  return (
    <AppLayout title="Trade Aging" subtitle="How every league trade aged over the season">
      <div className="p-6 space-y-6">
        {/* Header controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Trade Aging Report</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every trade re-evaluated weekly using actual fantasy points — AI explains why each trade aged the way it did
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Season" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">All Seasons</SelectItem>
                {[...cachedSeasons].sort((a, b) => b - a).map(s => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleRefresh}
              disabled={allAgedQuery.isFetching}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${allAgedQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {allAgedQuery.isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm font-medium">Evaluating all trades with AI...</p>
            <p className="text-xs">This may take 15–30 seconds for the first load</p>
          </div>
        )}

        {/* No data */}
        {!allAgedQuery.isLoading && results.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <ArrowRightLeft className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-base">No trades found</p>
            <p className="text-sm mt-1">
              {cachedSeasons.length === 0
                ? "Refresh your league data first from the Command Center."
                : "No accepted trades found in the selected season."}
            </p>
          </div>
        )}

        {/* Results */}
        {!allAgedQuery.isLoading && results.length > 0 && (
          <>
            {/* Summary bar */}
            <SummaryBar results={results} />

            {/* Filter tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              {(["ALL", "AGED WELL", "FAIR", "AGED POORLY"] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setFilterGrade(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filterGrade === g
                      ? g === "AGED WELL" ? "bg-green-500/20 border-green-500/40 text-green-400"
                        : g === "AGED POORLY" ? "bg-red-500/20 border-red-500/40 text-red-400"
                        : g === "FAIR" ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-400"
                        : "bg-primary/20 border-primary/40 text-primary"
                      : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {g === "ALL" ? `All (${results.length})` : `${g} (${results.filter(r => r.agingGrade === g).length})`}
                </button>
              ))}
            </div>

            {/* Trade cards */}
            <div className="space-y-4">
              {filtered.map(result => (
                <TradeAgingCard key={`${result.transactionId}-${result.season}`} result={result} />
              ))}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No trades match this filter.
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
