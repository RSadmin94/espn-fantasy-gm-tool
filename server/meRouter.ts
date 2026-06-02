import { router, publicProcedure } from "./_core/trpc";
import { resolveActiveProfile } from "./db";

/**
 * `me` router — data scoped to the authenticated user.
 *
 * activeProfile returns the user's selected league/team identity via
 * resolveActiveProfile(). Uses publicProcedure so anonymous callers receive a
 * stable "not set up" profile (isSetupComplete: false) instead of an error,
 * which keeps client-side fallbacks simple.
 */
export const meRouter = router({
  activeProfile: publicProcedure.query(async ({ ctx }) => {
    return resolveActiveProfile(ctx.user ?? null);
  }),
});