/**
 * Phase 2A.1 — Draft Intelligence Validation Framework runner.
 * Read-only QA; does not modify draft behavior. Does not commit output.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LEAGUE_ID = process.argv[2] ?? "457622";
const SEASON = Number(process.argv[3] ?? "2026");
const SIM_COUNT = Number(process.argv[4] ?? "100");

const FIXTURE_PATH = path.join(ROOT, "scripts", `_mock_fixture_${LEAGUE_ID}.json`);
const HISTORY_CACHE = path.join(ROOT, "scripts", `_validation_history_${LEAGUE_ID}.json`);
const PRODUCTION_BASELINE = path.join(ROOT, "scripts", "_mock_before.json");
const REPORT_TXT = path.join(ROOT, "scripts", `_draft_validation_report_${LEAGUE_ID}.txt`);
const REPORT_JSON = path.join(ROOT, "scripts", `_draft_validation_report_${LEAGUE_ID}.json`);

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
const {
  runDraftIntelligenceValidation,
  formatValidationReportText,
} = await import("../server/draftIntelligenceValidation.ts");
const { getDb } = await import("../server/db.ts");
const { loadMockDraftInputs } = await import("../server/draftWarRoomRouter.ts");
const { users } = await import("../drizzle/schema.ts");
const { resolvePremiumAccess } = await import("../server/_core/trpc.ts");

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
    console.log(`Loading cached historical profiles: ${HISTORY_CACHE}`);
    return JSON.parse(fs.readFileSync(HISTORY_CACHE, "utf8"));
  }
  console.log("Loading historical draft profiles from DB...");
  const db = await getDb();
  if (!db) throw new Error("no db");
  const bundle = await loadHistoricalProfileBundle({ db, leagueId: LEAGUE_ID });
  fs.writeFileSync(HISTORY_CACHE, JSON.stringify(bundle));
  console.log(`Cached historical profiles -> ${HISTORY_CACHE}`);
  return bundle;
}

function loadProductionBaseline() {
  if (!fs.existsSync(PRODUCTION_BASELINE)) {
    throw new Error(`Production baseline not found: ${PRODUCTION_BASELINE}`);
  }
  return JSON.parse(fs.readFileSync(PRODUCTION_BASELINE, "utf8"));
}

const inputs = await loadFixture();

const historical = await loadHistorical();
const productionBaseline = loadProductionBaseline();

console.log(`\nRunning Draft Intelligence Validation (${SIM_COUNT} stability simulations)...`);
const report = runDraftIntelligenceValidation({
  inputs,
  historical,
  productionBaseline,
  leagueId: LEAGUE_ID,
  season: SEASON,
  simulationCount: SIM_COUNT,
});

const text = formatValidationReportText(report);
fs.writeFileSync(REPORT_TXT, text);
fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));

console.log(text);
console.log(`\nReports written (not committed):`);
console.log(`  ${REPORT_TXT}`);
console.log(`  ${REPORT_JSON}`);
