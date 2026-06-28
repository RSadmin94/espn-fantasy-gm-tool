/**
 * Print rivalry-wall conversion funnel from funnel_events (read-only).
 *
 * Usage: npx tsx scripts/print_rivalry_conversion_funnel.mts
 * Requires DATABASE_URL in .env or environment.
 */
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set (.env or environment)");
  process.exit(1);
}

const { getRivalryWallFunnelStats } = await import("../server/funnelService.ts");

const stats = await getRivalryWallFunnelStats();

console.log("\n=== Rivalry Wall Conversion Funnel ===\n");

if (stats.conversionRatePct != null) {
  console.log(`Overall conversion: ${stats.conversionRatePct.toFixed(1)}% (payment ÷ wall viewed)\n`);
}

console.log("Step                          Users    Drop-off");
console.log("─────────────────────────────────────────────────");
for (const row of stats.steps) {
  const drop = row.dropOffPct != null ? `${row.dropOffPct.toFixed(1)}%` : "—";
  console.log(`${row.step.padEnd(28)} ${String(row.uniqueUsers).padStart(5)}    ${drop.padStart(7)}`);
}
console.log(`${"Checkout abandoned (derived)".padEnd(28)} ${String(stats.checkoutAbandonedUsers).padStart(5)}    (24h window)`);

if (stats.lastFeatureBreakdown.length > 0) {
  console.log("\nLast free feature before upgrade click:");
  for (const row of stats.lastFeatureBreakdown) {
    console.log(`  ${row.feature}: ${row.count}`);
  }
}

console.log("");
