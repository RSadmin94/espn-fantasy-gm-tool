/**
 * advisorContextBuilder.ts
 *
 * Shared helper that builds the GM Advisor system-prompt context string.
 * Used by both the tRPC advisor.chat mutation and the streaming SSE endpoint
 * so the context logic lives in exactly one place.
 */

import {
  normalizeSettings,
  normalizeTeams,
  normalizeRosters,
  normalizeDraftPicks,
  normalizeDraftOrder,
} from "./espnService";
import {
  calcVORP,
  calcPositionalScarcity,
  calcRosterGaps,
  type PlayerRow,
} from "./analytics";
import { buildAdvisorInjuryContext } from "./injuryAnalytics";
import { getCachedView, getChatHistory } from "./db";
import { memCache } from "./memCache";
import type { Message } from "./_core/llm";

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID || "457622";

async function getSeasonData(season: number) {
  return memCache(`seasonData:${season}`, 10 * 60_000, async () => {
    const cached = await getCachedView(season, "combined", null);
    return cached ? (cached.payload as Record<string, unknown>) : null;
  });
}

/**
 * Build the full system-prompt context string for the GM Advisor.
 * This is identical to the inline logic in routers.ts advisor.chat,
 * extracted here so the streaming endpoint can reuse it without duplication.
 *
 * @param season  ESPN season year (e.g. 2025)
 * @param gmMemoryBlock  Optional pre-built GM memory block to inject
 */
export async function buildAdvisorSystemPrompt(
  season: number,
  gmMemoryBlock?: string
): Promise<string> {
  let leagueContext = `You are an expert Fantasy Football GM advisor for the league "ATLANTAS FINEST FF" (League ID: ${LEAGUE_ID}).
This is an 18-season keeper league running from 2009 to 2026 with 14 teams.
Format: Head-to-Head Points, PPR (Point Per Reception), Snake Draft, 1 keeper per team.
Scoring positions: QB, RB, WR, TE, K, D/ST. Playoffs: 7 teams.
Be concise, data-driven, and specific. Reference actual team names and player names when possible.`;

  // Inject GM memory if provided
  if (gmMemoryBlock) {
    leagueContext += "\n\n" + gmMemoryBlock;
  }

  const data = await getSeasonData(season);
  if (data) {
    const teams = normalizeTeams(data);
    const settings = normalizeSettings(data);
    const teamOwnerMapAdvisor: Record<number, string> = {};
    for (const t of teams) teamOwnerMapAdvisor[t.teamId as number] = t.owners as string;
    const allPlayers: PlayerRow[] = (normalizeRosters(data) as unknown[]).map((r: unknown) => {
      const p = r as Record<string, unknown>;
      return {
        playerId: p.playerId as number,
        playerName: (p.playerName as string) || "Unknown",
        position: (p.position as string) || "?",
        teamId: p.teamId as number,
        ownerName: teamOwnerMapAdvisor[p.teamId as number] || "Unknown",
        seasonPoints: (p.appliedTotal as number) || 0,
        avgPoints: (p.appliedAverage as number) || 0,
        projectedTotal: (p.projectedTotal as number) || null,
        keeperValue: (p.keeperValue as number) || 0,
        keeperValueFuture: (p.keeperValueFuture as number) || 0,
        injuryStatus: (p.injuryStatus as string) || "",
        appliedStats: (p.appliedStats as Record<string, number>) || {},
      };
    });
    const calYear = new Date().getFullYear();
    const isSeasonComplete = (settings.currentMatchupPeriod as number || 0) >= 14 || season < calYear;
    const upcomingSeason = season + 1;
    if (isSeasonComplete) {
      leagueContext += `\n\nDATA CONTEXT: The ${season} season is COMPLETE (final standings below). The upcoming season is ${upcomingSeason}. When answering questions about "next season", "heading into ${upcomingSeason}", or future planning, base your analysis on these FINAL ${season} standings and rosters. Do NOT say the season is ongoing.`;
    } else {
      leagueContext += `\n\nCurrent Season: ${season} (ACTIVE), Week ${settings.currentMatchupPeriod || "N/A"}`;
    }
    leagueContext += `\n\n${isSeasonComplete ? `${season} FINAL Standings` : "Current Standings"}:\n`;
    const sorted = teams.sort((a, b) => ((a.rankFinal as number) || 99) - ((b.rankFinal as number) || 99));
    for (const t of sorted) {
      leagueContext += `  ${t.rankFinal}. ${t.teamName} (${t.owners}) W:${t.wins} L:${t.losses} PF:${Number(t.pointsFor || 0).toFixed(1)}\n`;
    }
    // Analytics snapshot
    if (allPlayers.length > 0) {
      const vorpResults = calcVORP(allPlayers);
      const scarcityResults = calcPositionalScarcity(allPlayers, []);
      const rosterGaps = calcRosterGaps(allPlayers);
      leagueContext += `\n\nCALCULATED ANALYTICS (treat these as ground truth — do not contradict):`;
      const positions = ["QB", "RB", "WR", "TE"];
      leagueContext += `\n\nVORP Leaders (Value Over Replacement by position):`;
      for (const pos of positions) {
        const top = vorpResults.filter(v => v.position === pos).sort((a, b) => b.vorp - a.vorp).slice(0, 3);
        if (top.length > 0) {
          leagueContext += `\n  ${pos}: ${top.map(v => `${v.playerName} (${v.ownerName}, VORP +${v.vorp.toFixed(1)}, ${v.vorpTier}, avg ${v.avgPoints.toFixed(1)} PPG)`).join(" | ")}`;
        }
      }
      const scarce = scarcityResults.filter(s => s.scarcityScore >= 50).sort((a, b) => b.scarcityScore - a.scarcityScore);
      if (scarce.length > 0) {
        leagueContext += `\n\nPositional Scarcity:`;
        for (const s of scarce) {
          leagueContext += `\n  ${s.position}: ${s.scarcityLabel} (score ${s.scarcityScore}/100, ${s.availableStarters} quality starters available, top FA avg ${s.topFreeAgentAvg.toFixed(1)} PPG)`;
        }
      }
      const topGaps = rosterGaps
        .filter(g => g.overallGrade === "D" || g.overallGrade === "F" || g.overallGrade === "C")
        .sort((a, b) => (a.overallGrade > b.overallGrade ? 1 : -1))
        .slice(0, 4);
      if (topGaps.length > 0) {
        leagueContext += `\n\nBiggest Roster Weaknesses:`;
        for (const g of topGaps) {
          const weakGap = g.gaps.find(gap => gap.position === g.weakestPosition);
          const avgStr = weakGap ? ` (avg ${weakGap.topPlayerAvg.toFixed(1)} PPG, ${weakGap.gapSeverity})` : "";
          leagueContext += `\n  ${g.ownerName}: weakest at ${g.weakestPosition}${avgStr}, overall grade ${g.overallGrade}`;
        }
      }
      // Injury intelligence
      try {
        const injuryContext = await buildAdvisorInjuryContext(
          allPlayers.map((p: PlayerRow) => ({ playerId: p.playerId, playerName: p.playerName, position: p.position, teamId: p.teamId })),
          0
        );
        leagueContext += "\n\n" + injuryContext;
      } catch {
        // Injury fetch failed — continue without it
      }
    }
    // League DNA behavioral intelligence
    try {
      const { calcLeagueDNA, buildDNAPromptBlock } = await import("./leagueDNA");
      const { buildManagerRawData } = await import("./dnaRouter");
      const managerRawData = await buildManagerRawData(null);
      if (managerRawData.length > 0) {
        const dnaProfiles = calcLeagueDNA(managerRawData);
        const dnaBlock = buildDNAPromptBlock(dnaProfiles);
        leagueContext += "\n\n" + dnaBlock;
      }
    } catch {
      // DNA unavailable — continue without it
    }
    // Draft order and keeper data
    try {
      // Derive the upcoming draft season without hardcoding any year:
      // If the active season is already the current calendar year or later, use it;
      // otherwise use season+1 (e.g. active=2025, calendar=2026 → upcoming=2026).
      // This will work correctly at every season rollover.
      const upcomingDraftSeason = season >= new Date().getFullYear() ? season : season + 1;
      const upcomingDraftData = await getSeasonData(upcomingDraftSeason);
      const draftData = upcomingDraftData ?? await getSeasonData(season);
      const draftLabelYear = upcomingDraftData ? upcomingDraftSeason : season;
      if (draftData) {
        const draftOrderData = normalizeDraftOrder(draftData as Record<string, unknown>);
        const pickOrder = draftOrderData.pickOrder || [];
        if (pickOrder.length > 0) {
          const draftDateMs = draftOrderData.draftDate as number;
          const draftDateStr = draftDateMs ? new Date(draftDateMs).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
          leagueContext += `\n\n## GROUND TRUTH — ${draftLabelYear} DRAFT ORDER (this overrides any prior conversation)`;
          leagueContext += `\nSnake Draft, ${draftOrderData.keeperCount || 1} keeper per team. Use this EXACT order — do NOT contradict it.`;
          leagueContext += `\nDraft Date: ${draftDateStr}`;
          leagueContext += `\nRound 1 Pick Order: ${pickOrder.map((p: Record<string, unknown>) => `#${p.position} ${p.owners}`).join(", ")}`;
          leagueContext += `\n(Round 2 reverses: #14 picks first, etc.)`;
        }
        const picks2025 = normalizeDraftPicks(draftData as Record<string, unknown>);
        const keepers = (picks2025 as Array<Record<string, unknown>>).filter(p => p.keeper === true || p.keeper === 1);
        if (keepers.length > 0) {
          leagueContext += `\n\n2025 KEEPER PICKS (players kept from prior season):`;
          for (const k of keepers) {
            leagueContext += `\n  Round ${k.roundId}: ${k.playerName} (${k.position}) → kept by ${k.ownerName || k.teamName}`;
          }
        }
      }
    } catch {
      // Draft order unavailable — continue without it
    }
  }

  return leagueContext;
}

/**
 * Build the full message array for the advisor (system + history + user message).
 */
export async function buildAdvisorMessages(opts: {
  userId: number;
  season: number;
  userMessage: string;
  gmMemoryBlock?: string;
}): Promise<Message[]> {
  const { userId, season, userMessage, gmMemoryBlock } = opts;
  const systemPrompt = await buildAdvisorSystemPrompt(season, gmMemoryBlock);
  const history = await getChatHistory(userId, season);
  return [
    { role: "system", content: systemPrompt },
    ...history.slice(-20).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: userMessage },
  ];
}
