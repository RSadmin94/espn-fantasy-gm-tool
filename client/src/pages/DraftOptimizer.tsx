import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import SeasonSelector from "@/components/SeasonSelector";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ChevronRight, Target, TrendingUp, Users, Zap } from "lucide-react";

const POS_COLORS: Record<string, string> = {
  QB: "text-red-400 border-red-500/30 bg-red-500/10",
  RB: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  WR: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  TE: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  "D/ST": "text-purple-400 border-purple-500/30 bg-purple-500/10",
  K: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

const TIER_COLORS = [
  "border-yellow-500/40 bg-yellow-500/5",
  "border-emerald-500/30 bg-emerald-500/5",
  "border-blue-500/30 bg-blue-500/5",
  "border-slate-500/30 bg-slate-500/5",
  "border-slate-700/30 bg-transparent",
];

const TIER_LABEL_COLORS = [
  "text-yellow-400",
  "text-emerald-400",
  "text-blue-400",
  "text-slate-400",
  "text-slate-500",
];

interface Player {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  avgPoints: number;
  vorp: number;
  vorpTier: string;
  rosValue: number;
  injuryRisk: string;
  compositeScore: number;
}

interface TierGroup {
  tier: number;
  tierLabel: string;
  players: Player[];
}

interface ScarcityAlert {
  position: string;
  scarcityScore: number;
  scarcityLabel: string;
  topFreeAgentAvg: number;
  alert: string;
}

interface RodRec {
  round: number;
  pickInRound: number;
  overallPick: number;
  pickValue: number;
  recommendation: string;
  topAvailable: { playerName: string; position: string; compositeScore: number; }[];
}

interface KeeperRemoved {
  playerId: number;
  playerName: string;
  position: string;
  ownerName: string;
  avgPoints: number;
}

function ScarcityBadge({ label }: { label: string }) {
  if (label === "Scarce") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">Scarce</Badge>;
  if (label === "Tight") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">Tight</Badge>;
  return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Available</Badge>;
}

function InjuryDot({ risk }: { risk: string }) {
  if (risk === "High") return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" title="High injury risk" />;
  if (risk === "Medium") return <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" title="Questionable" />;
  if (risk === "Low") return <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" title="Probable" />;
  return null;
}

function PlayerRow({ player, rank }: { player: Player; rank: number }) {
  const posColor = POS_COLORS[player.position] || POS_COLORS.QB;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0 hover:bg-accent/10 rounded transition-colors px-2">
      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{rank}</span>
      <Badge variant="outline" className={`text-[10px] shrink-0 w-8 justify-center ${posColor}`}>{player.position}</Badge>
      <span className="text-sm font-medium flex-1 min-w-0 truncate">{player.playerName}</span>
      <div className="flex items-center gap-3 shrink-0">
        <InjuryDot risk={player.injuryRisk} />
        <span className="text-xs text-muted-foreground w-14 text-right">{player.avgPoints.toFixed(1)} ppg</span>
        <span className={`text-xs font-medium w-14 text-right ${player.vorp >= 5 ? "text-emerald-400" : player.vorp >= 0 ? "text-foreground" : "text-red-400"}`}>
          VORP {player.vorp >= 0 ? "+" : ""}{player.vorp.toFixed(1)}
        </span>
        <span className="text-xs font-bold w-12 text-right text-primary">{player.compositeScore}</span>
      </div>
    </div>
  );
}

export default function DraftOptimizer() {
  const [season, setSeason] = useState(2025);
  const [draftSlot, setDraftSlot] = useState("11");
  const [activePos, setActivePos] = useState<"RB" | "WR" | "QB" | "TE">("RB");
  const [activeTab, setActiveTab] = useState<"board" | "rounds" | "scarcity" | "keepers">("board");

  const { data, isLoading, error } = trpc.draftOptimizer.useQuery({
    season,
    draftSlot: parseInt(draftSlot),
    weeksRemaining: 10,
  });

  const positions: ("RB" | "WR" | "QB" | "TE")[] = ["RB", "WR", "QB", "TE"];
  const tiers = (data?.tieredBoard as Record<string, TierGroup[]> | undefined)?.[activePos] || [];
  const scarcity = (data?.scarcePositions as ScarcityAlert[]) || [];
  const recs = (data?.rodRecommendations as RodRec[]) || [];
  const keepers = (data?.removedKeepers as KeeperRemoved[]) || [];

  return (
    <AppLayout title="Draft Optimizer" subtitle="Keeper-adjusted draft board with tier breaks, scarcity alerts, and round-by-round recommendations">
      <div className="p-6 space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <SeasonSelector value={season} onChange={setSeason} />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Your draft slot</span>
            <Select value={draftSlot} onValueChange={setDraftSlot}>
              <SelectTrigger className="w-24 h-9 text-sm border-border bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 14 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>Pick {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {data && (
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <span>{data.totalAvailable} players available</span>
              <span>{data.keeperCount} keepers removed</span>
            </div>
          )}
        </div>

        {/* Scarcity alerts */}
        {scarcity.filter(s => s.alert).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {scarcity.filter(s => s.scarcityScore >= 60).map(s => (
              <div key={s.position} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${s.scarcityScore >= 80 ? "border-red-500/30 bg-red-500/10" : "border-yellow-500/30 bg-yellow-500/10"}`}>
                <AlertTriangle className={`w-3.5 h-3.5 ${s.scarcityScore >= 80 ? "text-red-400" : "text-yellow-400"}`} />
                <Badge variant="outline" className={`text-[10px] ${POS_COLORS[s.position] || ""}`}>{s.position}</Badge>
                <span className={s.scarcityScore >= 80 ? "text-red-300" : "text-yellow-300"}>{s.alert}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border">
          {[
            { id: "board", label: "Tier board", icon: <Target className="w-3.5 h-3.5" /> },
            { id: "rounds", label: `Round-by-round (pick ${draftSlot})`, icon: <ChevronRight className="w-3.5 h-3.5" /> },
            { id: "scarcity", label: "Scarcity map", icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: "keepers", label: `Off the board (${keepers.length})`, icon: <Users className="w-3.5 h-3.5" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* TIER BOARD */}
        {activeTab === "board" && (
          <div className="space-y-4">
            {/* Position tabs */}
            <div className="flex gap-2">
              {positions.map(pos => (
                <Button
                  key={pos}
                  variant={activePos === pos ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActivePos(pos)}
                  className={`text-xs ${activePos === pos ? "espn-gradient text-white border-0" : "border-border"}`}
                >
                  {pos}
                </Button>
              ))}
            </div>

            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
              </div>
            )}

            {error && (
              <Card className="card-glow bg-card border-red-500/30">
                <CardContent className="pt-4 text-sm text-red-400">
                  Failed to load draft data. Make sure ESPN data is synced for {season}.
                </CardContent>
              </Card>
            )}

            {!isLoading && tiers.map((tier, ti) => (
              <div key={tier.tier} className={`rounded-xl border ${TIER_COLORS[ti] || TIER_COLORS[4]} overflow-hidden`}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${TIER_LABEL_COLORS[ti] || "text-slate-400"}`}>
                      Tier {tier.tier}
                    </span>
                    <span className={`text-xs ${TIER_LABEL_COLORS[ti] || "text-slate-400"}`}>
                      — {tier.tierLabel}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{tier.players.length} players</span>
                </div>
                <div className="px-2 py-1">
                  {tier.players.map((p, pi) => {
                    const globalRank = tiers.slice(0, ti).reduce((s, t) => s + t.players.length, 0) + pi + 1;
                    return <PlayerRow key={p.playerId} player={p} rank={globalRank} />;
                  })}
                </div>
              </div>
            ))}

            {!isLoading && tiers.length === 0 && !error && (
              <Card className="card-glow bg-card border-border">
                <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
                  No player data available for {season}. Sync ESPN data first.
                </CardContent>
              </Card>
            )}

            {/* Legend */}
            {!isLoading && tiers.length > 0 && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2">
                <span>Score = composite ranking (PPG × 2 + VORP × 1.5)</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> High injury risk</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Questionable</span>
              </div>
            )}
          </div>
        )}

        {/* ROUND BY ROUND */}
        {activeTab === "rounds" && (
          <div className="space-y-3">
            {isLoading && Array.from({ length: 14 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
            {recs.map(rec => {
              const isRodPick = rec.pickInRound === parseInt(draftSlot);
              return (
                <Card key={rec.round} className={`card-glow bg-card border-border ${isRodPick ? "border-primary/40" : ""}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-4 flex-wrap">
                      <div className="shrink-0 text-center w-16">
                        <div className="text-2xl font-bold text-foreground">{rec.round}</div>
                        <div className="text-xs text-muted-foreground">round</div>
                        <div className="text-xs text-muted-foreground mt-0.5">pick {rec.pickInRound} (#{rec.overallPick})</div>
                        <div className="text-xs text-primary mt-1 font-medium">{rec.pickValue.toLocaleString()}</div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                          <span className="text-sm text-foreground">{rec.recommendation}</span>
                        </div>
                        {rec.topAvailable.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-muted-foreground mt-0.5">Likely available:</span>
                            {rec.topAvailable.map((p, i) => (
                              <div key={i} className="flex items-center gap-1.5 rounded-md border border-border bg-accent/20 px-2 py-1">
                                <Badge variant="outline" className={`text-[10px] ${POS_COLORS[p.position] || ""}`}>{p.position}</Badge>
                                <span className="text-xs font-medium">{p.playerName}</span>
                                <span className="text-xs text-muted-foreground">{p.compositeScore}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* SCARCITY MAP */}
        {activeTab === "scarcity" && (
          <div className="space-y-4">
            {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
            {!isLoading && (
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Positional depth — {season} keeper pool
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(data?.scarcityResults as {
                    position: string;
                    totalRostered: number;
                    starterSlots: number;
                    availableStarters: number;
                    scarcityScore: number;
                    scarcityLabel: string;
                    topFreeAgentAvg: number;
                  }[] || []).map(s => (
                    <div key={s.position} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] ${POS_COLORS[s.position] || ""}`}>{s.position}</Badge>
                          <ScarcityBadge label={s.scarcityLabel} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {s.availableStarters} starter slots open · best FA {s.topFreeAgentAvg.toFixed(1)} ppg
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${s.scarcityScore >= 80 ? "bg-red-500" : s.scarcityScore >= 60 ? "bg-yellow-500" : "bg-emerald-500"}`}
                          style={{ width: `${s.scarcityScore}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{s.totalRostered} rostered</span>
                        <span>{s.starterSlots} starter slots total</span>
                        <span>Scarcity score {s.scarcityScore}/100</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {!isLoading && (
              <Card className="card-glow bg-card border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Players per position</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries((data?.positionCounts as Record<string, number>) || {})
                      .sort((a, b) => b[1] - a[1])
                      .map(([pos, count]) => (
                        <div key={pos} className="flex items-center justify-between rounded-lg border border-border bg-accent/10 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[10px] ${POS_COLORS[pos] || ""}`}>{pos}</Badge>
                          </div>
                          <span className="text-sm font-bold">{count}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* KEEPERS OFF THE BOARD */}
        {activeTab === "keepers" && (
          <div className="space-y-3">
            {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
            {!isLoading && keepers.length === 0 && (
              <Card className="card-glow bg-card border-border">
                <CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">
                  No keeper data found for {season}. Players are removed from the board when ESPN flags them as keepers.
                </CardContent>
              </Card>
            )}
            {!isLoading && keepers.length > 0 && (
              <>
                <Card className="card-glow bg-card border-border border-yellow-500/20">
                  <CardContent className="pt-4 pb-4 text-sm text-yellow-300">
                    {keepers.length} players have been removed from the available pool. These are being kept by their current owners and will not be in the draft.
                  </CardContent>
                </Card>
                <Card className="card-glow bg-card border-border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Kept players — removed from pool
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {keepers.map(k => (
                        <div key={k.playerId} className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0 px-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${POS_COLORS[k.position] || ""}`}>{k.position}</Badge>
                            <span className="text-sm font-medium truncate">{k.playerName}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-xs text-muted-foreground">{k.avgPoints.toFixed(1)} ppg</span>
                            <span className="text-xs text-muted-foreground truncate max-w-32">{k.ownerName}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
