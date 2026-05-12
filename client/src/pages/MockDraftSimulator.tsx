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
  Pause, PlayCircle, AlertCircle, Flame, Target, BarChart3, Eye, ChevronRight,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { MergedPlayer } from "../../../server/fantasyDataService";

const TOTAL_ROUNDS = 15;
const RUN_WINDOW = 12; // picks to scan for position runs
const RUN_THRESHOLD = 4; // min picks of same position to trigger alert

// ── Survival probability ─────────────────────────────────────────────────────
// Estimate the probability that a player survives to Rod's next pick.
// For each AI owner picking before Rod, we compute a rough P(they take this player)
// using their positional bias and the player's ECR rank.
function calcSurvival(
  player: MergedPlayer,
  picksUntilRod: number,
  ownersBeforeRod: MockOwner[],
  currentPicks: DraftPick[],
  allPlayers: MergedPlayer[]
): { pct: number; tooltip: string } {
  if (picksUntilRod <= 0) return { pct: 100, tooltip: "Your pick now" };
  const pickedSet = new Set(currentPicks.map(p => p.player.fpId));
  const available = allPlayers.filter(p => !pickedSet.has(p.fpId));
  const posRank = available.filter(p => p.position === player.position).findIndex(p => p.fpId === player.fpId) + 1;

  let pGone = 0;
  const threats: string[] = [];
  for (const owner of ownersBeforeRod) {
    const bias = owner.biasVsLeague?.[player.position] ?? 0;
    const wantPos = (owner.reachPositions ?? []).includes(player.position);
    // Base probability this owner takes this specific player
    const posProb = Math.min(0.9, Math.max(0.05,
      0.15 + (bias > 0 ? bias * 0.08 : 0) + (wantPos ? 0.12 : 0)
    ));
    // Scale by how high the player is in the position pool
    const rankFactor = posRank <= 3 ? 1.0 : posRank <= 6 ? 0.7 : posRank <= 10 ? 0.4 : 0.2;
    const pThisOwner = posProb * rankFactor;
    if (pThisOwner > 0.15) threats.push(owner.ownerName.split(" ")[0]);
    pGone = 1 - (1 - pGone) * (1 - pThisOwner);
  }
  const pct = Math.round((1 - pGone) * 100);
  const tooltip = threats.length > 0
    ? `${threats.slice(0, 3).join(", ")} likely need ${player.position} · ${pct}% chance survives`
    : `${pct}% chance survives to your pick`;
  return { pct, tooltip };
}

// ── Best Fit scoring ─────────────────────────────────────────────────────────
function calcBestFit(
  player: MergedPlayer,
  rodRoster: DraftPick[],
  availablePlayers: MergedPlayer[]
): { score: number; reason: string } {
  const posCounts: Record<string, number> = {};
  for (const p of rodRoster) {
    if (!p.isKeeper) posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
  }
  // Positional need: 0-3 scale
  const needed: Record<string, number> = { QB: 1, RB: 3, WR: 3, TE: 1, K: 1, DST: 1 };
  const have = posCounts[player.position] ?? 0;
  const need = needed[player.position] ?? 2;
  const needScore = Math.max(0, Math.min(3, need - have)) / 3;

  // ECR value surplus: how much earlier than ADP
  const valueSurplus = Math.max(0, (player.ecrAdpGap ?? 0)) / 20;

  // Positional scarcity: how many of this position remain in top 50
  const inTop50 = availablePlayers.filter(p => p.position === player.position && p.ecrRank <= 50).length;
  const scarcityScore = Math.max(0, 1 - inTop50 / 8);

  const score = needScore * 0.45 + valueSurplus * 0.35 + scarcityScore * 0.20;

  const reasons: string[] = [];
  if (needScore > 0.5) reasons.push(`Fills ${player.position} gap`);
  if ((player.ecrAdpGap ?? 0) >= 5) reasons.push(`+${player.ecrAdpGap} ECR value`);
  if (inTop50 <= 3) reasons.push(`${player.position} scarce (${inTop50} left)`);
  return { score, reason: reasons.slice(0, 2).join(" · ") || "Solid depth" };
}

// ── Championship Equity delta ───────────────────────────────────────────────
// Returns a +/- percentage point change in title odds if Rod drafts this player.
function calcChampEquityDelta(
  player: MergedPlayer,
  rodRoster: DraftPick[],
  availablePlayers: MergedPlayer[],
  allOwners: MockOwner[]
): number {
  // How many non-keeper picks does Rod have so far?
  const rodNonKeeper = rodRoster.filter(p => !p.isKeeper);
  // Avg ECR of available players at this position (what Rod could get later)
  const laterOptions = availablePlayers
    .filter(p => p.position === player.position)
    .slice(1, 6); // skip the player itself (index 0 is this player)
  const avgLaterEcr = laterOptions.length > 0
    ? laterOptions.reduce((s, p) => s + p.ecrRank, 0) / laterOptions.length
    : player.ecrRank + 20;
  const ecrImprovement = Math.max(0, avgLaterEcr - player.ecrRank) / 20; // 0-1

  // Roster balance: does this fill a gap?
  const posCounts: Record<string, number> = {};
  for (const p of rodNonKeeper) posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
  const needed: Record<string, number> = { QB: 1, RB: 3, WR: 3, TE: 1, K: 1, DST: 1 };
  const have = posCounts[player.position] ?? 0;
  const need = needed[player.position] ?? 2;
  const balanceBonus = have < need ? 0.4 : have === need ? 0.1 : 0;

  // Scarcity: fewer options left = higher equity
  const posLeft = availablePlayers.filter(p => p.position === player.position && p.ecrRank <= 80).length;
  const scarcityBonus = posLeft <= 3 ? 0.3 : posLeft <= 6 ? 0.15 : 0;

  // Relative strength vs. league: how does this player's ECR compare to what other teams have at this pos?
  const leagueAvgEcrAtPos = allOwners.length > 0
    ? allOwners.reduce((s, o) => s + (o.biasVsLeague?.[player.position] ?? 0), 0) / allOwners.length
    : 0;
  const leagueEdge = Math.max(0, leagueAvgEcrAtPos * 0.05);

  const raw = (ecrImprovement * 0.4 + balanceBonus * 0.35 + scarcityBonus * 0.15 + leagueEdge * 0.1);
  // Scale to a -5% to +12% range
  return Math.round((raw * 17 - 1) * 10) / 10;
}

// ── Rod Opportunity Board ────────────────────────────────────────────────────
type DraftOpportunity = {
  type: "DESPERATION" | "VALUE_POCKET" | "RUN_EXPLOIT" | "TILT_ALERT";
  urgency: "ACT_NOW" | "THIS_ROUND" | "MONITOR";
  ownerName?: string;
  position?: string;
  title: string;
  detail: string;
};

function calcOpportunityBoard(
  picks: DraftPick[],
  owners: MockOwner[],
  availablePlayers: MergedPlayer[],
  currentRound: number,
  rodSlotIndex: number,
  totalTeams: number
): DraftOpportunity[] {
  const opps: DraftOpportunity[] = [];

  // 1. Positional Desperation: owner has 0 of a key position after round N
  const desperationThresholds: Record<string, number> = { RB: 3, WR: 3, QB: 5, TE: 6 };
  for (let slotIdx = 0; slotIdx < owners.length; slotIdx++) {
    if (slotIdx === rodSlotIndex) continue;
    const owner = owners[slotIdx];
    const teamPicks = picks.filter(p => p.owner === owner.ownerName && !p.isKeeper);
    for (const [pos, threshold] of Object.entries(desperationThresholds)) {
      if (currentRound >= threshold) {
        const hasPos = teamPicks.some(p => p.player.position === pos);
        if (!hasPos) {
          opps.push({
            type: "DESPERATION",
            urgency: currentRound >= threshold + 2 ? "ACT_NOW" : "THIS_ROUND",
            ownerName: owner.ownerName.split(" ")[0],
            position: pos,
            title: `${owner.ownerName.split(" ")[0]} desperate at ${pos}`,
            detail: `No ${pos} through Rd ${currentRound} — expect a reach soon. Draft ${pos} value before they panic.`,
          });
        }
      }
    }
  }

  // 2. Value Pocket: tier of players available 2+ rounds past ADP
  const posGroups: Record<string, MergedPlayer[]> = {};
  for (const p of availablePlayers.slice(0, 60)) {
    if (!posGroups[p.position]) posGroups[p.position] = [];
    posGroups[p.position].push(p);
  }
  for (const [pos, players] of Object.entries(posGroups)) {
    const pocketPlayers = players.filter(p => {
      const adpRound = p.adpRank ? Math.ceil(p.adpRank / totalTeams) : null;
      return adpRound !== null && currentRound > adpRound + 1;
    });
    if (pocketPlayers.length >= 2) {
      opps.push({
        type: "VALUE_POCKET",
        urgency: pocketPlayers.length >= 3 ? "ACT_NOW" : "THIS_ROUND",
        position: pos,
        title: `${pos} value pocket forming`,
        detail: `${pocketPlayers.length} ${pos} players available ${Math.round(pocketPlayers.reduce((s, p) => s + (currentRound - Math.ceil((p.adpRank ?? 0) / totalTeams)), 0) / pocketPlayers.length)}+ rounds past ADP — exploit before others notice.`,
      });
    }
  }

  // 3. Run Exploitation: position run happening = value opening elsewhere
  const last12 = picks.filter(p => !p.isKeeper).slice(-12);
  const runCounts: Record<string, number> = {};
  for (const p of last12) runCounts[p.player.position] = (runCounts[p.player.position] ?? 0) + 1;
  for (const [pos, cnt] of Object.entries(runCounts)) {
    if (cnt >= 4) {
      const otherPositions = ["QB", "RB", "WR", "TE"].filter(p => p !== pos && (runCounts[p] ?? 0) <= 1);
      if (otherPositions.length > 0) {
        opps.push({
          type: "RUN_EXPLOIT",
          urgency: cnt >= 6 ? "ACT_NOW" : "THIS_ROUND",
          position: pos,
          title: `${pos} run — exploit ${otherPositions[0]} value`,
          detail: `${cnt} ${pos}s in last 12 picks. Others overcommitting — ${otherPositions[0]} value opening up. Stay disciplined.`,
        });
      }
    }
  }

  // 4. Tilt Alert: high-tilt owner just missed a target (their top position not taken by them in last 2 picks)
  const recentPicks = picks.filter(p => !p.isKeeper).slice(-3);
  for (const recentPick of recentPicks) {
    const owner = owners.find(o => o.ownerName === recentPick.owner);
    if (!owner || owner.isRod) continue;
    if ((owner.tiltScore ?? 0) >= 65) {
      const topPos = owner.reachPositions?.[0] ?? (Object.entries(owner.biasVsLeague ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0]);
      if (topPos && recentPick.player.position !== topPos) {
        opps.push({
          type: "TILT_ALERT",
          urgency: "THIS_ROUND",
          ownerName: owner.ownerName.split(" ")[0],
          title: `${owner.ownerName.split(" ")[0]} tilt risk`,
          detail: `High tilt score (${owner.tiltScore}) — just missed ${topPos} target. Expect emotional reach next pick.`,
        });
      }
    }
  }

  // Deduplicate and limit to top 4 by urgency
  const urgencyOrder = { ACT_NOW: 0, THIS_ROUND: 1, MONITOR: 2 };
  return opps
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
    .slice(0, 4);
}

// ── Opponent pick prediction ──────────────────────────────────────────────────
function predictNextPick(
  owner: MockOwner,
  currentPicks: DraftPick[],
  allPlayers: MergedPlayer[],
  keeperIds: Set<number>,
  round: number
): { player: MergedPlayer; position: string; confidence: number } | null {
  const pickedSet = new Set(currentPicks.map(p => p.player.fpId));
  const available = allPlayers.filter(p => !pickedSet.has(p.fpId) && !keeperIds.has(p.fpId));
  if (available.length === 0) return null;

  // Score top 30 candidates
  const r1Dist = owner.round1Distribution ?? {};
  const r1Total = Object.values(r1Dist).reduce((a, b) => a + b, 0) || 1;
  const posWeights: Record<string, number> = {};
  for (const [pos, cnt] of Object.entries(r1Dist)) posWeights[pos] = (cnt as number) / r1Total;
  for (const [pos, bias] of Object.entries(owner.biasVsLeague ?? {})) {
    const b = bias as number;
    if (b > 1.5) posWeights[pos] = (posWeights[pos] ?? 0.1) * (1 + b * 0.15);
  }
  if (round <= 3 && (owner.biasVsLeague?.["QB"] ?? 0) > 2) posWeights["QB"] = (posWeights["QB"] ?? 0) + 0.4;
  if (round <= 4 && (owner.biasVsLeague?.["TE"] ?? 0) > 2) posWeights["TE"] = (posWeights["TE"] ?? 0) + 0.3;

  const scored = available.slice(0, 30).map(p => ({
    player: p,
    score: (posWeights[p.position] ?? 0.08) - p.ecrRank / 600,
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return null;

  // Confidence = how dominant the top pick is vs the field
  const topScore = top.score;
  const secondScore = scored[1]?.score ?? 0;
  const confidence = Math.min(95, Math.max(40, Math.round(50 + (topScore - secondScore) * 300)));
  return { player: top.player, position: top.player.position, confidence };
}

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

  const totalTeams = (setupData?.totalTeams as number | undefined) ?? (owners.length > 0 ? owners.length : 14);

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
  const [bestFitMode, setBestFitMode] = useState<"available" | "fit">("available");
  const [showOpponentPredictions, setShowOpponentPredictions] = useState(true);
  const [postDraftSort, setPostDraftSort] = useState<"grade" | "ecr" | "vbd">("grade");
  const [showOpportunityBoard, setShowOpportunityBoard] = useState(true);

  const bestAvailablePlayers = useMemo(() => {
    const pool = bestAvailPos === "ALL"
      ? availablePlayers
      : availablePlayers.filter((p) => p.position === bestAvailPos);
    const filtered = pool.filter(p => !keeperPlayerIds.has(p.fpId));
    if (bestFitMode === "fit") {
      return [...filtered]
        .map(p => ({ p, fit: calcBestFit(p, rodPicks, filtered) }))
        .sort((a, b) => b.fit.score - a.fit.score)
        .slice(0, 8)
        .map(x => x.p);
    }
    return [...filtered]
      .sort((a, b) => {
        const gapA = a.ecrAdpGap ?? 0;
        const gapB = b.ecrAdpGap ?? 0;
        if (gapB !== gapA) return gapB - gapA;
        return a.ecrRank - b.ecrRank;
      })
      .slice(0, 8);
  }, [availablePlayers, bestAvailPos, keeperPlayerIds, bestFitMode, rodPicks]);

  // ── Position Run Alerts ─────────────────────────────────────────────────────
  const runAlerts = useMemo(() => {
    if (!draftStarted) return [];
    const recentPicks = picks.filter(p => !p.isKeeper).slice(-RUN_WINDOW);
    const alerts: Array<{ pos: string; count: number; window: number; urgency: "yellow" | "orange" | "red" }> = [];
    const posCounts: Record<string, number> = {};
    for (const p of recentPicks) {
      posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
    }
    for (const [pos, count] of Object.entries(posCounts)) {
      if (count >= RUN_THRESHOLD) {
        const urgency = count >= 6 ? "red" : count >= 5 ? "orange" : "yellow";
        alerts.push({ pos, count, window: recentPicks.length, urgency });
      }
    }
    // Scarcity alerts: top-5 at position all gone
    if (boardData?.players) {
      const pickedSet = new Set(picks.map(p => p.player.fpId));
      for (const pos of ["QB", "RB", "WR", "TE"]) {
        const top5 = boardData.players.filter(p => p.position === pos).slice(0, 5);
        const allGone = top5.length >= 5 && top5.every(p => pickedSet.has(p.fpId));
        if (allGone) alerts.push({ pos, count: 5, window: 0, urgency: "red" });
      }
    }
    return alerts;
  }, [picks, draftStarted, boardData]);

  // ── Survival probabilities for best available list ──────────────────────────
  const survivals = useMemo(() => {
    if (!boardData || !draftStarted || isRodsTurn) return new Map<number, { pct: number; tooltip: string }>();
    // Find how many picks until Rod's next turn
    let picksUntilRod = 0;
    const ownersBeforeRod: MockOwner[] = [];
    for (let slot = currentOverall; slot <= totalTeams * TOTAL_ROUNDS; slot++) {
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) break;
      if (!picks.some(p => p.overall === slot)) {
        picksUntilRod++;
        const owner = owners[teamIdx];
        if (owner) ownersBeforeRod.push(owner);
      }
    }
    const map = new Map<number, { pct: number; tooltip: string }>();
    for (const p of bestAvailablePlayers) {
      map.set(p.fpId, calcSurvival(p, picksUntilRod, ownersBeforeRod, picks, boardData.players));
    }
    return map;
  }, [boardData, draftStarted, isRodsTurn, currentOverall, totalTeams, snakeOrder, rodSlotIndex, picks, owners, bestAvailablePlayers]);

  // ── Best Fit reasons for display ────────────────────────────────────────────
  const bestFitReasons = useMemo(() => {
    if (!draftStarted || bestFitMode !== "fit" || !boardData) return new Map<number, string>();
    const map = new Map<number, string>();
    const filtered = availablePlayers.filter(p => !keeperPlayerIds.has(p.fpId));
    for (const p of bestAvailablePlayers) {
      const fit = calcBestFit(p, rodPicks, filtered);
      map.set(p.fpId, fit.reason);
    }
    return map;
  }, [draftStarted, bestFitMode, boardData, bestAvailablePlayers, rodPicks, availablePlayers, keeperPlayerIds]);

  // ── Opponent pick predictions ────────────────────────────────────────────────
  const opponentPredictions = useMemo(() => {
    if (!boardData || !draftStarted || isRodsTurn || draftComplete) return [];
    const preds: Array<{ owner: MockOwner; prediction: { player: MergedPlayer; position: string; confidence: number } | null; slot: number }> = [];
    for (let slot = currentOverall; slot <= totalTeams * TOTAL_ROUNDS; slot++) {
      const teamIdx = snakeOrder[slot - 1] ?? 0;
      if (teamIdx === rodSlotIndex) break;
      if (picks.some(p => p.overall === slot)) continue;
      const owner = owners[teamIdx];
      if (!owner) continue;
      const round = Math.ceil(slot / totalTeams);
      const pred = predictNextPick(owner, picks, boardData.players, keeperPlayerIds, round);
      preds.push({ owner, prediction: pred, slot });
      if (preds.length >= 5) break; // show at most 5 upcoming picks
    }
    return preds;
  }, [boardData, draftStarted, isRodsTurn, draftComplete, currentOverall, totalTeams, snakeOrder, rodSlotIndex, picks, owners, keeperPlayerIds]);

  // ── Rod Opportunity Board (live) ─────────────────────────────────────────────────
  const opportunityBoard = useMemo(() => {
    if (!draftStarted || draftComplete || owners.length === 0) return [];
    return calcOpportunityBoard(picks, owners, availablePlayers, currentRound, rodSlotIndex, totalTeams);
  }, [draftStarted, draftComplete, picks, owners, availablePlayers, currentRound, rodSlotIndex, totalTeams]);

  // ── Championship Equity delta map ─────────────────────────────────────────────────
  const champEquityMap = useMemo(() => {
    if (!isRodsTurn || !draftStarted || draftComplete) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const p of bestAvailablePlayers) {
      map.set(p.fpId, calcChampEquityDelta(p, rodPicks, availablePlayers, owners));
    }
    return map;
  }, [isRodsTurn, draftStarted, draftComplete, bestAvailablePlayers, rodPicks, availablePlayers, owners]);

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

            {/* Position Run Alerts */}
            {runAlerts.length > 0 && (
              <div className="space-y-1.5">
                {runAlerts.map((alert, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium",
                    alert.urgency === "red" ? "border-red-500/40 bg-red-500/10 text-red-300" :
                    alert.urgency === "orange" ? "border-orange-500/40 bg-orange-500/10 text-orange-300" :
                    "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
                  )}>
                    <Flame className={cn("w-3.5 h-3.5 shrink-0",
                      alert.urgency === "red" ? "text-red-400" :
                      alert.urgency === "orange" ? "text-orange-400" : "text-yellow-400"
                    )} />
                    {alert.window > 0
                      ? `${alert.pos} Run — ${alert.count} ${alert.pos}s in last ${alert.window} picks`
                      : `${alert.pos} Scarcity — Top 5 all gone`
                    }
                  </div>
                ))}
              </div>
            )}

            {/* Best Available + Best Fit */}
            <Card className="border-slate-700/50 bg-slate-800/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  {/* Mode toggle */}
                  <div className="flex rounded-md overflow-hidden border border-slate-700 shrink-0">
                    <button
                      onClick={() => setBestFitMode("available")}
                      className={cn(
                        "px-2.5 py-1 text-xs transition-colors",
                        bestFitMode === "available" ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-foreground"
                      )}
                    >
                      <BarChart3 className="w-3 h-3 inline mr-1" />Best Avail
                    </button>
                    <button
                      onClick={() => setBestFitMode("fit")}
                      className={cn(
                        "px-2.5 py-1 text-xs transition-colors border-l border-slate-700",
                        bestFitMode === "fit" ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-foreground"
                      )}
                    >
                      <Target className="w-3 h-3 inline mr-1" />Best Fit
                    </button>
                  </div>
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
                <p className="text-xs text-muted-foreground">
                  {bestFitMode === "available" ? "Gap = ADP − ECR · green = value, red = reach" : "Ranked by need + value + scarcity fit for your roster"}
                </p>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1">
                <TooltipProvider delayDuration={200}>
                {bestAvailablePlayers.map((p, idx) => {
                  const gap = p.ecrAdpGap ?? 0;
                  const isValue = gap >= 5;
                  const isReach = gap <= -5;
                  const survival = survivals.get(p.fpId);
                  const fitReason = bestFitReasons.get(p.fpId);
                  const isBestFitTop = bestFitMode === "fit" && idx === 0;
                  const champDelta = champEquityMap.get(p.fpId);
                  return (
                    <div key={p.fpId} className="space-y-0.5">
                      <div
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded transition-colors group",
                          isRodsTurn ? "cursor-pointer hover:bg-slate-700 active:scale-[0.98]" : "opacity-60 cursor-default",
                          isRodsTurn && isValue && "hover:bg-emerald-900/30",
                          isBestFitTop && "ring-1 ring-primary/40 bg-primary/5"
                        )}
                        onClick={() => isRodsTurn && handleRodPick(p)}
                      >
                        <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{p.ecrRank}</span>
                        <Badge variant="outline" className={cn("text-xs px-1 py-0 h-5 shrink-0", POS_COLORS[p.position] ?? "")}>
                          {p.position}
                        </Badge>
                        <span className="text-sm text-foreground truncate flex-1">{p.name}</span>
                        {isBestFitTop && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0 border-primary/40 text-primary">
                            Best Fit
                          </Badge>
                        )}
                        {bestFitMode === "available" && (
                          <span className={cn(
                            "text-xs font-medium flex items-center gap-0.5 shrink-0",
                            isValue ? "text-emerald-400" : isReach ? "text-red-400" : "text-slate-500"
                          )}>
                            {isValue && <TrendingDown className="w-3 h-3" />}
                            {isReach && <TrendingUp className="w-3 h-3" />}
                            {gap > 0 ? "+" + gap : gap === 0 ? "—" : gap}
                          </span>
                        )}
                        {/* Survival probability */}
                        {survival && !isRodsTurn && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 shrink-0 cursor-help">
                                <div className="w-12 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      survival.pct >= 70 ? "bg-emerald-400" :
                                      survival.pct >= 40 ? "bg-yellow-400" : "bg-red-400"
                                    )}
                                    style={{ width: `${survival.pct}%` }}
                                  />
                                </div>
                                <span className={cn(
                                  "text-[10px] font-medium w-8 text-right",
                                  survival.pct >= 70 ? "text-emerald-400" :
                                  survival.pct >= 40 ? "text-yellow-400" : "text-red-400"
                                )}>{survival.pct}%</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[200px] text-xs">
                              {survival.tooltip}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {/* Championship Equity delta */}
                      {champDelta !== undefined && isRodsTurn && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={cn(
                              "text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded border cursor-help",
                              champDelta >= 3 ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" :
                              champDelta >= 0 ? "text-blue-300 bg-blue-500/10 border-blue-500/30" :
                              "text-slate-400 bg-slate-700/30 border-slate-600/30"
                            )}>
                              {champDelta >= 0 ? "+" : ""}{champDelta}% 🏆
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[200px] text-xs">
                            {champDelta >= 3
                              ? `Drafting ${p.name} is estimated to improve your championship odds by ${champDelta}% based on roster fit, positional scarcity, and ECR value.`
                              : champDelta >= 0
                              ? `Modest equity gain — ${p.name} adds value but doesn't dramatically shift title odds.`
                              : `Minimal equity impact — consider positional need before drafting.`
                            }
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {/* Best Fit reason row */}
                      {fitReason && (
                        <p className="text-[10px] text-muted-foreground pl-8 pb-0.5">{fitReason}</p>
                      )}
                    </div>
                  );
                })}
                </TooltipProvider>
                {bestAvailablePlayers.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No players available</p>
                )}
              </CardContent>
            </Card>

            {/* Opponent Pick Predictions */}
            {draftStarted && !isRodsTurn && !draftComplete && opponentPredictions.length > 0 && (
              <Card className="border-slate-700/50 bg-slate-800/30">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Opponent Predictions</span>
                    </div>
                    <button
                      onClick={() => setShowOpponentPredictions(p => !p)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {showOpponentPredictions ? "Hide" : "Show"}
                      <ChevronRight className={cn("w-3 h-3 transition-transform", showOpponentPredictions && "rotate-90")} />
                    </button>
                  </CardTitle>
                </CardHeader>
                {showOpponentPredictions && (
                  <CardContent className="p-3 pt-0 space-y-1.5">
                    {opponentPredictions.map(({ owner, prediction, slot }) => (
                      <div key={slot} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-900/40">
                        <span className="text-xs text-muted-foreground shrink-0 w-14 truncate">{owner.ownerName.split(" ")[0]}</span>
                        {prediction ? (
                          <>
                            <Badge variant="outline" className={cn("text-[10px] px-1 py-0 h-4 shrink-0", POS_COLORS[prediction.position] ?? "")}>
                              {prediction.position}
                            </Badge>
                            <span className="text-xs text-foreground truncate flex-1">{prediction.player.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <div className="w-10 h-1 rounded-full bg-slate-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-cyan-400"
                                  style={{ width: `${prediction.confidence}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-cyan-400 w-7 text-right">{prediction.confidence}%</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unpredictable</span>
                        )}
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground text-center pt-1">Confidence based on DNA archetype + historical bias</p>
                  </CardContent>
                )}
              </Card>
            )}

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

            {/* Rod Opportunity Board */}
            {draftStarted && !draftComplete && opportunityBoard.length > 0 && (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-300">Rod Opportunity Board</span>
                    </div>
                    <button
                      onClick={() => setShowOpportunityBoard(v => !v)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !showOpportunityBoard && "-rotate-90")} />
                    </button>
                  </CardTitle>
                </CardHeader>
                {showOpportunityBoard && (
                  <CardContent className="p-3 pt-0 space-y-2">
                    {opportunityBoard.map((opp, i) => {
                      const urgencyConfig = {
                        ACT_NOW: { label: "Act Now", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
                        THIS_ROUND: { label: "This Round", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
                        MONITOR: { label: "Monitor", cls: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
                      }[opp.urgency];
                      const typeIcon = {
                        DESPERATION: <Flame className="w-3 h-3 text-orange-400" />,
                        VALUE_POCKET: <TrendingDown className="w-3 h-3 text-emerald-400" />,
                        RUN_EXPLOIT: <Zap className="w-3 h-3 text-yellow-400" />,
                        TILT_ALERT: <AlertCircle className="w-3 h-3 text-red-400" />,
                      }[opp.type];
                      return (
                        <div key={i} className="bg-slate-900/40 rounded p-2 space-y-1">
                          <div className="flex items-center gap-1.5">
                            {typeIcon}
                            <span className="text-xs font-semibold text-foreground flex-1">{opp.title}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", urgencyConfig.cls)}>
                              {urgencyConfig.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{opp.detail}</p>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            )}
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
            {/* Sort controls */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                All Teams — Draft Summary
              </h2>
              <div className="flex rounded-md overflow-hidden border border-slate-700 text-xs">
                {(["grade", "ecr", "vbd"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setPostDraftSort(s)}
                    className={cn(
                      "px-2.5 py-1 transition-colors border-l border-slate-700 first:border-l-0",
                      postDraftSort === s ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-foreground"
                    )}
                  >
                    {s === "grade" ? "Grade" : s === "ecr" ? "Avg ECR" : "VBD"}
                  </button>
                ))}
              </div>
            </div>

            {/* Championship Equity League Comparison */}
            {allTeamRosters.length > 0 && (() => {
              // Compute a simple championship equity score per team based on avg ECR + VBD
              const champScores = allTeamRosters.map(t => {
                const nonKeeper = t.picks.filter(p => !p.isKeeper);
                const avgEcr = nonKeeper.length > 0
                  ? nonKeeper.reduce((s, p) => s + p.player.ecrRank, 0) / nonKeeper.length
                  : 999;
                const vbd = t.picks.reduce((s, p) => s + (p.player.pfr2025?.vbd ?? 0), 0);
                // Lower avg ECR = better; higher VBD = better
                const score = Math.max(0, 100 - avgEcr * 0.5 + vbd * 0.1);
                return { ownerName: t.owner.ownerName, teamName: t.owner.teamName, isRod: t.isRod, score };
              });
              const maxScore = Math.max(...champScores.map(s => s.score), 1);
              const rodScore = champScores.find(s => s.isRod);
              const rodRank = [...champScores].sort((a, b) => b.score - a.score).findIndex(s => s.isRod) + 1;
              return (
                <div className="mb-4 p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      Championship Equity — League Comparison
                    </h3>
                    {rodScore && (
                      <span className="text-xs text-muted-foreground">
                        Rod ranked <span className={cn("font-bold", rodRank <= 3 ? "text-emerald-400" : rodRank <= 7 ? "text-yellow-400" : "text-red-400")}>
                          #{rodRank}
                        </span> of {champScores.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {[...champScores]
                      .sort((a, b) => b.score - a.score)
                      .map((s, i) => (
                        <div key={s.ownerName} className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] w-4 text-right shrink-0",
                            i === 0 ? "text-amber-400 font-bold" : "text-muted-foreground"
                          )}>#{i + 1}</span>
                          <span className={cn(
                            "text-xs w-24 truncate shrink-0",
                            s.isRod ? "text-primary font-semibold" : "text-foreground"
                          )}>{s.ownerName.split(" ")[0]}</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-700/50 overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                s.isRod ? "bg-primary" :
                                i === 0 ? "bg-amber-400" :
                                i <= 2 ? "bg-emerald-500" : "bg-slate-500"
                              )}
                              style={{ width: `${Math.round((s.score / maxScore) * 100)}%` }}
                            />
                          </div>
                          <span className={cn(
                            "text-[10px] w-8 text-right shrink-0",
                            s.isRod ? "text-primary" : "text-muted-foreground"
                          )}>{Math.round(s.score)}</span>
                        </div>
                      ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Score = 100 − (avg ECR × 0.5) + (VBD × 0.1) — higher is better
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[...allTeamRosters]
                .sort((a, b) => {
                  if (a.isRod) return -1;
                  if (b.isRod) return 1;
                  if (postDraftSort === "grade") {
                    const gradeOrder = ["A+","A","A-","B+","B","B-","C+","C","C-","D","F"];
                    return gradeOrder.indexOf(a.grade.grade) - gradeOrder.indexOf(b.grade.grade);
                  }
                  if (postDraftSort === "ecr") return a.grade.avgEcr - b.grade.avgEcr;
                  return b.grade.totalVbd - a.grade.totalVbd;
                })
                .map(({ owner, picks: teamPicks, grade, isRod }) => {
                  const nonKeeperPicks = teamPicks.filter(p => !p.isKeeper);
                  // Best value: highest (pick slot - ECR rank) = drafted later than ECR suggests
                  const bestValue = nonKeeperPicks.length > 0
                    ? nonKeeperPicks.reduce((best, p) => {
                        const gap = p.overall - p.player.ecrRank;
                        return gap > (best.overall - best.player.ecrRank) ? p : best;
                      })
                    : null;
                  // Biggest reach: lowest (pick slot - ECR rank)
                  const biggestReach = nonKeeperPicks.length > 0
                    ? nonKeeperPicks.reduce((worst, p) => {
                        const gap = p.overall - p.player.ecrRank;
                        return gap < (worst.overall - worst.player.ecrRank) ? p : worst;
                      })
                    : null;
                  // Positional strengths/weaknesses by avg ECR of non-keeper picks
                  const posByAvgEcr: Array<{ pos: string; avgEcr: number; count: number }> = [];
                  for (const pos of ["QB", "RB", "WR", "TE"]) {
                    const posPlayers = nonKeeperPicks.filter(p => p.player.position === pos);
                    if (posPlayers.length > 0) {
                      const avg = posPlayers.reduce((s, p) => s + p.player.ecrRank, 0) / posPlayers.length;
                      posByAvgEcr.push({ pos, avgEcr: avg, count: posPlayers.length });
                    }
                  }
                  posByAvgEcr.sort((a, b) => a.avgEcr - b.avgEcr);
                  const strengths = posByAvgEcr.slice(0, 2).map(p => p.pos);
                  const weaknesses = posByAvgEcr.slice(-2).reverse().map(p => p.pos);
                  const keeperPicks = teamPicks.filter(p => p.isKeeper);

                  return (
                    <Card
                      key={owner.teamId}
                      className={cn(
                        "border cursor-pointer transition-colors",
                        isRod ? "border-primary/40 bg-primary/5" : "border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50"
                      )}
                      onClick={() => setExpandedTeam(expandedTeam === owner.ownerName ? null : owner.ownerName)}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isRod && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">YOU</span>}
                              <span className="text-sm font-semibold text-foreground truncate">{owner.ownerName}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-600 text-slate-400">
                                {owner.gmArchetype ?? "Unknown"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{teamPicks.length} picks</span>
                            </div>
                          </div>
                          <span className={cn("text-3xl font-black shrink-0 leading-none", GRADE_COLORS[grade.grade] ?? "text-foreground")}>
                            {grade.grade}
                          </span>
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-slate-900/40 rounded p-1.5">
                            <div className="text-xs font-semibold text-foreground">{grade.avgEcr.toFixed(0)}</div>
                            <div className="text-[10px] text-muted-foreground">Avg ECR</div>
                          </div>
                          <div className="bg-slate-900/40 rounded p-1.5">
                            <div className="text-xs font-semibold text-foreground">{grade.totalVbd}</div>
                            <div className="text-[10px] text-muted-foreground">VBD</div>
                          </div>
                          <div className="bg-slate-900/40 rounded p-1.5">
                            <div className="text-xs font-semibold text-foreground">{keeperPicks.length}</div>
                            <div className="text-[10px] text-muted-foreground">Keepers</div>
                          </div>
                        </div>

                        {/* Position counts */}
                        <div className="flex gap-1 flex-wrap">
                          {(["QB", "RB", "WR", "TE", "K", "DST"] as const).map((pos) => {
                            const count = teamPicks.filter((p) => p.player.position === pos).length;
                            if (count === 0) return null;
                            return (
                              <span key={pos} className={cn("text-[10px] px-1.5 py-0.5 rounded border", POS_COLORS[pos])}>
                                {pos} ×{count}
                              </span>
                            );
                          })}
                        </div>

                        {/* Strengths / Weaknesses */}
                        {(strengths.length > 0 || weaknesses.length > 0) && (
                          <div className="grid grid-cols-2 gap-2">
                            {strengths.length > 0 && (
                              <div className="bg-emerald-900/20 border border-emerald-500/20 rounded p-1.5">
                                <div className="text-[10px] text-emerald-400 font-medium mb-0.5">Strengths</div>
                                <div className="text-xs text-foreground">{strengths.join(", ")}</div>
                              </div>
                            )}
                            {weaknesses.length > 0 && (
                              <div className="bg-red-900/20 border border-red-500/20 rounded p-1.5">
                                <div className="text-[10px] text-red-400 font-medium mb-0.5">Weaknesses</div>
                                <div className="text-xs text-foreground">{weaknesses.join(", ")}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Best value / Biggest reach */}
                        <div className="space-y-1">
                          {bestValue && (bestValue.overall - bestValue.player.ecrRank) >= 5 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <TrendingDown className="w-3 h-3 text-emerald-400 shrink-0" />
                              <span className="text-emerald-400 font-medium shrink-0">Value:</span>
                              <span className="text-foreground truncate">{bestValue.player.name}</span>
                              <span className="text-emerald-400 shrink-0 ml-auto">+{bestValue.overall - bestValue.player.ecrRank}</span>
                            </div>
                          )}
                          {biggestReach && (biggestReach.overall - biggestReach.player.ecrRank) <= -5 && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <TrendingUp className="w-3 h-3 text-red-400 shrink-0" />
                              <span className="text-red-400 font-medium shrink-0">Reach:</span>
                              <span className="text-foreground truncate">{biggestReach.player.name}</span>
                              <span className="text-red-400 shrink-0 ml-auto">{biggestReach.overall - biggestReach.player.ecrRank}</span>
                            </div>
                          )}
                        </div>

                        {/* Keeper badges */}
                        {keeperPicks.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {keeperPicks.map(kp => (
                              <div key={kp.overall} className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                                <Lock className="w-2.5 h-2.5 text-amber-400" />
                                <span className="text-[10px] text-amber-300">{kp.player.name.split(" ").slice(-1)[0]}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Expand indicator */}
                        <div className="flex items-center justify-center pt-1">
                          <ChevronDown className={cn(
                            "w-3.5 h-3.5 text-muted-foreground transition-transform",
                            expandedTeam === owner.ownerName && "rotate-180"
                          )} />
                        </div>

                        {/* Expanded full roster */}
                        {expandedTeam === owner.ownerName && (
                          <div className="pt-2 border-t border-slate-700/50 space-y-0.5">
                            {teamPicks
                              .slice()
                              .sort((a, b) => {
                                const posOrder: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DST: 5 };
                                const pa = posOrder[a.player.position] ?? 9;
                                const pb = posOrder[b.player.position] ?? 9;
                                return pa !== pb ? pa - pb : a.player.ecrRank - b.player.ecrRank;
                              })
                              .map((pick) => {
                                const surplus = pick.overall - pick.player.ecrRank;
                                return (
                                  <div key={pick.overall} className={cn(
                                    "flex items-center gap-2 text-xs px-1 py-1 rounded",
                                    pick.isKeeper ? "bg-amber-500/10" : ""
                                  )}>
                                    <span className="text-muted-foreground w-10 shrink-0 text-[10px]">
                                      {pick.isKeeper ? "KEEP" : "Rd " + pick.round}
                                    </span>
                                    <Badge variant="outline" className={cn("px-1 py-0 h-4 text-[10px] shrink-0", POS_COLORS[pick.player.position] ?? "")}>
                                      {pick.player.position}
                                    </Badge>
                                    <span className="text-foreground truncate flex-1">{pick.player.name}</span>
                                    {pick.isKeeper ? (
                                      <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                    ) : (
                                      <span className={cn(
                                        "shrink-0 font-medium text-[10px]",
                                        surplus >= 5 ? "text-emerald-400" :
                                        surplus <= -5 ? "text-red-400" : "text-muted-foreground"
                                      )}>
                                        {surplus > 0 ? "+" + surplus : surplus === 0 ? "—" : surplus}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Click any team card to expand their full roster sorted by position.</p>
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
