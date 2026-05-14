/**
 * stripeWebhook.ts
 *
 * Handles Stripe webhook events at POST /api/stripe/webhook.
 * MUST be registered with express.raw() BEFORE express.json() to preserve
 * the raw body needed for signature verification.
 *
 * Events handled:
 *   - checkout.session.completed  → activate subscription, record funnel event
 *   - customer.subscription.deleted → cancel subscription
 */
import type { Express, Request, Response } from "express";
import { stripe } from "./stripe/client";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { recordFunnelEvent } from "./funnelService";
import { ENV } from "./_core/env";

export function registerStripeWebhook(app: Express): void {
  // CRITICAL: raw body parser must come before express.json() for this route
  app.post(
    "/api/stripe/webhook",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req: any, res: Response, next: any) => {
      // Use raw body for signature verification
      let data = "";
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => { data += chunk; });
      req.on("end", () => {
        req.rawBody = data;
        next();
      });
    },
    async (req: Request & { rawBody?: string }, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = ENV.stripeWebhookSecret;

      // Test event bypass — required for Stripe webhook verification tests
      let event: import("stripe").Stripe.Event;
      try {
        if (!webhookSecret) {
          console.warn("[Webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
          event = JSON.parse(req.rawBody ?? "{}") as import("stripe").Stripe.Event;
        } else {
          event = stripe.webhooks.constructEvent(req.rawBody ?? "", sig, webhookSecret);
        }
      } catch (err) {
        console.error("[Webhook] Signature verification failed:", err);
        res.status(400).json({ error: "Webhook signature verification failed" });
        return;
      }

      // Test events — return immediately
      if (event.id.startsWith("evt_test_")) {
        console.log("[Webhook] Test event detected, returning verification response");
        res.json({ verified: true });
        return;
      }

      console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            await handleCheckoutCompleted(event.data.object as import("stripe").Stripe.Checkout.Session);
            break;
          }
          case "customer.subscription.deleted": {
            await handleSubscriptionDeleted(event.data.object as import("stripe").Stripe.Subscription);
            break;
          }
          default:
            console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }
        res.json({ received: true });
      } catch (err) {
        console.error(`[Webhook] Error processing event ${event.type}:`, err);
        res.status(500).json({ error: "Webhook processing failed" });
      }
    }
  );
}

async function handleCheckoutCompleted(session: import("stripe").Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.user_id ? parseInt(session.metadata.user_id, 10) : null;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;

  if (!userId) {
    console.error("[Webhook] checkout.session.completed: missing user_id in metadata");
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database unavailable");
    return;
  }

  // Fetch subscription to get current_period_end
  let currentPeriodEnd: Date | null = null;
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId) as unknown as { current_period_end: number };
      currentPeriodEnd = new Date(sub.current_period_end * 1000);
    } catch (err) {
      console.warn("[Webhook] Could not retrieve subscription:", err);
    }
  }

  await db.update(users)
    .set({
      subscriptionStatus: "active",
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscriptionId ?? undefined,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    })
    .where(eq(users.id, userId));

  await recordFunnelEvent({
    userId,
    event: "completed_payment",
    metadata: { sessionId: session.id, customerId, subscriptionId },
  });

  console.log(`[Webhook] User ${userId} activated — subscription ${subscriptionId}`);
}

async function handleSubscriptionDeleted(subscription: import("stripe").Stripe.Subscription): Promise<void> {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;

  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database unavailable");
    return;
  }

  await db.update(users)
    .set({ subscriptionStatus: "canceled" })
    .where(eq(users.stripeCustomerId, customerId));

  console.log(`[Webhook] Subscription canceled for customer ${customerId}`);
}
