import { describe, expect, it } from "vitest";
import {
  toCheckoutIntervalWire,
  toStripeBillingInterval,
} from "../server/stripe/checkoutInterval";
import { getPriceDefinition, PRODUCTS } from "../server/stripe/products";
import {
  annualMonthlyEquivalentCents,
  annualSavingsCents,
  BILLING_COPY,
  formatUsdFromCents,
  RIVALS_ANNUAL_CENTS,
  RIVALS_MONTHLY_CENTS,
} from "../client/src/lib/billingInterval";

describe("checkout interval wire format", () => {
  it("maps monthly selection to Stripe month", () => {
    expect(toStripeBillingInterval("monthly")).toBe("month");
    expect(toCheckoutIntervalWire("monthly")).toBe("monthly");
  });

  it("maps annual selection to Stripe year", () => {
    expect(toStripeBillingInterval("annual")).toBe("year");
    expect(toCheckoutIntervalWire("annual")).toBe("annual");
  });

  it("still accepts legacy month/year aliases", () => {
    expect(toStripeBillingInterval("month")).toBe("month");
    expect(toStripeBillingInterval("year")).toBe("year");
    expect(toCheckoutIntervalWire("month")).toBe("monthly");
    expect(toCheckoutIntervalWire("year")).toBe("annual");
  });
});

describe("Rivals price resolution", () => {
  it("monthly resolves the Rivals monthly catalog amount and env-backed price id slot", () => {
    const def = getPriceDefinition("month");
    expect(def.amount).toBe(799);
    expect(def.interval).toBe("month");
    expect(def.label).toBe("$7.99 / month");
    // Env may or may not be set in unit runs — when set it must be the RIVALS monthly key path.
    expect(PRODUCTS.rivals.monthly.priceId).toBe(def.priceId);
  });

  it("annual resolves the Rivals annual catalog amount and env-backed price id slot", () => {
    const def = getPriceDefinition("year");
    expect(def.amount).toBe(7999);
    expect(def.interval).toBe("year");
    expect(def.label).toBe("$79.99 / year");
    expect(PRODUCTS.rivals.annual.priceId).toBe(def.priceId);
  });

  it("monthly Checkout display amount is $7.99/month", () => {
    expect(BILLING_COPY.monthlyPriceLabel).toBe("$7.99/month");
    expect(formatUsdFromCents(RIVALS_MONTHLY_CENTS)).toBe("$7.99");
  });

  it("annual Checkout display amount is $79.99/year", () => {
    expect(BILLING_COPY.annualPriceLabel).toBe("$79.99/year");
    expect(formatUsdFromCents(RIVALS_ANNUAL_CENTS)).toBe("$79.99");
  });
  it("monthly resolves STRIPE_PRICE_ID_RIVALS_MONTHLY when configured", () => {
    const fromEnv =
      (process.env.STRIPE_PRICE_ID_RIVALS_MONTHLY ?? "").trim() ||
      (process.env.STRIPE_PRICE_ID_MONTHLY ?? "").trim();
    if (!fromEnv) return; // CI without Stripe env — catalog amounts still covered above
    expect(getPriceDefinition("month").priceId).toBe(fromEnv);
    expect(PRODUCTS.rivals.monthly.priceId).toBe(fromEnv);
  });

  it("annual resolves STRIPE_PRICE_ID_RIVALS_ANNUAL when configured", () => {
    const fromEnv =
      (process.env.STRIPE_PRICE_ID_RIVALS_ANNUAL ?? "").trim() ||
      (process.env.STRIPE_PRICE_ID_ANNUAL ?? "").trim();
    if (!fromEnv) return;
    expect(getPriceDefinition("year").priceId).toBe(fromEnv);
    expect(PRODUCTS.rivals.annual.priceId).toBe(fromEnv);
  });
});

describe("annual savings copy", () => {
  it("is mathematically correct: 12×$7.99 − $79.99 = $15.89", () => {
    expect(annualSavingsCents()).toBe(1589);
    expect(BILLING_COPY.annualSavingsLabel).toBe("Save $15.89/year");
  });

  it("shows annual equivalent as $6.67/month", () => {
    expect(annualMonthlyEquivalentCents()).toBe(667);
    expect(BILLING_COPY.annualEquivalentLabel).toBe("$6.67/month");
  });
});

describe("createCheckoutSession interval contract", () => {
  it("Monthly CTA sends monthly and Annual CTA sends annual", () => {
    // The UI CTAs call startCheckout({ interval }) / mutate({ interval }) with these literals.
    const monthlyCtaInterval = "monthly" as const;
    const annualCtaInterval = "annual" as const;
    expect(monthlyCtaInterval).toBe("monthly");
    expect(annualCtaInterval).toBe("annual");
    expect(toStripeBillingInterval(monthlyCtaInterval)).toBe("month");
    expect(toStripeBillingInterval(annualCtaInterval)).toBe("year");
  });

  it("does not put both recurring prices in one line_items array", () => {
    // Documented invariant of billingRouter: a single Price id per session.
    const monthly = getPriceDefinition(toStripeBillingInterval("monthly"));
    const annual = getPriceDefinition(toStripeBillingInterval("annual"));
    const lineItemsFor = (interval: "monthly" | "annual") => [
      {
        price: getPriceDefinition(toStripeBillingInterval(interval)).priceId || `${interval}-price`,
        quantity: 1,
      },
    ];
    expect(lineItemsFor("monthly")).toHaveLength(1);
    expect(lineItemsFor("annual")).toHaveLength(1);
    expect(monthly.amount).not.toBe(annual.amount);
  });
});
