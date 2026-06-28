/**
 * Creates (or reuses) all Fantasy Football Rivals Stripe products and prices:
 *   Rivals Monthly ($5.99), Rivals Annual ($59.99)
 *   The League Monthly ($9.99), The League Annual ($79.99)
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup-products
 */
import Stripe from "stripe";
import { PRODUCTS, STRIPE_BRAND, type BillingInterval, type PaidPlan } from "../server/stripe/products";

type CatalogEntry = {
  plan: PaidPlan;
  interval: BillingInterval;
  envKey: string;
};

const CATALOG: CatalogEntry[] = [
  { plan: "rivals", interval: "month", envKey: "STRIPE_PRICE_ID_RIVALS_MONTHLY" },
  { plan: "rivals", interval: "year", envKey: "STRIPE_PRICE_ID_RIVALS_ANNUAL" },
  { plan: "league", interval: "month", envKey: "STRIPE_PRICE_ID_LEAGUE_MONTHLY" },
  { plan: "league", interval: "year", envKey: "STRIPE_PRICE_ID_LEAGUE_ANNUAL" },
];

async function findOrCreatePrice(
  stripe: Stripe,
  plan: PaidPlan,
  interval: BillingInterval,
): Promise<{ priceId: string; created: boolean }> {
  const productDef = PRODUCTS[plan];
  const priceDef = interval === "month" ? productDef.monthly : productDef.annual;
  const targetAmount = priceDef.amount;

  const existingPrices = await stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] });
  const existing = existingPrices.data.find((p) => {
    if (
      p.unit_amount !== targetAmount ||
      p.currency !== priceDef.currency ||
      p.recurring?.interval !== priceDef.interval
    ) {
      return false;
    }
    const product = p.product;
    if (!product || typeof product === "string") return false;
    if ("deleted" in product && product.deleted) return false;
    return product.name === productDef.productName;
  });

  if (existing) {
    return { priceId: existing.id, created: false };
  }

  let productId: string | undefined;
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existingProduct = products.data.find((p) => p.name === productDef.productName);
  if (existingProduct) {
    productId = existingProduct.id;
  } else {
    const product = await stripe.products.create({
      name: productDef.productName,
      description: productDef.description,
      metadata: {
        app: "fantasy_football_rivals",
        brand: STRIPE_BRAND.appName,
        plan,
      },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: targetAmount,
    currency: priceDef.currency,
    recurring: { interval: priceDef.interval },
    nickname: `${productDef.productName} — ${priceDef.label}`,
    metadata: { plan, interval },
  });

  return { priceId: price.id, created: true };
}

async function main() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("Set STRIPE_SECRET_KEY before running this script.");
    process.exit(1);
  }

  const stripe = new Stripe(secretKey);
  console.log("Fantasy Football Rivals — Stripe catalog setup\n");

  for (const entry of CATALOG) {
    const def = entry.interval === "month"
      ? PRODUCTS[entry.plan].monthly
      : PRODUCTS[entry.plan].annual;
    const { priceId, created } = await findOrCreatePrice(stripe, entry.plan, entry.interval);
    console.log(`${created ? "Created" : "Found"} ${PRODUCTS[entry.plan].productName} ${def.label}`);
    console.log(`  ${entry.envKey}=${priceId}`);
    if (entry.envKey === "STRIPE_PRICE_ID_RIVALS_ANNUAL") {
      console.log(`  STRIPE_PRICE_ID_ANNUAL=${priceId}  # legacy alias`);
    }
    console.log("");
  }

  console.log("Upgrade math (server-side): Rivals Annual → League Annual = +$20.00");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
