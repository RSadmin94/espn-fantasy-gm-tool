/**
 * Read-only QB timing diagnostic runner — no draft behavior changes.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";
const SEASON = Number(process.argv[3] ?? "2026");

const FIXTURE_PATH = path.join(ROOT, "scripts", `_mock_fixture_${LEAGUE_ID}.json`);
const HISTORY_CACHE = path.join(ROOT, "scripts", `_validation_history_${LEAGUE_ID}.json`);
const REPORT_TXT = path.join(ROOT, "scripts", `_qb_timing_report_${LEAGUE_ID}.txt`);
const REPORT_JSON = path.join(ROOT, "scripts", `_qb_timing_report_${LEAGUE_ID}.json`);

const WATCHLIST = ["LOZELL STYLES", "Marcus Reese", "Sheldon deRoux"];

const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath) && !process.env.DATABASE_URL) {
  const env = fs.readFileSync(envPath, "utf8");
  const line = env.split(/\r?\n/).find((l) => /^DATABASE_URL\s*=/.test(l));
  if (line) {
    process.env.DATABASE_URL = line.replace(/^DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  }
}

const { deserializeMockFixture } = await import("../server/ownerDraftDnaSimulation.ts");
const { loadHistoricalProfileBundle } = await import("../server/draftValidationHistory.ts");
const { formatQbTimingReportText, runQbTimingReport } = await import("../server/qbTimingReport.ts");
const { getDb } = await import("../server/db.ts");
const { loadMockDraftInputs } = await import("../server/draftWarRoomRouter.ts");
const { users } = await import("../drizzle/schema.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");
const { sql: drizzleSql } = await import("drizzle-orm");

async function loadFixture() {
  if (fs.existsSync(FIXTURE_PATH)) {
    console.log(`Loading cached fixture: ${FIXTURE_PATH}`);
    return deserializeMockFixture(JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")));
  }
  console.log("Loading mock draft inputs from DB...");
  const db = await getDb();
  if (!db) throw new Error("no db");
  let entitled: (typeof users.$inferSelect) | undefined;
  for (const u of await db.select().from(users)) {
    if (await resolvePremiumAccess(u)) { entitled = u; break; }
  }
  if (!entitled?.id) throw new Error("no entitled user");
  return loadMockDraftInputs({ db, leagueId: LEAGUE_ID, season: SEASON, userId: entitled.id });
}

async function loadHistorical() {
  if (fs.existsSync(HISTORY_CACHE)) {
    return JSON.parse(fs.readFileSync(HISTORY_CACHE, "utf8"));
  }
  const db = await getDb();
  if (!db) throw new Error("no db");
  const bundle = await loadHistoricalProfileBundle({ db, leagueId: LEAGUE_ID });
  fs.writeFileSync(HISTORY_CACHE, JSON.stringify(bundle));
  return bundle;
}

const db = await getDb();
if (!db) throw new Error("no db");

const mockInputs = await loadFixture();
const historical = await loadHistorical();

console.log("\nBuilding read-only QB timing report (no draft behavior changes)...\n");

const report = await runQbTimingReport({
  db,
  sql: drizzleSql,
  leagueId: LEAGUE_ID,
  season: SEASON,
  mockInputs,
  historical,
  watchlistOwnerKeys: WATCHLIST,
});

const text = formatQbTimingReportText(report);
console.log(text);
fs.writeFileSync(REPORT_TXT, text);
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
console.log(`\nReports written (not committed):\n  ${REPORT_TXT}\n  ${REPORT_JSON}\n`);
