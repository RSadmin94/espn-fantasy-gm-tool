
// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1.75 — DRAFT BOARD PRESSURE ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PositionRunAlert {
  position:        string;
  expectedRound:   number;
  roundWindow:     string;           // e.g. "Rounds 2-4"
  affectedOwners:  string[];
  teamCount:       number;
  confidence:      number;
  triggerPicks:    string[];         // Evidence: which picks in mock draft trigger this
  urgencyCount:    number;           // teams with CRITICAL/HIGH need
  evidence:        string[];
}

export interface ScarcityAlert {
  position:       string;
  totalPool:      number;
  eliteSupply:    number;            // players projected above starter threshold
  demandScore:    number;            // 0.0+ (>1.0 = demand > elite supply)
  urgency:        "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  startersNeeded: number;            // league-wide starters required
  remainingAfterRound: Record<number, number>; // projected remaining supply by round
  evidence:       string[];
}

export interface KeeperCompressionResult {
  position:         string;
  totalPoolSize:     number;
  keepersAtPosition: number;
  compressionPct:    number;         // % of pool locked by keepers
  draftInflation:   number;         // rounds earlier you need to draft (0.0–2.0)
  effectiveTier:    string;         // "HEAVY" / "MODERATE" / "LIGHT" / "NONE"
  evidence:         string[];
}

export interface PressureByRound {
  round:          number;
  positionPressure: Record<string, number>; // 0-100 pressure score per position
  hottestPosition: string;
  hottestScore:   number;
  evidence:       string[];
}

export interface DraftEnvironmentDashboard {
  strongestPosition: { position: string; reason: string; supplyScore: number };
  weakestPosition:   { position: string; reason: string; scarcityScore: number };
  biggestRunRisk:    { position: string; expectedRound: number; teamCount: number; reason: string };
  biggestValuePocket:{ position: string; round: number; reason: string; playersAvailable: number };
  mostDistortedByKeepers: { position: string; compressionPct: number; reason: string };
  leagueDepthGrade:  Record<string, "A" | "B" | "C" | "D" | "F">;
}

// ── Starter threshold by position ─────────────────────────────────────────────
// A player is "elite supply" if projected above this threshold
const STARTER_THRESHOLD: Record<string, number> = {
  QB: 350, RB: 180, WR: 160, TE: 100, K: 90, DEF: 80,
};

// Expected round-by-round pick rate (how many picks of this pos per round of 14)
const POS_PICKS_PER_ROUND: Record<string, number[]> = {
  QB:  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  RB:  [5, 4, 4, 3, 2, 2, 2, 1, 1, 1, 1, 1, 0, 0],
  WR:  [5, 5, 4, 4, 3, 2, 2, 2, 1, 1, 1, 1, 0, 0],
  TE:  [1, 1, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0],
  K:   [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 1, 0, 0],
  DEF: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 0],
};

// ── Keeper Compression ────────────────────────────────────────────────────────

export function calcKeeperCompression(
  keeperPredictions: any[],
  playerPool: Array<{ name: string; position: string; projectedPoints: number }>,
): KeeperCompressionResult[] {
  const positions = ["QB", "RB", "WR", "TE", "K"]; // DEF excluded: league uses DL/LB/DB individuals
  const results: KeeperCompressionResult[] = [];

  // Count keepers per position (only those with known position)
  const keptByPos: Record<string, string[]> = {};
  for (const kp of keeperPredictions) {
    const pos = kp.position as string;
    if (pos === "?" || !pos) continue;
    if (!keptByPos[pos]) keptByPos[pos] = [];
    keptByPos[pos].push(kp.predictedPlayer);
  }

  // Unknown-position keepers — estimate by distributing to most likely positions
  const unknownCount = keeperPredictions.filter(k => k.position === "?" || !k.position).length;

  for (const pos of positions) {
    const poolSize = playerPool.filter(p => p.position === pos).length;
    const kept     = (keptByPos[pos] ?? []).length;
    // Allocate unknown keepers proportionally (rough estimate)
    const unknownShare = unknownCount > 0
      ? Math.round((unknownCount * (POS_PICKS_PER_ROUND[pos]?.[0] ?? 0) / 14))
      : 0;
    const totalKept = kept + unknownShare;

    const compressionPct = poolSize > 0 ? Math.round((totalKept / poolSize) * 100 * 10) / 10 : 0;

    // Draft inflation: how many rounds earlier must you draft to avoid scarcity
    const inflation = compressionPct > 15 ? 2.0
                    : compressionPct > 8  ? 1.5
                    : compressionPct > 3  ? 1.0
                    : compressionPct > 0  ? 0.5
                    : 0;

    const tier = compressionPct > 15 ? "HEAVY"
               : compressionPct > 8  ? "MODERATE"
               : compressionPct > 3  ? "LIGHT"
               : "NONE";

    results.push({
      position: pos,
      totalPoolSize: poolSize,
      keepersAtPosition: totalKept,
      compressionPct,
      draftInflation: inflation,
      effectiveTier: tier,
      evidence: [
        `${totalKept} known/estimated ${pos} keeper(s) out of ${poolSize} in player pool`,
        compressionPct > 0
          ? `${compressionPct}% of ${pos} pool locked by keepers → draft ${inflation} round(s) earlier`
          : `No keeper compression for ${pos}`,
        unknownShare > 0 ? `${unknownShare} unknown-position keeper(s) estimated as ${pos}` : `No unknown-position allocation`,
      ],
    });
  }

  return results.sort((a, b) => b.compressionPct - a.compressionPct);
}

// ── Scarcity Detection ────────────────────────────────────────────────────────

export function calcScarcityAlerts(params: {
  rosterNeeds:       any[];
  playerPool:        Array<{ name: string; position: string; projectedPoints: number }>;
  keeperPredictions: any[];
  totalTeams:        number;
  totalRounds:       number;
}): ScarcityAlert[] {
  const { rosterNeeds, playerPool, keeperPredictions, totalTeams, totalRounds } = params;
  const positions = ["QB", "RB", "WR", "TE", "K"]; // DEF excluded: league uses DL/LB/DB individuals
  const alerts: ScarcityAlert[] = [];

  // Players already locked by keepers
  const keptNames = new Set(
    keeperPredictions
      .filter(k => k.predictedPlayer && k.predictedPlayer !== "Unknown")
      .map(k => k.predictedPlayer.toLowerCase())
  );

  for (const pos of positions) {
    const allAtPos = playerPool.filter(p => p.position === pos);
    const available = allAtPos.filter(p => !keptNames.has(p.name.toLowerCase()))
                               .sort((a, b) => b.projectedPoints - a.projectedPoints);

    const threshold   = STARTER_THRESHOLD[pos] ?? 100;
    const eliteSupply = available.filter(p => p.projectedPoints >= threshold).length;
    const totalPool   = available.length;

    // League-wide demand
    const lineupNeed   = ({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1, DEF: 0 }[pos] ?? 0) + (pos === "RB" || pos === "WR" ? 1 : 0); // +1 flex
    const startersNeeded = pos === "FLEX" ? 0 : Math.ceil(lineupNeed * totalTeams);

    // How many teams have HIGH+ need for this position
    const criticalDemand = rosterNeeds.filter(n =>
      n.needs?.some((nd: any) => nd.position === pos && (nd.urgency === "CRITICAL" || nd.urgency === "HIGH"))
    ).length;

    // Demand score: proportion of elite supply consumed by needy teams
    const demandScore = eliteSupply > 0 ? Math.round((criticalDemand / eliteSupply) * 100) / 100 : 9.9;

    const urgency: ScarcityAlert["urgency"] =
      demandScore >= 2.0  ? "CRITICAL" :
      demandScore >= 1.0  ? "HIGH"     :
      demandScore >= 0.5  ? "MEDIUM"   : "LOW";

    // Projected remaining supply by round (using expected pick rate)
    const remainingAfterRound: Record<number, number> = {};
    let remaining = eliteSupply;
    for (let r = 1; r <= Math.min(totalRounds, 14); r++) {
      remaining = Math.max(0, remaining - (POS_PICKS_PER_ROUND[pos]?.[r - 1] ?? 0));
      remainingAfterRound[r] = remaining;
    }

    alerts.push({
      position: pos,
      totalPool,
      eliteSupply,
      demandScore,
      urgency,
      startersNeeded,
      remainingAfterRound,
      evidence: [
        `${eliteSupply} elite ${pos}s available (≥${threshold} pts projected)`,
        `${criticalDemand} teams have HIGH+ need for ${pos}`,
        `Demand score: ${demandScore.toFixed(2)} (${demandScore >= 1 ? "demand exceeds elite supply" : "supply adequate"})`,
        `Starters needed league-wide: ${startersNeeded}`,
      ],
    });
  }

  return alerts.sort((a, b) => b.demandScore - a.demandScore);
}

// ── Position Run Alerts ───────────────────────────────────────────────────────

export function calcPositionRunAlerts(params: {
  rosterNeeds:       any[];
  scarcityAlerts:    ScarcityAlert[];
  keeperPredictions: any[];
  mockDraft:         any[];
  totalTeams:        number;
}): PositionRunAlert[] {
  const { rosterNeeds, scarcityAlerts, keeperPredictions, mockDraft, totalTeams } = params;
  const positions = ["QB", "RB", "WR", "TE", "K"]; // DEF excluded: league uses DL/LB/DB individuals
  const alerts: PositionRunAlert[] = [];

  for (const pos of positions) {
    // Teams that have this as top need
    const needyTeams = rosterNeeds.filter(n =>
      n.needs?.length > 0 &&
      n.needs[0].position === pos &&
      ["CRITICAL", "HIGH"].includes(n.needs[0].urgency)
    );

    const needCount = needyTeams.length;
    if (needCount < 3) continue; // No run if fewer than 3 teams targeting

    // Find the round window in mock draft where this position clusters
    const mockPicksAtPos = (mockDraft ?? []).filter((p: any) => p.position === pos && !p.isKeeperSlot);
    const roundsOfPos    = mockPicksAtPos.map((p: any) => p.round as number);

    // Find densest window (5 consecutive picks with most of this position)
    let bestWindowStart = 1;
    let bestWindowCount = 0;
    const WINDOW = 5;
    for (let r = 1; r <= 14 - WINDOW + 1; r++) {
      const inWindow = roundsOfPos.filter(rnd => rnd >= r && rnd <= r + WINDOW - 1).length;
      if (inWindow > bestWindowCount) {
        bestWindowCount = inWindow;
        bestWindowStart = r;
      }
    }

    // Expected round: weighted average of early picks for this position
    const earlyPicks = mockPicksAtPos.filter((p: any) => p.round <= 8);
    const avgRound = earlyPicks.length > 0
      ? Math.round(earlyPicks.reduce((s: number, p: any) => s + p.round, 0) / earlyPicks.length)
      : bestWindowStart;

    // Trigger picks from mock (evidence)
    const triggerPicks = mockPicksAtPos.slice(0, 5).map(
      (p: any) => `Rd ${p.round} Pick ${p.pickNumber}: ${p.ownerName?.split(" ")[0] ?? "?"} → ${p.player}`
    );

    // Scarcity context
    const scarcity = scarcityAlerts.find(s => s.position === pos);
    const demandScore = scarcity?.demandScore ?? 0;

    // Confidence = function of need count, demand score, concentration
    const confSignals = [
      Math.min(1.0, needCount / totalTeams * 2),   // proportion of league needs this
      Math.min(1.0, demandScore),                   // scarcity driven
      bestWindowCount >= 4 ? 0.9 : 0.7,            // mock board concentration
    ];
    const confidence = Math.round(
      Math.min(95, Math.max(40, (confSignals.reduce((s, v) => s + v, 0) / confSignals.length) * 100))
    );

    const windowEnd = Math.min(14, bestWindowStart + WINDOW - 1);

    alerts.push({
      position: pos,
      expectedRound: avgRound,
      roundWindow: `Rounds ${bestWindowStart}–${windowEnd}`,
      affectedOwners: needyTeams.map(n => n.ownerName),
      teamCount: needCount,
      confidence,
      triggerPicks,
      urgencyCount: needCount,
      evidence: [
        `${needCount} teams have ${pos} as their #1 draft priority`,
        `Mock draft projects ${bestWindowCount} ${pos}s selected in Rounds ${bestWindowStart}–${windowEnd}`,
        scarcity ? `${scarcity.eliteSupply} elite ${pos}s available vs ${needCount} teams in high need` : "",
        `Demand score: ${demandScore.toFixed(2)}`,
      ].filter(Boolean),
    });
  }

  return alerts.sort((a, b) => b.confidence - a.confidence);
}

// ── Draft Board Pressure by Round ─────────────────────────────────────────────

export function calcDraftBoardPressure(params: {
  rosterNeeds:       any[];
  scarcityAlerts:    ScarcityAlert[];
  keeperPredictions: any[];
  totalTeams:        number;
  totalRounds:       number;
}): PressureByRound[] {
  const { rosterNeeds, scarcityAlerts, totalTeams, totalRounds } = params;
  const positions = ["QB", "RB", "WR", "TE", "K"]; // DEF excluded: league uses DL/LB/DB individuals
  const rounds: PressureByRound[] = [];

  // Running remaining supply (start from elite supply)
  const remainingSupply: Record<string, number> = {};
  for (const sc of scarcityAlerts) {
    remainingSupply[sc.position] = sc.eliteSupply;
  }

  // Running demand (teams that still need position)
  const remainingDemand: Record<string, number> = {};
  for (const pos of positions) {
    remainingDemand[pos] = rosterNeeds.filter(n =>
      n.needs?.some((nd: any) => nd.position === pos && ["CRITICAL","HIGH"].includes(nd.urgency))
    ).length;
  }

  for (let round = 1; round <= Math.min(totalRounds, 14); round++) {
    const positionPressure: Record<string, number> = {};
    const evidence: string[] = [];

    for (const pos of positions) {
      const supply = Math.max(0, (remainingSupply[pos] ?? 0) - (POS_PICKS_PER_ROUND[pos]?.[round - 1] ?? 0));
      const demand = remainingDemand[pos] ?? 0;

      // Pressure = how much demand vs remaining supply heading into this round
      const pressure = supply > 0
        ? Math.min(100, Math.round((demand / supply) * 60))
        : demand > 0 ? 100 : 0;

      positionPressure[pos] = pressure;
      remainingSupply[pos]  = supply;
      if (demand > 0 && supply <= demand) {
        evidence.push(`${pos}: ${demand} teams need, ${supply} elite left (round ${round})`);
        // Reduce demand as picks fill needs
        remainingDemand[pos] = Math.max(0, demand - (POS_PICKS_PER_ROUND[pos]?.[round - 1] ?? 0));
      }
    }

    const hottestPos   = Object.entries(positionPressure).sort(([, a], [, b]) => b - a)[0];
    const hottestScore = hottestPos ? hottestPos[1] : 0;

    rounds.push({
      round,
      positionPressure,
      hottestPosition: hottestPos?.[0] ?? "—",
      hottestScore,
      evidence: evidence.length > 0
        ? evidence
        : [`Round ${round}: No critical supply-demand imbalance`],
    });
  }

  return rounds;
}

// ── Draft Environment Dashboard ───────────────────────────────────────────────

export function buildDraftEnvironmentDashboard(params: {
  scarcityAlerts:   ScarcityAlert[];
  runAlerts:        PositionRunAlert[];
  compression:      KeeperCompressionResult[];
  pressureByRound:  PressureByRound[];
  playerPool:       Array<{ name: string; position: string; projectedPoints: number }>;
}): DraftEnvironmentDashboard {
  const { scarcityAlerts, runAlerts, compression, pressureByRound, playerPool } = params;

  // Strongest position: lowest demand score + most elite supply
  const strongest = [...scarcityAlerts].sort((a, b) => {
    const scoreA = a.eliteSupply - a.demandScore * 10;
    const scoreB = b.eliteSupply - b.demandScore * 10;
    return scoreB - scoreA;
  })[0];

  // Weakest position: highest demand score
  const weakest = [...scarcityAlerts].sort((a, b) => b.demandScore - a.demandScore)[0];

  // Biggest run risk: highest confidence run alert
  const biggestRun = runAlerts[0];

  // Biggest value pocket: position where supply far exceeds demand at a useful round
  // = position with high elite supply and low demand score
  const valuePocket = [...scarcityAlerts]
    .filter(s => s.eliteSupply > s.demandScore * 2 && s.eliteSupply > 5)
    .sort((a, b) => (b.eliteSupply / Math.max(b.demandScore, 0.1)) - (a.eliteSupply / Math.max(a.demandScore, 0.1)))[0];

  // Find round where value pocket peaks (most players still available)
  const valuePocketRound = valuePocket
    ? Object.entries(valuePocket.remainingAfterRound)
        .filter(([, v]) => v > 3)
        .map(([r]) => parseInt(r))
        .pop() ?? 4
    : 4;

  const valuePocketPlayersAtRound = valuePocket?.remainingAfterRound[valuePocketRound] ?? 0;

  // Most distorted by keepers: highest compression %
  const mostDistorted = compression[0];

  // League depth grade per position (A-F based on supply vs demand)
  const leagueDepthGrade: Record<string, "A" | "B" | "C" | "D" | "F"> = {};
  for (const s of scarcityAlerts) {
    const ratio = s.eliteSupply / Math.max(s.startersNeeded, 1);
    leagueDepthGrade[s.position] =
      ratio >= 2.0 ? "A" :
      ratio >= 1.5 ? "B" :
      ratio >= 1.0 ? "C" :
      ratio >= 0.5 ? "D" : "F";
  }

  return {
    strongestPosition: {
      position: strongest?.position ?? "—",
      reason: `${strongest?.eliteSupply ?? 0} elite players, only ${strongest?.demandScore?.toFixed(2) ?? 0} demand score`,
      supplyScore: strongest?.eliteSupply ?? 0,
    },
    weakestPosition: {
      position: weakest?.position ?? "—",
      reason: `Demand score ${weakest?.demandScore.toFixed(2) ?? 0} — demand exceeds elite supply`,
      scarcityScore: Math.round((weakest?.demandScore ?? 0) * 100),
    },
    biggestRunRisk: biggestRun ? {
      position: biggestRun.position,
      expectedRound: biggestRun.expectedRound,
      teamCount: biggestRun.teamCount,
      reason: `${biggestRun.teamCount} teams projected to target ${biggestRun.position} in ${biggestRun.roundWindow}`,
    } : { position: "—", expectedRound: 0, teamCount: 0, reason: "No run risk detected" },
    biggestValuePocket: valuePocket ? {
      position: valuePocket.position,
      round: valuePocketRound,
      reason: `${valuePocketPlayersAtRound} elite ${valuePocket.position}s still available through Round ${valuePocketRound}`,
      playersAvailable: valuePocketPlayersAtRound,
    } : { position: "—", round: 0, reason: "No clear value pocket", playersAvailable: 0 },
    mostDistortedByKeepers: {
      position: mostDistorted?.position ?? "—",
      compressionPct: mostDistorted?.compressionPct ?? 0,
      reason: mostDistorted?.compressionPct > 0
        ? `${mostDistorted.compressionPct}% of ${mostDistorted.position} pool locked by keepers`
        : "No keeper compression detected",
    },
    leagueDepthGrade,
  };
}

