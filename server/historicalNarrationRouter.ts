/**
 * RFSN-053H — tRPC narrate. Client sends a verified Story Package; server narrates only that.
 */
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { isNarrationVoice, parseHistoricalStoryPackage } from "@shared/historicalStoryPackage";
import { NARRATION_EXPORT_ERROR } from "@shared/historicalNarration";
import { narrateHistoricalStory } from "./historicalNarration";

export const historicalNarrationRouter = router({
  narrate: publicProcedure
    .input(
      z.object({
        package: z.unknown(),
        voice: z.enum(["sofia", "coach", "roxanne", "cashier", "historian"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        return { ok: false as const, error: NARRATION_EXPORT_ERROR, narration: null, cacheHit: false };
      }
      const pkg = parseHistoricalStoryPackage(input.package);
      const voice = isNarrationVoice(input.voice) ? input.voice : "sofia";
      if (!pkg) {
        return { ok: false as const, error: NARRATION_EXPORT_ERROR, narration: null, cacheHit: false };
      }
      try {
        const out = await narrateHistoricalStory(pkg, voice);
        return { ok: true as const, error: null, narration: out.narration, cacheHit: out.cacheHit, key: out.key };
      } catch {
        return { ok: false as const, error: NARRATION_EXPORT_ERROR, narration: null, cacheHit: false };
      }
    }),
});
