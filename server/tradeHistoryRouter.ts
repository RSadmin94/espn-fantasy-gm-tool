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
import { normalizeTransactions, normalizeTeams } from "./espnService";
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

  // Filter to TRADE type only
  const tradeTxs = txRows.filter(t => t.type === "TRADE");

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
});
