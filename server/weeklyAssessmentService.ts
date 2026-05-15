// FILE: server/weeklyAssessmentService.ts
/**
 * Weekly Assessment Engine
 *
 * Generates a comprehensive weekly intelligence report for every team in the
 * league. For each team it produces:
 *
 *   - Roster snapshot: starters, bench, injury flags, positional gaps
 *   - Owner profile: DNA summary, current tilt/desperation score
 *   - Last week recap: moves made (adds, drops, trades), matchup result
 *   - This week recommendations: moves they should make (their perspective)
 *   - Opportunities for Rod: trade windows, waiver targets, exploit windows
 *   - AI-generated narrative: plain-English GM briefing per team
 *
 * The AI narrative receives ALL calculated facts as ground truth — it explains
 * and strategizes, it does not invent numbers.
 *
 * Exports:
 *   buildWeeklyAssessment()     — full 14-team report for current week
 *   buildTeamAssessment()       — single team deep assessment
 *   buildRodOpportunityBoard()  — cross-team opportunity ranking for Rod
 */

import { getCachedView, getAllCachedSeasons } from "./db";
import {
  normalizeTeams, normalizeRosters, normalizeMatchups,
  normalizeTransactions, normalizeSettings,
} from "./espnService";
import { calcVORP, calcRosterGaps, calcROSValue, type PlayerRow } from "./analytics";
import { getInjuries, calcInjuryScores, buildInjuryPromptBlock } from "./injuryService";
import { calcManagerDNA, calcTradeDesperationScore, type ManagerRawData, type DraftPickRecord } from "./leagueDNA";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyRosterPlayer {
  playerId: number;
  playerName: string;
  position: string;
  proTeam: string;
  isStarter: boolean;
  avgPoints: number;
  projectedPoints: number;
  injuryRiskScore: number;
  workloadConfidence: number;
  injuryStatus: string;
  vorp: number;
}

export interface WeeklyTransaction {
  type: "ADD" | "DROP" | "TRADE_IN" | "TRADE_OUT";
  playerName: string;
  position: string;
  week: number;
  date: string;
  counterpartTeamId?: number;
  counterpartOwner?: string;
}

export interface WeeklyMatchupResult {
  week: number;
  opponentTeamId: number;
  opponentOwner: string;
  teamScore: number;
  opponentScore: number;
  won: boolean;
  projectedScore: number;
}

export interface TeamRecommendation {
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  category: "WAIVER" | "START_SIT" | "TRADE" | "DROP" | "KEEPER";
  action: string;         // plain English action
  reasoning: string;      // why this move makes sense for this team
}

export interface RodOpportunity {
  type: "TRADE_WINDOW" | "WAIVER_STEAL" | "EXPLOIT_DRAFT_BIAS" | "BUY_LOW" | "SELL_HIGH";
  targetTeamId: number;
  targetOwner: string;
  action: string;         // specific actionable step Rod should take
  urgency: "NOW" | "THIS_WEEK" | "MONITOR";
  reasoning: string;
  desperationScore?: number;
  exploitabilityScore?: number;
}

export interface TeamWeeklyAssessment {
  teamId: number;
  ownerName: string;
  teamName: string;
  season: number;
  week: number;

  // Standing
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  standingRank: number;
  playoffProbability: number;       // rough estimate 0-100

  // Roster
  starters: WeeklyRosterPlayer[];
  bench: WeeklyRosterPlayer[];
  rosterHealthScore: number;        // 0-100
  positionalGaps: string[];         // e.g. ["TE depth thin", "RB2 injury risk"]

  // Owner profile
  gmArchetype: string;
  exploitabilityScore: number;
  desperationScore: number;
  desperationLabel: string;
  tiltLabel: string;
  tradeWindowStatus: string;

  // Last week
  lastWeekResult: WeeklyMatchupResult | null;
  lastWeekTransactions: WeeklyTransaction[];
  lastWeekSummary: string;          // 1-2 sentence recap

  // This week for them
  theirRecommendations: TeamRecommendation[];

  // Opportunities for Rod
  rodOpportunities: RodOpportunity[];

  // AI narrative
  aiGMBriefing: string;             // full AI-generated assessment paragraph
}

export interface WeeklyLeagueAssessment {
  season: number;
  week: number;
  generatedAt: string;
  teams: TeamWeeklyAssessment[];
  rodTeamId: number | null;
  leagueSummary: string;            // AI overview of the week across all 14 teams
  topOpportunities: RodOpportunity[]; // cross-team ranked for Rod
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

async function getSeasonData(season: number) {
  const cached = await getCachedView(season, "combined", null);
  if (!cached) return null;
  return cached.payload as Record<string, unknown>;
}

function detectRodTeamId(teams: ReturnType<typeof normalizeTeams>): number | null {
  for (const t of teams) {
    const name = ((t.teamName as string) || "").toLowerCase();
    const abbrev = ((t.abbrev as string) || "").toLowerCase();
    const owner = ((t.owners as string) || "").toLowerCase();
    const _ownerFirst = ENV.ownerName.split(" ")[0].toLowerCase();
    const _ownerLast = (ENV.ownerName.split(" ")[1] ?? "").toLowerCase();
    if (name.includes("str8") || name.includes("rodzilla") ||
        owner.includes(_ownerFirst) || (_ownerLast && owner.includes(_ownerLast)) ||
        abbrev.includes(_ownerFirst)) {
      return t.teamId as number;
    }
  }
  return null;
}

function getWeekTransactions(
  transactions: ReturnType<typeof normalizeTransactions>,
  teamId: number,
  currentWeek: number,
  ownerMap: Record<number, string>
): WeeklyTransaction[] {
  const lastWeekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return (transactions as Array<Record<string, unknown>>)
    .filter(tx => {
      const tid = tx.teamId as number;
      const date = tx.proposedDate as number;
      return (tid === teamId || tx.fromTeamId === teamId || tx.toTeamId === teamId) &&
             date > lastWeekStart &&
             tx.status === "EXECUTED";
    })
    .map(tx => {
      const type = tx.type as string;
      const itemType = tx.itemType as string;

      let txType: WeeklyTransaction["type"] = "ADD";
      if (type === "WAIVER" || type === "FREE_AGENT") {
        txType = itemType === "ADD" ? "ADD" : "DROP";
      } else if (type === "TRADE") {
        txType = (tx.toTeamId as number) === teamId ? "TRADE_IN" : "TRADE_OUT";
      }

      const counterpartId = txType === "TRADE_IN"
        ? (tx.fromTeamId as number)
        : txType === "TRADE_OUT"
        ? (tx.toTeamId as number)
        : undefined;

      return {
        type: txType,
        playerName: (tx.playerName as string) || "Unknown",
        position: "?",
        week: currentWeek - 1,
        date: new Date(tx.proposedDate as number).toISOString(),
        counterpartTeamId: counterpartId,
        counterpartOwner: counterpartId ? ownerMap[counterpartId] : undefined,
      } as WeeklyTransaction;
    })
    .slice(0, 10); // cap at 10 transactions
}

function getLastWeekMatchup(
  matchups: ReturnType<typeof normalizeMatchups>,
  teamId: number,
  currentWeek: number,
  ownerMap: Record<number, string>
): WeeklyMatchupResult | null {
  const lastWeek = currentWeek - 1;
  if (lastWeek < 1) return null;

  const matchup = (matchups as Array<Record<string, unknown>>).find(m => {
    const period = m.matchupPeriodId as number;
    const homeId = (m.home as Record<string, unknown>)?.teamId as number;
    const awayId = (m.away as Record<string, unknown>)?.teamId as number;
    return period === lastWeek && (homeId === teamId || awayId === teamId);
  });

  if (!matchup) return null;

  const home = matchup.home as Record<string, unknown>;
  const away = matchup.away as Record<string, unknown>;
  const isHome = (home?.teamId as number) === teamId;
  const myScore = isHome ? (home?.totalPoints as number || 0) : (away?.totalPoints as number || 0);
  const oppScore = isHome ? (away?.totalPoints as number || 0) : (home?.totalPoints as number || 0);
  const oppId = isHome ? (away?.teamId as number) : (home?.teamId as number);
  const winner = matchup.winner as string;
  const won = (isHome && winner === "HOME") || (!isHome && winner === "AWAY");

  return {
    week: lastWeek,
    opponentTeamId: oppId,
    opponentOwner: ownerMap[oppId] || "Unknown",
    teamScore: Math.round(myScore * 10) / 10,
    opponentScore: Math.round(oppScore * 10) / 10,
    won,
    projectedScore: 0, // will be filled from roster projections
  };
}

function calcRosterHealth(
  starters: WeeklyRosterPlayer[],
  bench: WeeklyRosterPlayer[]
): { score: number; gaps: string[] } {
  const allPlayers = [...starters, ...bench];
  const gaps: string[] = [];

  // Health score: start at 100, deduct for injury risk
  const totalRisk = allPlayers.reduce((s, p) => s + p.injuryRiskScore, 0);
  const healthScore = Math.max(0, Math.round(100 - (totalRisk / Math.max(allPlayers.length, 1)) * 0.7));

  // Detect positional gaps
  const positions = ["QB", "RB", "WR", "TE"];
  for (const pos of positions) {
    const posStarters = starters.filter(p => p.position === pos);
    const posBench = bench.filter(p => p.position === pos);
    const posAll = [...posStarters, ...posBench];

    if (posAll.length === 0) {
      gaps.push(`No ${pos} on roster`);
    } else if (pos !== "QB" && posBench.length === 0 && posStarters.length <= 1) {
      gaps.push(`${pos} depth thin — no backup`);
    }
    // Injury risk at starter
    const injuredStarters = posStarters.filter(p => p.injuryRiskScore >= 45);
    if (injuredStarters.length > 0) {
      gaps.push(`${pos} starter injury risk: ${injuredStarters.map(p => p.playerName).join(", ")}`);
    }
  }

  return { score: healthScore, gaps };
}

function calcPlayoffProbability(
  wins: number,
  losses: number,
  totalTeams: number = 14,
  playoffSpots: number = 7
): number {
  const games = wins + losses;
  if (games === 0) return Math.round((playoffSpots / totalTeams) * 100);
  const winPct = wins / games;
  // Simple sigmoid-based estimate
  const targetWinPct = playoffSpots / totalTeams;
  const diff = winPct - targetWinPct;
  const prob = Math.round(50 + diff * 200);
  return Math.min(98, Math.max(2, prob));
}

// ─── Recommendation engine ────────────────────────────────────────────────────

function generateTheirRecommendations(
  assessment: Partial<TeamWeeklyAssessment>,
  starters: WeeklyRosterPlayer[],
  bench: WeeklyRosterPlayer[]
): TeamRecommendation[] {
  const recs: TeamRecommendation[] = [];

  // Injured starters
  const injuredStarters = starters.filter(p => p.injuryRiskScore >= 65);
  for (const p of injuredStarters) {
    const backup = bench.find(b => b.position === p.position && b.avgPoints > 0);
    recs.push({
      priority: p.injuryRiskScore >= 85 ? "URGENT" : "HIGH",
      category: "START_SIT",
      action: `Consider benching ${p.playerName} (${p.injuryStatus}) — ${backup ? `start ${backup.playerName} instead` : "find a waiver wire replacement"}`,
      reasoning: `${p.playerName} has an injury risk score of ${p.injuryRiskScore}/100 with workload confidence at ${p.workloadConfidence}%. Starting them is a significant gamble this week.`,
    });
  }

  // Thin depth positions
  for (const gap of (assessment.positionalGaps || [])) {
    if (gap.includes("depth thin")) {
      const pos = gap.split(" ")[0];
      recs.push({
        priority: "HIGH",
        category: "WAIVER",
        action: `Prioritize adding ${pos} depth this week — check waiver wire for handcuffs and emerging starters`,
        reasoning: `Roster has no meaningful backup at ${pos}. A single injury to the starter leaves a starting lineup hole.`,
      });
    }
  }

  // Losing streak + desperation
  if ((assessment.desperationScore || 0) >= 60 && !(assessment.lastWeekResult?.won)) {
    recs.push({
      priority: "HIGH",
      category: "TRADE",
      action: "Consider selling a high-floor veteran for multiple contributors — volume over ceiling right now",
      reasoning: `At ${assessment.wins}-${assessment.losses} with a desperation score of ${assessment.desperationScore}/100, consolidating assets is secondary to righting the ship with reliable weekly production.`,
    });
  }

  // Low-scoring bench outperforming starters
  const benchOutperformers = bench.filter(b =>
    b.avgPoints > 0 &&
    starters.some(s => s.position === b.position && s.avgPoints < b.avgPoints * 0.8)
  );
  for (const b of benchOutperformers.slice(0, 1)) {
    const underperformer = starters.find(s => s.position === b.position && s.avgPoints < b.avgPoints * 0.8);
    if (underperformer) {
      recs.push({
        priority: "MEDIUM",
        category: "START_SIT",
        action: `Start ${b.playerName} over ${underperformer.playerName} at ${b.position}`,
        reasoning: `${b.playerName} is averaging ${b.avgPoints.toFixed(1)} PPG vs ${underperformer.avgPoints.toFixed(1)} for ${underperformer.playerName}. The bench player is the better option.`,
      });
    }
  }

  return recs.slice(0, 5);
}

function generateRodOpportunities(
  team: Partial<TeamWeeklyAssessment>,
  rodRosterGaps: string[],
  desperationScore: number,
  exploitabilityScore: number
): RodOpportunity[] {
  const opps: RodOpportunity[] = [];
  const teamId = team.teamId!;
  const owner = team.ownerName!;

  // Trade window if desperate
  if (desperationScore >= 60) {
    opps.push({
      type: "TRADE_WINDOW",
      targetTeamId: teamId,
      targetOwner: owner,
      action: `Send a trade offer to ${owner} this week — their desperation score is ${desperationScore}/100`,
      urgency: desperationScore >= 75 ? "NOW" : "THIS_WEEK",
      reasoning: `${owner} is showing maximum desperation signals. They are more likely to accept below-market offers right now than at any other point this season.`,
      desperationScore,
      exploitabilityScore,
    });
  }

  // Buy low on their injured players
  const injuredStarters = team.starters?.filter(p => p.injuryRiskScore >= 45) || [];
  for (const p of injuredStarters.slice(0, 1)) {
    if (p.avgPoints > 10) { // only valuable players worth targeting
      opps.push({
        type: "BUY_LOW",
        targetTeamId: teamId,
        targetOwner: owner,
        action: `Offer for ${p.playerName} while they are injured — ${owner} may sell low due to uncertainty`,
        urgency: "THIS_WEEK",
        reasoning: `${p.playerName} has a ${p.injuryRiskScore}/100 injury risk this week. If ${owner} is panicking, they may accept less than full value. Target when injury news is fresh.`,
        desperationScore,
      });
    }
  }

  // Sell high — their player on hot streak that has positional value for Rod
  const hotPlayers = [...(team.starters || []), ...(team.bench || [])]
    .filter(p => p.avgPoints > 12 && p.injuryRiskScore < 20)
    .sort((a, b) => b.avgPoints - a.avgPoints)
    .slice(0, 1);

  for (const p of hotPlayers) {
    if (rodRosterGaps.some(gap => gap.includes(p.position))) {
      opps.push({
        type: "SELL_HIGH",
        targetTeamId: teamId,
        targetOwner: owner,
        action: `Target ${p.playerName} from ${owner} — fills ${ENV.ownerName.split(" ")[0]}'s ${p.position} gap and ${owner}'s desperation makes them tradeable`,
        urgency: "THIS_WEEK",
        reasoning: `${p.playerName} fills a positional gap in ${ENV.ownerName.split(" ")[0]}'s roster. ${owner} may be willing to move pieces for win-now help given their record.`,
        desperationScore,
      });
    }
  }

  return opps;
}

// ─── AI narrative generator ───────────────────────────────────────────────────

async function generateAIBriefing(
  team: Omit<TeamWeeklyAssessment, "aiGMBriefing">,
  injuryBlock: string
): Promise<string> {
  const lastWeekStr = team.lastWeekResult
    ? `Last week they ${team.lastWeekResult.won ? "WON" : "LOST"} ${team.lastWeekResult.teamScore}-${team.lastWeekResult.opponentScore} vs ${team.lastWeekResult.opponentOwner}.`
    : "No last week result available.";

  const txStr = team.lastWeekTransactions.length > 0
    ? `Moves made last week: ${team.lastWeekTransactions.map(t => `${t.type} ${t.playerName}`).join(", ")}.`
    : "No transactions made last week.";

  const recs = team.theirRecommendations.map(r => `- ${r.action}`).join("\n");
  const opps = team.rodOpportunities.map(o => `- ${o.action}`).join("\n");

  const isComplete = (team as TeamWeeklyAssessment & { isSeasonComplete?: boolean }).isSeasonComplete ?? false;

  const systemPrompt = isComplete
    ? `You are the GM War Room offseason briefing engine for Rod Sellers in "ATLANTAS FINEST FF" (14-team PPR keeper league, ${team.season} season — COMPLETED).

You are writing an END-OF-SEASON offseason summary for ONE team. The numbers below are final season facts — treat them as ground truth.

TEAM: ${team.ownerName} (${team.teamName})
FINAL RECORD: ${team.wins}-${team.losses} | Final Standing: #${team.standingRank} | Made Playoffs: ${team.playoffProbability === 100 ? "YES" : "NO"}
GM ARCHETYPE: ${team.gmArchetype} | Exploitability: ${team.exploitabilityScore}/100 | Tilt pattern: ${team.tiltLabel}
POINTS FOR: ${team.pointsFor} | POINTS AGAINST: ${team.pointsAgainst}
POSITIONAL GAPS HEADING INTO ${team.season + 1}: ${team.positionalGaps.join(", ") || "None identified"}

SEASON TRANSACTION SUMMARY:
${txStr}

ROD'S OFFSEASON OPPORTUNITIES VS THIS TEAM:
${opps || "None identified"}

Write a concise end-of-season GM summary (4-6 sentences) covering:
1. How their season went and what their final standing means for their rebuild/contention arc
2. Their biggest roster needs heading into the ${team.season + 1} draft and keeper decisions
3. Specific offseason trade or keeper opportunities Rod should target with this manager
4. Whether now (offseason) is the right time to approach them for a deal

Be direct and forward-looking. Reference final record, standing, and specific roster gaps.`
    : `You are the GM War Room weekly briefing engine for Rod Sellers in "ATLANTAS FINEST FF" (14-team PPR keeper league, ${team.season} season, Week ${team.week}).

You are writing a GM briefing for ONE opponent team. The numbers below are pre-calculated facts — treat them as ground truth and do not contradict them.

TEAM: ${team.ownerName} (${team.teamName})
RECORD: ${team.wins}-${team.losses} | Standing: #${team.standingRank} | Playoff probability: ${team.playoffProbability}%
GM ARCHETYPE: ${team.gmArchetype} | Exploitability: ${team.exploitabilityScore}/100 | Tilt: ${team.tiltLabel}
TRADE WINDOW: ${team.tradeWindowStatus} | Desperation score: ${team.desperationScore}/100
ROSTER HEALTH: ${team.rosterHealthScore}/100
POSITIONAL GAPS: ${team.positionalGaps.join(", ") || "None identified"}

${injuryBlock}

${lastWeekStr}
${txStr}

THEIR RECOMMENDED MOVES THIS WEEK:
${recs || "None identified"}

ROD'S OPPORTUNITIES AGAINST THIS TEAM:
${opps || "None identified"}

Write a concise GM weekly briefing (4-6 sentences) covering:
1. Their current situation and trajectory
2. What moves they should make this week and why
3. Specific opportunities Rod should exploit against them this week
4. Timing guidance — is now the right moment to act, or should Rod wait?

Be direct and tactical. No generic advice. Reference specific players and scores where available.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate the weekly GM briefing for ${team.ownerName}'s team.` },
      ],
    });
    const raw = response.choices?.[0]?.message?.content;
    return typeof raw === "string" ? raw : "Briefing unavailable.";
  } catch {
    return `${team.ownerName} is ${team.wins}-${team.losses} with a desperation score of ${team.desperationScore}/100. ${team.tradeWindowStatus === "WIDE OPEN" ? "Trade window is open — send an offer this week." : "Monitor their situation as the season progresses."}`;
  }
}

// ─── Main assessment builders ─────────────────────────────────────────────────

export async function buildTeamAssessment(
  teamId: number,
  season: number,
  allTeamsData: {
    teams: ReturnType<typeof normalizeTeams>;
    rosters: unknown[];
    matchups: ReturnType<typeof normalizeMatchups>;
    transactions: ReturnType<typeof normalizeTransactions>;
    settings: ReturnType<typeof normalizeSettings>;
    ownerMap: Record<number, string>;
    teamNameMap: Record<number, string>;
  },
  dnaProfiles: Map<number, ReturnType<typeof calcManagerDNA>>,
  rodRosterGaps: string[],
  rodTeamId: number | null
): Promise<TeamWeeklyAssessment> {
  const { teams, rosters, matchups, transactions, settings, ownerMap, teamNameMap } = allTeamsData;
  const currentWeek = (settings.currentMatchupPeriod as number) || 1;
  const calendarYear = new Date().getFullYear();
  const isSeasonComplete = currentWeek >= 14 || season < calendarYear;

  const team = teams.find(t => (t.teamId as number) === teamId);
  const ownerName = ownerMap[teamId] || "Unknown";
  const teamName = teamNameMap[teamId] || "Unknown";

  const wins = (team?.wins as number) || 0;
  const losses = (team?.losses as number) || 0;
  const pointsFor = (team?.pointsFor as number) || 0;
  const pointsAgainst = (team?.pointsAgainst as number) || 0;

  // Sort teams by wins for standing rank
  const sortedTeams = [...teams].sort((a, b) => {
    const wA = (a.wins as number) || 0;
    const wB = (b.wins as number) || 0;
    if (wB !== wA) return wB - wA;
    return ((b.pointsFor as number) || 0) - ((a.pointsFor as number) || 0);
  });
  const standingRank = sortedTeams.findIndex(t => (t.teamId as number) === teamId) + 1;

  // Build roster
  const teamRosters = (rosters as Array<Record<string, unknown>>)
    .filter(r => (r.teamId as number) === teamId);

  const injuries = await getInjuries();
  const injuryScores = calcInjuryScores(
    teamRosters.map(r => ({
      playerId: r.playerId as number,
      playerName: (r.playerName as string) || "Unknown",
      position: (r.position as string) || "?",
    })),
    injuries
  );
  const injuryMap = new Map(injuryScores.map(s => [s.playerId, s]));

  const toWeeklyPlayer = (r: Record<string, unknown>): WeeklyRosterPlayer => {
    const pid = r.playerId as number;
    const inj = injuryMap.get(pid);
    return {
      playerId: pid,
      playerName: (r.playerName as string) || "Unknown",
      position: (r.position as string) || "?",
      proTeam: (r.proTeam as string) || "?",
      isStarter: (r.lineupSlot as string) !== "Bench" && (r.lineupSlot as string) !== "IR",
      avgPoints: Math.round(((r.appliedAverage as number) || 0) * 10) / 10,
      projectedPoints: Math.round(((r.projectedTotal as number) || 0) * 10) / 10,
      injuryRiskScore: inj?.injuryRiskScore ?? 0,
      workloadConfidence: inj?.workloadConfidence ?? 100,
      injuryStatus: inj?.statusLabel ?? "Active",
      vorp: 0, // will be filled if VORP is needed
    };
  };

  const allPlayers = teamRosters.map(r => toWeeklyPlayer(r as Record<string, unknown>));
  const starters = allPlayers.filter(p => p.isStarter);
  const bench = allPlayers.filter(p => !p.isStarter);

  const { score: rosterHealthScore, gaps: positionalGaps } = calcRosterHealth(starters, bench);
  const injuryBlock = buildInjuryPromptBlock(injuryScores.filter(s => s.injuryRiskScore > 0));

  // Last week matchup + transactions
  const lastWeekResult = getLastWeekMatchup(matchups, teamId, currentWeek, ownerMap);
  const lastWeekTransactions = getWeekTransactions(transactions, teamId, currentWeek, ownerMap);

  const lastWeekSummary = lastWeekResult
    ? `${ownerName} ${lastWeekResult.won ? "won" : "lost"} ${lastWeekResult.teamScore}-${lastWeekResult.opponentScore} vs ${lastWeekResult.opponentOwner} in Week ${lastWeekResult.week}.${lastWeekTransactions.length > 0 ? ` Made ${lastWeekTransactions.length} transaction${lastWeekTransactions.length > 1 ? "s" : ""}.` : " No transactions."}`
    : "No matchup data available for last week.";

  // DNA profile
  const dna = dnaProfiles.get(teamId);
  const gmArchetype = dna?.gmArchetype ?? "Unknown";
  const exploitabilityScore = dna?.exploitabilityScore ?? 0;
  const tiltLabel = dna?.tilt.tiltLabel ?? "Unknown";

  // Live desperation
  let desperationScore = 0;
  let desperationLabel = "Neutral";
  let tradeWindowStatus = "NEUTRAL";

  if (dna) {
    const leagueAvgPPG = teams.reduce((s, t) => s + ((t.pointsFor as number) || 0), 0) / Math.max(teams.length, 1);
    const lastScore = lastWeekResult ? lastWeekResult.teamScore : leagueAvgPPG / currentWeek;
    const desp = calcTradeDesperationScore(dna, {
      season,
      currentWins: wins,
      currentLosses: losses,
      currentWeek,
      recentAcquisitions: lastWeekTransactions.filter(t => t.type === "ADD").length * 3,
      recentTrades: lastWeekTransactions.filter(t => t.type === "TRADE_IN" || t.type === "TRADE_OUT").length * 3,
      lastWeekScore: lastScore,
      leagueAvgScore: leagueAvgPPG / currentWeek,
    });
    desperationScore = desp.desperationScore;
    desperationLabel = desp.desperationLabel;
    tradeWindowStatus = desp.windowOpen ? "OPEN" : "CLOSED";
  }

  const playoffProbability = calcPlayoffProbability(wins, losses, teams.length);

  // Recommendations and opportunities
  const partialAssessment: Partial<TeamWeeklyAssessment> = {
    teamId, ownerName, wins, losses, starters, bench,
    positionalGaps, desperationScore, desperationLabel,
    lastWeekResult, lastWeekTransactions,
  };

  const theirRecommendations = generateTheirRecommendations(partialAssessment, starters, bench);

  const rodOpportunities = teamId !== rodTeamId
    ? generateRodOpportunities(partialAssessment, rodRosterGaps, desperationScore, exploitabilityScore)
    : [];

  const assessmentWithoutAI: Omit<TeamWeeklyAssessment, "aiGMBriefing"> & { isSeasonComplete: boolean } = {
    teamId, ownerName, teamName, season, week: currentWeek,
    isSeasonComplete,
    wins, losses, pointsFor: Math.round(pointsFor * 10) / 10,
    pointsAgainst: Math.round(pointsAgainst * 10) / 10,
    standingRank, playoffProbability,
    starters, bench, rosterHealthScore, positionalGaps,
    gmArchetype, exploitabilityScore, desperationScore,
    desperationLabel, tiltLabel, tradeWindowStatus,
    lastWeekResult, lastWeekTransactions, lastWeekSummary,
    theirRecommendations, rodOpportunities,
  };

  const aiGMBriefing = await generateAIBriefing(assessmentWithoutAI, injuryBlock);

  return { ...assessmentWithoutAI, aiGMBriefing };
}

/**
 * Builds the full 14-team weekly assessment report.
 * This is the main export — call once per week to generate the full briefing.
 */
export async function buildWeeklyAssessment(season: number): Promise<WeeklyLeagueAssessment> {
  const data = await getSeasonData(season);
  if (!data) throw new Error(`No cached data for season ${season}`);

  const teams = normalizeTeams(data);
  const rosters = normalizeRosters(data) as unknown[];
  const matchups = normalizeMatchups(data);
  const transactions = normalizeTransactions(data) as unknown[];
  const settings = normalizeSettings(data);

  const ownerMap: Record<number, string> = {};
  const teamNameMap: Record<number, string> = {};
  for (const t of teams) {
    ownerMap[t.teamId as number] = t.owners as string;
    teamNameMap[t.teamId as number] = (t.teamName as string) || (t.abbrev as string) || (t.owners as string) || "Unknown";
  }

  const currentWeek = (settings.currentMatchupPeriod as number) || 1;
  const rodTeamId = detectRodTeamId(teams);

  // Build DNA profiles for all managers
  const cachedSeasons = (await getAllCachedSeasons(null)).filter(s => s >= 2018);
  const allLeaguePicks: DraftPickRecord[] = [];
  const managerRawData: ManagerRawData[] = teams.map(t => ({
    memberId: String(t.teamId as number),
    ownerName: ownerMap[t.teamId as number] || "Unknown",
    seasonRecords: [],
    txnSeasons: [],
    draftPicks: [],
    h2hVsRod: { wins: 0, losses: 0 },
    currentSeason: null,
  }));

  const dnaProfiles = new Map<number, ReturnType<typeof calcManagerDNA>>();
  for (const mgr of managerRawData) {
    const dna = calcManagerDNA(mgr, allLeaguePicks);
    dnaProfiles.set(parseInt(mgr.memberId), dna);
  }

  // Get Rod's roster gaps for opportunity generation
  const rodRosters = (rosters as Array<Record<string, unknown>>)
    .filter(r => (r.teamId as number) === rodTeamId);
  const rodPlayerRows: PlayerRow[] = rodRosters.map(r => ({
    playerId: r.playerId as number,
    playerName: (r.playerName as string) || "Unknown",
    position: (r.position as string) || "?",
    teamId: r.teamId as number,
    ownerName: rodTeamId ? ownerMap[rodTeamId] : ENV.ownerName.split(" ")[0],
    seasonPoints: (r.appliedTotal as number) || 0,
    avgPoints: (r.appliedAverage as number) || 0,
    projectedTotal: null,
    keeperValue: 0,
    keeperValueFuture: 0,
    injuryStatus: "",
    appliedStats: {},
  }));
  const rodGaps = rodPlayerRows.length > 0
    ? calcRosterGaps(rodPlayerRows).flatMap(r => r.gaps.map(g => `${g.position} ${g.gapSeverity} (${g.deficit < 0 ? g.deficit : "+" + g.deficit} starters)`))
    : [];

  const allTeamsData = { teams, rosters, matchups, transactions, settings, ownerMap, teamNameMap };

  // Build assessments for all teams (run sequentially to avoid LLM rate limits)
  const teamAssessments: TeamWeeklyAssessment[] = [];
  for (const team of teams) {
    const assessment = await buildTeamAssessment(
      team.teamId as number, season, allTeamsData, dnaProfiles, rodGaps, rodTeamId
    );
    teamAssessments.push(assessment);
  }

  // Collect and rank Rod's opportunities across all teams
  const allRodOpportunities = teamAssessments
    .flatMap(t => t.rodOpportunities)
    .sort((a, b) => {
      const urgencyScore = { NOW: 3, THIS_WEEK: 2, MONITOR: 1 };
      return (urgencyScore[b.urgency] - urgencyScore[a.urgency]) ||
             ((b.desperationScore || 0) - (a.desperationScore || 0));
    })
    .slice(0, 10);

  // Generate league summary
  const leagueSummaryPrompt = `You are the GM War Room weekly league summary engine for Rod Sellers in ATLANTAS FINEST FF (Week ${currentWeek}, Season ${season}).

Key facts this week:
${teamAssessments.slice(0, 14).map(t => `${t.ownerName}: ${t.wins}-${t.losses} | Desperation: ${t.desperationScore}/100 | ${t.tradeWindowStatus}`).join("\n")}

Rod's team ID: ${rodTeamId}
Rod's top opportunities: ${allRodOpportunities.slice(0, 3).map(o => o.action).join(" | ")}

Write a 3-4 sentence executive summary of the league this week. Identify the biggest storylines, who is desperate, who is dominant, and Rod's single best action this week. Be specific and tactical.`;

  let leagueSummary = "";
  try {
    const resp = await invokeLLM({
      messages: [{ role: "user", content: leagueSummaryPrompt }],
    });
    const rawSummary = resp.choices?.[0]?.message?.content;
    leagueSummary = typeof rawSummary === "string" ? rawSummary : "";
  } catch {
    leagueSummary = `Week ${currentWeek} league summary: ${teamAssessments.filter(t => t.desperationScore >= 60).length} managers showing high desperation. Rod's top opportunity: ${allRodOpportunities[0]?.action ?? "Monitor the league this week."}`;
  }

  return {
    season,
    week: currentWeek,
    generatedAt: new Date().toISOString(),
    teams: teamAssessments,
    rodTeamId,
    leagueSummary,
    topOpportunities: allRodOpportunities,
  };
}

/**
 * Rod's opportunity board only — faster than the full assessment.
 * Use for the Command Center quick-launch.
 */
export async function buildRodOpportunityBoard(season: number): Promise<{
  week: number;
  opportunities: RodOpportunity[];
  summary: string;
}> {
  const full = await buildWeeklyAssessment(season);
  return {
    week: full.week,
    opportunities: full.topOpportunities,
    summary: full.leagueSummary,
  };
}
