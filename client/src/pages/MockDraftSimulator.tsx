// FILE: client/src/pages/MockDraftSimulator.tsx
// Opponent-Aware Mock Draft Simulator
// - AI opponents = real league owners from 2025 draft order
// - AI picks driven by DNA archetype + historical biases
// - Keepers pre-selected from offseason engine, manually overridable before draft starts
import { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Search, Play, RotateCcw, Trophy, Undo2, FastForward, Zap, Save,
  CheckCircle2, TrendingDown, TrendingUp, ChevronDown, Lock, Unlock, User,
  Pause, PlayCircle, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MergedPlayer } from "../../../server/fantasyDataService";

const TOTAL_ROUNDS = 15;

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

const ARCHETYPE_COLORS: Record<string, string> = {
  "Dealmaker": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Trade Shark": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Waiver Grinder": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Set & Forget": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "Positional Fanatic": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Balanced Manager": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

type DraftPick = {
  round: number;
  pick: number;
  isOverride?: boolean;
  overall: number;
  owner: string;
  player: MergedPlayer;
  isKeeper?: boolean;
};

type MockOwner = {
  teamId: number;
  teamName: string;
  ownerName: string;
  draftSlot: number;
  isRod: boolean;
  gmArchetype: string;
  draftStyleBadge: string;
  reachPositions: string[];
  valuePositions: string[];
  biasVsLeague: Record<string, number>;
  round1Distribution: Record<string, number>;
  keeperRate: number;
  tiltScore: number;
  exploitabilityScore: number;
  recommendedKeeper: {
    playerId: number;
    playerName: string;
    position: string;
    roundCost: number;
    roundSavings: number;
    valueTier: string;
  } | null;
  allKeeperOptions: Array<{
    playerId: number;
    playerName: string;
    position: string;
    roundCost: number;
    roundSavings: number;
    valueTier: string;
  }>;
  keeperPrediction: string;
};

type KeeperOverride = {
  playerId: number | null;
  playerName: string;
  position: string;
  roundCost: number;
};

/**
 * DNA-aware AI pick logic.
 * Uses biasVsLeague (rounds earlier/later than avg) and tiltScore (noise) to
 * simulate realistic draft behavior for each archetype.
 */
function pickForAI(
  owner: MockOwner,
  round: number,
  available: MergedPlayer[],
  alreadyPicked: Set<number>
): MergedPlayer | null {
  const pool = available.filter((p) => !alreadyPicked.has(p.fpId));
  if (pool.length === 0) return null;

  const r1Dist = owner.round1Distribution ?? {};
  const r1Total = Object.values(r1Dist).reduce((a, b) => a + b, 0) || 1;
  const posWeights: Record<string, number> = {};
  for (const [pos, cnt] of Object.entries(r1Dist)) {
    posWeights[pos] = (cnt as number) / r1Total;
  }

  for (const [pos, bias] of Object.entries(owner.biasVsLeague ?? {})) {
    const b = bias as number;
    if (b > 1.5) posWeights[pos] = (posWeights[pos] ?? 0.1) * (1 + b * 0.15);
    if (b < -1.5) posWeights[pos] = (posWeights[pos] ?? 0.1) * (1 - Math.abs(b) * 0.1);
  }

  const arch = owner.gmArchetype ?? "";
  if (arch === "Waiver Grinder" && round >= 10) {
    posWeights["RB"] = (posWeights["RB"] ?? 0.2) * 1.4;
  }
  if (arch === "Positional Fanatic" && owner.reachPositions.length > 0) {
    for (const pos of owner.reachPositions) {
      posWeights[pos] = (posWeights[pos] ?? 0.1) * 1.5;
    }
  }

  if (round === 1) {
    const rb1Pct = (r1Dist["RB"] ?? 0) / r1Total;
    const wr1Pct = (r1Dist["WR"] ?? 0) / r1Total;
    if (rb1Pct > 0.5) posWeights["RB"] = (posWeights["RB"] ?? 0) + 0.5;
    if (wr1Pct > 0.5) posWeights["WR"] = (posWeights["WR"] ?? 0) + 0.5;
  }
  if (round <= 3 && (owner.biasVsLeague?.["QB"] ?? 0) > 2) {
    posWeights["QB"] = (posWeights["QB"] ?? 0) + 0.4;
  }
  if (round <= 4 && (owner.biasVsLeague?.["TE"] ?? 0) > 2) {
    posWeights["TE"] = (posWeights["TE"] ?? 0) + 0.3;
  }

  const noiseFactor = (owner.tiltScore ?? 50) / 400;

  const scored = pool.slice(0, 40).map((p) => {
    const pw = posWeights[p.position] ?? 0.08;
    const noise = Math.random() * noiseFactor;
    const ecrPenalty = p.ecrRank / 600;
    return { player: p, score: pw + noise - ecrPenalty };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.player ?? pool[0];
}

function gradeRoster(picks: DraftPick[]): { grade: string; avgEcr: number; totalVbd: number } {
  if (picks.length === 0) return { grade: "—", avgEcr: 0, totalVbd: 0 };
  const nonKeeper = picks.filter(p => !p.isKeeper);
  const avgEcr = nonKeeper.length > 0
    ? nonKeeper.reduce((s, p) => s + p.player.ecrRank, 0) / nonKeeper.length
    : picks.reduce((s, p) => s + p.player.ecrRank, 0) / picks.length;
  const totalVbd = picks.reduce((s, p) => s + (p.player.pfr2025?.vbd ?? 0), 0);
  let surplus = 0;
  for (const pick of nonKeeper) {
    surplus += pick.overall - pick.player.ecrRank;
  }
  const avgSurplus = nonKeeper.length > 0 ? surplus / nonKeeper.length : 0;
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
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [draftComplete, setDraftComplete] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [manualPickMode, setManualPickMode] = useState(false);
  const [currentOverall, setCurrentOverall] = useState(1);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [savedDraftId, setSavedDraftId] = useState<number | null>(null);
  const [keeperOverrides, setKeeperOverrides] = useState<Record<number, KeeperOverride>>({});
  const [keeperDropdownOpen, setKeeperDropdownOpen] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideQuery, setOverrideQuery] = useState("");
  const [pendingAIPick, setPendingAIPick] = useState<{ player: MergedPlayer; teamIdx: number } | null>(null);
  const autoRunRef = useRef(false);
  const wasAutoRunningRef = useRef(false);

  const { data: boardData, isLoading: boardLoading } = trpc.draftBoard.getPlayers.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 }
  );
  const { data: setupData, isLoading: setupLoading } = trpc.draftBoard.mockSetup.useQuery(
    undefined,
    { staleTime: 10 * 60 * 1000 }
  );

  const owners: MockOwner[] = useMemo(() => {
    if (!setupData?.owners) return [];
    return setupData.owners as unknown as MockOwner[];
  }, [setupData]);

  const totalTeams = (setupData?.totalTeams as number | undefined) ?? (owners.length || 14);

  const rodSlotIndex = useMemo(() => {
    const idx = owners.findIndex(o => o.isRod);
    return idx >= 0 ? idx : 0;
  }, [owners]);

  const initializedRef = useRef(false);
  useMemo(() => {
    if (owners.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      const init: Record<number, KeeperOverride> = {};
      for (const o of owners) {
        if (o.recommendedKeeper) {
          init[o.teamId] = {
            playerId: o.recommendedKeeper.playerId,
            playerName: o.recommendedKeeper.playerName,
            position: o.recommendedKeeper.position,
            roundCost: o.recommendedKeeper.roundCost,
          };
        } else {
          init[o.teamId] = { playerId: null, playerName: "No keeper", position: "", roundCost: 0 };
        }
      }
      setKeeperOverrides(init);
    }
  }, [owners]);

  const snakeOrder = useMemo(() => {
    const order: number[] = [];
    for (let r = 0; r < TOTAL_ROUNDS; r++) {
      const round = r % 2 === 0
        ? Array.from({ length: totalTeams }, (_, i) => i)
        : Array.from({ length: totalTeams }, (_, i) => totalTeams - 1 - i);
      order.push(...round);
    }
    return order;
  }, [totalTeams]);

  const keeperPlayerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const ov of Object.values(keeperOverrides)) {
      if (ov.playerId !== null) ids.add(ov.playerId);
    }
    return ids;
  }, [keeperOverrides]);

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
  const currentRound = Math.ceil(currentOverall / totalTeams);
  const isRodsTurn = currentPickTeamIdx === rodSlotIndex && !draftComplete;

  const buildKeeperPlayer = useCallback((ov: KeeperOverride): MergedPlayer | null => {
    if (!ov.playerId || !boardData?.players) return null;
    const norm = ov.playerName.toLowerCase().replace(/[*+'.]/g, "").trim();
    const found = boardData.players.find(p =>
      p.name.toLowerCase().replace(/[*+'.]/g, "").trim() === norm ||
      (p.shortName && p.shortName.toLowerCase().replace(/[*+'.]/g, "").trim() === norm)
    );
    if (found) return found;
    return {
      fpId: ov.playerId,
      name: ov.playerName,
      shortName: ov.playerName,
      team: "?",
      position: ov.position,
      byeWeek: null,
      ecrRank: 999,
      ecrMin: 999,
      ecrMax: 999,
      ecrAvg: 999,
      ecrStd: 0,
      posRank: "",
      tier: 99,
      adp: null,
      adpRank: null,
      ecrAdpGap: null,
      ownedPct: 0,
    } as MergedPlayer;
  }, [boardData]);

  const buildInitialKeeperPicks = useCallback((): DraftPick[] => {
    const keeperPicks: DraftPick[] = [];
    for (let slotIdx = 0; slotIdx < owners.length; slotIdx++) {
      const owner = owners[slotIdx];
      const ov = keeperOverrides[owner.teamId];
      if (!ov || ov.playerId === null) continue;
      const player = buildKeeperPlayer(ov);
      if (!player) continue;
      const round = Math.max(1, ov.roundCost || 1);
      const roundStart = (round - 1) * totalTeams;
      const isEvenRound = round % 2 === 0;
      const pickInRound = isEvenRound ? totalTeams - slotIdx : slotIdx + 1;
      const overall = roundStart + pickInRound;
      keeperPicks.push({
        round,
        pick: pickInRound,
        overall,
        owner: owner.ownerName,
        player,
        isKeeper: true,
      });
    }
    return keeperPicks;
  }, [owners, keeperOverrides, buildKeeperPlayer, totalTeams]);

  const makeAIPick = useCallback((
    overallSlot: number,
    currentPicks: DraftPick[],
    allPlayers: MergedPlayer[]
  ): DraftPick | null => {
    const teamIdx = snakeOrder[overallSlot - 1] ?? 0;
    if (teamIdx === rodSlotIndex) return null;
    const owner = owners[teamIdx];
    if (!owner) return null;
    const pickedSet = new Set(currentPicks.map((p) => p.player.fpId));
    const available = allPlayers.filter((p) => !pickedSet.has(p.fpId) && !keeperPlayerIds.has(p.fpId));
    const round = Math.ceil(overallSlot / totalTeams);
    const alreadyFilled = currentPicks.some(p => p.overall === overallSlot);
    if (alreadyFilled) return null;
    const player = pickForAI(owner, round, available, pickedSet);
    if (!player) return null;
    return {
      round,
      pick: (overallSlot - 1) % totalTeams + 1,
      overall: overallSlot,
      owner: owner.ownerName,
      player,
    };
  }, [snakeOrder, rodSlotIndex, owners, keeperPlayerIds, totalTeams]);

  const draftStarted = picks.length > 0 || currentOverall > 1;

  const handleStartDraft = useCallback(() => {
    const keeperPicks = buildInitialKeeperPicks();
    setPicks(keeperPicks);
    setCurrentOverall(1);
    setDraftComplete(false);
    setSearchQuery("");
    setManualPickMode(false);
  }, [buildInitialKeeperPicks]);

  const handleRodPick = useCallback((player: MergedPlayer) => {
    if (!isRodsTurn) return;
    const rodOwner = owners[rodSlotIndex];
    const pick: DraftPick = {
      round: currentRound,
      pick: (currentOverall - 1) % totalTeams + 1,
      overall: currentOverall,
      owner: rodOwner?.ownerName ?? "Rod",
      player,
    };
    setPicks((prev) => [...prev, pick]);
    setSearchQuery("");
    setManualPickMode(false);
    const next = currentOverall + 1;
    if (next > totalTeams * TOTAL_ROUNDS) setDraftComplete(true);
    else setCurrentOverall(next);
  }, [isRodsTurn, owners, rodSlotIndex, currentRound, currentOverall, totalTeams]);

  // Compute the AI's intended pick for the current slot (used by pause/override)
  const computeAIIntendedPick = useCallback((): { player: MergedPlayer; teamIdx: number } | null => {
    if (!boardData || isRodsTurn || draftComplete) return null;
    let slot = currentOverall;
    const totalSlots = totalTeams * TOTAL_ROUNDS;
    while (slot <= totalSlots) {
      const alreadyFilled = picks.some(p => p.overall === slot);
      if (alreadyFilled) { slot++; continue; }
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) return null;
      const pick = makeAIPick(slot, picks, boardData.players);
      if (pick) return { player: pick.player, teamIdx };
      slot++;
    }
    return null;
  }, [boardData, isRodsTurn, draftComplete, currentOverall, picks, snakeOrder, rodSlotIndex, makeAIPick, totalTeams]);

  const handleTogglePause = useCallback(() => {
    if (isPaused) {
      // Resume — clear override mode and pending pick
      setIsPaused(false);
      setOverrideMode(false);
      setOverrideQuery("");
      setPendingAIPick(null);
    } else {
      // Pause — compute the AI's intended pick so we can show it
      const intended = computeAIIntendedPick();
      setPendingAIPick(intended);
      setIsPaused(true);
      setOverrideMode(false);
      setOverrideQuery("");
    }
  }, [isPaused, computeAIIntendedPick]);

  const handleLetAIPick = useCallback(() => {
    if (!pendingAIPick || !boardData) return;
    const slot = currentOverall;
    const teamIdx = snakeOrder[slot - 1] ?? 0;
    const owner = owners[teamIdx];
    const round = Math.ceil(slot / totalTeams);
    const pick: DraftPick = {
      round,
      pick: (slot - 1) % totalTeams + 1,
      overall: slot,
      owner: owner?.ownerName ?? "AI",
      player: pendingAIPick.player,
    };
    setPicks((prev) => [...prev, pick]);
    setCurrentOverall(slot + 1);
    setIsPaused(false);
    setOverrideMode(false);
    setOverrideQuery("");
    setPendingAIPick(null);
  }, [pendingAIPick, boardData, currentOverall, snakeOrder, owners, totalTeams]);

  const handleOverridePick = useCallback((player: MergedPlayer) => {
    const slot = currentOverall;
    const teamIdx = snakeOrder[slot - 1] ?? 0;
    const owner = owners[teamIdx];
    const round = Math.ceil(slot / totalTeams);
    const pick: DraftPick = {
      round,
      pick: (slot - 1) % totalTeams + 1,
      overall: slot,
      owner: owner?.ownerName ?? "AI",
      player,
      isOverride: true,
    };
    setPicks((prev) => [...prev, pick]);
    setCurrentOverall(slot + 1);
    setIsPaused(false);
    setOverrideMode(false);
    setOverrideQuery("");
    setPendingAIPick(null);
    toast.success(`Override: ${owner?.ownerName ?? "AI"} takes ${player.name}`);
  }, [currentOverall, snakeOrder, owners, totalTeams]);

  const overrideSearchResults = useMemo(() => {
    if (!overrideQuery.trim() || overrideQuery.length < 2) return [];
    const q = overrideQuery.toLowerCase();
    return availablePlayers
      .filter((p) => !keeperPlayerIds.has(p.fpId) && p.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [availablePlayers, overrideQuery, keeperPlayerIds]);

  const handleAutoAdvance = useCallback(() => {
    if (isRodsTurn || draftComplete || !boardData || isPaused) return;
    let slot = currentOverall;
    while (slot <= totalTeams * TOTAL_ROUNDS) {
      const alreadyFilled = picks.some(p => p.overall === slot);
      if (alreadyFilled) { slot++; continue; }
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) break;
      const pick = makeAIPick(slot, picks, boardData.players);
      if (!pick) { slot++; continue; }
      setPicks((prev) => [...prev, pick]);
      setCurrentOverall(slot + 1);
      return;
    }
    setCurrentOverall(slot);
  }, [isRodsTurn, draftComplete, boardData, currentOverall, picks, snakeOrder, rodSlotIndex, makeAIPick, totalTeams, isPaused]);

  const handleAutoDraftToMyPick = useCallback(() => {
    if (!boardData || draftComplete || isPaused) return;
    setIsAutoRunning(true);
    autoRunRef.current = true;
    let slot = currentOverall;
    let currentPicksList = [...picks];
    const allPlayers = boardData.players;
    const totalSlots = totalTeams * TOTAL_ROUNDS;
    while (slot <= totalSlots) {
      const alreadyFilled = currentPicksList.some(p => p.overall === slot);
      if (alreadyFilled) { slot++; continue; }
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) break;
      const pick = makeAIPick(slot, currentPicksList, allPlayers);
      if (!pick) { slot++; continue; }
      currentPicksList = [...currentPicksList, pick];
      slot++;
    }
    if (slot > totalSlots) setDraftComplete(true);
    setPicks(currentPicksList);
    setCurrentOverall(slot);
    setIsAutoRunning(false);
    autoRunRef.current = false;
  }, [boardData, draftComplete, currentOverall, picks, snakeOrder, rodSlotIndex, makeAIPick, totalTeams]);

  const handleDraftAllRemaining = useCallback(() => {
    if (!boardData || draftComplete || isPaused) return;
    setIsAutoRunning(true);
    let slot = currentOverall;
    let currentPicksList = [...picks];
    const allPlayers = boardData.players;
    const totalSlots = totalTeams * TOTAL_ROUNDS;
    while (slot <= totalSlots) {
      const alreadyFilled = currentPicksList.some(p => p.overall === slot);
      if (alreadyFilled) { slot++; continue; }
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) {
        const pickedSet = new Set(currentPicksList.map((p) => p.player.fpId));
        const available = allPlayers.filter((p) => !pickedSet.has(p.fpId) && !keeperPlayerIds.has(p.fpId));
        const player = available[0];
        if (!player) break;
        const round = Math.ceil(slot / totalTeams);
        const rodOwner = owners[rodSlotIndex];
        currentPicksList = [...currentPicksList, {
          round,
          pick: (slot - 1) % totalTeams + 1,
          overall: slot,
          owner: rodOwner?.ownerName ?? "Rod",
          player,
        }];
        slot++;
      } else {
        const pick = makeAIPick(slot, currentPicksList, allPlayers);
        if (!pick) { slot++; continue; }
        currentPicksList = [...currentPicksList, pick];
        slot++;
      }
    }
    setPicks(currentPicksList);
    setCurrentOverall(Math.min(slot, totalSlots + 1));
    setDraftComplete(true);
    setIsAutoRunning(false);
  }, [boardData, draftComplete, currentOverall, picks, snakeOrder, rodSlotIndex, makeAIPick, owners, keeperPlayerIds, totalTeams]);

  const handleReset = useCallback(() => {
    setPicks([]);
    setCurrentOverall(1);
    setDraftComplete(false);
    setSearchQuery("");
    setManualPickMode(false);
    setIsAutoRunning(false);
    setExpandedTeam(null);
    autoRunRef.current = false;
    wasAutoRunningRef.current = false;
    setSavedDraftId(null);
    setIsPaused(false);
    setOverrideMode(false);
    setOverrideQuery("");
    setPendingAIPick(null);
    initializedRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    const lastNonKeeper = [...picks].reverse().find(p => !p.isKeeper);
    if (!lastNonKeeper) return;
    const idx = picks.lastIndexOf(lastNonKeeper);
    setPicks((prev) => prev.filter((_, i) => i !== idx));
    setCurrentOverall(lastNonKeeper.overall);
    setDraftComplete(false);
    setSearchQuery("");
    setManualPickMode(false);
  }, [picks]);

  const rodOwner = owners[rodSlotIndex];
  const rodPicks = useMemo(
    () => picks.filter((p) => p.owner === (rodOwner?.ownerName ?? "Rod")),
    [picks, rodOwner]
  );
  const rodGrade = useMemo(() => gradeRoster(rodPicks), [rodPicks]);

  const allTeamRosters = useMemo(() => {
    if (!draftComplete || owners.length === 0) return [];
    return owners.map((owner) => {
      const teamPicks = picks.filter((p) => p.owner === owner.ownerName);
      const grade = gradeRoster(teamPicks);
      return { owner, picks: teamPicks, grade, isRod: owner.isRod };
    }).sort((a, b) => {
      if (a.isRod) return -1;
      if (b.isRod) return 1;
      return a.grade.avgEcr - b.grade.avgEcr;
    });
  }, [draftComplete, owners, picks]);

  const [bestAvailPos, setBestAvailPos] = useState<string>("ALL");
  const bestAvailablePlayers = useMemo(() => {
    const pool = bestAvailPos === "ALL"
      ? availablePlayers
      : availablePlayers.filter((p) => p.position === bestAvailPos);
    return [...pool]
      .filter(p => !keeperPlayerIds.has(p.fpId))
      .sort((a, b) => {
        const gapA = a.ecrAdpGap ?? 0;
        const gapB = b.ecrAdpGap ?? 0;
        if (gapB !== gapA) return gapB - gapA;
        return a.ecrRank - b.ecrRank;
      })
      .slice(0, 8);
  }, [availablePlayers, bestAvailPos, keeperPlayerIds]);

  const saveDraftMutation = trpc.draftBoard.saveDraft.useMutation({
    onSuccess: (data) => {
      setSavedDraftId(data.id);
      toast.success("Draft saved! View it in Draft History.");
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const handleSaveDraft = useCallback(() => {
    if (!draftComplete || rodPicks.length === 0) return;
    saveDraftMutation.mutate({
      draftSlot: rodOwner?.draftSlot ?? 1,
      grade: rodGrade.grade,
      avgEcr: rodGrade.avgEcr,
      totalVbd: rodGrade.totalVbd,
      rodPicksJson: rodPicks as unknown as Record<string, unknown>[],
      allPicksJson: picks as unknown as Record<string, unknown>[],
    });
  }, [draftComplete, rodPicks, picks, rodOwner, rodGrade, saveDraftMutation]);

  const isLoading = boardLoading || setupLoading;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Opponent-Aware Mock Draft</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalTeams}-team snake draft · AI opponents use real DNA tendencies · Keepers pre-locked from offseason engine
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={picks.filter(p => !p.isKeeper).length === 0 || isAutoRunning}
            className="gap-2"
          >
            <Undo2 className="w-4 h-4" /> Undo Pick
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isAutoRunning} className="gap-2">
            <RotateCcw className="w-4 h-4" /> Reset
          </Button>
        </div>
      </div>

      {/* Setup screen */}
      {!draftStarted && !draftComplete && (
        <div className="space-y-4">
          <Card className="border-slate-700/50 bg-slate-800/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                2026 Draft Setup — Keeper Locks
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Keepers are pre-selected from the offseason engine. Use each team&apos;s dropdown to change or remove their keeper before the draft starts.
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {isLoading && (
                <p className="text-muted-foreground text-sm">Loading league data…</p>
              )}
              {!isLoading && owners.length === 0 && (
                <p className="text-muted-foreground text-sm">No league data found. Refresh ESPN data first.</p>
              )}
              {!isLoading && owners.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-2 pb-1 border-b border-slate-700/50">
                    <div className="col-span-1 text-center">Slot</div>
                    <div className="col-span-3">Owner</div>
                    <div className="col-span-2">Archetype</div>
                    <div className="col-span-6">Keeper (editable)</div>
                  </div>
                  {owners.map((owner) => {
                    const ov = keeperOverrides[owner.teamId];
                    const isOpen = keeperDropdownOpen === owner.teamId;
                    const archetypeColor = ARCHETYPE_COLORS[owner.gmArchetype] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
                    return (
                      <div
                        key={owner.teamId}
                        className={cn(
                          "grid grid-cols-12 gap-2 items-start px-2 py-2 rounded-lg transition-colors",
                          owner.isRod ? "bg-primary/10 border border-primary/30" : "hover:bg-slate-800/50"
                        )}
                      >
                        <div className="col-span-1 flex items-center justify-center">
                          <span className={cn(
                            "text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center",
                            owner.isRod ? "bg-primary text-primary-foreground" : "bg-slate-700 text-slate-300"
                          )}>
                            {owner.draftSlot}
                          </span>
                        </div>
                        <div className="col-span-3 flex items-center gap-1 min-w-0">
                          {owner.isRod && <User className="w-3 h-3 text-primary shrink-0" />}
                          <div className="min-w-0">
                            <p className={cn("text-sm font-medium truncate", owner.isRod ? "text-primary" : "text-foreground")}>
                              {owner.ownerName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{owner.teamName}</p>
                          </div>
                        </div>
                        <div className="col-span-2 flex items-start pt-0.5">
                          <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-5 truncate max-w-full", archetypeColor)}>
                            {owner.gmArchetype}
                          </Badge>
                        </div>
                        <div className="col-span-6 relative">
                          <button
                            onClick={() => setKeeperDropdownOpen(isOpen ? null : owner.teamId)}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border text-sm transition-colors",
                              ov?.playerId
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                                : "border-slate-600 bg-slate-800/50 text-slate-400 hover:bg-slate-700/50"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {ov?.playerId ? (
                                <>
                                  <Lock className="w-3 h-3 shrink-0 text-amber-400" />
                                  <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-4 shrink-0", POS_COLORS[ov.position] ?? "")}>
                                    {ov.position}
                                  </Badge>
                                  <span className="truncate">{ov.playerName}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">Rd {ov.roundCost}</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3 h-3 shrink-0" />
                                  <span>No keeper — all players in pool</span>
                                </>
                              )}
                            </div>
                            <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", isOpen && "rotate-180")} />
                          </button>
                          {isOpen && (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                              <button
                                onClick={() => {
                                  setKeeperOverrides(prev => ({
                                    ...prev,
                                    [owner.teamId]: { playerId: null, playerName: "No keeper", position: "", roundCost: 0 },
                                  }));
                                  setKeeperDropdownOpen(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
                              >
                                <Unlock className="w-3 h-3" />
                                No keeper — return all to pool
                              </button>
                              {owner.allKeeperOptions.map(opt => (
                                <button
                                  key={opt.playerId}
                                  onClick={() => {
                                    setKeeperOverrides(prev => ({
                                      ...prev,
                                      [owner.teamId]: {
                                        playerId: opt.playerId,
                                        playerName: opt.playerName,
                                        position: opt.position,
                                        roundCost: opt.roundCost,
                                      },
                                    }));
                                    setKeeperDropdownOpen(null);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-800 transition-colors",
                                    ov?.playerId === opt.playerId ? "bg-slate-800" : ""
                                  )}
                                >
                                  <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-4 shrink-0", POS_COLORS[opt.position] ?? "")}>
                                    {opt.position}
                                  </Badge>
                                  <span className="flex-1 text-left text-foreground truncate">{opt.playerName}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">Rd {opt.roundCost}</span>
                                  <span className={cn(
                                    "text-xs shrink-0",
                                    opt.roundSavings > 0 ? "text-emerald-400" : opt.roundSavings < 0 ? "text-red-400" : "text-slate-500"
                                  )}>
                                    {opt.roundSavings > 0 ? "+" + opt.roundSavings : opt.roundSavings === 0 ? "—" : opt.roundSavings}
                                  </span>
                                  <Badge variant="outline" className={cn(
                                    "text-[10px] px-1 py-0 h-4 shrink-0",
                                    opt.valueTier === "elite" ? "border-yellow-500/40 text-yellow-300" :
                                    opt.valueTier === "good" ? "border-emerald-500/40 text-emerald-300" :
                                    opt.valueTier === "fair" ? "border-blue-500/40 text-blue-300" :
                                    "border-red-500/40 text-red-300"
                                  )}>
                                    {opt.valueTier}
                                  </Badge>
                                  {ov?.playerId === opt.playerId && (
                                    <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />
                                  )}
                                </button>
                              ))}
                              {owner.allKeeperOptions.length === 0 && (
                                <div className="px-3 py-2 text-xs text-muted-foreground">No eligible keepers</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {!isLoading && owners.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <p className="text-xs text-muted-foreground mb-2">AI Behavior Predictions (DNA-driven)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {owners.filter(o => !o.isRod && o.keeperPrediction).slice(0, 6).map(o => (
                      <div key={o.teamId} className="text-xs bg-slate-800/50 rounded-md px-3 py-2">
                        <span className="font-medium text-foreground">{o.ownerName.split(" ")[0]}</span>
                        <span className="text-muted-foreground ml-1">({o.gmArchetype})</span>
                        <p className="text-slate-400 mt-0.5 line-clamp-2">{o.keeperPrediction}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {boardData && (
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30">
                    {boardData.players.length - keeperPlayerIds.size} players in pool
                  </Badge>
                )}
                <Badge variant="outline" className="text-slate-400">
                  {Object.values(keeperOverrides).filter(o => o.playerId !== null).length} keepers locked
                </Badge>
                <Button
                  onClick={handleStartDraft}
                  disabled={isLoading || !boardData || owners.length === 0}
                  className="gap-2"
                >
                  <Play className="w-4 h-4" /> Start Draft
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active draft */}
      {draftStarted && !draftComplete && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Card className={cn(
              "border-2",
              isRodsTurn ? "border-primary bg-primary/10" : "border-slate-700/50 bg-slate-800/30"
            )}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Round {currentRound} · Pick {(currentOverall - 1) % totalTeams + 1} · Overall #{currentOverall}</p>
                    <p className={cn("text-lg font-bold", isRodsTurn ? "text-primary" : "text-foreground")}>
                      {isRodsTurn ? "Your Pick!" : (owners[currentPickTeamIdx]?.ownerName ?? "AI") + " picking…"}
                    </p>
                    {!isRodsTurn && owners[currentPickTeamIdx] && (
                      <p className="text-xs text-muted-foreground">
                        {owners[currentPickTeamIdx].gmArchetype} · Tilt {owners[currentPickTeamIdx].tiltScore}
                      </p>
                    )}
                  </div>
                  {isRodsTurn && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setManualPickMode(!manualPickMode)}
                      className="gap-1 text-xs"
                    >
                      <Search className="w-3 h-3" />
                      {manualPickMode ? "Cancel" : "Search"}
                    </Button>
                  )}
                </div>
                {!isRodsTurn && (
                  <div className="space-y-2">
                    {/* Pause/Override intercept panel */}
                    {isPaused && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs font-semibold text-amber-300">PAUSED — {owners[currentPickTeamIdx]?.ownerName ?? "AI"}&apos;s pick</span>
                        </div>
                        {pendingAIPick && !overrideMode && (
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/60">
                            <span className="text-xs text-muted-foreground shrink-0">AI would pick:</span>
                            <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-4 shrink-0", POS_COLORS[pendingAIPick.player.position] ?? "")}>
                              {pendingAIPick.player.position}
                            </Badge>
                            <span className="text-sm text-foreground truncate flex-1">{pendingAIPick.player.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">ECR #{pendingAIPick.player.ecrRank}</span>
                          </div>
                        )}
                        {!overrideMode ? (
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" onClick={handleLetAIPick} className="gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-foreground">
                              <PlayCircle className="w-3 h-3" /> Let AI Pick
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setOverrideMode(true); setOverrideQuery(""); }} className="gap-1 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
                              <Search className="w-3 h-3" /> Override Pick
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-amber-300 font-medium">Choose a player for {owners[currentPickTeamIdx]?.ownerName ?? "AI"}:</span>
                              <button onClick={() => { setOverrideMode(false); setOverrideQuery(""); }} className="text-xs text-muted-foreground hover:text-foreground ml-auto">Cancel</button>
                            </div>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Search player to override…"
                                value={overrideQuery}
                                onChange={(e) => setOverrideQuery(e.target.value)}
                                className="pl-9 h-8 text-xs bg-slate-800/50 border-slate-700"
                                autoFocus
                              />
                            </div>
                            <div className="space-y-0.5 max-h-48 overflow-y-auto">
                              {overrideSearchResults.map((p) => (
                                <div
                                  key={p.fpId}
                                  className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-700 transition-colors"
                                  onClick={() => handleOverridePick(p)}
                                >
                                  <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-4 shrink-0", POS_COLORS[p.position] ?? "")}>
                                    {p.position}
                                  </Badge>
                                  <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{p.team}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">#{p.ecrRank}</span>
                                </div>
                              ))}
                              {overrideQuery.length >= 2 && overrideSearchResults.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">No players found</p>
                              )}
                              {overrideQuery.length < 2 && (
                                <p className="text-xs text-muted-foreground text-center py-2">Type at least 2 characters to search</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Normal AI controls */}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleTogglePause}
                        disabled={isAutoRunning}
                        className={cn(
                          "gap-1 text-xs",
                          isPaused ? "border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/15" : "border-slate-600"
                        )}
                      >
                        {isPaused ? <><PlayCircle className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Pause</>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleAutoAdvance} disabled={isAutoRunning || isPaused} className="gap-1 text-xs">
                        <ChevronDown className="w-3 h-3" /> Next Pick
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleAutoDraftToMyPick} disabled={isAutoRunning || isPaused} className="gap-1 text-xs">
                        <FastForward className="w-3 h-3" /> To My Pick
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleDraftAllRemaining} disabled={isAutoRunning || isPaused} className="gap-1 text-xs">
                        <Zap className="w-3 h-3" /> Finish Draft
                      </Button>
                    </div>
                  </div>
                )}
                {rodPicks.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
                    <span className="text-xs text-muted-foreground">Rod&apos;s grade:</span>
                    <span className={cn("text-xl font-black", GRADE_COLORS[rodGrade.grade] ?? "text-foreground")}>
                      {rodGrade.grade}
                    </span>
                    <span className="text-xs text-muted-foreground">Avg ECR {rodGrade.avgEcr.toFixed(0)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Best Available</span>
                  <div className="flex gap-1 flex-wrap">
                    {["ALL", "QB", "RB", "WR", "TE", "K", "DST"].map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setBestAvailPos(pos)}
                        className={cn(
                          "text-xs px-2 py-0.5 rounded border transition-colors",
                          bestAvailPos === pos
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-slate-700 text-slate-400 hover:border-slate-500 bg-transparent"
                        )}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Gap = ADP − ECR · green = value, red = reach</p>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1">
                {bestAvailablePlayers.map((p) => {
                  const gap = p.ecrAdpGap ?? 0;
                  const isValue = gap >= 5;
                  const isReach = gap <= -5;
                  return (
                    <div
                      key={p.fpId}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded transition-colors group",
                        isRodsTurn ? "cursor-pointer hover:bg-slate-700 active:scale-[0.98]" : "opacity-60 cursor-default",
                        isRodsTurn && isValue && "hover:bg-emerald-900/30"
                      )}
                      onClick={() => isRodsTurn && handleRodPick(p)}
                    >
                      <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{p.ecrRank}</span>
                      <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[p.position] ?? "")}>
                        {p.position}
                      </Badge>
                      <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{p.team}</span>
                      <span className={cn(
                        "text-xs font-medium flex items-center gap-0.5 shrink-0",
                        isValue ? "text-emerald-400" : isReach ? "text-red-400" : "text-slate-500"
                      )}>
                        {isValue && <TrendingDown className="w-3 h-3" />}
                        {isReach && <TrendingUp className="w-3 h-3" />}
                        {gap > 0 ? "+" + gap : gap === 0 ? "—" : gap}
                      </span>
                    </div>
                  );
                })}
                {bestAvailablePlayers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No players available</p>
                )}
              </CardContent>
            </Card>

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

          <div className="lg:col-span-2 space-y-4">
            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  {rodOwner?.ownerName ?? "Rod"}&apos;s Roster ({rodPicks.length} picks)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {rodPicks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No picks yet</p>
                )}
                <div className="space-y-1">
                  {rodPicks.map((pick) => {
                    const surplus = pick.overall - pick.player.ecrRank;
                    return (
                      <div key={pick.overall} className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded",
                        pick.isKeeper ? "bg-amber-500/10 border border-amber-500/20" : ""
                      )}>
                        <span className="text-xs text-muted-foreground w-12 shrink-0">
                          {pick.isKeeper ? <Lock className="w-3 h-3 inline text-amber-400" /> : "Rd " + pick.round}
                        </span>
                        <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[pick.player.position] ?? "")}>
                          {pick.player.position}
                        </Badge>
                        <span className="text-sm text-foreground truncate flex-1">{pick.player.name}</span>
                        {pick.isKeeper ? (
                          <span className="text-xs text-amber-400 shrink-0">KEEPER</span>
                        ) : (
                          <span className={cn(
                            "text-xs font-medium shrink-0",
                            surplus >= 5 ? "text-emerald-400" : surplus <= -5 ? "text-red-400" : "text-muted-foreground"
                          )}>
                            {surplus > 0 ? "+" + surplus : surplus}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Picks</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1">
                {[...picks].reverse().slice(0, 10).map((pick) => (
                  <div key={pick.overall + "-" + pick.player.fpId} className={cn(
                    "flex items-center gap-2 px-2 py-1 rounded text-xs",
                    pick.owner === (rodOwner?.ownerName ?? "Rod") ? "bg-primary/10" : ""
                  )}>
                    <span className="text-muted-foreground w-8 shrink-0">{"#" + pick.overall}</span>
                    <Badge variant="outline" className={cn("px-1 py-0 h-4 text-[10px] shrink-0", POS_COLORS[pick.player.position] ?? "")}>
                      {pick.player.position}
                    </Badge>
                    <span className="text-foreground truncate flex-1">{pick.player.name}</span>
                    <span className="text-muted-foreground shrink-0 truncate max-w-[80px]">{pick.owner.split(" ")[0]}</span>
                    {pick.isKeeper && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                  </div>
                ))}
                {picks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Draft has not started</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Post-draft report */}
      {draftComplete && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-xl font-bold text-foreground">Draft Complete</h2>
              <p className="text-sm text-muted-foreground">
                {rodOwner?.ownerName ?? "Rod"}&apos;s grade:{" "}
                <span className={cn("font-black text-lg", GRADE_COLORS[rodGrade.grade] ?? "")}>
                  {rodGrade.grade}
                </span>
                {" · Avg ECR " + rodGrade.avgEcr.toFixed(0) + " · VBD " + rodGrade.totalVbd}
              </p>
            </div>
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              All Teams — Draft Grades
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {allTeamRosters.map(({ owner, picks: teamPicks, grade, isRod }) => (
                <Card
                  key={owner.teamId}
                  className={cn(
                    "border cursor-pointer transition-colors",
                    isRod ? "border-primary/40 bg-primary/5" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
                  )}
                  onClick={() => setExpandedTeam(expandedTeam === owner.ownerName ? null : owner.ownerName)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isRod && <span className="text-xs text-primary font-semibold shrink-0">YOU</span>}
                        <span className="text-sm font-medium text-foreground truncate">{owner.ownerName}</span>
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
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(["QB", "RB", "WR", "TE", "K", "DST"] as const).map((pos) => {
                        const count = teamPicks.filter((p) => p.player.position === pos).length;
                        if (count === 0) return null;
                        return (
                          <span key={pos} className={cn("text-xs px-1.5 py-0.5 rounded border", POS_COLORS[pos])}>
                            {pos + " x" + count}
                          </span>
                        );
                      })}
                    </div>
                    {expandedTeam === owner.ownerName && (
                      <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-1">
                        {teamPicks.map((pick) => (
                          <div key={pick.overall} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-10 shrink-0">
                              {pick.isKeeper ? "KEEP" : "Rd " + pick.round}
                            </span>
                            <Badge variant="outline" className={cn("px-1 py-0 h-4 text-[10px] shrink-0", POS_COLORS[pick.player.position] ?? "")}>
                              {pick.player.position}
                            </Badge>
                            <span className="text-foreground truncate flex-1">{pick.player.name}</span>
                            {!pick.isKeeper && (
                              <span className={cn(
                                "shrink-0 font-medium",
                                (pick.overall - pick.player.ecrRank) >= 5 ? "text-emerald-400" :
                                (pick.overall - pick.player.ecrRank) <= -5 ? "text-red-400" : "text-muted-foreground"
                              )}>
                                {(pick.overall - pick.player.ecrRank) > 0
                                  ? "+" + (pick.overall - pick.player.ecrRank)
                                  : (pick.overall - pick.player.ecrRank)}
                              </span>
                            )}
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
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={handleReset} variant="outline" className="gap-2">
              <RotateCcw className="w-4 h-4" /> Run Another Mock Draft
            </Button>
            {savedDraftId ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Draft saved (ID #{savedDraftId}) — view in Draft History
              </div>
            ) : (
              <Button
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending || !draftComplete}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="w-4 h-4" />
                {saveDraftMutation.isPending ? "Saving…" : "Save Draft Results"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
