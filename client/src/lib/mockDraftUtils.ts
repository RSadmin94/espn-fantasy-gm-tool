/**
 * mockDraftUtils.ts
 *
 * Pure functions extracted from MockDraftSimulator.tsx for unit testing.
 * These functions have no React dependencies and can be tested in isolation.
 *
 * Functions:
 *   calcSurvivalProb  — probability a player survives to Rod's next pick
 *   calcBestFit       — how well a player fits Rod's current roster
 *   calcChampEquityDelta — championship equity delta for drafting a player
 *   calcOpportunityBoard — live exploit opportunities during the draft
 *   calcRunAlerts     — position run detection (4+ picks of same position)
 */

// ─── Shared types (mirrors MockDraftSimulator.tsx) ────────────────────────────

export type MergedPlayerLite = {
  fpId: number;
  playerName: string;
  position: string;
  ecrRank: number;
  adpRank?: number | null;
  ecrAdpGap?: number | null;
  pfr2025?: { vbd?: number } | null;
};

export type DraftPickLite = {
  round: number;
  pick: number;
  overall: number;
  owner: string;
  player: MergedPlayerLite;
  isKeeper?: boolean;
};

export type MockOwnerLite = {
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
  recommendedKeeper: null | {
    playerId: number;
    playerName: string;
    position: string;
    roundCost: number;
    roundSavings: number;
    valueTier: string;
  };
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

export type DraftOpportunity = {
  type: "DESPERATION" | "VALUE_POCKET" | "RUN_EXPLOIT" | "TILT_ALERT";
  urgency: "ACT_NOW" | "THIS_ROUND" | "MONITOR";
  ownerName?: string;
  position?: string;
  title: string;
  detail: string;
};

// ─── calcSurvivalProb ─────────────────────────────────────────────────────────
/**
 * Estimate the probability that a player survives to Rod's next pick.
 * For each AI owner picking before Rod, we compute a rough P(they take this player)
 * using their positional bias and the player's ECR rank.
 */
export function calcSurvivalProb(
  player: MergedPlayerLite,
  picksUntilRod: number,
  ownersBeforeRod: MockOwnerLite[],
  currentPicks: DraftPickLite[],
  allPlayers: MergedPlayerLite[]
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
    const posProb = Math.min(0.9, Math.max(0.05,
      0.15 + (bias > 0 ? bias * 0.08 : 0) + (wantPos ? 0.12 : 0)
    ));
    const rankFactor = posRank <= 3 ? 1.0 : posRank <= 6 ? 0.7 : posRank <= 10 ? 0.4 : 0.2;
    const pThisOwner = posProb * rankFactor;
    if (pThisOwner > 0.15) threats.push(owner.ownerName.split(" ")[0]!);
    pGone = 1 - (1 - pGone) * (1 - pThisOwner);
  }
  const pct = Math.round((1 - pGone) * 100);
  const tooltip = threats.length > 0
    ? `${threats.slice(0, 3).join(", ")} likely need ${player.position} · ${pct}% chance survives`
    : `${pct}% chance survives to your pick`;
  return { pct, tooltip };
}

// ─── calcBestFit ──────────────────────────────────────────────────────────────
/**
 * Score how well a player fits Rod's current roster.
 * Weights: positional need (45%) + ECR value surplus (35%) + positional scarcity (20%)
 */
export function calcBestFit(
  player: MergedPlayerLite,
  rodRoster: DraftPickLite[],
  availablePlayers: MergedPlayerLite[]
): { score: number; reason: string } {
  const posCounts: Record<string, number> = {};
  for (const p of rodRoster) {
    if (!p.isKeeper) posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
  }
  const needed: Record<string, number> = { QB: 1, RB: 3, WR: 3, TE: 1, K: 1, DST: 1 };
  const have = posCounts[player.position] ?? 0;
  const need = needed[player.position] ?? 2;
  const needScore = Math.max(0, Math.min(3, need - have)) / 3;

  const valueSurplus = Math.max(0, (player.ecrAdpGap ?? 0)) / 20;

  const inTop50 = availablePlayers.filter(p => p.position === player.position && p.ecrRank <= 50).length;
  const scarcityScore = Math.max(0, 1 - inTop50 / 8);

  const score = needScore * 0.45 + valueSurplus * 0.35 + scarcityScore * 0.20;

  const reasons: string[] = [];
  if (needScore > 0.5) reasons.push(`Fills ${player.position} gap`);
  if ((player.ecrAdpGap ?? 0) >= 5) reasons.push(`+${player.ecrAdpGap} ECR value`);
  if (inTop50 <= 3) reasons.push(`${player.position} scarce (${inTop50} left)`);
  return { score, reason: reasons.slice(0, 2).join(" · ") || "Solid depth" };
}

// ─── calcChampEquityDelta ─────────────────────────────────────────────────────
/**
 * Returns a +/- percentage point change in title odds if Rod drafts this player.
 * Scale: approximately -5% to +12%.
 */
export function calcChampEquityDelta(
  player: MergedPlayerLite,
  rodRoster: DraftPickLite[],
  availablePlayers: MergedPlayerLite[],
  allOwners: MockOwnerLite[]
): number {
  const rodNonKeeper = rodRoster.filter(p => !p.isKeeper);
  const laterOptions = availablePlayers
    .filter(p => p.position === player.position)
    .slice(1, 6);
  const avgLaterEcr = laterOptions.length > 0
    ? laterOptions.reduce((s, p) => s + p.ecrRank, 0) / laterOptions.length
    : player.ecrRank + 20;
  const ecrImprovement = Math.max(0, avgLaterEcr - player.ecrRank) / 20;

  const posCounts: Record<string, number> = {};
  for (const p of rodNonKeeper) posCounts[p.player.position] = (posCounts[p.player.position] ?? 0) + 1;
  const needed: Record<string, number> = { QB: 1, RB: 3, WR: 3, TE: 1, K: 1, DST: 1 };
  const have = posCounts[player.position] ?? 0;
  const need = needed[player.position] ?? 2;
  const balanceBonus = have < need ? 0.4 : have === need ? 0.1 : 0;

  const posLeft = availablePlayers.filter(p => p.position === player.position && p.ecrRank <= 80).length;
  const scarcityBonus = posLeft <= 3 ? 0.3 : posLeft <= 6 ? 0.15 : 0;

  const leagueAvgEcrAtPos = allOwners.length > 0
    ? allOwners.reduce((s, o) => s + (o.biasVsLeague?.[player.position] ?? 0), 0) / allOwners.length
    : 0;
  const leagueEdge = Math.max(0, leagueAvgEcrAtPos * 0.05);

  const raw = (ecrImprovement * 0.4 + balanceBonus * 0.35 + scarcityBonus * 0.15 + leagueEdge * 0.1);
  return Math.round((raw * 17 - 1) * 10) / 10;
}

// ─── calcOpportunityBoard ─────────────────────────────────────────────────────
/**
 * Computes live exploit opportunities during the draft.
 * Types: DESPERATION, VALUE_POCKET, RUN_EXPLOIT, TILT_ALERT
 */
export function calcOpportunityBoard(
  picks: DraftPickLite[],
  owners: MockOwnerLite[],
  availablePlayers: MergedPlayerLite[],
  currentRound: number,
  rodSlotIndex: number,
  totalTeams: number
): DraftOpportunity[] {
  const opps: DraftOpportunity[] = [];

  // 1. Positional Desperation
  const desperationThresholds: Record<string, number> = { RB: 3, WR: 3, QB: 5, TE: 6 };
  for (let slotIdx = 0; slotIdx < owners.length; slotIdx++) {
    if (slotIdx === rodSlotIndex) continue;
    const owner = owners[slotIdx]!;
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

  // 2. Value Pocket
  const posGroups: Record<string, MergedPlayerLite[]> = {};
  for (const p of availablePlayers.slice(0, 60)) {
    if (!posGroups[p.position]) posGroups[p.position] = [];
    posGroups[p.position]!.push(p);
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

  // 3. Run Exploitation
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

  // 4. Tilt Alert
  const recentPicks = picks.filter(p => !p.isKeeper).slice(-3);
  for (const recentPick of recentPicks) {
    const owner = owners.find(o => o.ownerName === recentPick.owner);
    if (!owner || owner.isRod) continue;
    if ((owner.tiltScore ?? 0) >= 65) {
      const topPos = owner.reachPositions?.[0] ??
        (Object.entries(owner.biasVsLeague ?? {}).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0]);
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

  const urgencyOrder: Record<string, number> = { ACT_NOW: 0, THIS_ROUND: 1, MONITOR: 2 };
  return opps
    .sort((a, b) => urgencyOrder[a.urgency]! - urgencyOrder[b.urgency]!)
    .slice(0, 4);
}

// ─── calcRunAlerts ────────────────────────────────────────────────────────────
/**
 * Detects position runs in the last 12 picks.
 * Returns alerts when 4+ picks of the same position occur in the window.
 */
export type RunAlert = {
  position: string;
  count: number;
  severity: "warning" | "critical";
  message: string;
};

export function calcRunAlerts(picks: DraftPickLite[]): RunAlert[] {
  const RUN_WINDOW = 12;
  const RUN_THRESHOLD = 4;
  const last12 = picks.filter(p => !p.isKeeper).slice(-RUN_WINDOW);
  const counts: Record<string, number> = {};
  for (const p of last12) {
    counts[p.player.position] = (counts[p.player.position] ?? 0) + 1;
  }
  const alerts: RunAlert[] = [];
  for (const [pos, cnt] of Object.entries(counts)) {
    if (cnt >= RUN_THRESHOLD) {
      alerts.push({
        position: pos,
        count: cnt,
        severity: cnt >= 6 ? "critical" : "warning",
        message: cnt >= 6
          ? `${pos} run CRITICAL: ${cnt} in last 12 picks — position severely depleted`
          : `${pos} run: ${cnt} in last 12 picks — consider other positions`,
      });
    }
  }
  return alerts.sort((a, b) => b.count - a.count);
}
