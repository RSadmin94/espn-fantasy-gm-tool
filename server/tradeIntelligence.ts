/**
 * tradeIntelligence.ts — Phase 1 of the Trade Intelligence Report.
 *
 * Pure deterministic, data-backed logic for the Trade Analyzer scouting report.
 * NO probabilities, NO trust scores, NO rejected-offer rates — completed trade
 * data only. The LLM (in routers.ts) only writes a one-line summary FROM these
 * findings; verdict, fit grade, and every evidence bullet are computed here.
 *
 * Trade reconstruction reuses the exported ESPN helpers (same source the existing
 * tradeAging / tradeNarrative path uses) — it does not touch those endpoints.
 */
import {
  normalizeTransactions,
  normalizeTeams,
  normalizeRosters,
  buildCompletedProposalIds,
  isCompletedTradeProposal,
} from "./espnService";

type SeasonData = Record<string, unknown>;
type Row = Record<string, unknown>;

export interface CompletedTrade {
  season: number;
  date: number;
  teamA: number;
  teamB: number;
  /** positions of players each team RECEIVED in this trade */
  receivedByTeam: Record<number, string[]>;
  /** count of draft picks each team RECEIVED */
  picksByTeam: Record<number, number>;
}

const otherTeam = (t: CompletedTrade, teamId: number) => (t.teamA === teamId ? t.teamB : t.teamA);
const mode = (arr: string[]): string | null => {
  if (arr.length === 0) return null;
  const counts = new Map<string, number>();
  for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

export interface ReconstructResult {
  trades: CompletedTrade[];
  /** teamId -> set of seasons that team existed in the league */
  seasonsByTeam: Map<number, Set<number>>;
}

/** Reconstruct completed trades across all given seasons (positions only — no value math). */
export async function reconstructCompletedTrades(
  seasons: number[],
  loadSeasonData: (season: number) => Promise<SeasonData | null>,
): Promise<ReconstructResult> {
  const trades: CompletedTrade[] = [];
  const seasonsByTeam = new Map<number, Set<number>>();

  for (const season of seasons) {
    const data = await loadSeasonData(season);
    if (!data) continue;

    const posByPid = new Map<number, string>();
    for (const r of normalizeRosters(data) as Row[]) {
      const pid = r.playerId as number;
      if (pid && !posByPid.has(pid)) posByPid.set(pid, (r.position as string) || "?");
    }
    for (const t of normalizeTeams(data) as Row[]) {
      const tid = t.teamId as number;
      if (!seasonsByTeam.has(tid)) seasonsByTeam.set(tid, new Set());
      seasonsByTeam.get(tid)!.add(season);
    }

    const txRows = normalizeTransactions(data) as Row[];
    const { completedProposalIds } = buildCompletedProposalIds(txRows);
    const isCompleted = (r: Row): boolean => {
      const type = r.type as string;
      const status = String(r.status || "").toUpperCase();
      if (type === "TRADE") return status === "" || status === "EXECUTED";
      if (type === "TRADE_PROPOSAL") return isCompletedTradeProposal(r, completedProposalIds);
      return false;
    };

    const playerGroups = new Map<string, Row[]>();
    const pickGroups = new Map<string, Row[]>();
    for (const r of txRows) {
      if (!isCompleted(r)) continue;
      const tid = r.transactionId as string;
      if (r.itemType === "DRAFT_TRADE") {
        (pickGroups.get(tid) ?? pickGroups.set(tid, []).get(tid)!).push(r);
      } else if (r.playerId) {
        (playerGroups.get(tid) ?? playerGroups.set(tid, []).get(tid)!).push(r);
      }
    }

    for (const [tid, rows] of playerGroups) {
      const teamSet = new Set<number>();
      for (const r of rows) {
        if ((r.fromTeamId as number) > 0) teamSet.add(r.fromTeamId as number);
        if ((r.toTeamId as number) > 0) teamSet.add(r.toTeamId as number);
      }
      if (teamSet.size < 2) continue;
      const [a, b] = Array.from(teamSet);
      const receivedByTeam: Record<number, string[]> = { [a]: [], [b]: [] };
      for (const r of rows) {
        const to = r.toTeamId as number;
        if (to !== a && to !== b) continue;
        const pid = r.playerId as number;
        receivedByTeam[to].push((r.position as string) || posByPid.get(pid) || "?");
      }
      const picksByTeam: Record<number, number> = { [a]: 0, [b]: 0 };
      for (const r of pickGroups.get(tid) ?? []) {
        const to = r.toTeamId as number;
        if (to === a || to === b) picksByTeam[to]++;
      }
      const date = Number(rows[0]?.proposedDate ?? rows[0]?.processedDate ?? 0);
      trades.push({ season, date, teamA: a, teamB: b, receivedByTeam, picksByTeam });
    }

    // Pick-only trades: transactions that moved only draft picks (no players).
    // Player-bearing trades (including pick-inclusive ones) are already handled above.
    // Stricter completion gate than the player path: count ONLY genuinely EXECUTED pick
    // trades. This excludes pending pick *proposals* (status PENDING / executionType
    // EXECUTE) that would otherwise inflate counts with offers that never completed.
    for (const [tid, rows] of pickGroups) {
      if (playerGroups.has(tid)) continue;
      if (!rows.some((r) => String(r.status || "").toUpperCase() === "EXECUTED")) continue;
      const teamSet = new Set<number>();
      for (const r of rows) {
        if ((r.fromTeamId as number) > 0) teamSet.add(r.fromTeamId as number);
        if ((r.toTeamId as number) > 0) teamSet.add(r.toTeamId as number);
      }
      if (teamSet.size < 2) continue;
      const [a, b] = Array.from(teamSet);
      const picksByTeam: Record<number, number> = { [a]: 0, [b]: 0 };
      for (const r of rows) {
        const to = r.toTeamId as number;
        if (to === a || to === b) picksByTeam[to]++;
      }
      const receivedByTeam: Record<number, string[]> = { [a]: [], [b]: [] };
      const date = Number(rows[0]?.proposedDate ?? rows[0]?.processedDate ?? 0);
      trades.push({ season, date, teamA: a, teamB: b, receivedByTeam, picksByTeam });
    }
  }
  return { trades, seasonsByTeam };
}

export interface DnaLite {
  avgTradesPerSeason?: number;
  tradeFrequency?: number; // 0-100
  gmArchetype?: string;
  tiltLabel?: string;
  // Profile-grade fields (reused from calcLeagueDNA — the same data behind Owner Profiles).
  // No new scoring: these are read straight off the existing ManagerDNA / season records.
  waiverAggression?: number;            // 0-100
  draftStyleBadge?: string;             // e.g. "RB-First Builder", "WR-Heavy Drafter"
  round1Distribution?: Record<string, number>; // R1 picks by position, historical
  championships?: number;               // count of title seasons
  // Behavioral archetypes from the TRUSTED Activity DNA service (same as Owner Profiles).
  // When present these take precedence over the calcLeagueDNA gmArchetype label.
  activityPrimary?: string;             // e.g. "Roster Builder"
  activitySecondary?: string;           // e.g. "Waiver Aggressive"
}

export interface OwnerIntelligence {
  ownerName: string;
  completedTrades: number;
  avgTradesPerSeason: number;
  mostAcquiredPos: string | null;
  mostTradedAwayPos: string | null;
  tradeStyle: string;
  riskProfile: string;
  tradeAggression: "Low" | "Moderate" | "High" | "Unknown";
  // Profile-grade behavioral lines (replace the old thin Style/Tilt labels in the UI).
  behavioralDna: string;   // archetype + standout activity scores
  draftTendency: string;   // draft style + R1 positional lean
  pedigree: string;        // championships / titles
  inferredNote: string;
}

export function computeOwnerIntelligence(
  trades: CompletedTrade[],
  teamId: number,
  ownerName: string,
  dna?: DnaLite,
): OwnerIntelligence {
  const relevant = trades.filter((t) => t.teamA === teamId || t.teamB === teamId);
  const acquired = relevant.flatMap((t) => t.receivedByTeam[teamId] ?? []);
  const given = relevant.flatMap((t) => t.receivedByTeam[otherTeam(t, teamId)] ?? []);
  const distinctSeasons = new Set(relevant.map((t) => t.season)).size;
  // Derive avg/season from the SAME completed-trade set shown as "Completed trades", so the
  // two numbers can never contradict (the DNA activity metric counts all roster moves and
  // produced impossible pairings like "6 completed trades / 0.8 per season").
  const avg = distinctSeasons > 0 ? relevant.length / distinctSeasons : 0;

  let aggression: OwnerIntelligence["tradeAggression"] = "Unknown";
  const freq = dna?.tradeFrequency;
  if (freq != null) aggression = freq >= 66 ? "High" : freq >= 33 ? "Moderate" : "Low";
  else if (relevant.length > 0) aggression = avg >= 2 ? "High" : avg >= 1 ? "Moderate" : "Low";

  // Behavioral DNA: prefer the TRUSTED Activity DNA archetypes (same source as Owner Profiles —
  // Roster Builder / Waiver Aggressive / Trade Opportunist). Fall back to the calcLeagueDNA
  // gmArchetype only when Activity DNA isn't available, so the line is never blank.
  const archetype = dna?.gmArchetype?.trim();
  const ap = dna?.activityPrimary?.trim();
  const asec = dna?.activitySecondary?.trim();
  let behavioralDna: string;
  if (ap) {
    behavioralDna = asec && asec !== ap ? `${ap} · ${asec}` : ap;
  } else if (archetype) {
    const scoreBits: string[] = [];
    if (dna?.tradeFrequency != null) scoreBits.push(`trades ${Math.round(dna.tradeFrequency)}/100`);
    if (dna?.waiverAggression != null) scoreBits.push(`waiver ${Math.round(dna.waiverAggression)}/100`);
    behavioralDna = `${archetype}${scoreBits.length ? ` · ${scoreBits.join(", ")}` : ""}`;
  } else {
    behavioralDna = relevant.length === 0 ? "No completed-trade history" : "Active trader";
  }

  let draftTendency = dna?.draftStyleBadge?.trim() || "Draft history not available";
  if (dna?.round1Distribution) {
    const entries = Object.entries(dna.round1Distribution).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, c]) => s + c, 0);
    if (entries.length > 0 && total > 0) {
      const [pos, cnt] = entries[0];
      const badge = dna?.draftStyleBadge?.trim();
      draftTendency = `${badge ? `${badge} — ` : ""}${pos} in ${cnt}/${total} R1s (${Math.round((cnt / total) * 100)}%)`;
    }
  }

  // Only render pedigree when championships come from a trusted source (computeAllTrophyHistory).
  // When unavailable, emit "" so the client hides the line — never show a false "No titles yet"
  // for a known champion.
  const pedigree = dna?.championships != null
    ? (dna.championships > 0 ? `${dna.championships}× champion` : "No titles yet")
    : "";

  return {
    ownerName,
    completedTrades: relevant.length,
    avgTradesPerSeason: Math.round(avg * 10) / 10,
    mostAcquiredPos: mode(acquired),
    mostTradedAwayPos: mode(given),
    tradeStyle: archetype || (relevant.length === 0 ? "No completed-trade history" : "Active trader"),
    riskProfile: dna?.tiltLabel?.trim() || "Not enough data",
    tradeAggression: aggression,
    behavioralDna,
    draftTendency,
    pedigree,
    inferredNote: "Inferred from league history",
  };
}

export interface RivalryReport {
  completedTrades: number;
  mostRecent: { season: number; summary: string } | null;
  commonAssets: string[];
  yearsActiveTogether: number;
  relationship: string;
}

export function computeRivalry(
  trades: CompletedTrade[],
  teamAId: number,
  teamBId: number,
  seasonsByTeam: Map<number, Set<number>>,
): RivalryReport {
  const pair = trades
    .filter((t) => (t.teamA === teamAId && t.teamB === teamBId) || (t.teamA === teamBId && t.teamB === teamAId))
    .sort((x, y) => y.season - x.season || y.date - x.date);

  const posCounts = new Map<string, number>();
  for (const t of pair) {
    for (const pos of [...(t.receivedByTeam[teamAId] ?? []), ...(t.receivedByTeam[teamBId] ?? [])]) {
      posCounts.set(pos, (posCounts.get(pos) ?? 0) + 1);
    }
    const picks = (t.picksByTeam[teamAId] ?? 0) + (t.picksByTeam[teamBId] ?? 0);
    if (picks > 0) posCounts.set("Picks", (posCounts.get("Picks") ?? 0) + picks);
  }
  const commonAssets = [...posCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);

  const aSeasons = seasonsByTeam.get(teamAId) ?? new Set<number>();
  const bSeasons = seasonsByTeam.get(teamBId) ?? new Set<number>();
  let yearsActiveTogether = 0;
  for (const s of aSeasons) if (bSeasons.has(s)) yearsActiveTogether++;

  const n = pair.length;
  const relationship =
    n === 0 ? "Have never completed a trade with each other"
    : n <= 2 ? "Rare trade partners"
    : n <= 5 ? "Occasional trade partners"
    : "Frequent trade partners";

  const mostRecent = pair[0]
    ? { season: pair[0].season, summary: commonAssets.length ? `exchanged ${commonAssets.join(", ")}` : "completed a trade" }
    : null;

  return { completedTrades: n, mostRecent, commonAssets, yearsActiveTogether, relationship };
}

const pctLabel = (p: number) => (p >= 0.66 ? "top third" : p >= 0.33 ? "middle third" : "bottom third");

export interface ChampionshipWindow {
  classification: "Contender" | "Playoff Team" | "Bubble Team" | "Retooling" | "Rebuilding";
  reasons: string[];
  basis: string;
}

const WINDOW_BASIS = "Estimated from current record and roster-value percentile.";

export function computeChampionshipWindow(args: {
  wins: number;
  losses: number;
  ties: number;
  rosterValueRankPct: number; // 0..1 (1 = best roster value in league)
  pointsForGap: number | null; // champ PF - owner PF; <=0 means at/above champ benchmark
  hasCurrentRecord: boolean;
  seasonHasGames?: boolean; // true if ANY team in the analyzed season has a record
}): ChampionshipWindow {
  const { wins, losses, ties, rosterValueRankPct, pointsForGap, hasCurrentRecord } = args;
  const seasonHasGames = args.seasonHasGames ?? false;
  const reasons: string[] = [];
  const topRoster = rosterValueRankPct >= 0.66;
  const bottomRoster = rosterValueRankPct <= 0.33;

  if (!hasCurrentRecord) {
    // Distinguish a genuine preseason (no team has played) from a completed/in-progress
    // season where THIS team's record simply didn't resolve — otherwise two teams in the
    // same finished season can disagree ("5-9" vs "Preseason — no games played yet").
    reasons.push(
      seasonHasGames
        ? "Record unavailable for this team; classification leans on roster value."
        : "Preseason — no games played yet; classification leans on roster value."
    );
    reasons.push(`Roster value is in the ${pctLabel(rosterValueRankPct)} of the league.`);
    const cls: ChampionshipWindow["classification"] = topRoster ? "Contender" : rosterValueRankPct >= 0.4 ? "Playoff Team" : "Retooling";
    return { classification: cls, reasons, basis: WINDOW_BASIS };
  }

  const games = wins + losses + ties;
  const winPct = games > 0 ? (wins + ties * 0.5) / games : 0;
  reasons.push(`Record ${wins}-${losses}${ties ? `-${ties}` : ""} (${Math.round(winPct * 100)}% win rate).`);
  reasons.push(`Roster value is in the ${pctLabel(rosterValueRankPct)} of the league.`);
  if (pointsForGap != null) {
    reasons.push(pointsForGap <= 0 ? "Scoring at or above the champion-profile benchmark." : `About ${Math.round(pointsForGap)} points/season below the champion benchmark.`);
  }
  const closeToChamp = pointsForGap == null || pointsForGap <= 0;
  let cls: ChampionshipWindow["classification"];
  if (winPct >= 0.6 && topRoster && closeToChamp) cls = "Contender";
  else if (winPct >= 0.5) cls = "Playoff Team";
  else if (winPct >= 0.4) cls = "Bubble Team";
  else if (!bottomRoster) cls = "Retooling";
  else cls = "Rebuilding";
  return { classification: cls, reasons, basis: WINDOW_BASIS };
}

export type FitGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "D" | "F";
export interface TradeFitScore {
  grade: FitGrade;
  evidence: { ok: boolean; text: string }[];
}

const scoreToGrade = (net: number): FitGrade =>
  net >= 3 ? "A+" : net === 2 ? "A" : net === 1 ? "A-" : net === 0 ? "B" : net === -1 ? "C" : net === -2 ? "D" : "F";

export function computeTradeFitScore(args: {
  receivedPositions: string[];
  gavePositions: string[];
  teamNeeds: Record<string, number>;
  ownerMostAcquiredPos: string | null;
  ownerMostTradedAwayPos: string | null;
  window: ChampionshipWindow["classification"];
  valueRatioForThisSide: number; // >1 means this side gains value
}): TradeFitScore {
  const ev: { ok: boolean; text: string }[] = [];
  const weakest = Object.entries(args.teamNeeds).sort((a, b) => a[1] - b[1])[0]?.[0];
  if (weakest && args.receivedPositions.includes(weakest)) ev.push({ ok: true, text: `Addresses ${weakest} weakness (thinnest position).` });
  if (args.ownerMostAcquiredPos && args.receivedPositions.includes(args.ownerMostAcquiredPos)) ev.push({ ok: true, text: `Aligns with owner's trade behavior (most-acquired: ${args.ownerMostAcquiredPos}).` });
  if (args.window === "Contender" || args.window === "Playoff Team") ev.push({ ok: true, text: `Fits a ${args.window.toLowerCase()} timeline.` });
  else if (args.window === "Rebuilding" || args.window === "Retooling") ev.push({ ok: false, text: `Team is ${args.window.toLowerCase()}; win-now pieces may not fit the timeline.` });
  if (args.valueRatioForThisSide >= 1.05) ev.push({ ok: true, text: `Value favors this side (${Math.round((args.valueRatioForThisSide - 1) * 100)}% edge).` });
  else if (args.valueRatioForThisSide <= 0.95) ev.push({ ok: false, text: `Gives up more value than it gets (${Math.round((1 - args.valueRatioForThisSide) * 100)}% deficit).` });
  if (args.ownerMostTradedAwayPos) {
    const rare = args.gavePositions.find((p) => p !== args.ownerMostTradedAwayPos);
    if (rare) ev.push({ ok: false, text: `Moves a ${rare}, a position this owner rarely trades away.` });
  }
  const net = ev.filter((e) => e.ok).length - ev.filter((e) => !e.ok).length;
  return { grade: scoreToGrade(net), evidence: ev };
}

export function computeVerdict(args: { ratio: number; fitGradeA: FitGrade }): {
  verdict: "ACCEPT" | "COUNTER" | "FAIR" | "RISKY" | "AVOID";
  confidence: "High" | "Moderate" | "Low";
} {
  const { ratio, fitGradeA } = args;
  const fitGood = ["A+", "A", "A-", "B+", "B"].includes(fitGradeA);
  // Verdict bands read from THIS side's gain ratio (value received / value given).
  // Calibrated to fantasy negotiation reality: a normal 10-30% value gap is a
  // NEGOTIATION problem (COUNTER — add a depth piece or late pick), not a
  // deal-breaker. AVOID is reserved for genuinely lopsided "you're being fleeced"
  // trades (>30% behind). The near-parity band still defers to Trade Fit.
  let verdict: "ACCEPT" | "COUNTER" | "FAIR" | "RISKY" | "AVOID";
  if (ratio < 0.70) verdict = "AVOID";                  // >30% behind — walk away
  else if (ratio < 0.90) verdict = "COUNTER";           // 10-30% behind — fixable, ask for more
  else if (ratio <= 1.10) verdict = fitGood ? "FAIR" : "RISKY";  // within ~10% — fit decides
  else verdict = fitGood ? "ACCEPT" : "RISKY";          // >10% ahead — take it unless fit is poor
  // "Decisive" drives High confidence; track the new lopsided thresholds, not the old 0.85/1.18.
  const decisive = ratio < 0.70 || ratio > 1.30;
  const confidence = decisive && fitGood ? "High" : verdict === "RISKY" ? "Low" : "Moderate";
  return { verdict, confidence };
}

export type VerdictLabel = "ACCEPT" | "COUNTER" | "FAIR" | "RISKY" | "AVOID";
export type ContextBucket = "Contender" | "Bubble" | "Retooling" | "Rebuilding" | "Neutral";

/**
 * Map the EXISTING Championship Window classification into the Tier-1 context bucket.
 * LOCKED mapping (docs/SPLIT_VERDICT_SPEC.md §2): "Playoff Team" folds into Contender;
 * anything unknown/absent is Neutral. We map only labels that already exist — no new classifier.
 */
export function mapChampionshipContext(
  classification: ChampionshipWindow["classification"] | null | undefined,
): ContextBucket {
  switch (classification) {
    case "Contender":
    case "Playoff Team":
      return "Contender";
    case "Bubble Team":
      return "Bubble";
    case "Retooling":
      return "Retooling";
    case "Rebuilding":
      return "Rebuilding";
    default:
      return "Neutral";
  }
}

/**
 * Tier-1 Overall Verdict combiner (docs/SPLIT_VERDICT_SPEC.md §3.2).
 * PURE label logic over signals that already exist — no valuation, no new scoring, no I/O.
 *   - Championship Context is the only ordinal mover (±1 tier, bounded).
 *   - Roster Fit is a RISKY overlay only: poor fit downgrades FAIR/ACCEPT → RISKY.
 *     It can never upgrade value, and can never manufacture an AVOID.
 *   - A true value AVOID is capped at COUNTER; context can never produce an AVOID otherwise.
 */
export function computeOverallVerdict(args: {
  valueGrade: VerdictLabel;
  rosterFit: FitGrade;
  context: ContextBucket;
}): { overall: VerdictLabel } {
  const { valueGrade, rosterFit, context } = args;
  // Recommendation ladder: AVOID(0) -> COUNTER(1) -> FAIR(2) -> ACCEPT(3). RISKY is an overlay.
  const baseRung =
    valueGrade === "AVOID" ? 0 :
    valueGrade === "COUNTER" ? 1 :
    valueGrade === "ACCEPT" ? 3 : 2; // FAIR or RISKY share rung 2
  const cautionFromValue = valueGrade === "RISKY";
  const valueBehind = baseRung <= 1; // AVOID or COUNTER

  // Championship Context: the ONLY ordinal mover, bounded to one tier.
  let shift = 0;
  if (valueBehind && context === "Contender") shift = 1;        // contenders rationally overpay for win-now
  else if (valueBehind && context === "Rebuilding") shift = -1; // don't pay up when not contending
  shift = Math.max(-1, Math.min(1, shift));

  let rung = Math.max(0, Math.min(3, baseRung + shift));
  // AVOID guardrail: a true value AVOID rises to COUNTER at most, never FAIR/ACCEPT.
  // For everything else, context can never *manufacture* an AVOID (floor at COUNTER).
  if (valueGrade === "AVOID") rung = Math.min(rung, 1);
  else rung = Math.max(rung, 1);

  let overall: VerdictLabel =
    rung === 0 ? "AVOID" : rung === 1 ? "COUNTER" : rung === 2 ? "FAIR" : "ACCEPT";

  // Roster Fit: RISKY overlay only. Poor fit (D/F) or a near-parity value RISKY surfaces as
  // RISKY on a FAIR/ACCEPT outcome. COUNTER already signals "renegotiate"; good fit never overlays.
  const fitPoor = rosterFit === "D" || rosterFit === "F";
  if ((overall === "FAIR" || overall === "ACCEPT") && (fitPoor || cautionFromValue)) {
    overall = "RISKY";
  }
  return { overall };
}

export interface SplitVerdictSide {
  valueGrade: VerdictLabel;
  rosterFit: FitGrade;
  championshipContext: ContextBucket;
  overallVerdict: VerdictLabel;
  confidence: "High" | "Moderate" | "Low";
}

export function buildNegotiationAdvice(args: {
  ratio: number;
  teamANeeds: Record<string, number>;
  receivedByA: string[];
  windowA: ChampionshipWindow["classification"];
  ownerBMostAcquiredPos: string | null;
  gaveByA: string[];
}): string[] {
  const out: string[] = [];
  if (args.ratio <= 0.92) out.push("Value currently favors the other side — ask them to add a pick or depth piece before accepting.");
  const weakest = Object.entries(args.teamANeeds).sort((a, b) => a[1] - b[1])[0];
  if (weakest && !args.receivedByA.includes(weakest[0])) out.push(`You'd still be thin at ${weakest[0]} — consider targeting ${weakest[0]} depth instead or in addition.`);
  if (args.windowA === "Rebuilding" || args.windowA === "Retooling") out.push("If you're not contending this year, prefer younger players or picks over win-now veterans.");
  if (args.ownerBMostAcquiredPos && args.gaveByA.includes(args.ownerBMostAcquiredPos)) out.push(`The other owner historically targets ${args.ownerBMostAcquiredPos} — you may have leverage to ask for more.`);
  if (out.length === 0) out.push("Terms look reasonable as-is based on value, roster needs, and both owners' history.");
  return out;
}

export interface TradeIntelligenceReport {
  ownerIntelligence: { teamA: OwnerIntelligence; teamB: OwnerIntelligence };
  rivalry: RivalryReport;
  championshipWindow: { teamA: ChampionshipWindow; teamB: ChampionshipWindow };
  tradeFitScore: { teamA: TradeFitScore; teamB: TradeFitScore };
  verdict: { verdict: "ACCEPT" | "COUNTER" | "FAIR" | "RISKY" | "AVOID"; confidence: "High" | "Moderate" | "Low" };
  splitVerdict: { teamA: SplitVerdictSide; teamB: SplitVerdictSide };
  negotiationAdvice: string[];
}

export interface TeamRecordLite {
  wins: number;
  losses: number;
  ties: number;
  hasRecord: boolean;
  rosterValueRankPct: number;
  pointsForGap: number | null;
}

export async function buildTradeIntelligence(args: {
  seasons: number[];
  loadSeasonData: (season: number) => Promise<SeasonData | null>;
  teamAId: number;
  teamBId: number;
  ownerNameA: string;
  ownerNameB: string;
  dnaA?: DnaLite;
  dnaB?: DnaLite;
  needsA: Record<string, number>;
  needsB: Record<string, number>;
  receivedByA: string[];
  gaveByA: string[];
  receivedByB: string[];
  gaveByB: string[];
  ratio: number; // totalA / totalB
  recordA: TeamRecordLite;
  recordB: TeamRecordLite;
  seasonHasGames?: boolean; // true if any team in the analyzed season has a record
}): Promise<TradeIntelligenceReport> {
  const { trades, seasonsByTeam } = await reconstructCompletedTrades(args.seasons, args.loadSeasonData);

  const oiA = computeOwnerIntelligence(trades, args.teamAId, args.ownerNameA, args.dnaA);
  const oiB = computeOwnerIntelligence(trades, args.teamBId, args.ownerNameB, args.dnaB);
  const rivalry = computeRivalry(trades, args.teamAId, args.teamBId, seasonsByTeam);

  const winA = computeChampionshipWindow({
    wins: args.recordA.wins, losses: args.recordA.losses, ties: args.recordA.ties,
    rosterValueRankPct: args.recordA.rosterValueRankPct, pointsForGap: args.recordA.pointsForGap, hasCurrentRecord: args.recordA.hasRecord,
    seasonHasGames: args.seasonHasGames,
  });
  const winB = computeChampionshipWindow({
    wins: args.recordB.wins, losses: args.recordB.losses, ties: args.recordB.ties,
    rosterValueRankPct: args.recordB.rosterValueRankPct, pointsForGap: args.recordB.pointsForGap, hasCurrentRecord: args.recordB.hasRecord,
    seasonHasGames: args.seasonHasGames,
  });

  // Interpretation layer. The engine's `ratio = totalA / totalB` answers "how much am I
  // GIVING relative to what I RECEIVE" (given ÷ received), so ratio < 1 means a side comes out
  // ahead. The fit/verdict/negotiation paths all reason in terms of value GAINED (received ÷
  // given), so each side is fed its own gain ratio rather than the raw engine ratio.
  const gainRatioA = args.ratio > 0 ? 1 / args.ratio : 1;
  const gainRatioB = args.ratio;

  const fitA = computeTradeFitScore({
    receivedPositions: args.receivedByA, gavePositions: args.gaveByA, teamNeeds: args.needsA,
    ownerMostAcquiredPos: oiA.mostAcquiredPos, ownerMostTradedAwayPos: oiA.mostTradedAwayPos,
    window: winA.classification, valueRatioForThisSide: gainRatioA,
  });
  const fitB = computeTradeFitScore({
    receivedPositions: args.receivedByB, gavePositions: args.gaveByB, teamNeeds: args.needsB,
    ownerMostAcquiredPos: oiB.mostAcquiredPos, ownerMostTradedAwayPos: oiB.mostTradedAwayPos,
    window: winB.classification, valueRatioForThisSide: gainRatioB,
  });

  const verdict = computeVerdict({ ratio: gainRatioA, fitGradeA: fitA.grade });
  // Split Verdict (Tier 1): per-side value / fit / context / overall. Headline = team A
  // (the user's "YOU GIVE" side); team B is supporting context. Pure combiner over the
  // signals already computed above — no valuation, threshold, or fit-scoring changes.
  const verdictB = computeVerdict({ ratio: gainRatioB, fitGradeA: fitB.grade });
  const contextA = mapChampionshipContext(winA.classification);
  const contextB = mapChampionshipContext(winB.classification);
  const splitVerdict = {
    teamA: {
      valueGrade: verdict.verdict, rosterFit: fitA.grade, championshipContext: contextA,
      overallVerdict: computeOverallVerdict({ valueGrade: verdict.verdict, rosterFit: fitA.grade, context: contextA }).overall,
      confidence: verdict.confidence,
    },
    teamB: {
      valueGrade: verdictB.verdict, rosterFit: fitB.grade, championshipContext: contextB,
      overallVerdict: computeOverallVerdict({ valueGrade: verdictB.verdict, rosterFit: fitB.grade, context: contextB }).overall,
      confidence: verdictB.confidence,
    },
  };
  const negotiationAdvice = buildNegotiationAdvice({
    ratio: gainRatioA, teamANeeds: args.needsA, receivedByA: args.receivedByA,
    windowA: winA.classification, ownerBMostAcquiredPos: oiB.mostAcquiredPos, gaveByA: args.gaveByA,
  });

  return {
    ownerIntelligence: { teamA: oiA, teamB: oiB },
    rivalry,
    championshipWindow: { teamA: winA, teamB: winB },
    tradeFitScore: { teamA: fitA, teamB: fitB },
    verdict,
    splitVerdict,
    negotiationAdvice,
  };
}
