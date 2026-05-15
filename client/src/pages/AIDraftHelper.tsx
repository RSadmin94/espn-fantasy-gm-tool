import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DraftPick {
  overall: number;
  round: number;
  pickInRound: number;
  teamId: number;
  ownerName: string;
  playerName: string;
  position: string;
}

interface RosterSlot {
  position: string;
  playerName: string;
  round: number;
}

interface PickRecommendation {
  primaryPick: string;
  primaryPosition: string;
  primaryReasoning: string;
  alternativePick: string;
  alternativePosition: string;
  alternativeReasoning: string;
  avoidPick: string;
  avoidReason: string;
  rosterImpact: string;
  urgencyAlert: string | null;
  confidenceLevel: "high" | "medium" | "low";
}

// ─── Position badge colours ──────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-green-500/20 text-green-300 border-green-500/30",
  WR: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TE: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  K:  "bg-gray-500/20 text-gray-300 border-gray-500/30",
  DST:"bg-purple-500/20 text-purple-300 border-purple-500/30",
  DEF:"bg-purple-500/20 text-purple-300 border-purple-500/30",
  FLEX:"bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   "bg-green-600 text-white",
  medium: "bg-yellow-600 text-white",
  low:    "bg-gray-600 text-white",
};

const SURVIVAL_COLOR = (risk: number) => {
  if (risk >= 0.75) return "text-red-400";
  if (risk >= 0.5)  return "text-orange-400";
  if (risk >= 0.25) return "text-yellow-400";
  return "text-green-400";
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AIDraftHelper() {
  // ── Draft configuration ──────────────────────────────────────────────────
  const [totalTeams,  setTotalTeams]  = useState(14);
  const [totalRounds, setTotalRounds] = useState(15);
  const [rodDraftSlot, setRodDraftSlot] = useState(1);
  const [currentOverall, setCurrentOverall] = useState(1);

  // ── Live draft state ─────────────────────────────────────────────────────
  const [picksAlreadyMade, setPicksAlreadyMade] = useState<DraftPick[]>([]);
  const [rodRoster, setRodRoster] = useState<RosterSlot[]>([]);
  const [recommendation, setRecommendation] = useState<PickRecommendation | null>(null);
  const [isLoadingRec, setIsLoadingRec] = useState(false);

  // ── Add-pick form ────────────────────────────────────────────────────────
  const [newPickOwner,  setNewPickOwner]  = useState("");
  const [newPickPlayer, setNewPickPlayer] = useState("");
  const [newPickPos,    setNewPickPos]    = useState("RB");
  const [newPickTeamId, setNewPickTeamId] = useState(1);

  // ── Draft context query ──────────────────────────────────────────────────
  const contextQuery = trpc.draftHelper.getDraftContext.useQuery(
    {
      currentOverall,
      totalTeams,
      totalRounds,
      rodDraftSlot,
      picksAlreadyMade,
      rodRoster,
    },
    { staleTime: 30_000 }
  );

  const ctx = contextQuery.data;

  // ── LLM recommendation mutation ──────────────────────────────────────────
  const recMutation = trpc.draftHelper.getPickRecommendation.useMutation({
    onSuccess: (data) => {
      setRecommendation(data as PickRecommendation);
      setIsLoadingRec(false);
    },
    onError: (err) => {
      toast.error("AI Error", { description: err.message });
      setIsLoadingRec(false);
    },
  });

  const handleGetRecommendation = useCallback(() => {
    if (!ctx) return;
    setIsLoadingRec(true);
    setRecommendation(null);
    recMutation.mutate({
      currentOverall,
      currentRound: ctx.currentRound,
      pickInRound: ctx.pickInRound,
      totalTeams,
      totalRounds,
      rodRoster,
      positionalNeeds: ctx.positionalNeeds,
      topAvailable: ctx.availablePlayers.slice(0, 20),
      ownerTendencies: ctx.ownerTendencies,
      recentPicks: picksAlreadyMade.slice(-10),
      positionRun: ctx.positionRun,
    });
  }, [ctx, currentOverall, totalTeams, totalRounds, rodRoster, picksAlreadyMade, recMutation]);

  // ── Add a pick to the board ──────────────────────────────────────────────
  const handleAddPick = useCallback(() => {
    if (!newPickPlayer.trim() || !newPickOwner.trim()) {
      toast.error("Missing info", { description: "Enter owner and player name" });
      return;
    }
    const round = Math.ceil(currentOverall / totalTeams);
    const pickInRound = ((currentOverall - 1) % totalTeams) + 1;
    const newPick: DraftPick = {
      overall: currentOverall,
      round,
      pickInRound,
      teamId: newPickTeamId,
      ownerName: newPickOwner,
      playerName: newPickPlayer,
      position: newPickPos,
    };
    setPicksAlreadyMade(prev => [...prev, newPick]);
    // If Rod drafted this, add to roster
    const isSnakeEven = round % 2 === 0;
    const slot = isSnakeEven ? totalTeams - pickInRound + 1 : pickInRound;
    if (slot === rodDraftSlot) {
      setRodRoster(prev => [...prev, { position: newPickPos, playerName: newPickPlayer, round }]);
    }
    setCurrentOverall(prev => prev + 1);
    setNewPickPlayer("");
    setNewPickOwner("");
    setRecommendation(null);
  }, [currentOverall, totalTeams, newPickOwner, newPickPlayer, newPickPos, newPickTeamId, rodDraftSlot, toast]);

  // ── Undo last pick ───────────────────────────────────────────────────────
  const handleUndoPick = useCallback(() => {
    if (picksAlreadyMade.length === 0) return;
    const last = picksAlreadyMade[picksAlreadyMade.length - 1];
    setPicksAlreadyMade(prev => prev.slice(0, -1));
    setRodRoster(prev => prev.filter(r => r.playerName !== last.playerName));
    setCurrentOverall(last.overall);
    setRecommendation(null);
  }, [picksAlreadyMade]);

  // ── Is it Rod's pick? ────────────────────────────────────────────────────
  const isRodsPick = useMemo(() => {
    const round = Math.ceil(currentOverall / totalTeams);
    const pickInRound = ((currentOverall - 1) % totalTeams) + 1;
    const isEven = round % 2 === 0;
    const slot = isEven ? totalTeams - pickInRound + 1 : pickInRound;
    return slot === rodDraftSlot;
  }, [currentOverall, totalTeams, rodDraftSlot]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 p-4 min-h-screen bg-background text-foreground">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🤖 AI Draft Helper</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live draft assistant — tracks picks, analyzes tendencies, recommends your next move
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={isRodsPick ? "border-green-500 text-green-400 animate-pulse" : "border-muted"}>
              {isRodsPick ? "⚡ YOUR PICK" : `Pick ${currentOverall}`}
            </Badge>
            <Badge variant="outline">
              Round {Math.ceil(currentOverall / totalTeams)} / {totalRounds}
            </Badge>
          </div>
        </div>

        {/* ── Config bar ─────────────────────────────────────────────────── */}
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Teams</Label>
                <Select value={String(totalTeams)} onValueChange={v => { setTotalTeams(Number(v)); setCurrentOverall(1); setPicksAlreadyMade([]); setRodRoster([]); setRecommendation(null); }}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[8,10,12,14,16].map(n => <SelectItem key={n} value={String(n)}>{n} teams</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rounds</Label>
                <Select value={String(totalRounds)} onValueChange={v => setTotalRounds(Number(v))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[10,12,14,15,16,18,20].map(n => <SelectItem key={n} value={String(n)}>{n} rounds</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rod's Draft Slot</Label>
                <Select value={String(rodDraftSlot)} onValueChange={v => setRodDraftSlot(Number(v))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({length: totalTeams}, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={String(n)}>Slot {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Current Overall Pick</Label>
                <Input
                  type="number"
                  min={1}
                  max={totalTeams * totalRounds}
                  value={currentOverall}
                  onChange={e => setCurrentOverall(Math.max(1, Number(e.target.value)))}
                  className="h-8 text-sm mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Main grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* LEFT: Available Players + Add Pick ──────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Add Pick form */}
            <Card className="border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold">Record a Pick</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">Player Name</Label>
                    <Input
                      placeholder="e.g. Ja'Marr Chase"
                      value={newPickPlayer}
                      onChange={e => setNewPickPlayer(e.target.value)}
                      className="h-8 text-sm mt-1"
                      onKeyDown={e => e.key === "Enter" && handleAddPick()}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Owner</Label>
                    <Input
                      placeholder="Owner name"
                      value={newPickOwner}
                      onChange={e => setNewPickOwner(e.target.value)}
                      className="h-8 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Position</Label>
                    <Select value={newPickPos} onValueChange={setNewPickPos}>
                      <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["QB","RB","WR","TE","K","DST"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleAddPick} className="flex-1">
                    ✅ Record Pick #{currentOverall}
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleUndoPick} disabled={picksAlreadyMade.length === 0}>
                    ↩ Undo
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Available Players */}
            <Card className="border-border/50 flex-1">
              <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Top Available Players
                  {ctx && <span className="text-muted-foreground font-normal ml-2">({ctx.availablePlayers.length} shown)</span>}
                </CardTitle>
                {contextQuery.isFetching && <span className="text-xs text-muted-foreground animate-pulse">Loading…</span>}
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {contextQuery.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({length: 8}).map((_, i) => (
                      <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />
                    ))}
                  </div>
                ) : ctx?.availablePlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No players available — check draft board data.</p>
                ) : (
                  <ScrollArea className="h-72">
                    <div className="space-y-1.5 pr-2">
                      {ctx?.availablePlayers.map((p, i) => (
                        <div
                          key={p.playerName}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer group"
                          onClick={() => { setNewPickPlayer(p.playerName); setNewPickPos(p.position); }}
                        >
                          <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
                          <Badge className={`text-[10px] px-1.5 py-0 border ${POS_COLORS[p.position] ?? "bg-muted/30 text-muted-foreground"}`}>
                            {p.position}
                          </Badge>
                          <span className="flex-1 text-sm font-medium truncate">{p.playerName}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="hidden sm:inline">ECR {p.ecrRank}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Expert Consensus Rank: {p.ecrRank}</p>
                                <p>ADP: {p.adpRank}</p>
                                <p>ECR vs ADP gap: {p.ecrAdpGap > 0 ? `+${p.ecrAdpGap} (value)` : `${p.ecrAdpGap} (reach)`}</p>
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`font-semibold ${SURVIVAL_COLOR(p.survivalRisk)}`}>
                                  {Math.round(p.survivalRisk * 100)}% risk
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Survival Risk: probability this player is gone before your next pick</p>
                                <p className="text-muted-foreground text-xs mt-1">Based on ECR rank + owner tendencies</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => { e.stopPropagation(); setNewPickPlayer(p.playerName); setNewPickPos(p.position); }}
                          >
                            Select
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Recent Picks */}
            {picksAlreadyMade.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Recent Picks (last 10)</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-1">
                    {picksAlreadyMade.slice(-10).reverse().map((p) => (
                      <div key={p.overall} className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground w-8">#{p.overall}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 border ${POS_COLORS[p.position] ?? "bg-muted/30"}`}>
                          {p.position}
                        </Badge>
                        <span className="flex-1 truncate">{p.playerName}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[80px]">{p.ownerName}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* RIGHT: AI Recommendation + Needs + Owner Alerts ─────────────── */}
          <div className="flex flex-col gap-4">

            {/* AI Recommendation */}
            <Card className={`border-2 ${isRodsPick ? "border-green-500/50 shadow-green-500/10 shadow-lg" : "border-border/50"}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  🤖 AI Recommendation
                  {isRodsPick && <Badge className="bg-green-600 text-white text-[10px]">YOUR PICK</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {recommendation ? (
                  <div className="space-y-3">
                    {/* Primary pick */}
                    <div className="rounded-lg bg-muted/30 p-3 border border-border/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-[10px] px-1.5 py-0 border ${POS_COLORS[recommendation.primaryPosition] ?? "bg-muted/30"}`}>
                          {recommendation.primaryPosition}
                        </Badge>
                        <span className="font-bold text-base">{recommendation.primaryPick}</span>
                        <Badge className={`text-[10px] px-1.5 ml-auto ${CONFIDENCE_COLORS[recommendation.confidenceLevel] ?? "bg-muted"}`}>
                          {recommendation.confidenceLevel} confidence
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{recommendation.primaryReasoning}</p>
                    </div>

                    {/* Roster impact */}
                    {recommendation.rosterImpact && (
                      <div className="text-xs text-muted-foreground italic border-l-2 border-blue-500/50 pl-2">
                        {recommendation.rosterImpact}
                      </div>
                    )}

                    {/* Alternative */}
                    {recommendation.alternativePick && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">Alternative</p>
                        <div className="flex items-start gap-2 text-xs">
                          <Badge className={`text-[10px] px-1.5 py-0 border shrink-0 mt-0.5 ${POS_COLORS[recommendation.alternativePosition] ?? "bg-muted/30"}`}>
                            {recommendation.alternativePosition}
                          </Badge>
                          <div>
                            <span className="font-medium">{recommendation.alternativePick}</span>
                            <p className="text-muted-foreground">{recommendation.alternativeReasoning}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Avoid pick */}
                    {recommendation.avoidPick && (
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Avoid drafting:</span>
                        <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-400">
                          {recommendation.avoidPick}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{recommendation.avoidReason}</span>
                      </div>
                    )}

                    {/* Urgency alert */}
                    {recommendation.urgencyAlert && (
                      <div className="text-xs px-2 py-1.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-300">
                        ⚠️ {recommendation.urgencyAlert}
                      </div>
                    )}

                    <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleGetRecommendation}>
                      🔄 Refresh Recommendation
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    {isLoadingRec ? (
                      <div className="space-y-2">
                        <div className="h-4 bg-muted/30 rounded animate-pulse w-3/4 mx-auto" />
                        <div className="h-4 bg-muted/30 rounded animate-pulse w-1/2 mx-auto" />
                        <p className="text-xs text-muted-foreground mt-3">AI is analysing the board…</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-3">
                          {isRodsPick ? "It's your pick! Get an AI recommendation." : "Get AI analysis for the current board state."}
                        </p>
                        <Button
                          onClick={handleGetRecommendation}
                          disabled={contextQuery.isLoading}
                          className={isRodsPick ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                        >
                          {isRodsPick ? "⚡ Get My Pick" : "🤖 Analyse Board"}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Positional Needs */}
            {ctx && ctx.positionalNeeds.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Roster Needs</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {ctx.positionalNeeds.slice(0, 6).map((need) => (
                        <Tooltip key={need.position}>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help">
                              <Badge className={`text-[10px] px-1.5 py-0 border w-10 justify-center ${POS_COLORS[need.position] ?? "bg-muted/30"}`}>
                                {need.position}
                              </Badge>
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    need.urgency === "critical" ? "bg-red-500" :
                                    need.urgency === "high" ? "bg-orange-500" :
                                    need.urgency === "medium" ? "bg-yellow-500" : "bg-green-500"
                                  }`}
                                  style={{ width: `${need.urgencyScore}%` }}
                                />
                              </div>
                            <span className="text-xs text-muted-foreground w-16 text-right">
                              {need.currentCount}/{need.targetCount} filled
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">{need.position} — {need.urgency}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{need.reasoning}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Position Run Alert */}
            {ctx?.positionRun && (
              <Card className="border-orange-500/50 bg-orange-500/5">
                <CardContent className="px-4 py-3">
                  <p className="text-xs font-semibold text-orange-400">🏃 Position Run Detected</p>
                  <p className="text-xs text-muted-foreground mt-1">{ctx.positionRun.alert}</p>
                </CardContent>
              </Card>
            )}

            {/* Owner Tendencies */}
            {ctx && ctx.ownerTendencies.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Owner Tendencies</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ScrollArea className="h-52">
                    <div className="space-y-2 pr-2">
                      {ctx.ownerTendencies.map((owner) => (
                        <Tooltip key={owner.teamId}>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-help px-2 py-1.5 rounded hover:bg-muted/30 transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{owner.ownerName}</p>
                                <p className="text-[10px] text-muted-foreground">{owner.gmArchetype}</p>
                              </div>
                              <div className="flex gap-1 flex-wrap justify-end">
                                {owner.predictedPositions.slice(0, 2).map(pos => (
                                  <Badge key={pos} className={`text-[10px] px-1 py-0 border ${POS_COLORS[pos] ?? "bg-muted/30"}`}>
                                    {pos}
                                  </Badge>
                                ))}
                              </div>
                              {owner.nextPickOverall && (
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  #{owner.nextPickOverall}
                                </span>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="font-medium">{owner.ownerName}</p>
                            <p className="text-xs text-muted-foreground">{owner.gmArchetype}</p>
                            <Separator className="my-1" />
                            <p className="text-xs">Reach positions: {owner.reachPositions.join(", ") || "none"}</p>
                            <p className="text-xs">Value positions: {owner.valuePositions.join(", ") || "none"}</p>
                            <p className="text-xs">Keeper rate: {Math.round(owner.keeperRate * 100)}%</p>
                            <p className="text-xs">Tilt score: {owner.tiltScore}/100</p>
                            <p className="text-xs mt-1 font-medium">Likely next: {owner.predictedPositions.join(", ")}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}

            {/* Rod's Roster */}
            {rodRoster.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold">Your Roster ({rodRoster.length} picks)</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="space-y-1">
                    {rodRoster.map((slot, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-xs text-muted-foreground w-12">Rd {slot.round}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 border ${POS_COLORS[slot.position] ?? "bg-muted/30"}`}>
                          {slot.position}
                        </Badge>
                        <span className="flex-1 truncate text-xs">{slot.playerName}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
