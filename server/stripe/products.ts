/**
 * products.ts
 *
 * Centralized Stripe product and price definitions.
 * All billing code should import from here — never hardcode price IDs.
 *
 * Pricing:
 *   Monthly: $29/month
 *   Annual:  $249/year ($20.75/month effective)
 *
 * Trial: 7 days free on first league connect (set in app, not Stripe trial).
 */

export const PRODUCTS = {
  gmWarRoom: {
    name: "GM War Room — Full Access",
    description:
      "Full access to the GM War Room: AI GM Advisor, Trade Lab, Draft War Room, Keeper Lab, Waiver Lab, Opponent Intel, and weekly intelligence reports.",
    monthly: {
      /** Set via STRIPE_PRICE_ID_MONTHLY env var — created in Stripe dashboard */
      priceId: process.env.STRIPE_PRICE_ID_MONTHLY ?? "",
      amount: 2900, // $29.00 in cents
      interval: "month" as const,
      label: "$29 / month",
    },
  },
} as const;

/** Trial duration in days — set on the user record when they connect their first league */
export const TRIAL_DAYS = 7;
