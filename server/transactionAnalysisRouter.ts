/**
 * transactionAnalysisRouter.ts
 *
 * LLM-powered analysis for executed trades.
 * Called from the Transactions page when a user clicks "Analyze this trade."
 * Short analysis (2-3 sentences) — concise and honest about who won the trade.
 */
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { resolveActiveLeagueId } from "./db";

export const transactionAnalysisRouter = router({
  /**
   * Analyze a single executed trade.
   * Input is the rendered asset strings already assembled by the client.
   */
  analyzeExecutedTrade: publicProcedure
    .input(
      z.object({
        season:        z.number().int().min(2009).max(2030),
        teamA:         z.string().max(120),
        teamB:         z.string().max(120),
        assetsToA:     z.array(z.string().max(200)).max(20),
        assetsToB:     z.array(z.string().max(200)).max(20),
        processedDate: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id ?? 0;
      const { leagueId } = await resolveActiveLeagueId(
        { user: userId ? { id: userId } : undefined },
        null,
        input.season,
      );
      if (!leagueId || leagueId === "default") {
        return { ok: false as const, error: "setup_required", analysis: null };
      }

      const dateStr = input.processedDate
        ? new Date(input.processedDate).toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric",
          })
        : "unknown date";

      const aReceived = input.assetsToA.length ? input.assetsToA.join(", ") : "nothing";
      const bReceived = input.assetsToB.length ? input.assetsToB.join(", ") : "nothing";

      const systemPrompt =
        "You are a blunt, expert fantasy football analyst for a 14-team PPR keeper league. " +
        "Give sharp 2-3 sentence trade analysis. Be direct about who won and why. " +
        "Only use the information provided. Never fabricate stats.";

      const userPrompt =
        `Analyze this executed trade (${input.season} season, ${dateStr}):\n\n` +
        `${input.teamA} received: ${aReceived}\n` +
        `${input.teamB} received: ${bReceived}\n\n` +
        `Who got the better end of this trade and why? 2-3 sentences maximum.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 220,
          callType: "analysis",
          temperature: 0.4,
        });

        const raw = result.choices?.[0]?.message?.content;
        const analysis =
          typeof raw === "string"
            ? raw.trim()
            : Array.isArray(raw)
              ? raw.map((c: any) => (c.text ?? "")).join("").trim()
              : null;

        return { ok: true as const, analysis };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[analyzeExecutedTrade] LLM error:", msg);
        return { ok: false as const, error: msg, analysis: null };
      }
    }),
});
