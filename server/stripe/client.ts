/**
 * client.ts
 *
 * Stripe SDK singleton. Import `stripe` from here — never instantiate directly.
 * We omit apiVersion so the SDK uses its built-in default for the installed version.
 */
import Stripe from "stripe";
import { ENV } from "../_core/env";

if (!ENV.stripeSecretKey) {
  console.warn("[Stripe] STRIPE_SECRET_KEY is not set — billing features will be disabled.");
}

export const stripe = new Stripe(ENV.stripeSecretKey || "sk_test_placeholder");
