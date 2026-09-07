export type ClerkPublishableKeySource = "CLERK_PUBLISHABLE_KEY" | "VITE_CLERK_PUBLISHABLE_KEY" | null;
export type ClerkKeyKind = "test" | "live" | "unknown" | "missing";

type EnvLike = Record<string, string | undefined>;

function trim(env: EnvLike, key: string): string {
  const v = env[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Backend `@clerk/express` reads `CLERK_PUBLISHABLE_KEY`. Vite exposes only `VITE_*`. */
export function resolveClerkPublishableKey(env: EnvLike = process.env): string {
  return trim(env, "CLERK_PUBLISHABLE_KEY") || trim(env, "VITE_CLERK_PUBLISHABLE_KEY");
}

export function clerkPublishableKeySource(env: EnvLike = process.env): ClerkPublishableKeySource {
  if (trim(env, "CLERK_PUBLISHABLE_KEY")) return "CLERK_PUBLISHABLE_KEY";
  if (trim(env, "VITE_CLERK_PUBLISHABLE_KEY")) return "VITE_CLERK_PUBLISHABLE_KEY";
  return null;
}

export function resolveClerkSecretKey(env: EnvLike = process.env): string {
  return trim(env, "CLERK_SECRET_KEY");
}

export function clerkPublishableKeyKind(key: string): ClerkKeyKind {
  if (!key) return "missing";
  if (key.startsWith("pk_test_")) return "test";
  if (key.startsWith("pk_live_")) return "live";
  return "unknown";
}

/**
 * Copy the Vite publishable key into `CLERK_PUBLISHABLE_KEY` when the server
 * variable is unset. Does not overwrite an explicit backend key. Never logs values.
 */
export function aliasClerkPublishableKey(env: EnvLike = process.env): ClerkPublishableKeySource {
  const source = clerkPublishableKeySource(env);
  if (source === "VITE_CLERK_PUBLISHABLE_KEY") {
    env.CLERK_PUBLISHABLE_KEY = trim(env, "VITE_CLERK_PUBLISHABLE_KEY");
  }
  return source;
}

export function clerkMiddlewareOptions(env: EnvLike = process.env): {
  publishableKey?: string;
  secretKey?: string;
} {
  const publishableKey = resolveClerkPublishableKey(env);
  const secretKey = resolveClerkSecretKey(env);
  return {
    ...(publishableKey ? { publishableKey } : {}),
    ...(secretKey ? { secretKey } : {}),
  };
}

/**
 * Human-readable configuration gap. Does not include key values.
 * Frontend still requires `VITE_CLERK_PUBLISHABLE_KEY` at build time.
 */
export function describeClerkConfigGap(env: EnvLike = process.env): string | null {
  const pk = resolveClerkPublishableKey(env);
  const sk = resolveClerkSecretKey(env);
  if (!pk && !sk) {
    return [
      "Clerk is not configured.",
      "Set VITE_CLERK_PUBLISHABLE_KEY for the frontend and CLERK_PUBLISHABLE_KEY plus CLERK_SECRET_KEY for the backend.",
      "Frontend and backend publishable keys must belong to the same Clerk instance.",
    ].join(" ");
  }
  if (!pk) {
    return "Clerk publishable key is missing. Set CLERK_PUBLISHABLE_KEY or VITE_CLERK_PUBLISHABLE_KEY.";
  }
  if (!sk) {
    return "CLERK_SECRET_KEY is missing. Sign-in UI may render, but session verification, Clerk API calls, and tRPC user provisioning will not work.";
  }
  return null;
}
