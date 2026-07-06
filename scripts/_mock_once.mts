/** Single mock-draft snapshot for league 457622. */
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

const label = process.argv[2] ?? "out";
const outPath = path.join(process.cwd(), "scripts", `_mock_${label}.json`);

const { getDb } = await import("../server/db.ts");
const { appRouter } = await import("../server/routers.ts");
const { users } = await import("../drizzle/schema.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");

const db = await getDb();
if (!db) throw new Error("no db");

let entitled: (typeof users.$inferSelect) | undefined;
for (const u of await db.select().from(users)) {
  if (await resolvePremiumAccess(u)) {
    entitled = u;
    break;
  }
}
if (!entitled) throw new Error("no entitled user");

const caller = appRouter.createCaller({
  user: { ...entitled, role: "user" as const },
  auth: { userId: entitled.openId ?? String(entitled.id) },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => undefined },
} as any);

const result = await caller.draftWarRoom.getDraftWarRoomData({
  season: 2026,
  activeLeagueKey: "457622",
});
if (!result.ok) throw new Error(JSON.stringify(result));

type P = { pickNumber: number; round: number; ownerName: string; player: string; position: string; pickIntelligence?: { primaryFactor?: string } };
const mock = (result as { mockDraft: P[] }).mockDraft;

const payload = mock.map((p) => ({
  pick: p.pickNumber,
  round: p.round,
  owner: p.ownerName,
  player: p.player,
  pos: p.position,
  factor: p.pickIntelligence?.primaryFactor ?? null,
}));

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`Wrote ${payload.length} picks -> ${outPath}`);
