/**
 * Rivals billing interval UI + wire values.
 * Amounts mirror server/stripe/products.ts (cents → display). Do not invent new prices here.
 */

export type CheckoutInterval = "monthly" | "annual";

/** Cents — same as PRODUCTS.rivals in server/stripe/products.ts */
export const RIVALS_MONTHLY_CENTS = 799;
export const RIVALS_ANNUAL_CENTS = 7999;

export function annualMonthlyEquivalentCents(annualCents = RIVALS_ANNUAL_CENTS): number {
  return Math.round(annualCents / 12);
}

export function annualSavingsCents(
  monthlyCents = RIVALS_MONTHLY_CENTS,
  annualCents = RIVALS_ANNUAL_CENTS,
): number {
  return monthlyCents * 12 - annualCents;
}

export function formatUsdFromCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export const BILLING_COPY = {
  monthlyLabel: "Monthly",
  annualLabel: "Annual",
  monthlyPrice: formatUsdFromCents(RIVALS_MONTHLY_CENTS),
  annualPrice: formatUsdFromCents(RIVALS_ANNUAL_CENTS),
  monthlyPriceLabel: `${formatUsdFromCents(RIVALS_MONTHLY_CENTS)}/month`,
  annualPriceLabel: `${formatUsdFromCents(RIVALS_ANNUAL_CENTS)}/year`,
  annualEquivalentLabel: `${formatUsdFromCents(annualMonthlyEquivalentCents())}/month`,
  annualSavingsLabel: `Save ${formatUsdFromCents(annualSavingsCents())}/year`,
  monthlyCta: "Continue with Monthly",
  annualCta: "Continue with Annual",
} as const;
