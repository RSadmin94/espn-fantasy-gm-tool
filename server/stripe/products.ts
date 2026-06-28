/**
 * Centralized Stripe product and price definitions — Fantasy Football Rivals tiers.
 * All billing code imports from here; never hardcode price IDs in routers.
 */

export const STRIPE_BRAND = {
  appName: "Fantasy Football Rivals",
} as const;

export const STRIPE_CHECKOUT_COPY = {
  submitMessage: "Unlock competitive intelligence for your league.",
  rivalsDescription:
    "Rivals — weekly intelligence, trade and draft tools, full rivalries, deep records, and GM Advisor.",
  leagueDescription:
    "The League — commissioner engagement suite (coming soon).",
  rivalsSubscriptionDescription:
    "Rivals — competitive intelligence for your fantasy league.",
  leagueSubscriptionDescription:
    "The League — commissioner engagement suite for your fantasy league.",
} as const;

export type PaidPlan = "rivals" | "league";
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
      amount: 599,
      currency: "usd" as const,
      interval: "month" as const,
      label: "$5.99 / month",
    },
    annual: {
      priceId: envPrice("STRIPE_PRICE_ID_RIVALS_ANNUAL") || envPrice("STRIPE_PRICE_ID_ANNUAL"),
      amount: 5999,
      currency: "usd" as const,
      interval: "year" as const,
      label: "$59.99 / year",
    },
  },
  league: {
    productName: "Fantasy Football Rivals — The League",
    description: STRIPE_CHECKOUT_COPY.leagueDescription,
    monthly: {
      priceId: envPrice("STRIPE_PRICE_ID_LEAGUE_MONTHLY"),
      amount: 999,
      currency: "usd" as const,
      interval: "month" as const,
      label: "$9.99 / month",
    },
    annual: {
      priceId: envPrice("STRIPE_PRICE_ID_LEAGUE_ANNUAL"),
      amount: 7999,
      currency: "usd" as const,
      interval: "year" as const,
      label: "$79.99 / year",
    },
  },
} as const;

/** Annual upgrade credit: Rivals annual → League annual (+$20.00). Server-only math. */
export const RIVALS_TO_LEAGUE_ANNUAL_UPGRADE_CENTS =
  PRODUCTS.league.annual.amount - PRODUCTS.rivals.annual.amount;

export function getPriceDefinition(plan: PaidPlan, interval: BillingInterval): PriceDefinition {
  return interval === "month" ? PRODUCTS[plan].monthly : PRODUCTS[plan].annual;
}

export function planFromPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  const id = priceId.trim();
  if (
    id === PRODUCTS.rivals.monthly.priceId ||
    id === PRODUCTS.rivals.annual.priceId
  ) {
    return "rivals";
  }
  if (
    id === PRODUCTS.league.monthly.priceId ||
    id === PRODUCTS.league.annual.priceId
  ) {
    return "league";
  }
  return null;
}

export function intervalFromPriceId(priceId: string | null | undefined): BillingInterval | null {
  if (!priceId) return null;
  const id = priceId.trim();
  if (id === PRODUCTS.rivals.monthly.priceId || id === PRODUCTS.league.monthly.priceId) return "month";
  if (id === PRODUCTS.rivals.annual.priceId || id === PRODUCTS.league.annual.priceId) return "year";
  return null;
}

/** @deprecated Use PRODUCTS.rivals — legacy import compat */
export const STRIPE_BRAND_LEGACY = { ...STRIPE_BRAND, planName: "Rivals" };
