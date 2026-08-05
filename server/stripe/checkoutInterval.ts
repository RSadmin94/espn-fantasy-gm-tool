/**
 * Checkout interval wire format vs Stripe recurring interval.
 *
 * The client sends "monthly" | "annual". Stripe Prices use recurring.interval
 * "month" | "year". Keep both mappings in one place so routers never invent aliases.
 */
import type { BillingInterval } from "./products";

export type CheckoutIntervalInput = "monthly" | "annual" | "month" | "year";
export type CheckoutIntervalWire = "monthly" | "annual";

export function toStripeBillingInterval(input: CheckoutIntervalInput): BillingInterval {
  if (input === "monthly" || input === "month") return "month";
  return "year";
}

export function toCheckoutIntervalWire(input: CheckoutIntervalInput | BillingInterval): CheckoutIntervalWire {
  if (input === "monthly" || input === "month") return "monthly";
  return "annual";
}
