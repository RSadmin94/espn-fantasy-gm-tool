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
    const cached = await getCachedView(season, "combined");
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
  let leagueContext = `You are the War Room AI — the ruthlessly sharp, entertainingly honest GM advisor for "ATLANTAS FINEST FF" (League ID: ${LEAGUE_ID}), an 18-season keeper league (2009–2026) with 14 teams.
Format: Head-to-Head Points, PPR, Snake Draft, 1 keeper per team. Scoring: QB, RB, WR, TE, K, D/ST. Playoffs: 7 teams.

Personality: You are confident, direct, and occasionally savage — like a front-office analyst who has seen every bad trade and every panic waiver pickup. You call out bad decisions without sugarcoating, celebrate smart moves, and always back your takes with actual data. You use vivid language and sports-media energy (think The Ringer meets a war room whiteboard). Never be generic. Never hedge. If a trade is a robbery, say so. If a roster is a mess, name the problem. If a pickup is a no-brainer, make it sound like one.

Rules: Always reference actual team names, owner names, and player names. Be concise — no padding, no filler. Lead with the verdict, then back it up with data. Use numbers when you have them.`;

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
  // ── Full career history block (all cached seasons) ──────────────────────────
  try {
    const { getAllCachedSeasons, getCachedView } = await import("./db");
    const allSeasons = (await getAllCachedSeasons()).sort((a, b) => a - b);
    if (allSeasons.length > 0) {
      // Aggregate career W/L, championships, playoff appearances per owner
      const careerMap = new Map<string, {
        name: string;
        wins: number; losses: number;
        championships: number; runnerUps: number;
        playoffAppearances: number;
        seasons: number;
        bestFinish: number;
        worstFinish: number;
      }>();

      for (const s of allSeasons) {
        const row = await getCachedView(s, 'combined');
        if (!row) continue;
        const d = row.payload as Record<string, unknown>;
        const members = (d.members as Record<string, unknown>[]) ?? [];
        const teams = (d.teams as Record<string, unknown>[]) ?? [];
        const schedule = (d.schedule as Record<string, unknown>[]) ?? [];

        // Determine champion from completed winners bracket
        let championTeamId: number | null = null;
        let runnerUpTeamId: number | null = null;
        const completedPlayoffs = (schedule as Record<string, unknown>[]).filter(
          (m) => m.playoffTierType === 'WINNERS_BRACKET' && m.winner && m.winner !== 'UNDECIDED'
        );
        if (completedPlayoffs.length > 0) {
          const champMatchup = completedPlayoffs.reduce((a, b) =>
            (a.matchupPeriodId as number) >= (b.matchupPeriodId as number) ? a : b
          );
          if (champMatchup.winner === 'HOME') {
            championTeamId = (champMatchup.home as Record<string, unknown>)?.teamId as number ?? null;
            runnerUpTeamId = (champMatchup.away as Record<string, unknown>)?.teamId as number ?? null;
          } else if (champMatchup.winner === 'AWAY') {
            championTeamId = (champMatchup.away as Record<string, unknown>)?.teamId as number ?? null;
            runnerUpTeamId = (champMatchup.home as Record<string, unknown>)?.teamId as number ?? null;
          }
        }

        for (const team of teams) {
          const t = team as Record<string, unknown>;
          const primaryOwner = (t.primaryOwner as string) || ((t.owners as string[])?.[0] ?? '');
          if (!primaryOwner) continue;
          const memberInfo = members.find((m) => (m as Record<string, unknown>).id === primaryOwner) as Record<string, unknown> | undefined;
          const displayName = [memberInfo?.firstName, memberInfo?.lastName].filter(Boolean).join(' ') ||
            (memberInfo?.displayName as string) || primaryOwner;
          const overall = ((t.record as Record<string, unknown>)?.overall ?? {}) as Record<string, unknown>;
          const wins = (overall.wins as number) ?? 0;
          const losses = (overall.losses as number) ?? 0;
          const rankFinal = (t.rankFinal as number) ?? 0;
          const playoffSeed = (t.playoffSeed as number) ?? 0;
          const madePlayoffs = playoffSeed > 0;
          const isChamp = t.id === championTeamId;
          const isRunnerUp = t.id === runnerUpTeamId;

          if (!careerMap.has(primaryOwner)) {
            careerMap.set(primaryOwner, { name: displayName, wins: 0, losses: 0, championships: 0, runnerUps: 0, playoffAppearances: 0, seasons: 0, bestFinish: 99, worstFinish: 0 });
          }
          const c = careerMap.get(primaryOwner)!;
          c.wins += wins;
          c.losses += losses;
          c.seasons++;
          if (madePlayoffs) c.playoffAppearances++;
          if (isChamp) c.championships++;
          if (isRunnerUp) c.runnerUps++;
          if (rankFinal > 0 && rankFinal < c.bestFinish) c.bestFinish = rankFinal;
          if (rankFinal > c.worstFinish) c.worstFinish = rankFinal;
        }
      }

      if (careerMap.size > 0) {
        const entries = Array.from(careerMap.values())
          .filter(c => c.seasons >= 1)
          .sort((a, b) => b.championships - a.championships || b.wins - a.wins);

        leagueContext += `\n\n## CAREER HISTORY (${allSeasons[0]}–${allSeasons[allSeasons.length - 1]}, ${allSeasons.length} seasons — treat as ground truth):`;
        for (const c of entries) {
          const winPct = (c.wins + c.losses) > 0 ? ((c.wins / (c.wins + c.losses)) * 100).toFixed(0) : '0';
          const champStr = c.championships > 0 ? ` 🏆×${c.championships}` : '';
          const rrStr = c.runnerUps > 0 ? ` 🥈×${c.runnerUps}` : '';
          const playoffStr = `${c.playoffAppearances}/${c.seasons} playoff appearances`;
          leagueContext += `\n  ${c.name}: ${c.wins}W-${c.losses}L (${winPct}% win rate)${champStr}${rrStr} | ${playoffStr} | Best finish: #${c.bestFinish}`;
        }

        // Highlight dynasty / drought narratives
        const dynasties = entries.filter(c => c.championships >= 2);
        const neverWon = entries.filter(c => c.championships === 0 && c.seasons >= 5);
        const dominantPlayoff = entries.filter(c => c.seasons >= 5 && c.playoffAppearances / c.seasons >= 0.7);
        if (dynasties.length > 0) {
          leagueContext += `\n\nDYNASTY ALERT: ${dynasties.map(d => `${d.name} (${d.championships} championships)`).join(', ')} — multi-time champions, proven winners.`;
        }
        if (neverWon.length > 0) {
          leagueContext += `\nCHAMPIONSHIP DROUGHT: ${neverWon.map(n => `${n.name} (0 titles in ${n.seasons} seasons)`).join(', ')} — historically motivated to break through.`;
        }
        if (dominantPlayoff.length > 0) {
          leagueContext += `\nPLAYOFF MACHINES: ${dominantPlayoff.map(p => `${p.name} (${p.playoffAppearances}/${p.seasons} seasons)`).join(', ')} — consistently dangerous.`;
        }
      }
    }
  } catch {
    // Career history unavailable — continue without it
  }

  // League DNA behavioral intelligence
  try {
    const { calcLeagueDNA, buildDNAPromptBlock } = await import("./leagueDNA");
    const { buildManagerRawData } = await import("./dnaRouter");
    const managerRawData = await buildManagerRawData();
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
