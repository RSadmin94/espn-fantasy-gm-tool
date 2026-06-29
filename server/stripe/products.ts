/**
 * Centralized Stripe product and price definitions — Fantasy Football Rivals (V1).
 * V1 sells Rivals only (monthly + annual). Commissioner / "The League" tier is deferred.
 * All billing code imports from here; never hardcode price IDs in routers.
 */

export const STRIPE_BRAND = {
  appName: "Fantasy Football Rivals",
} as const;

export const STRIPE_CHECKOUT_COPY = {
  submitMessage: "Unlock competitive intelligence for your league.",
  rivalsDescription:
    "Rivals — weekly intelligence, trade and draft tools, full rivalries, deep records, and GM Advisor.",
  rivalsSubscriptionDescription:
    "Rivals — competitive intelligence for your fantasy league.",
} as const;

export type BillingInterval = "month" | "year";

export type PriceDefinition = {
  priceId: string;
  amount: number;
  currency: "usd";
  interval: BillingInterval;
  label: string;
};

function envPrice(key: string): string {
  return (process.env[key] ?? "").trim();
}

export const PRODUCTS = {
  rivals: {
    productName: "Fantasy Football Rivals — Rivals",
    description: STRIPE_CHECKOUT_COPY.rivalsDescription,
    monthly: {
      priceId: envPrice("STRIPE_PRICE_ID_RIVALS_MONTHLY") || envPrice("STRIPE_PRICE_ID_MONTHLY"),
      amount: 899,
      currency: "usd" as const,
      interval: "month" as const,
      label: "$8.99 / month",
    },
    annual: {
      priceId: envPrice("STRIPE_PRICE_ID_RIVALS_ANNUAL") || envPrice("STRIPE_PRICE_ID_ANNUAL"),
      amount: 7999,
      currency: "usd" as const,
      interval: "year" as const,
      label: "$79.99 / year",
    },
  },
} as const;

export function getPriceDefinition(interval: BillingInterval): PriceDefinition {
  return interval === "month" ? PRODUCTS.rivals.monthly : PRODUCTS.rivals.annual;
}

export function planFromPriceId(priceId: string | null | undefined): "rivals" | null {
  if (!priceId) return null;
  const id = priceId.trim();
  if (id === PRODUCTS.rivals.monthly.priceId || id === PRODUCTS.rivals.annual.priceId) {
    return "rivals";
  }
  return null;
}

export function intervalFromPriceId(priceId: string | null | undefined): BillingInterval | null {
  if (!priceId) return null;
  const id = priceId.trim();
  if (id === PRODUCTS.rivals.monthly.priceId) return "month";
  if (id === PRODUCTS.rivals.annual.priceId) return "year";
  return null;
}

/** @deprecated Use PRODUCTS.rivals — legacy import compat */
export const STRIPE_BRAND_LEGACY = { ...STRIPE_BRAND, planName: "Rivals" };
