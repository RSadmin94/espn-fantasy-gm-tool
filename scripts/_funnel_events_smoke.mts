/**
 * Smoke-test rivalry-wall funnel instrumentation (server + DB).
 *
 * Simulates what the client fires after a free user views the rivalry wall and clicks upgrade.
 *
 * Usage: npx tsx scripts/_funnel_events_smoke.mts
 * Requires DATABASE_URL in .env or environment.
 */
import fs from "node:fs";
import path from "node:path";
import { sql, eq, desc } from "drizzle-orm";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

if (!process.env.DATABASE_URL) {
  console.error("FAIL: DATABASE_URL not set");
  process.exit(1);
}

const { getDb } = await import("../server/db.ts");
const { appRouter } = await import("../server/routers.ts");
const { funnelEvents, users } = await import("../drizzle/schema.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");
import type { TrpcContext } from "../server/_core/context.ts";

function ctxFor(user: typeof users.$inferSelect, role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: { ...user, role },
    auth: { userId: user.openId ?? String(user.id) },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: viPlaceholder() } as TrpcContext["res"],
  };
}

function viPlaceholder() {
  return () => undefined;
}

type Row = {
  id: number;
  userId: number | null;
  event: string;
  metadata: unknown;
  createdAt: Date;
};

function printRow(r: Row) {
  console.log(
    `  id=${r.id} userId=${r.userId} event=${r.event} createdAt=${r.createdAt?.toISOString?.() ?? r.createdAt}`,
  );
  console.log(`  metadata=${JSON.stringify(r.metadata)}`);
}

const db = await getDb();
if (!db) {
  console.error("FAIL: could not connect to database");
  process.exit(1);
}

// Pick a genuinely free user (not founder / not subscribed)
let freeUser: typeof users.$inferSelect | undefined;
for (const u of await db.select().from(users)) {
  if (!(await resolvePremiumAccess(u))) {
    freeUser = u;
    break;
  }
}
if (!freeUser) {
  console.error("FAIL: no free user row in users table to smoke-test with");
  process.exit(1);
}

console.log(`\n=== Funnel Events Smoke Test ===`);
console.log(`Free test user: id=${freeUser.id} email=${freeUser.email ?? "(none)"}\n`);

const before = await db
  .select()
  .from(funnelEvents)
  .where(
    sql`${funnelEvents.userId} = ${freeUser.id} AND ${funnelEvents.event} IN ('wall_viewed', 'upgrade_clicked')`,
  )
  .orderBy(desc(funnelEvents.createdAt))
  .limit(5);

const freeCaller = appRouter.createCaller(ctxFor(freeUser));
const adminCaller = appRouter.createCaller({
  ...ctxFor(freeUser),
  user: { ...freeUser, role: "admin" as const },
});

// 1. wall_viewed (mirrors RivalryCenter client payload)
const wallRes = await freeCaller.funnel.record({
  event: "wall_viewed",
  metadata: { totalRivalries: 4, lockedRivalries: 3, leagueTeamCount: 12 },
});
console.log("funnel.record wall_viewed →", wallRes);

// 2. upgrade_clicked with lastFreeFeature
const upgradeRes = await freeCaller.funnel.record({
  event: "upgrade_clicked",
  metadata: {
    lastFreeFeature: "rivalry_wall",
    source: "rivalry_wall",
    totalRivalries: 4,
    lockedRivalries: 3,
  },
});
console.log("funnel.record upgrade_clicked →", upgradeRes);

const after = await db
  .select()
  .from(funnelEvents)
  .where(eq(funnelEvents.userId, freeUser.id))
  .orderBy(desc(funnelEvents.createdAt))
  .limit(10);

const newWall = after.find(
  (r) => r.event === "wall_viewed" && !before.some((b) => b.id === r.id),
);
const newUpgrade = after.find(
  (r) => r.event === "upgrade_clicked" && !before.some((b) => b.id === r.id),
);

const wallPass = Boolean(newWall);
const upgradePass =
  Boolean(newUpgrade) &&
  typeof newUpgrade?.metadata === "object" &&
  newUpgrade.metadata !== null &&
  (newUpgrade.metadata as Record<string, unknown>).lastFreeFeature === "rivalry_wall";

console.log("\n--- wall_viewed row ---");
if (newWall) printRow(newWall as Row);
else console.log("  (none — FAIL)");

console.log("\n--- upgrade_clicked row ---");
if (newUpgrade) printRow(newUpgrade as Row);
else console.log("  (none — FAIL)");

let statsPass = false;
let statsDetail = "";
try {
  const stats = await adminCaller.funnel.getRivalryWallStats();
  const wallStep = stats.steps.find((s) => s.event === "wall_viewed");
  const upgradeStep = stats.steps.find((s) => s.event === "upgrade_clicked");
  statsPass =
    (wallStep?.uniqueUsers ?? 0) >= 1 &&
    (upgradeStep?.uniqueUsers ?? 0) >= 1 &&
    stats.steps.length === 4;
  statsDetail = JSON.stringify(
    {
      conversionRatePct: stats.conversionRatePct,
      steps: stats.steps.map((s) => ({ event: s.event, uniqueUsers: s.uniqueUsers, dropOffPct: s.dropOffPct })),
      checkoutAbandonedUsers: stats.checkoutAbandonedUsers,
      lastFeatureBreakdown: stats.lastFeatureBreakdown.slice(0, 3),
    },
    null,
    2,
  );
} catch (err) {
  statsDetail = String(err);
}

console.log("\n--- admin getRivalryWallStats ---");
console.log(statsDetail);

console.log("\n=== RESULTS ===");
console.log(`wall_viewed in funnel_events:     ${wallPass ? "PASS" : "FAIL"}`);
console.log(`upgrade_clicked + lastFreeFeature: ${upgradePass ? "PASS" : "FAIL"}`);
console.log(`admin funnel stats query:          ${statsPass ? "PASS" : "FAIL"}`);

const allPass = wallPass && upgradePass && statsPass;
process.exit(allPass ? 0 : 1);
