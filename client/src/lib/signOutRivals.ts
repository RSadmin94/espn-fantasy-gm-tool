import { setSessionUnlocked } from "@/lib/rivalsProSessionUnlock";
import { setTrpcToken } from "@/lib/trpcAuth";

export const RIVALS_AFTER_SIGN_OUT_URL = "/sign-in";

/**
 * Google OIDC prompt forwarded through Clerk so the next Google login
 * shows "Choose an account" instead of silently reusing the last identity.
 * Does not log the user out of Google itself.
 */
export const CLERK_GOOGLE_ACCOUNT_PICKER = {
  oidcPrompt: "select_account",
} as const;

export type RivalsSignOutFn = (opts?: { redirectUrl?: string }) => Promise<unknown> | unknown;

export type RivalsQueryCache = {
  clear: () => void;
};

/**
 * Destroy the Fantasy Football Rivals application session.
 *
 * Clears in-memory tRPC bearer, the session-scoped Pro unlock flag, and
 * React Query caches so a later Google identity cannot see Account A data.
 * ESPN/league rows stay on the server keyed by user id — they are not deleted.
 */
export async function signOutOfRivals(args: {
  signOut: RivalsSignOutFn;
  queryClient?: RivalsQueryCache | null;
}): Promise<void> {
  setSessionUnlocked(false);
  setTrpcToken(null);
  args.queryClient?.clear();
  await args.signOut({ redirectUrl: RIVALS_AFTER_SIGN_OUT_URL });
}
