// FILE: client/src/pages/MockDraftSimulator.tsx
// Opponent-Aware Mock Draft Simulator
// 14-team snake draft where AI opponents draft based on their real historical tendencies.
// Rod picks from his actual draft slot. Post-draft ECR grade.
import { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, Play, RotateCcw, Trophy, ChevronRight, Undo2, FastForward, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MergedPlayer } from "../../../server/fantasyDataService";

const TOTAL_TEAMS = 14;
const TOTAL_ROUNDS = 15;
const ROD_NAME = "Roderick Sellers";

const POS_COLORS: Record<string, string> = {
  QB: "bg-red-500/20 text-red-300 border-red-500/30",
  RB: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  WR: "bg-green-500/20 text-green-300 border-green-500/30",
  TE: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  K: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  DST: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const GRADE_COLORS: Record<string, string> = {
  "A+": "text-yellow-300", A: "text-yellow-400", "A-": "text-yellow-500",
  "B+": "text-green-300", B: "text-green-400", "B-": "text-green-500",
  "C+": "text-blue-300", C: "text-blue-400", "C-": "text-blue-500",
  "D+": "text-orange-300", D: "text-orange-400",
  F: "text-red-400",
};

type DraftPick = { round: number; pick: number; overall: number; owner: string; player: MergedPlayer };
type OwnerTendency = {
  memberId: string;
  name: string;
  topPositions: { pos: string; count: number; pct: number }[];
  byRound: Record<number, Record<string, number>>;
  draftStyle: string;
  rb1Pct: number;
  wr1Pct: number;
  earlyQbPct: number;
  earlyTePct: number;
};

function pickForAI(
  owner: OwnerTendency,
  round: number,
  available: MergedPlayer[],
  alreadyPicked: Set<number>
): MergedPlayer | null {
  const pool = available.filter((p) => !alreadyPicked.has(p.fpId));
  if (pool.length === 0) return null;

  const roundKey = Math.min(round, 6);
  const roundPrefs: Record<string, number> = (owner.byRound?.[roundKey] ?? {}) as Record<string, number>;
  const totalRoundPicks = Object.values(roundPrefs).reduce((a: number, b: number) => a + b, 0);

  const posWeights: Record<string, number> = {};
  if (totalRoundPicks > 0) {
    for (const [pos, cnt] of Object.entries(roundPrefs)) {
      posWeights[pos] = (cnt as number) / totalRoundPicks;
    }
  }

  if (round <= 3 && owner.earlyQbPct > 30) posWeights["QB"] = (posWeights["QB"] ?? 0) + 0.3;
  if (round <= 3 && owner.earlyTePct > 30) posWeights["TE"] = (posWeights["TE"] ?? 0) + 0.3;
  if (round === 1 && owner.rb1Pct > 50) posWeights["RB"] = (posWeights["RB"] ?? 0) + 0.5;
  if (round === 1 && owner.wr1Pct > 50) posWeights["WR"] = (posWeights["WR"] ?? 0) + 0.5;

  const scored = pool.slice(0, 30).map((p) => {
    const posWeight = posWeights[p.position] ?? 0.1;
    const noise = Math.random() * 0.15;
    return { player: p, score: posWeight + noise - (p.ecrRank / 500) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.player ?? pool[0];
}

function gradeRoster(picks: DraftPick[]): { grade: string; avgEcr: number; totalVbd: number } {
  if (picks.length === 0) return { grade: "—", avgEcr: 0, totalVbd: 0 };
  const avgEcr = picks.reduce((s, p) => s + p.player.ecrRank, 0) / picks.length;
  const totalVbd = picks.reduce((s, p) => s + (p.player.pfr2025?.vbd ?? 0), 0);

  let surplus = 0;
  for (const pick of picks) {
    surplus += pick.overall - pick.player.ecrRank;
  }
  const avgSurplus = surplus / picks.length;

  let grade: string;
  if (avgSurplus >= 15) grade = "A+";
  else if (avgSurplus >= 10) grade = "A";
  else if (avgSurplus >= 6) grade = "A-";
  else if (avgSurplus >= 3) grade = "B+";
  else if (avgSurplus >= 0) grade = "B";
  else if (avgSurplus >= -3) grade = "B-";
  else if (avgSurplus >= -6) grade = "C+";
  else if (avgSurplus >= -10) grade = "C";
  else if (avgSurplus >= -15) grade = "D";
  else grade = "F";

  return { grade, avgEcr, totalVbd };
}

export default function MockDraftSimulator() {
  const [draftSlot, setDraftSlot] = useState(1);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [draftComplete, setDraftComplete] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [manualPickMode, setManualPickMode] = useState(false);
  const [currentOverall, setCurrentOverall] = useState(1);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const autoRunRef = useRef(false);

  const { data: boardData, isLoading: boardLoading } = trpc.draftBoard.getPlayers.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );
  const { data: tendenciesData } = trpc.leagueDraftTendencies.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  });
  const { data: draftOrderData } = trpc.espn.draftOrder.useQuery(
    { season: 2025 },
    { staleTime: 10 * 60 * 1000 }
  );

  const teams = useMemo(() => {
    if (!draftOrderData) return [];
    const raw = (draftOrderData as { draftOrder?: { teamId: number; teamName: string; round: number; pickInRound: number; overall: number }[] }).draftOrder ?? [];
    const seen = new Set<number>();
    const uniqueTeams: { teamId: number; teamName: string; ownerName: string; draftPosition: number }[] = [];
    for (const pick of raw.filter((p) => p.round === 1).sort((a, b) => a.pickInRound - b.pickInRound)) {
      if (!seen.has(pick.teamId)) {
        seen.add(pick.teamId);
        uniqueTeams.push({ teamId: pick.teamId, teamName: pick.teamName, ownerName: pick.teamName, draftPosition: pick.pickInRound });
      }
    }
    return uniqueTeams.slice(0, TOTAL_TEAMS);
  }, [draftOrderData]);

  const rodSlotIndex = useMemo(() => {
    const idx = teams.findIndex((t) => t.ownerName.includes("Rod") || t.ownerName.includes("Roderick"));
    return idx >= 0 ? idx : draftSlot - 1;
  }, [teams, draftSlot]);

  const snakeOrder = useMemo(() => {
    const order: number[] = [];
    for (let r = 0; r < TOTAL_ROUNDS; r++) {
      const round = r % 2 === 0
        ? Array.from({ length: TOTAL_TEAMS }, (_, i) => i)
        : Array.from({ length: TOTAL_TEAMS }, (_, i) => TOTAL_TEAMS - 1 - i);
      order.push(...round);
    }
    return order;
  }, []);

  const pickedIds = useMemo(() => new Set(picks.map((p) => p.player.fpId)), [picks]);

  const availablePlayers = useMemo(() => {
    if (!boardData?.players) return [];
    return boardData.players.filter((p) => !pickedIds.has(p.fpId));
  }, [boardData, pickedIds]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return availablePlayers.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 10);
  }, [availablePlayers, searchQuery]);

  const currentPickTeamIdx = snakeOrder[currentOverall - 1] ?? 0;
  const currentRound = Math.ceil(currentOverall / TOTAL_TEAMS);
  const isRodsTurn = currentPickTeamIdx === rodSlotIndex && !draftComplete;

  const owners: OwnerTendency[] = useMemo(() => {
    if (!tendenciesData) return [];
    const raw = (tendenciesData as { owners?: OwnerTendency[] }).owners ?? [];
    return raw;
  }, [tendenciesData]);

  // Core AI pick logic (pure, uses passed-in state to avoid stale closures)
  const makeAIPick = useCallback((
    overallSlot: number,
    currentPicks: DraftPick[],
    allPlayers: MergedPlayer[]
  ): DraftPick | null => {
    const teamIdx = snakeOrder[overallSlot - 1] ?? 0;
    if (teamIdx === rodSlotIndex) return null; // Rod's turn, skip
    const team = teams[teamIdx];
    if (!team) return null;

    const pickedSet = new Set(currentPicks.map((p) => p.player.fpId));
    const available = allPlayers.filter((p) => !pickedSet.has(p.fpId));
    const round = Math.ceil(overallSlot / TOTAL_TEAMS);

    const owner = owners.find((o) =>
      o.name.toLowerCase().includes(team.ownerName.split(" ")[0].toLowerCase())
    ) ?? owners[teamIdx % owners.length];

    const player = owner
      ? pickForAI(owner, round, available, pickedSet)
      : available[0];

    if (!player) return null;

    return {
      round,
      pick: (overallSlot - 1) % TOTAL_TEAMS + 1,
      overall: overallSlot,
      owner: team.ownerName,
      player,
    };
  }, [snakeOrder, rodSlotIndex, teams, owners]);

  const handleRodPick = useCallback((player: MergedPlayer) => {
    if (!isRodsTurn) return;
    const team = teams[rodSlotIndex];
    const newPick: DraftPick = {
      round: currentRound,
      pick: (currentOverall - 1) % TOTAL_TEAMS + 1,
      overall: currentOverall,
      owner: team?.ownerName ?? ROD_NAME,
      player,
    };
    setPicks((prev) => [...prev, newPick]);
    setCurrentOverall((prev) => prev + 1);
    setSearchQuery("");
    setManualPickMode(false);
    if (currentOverall >= TOTAL_TEAMS * TOTAL_ROUNDS) setDraftComplete(true);
  }, [isRodsTurn, teams, rodSlotIndex, currentRound, currentOverall]);

  // Advance one AI pick
  const handleAutoAdvance = useCallback(() => {
    if (isRodsTurn || draftComplete || !boardData) return;
    const pick = makeAIPick(currentOverall, picks, boardData.players);
    if (!pick) return;
    setPicks((prev) => [...prev, pick]);
    setCurrentOverall((prev) => {
      const next = prev + 1;
      if (next > TOTAL_TEAMS * TOTAL_ROUNDS) setDraftComplete(true);
      return next;
    });
  }, [isRodsTurn, draftComplete, boardData, makeAIPick, currentOverall, picks]);

  // Auto-Draft to My Pick: run all AI picks until it's Rod's turn
  const handleAutoDraftToMyPick = useCallback(() => {
    if (!boardData || draftComplete) return;
    setIsAutoRunning(true);
    autoRunRef.current = true;

    let slot = currentOverall;
    let currentPicksList = [...picks];
    const allPlayers = boardData.players;
    const totalSlots = TOTAL_TEAMS * TOTAL_ROUNDS;

    // Run synchronously until Rod's turn or draft end
    while (slot <= totalSlots) {
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) break; // Stop at Rod's turn
      const pick = makeAIPick(slot, currentPicksList, allPlayers);
      if (!pick) break;
      currentPicksList = [...currentPicksList, pick];
      slot++;
    }

    if (slot > totalSlots) {
      setDraftComplete(true);
    }
    setPicks(currentPicksList);
    setCurrentOverall(slot);
    setIsAutoRunning(false);
    autoRunRef.current = false;
  }, [boardData, draftComplete, currentOverall, picks, snakeOrder, rodSlotIndex, makeAIPick]);

  // Draft All Remaining: AI finishes the entire rest of the draft
  const handleDraftAllRemaining = useCallback(() => {
    if (!boardData || draftComplete) return;
    setIsAutoRunning(true);

    let slot = currentOverall;
    let currentPicksList = [...picks];
    const allPlayers = boardData.players;
    const totalSlots = TOTAL_TEAMS * TOTAL_ROUNDS;

    while (slot <= totalSlots) {
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) {
        // Rod's turn — auto-pick best available for Rod too
        const pickedSet = new Set(currentPicksList.map((p) => p.player.fpId));
        const available = allPlayers.filter((p) => !pickedSet.has(p.fpId));
        const player = available[0];
        if (!player) break;
        const round = Math.ceil(slot / TOTAL_TEAMS);
        const team = teams[rodSlotIndex];
        currentPicksList = [...currentPicksList, {
          round,
          pick: (slot - 1) % TOTAL_TEAMS + 1,
          overall: slot,
          owner: team?.ownerName ?? ROD_NAME,
          player,
        }];
        slot++;
      } else {
        const pick = makeAIPick(slot, currentPicksList, allPlayers);
        if (!pick) break;
        currentPicksList = [...currentPicksList, pick];
        slot++;
      }
    }

    setPicks(currentPicksList);
    setCurrentOverall(Math.min(slot, totalSlots + 1));
    setDraftComplete(true);
    setIsAutoRunning(false);
  }, [boardData, draftComplete, currentOverall, picks, snakeOrder, rodSlotIndex, makeAIPick, teams]);

  const handleReset = useCallback(() => {
    setPicks([]);
    setCurrentOverall(1);
    setDraftComplete(false);
    setSearchQuery("");
    setManualPickMode(false);
    setIsAutoRunning(false);
    setExpandedTeam(null);
    autoRunRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    if (picks.length === 0) return;
    setPicks((prev) => prev.slice(0, -1));
    setCurrentOverall((prev) => Math.max(1, prev - 1));
    setDraftComplete(false);
    setSearchQuery("");
    setManualPickMode(false);
  }, [picks.length]);

  const rodPicks = useMemo(() => picks.filter((p) => p.owner === (teams[rodSlotIndex]?.ownerName ?? ROD_NAME)), [picks, teams, rodSlotIndex]);
  const rodGrade = useMemo(() => gradeRoster(rodPicks), [rodPicks]);

  // Build per-team rosters for the post-draft report
  const allTeamRosters = useMemo(() => {
    if (!draftComplete || teams.length === 0) return [];
    return teams.map((team) => {
      const teamPicks = picks.filter((p) => p.owner === team.ownerName);
      const grade = gradeRoster(teamPicks);
      const isRod = team.ownerName === (teams[rodSlotIndex]?.ownerName ?? ROD_NAME);
      return { team, picks: teamPicks, grade, isRod };
    }).sort((a, b) => {
      // Rod first, then sort by grade
      if (a.isRod) return -1;
      if (b.isRod) return 1;
      return a.grade.avgEcr - b.grade.avgEcr;
    });
  }, [draftComplete, teams, picks, rodSlotIndex]);

  const top5Available = availablePlayers.slice(0, 5);
  const draftStarted = picks.length > 0 || currentOverall > 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Opponent-Aware Mock Draft</h1>
          <p className="text-muted-foreground text-sm mt-1">
            14-team snake draft. AI opponents draft using their real historical tendencies. You pick for Rod.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={picks.length === 0 || isAutoRunning}
            className="gap-2"
            title="Undo last pick"
          >
            <Undo2 className="w-4 h-4" /> Undo Pick
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isAutoRunning} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
        </div>
      </div>

      {/* Setup */}
      {!draftStarted && !draftComplete && (
        <Card className="border-slate-700/50 bg-slate-800/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Draft Setup</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Rod's Draft Slot</label>
                <div className="flex items-center gap-1 flex-wrap">
                  {Array.from({ length: TOTAL_TEAMS }, (_, i) => i + 1).map((slot) => (
                    <Button
                      key={slot}
                      variant={draftSlot === slot ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDraftSlot(slot)}
                      className={cn(
                        "h-8 w-8 p-0 text-xs",
                        draftSlot !== slot && "bg-transparent border-slate-700 text-slate-400"
                      )}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {boardLoading && <p className="text-muted-foreground text-sm">Loading player pool…</p>}
            {!boardLoading && boardData && (
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                  {boardData.players.length} players in pool
                </Badge>
                <Badge variant="outline" className="text-slate-400">
                  {owners.length} AI opponents loaded
                </Badge>
              </div>
            )}
            <Button
              onClick={() => { setCurrentOverall(1); }}
              disabled={boardLoading || !boardData}
              className="gap-2"
            >
              <Play className="w-4 h-4" /> Start Draft
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active draft */}
      {draftStarted && !draftComplete && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Current pick status */}
          <div className="lg:col-span-1 space-y-4">
            <Card className={cn(
              "border-2",
              isRodsTurn ? "border-primary bg-primary/10" : "border-slate-700/50 bg-slate-800/30"
            )}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Round {currentRound} · Pick {(currentOverall - 1) % TOTAL_TEAMS + 1} · Overall #{currentOverall}</span>
                  {isRodsTurn && <Badge className="bg-primary text-primary-foreground text-xs">Your Pick!</Badge>}
                </div>
                <p className="font-semibold text-foreground">
                  {isRodsTurn ? "🎯 Rod's Turn" : `${teams[currentPickTeamIdx]?.ownerName ?? "AI"} is picking…`}
                </p>
                {!isRodsTurn && (
                  <div className="space-y-2">
                    <Button size="sm" onClick={handleAutoAdvance} disabled={isAutoRunning} className="w-full gap-2">
                      <ChevronRight className="w-4 h-4" /> Advance (AI picks)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAutoDraftToMyPick}
                      disabled={isAutoRunning}
                      className="w-full gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    >
                      <FastForward className="w-4 h-4" /> Auto-Draft to My Pick
                    </Button>
                  </div>
                )}
                {isRodsTurn && (
                  <div className="space-y-2">
                    <Button size="sm" variant="outline" onClick={() => setManualPickMode(true)} className="w-full gap-2">
                      <Search className="w-4 h-4" /> Search & Pick
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDraftAllRemaining}
                      disabled={isAutoRunning}
                      className="w-full gap-2 border-slate-600 text-slate-400 hover:bg-slate-700/50 text-xs"
                    >
                      <Zap className="w-3 h-3" /> Auto-finish entire draft
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top 5 available */}
            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Available</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1">
                {top5Available.map((p) => (
                  <div
                    key={p.fpId}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded transition-colors",
                      isRodsTurn ? "cursor-pointer hover:bg-slate-700" : "opacity-60"
                    )}
                    onClick={() => isRodsTurn && handleRodPick(p)}
                  >
                    <span className="text-xs text-muted-foreground w-6 text-right">{p.ecrRank}</span>
                    <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[p.position] ?? "")}>
                      {p.position}
                    </Badge>
                    <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.team}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Manual search */}
            {manualPickMode && isRodsTurn && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search player…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 bg-slate-800/50 border-slate-700"
                      autoFocus
                    />
                  </div>
                  {searchResults.map((p) => (
                    <div
                      key={p.fpId}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-700 transition-colors"
                      onClick={() => handleRodPick(p)}
                    >
                      <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[p.position] ?? "")}>
                        {p.position}
                      </Badge>
                      <span className="text-sm text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">ECR #{p.ecrRank}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Rod's picks so far */}
          <div className="lg:col-span-2">
            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  Rod's Roster ({rodPicks.length} picks)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {rodPicks.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center">No picks yet</p>
                ) : (
                  <div className="space-y-1">
                    {rodPicks.map((pick) => (
                      <div key={pick.overall} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-slate-700/30">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">Rd {pick.round} · #{pick.overall}</span>
                        <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[pick.player.position] ?? "")}>
                          {pick.player.position}
                        </Badge>
                        <span className="text-sm font-medium text-foreground flex-1">{pick.player.name}</span>
                        <span className="text-xs text-muted-foreground">{pick.player.team}</span>
                        <span className={cn(
                          "text-xs font-medium",
                          (pick.overall - pick.player.ecrRank) >= 5 ? "text-emerald-400" :
                          (pick.overall - pick.player.ecrRank) <= -5 ? "text-red-400" : "text-muted-foreground"
                        )}>
                          {pick.overall - pick.player.ecrRank > 0 ? `+${pick.overall - pick.player.ecrRank}` : pick.overall - pick.player.ecrRank}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Draft complete — grade report */}
      {draftComplete && (
        <div className="space-y-6">
          {/* Rod's summary card */}
          <Card className="border-emerald-500/30 bg-emerald-500/10">
            <CardContent className="p-6 flex items-center gap-6 flex-wrap">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Draft Grade</p>
                <p className={cn("text-6xl font-black", GRADE_COLORS[rodGrade.grade] ?? "text-foreground")}>
                  {rodGrade.grade}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-emerald-300 font-semibold text-lg">Draft Complete!</p>
                <p className="text-sm text-muted-foreground">
                  Avg ECR of your picks: <span className="text-foreground font-medium">{rodGrade.avgEcr.toFixed(1)}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Total VBD (2025 base): <span className="text-foreground font-medium">{rodGrade.totalVbd}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Grade reflects value extracted vs. draft position (positive = value picks, negative = reaches).
                </p>
              </div>
            </CardContent>
          </Card>

          {/* All 14 teams league-wide summary */}
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              All Teams — Draft Grades
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {allTeamRosters.map(({ team, picks: teamPicks, grade, isRod }) => (
                <Card
                  key={team.teamId}
                  className={cn(
                    "border cursor-pointer transition-colors",
                    isRod ? "border-primary/40 bg-primary/5" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
                  )}
                  onClick={() => setExpandedTeam(expandedTeam === team.ownerName ? null : team.ownerName)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isRod && <span className="text-xs text-primary font-semibold shrink-0">YOU</span>}
                        <span className="text-sm font-medium text-foreground truncate">{team.ownerName}</span>
                      </div>
                      <span className={cn("text-2xl font-black shrink-0", GRADE_COLORS[grade.grade] ?? "text-foreground")}>
                        {grade.grade}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Avg ECR {grade.avgEcr.toFixed(0)}</span>
                      <span>VBD {grade.totalVbd}</span>
                      <span>{teamPicks.length} picks</span>
                    </div>
                    {/* Positional summary pills */}
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(["QB", "RB", "WR", "TE", "K", "DST"] as const).map((pos) => {
                        const count = teamPicks.filter((p) => p.player.position === pos).length;
                        if (count === 0) return null;
                        return (
                          <span key={pos} className={cn("text-xs px-1.5 py-0.5 rounded border", POS_COLORS[pos])}>
                            {pos} ×{count}
                          </span>
                        );
                      })}
                    </div>
                    {/* Expanded roster */}
                    {expandedTeam === team.ownerName && (
                      <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1">
                        {teamPicks.map((pick) => (
                          <div key={pick.overall} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-10 shrink-0">Rd {pick.round}</span>
                            <Badge variant="outline" className={cn("px-1 py-0 h-4 text-[10px] shrink-0", POS_COLORS[pick.player.position] ?? "")}>
                              {pick.player.position}
                            </Badge>
                            <span className="text-foreground truncate flex-1">{pick.player.name}</span>
                            <span className={cn(
                              "shrink-0 font-medium",
                              (pick.overall - pick.player.ecrRank) >= 5 ? "text-emerald-400" :
                              (pick.overall - pick.player.ecrRank) <= -5 ? "text-red-400" : "text-muted-foreground"
                            )}>
                              {pick.overall - pick.player.ecrRank > 0 ? `+${pick.overall - pick.player.ecrRank}` : pick.overall - pick.player.ecrRank}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Click any team card to expand their full roster.</p>
          </div>

          <Button onClick={handleReset} variant="outline" className="gap-2">
            <RotateCcw className="w-4 h-4" /> Run Another Mock Draft
          </Button>
        </div>
      )}
    </div>
  );
}
