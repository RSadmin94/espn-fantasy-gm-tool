/**
 * transactionAnalysisRouter.ts
 *
 * LLM-powered trade verdict for executed trades in the Transactions page.
 * Returns a structured JSON verdict: winner, headline, whyTheyWon, leagueImpact.
 * Auto-triggered per trade card — no manual button required.
 */
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { resolveActiveLeagueId } from "./db";
import { resolveLeaguePromptContext, buildLeaguePromptContext } from "./leaguePromptContext";

export interface TradeVerdict {
  winner: "TEAM_A" | "TEAM_B" | "FAIR";
  headline: string;
  whyTheyWon: string;
  leagueImpact: string;
}

export const transactionAnalysisRouter = router({
  /**
   * Analyze a single executed trade and return a structured verdict.
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
        return { ok: false as const, error: "setup_required", verdict: null };
      }

      const dateStr = input.processedDate
        ? new Date(input.processedDate).toLocaleDateString(undefined, {
            month: "short", day: "numeric", year: "numeric",
          })
        : "unknown date";

      const aReceived = input.assetsToA.length ? input.assetsToA.join(", ") : "nothing";
      const bReceived = input.assetsToB.length ? input.assetsToB.join(", ") : "nothing";

      const leagueCtx = await resolveLeaguePromptContext(userId || undefined, input.season);
      const { leagueDescriptor } = buildLeaguePromptContext(leagueCtx);

      const systemPrompt =
        "You are a sharp fantasy football analyst for " + leagueDescriptor + ". " +
        "Analyze the executed trade and return ONLY a JSON object — no markdown, no preamble, no trailing text:\n" +
        '{\n' +
        '  "winner": "TEAM_A" | "TEAM_B" | "FAIR",\n' +
        '  "headline": "one punchy sentence — who won and the core reason",\n' +
        '  "whyTheyWon": "2-3 sentences — the specific value gap, positional fit, or roster context",\n' +
        '  "leagueImpact": "1-2 sentences — what this trade shifts in the league: playoff odds, threat levels, or power balance"\n' +
        '}\n' +
        'Use TEAM_A and TEAM_B labels in winner field only. Use the actual team names in text fields. Be direct and honest.';

      const userPrompt =
        `Executed trade — ${input.season} season, ${dateStr}:\n\n` +
        `${input.teamA} received: ${aReceived}\n` +
        `${input.teamB} received: ${bReceived}\n\n` +
        `Return the JSON verdict.`;

      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: userPrompt },
          ],
          maxTokens: 400,
          callType: "retrospective",
          temperature: 0.35,
        });

        const raw = result.choices?.[0]?.message?.content;
        const rawStr =
          typeof raw === "string"
            ? raw.trim()
            : Array.isArray(raw)
              ? raw.map((c: any) => (c.text ?? "")).join("").trim()
              : null;

        if (!rawStr) return { ok: false as const, error: "empty_response", verdict: null };

        // Strip ```json fences if present
        const clean = rawStr.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

        let verdict: TradeVerdict | null = null;
        try {
          const parsed = JSON.parse(clean) as Partial<TradeVerdict>;
          if (parsed.winner && parsed.headline && parsed.whyTheyWon && parsed.leagueImpact) {
            verdict = {
              winner: (["TEAM_A", "TEAM_B", "FAIR"].includes(parsed.winner)) ? parsed.winner : "FAIR",
              headline: String(parsed.headline),
              whyTheyWon: String(parsed.whyTheyWon),
              leagueImpact: String(parsed.leagueImpact),
            };
          }
        } catch {
          // Fallback: treat raw text as a plain analysis
          verdict = {
            winner: "FAIR",
            headline: "Trade analyzed",
            whyTheyWon: rawStr.slice(0, 400),
            leagueImpact: "",
          };
        }

        return { ok: true as const, verdict };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[analyzeExecutedTrade] LLM error:", msg);
        return { ok: false as const, error: msg, verdict: null };
      }
    }),
});
