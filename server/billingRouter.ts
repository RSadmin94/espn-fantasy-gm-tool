/**
 * billingRouter.ts
 *
 * tRPC procedures for Stripe billing (V1 — Rivals monthly/annual only):
 *   billing.createCheckoutSession  — creates a Stripe Checkout session, returns URL
 *   billing.getSubscriptionStatus  — returns current user subscription state
 *   billing.createPortalSession    — creates a Stripe Customer Portal session for self-service
 *
 * All procedures are protected (require login).
 */
import { z } from "zod";
import { protectedProcedure, router, hasRivalsIntelligenceEntitlement, resolvePremiumAccess } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { stripe } from "./stripe/client";
import {
  STRIPE_BRAND,
  STRIPE_CHECKOUT_COPY,
  getPriceDefinition,
  intervalFromPriceId,
  planFromPriceId,
  type BillingInterval,
} from "./stripe/products";
import {
  toCheckoutIntervalWire,
  toStripeBillingInterval,
} from "./stripe/checkoutInterval";
import { resolveStripePriceId } from "./stripe/resolveCheckoutPrice";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { recordFunnelEvent } from "./funnelService";

const checkoutInput = z.object({
  origin: z.string().url(),
  /** Preferred wire values: monthly | annual. Legacy month | year still accepted. */
  interval: z.enum(["monthly", "annual", "month", "year"]).default("annual"),
  /** @deprecated V1 always checks out Rivals; ignored if present */
  plan: z.literal("rivals").optional(),
});

async function ensureStripeCustomer(userId: number, userRow: typeof users.$inferSelect) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  let customerId = userRow.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userRow.email ?? undefined,
      name: userRow.name ?? undefined,
      metadata: {
        userId: userId.toString(),
        app: "fantasy_football_rivals",
      },
    });
    customerId = customer.id;
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
  }
  return customerId;
}

function resolveConfiguredPriceId(interval: BillingInterval): string | null {
  return getPriceDefinition(interval).priceId || null;
}

export const billingRouter = router({
  createCheckoutSession: protectedProcedure
    .input(checkoutInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [userRow] = await db.select().from(users).where(eq(users.id, userId));
      if (!userRow) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const customerId = await ensureStripeCustomer(userId, userRow);
      const stripeInterval = toStripeBillingInterval(input.interval);
      const wireInterval = toCheckoutIntervalWire(input.interval);

      const priceId =
        resolveConfiguredPriceId(stripeInterval) ??
        (await resolveStripePriceId(stripe, stripeInterval));
      if (!priceId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `No active Rivals ${wireInterval} price configured. Run pnpm stripe:setup-products.`,
        });
      }

      // One Price only — never put monthly and annual in the same line_items array.
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${input.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/reveal`,
        client_reference_id: userId.toString(),
        custom_text: {
          submit: { message: STRIPE_CHECKOUT_COPY.submitMessage },
        },
        subscription_data: {
          description: STRIPE_CHECKOUT_COPY.rivalsSubscriptionDescription,
          metadata: {
            app: "fantasy_football_rivals",
            brand: STRIPE_BRAND.appName,
            plan: "rivals",
            interval: stripeInterval,
          },
        },
        metadata: {
          user_id: userId.toString(),
          customer_email: userRow.email ?? "",
          customer_name: userRow.name ?? "",
          product: "fantasy_football_rivals",
          plan: "rivals",
          interval: stripeInterval,
          price_id: priceId,
        },
      });

      if (!session.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe did not return a checkout URL" });
      }

      await recordFunnelEvent({
        userId,
        event: "checkout_opened",
        metadata: {
          plan: "rivals",
          interval: wireInterval,
          priceId,
          stripeSessionId: session.id,
        },
      });

      return { url: session.url, priceId, interval: wireInterval };
    }),

  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [userRow] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!userRow) throw new TRPCError({ code: "NOT_FOUND" });

    const now = Date.now();
    const trialStartedAt = userRow.trialStartedAt ? new Date(userRow.trialStartedAt).getTime() : null;
    const trialDaysLeft = trialStartedAt
      ? Math.max(0, Math.ceil((trialStartedAt + 7 * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000)))
      : null;
    const isTrialExpired = trialStartedAt !== null && trialDaysLeft === 0;
    const currentPeriodEnd = userRow.currentPeriodEnd ? new Date(userRow.currentPeriodEnd).getTime() : null;

    const plan =
      userRow.subscriptionPlan === "rivals"
        ? "rivals"
        : planFromPriceId(userRow.subscriptionPriceId) ??
          (userRow.subscriptionStatus === "active" ? "rivals" : null);
    const interval =
      userRow.subscriptionInterval ?? intervalFromPriceId(userRow.subscriptionPriceId);

    const hasRivalsAccess = hasRivalsIntelligenceEntitlement(userRow);

    return {
      status: userRow.subscriptionStatus,
      plan,
      interval,
      trialDaysLeft,
      isTrialExpired,
      currentPeriodEnd,
      hasAccess: hasRivalsAccess,
      hasRivalsAccess,
      subscriptionPriceId: userRow.subscriptionPriceId ?? null,
    };
  }),

  /**
   * Session-access claim for already-entitled accounts. Returns whether the
   * signed-in user is truly entitled per resolvePremiumAccess (paid OR founder
   * whitelist OR claimed founder owner-identity). The client uses this so an
   * entitled founder who clicks "Unlock Rivals Pro" flips the UI to full access
   * for the session instead of being routed to Stripe. Server data gates remain
   * the real enforcement — this only governs presentation.
   */
  claimSessionAccess: protectedProcedure.mutation(async ({ ctx }) => {
    return { granted: await resolvePremiumAccess(ctx.user) };
  }),

  createPortalSession: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [userRow] = await db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!userRow?.stripeCustomerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No billing account found" });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: userRow.stripeCustomerId,
        return_url: `${input.origin}/settings`,
      });

      return { url: session.url };
    }),
});
