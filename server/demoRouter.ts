/**
 * demoRouter — one-click "Try Demo" sign-in.
 *
 * start() mints a short-lived Clerk SIGN-IN TOKEN (a "ticket") for the pre-provisioned demo
 * Clerk user identified by DEMO_ACCOUNT_CLERK_ID, and returns it to the client, which completes
 * the sign-in with Clerk's standard `ticket` strategy. This reuses Clerk auth end-to-end — no
 * new auth pattern, no password in the browser, no ESPN credentials. The resulting session is
 * the read-only demo account: every write is already blocked centrally (see _core/trpc.ts) and
 * the account is mounted onto the demo league read-only (see db.ts).
 *
 * The installed @clerk/backend build does not expose a signInTokens helper, so we call Clerk's
 * documented Backend REST endpoint directly with the server-side secret key (never sent to the
 * client). Dormant until DEMO_ACCOUNT_CLERK_ID is configured.
 */
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "./_core/trpc";

const CLERK_SIGN_IN_TOKENS_URL = "https://api.clerk.com/v1/sign_in_tokens";

function demoClerkId(): string | null {
  const first = (process.env.DEMO_ACCOUNT_CLERK_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return first ?? null;
}

export const demoRouter = router({
  /** Mint a single-use Clerk sign-in ticket for the demo account. */
  start: publicProcedure.mutation(async () => {
    const userId = demoClerkId();
    const secret = process.env.CLERK_SECRET_KEY;
    if (!userId || !secret) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "The demo isn't available right now.",
      });
    }

    let res: Response;
    try {
      res = await fetch(CLERK_SIGN_IN_TOKENS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_id: userId, expires_in_seconds: 300 }),
      });
    } catch {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not start the demo." });
    }

    if (!res.ok) {
      console.error("[demo] sign-in token mint failed:", res.status, await res.text().catch(() => ""));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not start the demo." });
    }

    const data = (await res.json().catch(() => null)) as { token?: string } | null;
    if (!data?.token) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not start the demo." });
    }

    return { ticket: data.token };
  }),
});
