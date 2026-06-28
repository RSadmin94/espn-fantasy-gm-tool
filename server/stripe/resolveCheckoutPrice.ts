import type Stripe from "stripe";
import { ENV } from "../_core/env";
import {
  PRODUCTS,
  type BillingInterval,
  type PaidPlan,
  getPriceDefinition,
} from "./products";

export async function resolveStripePriceId(
  stripe: Stripe,
  plan: PaidPlan,
  interval: BillingInterval,
): Promise<string | null> {
  const def = getPriceDefinition(plan, interval);
  if (def.priceId) return def.priceId;

  const prices = await stripe.prices.list({ active: true, limit: 100 });
  const productName = PRODUCTS[plan].productName;
  const found = prices.data.find((p) => {
    if (p.unit_amount !== def.amount || p.currency !== def.currency) return false;
    if (p.recurring?.interval !== def.interval) return false;
    const product = p.product;
    if (!product || typeof product === "string") return false;
    return false;
  });
  void productName;
  return found?.id ?? null;
}

/** @deprecated Use resolveStripePriceId("rivals", "year") */
export async function resolveRivalsProAnnualPriceId(stripe: Stripe): Promise<string | null> {
  const configured = ENV.stripePriceIdAnnual || PRODUCTS.rivals.annual.priceId;
  if (configured) return configured;
  return resolveStripePriceId(stripe, "rivals", "year");
}
