/**
 * Provider Router
 *
 * tRPC procedures for multi-provider league management.
 * Handles: provider listing, league connection, Sleeper league lookup,
 * and the DNA generation onboarding flow.
 */

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getSupportedProviders, PROVIDER_INFO, getAdapter } from "./providers/registry";
import { getSleeperLeague } from "./providers/sleeperAdapter";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { leagueConnections } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Provider info ────────────────────────────────────────────────────────────

export const providerRouter = router({
  /**
   * List all providers with their status (live / coming_soon).
   */
  listProviders: publicProcedure.query(() => {
    return PROVIDER_INFO;
  }),

  /**
   * Validate a Sleeper league ID and return basic league info.
   * No auth required — Sleeper API is public.
   */
  validateSleeperLeague: publicProcedure
    .input(z.object({ leagueId: z.string().min(1) }))
    .query(async ({ input }) => {
      try {
        const res = await fetch(
          `https://api.sleeper.app/v1/league/${input.leagueId}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) {
          return { valid: false, error: `Sleeper returned ${res.status}` };
        }
        const data = await res.json() as {
          name: string;
          season: string;
          total_rosters: number;
          status: string;
          scoring_settings?: Record<string, number>;
        };
        const rec = data.scoring_settings?.["rec"] ?? 0;
        const scoringType = rec >= 1 ? "PPR" : rec >= 0.5 ? "Half PPR" : "Standard";
        return {
          valid: true,
          leagueName: data.name,
          season: data.season,
          teamCount: data.total_rosters,
          status: data.status,
          scoringType,
        };
      } catch (err) {
        return { valid: false, error: err instanceof Error ? err.message : "Network error" };
      }
    }),

  /**
   * Look up all Sleeper leagues for a given username.
   */
  getSleeperLeaguesForUser: publicProcedure
    .input(z.object({ username: z.string().min(1), season: z.number().default(2025) }))
    .query(async ({ input }) => {
      try {
        // First get user ID from username
        const userRes = await fetch(
          `https://api.sleeper.app/v1/user/${input.username}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!userRes.ok) {
          return { found: false, error: `User "${input.username}" not found on Sleeper` };
        }
        const user = await userRes.json() as { user_id: string; display_name: string };

        // Then get their leagues
        const leaguesRes = await fetch(
          `https://api.sleeper.app/v1/user/${user.user_id}/leagues/nfl/${input.season}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (!leaguesRes.ok) {
          return { found: false, error: "Could not fetch leagues" };
        }
        const leagues = await leaguesRes.json() as Array<{
          league_id: string;
          name: string;
          season: string;
          total_rosters: number;
          status: string;
        }>;

        return {
          found: true,
          userId: user.user_id,
          displayName: user.display_name,
          leagues: leagues.map(l => ({
            leagueId: l.league_id,
            name: l.name,
            season: l.season,
            teamCount: l.total_rosters,
            status: l.status,
          })),
        };
      } catch (err) {
        return { found: false, error: err instanceof Error ? err.message : "Network error" };
      }
    }),

  /**
   * Import a Sleeper league and generate its DNA profile.
   * Returns a streaming-friendly response with progress steps.
   */
  importSleeperLeague: protectedProcedure
    .input(z.object({
      leagueId: z.string().min(1),
      season: z.number().default(2025),
    }))
    .mutation(async ({ input, ctx }) => {
      const steps: string[] = [];

      steps.push("Connecting to Sleeper API...");
      const league = await getSleeperLeague(input.leagueId);
      steps.push(`Found league: ${league.settings.leagueName} (${league.teams.length} teams)`);

      steps.push("Analyzing roster compositions...");
      const rosterSummary = league.teams.map(t => {
        const roster = league.rosters.find(r => r.teamId === t.teamId);
        return {
          team: t.teamName,
          owner: t.ownerName,
          record: `${t.wins}-${t.losses}`,
          starters: roster?.slots.filter(s => s.slotType === "starter").length ?? 0,
        };
      });

      steps.push("Detecting behavioral patterns...");
      const txByTeam = new Map<string, number>();
      for (const tx of league.transactions) {
        txByTeam.set(tx.teamId, (txByTeam.get(tx.teamId) || 0) + 1);
      }

      steps.push("Mapping trade tendencies...");
      const tradesByTeam = new Map<string, number>();
      for (const tx of league.transactions.filter(t => t.type === "TRADE")) {
        tradesByTeam.set(tx.teamId, (tradesByTeam.get(tx.teamId) || 0) + 1);
      }

      steps.push("Building exploitability models...");

      // Generate DNA profile via LLM
      steps.push("Generating League DNA Profile...");
      const teamSummaries = league.teams.map(t => {
        const trades = tradesByTeam.get(t.teamId) || 0;
        const moves = txByTeam.get(t.teamId) || 0;
        return `${t.ownerName} (${t.wins}-${t.losses}, ${t.pointsFor} PF): ${trades} trades, ${moves} total moves`;
      }).join("\n");

      const dnaResponse = await invokeLLM({
        messages: [
          {
            role: "system" as const,
            content: `You are an expert fantasy football analyst. Analyze this Sleeper league and provide a DNA profile for each manager. For each manager, identify their archetype from: Aggressive Trader, Waiver Hawk, Draft & Hold, Contrarian, Reactive, Balanced, or Data-Driven. Return JSON matching the provided schema.`,
          },
          {
            role: "user" as const,
            content: `League: ${league.settings.leagueName} (${league.settings.season} season, ${league.settings.scoringType} scoring)
Teams and activity:\n${teamSummaries}\n\nGenerate the DNA profile.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "league_dna",
            strict: true,
            schema: {
              type: "object",
              properties: {
                leagueName: { type: "string" },
                season: { type: "number" },
                provider: { type: "string" },
                teamProfiles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      teamId: { type: "string" },
                      ownerName: { type: "string" },
                      archetype: { type: "string" },
                      archetypeReason: { type: "string" },
                      desperationScore: { type: "number" },
                      exploitabilityScore: { type: "number" },
                      keyTrait: { type: "string" },
                    },
                    required: ["teamId", "ownerName", "archetype", "archetypeReason", "desperationScore", "exploitabilityScore", "keyTrait"],
                    additionalProperties: false,
                  },
                },
                leagueSummary: { type: "string" },
              },
              required: ["leagueName", "season", "provider", "teamProfiles", "leagueSummary"],
              additionalProperties: false,
            },
          },
        },
      });

      const rawContent = dnaResponse.choices?.[0]?.message?.content;
      const dnaContent = typeof rawContent === "string" ? rawContent : null;
      let dnaProfile: unknown = null;
      try {
        dnaProfile = JSON.parse(dnaContent || "{}");
      } catch {
        dnaProfile = { error: "Failed to parse DNA profile" };
      }

      steps.push("League DNA Profile complete.");

      return {
        success: true,
        steps,
        league: {
          leagueId: input.leagueId,
          leagueName: league.settings.leagueName,
          season: league.settings.season,
          teamCount: league.teams.length,
          scoringType: league.settings.scoringType,
          currentWeek: league.settings.currentWeek,
          provider: "sleeper" as const,
        },
        teams: league.teams,
        matchupCount: league.matchups.length,
        transactionCount: league.transactions.length,
        dnaProfile,
      };
    }),

  /**
   * Get the current user's connected leagues.
   */
  getMyLeagues: protectedProcedure.query(async ({ ctx }) => {
    const database = await getDb();
    if (!database) return [];
    const rows = await database
      .select()
      .from(leagueConnections)
      .where(eq(leagueConnections.userId, ctx.user.id));
    return rows;
  }),
});
