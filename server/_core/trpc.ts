import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { User } from "../../drizzle/schema";
import { isFounderAccount, hasFounderOwnerIdentity } from "./founders";
import { isDemoAccount, DEMO_READONLY_MSG } from "./demoAccount";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

/**
 * Read-only demo guard. A recognized demo account (see demoAccount.ts) may READ freely but
 * is blocked from EVERY write: this middleware rejects any `mutation` originating from the
 * demo account. It is composed into publicProcedure, protectedProcedure, subscribedProcedure
 * and adminProcedure so the guarantee holds at the shared chokepoint — no per-endpoint audit,
 * no reliance on hidden buttons. For every non-demo user, and for all queries, it is a no-op.
 */
const blockDemoMutations = t.middleware(async ({ ctx, type, next }) => {
  if (type === "mutation" && isDemoAccount(ctx.user)) {
    throw new TRPCError({ code: "FORBIDDEN", message: DEMO_READONLY_MSG });
  }
  return next();
});

export const publicProcedure = t.procedure.use(blockDemoMutations);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.auth?.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(blockDemoMutations).use(requireUser);

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Single source of truth for "is this user entitled to paid features?":
 * an active subscription, or a trial started within the last 7 days.
 * Used by BOTH subscribedProcedure (hard gate) and per-feature freemium
 * gating (teaser redaction) so the two definitions never drift apart.
 */
export function isUserEntitled(
  user: Pick<User, "subscriptionStatus" | "trialStartedAt"> | null | undefined,
): boolean {
  if (!user) return false;
  if (user.subscriptionStatus === "active") return true;
  if (user.subscriptionStatus === "trialing" && user.trialStartedAt) {
    const elapsed = Date.now() - new Date(user.trialStartedAt).getTime();
    if (elapsed <= TRIAL_DURATION_MS) return true;
  }
  return false;
}

/** Rivals intelligence — active/trial billing (V1: Rivals is the only paid tier). */
export function hasRivalsIntelligenceEntitlement(
  user:
    | (Pick<User, "subscriptionStatus" | "trialStartedAt"> & {
        subscriptionPlan?: User["subscriptionPlan"] | null;
      })
    | null
    | undefined,
): boolean {
  return isUserEntitled(user);
}

/**
 * THE single premium-access predicate. Every paywall / teaser gate calls this so Founder /
 * Beta accounts bypass uniformly. Premium access = on the Founder whitelist, OR an active
 * subscription / live trial (isUserEntitled). The founder path never touches billing state.
 */
export function hasPremiumAccess(
  user:
    | (Pick<User, "openId" | "email" | "subscriptionStatus" | "trialStartedAt"> & {
        subscriptionPlan?: User["subscriptionPlan"] | null;
      })
    | null
    | undefined,
): boolean {
  if (isFounderAccount(user)) return true;
  return hasRivalsIntelligenceEntitlement(user);
}

/**
 * Async superset of hasPremiumAccess for request handlers. Premium access is granted by EITHER the
 * sync predicate (Founder Clerk-id / email whitelist + billing entitlement) OR a claimed founder
 * owner-identity (hasFounderOwnerIdentity, which reads the user's resolved owner). The cheap sync
 * path is checked first and short-circuits, so whitelisted / paying users never trigger the owner
 * lookup. Gates call THIS so founder access can come from the static whitelist OR a claimed owner.
 */
export async function resolvePremiumAccess(
  user:
    | (Pick<User, "openId" | "email" | "subscriptionStatus" | "trialStartedAt"> & {
        id?: number | null;
        subscriptionPlan?: User["subscriptionPlan"] | null;
      })
    | null
    | undefined,
): Promise<boolean> {
  if (!user) return false;
  if (hasPremiumAccess(user)) return true;
  if (typeof user.id === "number") return hasFounderOwnerIdentity({ id: user.id });
  return false;
}

/** Requires an active subscription or a non-expired trial. */
export const subscribedProcedure = t.procedure.use(blockDemoMutations).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.auth?.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!(await resolvePremiumAccess(ctx.user))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Rivals Pro is required for this feature. Continue with free previews, or unlock the complete story.",
      });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const adminProcedure = t.procedure.use(blockDemoMutations).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.auth?.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
