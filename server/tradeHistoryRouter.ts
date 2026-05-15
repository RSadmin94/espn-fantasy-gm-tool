/**
 * tradeHistoryRouter.ts
 *
 * Provides two endpoints:
 *  - tradeHistory.list  — returns all accepted trades for a season (or all seasons),
 *    grouped by transactionId, with players sent/received per team.
 *  - tradeHistory.grade — AI grades a single trade (WIN/FAIR/LOSS) with reasoning.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { getCachedView, getAllCachedSeasons } from "./db";
import { normalizeTransactions, normalizeTeams, normalizeRosters } from "./espnService";
import { getPFRStats } from "./fantasyDataService";
import { memCache } from "./memCache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeSide {
  teamId: number;
  ownerName: string;
  playersReceived: string[];   // players this team received
  playersSent: string[];       // players this team sent
}

export interface TradeRecord {
  transactionId: string;
  season: number;
  proposedDate: number | null;
  dateLabel: string;
  teamA: TradeSide;
  teamB: TradeSide;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSeasonDataRaw(season: number): Promise<Record<string, unknown> | null> {
  const cacheKey = `seasonData:${season}`;
  return memCache(cacheKey, 10 * 60_000, async () => {
    const cached = await getCachedView(season, "combined", null);
    return cached ? (cached.payload as Record<string, unknown>) : null;
  });
}

function buildOwnerMap(data: Record<string, unknown>): Map<number, string> {
  const teams = normalizeTeams(data) as Array<{ teamId: number; owners: string; teamName: string }>;
  const map = new Map<number, string>();
  for (const t of teams) {
    // 'owners' is a semicolon-joined string of owner names from normalizeTeams
    const name = t.owners ? t.owners.split(";")[0].trim() : t.teamName;
    map.set(t.teamId as number, name || `Team ${t.teamId}`);
  }
  return map;
}

export function buildTradesForSeason(season: number, data: Record<string, unknown>): TradeRecord[] {
  const ownerMap = buildOwnerMap(data);
  const txRows = normalizeTransactions(data) as Array<{
    season: number;
    transactionId: string | number;
    type: string;
    status: string;
    proposedDate: number | null;
    teamId: number;
    playerId: number | null;
    playerName: string | null;
    fromTeamId: number | null;
    toTeamId: number | null;
    itemType?: string;
  }>;

  // Filter to accepted trades:
  // - type === "TRADE" (older seasons)
  // - type === "TRADE_PROPOSAL" with status === "EXECUTED" (2026+ seasons)
  const tradeTxs = txRows.filter(t =>
    t.type === "TRADE" ||
    (t.type === "TRADE_PROPOSAL" && t.status === "EXECUTED")
  );

  // Group by transactionId
  const grouped = new Map<string, typeof tradeTxs>();
  for (const tx of tradeTxs) {
    const key = String(tx.transactionId);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(tx);
  }

  const trades: TradeRecord[] = [];

  for (const [txId, rows] of Array.from(grouped.entries())) {
    // Skip if no player rows (header-only rows with no items)
    const playerRows = rows.filter(r => r.playerName);
    if (playerRows.length === 0) continue;

    const proposedDate = rows[0].proposedDate ?? null;
    const dateLabel = proposedDate
      ? new Date(proposedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Unknown Date";

    // Collect all team IDs involved
    const teamIds = new Set<number>();
    for (const r of playerRows) {
      if (r.fromTeamId != null) teamIds.add(r.fromTeamId);
      if (r.toTeamId != null) teamIds.add(r.toTeamId);
    }

    if (teamIds.size < 2) continue; // need at least 2 teams

    const teamArr = Array.from(teamIds);
    const teamAId = teamArr[0];
    const teamBId = teamArr[1];

    const sides: Record<number, TradeSide> = {};
    for (const tid of teamArr) {
      sides[tid] = {
        teamId: tid,
        ownerName: ownerMap.get(tid) ?? `Team ${tid}`,
        playersReceived: [],
        playersSent: [],
      };
    }

    for (const r of playerRows) {
      if (!r.playerName) continue;
      const name = r.playerName;
      // fromTeamId sent the player, toTeamId received it
      if (r.fromTeamId && sides[r.fromTeamId]) sides[r.fromTeamId].playersSent.push(name);
      if (r.toTeamId && sides[r.toTeamId]) sides[r.toTeamId].playersReceived.push(name);
    }

    // Deduplicate player lists
    for (const side of Object.values(sides)) {
      side.playersReceived = Array.from(new Set(side.playersReceived));
      side.playersSent = Array.from(new Set(side.playersSent));
    }

    trades.push({
      transactionId: txId,
      season,
      proposedDate,
      dateLabel,
      teamA: sides[teamAId],
      teamB: sides[teamBId],
    });
  }

  // Sort newest first
  return trades.sort((a, b) => (b.proposedDate ?? 0) - (a.proposedDate ?? 0));
}

// ─── Router ───────────────────────────────────────────────────────────────────

// ─── Age Eval Helpers ────────────────────────────────────────────────────────

interface PlayerAgeStat {
  name: string;
  position: string;
  fantasyPoints: number | null;
  pprPoints: number | null;
  games: number | null;
  rushYds: number | null;
  recYds: number | null;
  tds: number | null;
  targets: number | null;
  passYds: number | null;
  passTDs: number | null;
}

interface TradeSideAge {
  ownerName: string;
  players: PlayerAgeStat[];
  totalFantasyPoints: number;
}

export interface TradeAgeResult {
  transactionId: string;
  season: number;
  dateLabel: string;
  weekEvaluated: number;
  lastUpdated: number;
  teamA: TradeSideAge;
  teamB: TradeSideAge;
  pointDifferential: number;
  agingGrade: "AGED WELL" | "FAIR" | "AGED POORLY";
  agingScore: number;
  verdict: string;
  narrative: string;
  teamANarrative: string;
  teamBNarrative: string;
  keyFactor: string;
}

function buildPlayerStatsMap(data: Record<string, unknown>): Map<string, { appliedTotal: number | null; position: string }> {
  const rosters = normalizeRosters(data) as Array<{ playerName: string; position: string; appliedTotal: number | null }>;
  const map = new Map<string, { appliedTotal: number | null; position: string }>();
  for (const r of rosters) {
    if (!r.playerName) continue;
    const key = r.playerName.toLowerCase();
    const existing = map.get(key);
    if (!existing || (r.appliedTotal ?? 0) > (existing.appliedTotal ?? 0)) {
      map.set(key, { appliedTotal: r.appliedTotal, position: r.position });
    }
  }
  return map;
}

async function computeAgeEval(
  trade: TradeRecord,
  statsMap: Map<string, { appliedTotal: number | null; position: string }>,
  currentWeek: number,
): Promise<TradeAgeResult> {
  async function resolvePlayerStats(name: string): Promise<PlayerAgeStat> {
    const espnStats = statsMap.get(name.toLowerCase());
    let pfrData: Awaited<ReturnType<typeof getPFRStats>> = null;
    try { pfrData = await getPFRStats(name); } catch { /* non-fatal */ }
    return {
      name,
      position: espnStats?.position ?? pfrData?.position ?? "?",
      fantasyPoints: espnStats?.appliedTotal ?? null,
      pprPoints: pfrData?.pfr2025?.pprPoints ?? null,
      games: pfrData?.pfr2025?.games ?? null,
      rushYds: pfrData?.pfr2025?.rushYds ?? null,
      recYds: pfrData?.pfr2025?.recYds ?? null,
      tds: pfrData?.pfr2025?.totalTDs ?? null,
      targets: pfrData?.pfr2025?.targets ?? null,
      passYds: pfrData?.pfr2025?.passYds ?? null,
      passTDs: pfrData?.pfr2025?.passTDs ?? null,
    };
  }

  const teamAPlayers = await Promise.all(trade.teamA.playersReceived.map(resolvePlayerStats));
  const teamBPlayers = await Promise.all(trade.teamB.playersReceived.map(resolvePlayerStats));
  const teamATotalPts = teamAPlayers.reduce((s, p) => s + (p.fantasyPoints ?? p.pprPoints ?? 0), 0);
  const teamBTotalPts = teamBPlayers.reduce((s, p) => s + (p.fantasyPoints ?? p.pprPoints ?? 0), 0);
  const diff = teamATotalPts - teamBTotalPts;

  let agingGrade: "AGED WELL" | "FAIR" | "AGED POORLY";
  if (diff > 30) agingGrade = "AGED WELL";
  else if (diff < -30) agingGrade = "AGED POORLY";
  else agingGrade = "FAIR";
  const agingScore = Math.max(1, Math.min(10, Math.round(5 + diff / 25)));

  function playerLine(p: PlayerAgeStat): string {
    const pts = p.fantasyPoints != null ? `${p.fantasyPoints.toFixed(1)} fantasy pts` : (p.pprPoints != null ? `${p.pprPoints.toFixed(1)} PPR pts` : "no stats");
    const extras: string[] = [];
    if (p.games != null) extras.push(`${p.games} games`);
    if (p.tds != null && p.tds > 0) extras.push(`${p.tds} TDs`);
    if (p.rushYds != null && p.rushYds > 0) extras.push(`${p.rushYds} rush yds`);
    if (p.recYds != null && p.recYds > 0) extras.push(`${p.recYds} rec yds`);
    if (p.passYds != null && p.passYds > 0) extras.push(`${p.passYds} pass yds`);
    if (p.targets != null && p.targets > 0) extras.push(`${p.targets} targets`);
    return `  - ${p.name} (${p.position}): ${pts}${extras.length ? " | " + extras.join(", ") : ""}`;
  }

  const contextBlock = `TRADE DATE: ${trade.dateLabel} (${trade.season} season)\nEVALUATED AT: Week ${currentWeek}\n\n${trade.teamA.ownerName} RECEIVED (${teamATotalPts.toFixed(1)} total pts):\n${teamAPlayers.map(playerLine).join("\n") || "  (no players)"}\n\n${trade.teamB.ownerName} RECEIVED (${teamBTotalPts.toFixed(1)} total pts):\n${teamBPlayers.map(playerLine).join("\n") || "  (no players)"}\n\nPOINT DIFFERENTIAL: ${trade.teamA.ownerName} is ${Math.abs(diff).toFixed(1)} pts ${diff >= 0 ? "ahead" : "behind"}`;

  const prompt = `You are an expert fantasy football analyst doing a weekly trade aging report for a 14-team PPR ESPN league.\n\nExplain WHY this trade is aging the way it is — specific reasons: injuries, breakouts, busts, role changes, coaching decisions, usage shifts, or unexpected performance.\n${contextBlock}\n\nRespond with JSON:\n{\n  "verdict": "<one punchy headline>",\n  "narrative": "<2-3 sentences on overall aging and key reasons>",\n  "teamANarrative": "<1-2 sentences on how Team A's received players performed and why>",\n  "teamBNarrative": "<1-2 sentences on how Team B's received players performed and why>",\n  "keyFactor": "<single biggest reason this trade aged this way>"\n}`;

  let verdict = agingGrade === "AGED WELL" ? `${trade.teamA.ownerName} is winning this trade` : agingGrade === "AGED POORLY" ? `${trade.teamA.ownerName} is losing this trade` : "This trade is roughly even so far";
  let narrative = "AI analysis unavailable.";
  let teamANarrative = "Analysis unavailable.";
  let teamBNarrative = "Analysis unavailable.";
  let keyFactor = "N/A";

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert fantasy football trade aging analyst. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "trade_age_eval",
          strict: true,
          schema: {
            type: "object",
            properties: {
              verdict: { type: "string" },
              narrative: { type: "string" },
              teamANarrative: { type: "string" },
              teamBNarrative: { type: "string" },
              keyFactor: { type: "string" },
            },
            required: ["verdict", "narrative", "teamANarrative", "teamBNarrative", "keyFactor"],
            additionalProperties: false,
          },
        },
      },
    });
    const content = response.choices?.[0]?.message?.content;
    if (content) {
      const parsed = typeof content === "string" ? JSON.parse(content) : content;
      verdict = parsed.verdict ?? verdict;
      narrative = parsed.narrative ?? narrative;
      teamANarrative = parsed.teamANarrative ?? teamANarrative;
      teamBNarrative = parsed.teamBNarrative ?? teamBNarrative;
      keyFactor = parsed.keyFactor ?? keyFactor;
    }
  } catch { /* use defaults */ }

  return {
    transactionId: trade.transactionId,
    season: trade.season,
    dateLabel: trade.dateLabel,
    weekEvaluated: currentWeek,
    lastUpdated: Date.now(),
    teamA: { ownerName: trade.teamA.ownerName, players: teamAPlayers, totalFantasyPoints: teamATotalPts },
    teamB: { ownerName: trade.teamB.ownerName, players: teamBPlayers, totalFantasyPoints: teamBTotalPts },
    pointDifferential: diff,
    agingGrade,
    agingScore,
    verdict,
    narrative,
    teamANarrative,
    teamBNarrative,
    keyFactor,
  };
}

export const tradeHistoryRouter = router({
  /**
   * Returns all trades for a given season (or all cached seasons if season = 0).
   */
  list: publicProcedure
    .input(z.object({
      season: z.number(),  // pass 0 for all seasons
    }))
    .query(async ({ input }) => {
      const allTrades: TradeRecord[] = [];

      if (input.season === 0) {
        const seasons = await getAllCachedSeasons(null);
        for (const s of seasons) {
          const data = await getSeasonDataRaw(s);
          if (!data) continue;
          allTrades.push(...buildTradesForSeason(s, data));
        }
      } else {
        const data = await getSeasonDataRaw(input.season);
        if (data) allTrades.push(...buildTradesForSeason(input.season, data));
      }

      return allTrades;
    }),

  /**
   * AI-grades a single trade. Returns grade (WIN/FAIR/LOSS) for each side plus overall analysis.
   */
  grade: publicProcedure
    .input(z.object({
      transactionId: z.string(),
      season: z.number(),
      teamAName: z.string(),
      teamAReceived: z.array(z.string()),
      teamASent: z.array(z.string()),
      teamBName: z.string(),
      teamBReceived: z.array(z.string()),
      teamBSent: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      const cacheKey = `tradeGrade:${input.transactionId}`;
      return memCache(cacheKey, 60 * 60_000, async () => {
        const prompt = `You are an expert fantasy football analyst evaluating a completed trade from the ${input.season} season.

TRADE DETAILS:
${input.teamAName} sent: ${input.teamASent.join(", ") || "nothing"}
${input.teamAName} received: ${input.teamAReceived.join(", ") || "nothing"}

${input.teamBName} sent: ${input.teamBSent.join(", ") || "nothing"}
${input.teamBName} received: ${input.teamBReceived.join(", ") || "nothing"}

Evaluate this trade from a PPR fantasy football perspective (14-team league, standard ESPN scoring).
Consider: player value at time of trade, positional scarcity, buy-low/sell-high timing, and overall fairness.

Return a JSON object with this exact structure:
{
  "teamAGrade": "WIN" | "FAIR" | "LOSS",
  "teamBGrade": "WIN" | "FAIR" | "LOSS",
  "teamAScore": <number 1-10>,
  "teamBScore": <number 1-10>,
  "summary": "<2-3 sentence overall trade summary>",
  "teamAAnalysis": "<1-2 sentences on why Team A won/lost/broke even>",
  "teamBAnalysis": "<1-2 sentences on why Team B won/lost/broke even>",
  "verdict": "<one-line headline verdict, e.g. 'Lopsided deal — Team A clearly won'>",
  "keyFactor": "<the single most important factor that determined the winner>"
}`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: "You are an expert fantasy football trade analyst. Always respond with valid JSON only." },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "trade_grade",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    teamAGrade: { type: "string", enum: ["WIN", "FAIR", "LOSS"] },
                    teamBGrade: { type: "string", enum: ["WIN", "FAIR", "LOSS"] },
                    teamAScore: { type: "number" },
                    teamBScore: { type: "number" },
                    summary: { type: "string" },
                    teamAAnalysis: { type: "string" },
                    teamBAnalysis: { type: "string" },
                    verdict: { type: "string" },
                    keyFactor: { type: "string" },
                  },
                  required: ["teamAGrade", "teamBGrade", "teamAScore", "teamBScore", "summary", "teamAAnalysis", "teamBAnalysis", "verdict", "keyFactor"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = response.choices?.[0]?.message?.content;
          if (!content) throw new Error("No content from LLM");
          return typeof content === "string" ? JSON.parse(content) : content;
        } catch (err) {
          return {
            teamAGrade: "FAIR",
            teamBGrade: "FAIR",
            teamAScore: 5,
            teamBScore: 5,
            summary: "Unable to grade this trade automatically.",
            teamAAnalysis: "Analysis unavailable.",
            teamBAnalysis: "Analysis unavailable.",
            verdict: "Grade unavailable",
            keyFactor: "N/A",
          };
        }
      });
    }),

  /**
   * Age-evaluate a single trade using actual season stats.
   * Cached 6 hours (refreshes weekly with new stats).
   */
  ageEval: publicProcedure
    .input(z.object({
      transactionId: z.string(),
      season: z.number(),
    }))
    .query(async ({ input }) => {
      const cacheKey = `tradeAge:${input.transactionId}:${input.season}`;
      return memCache(cacheKey, 6 * 60 * 60_000, async () => {
        const data = await getSeasonDataRaw(input.season);
        if (!data) return null;
        const trades = buildTradesForSeason(input.season, data);
        const trade = trades.find(t => t.transactionId === input.transactionId);
        if (!trade) return null;
        const statsMap = buildPlayerStatsMap(data);
        const currentWeek = (data.status as Record<string, unknown>)?.latestScoringPeriod as number ?? 1;
        return computeAgeEval(trade, statsMap, currentWeek);
      });
    }),

  /**
   * Age-evaluate ALL trades for a season (or all seasons) in one call.
   * Returns array sorted by absolute point differential (biggest movers first).
   * Cached per-season for 6 hours.
   */
  allAged: publicProcedure
    .input(z.object({
      season: z.number(),  // 0 = all seasons
    }))
    .query(async ({ input }) => {
      const results: TradeAgeResult[] = [];
      const seasons = input.season === 0
        ? await getAllCachedSeasons(null)
        : [input.season];

      for (const s of seasons) {
        const cacheKey = `tradeAllAged:${s}`;
        const seasonResults = await memCache(cacheKey, 6 * 60 * 60_000, async () => {
          const data = await getSeasonDataRaw(s);
          if (!data) return [];
          const trades = buildTradesForSeason(s, data);
          if (trades.length === 0) return [];
          const statsMap = buildPlayerStatsMap(data);
          const currentWeek = (data.status as Record<string, unknown>)?.latestScoringPeriod as number ?? 1;
          return Promise.all(trades.map(t => computeAgeEval(t, statsMap, currentWeek)));
        });
        results.push(...(seasonResults as TradeAgeResult[]));
      }

      return results.sort((a, b) => Math.abs(b.pointDifferential) - Math.abs(a.pointDifferential));
    }),
});
