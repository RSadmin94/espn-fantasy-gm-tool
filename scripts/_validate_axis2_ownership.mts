/**
 * Axis 2 — Scope / Ownership regression (tenant isolation).
 *
 * Requires:
 *   - DATABASE_URL (local or prod read replica)
 *   - CLERK session cookie OR run via createCaller with a real user id from DB
 *
 * Usage:
 *   CONNECTED_LEAGUE=457622 FOREIGN_LEAGUE=<id-with-data-not-yours> USER_ID=1 npx tsx scripts/_validate_axis2_ownership.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  const envPath = resolve(process.cwd(), ".env");
  const env = readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
} catch {
  /* optional .env */
}

import { appRouter } from "../server/routers.ts";
import { getDb } from "../server/db.ts";

const CONNECTED = process.env.CONNECTED_LEAGUE?.trim() || "457622";
const FOREIGN_ENV = process.env.FOREIGN_LEAGUE?.trim();
const USER_ID = Number(process.env.USER_ID ?? "1");
const FOCAL = process.env.FOCAL_OWNER_KEY?.trim() || "id:{6042EE3C-4B54-42BE-A2A7-52E939D2C706}";
const RIVAL = process.env.RIVAL_OWNER_KEY?.trim() || "id:{EE3AD8B7-4239-40B0-BAD8-B7423960B094}";
const SEASONS = [2024, 2025, 2026];

type Entitled = "free" | "pro";

type Row = {
  capability: string;
  endpoint: string;
  entitled: Entitled;
  foreignResult: string;
  hasForeignData: boolean;
  ownLeagueOk: boolean;
};

function ctx(entitled: boolean) {
  return {
    user: {
      id: USER_ID,
      openId: "axis2-test",
      email: "axis2@test.local",
      role: "user" as const,
      subscriptionStatus: entitled ? ("active" as const) : ("inactive" as const),
      trialStartedAt: null,
    },
  };
}

function isForbiddenError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  return e.code === "FORBIDDEN" || String(e.message ?? "").includes("do not have access");
}

function hasMeaningfulPayload(label: string, data: unknown): boolean {
  if (data == null) return false;
  if (typeof data !== "object") return true;
  const o = data as Record<string, unknown>;
  if (o.error) return false;
  if (label.includes("statements") && Array.isArray(o.statements) && o.statements.length > 0) return true;
  if (label.includes("pair") && o.headline) return true;
  if (label.includes("notorious") && (Number(o.tradeCount) > 0 || (o.rankedByMargin as unknown[])?.length > 0))
    return true;
  if (label.includes("receipts") && (o.receipts as unknown[])?.length > 0) return true;
  if (label.includes("forOwner") && (o.stories as unknown[])?.length > 0) return true;
  if (label.includes("whyHavent") && (o.findings as unknown[])?.length > 0) return true;
  if (label.includes("careerReport") && (o.topReasons as unknown[])?.length > 0) return true;
  if (label.includes("hallOfFame") && o.ownerRecords) return true;
  if (label.includes("ownerAllTime") && (o.owners as unknown[])?.length > 0) return true;
  return Object.keys(o).some((k) => !["gated", "entitled", "ok", "error"].includes(k) && o[k] != null);
}

async function resolveForeignLeague(): Promise<string> {
  if (FOREIGN_ENV) return FOREIGN_ENV;
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL required to auto-pick FOREIGN_LEAGUE");
  const [rows] = (await db.execute(
    `SELECT DISTINCT leagueId FROM gm_teams WHERE leagueId <> '${CONNECTED}' LIMIT 5`,
  )) as unknown as [{ leagueId: string }[]];
  const pick = rows?.[0]?.leagueId;
  if (!pick) throw new Error(`No foreign league in gm_teams (connected=${CONNECTED})`);
  return String(pick);
}

async function runCase(
  capability: string,
  endpoint: string,
  entitled: Entitled,
  foreignLeague: string,
  fn: (caller: ReturnType<typeof appRouter.createCaller>, leagueId: string) => Promise<unknown>,
): Promise<Row> {
  const caller = appRouter.createCaller(ctx(entitled === "pro"));
  let foreignResult = "ok";
  let hasForeignData = false;
  let ownLeagueOk = false;
  try {
    const foreign = await fn(caller, foreignLeague);
    hasForeignData = hasMeaningfulPayload(endpoint, foreign);
    foreignResult = hasForeignData ? "returned data" : "empty/blocked";
  } catch (e: unknown) {
    if (isForbiddenError(e)) {
      foreignResult = "FORBIDDEN";
      hasForeignData = false;
    } else {
      foreignResult = `error: ${(e as Error).message?.slice(0, 80) ?? e}`;
      hasForeignData = false;
    }
  }
  try {
    const own = await fn(caller, CONNECTED);
    ownLeagueOk = hasMeaningfulPayload(endpoint, own) || endpoint.includes("notorious");
  } catch {
    ownLeagueOk = false;
  }
  return { capability, endpoint, entitled, foreignResult, hasForeignData, ownLeagueOk };
}

async function main() {
  const foreign = await resolveForeignLeague();
  console.log(`\n=== Axis 2 Ownership Validation ===`);
  console.log(`USER_ID=${USER_ID} CONNECTED=${CONNECTED} FOREIGN=${foreign}\n`);

  const cases: Array<{
    capability: string;
    endpoint: string;
    fn: (caller: ReturnType<typeof appRouter.createCaller>, leagueId: string) => Promise<unknown>;
  }> = [
    {
      capability: "Rivalry Statements",
      endpoint: "rivalryStory.statements",
      fn: (c, lid) => c.rivalryStory.statements({ leagueId: lid, focalOwnerKey: FOCAL, rivalOwnerKey: RIVAL }),
    },
    {
      capability: "Rivalry Pair",
      endpoint: "rivalryStory.pair",
      fn: (c, lid) => c.rivalryStory.pair({ leagueId: lid, focalOwnerKey: FOCAL, rivalOwnerKey: RIVAL }),
    },
    {
      capability: "Rivalry For Owner",
      endpoint: "rivalryStory.forOwner",
      fn: (c, lid) => c.rivalryStory.forOwner({ leagueId: lid, focalOwnerKey: FOCAL }),
    },
    {
      capability: "Notorious Trades",
      endpoint: "completedTradeIntel.notoriousTradesReport",
      fn: (c, lid) => c.completedTradeIntel.notoriousTradesReport({ leagueId: lid, seasons: SEASONS }),
    },
    {
      capability: "Why Haven't I Won",
      endpoint: "leagueIntel.whyHaventIWon",
      fn: (c) => c.leagueIntel.whyHaventIWon({}),
    },
    {
      capability: "Career Report",
      endpoint: "leagueIntel.careerReport",
      fn: (c) => c.leagueIntel.careerReport({}),
    },
    {
      capability: "Hall of Fame",
      endpoint: "espn.hallOfFame",
      fn: (c) => c.espn.hallOfFame({}),
    },
  ];

  const rows: Row[] = [];
  for (const ent of ["free", "pro"] as Entitled[]) {
    for (const { capability, endpoint, fn } of cases) {
      rows.push(await runCase(capability, endpoint, ent, foreign, fn));
    }
  }

  console.log("| Capability | Entitled | Foreign result | Foreign data? | Own league OK |");
  console.log("|------------|----------|----------------|---------------|---------------|");
  for (const r of rows) {
    const status = r.hasForeignData ? "** FAIL **" : "PASS";
    console.log(
      `| ${r.capability} | ${r.entitled} | ${r.foreignResult} | ${r.hasForeignData} | ${r.ownLeagueOk} | ${status}`,
    );
  }

  const fails = rows.filter((r) => r.hasForeignData);
  console.log(`\nSummary: ${rows.length - fails.length}/${rows.length} checks passed (foreign must never return data)`);
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
