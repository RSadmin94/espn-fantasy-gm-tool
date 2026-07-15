/**
 * transactionAnalysisRouter.ts
 *
 * Trade verdict for executed trades in the Transactions page.
 * Pick-only trades use deterministic math from tradePickValueAuthority.
 * Mixed/player trades still use LLM prose; pick-only winner is math-locked.
 */
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { resolveActiveLeagueId, getCachedView } from "./db";
import { resolveLeaguePromptContext, buildLeaguePromptContext } from "./leaguePromptContext";
import {
  compareReceivedSideTotals,
  parsePickLabel,
  sumPickLabels,
} from "./tradePickValueAuthority";
import { resolveKeeperDraftGeometryForSeason } from "./keeperDraftGeometry";

export interface TradeVerdict {
  winner: "TEAM_A" | "TEAM_B" | "FAIR";
  headline: string;
  whyTheyWon: string;
  leagueImpact: string;
}

function allLabelsArePicks(labels: string[]): boolean {
  return labels.length > 0 && labels.every((l) => parsePickLabel(l) != null);
}

function deterministicPickVerdict(args: {
  teamA: string;
  teamB: string;
  assetsToA: string[];
  assetsToB: string[];
  teamCount: number;
}): TradeVerdict | null {
  if (!allLabelsArePicks(args.assetsToA) || !allLabelsArePicks(args.assetsToB)) {
    return null;
  }
  const receivedA = sumPickLabels(args.assetsToA, args.teamCount, "raw");
  const receivedB = sumPickLabels(args.assetsToB, args.teamCount, "raw");
  if (!Number.isFinite(receivedA) || !Number.isFinite(receivedB)) return null;

  const cmp = compareReceivedSideTotals(receivedA, receivedB);
  const winner: TradeVerdict["winner"] =
    cmp.winner === "A" ? "TEAM_A" : cmp.winner === "B" ? "TEAM_B" : "FAIR";

  const winnerName =
    winner === "TEAM_A" ? args.teamA : winner === "TEAM_B" ? args.teamB : null;
  const loserName =
    winner === "TEAM_A" ? args.teamB : winner === "TEAM_B" ? args.teamA : null;

  const headline =
    winner === "FAIR"
      ? `${args.teamA} and ${args.teamB} exchanged comparable pick value.`
      : `${winnerName} won the pick swap by ${Math.round(cmp.margin)} value points.`;

  const whyTheyWon =
    winner === "FAIR"
      ? `${args.teamA} received ${args.assetsToA.join(", ")} (${Math.round(receivedA)} value) and ${args.teamB} received ${args.assetsToB.join(", ")} (${Math.round(receivedB)} value) — within the fairness band.`
      : `${winnerName} received ${winner === "TEAM_A" ? args.assetsToA.join(", ") : args.assetsToB.join(", ")} (${Math.round(winner === "TEAM_A" ? receivedA : receivedB)} value) versus ${loserName}'s ${winner === "TEAM_A" ? args.assetsToB.join(", ") : args.assetsToA.join(", ")} (${Math.round(winner === "TEAM_A" ? receivedB : receivedA)} value).`;

  return {
    winner,
    headline,
    whyTheyWon,
    leagueImpact: "Pick capital shifted on the trade block; roster impact lands at draft time.",
  };
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

      const seasonData = await (async () => {
        const cached = await getCachedView(input.season, "combined", leagueId, {
          userId: userId || undefined,
        });
        return cached ? (cached.payload as Record<string, unknown>) : null;
      })();
      const geo = seasonData
        ? await resolveKeeperDraftGeometryForSeason(
            String(leagueId),
            input.season,
            userId || undefined,
            seasonData as Record<string, unknown>,
          )
        : { teamCount: 0, roundCount: 0, draftSlotCount: 0 };
      const teamCount = geo.teamCount > 0 ? geo.teamCount : 14;

      const mathVerdict = deterministicPickVerdict({
        teamA: input.teamA,
        teamB: input.teamB,
        assetsToA: input.assetsToA,
        assetsToB: input.assetsToB,
        teamCount,
      });
      if (mathVerdict) {
        return { ok: true as const, verdict: mathVerdict };
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
