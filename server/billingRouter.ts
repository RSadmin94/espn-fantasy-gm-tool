/**
 * billingRouter.ts
 *
 * tRPC procedures for Stripe billing:
 *   billing.createCheckoutSession  — creates a Stripe Checkout session, returns URL
 *   billing.getUpgradeQuote        — server-computed upgrade amounts (client never calculates)
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
  PRODUCTS,
  RIVALS_TO_LEAGUE_ANNUAL_UPGRADE_CENTS,
  STRIPE_BRAND,
  STRIPE_CHECKOUT_COPY,
  getPriceDefinition,
  intervalFromPriceId,
  planFromPriceId,
  type BillingInterval,
  type PaidPlan,
} from "./stripe/products";
import { resolveStripePriceId } from "./stripe/resolveCheckoutPrice";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { recordFunnelEvent } from "./funnelService";

const checkoutInput = z.object({
  origin: z.string().url(),
  plan: z.enum(["rivals", "league"]).default("rivals"),
  interval: z.enum(["month", "year"]).default("year"),
  /** Upgrade Rivals annual → League annual (+$20). Server validates eligibility. */
  upgradeToLeagueAnnual: z.boolean().optional(),
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

function resolveConfiguredPriceId(plan: PaidPlan, interval: BillingInterval): string | null {
  const def = getPriceDefinition(plan, interval);
  return def.priceId || null;
}

export const billingRouter = router({
  getUpgradeQuote: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const [userRow] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!userRow) throw new TRPCError({ code: "NOT_FOUND" });

    const priceId = userRow.subscriptionPriceId ?? null;
    const plan = userRow.subscriptionPlan ?? planFromPriceId(priceId);
    const interval = userRow.subscriptionInterval ?? intervalFromPriceId(priceId);

    const rivalsAnnual = PRODUCTS.rivals.annual;
    const leagueAnnual = PRODUCTS.league.annual;
    const leagueMonthly = PRODUCTS.league.monthly;

    const canUpgradeToLeagueAnnual =
      userRow.subscriptionStatus === "active" &&
      plan === "rivals" &&
      interval === "year";

    return {
      rivalsAnnualCents: rivalsAnnual.amount,
      leagueAnnualCents: leagueAnnual.amount,
      leagueMonthlyCents: leagueMonthly.amount,
      rivalsToLeagueAnnualUpgradeCents: RIVALS_TO_LEAGUE_ANNUAL_UPGRADE_CENTS,
      canUpgradeToLeagueAnnual,
      /** Monthly subscribers pay full annual price — no credit. */
      monthlyToAnnualChargesFullPrice: interval === "month",
      currentPlan: plan,
      currentInterval: interval,
      leagueCheckoutEnabled: false,
    };
  }),

  createCheckoutSession: protectedProcedure
    .input(checkoutInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [userRow] = await db.select().from(users).where(eq(users.id, userId));
      if (!userRow) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const customerId = await ensureStripeCustomer(userId, userRow);

      if (input.upgradeToLeagueAnnual) {
        const priceId = userRow.subscriptionPriceId ?? null;
        const plan = userRow.subscriptionPlan ?? planFromPriceId(priceId);
        const interval = userRow.subscriptionInterval ?? intervalFromPriceId(priceId);
        if (
          userRow.subscriptionStatus !== "active" ||
          plan !== "rivals" ||
          interval !== "year"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Annual upgrade credit applies only to active Rivals annual subscribers.",
          });
        }
        if (!userRow.stripeSubscriptionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No active subscription found for upgrade.",
          });
        }

        const leagueAnnualPriceId =
          resolveConfiguredPriceId("league", "year") ??
          (await resolveStripePriceId(stripe, "league", "year"));
        if (!leagueAnnualPriceId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "League annual price not configured. Run pnpm stripe:setup-products.",
          });
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: "payment",
          line_items: [
            {
              price_data: {
                currency: "usd",
                unit_amount: RIVALS_TO_LEAGUE_ANNUAL_UPGRADE_CENTS,
                product_data: {
                  name: "Upgrade to The League (Annual)",
                  description: `Upgrade from Rivals Annual to The League Annual (+$${(RIVALS_TO_LEAGUE_ANNUAL_UPGRADE_CENTS / 100).toFixed(2)})`,
                },
              },
              quantity: 1,
            },
          ],
          success_url: `${input.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.origin}/settings`,
          client_reference_id: userId.toString(),
          metadata: {
            user_id: userId.toString(),
            upgrade: "rivals_annual_to_league_annual",
            league_annual_price_id: leagueAnnualPriceId,
            subscription_id: userRow.stripeSubscriptionId,
          },
        });

        if (!session.url) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe did not return a checkout URL" });
        }

        await recordFunnelEvent({
          userId,
          event: "checkout_opened",
          metadata: { plan: "league", interval: "year", stripeSessionId: session.id },
        });

        return { url: session.url };
      }

      if (input.plan === "league") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The League checkout opens in Sprint 4. Rivals annual upgrade (+$20) is available for current Rivals annual subscribers.",
        });
      }

      const priceId =
        resolveConfiguredPriceId(input.plan, input.interval) ??
        (await resolveStripePriceId(stripe, input.plan, input.interval));
      if (!priceId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `No active ${input.plan} ${input.interval} price configured. Run pnpm stripe:setup-products.`,
        });
      }

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
            plan: input.plan,
            interval: input.interval,
          },
        },
        metadata: {
          user_id: userId.toString(),
          customer_email: userRow.email ?? "",
          customer_name: userRow.name ?? "",
          product: "fantasy_football_rivals",
          plan: input.plan,
          interval: input.interval,
          price_id: priceId,
        },
      });

      if (!session.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe did not return a checkout URL" });
      }

      await recordFunnelEvent({
        userId,
        event: "checkout_opened",
        metadata: { plan: input.plan, interval: input.interval, stripeSessionId: session.id },
      });

      return { url: session.url };
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
      userRow.subscriptionPlan ??
      planFromPriceId(userRow.subscriptionPriceId) ??
      (userRow.subscriptionStatus === "active" ? "rivals" : null);
    const interval =
      userRow.subscriptionInterval ?? intervalFromPriceId(userRow.subscriptionPriceId);

    const hasRivalsAccess = hasRivalsIntelligenceEntitlement(userRow);
    const hasLeagueAccess =
      userRow.subscriptionStatus === "active" && userRow.subscriptionPlan === "league";

    return {
      status: userRow.subscriptionStatus,
      plan,
      interval,
      trialDaysLeft,
      isTrialExpired,
      currentPeriodEnd,
      hasAccess: hasRivalsAccess,
      hasRivalsAccess,
      hasLeagueAccess,
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
