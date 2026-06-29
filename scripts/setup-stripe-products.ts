/**
 * Creates (or reuses) Fantasy Football Rivals Stripe products and prices (V1):
 *   Rivals Monthly ($8.99), Rivals Annual ($79.99)
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup-products
 */
import Stripe from "stripe";
import { PRODUCTS, STRIPE_BRAND, type BillingInterval } from "../server/stripe/products";

type CatalogEntry = {
  interval: BillingInterval;
  envKey: string;
};

const CATALOG: CatalogEntry[] = [
  { interval: "month", envKey: "STRIPE_PRICE_ID_RIVALS_MONTHLY" },
  { interval: "year", envKey: "STRIPE_PRICE_ID_RIVALS_ANNUAL" },
];

async function findOrCreatePrice(
  stripe: Stripe,
  interval: BillingInterval,
): Promise<{ priceId: string; created: boolean }> {
  const productDef = PRODUCTS.rivals;
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
        plan: "rivals",
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
    metadata: { plan: "rivals", interval },
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
  console.log("Fantasy Football Rivals — Stripe catalog setup (V1: Rivals only)\n");

  for (const entry of CATALOG) {
    const def = entry.interval === "month" ? PRODUCTS.rivals.monthly : PRODUCTS.rivals.annual;
    const { priceId, created } = await findOrCreatePrice(stripe, entry.interval);
    console.log(`${created ? "Created" : "Found"} ${PRODUCTS.rivals.productName} ${def.label}`);
    console.log(`  ${entry.envKey}=${priceId}`);
    if (entry.envKey === "STRIPE_PRICE_ID_RIVALS_ANNUAL") {
      console.log(`  STRIPE_PRICE_ID_ANNUAL=${priceId}  # legacy alias`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
