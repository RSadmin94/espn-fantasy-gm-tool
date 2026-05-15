/**
 * LeagueTradeHistory.tsx
 *
 * Displays all accepted trades from the league's ESPN transaction history.
 * Groups by transaction, shows players sent/received per team, and provides
 * on-demand AI grading (WIN / FAIR / LOSS) for each trade.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronUp, ArrowRightLeft, Sparkles } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeSide {
  teamId: number;
  ownerName: string;
  playersReceived: string[];
  playersSent: string[];
}

interface TradeRecord {
  transactionId: string;
  season: number;
  proposedDate: number | null;
  dateLabel: string;
  teamA: TradeSide;
  teamB: TradeSide;
}

interface TradeGrade {
  teamAGrade: "WIN" | "FAIR" | "LOSS";
  teamBGrade: "WIN" | "FAIR" | "LOSS";
  teamAScore: number;
  teamBScore: number;
  summary: string;
  teamAAnalysis: string;
  teamBAnalysis: string;
  verdict: string;
  keyFactor: string;
}

// ─── Grade badge ──────────────────────────────────────────────────────────────

function GradeBadge({ grade }: { grade: "WIN" | "FAIR" | "LOSS" }) {
  const styles: Record<string, string> = {
    WIN: "bg-green-500/20 text-green-400 border-green-500/40",
    FAIR: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    LOSS: "bg-red-500/20 text-red-400 border-red-500/40",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${styles[grade]}`}>
      {grade}
    </span>
  );
}

// ─── Single trade card ────────────────────────────────────────────────────────

function TradeCard({ trade }: { trade: TradeRecord }) {
  const [expanded, setExpanded] = useState(false);
  const [gradeEnabled, setGradeEnabled] = useState(false);

  const gradeQuery = trpc.tradeHistory.grade.useQuery(
    {
      transactionId: trade.transactionId,
      season: trade.season,
      teamAName: trade.teamA.ownerName,
      teamAReceived: trade.teamA.playersReceived,
      teamASent: trade.teamA.playersSent,
      teamBName: trade.teamB.ownerName,
      teamBReceived: trade.teamB.playersReceived,
      teamBSent: trade.teamB.playersSent,
    },
    { enabled: gradeEnabled }
  );

  const grade = gradeQuery.data as TradeGrade | undefined;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm text-muted-foreground">{trade.dateLabel}</span>
            <Badge variant="outline" className="text-xs">{trade.season}</Badge>
          </div>
          <div className="flex items-center gap-2">
            {grade && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{trade.teamA.ownerName.split(" ")[0]}:</span>
                <GradeBadge grade={grade.teamAGrade} />
                <span className="text-xs text-muted-foreground ml-1">{trade.teamB.ownerName.split(" ")[0]}:</span>
                <GradeBadge grade={grade.teamBGrade} />
              </div>
            )}
            {!grade && !gradeEnabled && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => setGradeEnabled(true)}
              >
                <Sparkles className="w-3 h-3" />
                Grade
              </Button>
            )}
            {gradeEnabled && gradeQuery.isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
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

        {/* Trade summary row */}
        <div className="flex items-start gap-3 mt-2">
          {/* Team A */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{trade.teamA.ownerName}</p>
            <div className="mt-1 space-y-0.5">
              {trade.teamA.playersReceived.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-green-400 font-medium">Got:</span>
                  {trade.teamA.playersReceived.map(p => (
                    <span key={p} className="text-xs bg-green-500/10 text-green-300 px-1.5 py-0.5 rounded">{p}</span>
                  ))}
                </div>
              )}
              {trade.teamA.playersSent.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-red-400 font-medium">Sent:</span>
                  {trade.teamA.playersSent.map(p => (
                    <span key={p} className="text-xs bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded">{p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center pt-4">
            <div className="w-px h-8 bg-border" />
            <ArrowRightLeft className="w-3 h-3 text-muted-foreground my-1" />
            <div className="w-px h-8 bg-border" />
          </div>

          {/* Team B */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{trade.teamB.ownerName}</p>
            <div className="mt-1 space-y-0.5">
              {trade.teamB.playersReceived.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-green-400 font-medium">Got:</span>
                  {trade.teamB.playersReceived.map(p => (
                    <span key={p} className="text-xs bg-green-500/10 text-green-300 px-1.5 py-0.5 rounded">{p}</span>
                  ))}
                </div>
              )}
              {trade.teamB.playersSent.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="text-xs text-red-400 font-medium">Sent:</span>
                  {trade.teamB.playersSent.map(p => (
                    <span key={p} className="text-xs bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded">{p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      {/* Expanded AI grade section */}
      {expanded && grade && (
        <CardContent className="pt-0 pb-4">
          <div className="border-t border-border pt-3 space-y-3">
            {/* Verdict banner */}
            <div className="bg-primary/10 border border-primary/20 rounded px-3 py-2">
              <p className="text-sm font-semibold text-primary">{grade.verdict}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Key factor: {grade.keyFactor}</p>
            </div>

            {/* Summary */}
            <p className="text-sm text-foreground">{grade.summary}</p>

            {/* Per-team analysis */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-foreground">{trade.teamA.ownerName}</span>
                  <GradeBadge grade={grade.teamAGrade} />
                  <span className="text-xs text-muted-foreground ml-auto">{grade.teamAScore}/10</span>
                </div>
                <p className="text-xs text-muted-foreground">{grade.teamAAnalysis}</p>
              </div>
              <div className="bg-muted/30 rounded p-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-semibold text-foreground">{trade.teamB.ownerName}</span>
                  <GradeBadge grade={grade.teamBGrade} />
                  <span className="text-xs text-muted-foreground ml-auto">{grade.teamBScore}/10</span>
                </div>
                <p className="text-xs text-muted-foreground">{grade.teamBAnalysis}</p>
              </div>
            </div>
          </div>
        </CardContent>
      )}

      {/* Expanded but grade not yet loaded */}
      {expanded && gradeEnabled && gradeQuery.isLoading && (
        <CardContent className="pt-0 pb-4">
          <div className="border-t border-border pt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing trade with AI...
          </div>
        </CardContent>
      )}

      {/* Expanded but grade not requested yet */}
      {expanded && !gradeEnabled && (
        <CardContent className="pt-0 pb-4">
          <div className="border-t border-border pt-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setGradeEnabled(true)}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Get AI Grade for this trade
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeagueTradeHistory() {
  const [season, setSeason] = useState("0");

  const cachedSeasonsQuery = trpc.espn.cachedSeasons.useQuery();
  const cachedSeasons = (cachedSeasonsQuery.data ?? []) as number[];

  const tradesQuery = trpc.tradeHistory.list.useQuery(
    { season: Number(season) },
    { enabled: cachedSeasons.length > 0 }
  );

  const trades = (tradesQuery.data ?? []) as TradeRecord[];

  // Sort newest first (already sorted by server, but ensure)
  const sortedTrades = useMemo(
    () => [...trades].sort((a, b) => (b.proposedDate ?? 0) - (a.proposedDate ?? 0)),
    [trades]
  );

  // Group by season for display when showing all
  const tradesBySeason = useMemo(() => {
    if (season !== "0") return null;
    const map = new Map<number, TradeRecord[]>();
    for (const t of sortedTrades) {
      if (!map.has(t.season)) map.set(t.season, []);
      map.get(t.season)!.push(t);
    }
    return map;
  }, [sortedTrades, season]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">League Trade History</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All accepted trades from your ESPN league — click <span className="text-primary font-medium">Grade</span> on any trade for an AI evaluation
          </p>
        </div>
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
      </div>

      {/* Loading */}
      {tradesQuery.isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading trade history...</span>
        </div>
      )}

      {/* No data */}
      {!tradesQuery.isLoading && sortedTrades.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No trades found</p>
          <p className="text-sm mt-1">
            {cachedSeasons.length === 0
              ? "Refresh your league data first to load trade history."
              : "No accepted trades found in the selected season."}
          </p>
        </div>
      )}

      {/* Trades — grouped by season when showing all */}
      {!tradesQuery.isLoading && sortedTrades.length > 0 && (
        <>
          {season !== "0" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{sortedTrades.length} trade{sortedTrades.length !== 1 ? "s" : ""} in {season}</p>
              {sortedTrades.map(trade => (
                <TradeCard key={trade.transactionId} trade={trade} />
              ))}
            </div>
          ) : (
            <div className="space-y-8">
              {tradesBySeason && Array.from(tradesBySeason.entries())
                .sort(([a], [b]) => b - a)
                .map(([yr, seasonTrades]) => (
                  <div key={yr}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-base font-semibold text-foreground">{yr} Season</h3>
                      <Badge variant="secondary">{seasonTrades.length} trade{seasonTrades.length !== 1 ? "s" : ""}</Badge>
                    </div>
                    <div className="space-y-3">
                      {seasonTrades.map(trade => (
                        <TradeCard key={trade.transactionId} trade={trade} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
